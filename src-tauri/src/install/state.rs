use std::fs;
use std::path::PathBuf;

use super::traits::{InstallState, InstallStateStore};

pub struct FileInstallStateStore {
    path: PathBuf,
}

impl FileInstallStateStore {
    pub fn new(data_root: impl Into<PathBuf>) -> Self {
        Self {
            path: data_root.into().join("install-state.json"),
        }
    }

    fn ensure_parent(&self) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

impl InstallStateStore for FileInstallStateStore {
    fn load(&self) -> Result<InstallState, String> {
        if !self.path.exists() {
            return Ok(InstallState::default());
        }
        let raw = fs::read_to_string(&self.path).map_err(|e| e.to_string())?;
        serde_json::from_str(&raw).map_err(|e| e.to_string())
    }

    fn save(&self, state: &InstallState) -> Result<(), String> {
        self.ensure_parent()?;
        let raw = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
        fs::write(&self.path, raw).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::install::traits::DownloadProgress;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("sil-state-{label}-{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn missing_file_is_empty_state() {
        let root = temp_dir("missing");
        let store = FileInstallStateStore::new(&root);
        assert_eq!(store.load().unwrap(), InstallState::default());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn save_load_roundtrip() {
        let root = temp_dir("roundtrip");
        let store = FileInstallStateStore::new(&root);
        let state = InstallState {
            version: Some("1.2.3".into()),
            download: Some(DownloadProgress {
                version: "1.2.3".into(),
                size: 100,
                bytes: 40,
            }),
            last_error: None,
        };
        store.save(&state).unwrap();
        assert_eq!(store.load().unwrap(), state);
        let _ = fs::remove_dir_all(root);
    }
}
