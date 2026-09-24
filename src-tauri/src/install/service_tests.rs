use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use super::layout::{
    read_active_version, version_dir, write_active, write_version_manifest,
};
use super::test_fakes::{
    build_service, FakeDownloader, FakeExtractor, RecordingProgressSink,
};
use super::traits::{
    DownloadProgress, HttpDownloader, InstallPhase, InstallState, InstallStateStore, ProgressSink,
};

fn temp_root(label: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("sil-service-{label}-{nanos}"));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn exe_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "Shadow Infection.exe"
    } else if cfg!(target_os = "macos") {
        "Shadow Infection.app"
    } else {
        "ShadowInfection.x86_64"
    }
}

fn version_payload_exists(install_root: &Path, version: &str) -> bool {
    let dir = version_dir(install_root, version);
    dir.join(exe_name()).exists()
}

#[test]
fn happy_path_installs_and_stores_version() {
    let root = temp_root("happy");
    let downloader = Arc::new(FakeDownloader::ok(b"zip-bytes".to_vec()));
    let extractor = Arc::new(FakeExtractor { fail: false });
    let (service, state) = build_service(
        root.clone(),
        downloader as Arc<dyn HttpDownloader>,
        extractor,
    );
    let sink = RecordingProgressSink::default();

    let status = service
        .install("https://example.test/game.zip", "1.0.0", &sink)
        .unwrap();

    assert_eq!(status.phase, InstallPhase::Installed);
    assert_eq!(status.local_version.as_deref(), Some("1.0.0"));
    let install_root = Path::new(&status.install_path);
    assert!(version_payload_exists(install_root, "1.0.0"));
    assert_eq!(read_active_version(install_root).as_deref(), Some("1.0.0"));
    assert_eq!(state.load().unwrap().version.as_deref(), Some("1.0.0"));
    assert!(!sink.updates.lock().unwrap().is_empty());
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn status_without_install_is_not_installed() {
    let root = temp_root("empty");
    let downloader = Arc::new(FakeDownloader::ok(vec![]));
    let extractor = Arc::new(FakeExtractor { fail: false });
    let (service, _) = build_service(root.clone(), downloader, extractor);
    let status = service.status().unwrap();
    assert_eq!(status.phase, InstallPhase::NotInstalled);
    assert!(status.local_version.is_none());
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn download_http_error_does_not_extract() {
    let root = temp_root("http-fail");
    let downloader = Arc::new(FakeDownloader::failing());
    let extractor = Arc::new(FakeExtractor { fail: false });
    let (service, _) = build_service(root.clone(), downloader, extractor);

    let err = service
        .install("https://example.test/game.zip", "1.0.0", &RecordingProgressSink::default())
        .unwrap_err();
    assert!(err.contains("http download failed"));
    assert!(!root.join("game").exists());
    let status = service.status().unwrap();
    assert_eq!(status.phase, InstallPhase::Failed);
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn content_length_mismatch_fails() {
    let root = temp_root("mismatch");
    let mut downloader = FakeDownloader::ok(b"short".to_vec());
    downloader.truncate_to = Some(2);
    let downloader = Arc::new(downloader);
    let extractor = Arc::new(FakeExtractor { fail: false });
    let (service, _) = build_service(root.clone(), downloader, extractor);

    let err = service
        .install("https://example.test/game.zip", "1.0.0", &RecordingProgressSink::default())
        .unwrap_err();
    assert!(err.contains("content length mismatch"));
    assert!(!version_payload_exists(&root.join("game"), "1.0.0"));
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn extractor_failure_keeps_uninstalled() {
    let root = temp_root("extract-fail");
    let downloader = Arc::new(FakeDownloader::ok(b"zip-bytes".to_vec()));
    let extractor = Arc::new(FakeExtractor { fail: true });
    let (service, _) = build_service(root.clone(), downloader, extractor);

    let err = service
        .install("https://example.test/game.zip", "1.0.0", &RecordingProgressSink::default())
        .unwrap_err();
    assert!(err.contains("extract failed"));
    assert_eq!(service.status().unwrap().phase, InstallPhase::Failed);
    assert!(!version_dir(&root.join("game"), "1.0.0").exists());
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn extract_failure_keeps_previous_version_playable() {
    let root = temp_root("keep-old");
    let install_root = root.join("game");

    // First install succeeds.
    let downloader = Arc::new(FakeDownloader::ok(b"zip-bytes".to_vec()));
    let (service, _) = build_service(
        root.clone(),
        Arc::clone(&downloader) as Arc<dyn HttpDownloader>,
        Arc::new(FakeExtractor { fail: false }),
    );
    service
        .install(
            "https://example.test/game.zip",
            "1.0.0",
            &RecordingProgressSink::default(),
        )
        .unwrap();
    assert!(version_payload_exists(&install_root, "1.0.0"));

    // Update with failing extractor — previous build must remain active.
    let (service, state) = build_service(
        root.clone(),
        downloader,
        Arc::new(FakeExtractor { fail: true }),
    );
    write_active(&install_root, "1.0.0").unwrap();
    write_version_manifest(&version_dir(&install_root, "1.0.0"), "1.0.0").unwrap();
    state
        .save(&InstallState {
            version: Some("1.0.0".into()),
            download: None,
            last_error: None,
        })
        .unwrap();

    let err = service
        .install(
            "https://example.test/game.zip",
            "2.0.0",
            &RecordingProgressSink::default(),
        )
        .unwrap_err();
    assert!(err.contains("extract failed"));

    assert_eq!(state.load().unwrap().version.as_deref(), Some("1.0.0"));
    assert_eq!(read_active_version(&install_root).as_deref(), Some("1.0.0"));
    assert!(version_payload_exists(&install_root, "1.0.0"));
    assert!(!version_dir(&install_root, "2.0.0").exists());
    assert_eq!(
        service.status().unwrap().local_version.as_deref(),
        Some("1.0.0")
    );
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn resume_uses_range_offset_when_state_matches() {
    let root = temp_root("resume");
    let payload = b"abcdefghij".to_vec();
    let downloader = Arc::new(FakeDownloader::ok(payload.clone()));
    let extractor = Arc::new(FakeExtractor { fail: false });
    let (service, state) = build_service(
        root.clone(),
        Arc::clone(&downloader) as Arc<dyn HttpDownloader>,
        extractor,
    );

    let temp = root.join("downloads").join("game-1.0.0.zip");
    std::fs::create_dir_all(temp.parent().unwrap()).unwrap();
    std::fs::write(&temp, &payload[..4]).unwrap();
    state
        .save(&InstallState {
            version: None,
            download: Some(DownloadProgress {
                version: "1.0.0".into(),
                size: payload.len() as u64,
                bytes: 4,
            }),
            last_error: None,
        })
        .unwrap();

    service
        .install("https://example.test/game.zip", "1.0.0", &RecordingProgressSink::default())
        .unwrap();

    assert_eq!(*downloader.last_resume_from.lock().unwrap(), Some(4));
    assert_eq!(service.status().unwrap().phase, InstallPhase::Installed);
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn complete_download_skips_redownload_on_retry() {
    let root = temp_root("resume-complete");
    let payload = b"abcdefghij".to_vec();
    let downloader = Arc::new(FakeDownloader::ok(payload.clone()));
    let extractor = Arc::new(FakeExtractor { fail: false });
    let (service, state) = build_service(
        root.clone(),
        Arc::clone(&downloader) as Arc<dyn HttpDownloader>,
        extractor,
    );

    let temp = root.join("downloads").join("game-1.0.0.zip");
    std::fs::create_dir_all(temp.parent().unwrap()).unwrap();
    std::fs::write(&temp, &payload).unwrap();
    state
        .save(&InstallState {
            version: None,
            download: Some(DownloadProgress {
                version: "1.0.0".into(),
                size: payload.len() as u64,
                bytes: payload.len() as u64,
            }),
            last_error: Some("extract failed".into()),
        })
        .unwrap();

    service
        .install(
            "https://example.test/game.zip",
            "1.0.0",
            &RecordingProgressSink::default(),
        )
        .unwrap();

    assert_eq!(*downloader.call_count.lock().unwrap(), 0);
    assert!(downloader.last_resume_from.lock().unwrap().is_none());
    assert_eq!(service.status().unwrap().phase, InstallPhase::Installed);
    assert!(!temp.exists());
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn download_progress_preserves_installed_version() {
    let root = temp_root("preserve-version");
    let blocker = Arc::new(BlockingDownloader {
        started: Mutex::new(None),
        release: Mutex::new(false),
    });
    let extractor = Arc::new(FakeExtractor { fail: false });
    let (service, state) = build_service(
        root.clone(),
        Arc::clone(&blocker) as Arc<dyn HttpDownloader>,
        extractor,
    );
    let service = Arc::new(service);

    // Seed an installed version, then start an update that blocks mid-download.
    state
        .save(&InstallState {
            version: Some("1.0.0".into()),
            download: None,
            last_error: None,
        })
        .unwrap();

    let service_clone = Arc::clone(&service);
    let handle = std::thread::spawn(move || {
        service_clone
            .install(
                "https://example.test/game.zip",
                "2.0.0",
                &RecordingProgressSink::default(),
            )
            .unwrap();
    });

    for _ in 0..50 {
        if blocker.started.lock().unwrap().is_some() {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    assert!(blocker.started.lock().unwrap().is_some());

    // Progress checkpoint from BlockingDownloader must not wipe version.
    let mid = state.load().unwrap();
    assert_eq!(mid.version.as_deref(), Some("1.0.0"));
    assert!(mid.download.is_some());

    *blocker.release.lock().unwrap() = true;
    handle.join().unwrap();
    assert_eq!(
        state.load().unwrap().version.as_deref(),
        Some("2.0.0")
    );
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn resume_mismatch_version_starts_from_zero() {
    let root = temp_root("resume-mismatch");
    let payload = b"abcdefghij".to_vec();
    let downloader = Arc::new(FakeDownloader::ok(payload.clone()));
    let extractor = Arc::new(FakeExtractor { fail: false });
    let (service, state) = build_service(
        root.clone(),
        Arc::clone(&downloader) as Arc<dyn HttpDownloader>,
        extractor,
    );

    let temp = root.join("downloads").join("game-2.0.0.zip");
    std::fs::create_dir_all(temp.parent().unwrap()).unwrap();
    std::fs::write(&temp, &payload[..4]).unwrap();
    state
        .save(&InstallState {
            version: None,
            download: Some(DownloadProgress {
                version: "1.0.0".into(),
                size: payload.len() as u64,
                bytes: 4,
            }),
            last_error: None,
        })
        .unwrap();

    service
        .install("https://example.test/game.zip", "2.0.0", &RecordingProgressSink::default())
        .unwrap();

    assert_eq!(*downloader.last_resume_from.lock().unwrap(), Some(0));
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn rejects_parallel_second_start() {
    let root = temp_root("double");
    let blocker = Arc::new(BlockingDownloader {
        started: Mutex::new(None),
        release: Mutex::new(false),
    });
    let extractor = Arc::new(FakeExtractor { fail: false });
    let (service, _) = build_service(
        root.clone(),
        Arc::clone(&blocker) as Arc<dyn HttpDownloader>,
        extractor,
    );
    let service = Arc::new(service);

    let service_clone = Arc::clone(&service);
    let handle = std::thread::spawn(move || {
        service_clone
            .install(
                "https://example.test/game.zip",
                "1.0.0",
                &RecordingProgressSink::default(),
            )
            .unwrap();
    });

    // Wait until first download starts.
    for _ in 0..50 {
        if blocker.started.lock().unwrap().is_some() {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    assert!(blocker.started.lock().unwrap().is_some());

    let err = service
        .install("https://example.test/game.zip", "1.0.0", &RecordingProgressSink::default())
        .unwrap_err();
    assert!(err.contains("already running"));

    *blocker.release.lock().unwrap() = true;
    handle.join().unwrap();
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn uninstall_removes_install_and_clears_state() {
    let root = temp_root("uninstall-ok");
    let downloader = Arc::new(FakeDownloader::ok(b"zip-bytes".to_vec()));
    let extractor = Arc::new(FakeExtractor { fail: false });
    let (service, state) = build_service(root.clone(), downloader, extractor);

    service
        .install(
            "https://example.test/game.zip",
            "1.0.0",
            &RecordingProgressSink::default(),
        )
        .unwrap();
    assert!(version_payload_exists(&root.join("game"), "1.0.0"));

    let status = service.uninstall().unwrap();
    assert_eq!(status.phase, InstallPhase::NotInstalled);
    assert!(status.local_version.is_none());
    assert!(!root.join("game").exists());
    assert_eq!(state.load().unwrap(), InstallState::default());
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn uninstall_rejected_while_download_running() {
    let root = temp_root("uninstall-busy");
    let blocker = Arc::new(BlockingDownloader {
        started: Mutex::new(None),
        release: Mutex::new(false),
    });
    let extractor = Arc::new(FakeExtractor { fail: false });
    let (service, _) = build_service(
        root.clone(),
        Arc::clone(&blocker) as Arc<dyn HttpDownloader>,
        extractor,
    );
    let service = Arc::new(service);

    let service_clone = Arc::clone(&service);
    let handle = std::thread::spawn(move || {
        service_clone
            .install(
                "https://example.test/game.zip",
                "1.0.0",
                &RecordingProgressSink::default(),
            )
            .unwrap();
    });

    for _ in 0..50 {
        if blocker.started.lock().unwrap().is_some() {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }

    let err = service.uninstall().unwrap_err();
    assert!(err.contains("cannot uninstall"));

    *blocker.release.lock().unwrap() = true;
    handle.join().unwrap();
    let _ = std::fs::remove_dir_all(root);
}

struct BlockingDownloader {
    started: Mutex<Option<()>>,
    release: Mutex<bool>,
}

impl HttpDownloader for BlockingDownloader {
    fn download(
        &self,
        _url: &str,
        dest: &Path,
        _resume_from: u64,
        _expected_total: Option<u64>,
        progress: &dyn ProgressSink,
    ) -> Result<u64, String> {
        *self.started.lock().unwrap() = Some(());
        // Emit an early checkpoint so RecordingAndForwardingSink persists mid-download.
        progress.on_progress(super::traits::ProgressUpdate {
            downloaded: 1,
            total: Some(4),
            percent: Some(25.0),
            phase: super::traits::ProgressPhase::Download,
        });
        loop {
            if *self.release.lock().unwrap() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(dest, b"done").unwrap();
        progress.on_progress(super::traits::ProgressUpdate {
            downloaded: 4,
            total: Some(4),
            percent: Some(100.0),
            phase: super::traits::ProgressPhase::Download,
        });
        Ok(4)
    }
}
