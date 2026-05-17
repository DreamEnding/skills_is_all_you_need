use crate::error::{AppError, Result};
use std::path::PathBuf;

const DATA_DIR_NAME: &str = ".skill-usage-manager";
const EVENTS_DIR_NAME: &str = "events";
const DB_NAME: &str = "usage.db";

pub fn data_dir() -> Result<PathBuf> {
    if let Ok(path) = std::env::var("SKILL_USAGE_MANAGER_HOME") {
        if !path.trim().is_empty() {
            return Ok(PathBuf::from(path));
        }
    }

    dirs::home_dir()
        .map(|h| h.join(DATA_DIR_NAME))
        .ok_or_else(|| AppError::PathResolution("cannot locate home directory".into()))
}

pub fn ingest_errors_dir() -> Result<PathBuf> {
    data_dir().map(|d| d.join("ingest-errors"))
}

pub fn events_dir() -> Result<PathBuf> {
    data_dir().map(|d| d.join(EVENTS_DIR_NAME))
}

pub fn db_path() -> Result<PathBuf> {
    data_dir().map(|d| d.join(DB_NAME))
}

pub fn ensure_data_dirs() -> Result<PathBuf> {
    let events = events_dir()?;
    std::fs::create_dir_all(&events)?;
    std::fs::create_dir_all(ingest_errors_dir()?)?;
    Ok(events)
}
