use serde::Serialize;
use thiserror::Error;

#[derive(Error, Debug, Serialize)]
pub enum LauncherError {
    #[error("IO error: {0}")]
    Io(String),

    #[error("HTTP error: {0}")]
    Http(String),

    #[error("JSON error: {0}")]
    Json(String),

    #[error("ZIP error: {0}")]
    Zip(String),

    #[error("Java not found: {0}")]
    JavaNotFound(String),

    #[error("Minecraft version not found: {0}")]
    McVersionNotFound(String),

    #[error("Instance not found: {0}")]
    InstanceNotFound(String),

    #[error("Process error: {0}")]
    Process(String),

    #[error("Download failed: {0}")]
    Download(String),

    #[error("Checksum mismatch: {0}")]
    ChecksumMismatch(String),

    #[error("{0}")]
    Other(String),
}

impl From<std::io::Error> for LauncherError {
    fn from(err: std::io::Error) -> Self {
        LauncherError::Io(err.to_string())
    }
}

impl From<reqwest::Error> for LauncherError {
    fn from(err: reqwest::Error) -> Self {
        LauncherError::Http(err.to_string())
    }
}

impl From<serde_json::Error> for LauncherError {
    fn from(err: serde_json::Error) -> Self {
        LauncherError::Json(err.to_string())
    }
}

impl From<zip::result::ZipError> for LauncherError {
    fn from(err: zip::result::ZipError) -> Self {
        LauncherError::Zip(err.to_string())
    }
}

impl From<LauncherError> for String {
    fn from(err: LauncherError) -> String {
        err.to_string()
    }
}

pub type Result<T> = std::result::Result<T, LauncherError>;
