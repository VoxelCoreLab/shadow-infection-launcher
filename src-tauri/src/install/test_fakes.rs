use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use super::traits::{
    ArchiveExtractor, HttpDownloader, InstallState, InstallStateStore, PathProvider, ProgressPhase,
    ProgressSink, ProgressUpdate,
};
use super::service::InstallService;

#[derive(Default)]
pub struct MemoryStateStore {
    inner: Mutex<InstallState>,
}

impl InstallStateStore for MemoryStateStore {
    fn load(&self) -> Result<InstallState, String> {
        Ok(self.inner.lock().map_err(|e| e.to_string())?.clone())
    }

    fn save(&self, state: &InstallState) -> Result<(), String> {
        *self.inner.lock().map_err(|e| e.to_string())? = state.clone();
        Ok(())
    }
}

pub struct FixedPathProvider {
    path: PathBuf,
}

impl FixedPathProvider {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }
}

impl PathProvider for FixedPathProvider {
    fn install_path(&self) -> Result<PathBuf, String> {
        Ok(self.path.clone())
    }

    fn default_install_path(&self) -> Result<PathBuf, String> {
        Ok(self.path.clone())
    }
}

pub struct RecordingProgressSink {
    pub updates: Mutex<Vec<ProgressUpdate>>,
}

impl Default for RecordingProgressSink {
    fn default() -> Self {
        Self {
            updates: Mutex::new(Vec::new()),
        }
    }
}

impl ProgressSink for RecordingProgressSink {
    fn on_progress(&self, update: ProgressUpdate) {
        self.updates.lock().unwrap().push(update);
    }
}

pub struct FakeDownloader {
    pub bytes: Vec<u8>,
    pub fail: bool,
    pub last_resume_from: Mutex<Option<u64>>,
    pub call_count: Mutex<u32>,
    pub truncate_to: Option<u64>,
}

impl FakeDownloader {
    pub fn ok(bytes: Vec<u8>) -> Self {
        Self {
            bytes,
            fail: false,
            last_resume_from: Mutex::new(None),
            call_count: Mutex::new(0),
            truncate_to: None,
        }
    }

    pub fn failing() -> Self {
        Self {
            bytes: Vec::new(),
            fail: true,
            last_resume_from: Mutex::new(None),
            call_count: Mutex::new(0),
            truncate_to: None,
        }
    }
}

impl HttpDownloader for FakeDownloader {
    fn download(
        &self,
        _url: &str,
        dest: &Path,
        resume_from: u64,
        expected_total: Option<u64>,
        progress: &dyn ProgressSink,
    ) -> Result<u64, String> {
        *self.last_resume_from.lock().unwrap() = Some(resume_from);
        *self.call_count.lock().unwrap() += 1;
        if self.fail {
            return Err("http download failed".into());
        }
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).unwrap();
        }

        let total = expected_total.unwrap_or(self.bytes.len() as u64);
        let mut data = if resume_from > 0 && dest.exists() {
            let mut existing = fs::read(dest).unwrap();
            existing.extend_from_slice(&self.bytes[resume_from as usize..]);
            existing
        } else {
            self.bytes.clone()
        };

        if let Some(limit) = self.truncate_to {
            data.truncate(limit as usize);
        }

        fs::write(dest, &data).unwrap();
        let downloaded = data.len() as u64;
        progress.on_progress(ProgressUpdate {
            downloaded,
            total: Some(total),
            percent: Some((downloaded as f64 / total as f64) * 100.0),
            phase: ProgressPhase::Download,
        });

        if downloaded != total {
            return Err(format!(
                "content length mismatch: expected {total} bytes, got {downloaded}"
            ));
        }
        Ok(downloaded)
    }
}

pub struct FakeExtractor {
    pub fail: bool,
}

impl ArchiveExtractor for FakeExtractor {
    fn extract_and_swap(
        &self,
        _archive: &Path,
        install_dir: &Path,
        progress: &dyn ProgressSink,
    ) -> Result<(), String> {
        if self.fail {
            return Err("extract failed".into());
        }
        progress.on_progress(ProgressUpdate {
            downloaded: 0,
            total: Some(1),
            percent: Some(0.0),
            phase: ProgressPhase::Extract,
        });
        fs::create_dir_all(install_dir).map_err(|e| e.to_string())?;
        fs::write(install_dir.join("game.bin"), b"ok").map_err(|e| e.to_string())?;
        progress.on_progress(ProgressUpdate {
            downloaded: 1,
            total: Some(1),
            percent: Some(100.0),
            phase: ProgressPhase::Extract,
        });
        Ok(())
    }
}

pub fn build_service(
    root: PathBuf,
    downloader: Arc<dyn HttpDownloader>,
    extractor: Arc<dyn ArchiveExtractor>,
) -> (InstallService, Arc<MemoryStateStore>) {
    let state = Arc::new(MemoryStateStore::default());
    let paths = Arc::new(FixedPathProvider::new(root.join("game")));
    let service = InstallService::new(
        paths,
        Arc::clone(&state) as Arc<dyn InstallStateStore>,
        downloader,
        extractor,
        root,
    );
    (service, state)
}
