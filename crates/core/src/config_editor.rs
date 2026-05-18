use crate::db;
use crate::error::{AppError, Result};
use crate::models::{EnableStrategy, EnabledState, Platform};
use rusqlite::params;
use std::fs;
use std::path::{Path, PathBuf};

pub struct ToggleResult {
    pub location_id: i64,
    pub new_state: EnabledState,
    pub backup_path: Option<String>,
}

pub fn set_skill_enabled(
    location_id: i64,
    new_state: EnabledState,
    dry_run: bool,
) -> Result<ToggleResult> {
    let conn = db::open_db()?;
    db::run_migrations(&conn)?;

    let (_skill_id, platform, skill_path, strategy, current_state) =
        query_location(&conn, location_id)?;

    if current_state == new_state {
        return Ok(ToggleResult {
            location_id,
            new_state,
            backup_path: None,
        });
    }

    let backup_path = if dry_run {
        None
    } else {
        let backup = write_config_change(platform, &skill_path, strategy, new_state)?;
        update_location_state(&conn, location_id, new_state)?;
        log_audit(&conn, "set_skill_enabled", location_id, new_state)?;
        Some(backup)
    };

    Ok(ToggleResult {
        location_id,
        new_state,
        backup_path,
    })
}

pub fn bulk_set_skill_enabled(
    location_ids: &[i64],
    new_state: EnabledState,
    dry_run: bool,
) -> Result<Vec<ToggleResult>> {
    let mut results = Vec::with_capacity(location_ids.len());
    for &id in location_ids {
        results.push(set_skill_enabled(id, new_state, dry_run)?);
    }
    Ok(results)
}

fn query_location(
    conn: &rusqlite::Connection,
    location_id: i64,
) -> Result<(i64, Platform, String, EnableStrategy, EnabledState)> {
    let (skill_id, platform_str, skill_path, strategy_str, state_str): (
        i64,
        String,
        String,
        String,
        String,
    ) = conn.query_row(
        "SELECT skill_id, platform, skill_path, enable_strategy, enabled_state \
         FROM skill_locations WHERE id = ?1",
        params![location_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
    )?;

    let platform = Platform::parse(&platform_str)
        .ok_or_else(|| AppError::Db(rusqlite::Error::InvalidParameterName(platform_str)))?;
    let strategy = parse_enable_strategy(&strategy_str);
    let current_state = parse_enabled_state(&state_str);

    Ok((skill_id, platform, skill_path, strategy, current_state))
}

fn update_location_state(
    conn: &rusqlite::Connection,
    location_id: i64,
    state: EnabledState,
) -> Result<()> {
    conn.execute(
        "UPDATE skill_locations SET enabled_state = ?1 WHERE id = ?2",
        params![state.as_str(), location_id],
    )?;
    Ok(())
}

fn log_audit(
    conn: &rusqlite::Connection,
    action: &str,
    target_id: i64,
    state: EnabledState,
) -> Result<()> {
    conn.execute(
        "INSERT INTO audit_log (action, target, detail) VALUES (?1, ?2, ?3)",
        params![action, target_id.to_string(), state.as_str()],
    )?;
    Ok(())
}

fn write_config_change(
    platform: Platform,
    skill_path: &str,
    strategy: EnableStrategy,
    new_state: EnabledState,
) -> Result<String> {
    let backup_path = create_backup(skill_path)?;

    match platform {
        Platform::Claude => write_claude_config(skill_path, strategy, new_state)?,
        Platform::Codex => write_codex_config(skill_path, strategy, new_state)?,
    }

    Ok(backup_path)
}

fn create_backup(original_path: &str) -> Result<String> {
    let path = Path::new(original_path);
    if !path.exists() {
        return Ok(String::new());
    }

    let backup_dir = crate::paths::data_dir()?.join("backups");
    fs::create_dir_all(&backup_dir)?;

    let timestamp = chrono::Utc::now().format("%Y%m%dT%H%M%SZ");
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown");
    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
    let backup_name = format!("{stem}_{timestamp}.{ext}.bak");
    let backup_path = backup_dir.join(&backup_name);

    fs::copy(path, &backup_path)?;

    Ok(backup_path.to_string_lossy().into_owned())
}

fn write_claude_config(
    skill_path: &str,
    strategy: EnableStrategy,
    state: EnabledState,
) -> Result<()> {
    match strategy {
        EnableStrategy::SkillOverride => {
            let settings_path = claude_settings_path()?;
            write_claude_skill_override(&settings_path, skill_path, state)
        }
        EnableStrategy::PluginDisable => {
            let plugin_dir = find_plugin_dir(skill_path)?;
            disable_plugin(&plugin_dir, state)
        }
        EnableStrategy::PermissionDeny => {
            let settings_path = claude_settings_path()?;
            write_claude_permission_deny(&settings_path, skill_path, state)
        }
        _ => Ok(()),
    }
}

fn write_codex_config(
    skill_path: &str,
    strategy: EnableStrategy,
    state: EnabledState,
) -> Result<()> {
    if strategy != EnableStrategy::CodexConfig {
        return Ok(());
    }

    let config_path = codex_config_path()?;
    write_codex_skill_entry(&config_path, skill_path, state)
}

fn claude_settings_path() -> Result<PathBuf> {
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::PathResolution("no home dir".into()))?;
    Ok(home.join(".claude").join("settings.json"))
}

fn codex_config_path() -> Result<PathBuf> {
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::PathResolution("no home dir".into()))?;
    Ok(home.join(".codex").join("config.toml"))
}

fn write_claude_skill_override(
    settings_path: &Path,
    skill_path: &str,
    state: EnabledState,
) -> Result<()> {
    let mut settings = read_or_create_json(settings_path)?;

    let map = settings
        .as_object_mut()
        .ok_or_else(|| AppError::InvalidPayload("settings not an object".into()))?;
    map.entry("skillOverrides")
        .or_insert_with(|| serde_json::json!({}))
        .as_object_mut()
        .ok_or_else(|| AppError::InvalidPayload("skillOverrides not an object".into()))?
        .insert(
            skill_path.to_string(),
            serde_json::json!(state.as_str()),
        );

    atomic_write_json(settings_path, &settings)
}

fn write_claude_permission_deny(
    settings_path: &Path,
    skill_path: &str,
    state: EnabledState,
) -> Result<()> {
    let mut settings = read_or_create_json(settings_path)?;

    let map = settings
        .as_object_mut()
        .ok_or_else(|| AppError::InvalidPayload("settings not an object".into()))?;

    let denied = map
        .entry("permissions")
        .or_insert_with(|| serde_json::json!({}))
        .as_object_mut()
        .ok_or_else(|| AppError::InvalidPayload("permissions not an object".into()))?
        .entry("denied")
        .or_insert_with(|| serde_json::json!([]))
        .as_array_mut()
        .ok_or_else(|| AppError::InvalidPayload("denied not an array".into()))?;

    let entry = format!("Skill({})", extract_skill_name_from_path(skill_path));
    if state == EnabledState::Off {
        if !denied.iter().any(|v| v.as_str() == Some(&entry)) {
            denied.push(serde_json::json!(entry));
        }
    } else {
        denied.retain(|v| v.as_str() != Some(&entry));
    }

    atomic_write_json(settings_path, &settings)
}

fn disable_plugin(plugin_dir: &Path, state: EnabledState) -> Result<()> {
    let disabled_marker = plugin_dir.join(".disabled");
    match state {
        EnabledState::Off => {
            fs::write(&disabled_marker, "disabled by skill-usage-manager")?;
        }
        _ => {
            if disabled_marker.exists() {
                fs::remove_file(&disabled_marker)?;
            }
        }
    }
    Ok(())
}

fn find_plugin_dir(skill_path: &str) -> Result<PathBuf> {
    let path = Path::new(skill_path);
    let parent = path
        .parent()
        .ok_or_else(|| AppError::PathResolution("no parent dir".into()))?;
    Ok(parent.to_path_buf())
}

fn write_codex_skill_entry(
    config_path: &Path,
    skill_path: &str,
    state: EnabledState,
) -> Result<()> {
    let content = if config_path.exists() {
        fs::read_to_string(config_path)?
    } else {
        String::new()
    };

    let skill_md_path = if skill_path.ends_with("SKILL.md") || skill_path.ends_with("skill.md") {
        skill_path.to_string()
    } else {
        format!("{}/SKILL.md", skill_path.trim_end_matches('/'))
    };

    let section_marker = format!("# skill-usage-manager:{}", skill_md_path);
    let entry = if state == EnabledState::Off {
        format!(
            "\n{marker}\n[[skills.config]]\npath = \"{path}\"\nenabled = false\n",
            marker = section_marker,
            path = skill_md_path,
        )
    } else {
        String::new()
    };

    let mut lines: Vec<String> = content.lines().map(String::from).collect();
    let mut i = 0;

    while i < lines.len() {
        if lines[i].trim() == section_marker {
            // Remove section: marker + [[skills.config]] + path + enabled
            lines.drain(i..(i + 4).min(lines.len()));
            break;
        }
        i += 1;
    }

    if state == EnabledState::Off && !entry.is_empty() {
        lines.push(entry);
    }

    atomic_write(config_path, &lines.join("\n"))
}

fn read_or_create_json(path: &Path) -> Result<serde_json::Value> {
    if path.exists() {
        let content = fs::read_to_string(path)?;
        Ok(serde_json::from_str(&content)?)
    } else {
        Ok(serde_json::json!({}))
    }
}

fn atomic_write_json(path: &Path, value: &serde_json::Value) -> Result<()> {
    let content = serde_json::to_string_pretty(value)?;
    atomic_write(path, &content)
}

fn atomic_write(path: &Path, content: &str) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let temp_path = path.with_extension("tmp");
    fs::write(&temp_path, content)?;

    // fsync before rename for durability
    let file = fs::File::open(&temp_path)?;
    file.sync_all()?;
    drop(file);

    fs::rename(&temp_path, path)?;
    Ok(())
}

fn extract_skill_name_from_path(path: &str) -> String {
    let normalized = path.replace('\\', "/");
    let normalized = normalized.trim_end_matches('/');
    if let Some(idx) = normalized.rfind('/') {
        let parent = &normalized[..idx];
        if let Some(name_idx) = parent.rfind('/') {
            parent[name_idx + 1..].to_string()
        } else {
            parent.to_string()
        }
    } else {
        normalized.to_string()
    }
}

fn parse_enable_strategy(s: &str) -> EnableStrategy {
    match s {
        "skill-override" => EnableStrategy::SkillOverride,
        "plugin-disable" => EnableStrategy::PluginDisable,
        "permission-deny" => EnableStrategy::PermissionDeny,
        "codex-config" => EnableStrategy::CodexConfig,
        _ => EnableStrategy::SkillOverride,
    }
}

fn parse_enabled_state(s: &str) -> EnabledState {
    match s {
        "on" => EnabledState::On,
        "name-only" => EnabledState::NameOnly,
        "user-invocable-only" => EnabledState::UserInvocableOnly,
        "off" => EnabledState::Off,
        _ => EnabledState::On,
    }
}

pub fn get_skill_inventory() -> Result<Vec<SkillInventoryRow>> {
    let conn = db::open_db()?;
    db::run_migrations(&conn)?;

    let mut stmt = conn.prepare(
        "SELECT sl.id, s.canonical_name, sl.platform, sl.scope, sl.skill_path, \
         sl.enabled_state, sl.enable_strategy, sl.supports_exact_disable \
         FROM skill_locations sl \
         JOIN skills s ON s.id = sl.skill_id \
         ORDER BY s.canonical_name, sl.platform",
    )?;

    let rows = stmt
        .query_map([], |row| {
            let platform_str: String = row.get(2)?;
            let state_str: String = row.get(5)?;
            let strategy_str: String = row.get(6)?;
            Ok(SkillInventoryRow {
                location_id: row.get(0)?,
                canonical_name: row.get(1)?,
                platform: platform_str,
                scope: row.get(3)?,
                skill_path: row.get(4)?,
                enabled_state: state_str,
                enable_strategy: strategy_str,
                supports_exact_disable: row.get(7)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    Ok(rows)
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SkillInventoryRow {
    pub location_id: i64,
    pub canonical_name: String,
    pub platform: String,
    pub scope: String,
    pub skill_path: String,
    pub enabled_state: String,
    pub enable_strategy: String,
    pub supports_exact_disable: bool,
}

pub fn recent_audit_log(limit: i64) -> Result<Vec<AuditEntry>> {
    let conn = db::open_db()?;
    db::run_migrations(&conn)?;

    let mut stmt = conn.prepare(
        "SELECT id, action, target, detail, performed_at \
         FROM audit_log ORDER BY id DESC LIMIT ?1",
    )?;

    let rows = stmt
        .query_map(params![limit], |row| {
            Ok(AuditEntry {
                id: row.get(0)?,
                action: row.get(1)?,
                target: row.get(2)?,
                detail: row.get(3)?,
                performed_at: row.get(4)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    Ok(rows)
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct AuditEntry {
    pub id: i64,
    pub action: String,
    pub target: Option<String>,
    pub detail: Option<String>,
    pub performed_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_skill_name_from_path() {
        assert_eq!(
            extract_skill_name_from_path("/home/user/.claude/skills/my-skill/SKILL.md"),
            "my-skill"
        );
        assert_eq!(
            extract_skill_name_from_path("C:\\Users\\.codex\\skills\\research-lit\\SKILL.md"),
            "research-lit"
        );
    }

    #[test]
    fn parses_enabled_state_variants() {
        assert!(matches!(parse_enabled_state("on"), EnabledState::On));
        assert!(matches!(parse_enabled_state("off"), EnabledState::Off));
        assert!(matches!(
            parse_enabled_state("name-only"),
            EnabledState::NameOnly
        ));
        assert!(matches!(
            parse_enabled_state("user-invocable-only"),
            EnabledState::UserInvocableOnly
        ));
    }
}
