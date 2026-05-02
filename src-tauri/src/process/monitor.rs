use serde::{Deserialize, Serialize};
use std::time::Instant;
use tokio::process::Child;
use tokio::sync::mpsc;

/// Handle to a running Java process.
pub struct ProcessHandle {
    /// The instance this process belongs to
    pub instance_id: String,

    /// The child process
    pub child: Child,

    /// Channel to send stdin commands (for server console)
    pub stdin_tx: mpsc::Sender<String>,

    /// Current status
    pub status: ProcessStatus,

    /// When the process was started
    pub started_at: Instant,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum ProcessStatus {
    Starting,
    Running { pid: u32 },
    Stopping,
    Stopped { exit_code: Option<i32> },
    Crashed { exit_code: i32, error: String },
}
