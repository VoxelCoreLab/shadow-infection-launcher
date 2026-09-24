use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use super::traits::{
    ArchiveExtractor, DownloadProgress, HttpDownloader, InstallPhase, InstallState,
    InstallStateStore, InstallStatusDto, PathProvider, ProgressPhase, ProgressSink, ProgressUpdate,
};

pub struct InstallService {
    paths: Arc<dyn PathProvider>,
    state_store: Arc<dyn InstallStateStore>,
    downloader: Arc<dyn HttpDownloader>,
    extractor: Arc<dyn ArchiveExtractor>,
    /// `None` = idle; otherwise the busy UI phase (Downloading / Extracting).
    busy: Mutex<Option<InstallPhase>>,
    data_root: PathBuf,
}

impl InstallService {
    pub fn new(
        paths: Arc<dyn PathProvider>,
        state_store: Arc<dyn InstallStateStore>,
        downloader: Arc<dyn HttpDownloader>,
        extractor: Arc<dyn ArchiveExtractor>,
        data_root: PathBuf,
    ) -> Self {
        Self {
            paths,
            state_store,
            downloader,
            extractor,
            busy: Mutex::new(None),
            data_root,
        }
    }

    pub fn is_busy(&self) -> Result<bool, String> {
        Ok(self.busy.lock().map_err(|e| e.to_string())?.is_some())
    }

    pub fn install_state(&self) -> Result<InstallState, String> {
        self.state_store.load()
    }

    pub fn status(&self) -> Result<InstallStatusDto, String> {
        let install_path = self.paths.install_path()?;
        let state = self.state_store.load()?;
        let busy = *self.busy.lock().map_err(|e| e.to_string())?;
        let phase = if let Some(busy_phase) = busy {
            busy_phase
        } else if state.last_error.is_some() && state.version.is_none() {
            InstallPhase::Failed
        } else if state.version.is_some() {
            InstallPhase::Installed
        } else {
            InstallPhase::NotInstalled
        };

        Ok(InstallStatusDto {
            phase,
            install_path: install_path.display().to_string(),
            local_version: state.version.clone(),
            last_error: state.last_error.clone(),
            download: state.download.clone(),
        })
    }

    pub fn install(
        &self,
        url: &str,
        version: &str,
        progress: &dyn ProgressSink,
    ) -> Result<InstallStatusDto, String> {
        {
            let mut busy = self.busy.lock().map_err(|e| e.to_string())?;
            if busy.is_some() {
                return Err("an installation is already running".into());
            }
            *busy = Some(InstallPhase::Downloading);
        }

        let result = self.install_inner(url, version, progress);
        if let Ok(mut busy) = self.busy.lock() {
            *busy = None;
        }
        match result {
            Ok(_) => self.status(),
            Err(err) => Err(err),
        }
    }

    fn install_inner(
        &self,
        url: &str,
        version: &str,
        progress: &dyn ProgressSink,
    ) -> Result<(), String> {
        let install_path = self.paths.install_path()?;
        let temp_file = self.temp_download_path(version);

        let mut state = self.state_store.load().unwrap_or_default();
        state.last_error = None;
        let _ = self.state_store.save(&state);

        let resume = self.resume_plan(&state, version, &temp_file);
        let expected_total_for_check = match &resume {
            ResumePlan::NeedDownload { expected_total, .. } => *expected_total,
            ResumePlan::AlreadyComplete { .. } => None,
        };

        let download_progress = RecordingAndForwardingSink {
            inner: progress,
            version: version.to_string(),
            state_store: Arc::clone(&self.state_store),
            last_saved_bytes: Mutex::new(None),
        };

        let downloaded = match resume {
            ResumePlan::AlreadyComplete { size } => {
                progress.on_progress(ProgressUpdate {
                    downloaded: size,
                    total: Some(size),
                    percent: Some(100.0),
                    phase: ProgressPhase::Download,
                });
                size
            }
            ResumePlan::NeedDownload {
                resume_from,
                expected_total,
            } => {
                progress.on_progress(ProgressUpdate {
                    downloaded: resume_from,
                    total: expected_total,
                    percent: expected_total.map(|t| {
                        if t == 0 {
                            0.0
                        } else {
                            (resume_from as f64 / t as f64 * 100.0).min(100.0)
                        }
                    }),
                    phase: ProgressPhase::Download,
                });

                match self.downloader.download(
                    url,
                    &temp_file,
                    resume_from,
                    expected_total,
                    &download_progress,
                ) {
                    Ok(bytes) => bytes,
                    Err(err) => {
                        self.persist_error(&err)?;
                        return Err(err);
                    }
                }
            }
        };

        if let Some(expected) = expected_total_for_check {
            if downloaded != expected {
                let err = format!(
                    "content length mismatch: expected {expected} bytes, got {downloaded}"
                );
                self.persist_error(&err)?;
                return Err(err);
            }
        }

        if let Ok(mut busy) = self.busy.lock() {
            *busy = Some(InstallPhase::Extracting);
        }
        progress.on_progress(ProgressUpdate {
            downloaded: 0,
            total: None,
            percent: Some(0.0),
            phase: ProgressPhase::Extract,
        });

        if let Err(err) = self
            .extractor
            .extract_and_swap(&temp_file, &install_path, progress)
        {
            self.persist_error(&err)?;
            return Err(err);
        }

        let _ = std::fs::remove_file(&temp_file);

        let final_state = InstallState {
            version: Some(version.to_string()),
            download: None,
            last_error: None,
        };
        self.state_store.save(&final_state)?;

        Ok(())
    }

    fn resume_plan(
        &self,
        state: &InstallState,
        version: &str,
        temp_file: &Path,
    ) -> ResumePlan {
        let Some(download) = &state.download else {
            return ResumePlan::NeedDownload {
                resume_from: 0,
                expected_total: None,
            };
        };
        if download.version != version {
            let _ = std::fs::remove_file(temp_file);
            return ResumePlan::NeedDownload {
                resume_from: 0,
                expected_total: None,
            };
        }
        if !temp_file.exists() {
            return ResumePlan::NeedDownload {
                resume_from: 0,
                expected_total: Some(download.size).filter(|s| *s > 0),
            };
        }
        let meta_len = std::fs::metadata(temp_file)
            .map(|m| m.len())
            .unwrap_or(0);
        if download.size > 0 && meta_len > download.size {
            let _ = std::fs::remove_file(temp_file);
            return ResumePlan::NeedDownload {
                resume_from: 0,
                expected_total: Some(download.size),
            };
        }
        if meta_len != download.bytes {
            if meta_len > 0 && meta_len < download.size {
                return ResumePlan::NeedDownload {
                    resume_from: meta_len,
                    expected_total: Some(download.size),
                };
            }
            let _ = std::fs::remove_file(temp_file);
            return ResumePlan::NeedDownload {
                resume_from: 0,
                expected_total: Some(download.size).filter(|s| *s > 0),
            };
        }
        if download.size > 0 && download.bytes == download.size && meta_len == download.size {
            ResumePlan::AlreadyComplete {
                size: download.size,
            }
        } else if download.bytes > 0 && download.bytes < download.size {
            ResumePlan::NeedDownload {
                resume_from: download.bytes,
                expected_total: Some(download.size),
            }
        } else {
            ResumePlan::NeedDownload {
                resume_from: 0,
                expected_total: Some(download.size).filter(|s| *s > 0),
            }
        }
    }

    fn temp_download_path(&self, version: &str) -> PathBuf {
        self.data_root
            .join("downloads")
            .join(format!("game-{version}.zip"))
    }

    fn persist_error(&self, err: &str) -> Result<(), String> {
        let mut state = self.state_store.load().unwrap_or_default();
        state.last_error = Some(err.to_string());
        self.state_store.save(&state)
    }

    pub fn uninstall(&self) -> Result<InstallStatusDto, String> {
        {
            let busy = self.busy.lock().map_err(|e| e.to_string())?;
            if busy.is_some() {
                return Err("cannot uninstall while an installation is running".into());
            }
        }

        let install_path = self.paths.install_path()?;
        if install_path.exists() {
            std::fs::remove_dir_all(&install_path).map_err(|e| e.to_string())?;
        }

        let staging = super::extract::staging_dir(&install_path);
        let backup = super::extract::backup_dir(&install_path);
        if staging.exists() {
            let _ = std::fs::remove_dir_all(&staging);
        }
        if backup.exists() {
            let _ = std::fs::remove_dir_all(&backup);
        }

        self.state_store.save(&InstallState::default())?;
        self.status()
    }
}

enum ResumePlan {
    NeedDownload {
        resume_from: u64,
        expected_total: Option<u64>,
    },
    AlreadyComplete {
        size: u64,
    },
}

struct RecordingAndForwardingSink<'a> {
    inner: &'a dyn ProgressSink,
    version: String,
    state_store: Arc<dyn InstallStateStore>,
    last_saved_bytes: Mutex<Option<u64>>,
}

impl ProgressSink for RecordingAndForwardingSink<'_> {
    fn on_progress(&self, update: ProgressUpdate) {
        self.inner.on_progress(update.clone());
        if update.phase != ProgressPhase::Download {
            return;
        }
        let Some(total) = update.total else {
            return;
        };

        let save_interval = (total / 200).max(256 * 1024);
        let should_save = {
            let mut last = match self.last_saved_bytes.lock() {
                Ok(guard) => guard,
                Err(_) => return,
            };
            let done = total > 0 && update.downloaded >= total;
            let advanced = match *last {
                None => true,
                Some(prev) => update.downloaded.saturating_sub(prev) >= save_interval,
            };
            if done || advanced {
                *last = Some(update.downloaded);
                true
            } else {
                false
            }
        };

        if !should_save {
            return;
        }

        let mut state = self.state_store.load().unwrap_or_default();
        // Keep any already-installed version so crash/retry mid-download does not
        // look like an uninstall (files remain on disk until swap succeeds).
        state.download = Some(DownloadProgress {
            version: self.version.clone(),
            size: total,
            bytes: update.downloaded,
        });
        state.last_error = None;
        let _ = self.state_store.save(&state);
    }
}
