use crate::error::Result;
use crate::models::{EnabledState, EnableStrategy, Platform, Skill, SkillLocation};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct ScanResult {
    pub skill: Skill,
    pub locations: Vec<SkillLocation>,
}

pub fn scan_all() -> Result<Vec<ScanResult>> {
    let claude = scan_platform(Platform::Claude)?;
    let codex = scan_platform(Platform::Codex)?;
    let mut map: HashMap<String, ScanResult> = HashMap::new();

    for loc in claude {
        let name = loc.canonical_name.clone();
        let entry = map.entry(name.clone()).or_insert_with(|| ScanResult {
            skill: Skill {
                id: None,
                canonical_name: name.clone(),
                display_name: loc.display_name.clone(),
                description: loc.description.clone(),
                source_kind: "scanned".into(),
                first_seen_at: chrono::Utc::now(),
                last_seen_at: chrono::Utc::now(),
            },
            locations: Vec::new(),
        });
        entry.locations.push(loc.location);
    }

    for loc in codex {
        let name = loc.canonical_name.clone();
        let entry = map.entry(name.clone()).or_insert_with(|| ScanResult {
            skill: Skill {
                id: None,
                canonical_name: name.clone(),
                display_name: loc.display_name.clone(),
                description: loc.description.clone(),
                source_kind: "scanned".into(),
                first_seen_at: chrono::Utc::now(),
                last_seen_at: chrono::Utc::now(),
            },
            locations: Vec::new(),
        });
        entry.locations.push(loc.location);
    }

    Ok(map.into_values().collect())
}

struct RawSkill {
    canonical_name: String,
    display_name: String,
    description: Option<String>,
    location: SkillLocation,
}

fn scan_platform(platform: Platform) -> Result<Vec<RawSkill>> {
    let roots = match platform {
        Platform::Claude => claude_roots()?,
        Platform::Codex => codex_roots()?,
    };

    let mut skills = Vec::new();
    for root in roots {
        if root.exists() {
            scan_dir(&root, platform, &mut skills)?;
        }
    }
    Ok(skills)
}

fn claude_roots() -> Result<Vec<PathBuf>> {
    let home = dirs::home_dir()
        .ok_or_else(|| crate::error::AppError::PathResolution("no home dir".into()))?;
    Ok(vec![
        home.join(".claude").join("skills"),
        home.join(".claude").join("plugins").join("cache"),
    ])
}

fn codex_roots() -> Result<Vec<PathBuf>> {
    let home = dirs::home_dir()
        .ok_or_else(|| crate::error::AppError::PathResolution("no home dir".into()))?;
    Ok(vec![
        home.join(".agents").join("skills"),
        home.join(".codex").join("plugins").join("cache"),
    ])
}

fn scan_dir(dir: &Path, platform: Platform, out: &mut Vec<RawSkill>) -> Result<()> {
    let entries = std::fs::read_dir(dir)?;
    for entry in entries {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            let skill_md = path.join("SKILL.md");
            if skill_md.exists() {
                if let Some(raw) = parse_skill_md(&skill_md, platform, &path)? {
                    out.push(raw);
                }
            } else {
                // Recurse one level for plugin cache dirs
                scan_dir(&path, platform, out)?;
            }
        }
    }
    Ok(())
}

fn parse_skill_md(
    path: &Path,
    platform: Platform,
    skill_dir: &Path,
) -> Result<Option<RawSkill>> {
    let content = std::fs::read_to_string(path)?;
    let fm = parse_frontmatter(&content);

    let name = fm.get("name").cloned().unwrap_or_else(|| {
        skill_dir
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default()
    });

    if name.is_empty() {
        return Ok(None);
    }

    let display_name = fm.get("display_name").cloned().unwrap_or_else(|| name.clone());
    let description = fm.get("description").cloned();

    Ok(Some(RawSkill {
        canonical_name: name.clone(),
        display_name,
        description,
        location: SkillLocation {
            id: None,
            skill_id: 0,
            platform,
            scope: "user".into(),
            skill_path: path.to_string_lossy().into_owned(),
            plugin_id: None,
            enabled_state: EnabledState::On,
            enable_strategy: match platform {
                Platform::Claude => EnableStrategy::SkillOverride,
                Platform::Codex => EnableStrategy::CodexConfig,
            },
            supports_exact_disable: true,
        },
    }))
}

fn parse_frontmatter(content: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    if !content.starts_with("---") {
        return map;
    }
    let rest = &content[3..];
    let end = match rest.find("---") {
        Some(i) => i,
        None => return map,
    };
    let body = &rest[..end];
    for line in body.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some((k, v)) = line.split_once(':') {
            let key = k.trim().to_string();
            let val = v.trim().trim_matches('"').to_string();
            map.insert(key, val);
        }
    }
    map
}
