use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),

    #[error("database: {0}")]
    Db(#[from] rusqlite::Error),

    #[error("json: {0}")]
    Json(#[from] serde_json::Error),

    #[error("invalid hook payload: {0}")]
    InvalidPayload(String),

    #[error("path resolution: {0}")]
    PathResolution(String),
}

pub type Result<T> = std::result::Result<T, AppError>;
