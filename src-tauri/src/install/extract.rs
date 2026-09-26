use std::fs;
use std::io::{Read, Write};
use std::path::Path;

use zip::ZipArchive;

use super::traits::{ArchiveExtractor, ProgressPhase, ProgressSink, ProgressUpdate};

pub struct ZipExtractor;

impl ArchiveExtractor for ZipExtractor {
    fn extract_and_swap(
        &self,
        archive: &Path,
        install_dir: &Path,
        progress: &dyn ProgressSink,
    ) -> Result<(), String> {
        let parent = install_dir
            .parent()
            .ok_or_else(|| "install path has no parent directory".to_string())?;
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;

        // Wipe the version target dir, then extract straight into it.
        // Never rename a directory full of freshly written .exe/.dll — on
        // Windows that fails with OS error 5 when Defender/Cursor hold a
        // handle on the folder.
        reset_dir(install_dir)?;
        extract_zip(archive, install_dir, progress)?;
        Ok(())
    }
}

/// Wipe `dir` if it exists, then recreate it empty.
fn reset_dir(dir: &Path) -> Result<(), String> {
    if dir.exists() {
        remove_dir_all_robust(dir)
            .map_err(|e| format!("Cannot clear {}: {e}", dir.display()))?;
    }
    fs::create_dir_all(dir).map_err(|e| format!("Cannot create {}: {e}", dir.display()))
}

fn clear_readonly(path: &Path) {
    if let Ok(metadata) = fs::metadata(path) {
        let mut perms = metadata.permissions();
        if perms.readonly() {
            perms.set_readonly(false);
            let _ = fs::set_permissions(path, perms);
        }
    }
}

fn clear_readonly_tree(path: &Path) {
    clear_readonly(path);
    let Ok(entries) = fs::read_dir(path) else {
        return;
    };
    for entry in entries.flatten() {
        let child = entry.path();
        if child.is_dir() {
            clear_readonly_tree(&child);
        } else {
            clear_readonly(&child);
        }
    }
}

fn remove_dir_all_robust(path: &Path) -> std::io::Result<()> {
    clear_readonly_tree(path);

    #[cfg(not(windows))]
    {
        fs::remove_dir_all(path)
    }

    #[cfg(windows)]
    {
        use std::thread;
        use std::time::{Duration, Instant};

        let deadline = Instant::now() + Duration::from_secs(3);
        let mut delay = Duration::from_millis(50);
        loop {
            match fs::remove_dir_all(path) {
                Ok(()) => return Ok(()),
                Err(_) if !path.exists() => return Ok(()),
                Err(e)
                    if matches!(e.raw_os_error(), Some(5) | Some(32))
                        && Instant::now() < deadline =>
                {
                    clear_readonly_tree(path);
                    thread::sleep(delay);
                    delay = (delay * 2).min(Duration::from_millis(400));
                }
                Err(e) => return Err(e),
            }
        }
    }
}

/// Restore zip-stored Unix permissions (execute bits for game binaries).
/// No-op on Windows and when the entry has no Unix mode metadata.
fn apply_unix_mode(path: &Path, mode: Option<u32>) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Some(mode) = mode {
            let _ = fs::set_permissions(path, fs::Permissions::from_mode(mode));
        }
    }
    #[cfg(not(unix))]
    {
        let _ = (path, mode);
    }
}

fn extract_zip(archive: &Path, dest: &Path, progress: &dyn ProgressSink) -> Result<(), String> {
    let file = fs::File::open(archive).map_err(|e| e.to_string())?;
    let mut zip = ZipArchive::new(file).map_err(|e| format!("invalid zip archive: {e}"))?;

    let entry_count = zip.len();
    let mut total_uncompressed: u64 = 0;
    for i in 0..entry_count {
        let entry = zip.by_index(i).map_err(|e| e.to_string())?;
        total_uncompressed += entry.size();
    }

    let report_interval = if total_uncompressed > 0 {
        (total_uncompressed / 200).max(64 * 1024)
    } else {
        u64::MAX
    };

    let emit = |extracted: u64| {
        let percent = if total_uncompressed > 0 {
            Some((extracted as f64 / total_uncompressed as f64 * 100.0).min(100.0))
        } else {
            Some(100.0)
        };
        progress.on_progress(ProgressUpdate {
            downloaded: extracted,
            total: Some(total_uncompressed),
            percent,
            phase: ProgressPhase::Extract,
        });
    };

    emit(0);

    let mut extracted: u64 = 0;
    let mut last_reported: u64 = 0;
    let mut buffer = [0u8; 64 * 1024];

    for i in 0..entry_count {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let out_path = match entry.enclosed_name() {
            Some(path) => dest.join(path),
            None => continue,
        };

        if entry.is_dir() || entry.name().ends_with('/') {
            fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut outfile = fs::File::create(&out_path).map_err(|e| e.to_string())?;
            loop {
                let n = entry.read(&mut buffer).map_err(|e| e.to_string())?;
                if n == 0 {
                    break;
                }
                outfile.write_all(&buffer[..n]).map_err(|e| e.to_string())?;
                extracted += n as u64;
                if extracted - last_reported >= report_interval {
                    emit(extracted);
                    last_reported = extracted;
                }
            }
            // Close before chmod so mode sticks on the finished file.
            drop(outfile);
            apply_unix_mode(&out_path, entry.unix_mode());
        }
    }

    emit(total_uncompressed.max(extracted));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::install::traits::ProgressSink;
    use std::path::PathBuf;
    use std::sync::Mutex;
    use std::time::{SystemTime, UNIX_EPOCH};
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    struct NoopSink;

    impl ProgressSink for NoopSink {
        fn on_progress(&self, _update: ProgressUpdate) {}
    }

    struct RecordingSink {
        updates: Mutex<Vec<ProgressUpdate>>,
    }

    impl ProgressSink for RecordingSink {
        fn on_progress(&self, update: ProgressUpdate) {
            self.updates.lock().unwrap().push(update);
        }
    }

    fn temp_dir(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("sil-extract-{label}-{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_zip(path: &Path, files: &[(&str, &[u8])]) {
        let file = fs::File::create(path).unwrap();
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);
        for (name, data) in files {
            zip.start_file(*name, options).unwrap();
            zip.write_all(data).unwrap();
        }
        zip.finish().unwrap();
    }

    #[test]
    fn extracts_and_swaps_into_install_dir() {
        let root = temp_dir("ok");
        let archive = root.join("game.zip");
        let install = root.join("game");
        write_zip(&archive, &[("hello.txt", b"hello")]);

        ZipExtractor
            .extract_and_swap(&archive, &install, &NoopSink)
            .unwrap();

        let content = fs::read_to_string(install.join("hello.txt")).unwrap();
        assert_eq!(content, "hello");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn replaces_existing_install_dir() {
        let root = temp_dir("replace");
        let archive = root.join("game.zip");
        let install = root.join("game");
        fs::create_dir_all(&install).unwrap();
        fs::write(install.join("old.txt"), b"stale").unwrap();
        write_zip(&archive, &[("hello.txt", b"hello")]);

        ZipExtractor
            .extract_and_swap(&archive, &install, &NoopSink)
            .unwrap();

        assert!(install.join("hello.txt").exists());
        assert!(!install.join("old.txt").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn emits_extract_progress() {
        let root = temp_dir("progress");
        let archive = root.join("game.zip");
        let install = root.join("game");
        write_zip(&archive, &[("a.txt", b"aaaa"), ("b.txt", b"bbbb")]);
        let sink = RecordingSink {
            updates: Mutex::new(Vec::new()),
        };

        ZipExtractor
            .extract_and_swap(&archive, &install, &sink)
            .unwrap();

        let updates = sink.updates.lock().unwrap();
        assert!(!updates.is_empty());
        assert!(updates.iter().all(|u| u.phase == ProgressPhase::Extract));
        assert!(
            updates
                .last()
                .and_then(|u| u.percent)
                .is_some_and(|p| (p - 100.0).abs() < f64::EPSILON)
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_invalid_zip() {
        let root = temp_dir("bad");
        let archive = root.join("bad.zip");
        let install = root.join("game");
        fs::write(&archive, b"not-a-zip").unwrap();

        let err = ZipExtractor
            .extract_and_swap(&archive, &install, &NoopSink)
            .unwrap_err();
        assert!(err.contains("invalid zip"));
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn restores_executable_unix_mode() {
        use std::os::unix::fs::PermissionsExt;

        let root = temp_dir("unix-mode");
        let archive = root.join("game.zip");
        let install = root.join("game");

        let file = fs::File::create(&archive).unwrap();
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored)
            .unix_permissions(0o755);
        zip.start_file("bin/game", options).unwrap();
        zip.write_all(b"#!/bin/sh\necho ok\n").unwrap();
        zip.finish().unwrap();

        ZipExtractor
            .extract_and_swap(&archive, &install, &NoopSink)
            .unwrap();

        let mode = fs::metadata(install.join("bin/game"))
            .unwrap()
            .permissions()
            .mode();
        assert_ne!(
            mode & 0o111,
            0,
            "extracted binary must keep execute bits, got mode {mode:#o}"
        );
        let _ = fs::remove_dir_all(root);
    }
}
