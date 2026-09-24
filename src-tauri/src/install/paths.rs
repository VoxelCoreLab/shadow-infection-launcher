use std::path::PathBuf;
use std::sync::Arc;

use super::traits::{PathProvider, SettingsStore};

pub struct SettingsPathProvider {
    settings: Arc<dyn SettingsStore>,
    default_install_path: PathBuf,
}

impl SettingsPathProvider {
    pub fn new(settings: Arc<dyn SettingsStore>, default_install_path: impl Into<PathBuf>) -> Self {
        Self {
            settings,
            default_install_path: default_install_path.into(),
        }
    }
}

impl PathProvider for SettingsPathProvider {
    fn install_path(&self) -> Result<PathBuf, String> {
        let settings = self.settings.load()?;
        let trimmed = settings.install_path.trim();
        if trimmed.is_empty() {
            return Ok(self.default_install_path.clone());
        }
        Ok(PathBuf::from(trimmed))
    }

    fn default_install_path(&self) -> Result<PathBuf, String> {
        Ok(self.default_install_path.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::install::traits::{LauncherSettings, UpdateMode};
    use std::sync::Mutex;

    struct MemorySettings {
        inner: Mutex<LauncherSettings>,
    }

    impl SettingsStore for MemorySettings {
        fn load(&self) -> Result<LauncherSettings, String> {
            Ok(self.inner.lock().map_err(|e| e.to_string())?.clone())
        }

        fn save(&self, settings: &LauncherSettings) -> Result<(), String> {
            *self.inner.lock().map_err(|e| e.to_string())? = settings.clone();
            Ok(())
        }
    }

    #[test]
    fn returns_saved_install_path() {
        let default = PathBuf::from("/default/game");
        let settings = Arc::new(MemorySettings {
            inner: Mutex::new(LauncherSettings {
                install_path: "/custom/path".into(),
                update_mode: UpdateMode::Auto,
            }),
        });
        let provider = SettingsPathProvider::new(settings, default);
        assert_eq!(
            provider.install_path().unwrap(),
            PathBuf::from("/custom/path")
        );
    }
}
