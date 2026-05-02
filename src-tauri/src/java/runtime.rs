use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Represents a detected or downloaded Java runtime.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct JavaRuntime {
    /// Full path to the java executable
    pub path: PathBuf,

    /// Parsed version
    pub version: JavaVersion,

    /// Vendor name (e.g., "Temurin", "Oracle")
    pub vendor: String,

    /// Architecture (e.g., "x64", "aarch64")
    pub arch: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct JavaVersion {
    pub major: u32,
    pub minor: u32,
    pub patch: u32,
}

impl JavaVersion {
    pub fn meets_minimum(&self, required_major: u32) -> bool {
        self.major >= required_major
    }
}

impl std::fmt::Display for JavaVersion {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}.{}.{}", self.major, self.minor, self.patch)
    }
}
