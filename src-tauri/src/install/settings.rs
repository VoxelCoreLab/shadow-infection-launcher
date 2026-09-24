use std::fs;
use std::path::{Path, PathBuf};

use super::traits::{LauncherSettings, SettingsStore, UpdateMode};

pub struct FileSettingsStore {
    path: PathBuf,
    default_install_path: PathBuf,
}

impl FileSettingsStore {
    pub fn new(data_root: impl Into<PathBuf>, default_install_path: impl Into<PathBuf>) -> Self {
        let data_root = data_root.into();
        Self {
            path: data_root.join("settings.json"),
            default_install_path: default_install_path.into(),
        }
    }

    pub fn default_settings(&self) -> LauncherSettings {
        LauncherSettings {
            install_path: self.default_install_path.display().to_string(),
            update_mode: UpdateMode::Auto,
        }
    }

    fn ensure_parent(&self) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

impl SettingsStore for FileSettingsStore {
    fn load(&self) -> Result<LauncherSettings, String> {
        if !self.path.exists() {
            return Ok(self.default_settings());
        }
        let raw = fs::read_to_string(&self.path).map_err(|e| e.to_string())?;
        serde_json::from_str(&raw).map_err(|e| e.to_string())
    }

    fn save(&self, settings: &LauncherSettings) -> Result<(), String> {
        validate_settings(settings)?;
        self.ensure_parent()?;
        let raw = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
        fs::write(&self.path, raw).map_err(|e| e.to_string())
    }
}

pub fn validate_settings(settings: &LauncherSettings) -> Result<(), String> {
    let trimmed = settings.install_path.trim();
    if trimmed.is_empty() {
        return Err("install path must not be empty".into());
    }
    let path = Path::new(trimmed);
    if path.as_os_str().is_empty() {
        return Err("install path must not be empty".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("sil-settings-{label}-{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn missing_file_returns_defaults() {
        let root = temp_dir("missing");
        let default_path = root.join("game");
        let store = FileSettingsStore::new(&root, &default_path);
        let settings = store.load().unwrap();
        assert_eq!(settings.install_path, default_path.display().to_string());
        assert_eq!(settings.update_mode, UpdateMode::Auto);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn save_then_get_roundtrip() {
        let root = temp_dir("roundtrip");
        let default_path = root.join("game");
        let store = FileSettingsStore::new(&root, &default_path);
        let custom = root.join("custom-game");
        let settings = LauncherSettings {
            install_path: custom.display().to_string(),
            update_mode: UpdateMode::Manual,
        };
        store.save(&settings).unwrap();
        assert_eq!(store.load().unwrap(), settings);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_empty_path_and_keeps_old() {
        let root = temp_dir("empty");
        let default_path = root.join("game");
        let store = FileSettingsStore::new(&root, &default_path);
        let good = LauncherSettings {
            install_path: default_path.display().to_string(),
            update_mode: UpdateMode::Auto,
        };
        store.save(&good).unwrap();

        let bad = LauncherSettings {
            install_path: "   ".into(),
            update_mode: UpdateMode::Manual,
        };
        assert!(store.save(&bad).is_err());
        assert_eq!(store.load().unwrap(), good);
        let _ = fs::remove_dir_all(root);
    }
}
