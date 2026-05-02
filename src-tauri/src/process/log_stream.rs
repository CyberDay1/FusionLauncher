use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{ChildStdout, ChildStderr};

#[derive(Clone, Serialize)]
pub struct ProcessLogEvent {
    pub instance_id: String,
    pub stream: String,  // "stdout" or "stderr"
    pub line: String,
    pub timestamp: String,
}

/// Spawns async tasks that stream process stdout/stderr as Tauri events.
pub fn stream_process_output(
    app: AppHandle,
    instance_id: String,
    stdout: ChildStdout,
    stderr: ChildStderr,
) {
    let app_out = app.clone();
    let id_out = instance_id.clone();

    // Stream stdout
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app_out.emit("process-log", ProcessLogEvent {
                instance_id: id_out.clone(),
                stream: "stdout".to_string(),
                line,
                timestamp: chrono::Utc::now().format("%H:%M:%S").to_string(),
            });
        }
    });

    // Stream stderr
    let app_err = app.clone();
    let id_err = instance_id;

    tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app_err.emit("process-log", ProcessLogEvent {
                instance_id: id_err.clone(),
                stream: "stderr".to_string(),
                line,
                timestamp: chrono::Utc::now().format("%H:%M:%S").to_string(),
            });
        }
    });
}
