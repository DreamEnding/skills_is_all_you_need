use serde::Serialize;

#[derive(Serialize)]
struct SkillInfo {
    canonical_name: String,
    locations: Vec<LocationInfo>,
}

#[derive(Serialize)]
struct LocationInfo {
    platform: String,
    skill_path: String,
}

#[derive(Serialize)]
struct UsageSummaryInfo {
    canonical_name: String,
    platform: String,
    confidence: String,
    count: i64,
}

#[tauri::command]
fn scan_skills() -> Result<Vec<SkillInfo>, String> {
    let results = skill_usage_core::scanner::scan_all().map_err(|e| e.to_string())?;
    Ok(results
        .into_iter()
        .map(|r| SkillInfo {
            canonical_name: r.skill.canonical_name,
            locations: r
                .locations
                .into_iter()
                .map(|l| LocationInfo {
                    platform: l.platform.as_str().to_string(),
                    skill_path: l.skill_path,
                })
                .collect(),
        })
        .collect())
}

#[tauri::command]
fn import_usage_events() -> Result<usize, String> {
    let events_dir = skill_usage_core::paths::ensure_data_dirs().map_err(|e| e.to_string())?;
    skill_usage_core::events::import_queued_events(&events_dir).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_usage_summary() -> Result<Vec<UsageSummaryInfo>, String> {
    let rows = skill_usage_core::events::usage_summary().map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .map(|row| UsageSummaryInfo {
            canonical_name: row.canonical_name,
            platform: row.platform.as_str().to_string(),
            confidence: row.confidence,
            count: row.count,
        })
        .collect())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            scan_skills,
            import_usage_events,
            get_usage_summary
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn imports_events_and_returns_usage_summary() {
        let temp = tempfile::tempdir().expect("temp dir");
        std::env::set_var("SKILL_USAGE_MANAGER_HOME", temp.path());

        let events_dir = skill_usage_core::paths::ensure_data_dirs().expect("dirs");
        let mut file = std::fs::File::create(events_dir.join("20260517.jsonl")).expect("file");
        writeln!(
            file,
            r#"{{"platform":"claude","occurred_at":"2026-05-17T10:00:00Z","session_hash":"session-hash","turn_id":"turn-1","cwd_hash":"cwd-hash","invocation_kind":"model-tool-call","detector":"test","confidence":"confirmed","raw_skill_name":"brainstorming","hook_version":"1.0.0"}}"#
        )
        .expect("write event");

        assert_eq!(import_usage_events().expect("import"), 1);

        let summary = get_usage_summary().expect("summary");
        assert_eq!(summary.len(), 1);
        assert_eq!(summary[0].canonical_name, "brainstorming");
        assert_eq!(summary[0].platform, "claude");
        assert_eq!(summary[0].confidence, "confirmed");
        assert_eq!(summary[0].count, 1);

        std::env::remove_var("SKILL_USAGE_MANAGER_HOME");
    }
}
