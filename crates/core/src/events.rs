use crate::error::{AppError, Result};
use crate::models::{Confidence, InvocationKind, Platform, UsageEvent};
use chrono::Utc;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct UsageSummaryRow {
    pub canonical_name: String,
    pub platform: Platform,
    pub confidence: String,
    pub count: i64,
}

#[derive(Debug, Deserialize)]
struct HookEnvelope {
    #[serde(rename = "hook_event_name", alias = "type")]
    hook_event_name: Option<String>,
    session_id: Option<String>,
    tool_name: Option<String>,
    tool_input: Option<serde_json::Value>,
    command_name: Option<String>,
    prompt: Option<String>,
}

pub fn parse_hook_event(platform: Platform, raw: &str) -> Result<Option<UsageEvent>> {
    let env: HookEnvelope = serde_json::from_str(raw)?;
    let hook_type = env.hook_event_name.clone().unwrap_or_default();
    let session_hash = hash_str(env.session_id.as_deref().unwrap_or("unknown"));

    match platform {
        Platform::Claude => parse_claude_hook(env, &hook_type, session_hash),
        Platform::Codex => parse_codex_hook(env, &hook_type, session_hash),
    }
}

pub fn import_queued_events(events_dir: &Path) -> Result<usize> {
    let conn = crate::db::open_db()?;
    crate::db::run_migrations(&conn)?;

    if !events_dir.exists() {
        return Ok(0);
    }

    let mut imported = 0;
    for entry in fs::read_dir(events_dir)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }

        let file = fs::File::open(&path)?;
        let reader = BufReader::new(file);
        for line in reader.lines() {
            let line = line?;
            if line.trim().is_empty() {
                continue;
            }

            match serde_json::from_str::<UsageEvent>(&line) {
                Ok(event) => {
                    if insert_usage_event(&conn, &event)? {
                        imported += 1;
                    }
                }
                Err(error) => record_ingest_error(
                    Some(path.to_string_lossy().as_ref()),
                    None,
                    &line,
                    &error.to_string(),
                )?,
            }
        }
    }

    Ok(imported)
}

pub fn usage_summary() -> Result<Vec<UsageSummaryRow>> {
    let conn = crate::db::open_db()?;
    crate::db::run_migrations(&conn)?;

    let mut stmt = conn.prepare(
        r#"
SELECT s.canonical_name, e.platform, e.confidence, COUNT(*) AS count
FROM skill_usage_events e
JOIN skills s ON s.id = e.skill_id
GROUP BY s.canonical_name, e.platform, e.confidence
ORDER BY count DESC, s.canonical_name ASC, e.platform ASC, e.confidence ASC
"#,
    )?;

    let rows = stmt
        .query_map([], |row| {
            let platform: String = row.get(1)?;
            Ok(UsageSummaryRow {
                canonical_name: row.get(0)?,
                platform: Platform::parse(&platform).unwrap_or(Platform::Claude),
                confidence: row.get(2)?,
                count: row.get(3)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    Ok(rows)
}

pub fn record_ingest_error(
    source_path: Option<&str>,
    platform: Option<Platform>,
    raw_payload: &str,
    error: &str,
) -> Result<()> {
    let conn = crate::db::open_db()?;
    crate::db::run_migrations(&conn)?;
    conn.execute(
        "INSERT INTO ingest_errors (platform, source_path, raw_payload, error) VALUES (?1, ?2, ?3, ?4)",
        params![platform.map(|p| p.as_str().to_string()), source_path, raw_payload, error],
    )?;
    Ok(())
}

pub fn ingest_error_count() -> Result<i64> {
    let conn = crate::db::open_db()?;
    crate::db::run_migrations(&conn)?;
    Ok(conn.query_row("SELECT COUNT(*) FROM ingest_errors", [], |row| row.get(0))?)
}

fn parse_claude_hook(
    env: HookEnvelope,
    hook_type: &str,
    session_hash: String,
) -> Result<Option<UsageEvent>> {
    match hook_type {
        "PreToolUse" => {
            if env.tool_name.as_deref() != Some("Skill") && env.tool_name.is_some() {
                return Ok(None);
            }

            let skill_name = env
                .tool_input
                .as_ref()
                .and_then(|v| v.get("skill").or_else(|| v.get("name")))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            if skill_name.is_empty() {
                return Err(AppError::InvalidPayload(
                    "PreToolUse without skill name".into(),
                ));
            }

            Ok(Some(UsageEvent {
                platform: Platform::Claude,
                occurred_at: Utc::now(),
                session_hash,
                turn_id: None,
                cwd_hash: None,
                invocation_kind: InvocationKind::ModelToolCall,
                detector: "claude-pre-tool-use".into(),
                confidence: Confidence::Confirmed,
                raw_skill_name: skill_name,
                hook_version: Some(env!("CARGO_PKG_VERSION").into()),
            }))
        }
        "UserPromptExpansion" => {
            let skill_name = env.command_name.unwrap_or_default();
            if skill_name.is_empty() {
                return Err(AppError::InvalidPayload(
                    "UserPromptExpansion without command_name".into(),
                ));
            }

            Ok(Some(UsageEvent {
                platform: Platform::Claude,
                occurred_at: Utc::now(),
                session_hash,
                turn_id: None,
                cwd_hash: None,
                invocation_kind: InvocationKind::SlashCommand,
                detector: "claude-user-prompt-expansion".into(),
                confidence: Confidence::Confirmed,
                raw_skill_name: skill_name,
                hook_version: Some(env!("CARGO_PKG_VERSION").into()),
            }))
        }
        _ => Err(AppError::InvalidPayload(format!(
            "unsupported Claude hook type: {hook_type}"
        ))),
    }
}

fn parse_codex_hook(
    env: HookEnvelope,
    hook_type: &str,
    session_hash: String,
) -> Result<Option<UsageEvent>> {
    match hook_type {
        "UserPromptSubmit" => {
            let prompt = env.prompt.as_deref().unwrap_or("");
            let Some(skill_name) = extract_codex_skill_hint(prompt) else {
                return Ok(None);
            };

            Ok(Some(UsageEvent {
                platform: Platform::Codex,
                occurred_at: Utc::now(),
                session_hash,
                turn_id: None,
                cwd_hash: None,
                invocation_kind: InvocationKind::Implicit,
                detector: "codex-user-prompt-submit".into(),
                confidence: Confidence::ExplicitHint,
                raw_skill_name: skill_name,
                hook_version: Some(env!("CARGO_PKG_VERSION").into()),
            }))
        }
        "Stop" => Ok(None),
        _ => Err(AppError::InvalidPayload(format!(
            "unsupported Codex hook type: {hook_type}"
        ))),
    }
}

fn insert_usage_event(conn: &rusqlite::Connection, event: &UsageEvent) -> Result<bool> {
    if event.raw_skill_name.trim().is_empty() {
        return Ok(false);
    }

    let skill_id = upsert_skill(conn, event.raw_skill_name.trim())?;
    let dedupe_key = dedupe_key(event);
    let changed = conn.execute(
        r#"
INSERT OR IGNORE INTO skill_usage_events (
    skill_id, platform, occurred_at, session_hash, turn_id, cwd_hash,
    invocation_kind, detector, confidence, raw_skill_name, hook_version, dedupe_key
) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
"#,
        params![
            skill_id,
            event.platform.as_str(),
            event.occurred_at.to_rfc3339(),
            event.session_hash,
            event.turn_id,
            event.cwd_hash,
            invocation_kind_str(event.invocation_kind),
            event.detector,
            event.confidence.as_str(),
            event.raw_skill_name,
            event.hook_version,
            dedupe_key,
        ],
    )?;

    if changed > 0 {
        update_daily_rollup(conn, skill_id, event)?;
    }

    Ok(changed > 0)
}

fn upsert_skill(conn: &rusqlite::Connection, canonical_name: &str) -> Result<i64> {
    conn.execute(
        r#"
INSERT INTO skills (canonical_name, display_name, source_kind)
VALUES (?1, ?1, 'event')
ON CONFLICT(canonical_name) DO UPDATE SET last_seen_at = datetime('now')
"#,
        params![canonical_name],
    )?;
    Ok(conn.query_row(
        "SELECT id FROM skills WHERE canonical_name = ?1",
        params![canonical_name],
        |row| row.get(0),
    )?)
}

fn update_daily_rollup(
    conn: &rusqlite::Connection,
    skill_id: i64,
    event: &UsageEvent,
) -> Result<()> {
    let date = event.occurred_at.date_naive().to_string();
    conn.execute(
        r#"
INSERT INTO skill_usage_daily (date, skill_id, platform, count, last_used_at)
VALUES (?1, ?2, ?3, 1, ?4)
ON CONFLICT(date, skill_id, platform) DO UPDATE SET
    count = count + 1,
    last_used_at = excluded.last_used_at
"#,
        params![
            date,
            skill_id,
            event.platform.as_str(),
            event.occurred_at.to_rfc3339()
        ],
    )?;
    Ok(())
}

fn extract_codex_skill_hint(prompt: &str) -> Option<String> {
    prompt.split_whitespace().find_map(|word| {
        let skill = word.strip_prefix('$')?;
        let skill = skill.trim_matches(|c: char| {
            !(c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == ':')
        });
        if skill.is_empty() {
            None
        } else {
            Some(skill.to_string())
        }
    })
}

fn dedupe_key(event: &UsageEvent) -> String {
    let turn_or_session = event.turn_id.as_deref().unwrap_or(&event.session_hash);
    hash_str(&format!(
        "{}|{}|{}|{}|{}",
        event.platform.as_str(),
        turn_or_session,
        event.raw_skill_name.trim(),
        invocation_kind_str(event.invocation_kind),
        event.confidence.as_str()
    ))
}

fn invocation_kind_str(kind: InvocationKind) -> &'static str {
    match kind {
        InvocationKind::ModelToolCall => "model-tool-call",
        InvocationKind::SlashCommand => "slash-command",
        InvocationKind::Implicit => "implicit",
    }
}

fn hash_str(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    format!("{:x}", hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Confidence, InvocationKind};
    use std::io::Write;

    fn with_temp_home<T>(f: impl FnOnce() -> T) -> T {
        let temp = tempfile::tempdir().expect("temp dir");
        std::env::set_var("SKILL_USAGE_MANAGER_HOME", temp.path());
        let out = f();
        std::env::remove_var("SKILL_USAGE_MANAGER_HOME");
        out
    }

    #[test]
    fn parses_claude_pre_tool_use_skill_as_confirmed() {
        let raw = r#"{
            "hook_event_name": "PreToolUse",
            "session_id": "session-1",
            "tool_name": "Skill",
            "tool_input": { "skill": "test-driven-development" }
        }"#;

        let event = parse_hook_event(Platform::Claude, raw)
            .expect("parse")
            .expect("event");

        assert_eq!(event.platform, Platform::Claude);
        assert_eq!(event.raw_skill_name, "test-driven-development");
        assert_eq!(event.invocation_kind, InvocationKind::ModelToolCall);
        assert_eq!(event.confidence, Confidence::Confirmed);
        assert_ne!(event.session_hash, "session-1");
    }

    #[test]
    fn ignores_non_skill_claude_pre_tool_use() {
        let raw = r#"{
            "hook_event_name": "PreToolUse",
            "session_id": "session-1",
            "tool_name": "Read",
            "tool_input": { "file_path": "README.md" }
        }"#;

        let event = parse_hook_event(Platform::Claude, raw).expect("parse");

        assert!(event.is_none());
    }

    #[test]
    fn parses_codex_explicit_skill_hint() {
        let raw = r#"{
            "type": "UserPromptSubmit",
            "session_id": "session-2",
            "prompt": "please use $research-lit for this"
        }"#;

        let event = parse_hook_event(Platform::Codex, raw)
            .expect("parse")
            .expect("event");

        assert_eq!(event.platform, Platform::Codex);
        assert_eq!(event.raw_skill_name, "research-lit");
        assert_eq!(event.confidence, Confidence::ExplicitHint);
    }

    #[test]
    fn imports_events_idempotently_and_returns_summary() {
        with_temp_home(|| {
            crate::db::run_migrations(&crate::db::open_db().expect("db")).expect("migrations");
            let events_dir = crate::paths::ensure_data_dirs().expect("dirs");
            let event = UsageEvent {
                platform: Platform::Claude,
                occurred_at: chrono::DateTime::parse_from_rfc3339("2026-05-17T10:00:00Z")
                    .unwrap()
                    .with_timezone(&chrono::Utc),
                session_hash: "session-hash".into(),
                turn_id: Some("turn-1".into()),
                cwd_hash: Some("cwd-hash".into()),
                invocation_kind: InvocationKind::ModelToolCall,
                detector: "test".into(),
                confidence: Confidence::Confirmed,
                raw_skill_name: "brainstorming".into(),
                hook_version: Some("0.1.0".into()),
            };
            let line = serde_json::to_string(&event).unwrap();
            let path = events_dir.join("20260517.jsonl");
            let mut file = std::fs::File::create(&path).unwrap();
            writeln!(file, "{line}").unwrap();
            writeln!(file, "{line}").unwrap();

            assert_eq!(import_queued_events(&events_dir).expect("first import"), 1);
            assert_eq!(import_queued_events(&events_dir).expect("second import"), 0);

            let summary = usage_summary().expect("summary");
            assert_eq!(summary.len(), 1);
            assert_eq!(summary[0].canonical_name, "brainstorming");
            assert_eq!(summary[0].platform, Platform::Claude);
            assert_eq!(summary[0].confidence, "confirmed");
            assert_eq!(summary[0].count, 1);
        });
    }
}
