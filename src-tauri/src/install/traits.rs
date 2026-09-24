use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum UpdateMode {
    #[default]
    Auto,
    Manual,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LauncherSettings {
    pub install_path: String,
    pub update_mode: UpdateMode,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InstallPhase {
    NotInstalled,
    Downloading,
    Extracting,
    Installed,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ProgressPhase {
    #[default]
    Download,
    Extract,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct DownloadProgress {
    pub version: String,
    pub size: u64,
    pub bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct InstallState {
    pub version: Option<String>,
    pub download: Option<DownloadProgress>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressUpdate {
    pub downloaded: u64,
    pub total: Option<u64>,
    pub percent: Option<f64>,
    pub phase: ProgressPhase,
}

#[derive(Debug, Clone, Serialize)]
pub struct InstallStatusDto {
    pub phase: InstallPhase,
    pub install_path: String,
    pub local_version: Option<String>,
    pub last_error: Option<String>,
    pub download: Option<DownloadProgress>,
}

pub trait SettingsStore: Send + Sync {
    fn load(&self) -> Result<LauncherSettings, String>;
    fn save(&self, settings: &LauncherSettings) -> Result<(), String>;
}

pub trait PathProvider: Send + Sync {
    fn install_path(&self) -> Result<PathBuf, String>;
    #[allow(dead_code)]
    fn default_install_path(&self) -> Result<PathBuf, String>;
}

pub trait InstallStateStore: Send + Sync {
    fn load(&self) -> Result<InstallState, String>;
    fn save(&self, state: &InstallState) -> Result<(), String>;
}

pub trait ProgressSink: Send + Sync {
    fn on_progress(&self, update: ProgressUpdate);
}

pub trait HttpDownloader: Send + Sync {
    /// Downloads `url` into `dest`. When `resume_from > 0`, uses HTTP Range.
    /// Returns the final number of bytes on disk.
    fn download(
        &self,
        url: &str,
        dest: &Path,
        resume_from: u64,
        expected_total: Option<u64>,
        progress: &dyn ProgressSink,
    ) -> Result<u64, String>;
}

pub trait ArchiveExtractor: Send + Sync {
    /// Extracts `archive` into a staging dir next to `install_dir`, then swaps.
    fn extract_and_swap(
        &self,
        archive: &Path,
        install_dir: &Path,
        progress: &dyn ProgressSink,
    ) -> Result<(), String>;
}
