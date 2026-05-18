use crate::error::{AppError, Result};
use crate::models::{Confidence, InvocationKind, Platform, UsageEvent};
use chrono::Utc;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
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
    transcript_path: Option<String>,
}

pub fn parse_hook_event(platform: Platform, raw: &str) -> Result<Option<UsageEvent>> {
    Ok(parse_hook_events(platform, raw)?.into_iter().next())
}

pub fn parse_hook_events(platform: Platform, raw: &str) -> Result<Vec<UsageEvent>> {
    let env: HookEnvelope = serde_json::from_str(raw)?;
    let hook_type = env.hook_event_name.clone().unwrap_or_default();
    let session_hash = hash_str(env.session_id.as_deref().unwrap_or("unknown"));

    match platform {
        Platform::Claude => parse_claude_hook(env, &hook_type, session_hash),
        Platform::Codex => parse_codex_hook(env, &hook_type, session_hash),
    }
}

pub fn record_usage_event(event: &UsageEvent) -> Result<bool> {
    let conn = crate::db::open_db()?;
    crate::db::run_migrations(&conn)?;
    insert_usage_event(&conn, event)
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
) -> Result<Vec<UsageEvent>> {
    match hook_type {
        "PreToolUse" => {
            if env.tool_name.as_deref() != Some("Skill") && env.tool_name.is_some() {
                return Ok(Vec::new());
            }

            let skill_name = env
                .tool_input
                .as_ref()
                .and_then(|v| first_string_field(v, &["skill", "skill_name", "name"]))
                .and_then(|skill| normalize_skill_name(&skill))
                .unwrap_or_default();

            if skill_name.is_empty() {
                return Err(AppError::InvalidPayload(
                    "PreToolUse without skill name".into(),
                ));
            }

            Ok(vec![UsageEvent {
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
            }])
        }
        "UserPromptExpansion" => {
            let skill_name = env
                .command_name
                .as_deref()
                .and_then(normalize_skill_name)
                .or_else(|| {
                    env.prompt
                        .as_deref()
                        .and_then(|prompt| extract_prefixed_skill_hint(prompt, '/'))
                })
                .unwrap_or_default();
            if skill_name.is_empty() {
                return Err(AppError::InvalidPayload(
                    "UserPromptExpansion without command_name".into(),
                ));
            }

            Ok(vec![UsageEvent {
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
            }])
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
) -> Result<Vec<UsageEvent>> {
    match hook_type {
        "UserPromptSubmit" => {
            let prompt = env.prompt.as_deref().unwrap_or("");
            let Some(skill_name) = extract_codex_skill_hint(prompt) else {
                return Ok(Vec::new());
            };

            Ok(vec![UsageEvent {
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
            }])
        }
        "Stop" => parse_codex_stop_transcript(env.transcript_path.as_deref(), session_hash),
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
    extract_prefixed_skill_hint(prompt, '$')
}

fn extract_prefixed_skill_hint(prompt: &str, prefix: char) -> Option<String> {
    prompt
        .split_whitespace()
        .filter_map(|word| word.strip_prefix(prefix))
        .find_map(normalize_skill_name)
}

fn first_string_field(value: &serde_json::Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(|value| value.as_str().map(ToOwned::to_owned))
}

fn normalize_skill_name(raw: &str) -> Option<String> {
    let skill = raw
        .trim()
        .trim_start_matches(['/', '$'])
        .trim_matches(|c: char| !(c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == ':'));
    if skill.is_empty() {
        None
    } else {
        Some(skill.to_string())
    }
}

fn parse_codex_stop_transcript(
    transcript_path: Option<&str>,
    session_hash: String,
) -> Result<Vec<UsageEvent>> {
    let Some(transcript_path) = transcript_path else {
        return Ok(Vec::new());
    };
    let file = fs::File::open(transcript_path)?;
    let reader = BufReader::new(file);
    let mut events = Vec::new();
    let mut seen_lines = HashSet::new();

    for line in reader.lines() {
        let line = line?;
        let Ok(record) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
        let Some(payload) = record.get("payload") else {
            continue;
        };
        if payload.get("type").and_then(|v| v.as_str()) != Some("function_call") {
            continue;
        }
        let Some(name) = payload.get("name").and_then(|v| v.as_str()) else {
            continue;
        };
        if !name.ends_with("shell_command") {
            continue;
        }

        let Some(command_text) = transcript_command_text(payload) else {
            continue;
        };
        let Some(skill_name) = extract_skill_name_from_skill_path(&command_text) else {
            continue;
        };
        let occurred_at = record
            .get("timestamp")
            .and_then(|v| v.as_str())
            .and_then(|timestamp| chrono::DateTime::parse_from_rfc3339(timestamp).ok())
            .map(|timestamp| timestamp.with_timezone(&Utc))
            .unwrap_or_else(Utc::now);
        let line_key = format!("{}|{}|{}", occurred_at.to_rfc3339(), name, skill_name);
        if !seen_lines.insert(line_key) {
            continue;
        }

        events.push(UsageEvent {
            platform: Platform::Codex,
            occurred_at,
            session_hash: session_hash.clone(),
            turn_id: None,
            cwd_hash: None,
            invocation_kind: InvocationKind::Implicit,
            detector: "codex-stop-transcript-skill-read".into(),
            confidence: Confidence::Inferred,
            raw_skill_name: skill_name,
            hook_version: Some(env!("CARGO_PKG_VERSION").into()),
        });
    }

    Ok(events)
}

fn transcript_command_text(payload: &serde_json::Value) -> Option<String> {
    let arguments = payload.get("arguments")?;
    if let Some(object) = arguments.as_object() {
        return object
            .get("command")
            .and_then(|command| command.as_str())
            .map(ToOwned::to_owned)
            .or_else(|| Some(arguments.to_string()));
    }
    let arguments = arguments.as_str()?;
    serde_json::from_str::<serde_json::Value>(arguments)
        .ok()
        .and_then(|value| {
            value
                .get("command")
                .and_then(|command| command.as_str())
                .map(ToOwned::to_owned)
        })
        .or_else(|| Some(arguments.to_string()))
}

fn extract_skill_name_from_skill_path(text: &str) -> Option<String> {
    let normalized = text.replace('\\', "/");
    let lower = normalized.to_ascii_lowercase();
    let skill_file_index = lower.find("/skill.md")?;
    let parent = normalized[..skill_file_index].trim_end_matches('/');
    let skill_name = parent.rsplit('/').next()?;
    normalize_skill_name(skill_name)
}

fn dedupe_key(event: &UsageEvent) -> String {
    let turn_or_session = event.turn_id.as_deref().unwrap_or(&event.session_hash);
    hash_str(&format!(
        "{}|{}|{}|{}|{}|{}",
        event.platform.as_str(),
        turn_or_session,
        event.raw_skill_name.trim(),
        invocation_kind_str(event.invocation_kind),
        event.confidence.as_str(),
        event.occurred_at.to_rfc3339()
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
    fn parses_claude_skill_name_alias_and_normalizes_slash_command() {
        let raw = r#"{
            "hook_event_name": "PreToolUse",
            "session_id": "session-3",
            "tool_name": "Skill",
            "tool_input": { "skill_name": "/auto-review-loop" }
        }"#;

        let event = parse_hook_event(Platform::Claude, raw)
            .expect("parse")
            .expect("event");

        assert_eq!(event.raw_skill_name, "auto-review-loop");
    }

    #[test]
    fn parses_codex_stop_transcript_skill_reads_as_inferred_events() {
        let temp = tempfile::tempdir().expect("temp dir");
        let transcript_path = temp.path().join("rollout.jsonl");
        let transcript = r#"{"timestamp":"2026-05-17T10:00:00Z","type":"response_item","payload":{"type":"function_call","name":"shell_command","arguments":"{\"command\":\"Get-Content C:\\Users\\Chream\\.codex\\skills\\research-lit\\SKILL.md\",\"workdir\":\"D:\\repo\"}"}}"#;
        std::fs::write(&transcript_path, transcript).expect("write transcript");
        let raw = serde_json::json!({
            "type": "Stop",
            "session_id": "session-4",
            "transcript_path": transcript_path,
        })
        .to_string();

        let events = parse_hook_events(Platform::Codex, &raw).expect("parse");

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].platform, Platform::Codex);
        assert_eq!(events[0].raw_skill_name, "research-lit");
        assert_eq!(events[0].confidence, Confidence::Inferred);
        assert_eq!(events[0].detector, "codex-stop-transcript-skill-read");
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
                hook_version: Some("1.0.0".into()),
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
