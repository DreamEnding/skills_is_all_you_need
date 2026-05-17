use crate::error::Result;
use crate::paths;
use rusqlite::Connection;

const MIGRATIONS: &[&str] = &[
    // v0: initial schema
    r#"
CREATE TABLE IF NOT EXISTS skills (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    canonical_name  TEXT    NOT NULL UNIQUE,
    display_name    TEXT    NOT NULL,
    description     TEXT,
    source_kind     TEXT    NOT NULL DEFAULT 'unknown',
    first_seen_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    last_seen_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS skill_locations (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_id                INTEGER NOT NULL REFERENCES skills(id),
    platform                TEXT    NOT NULL,
    scope                   TEXT    NOT NULL DEFAULT 'user',
    skill_path              TEXT    NOT NULL,
    plugin_id               TEXT,
    enabled_state           TEXT    NOT NULL DEFAULT 'on',
    enable_strategy         TEXT    NOT NULL DEFAULT 'skill-override',
    supports_exact_disable  INTEGER NOT NULL DEFAULT 0,
    UNIQUE(skill_id, platform, skill_path)
);

CREATE TABLE IF NOT EXISTS skill_usage_events (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_id          INTEGER REFERENCES skills(id),
    platform          TEXT    NOT NULL,
    occurred_at       TEXT    NOT NULL,
    session_hash      TEXT    NOT NULL,
    turn_id           TEXT,
    cwd_hash          TEXT,
    invocation_kind   TEXT    NOT NULL,
    detector          TEXT    NOT NULL,
    confidence        TEXT    NOT NULL DEFAULT 'confirmed',
    raw_skill_name    TEXT    NOT NULL,
    hook_version      TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_skill_time
    ON skill_usage_events(skill_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_events_platform_time
    ON skill_usage_events(platform, occurred_at);

CREATE TABLE IF NOT EXISTS skill_usage_daily (
    date          TEXT    NOT NULL,
    skill_id      INTEGER NOT NULL REFERENCES skills(id),
    platform      TEXT    NOT NULL,
    count         INTEGER NOT NULL DEFAULT 1,
    last_used_at  TEXT    NOT NULL,
    PRIMARY KEY(date, skill_id, platform)
);

CREATE TABLE IF NOT EXISTS hook_offsets (
    platform             TEXT    NOT NULL,
    transcript_path_hash TEXT    NOT NULL,
    last_offset          INTEGER NOT NULL DEFAULT 0,
    last_seen_at         TEXT    NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY(platform, transcript_path_hash)
);

CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    action      TEXT    NOT NULL,
    target      TEXT,
    detail      TEXT,
    performed_at TEXT   NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ingest_errors (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    platform     TEXT,
    source_path   TEXT,
    raw_payload   TEXT,
    error         TEXT NOT NULL,
    occurred_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY
);
INSERT INTO schema_version VALUES (0);
"#,
    r#"
ALTER TABLE skill_usage_events ADD COLUMN dedupe_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_dedupe_key
    ON skill_usage_events(dedupe_key);

CREATE TABLE IF NOT EXISTS ingest_errors (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    platform     TEXT,
    source_path   TEXT,
    raw_payload   TEXT,
    error         TEXT NOT NULL,
    occurred_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
"#,
];

pub fn open_db() -> Result<Connection> {
    let path = paths::db_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let conn = Connection::open(&path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
    Ok(conn)
}

pub fn run_migrations(conn: &Connection) -> Result<()> {
    let current: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), -1) FROM schema_version",
            [],
            |row| row.get(0),
        )
        .unwrap_or(-1);

    for (i, sql) in MIGRATIONS.iter().enumerate() {
        let target = i as i64;
        if current < target {
            conn.execute_batch(sql)?;
            conn.execute(
                "INSERT OR REPLACE INTO schema_version (version) VALUES (?1)",
                rusqlite::params![target],
            )?;
        }
    }
    Ok(())
}
