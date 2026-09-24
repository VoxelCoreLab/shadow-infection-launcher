use tauri::{AppHandle, Emitter};

use super::traits::{ProgressSink, ProgressUpdate};

pub const INSTALL_PROGRESS_EVENT: &str = "install-progress";

pub struct TauriProgressSink {
    app: AppHandle,
}

impl TauriProgressSink {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl ProgressSink for TauriProgressSink {
    fn on_progress(&self, update: ProgressUpdate) {
        let _ = self.app.emit(INSTALL_PROGRESS_EVENT, update);
    }
}

#[allow(dead_code)]
pub struct NoopProgressSink;

impl ProgressSink for NoopProgressSink {
    fn on_progress(&self, _update: ProgressUpdate) {}
}
