use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

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

        let staging = staging_dir(install_dir);
        let backup = backup_dir(install_dir);

        if staging.exists() {
            fs::remove_dir_all(&staging).map_err(|e| e.to_string())?;
        }
        if backup.exists() {
            fs::remove_dir_all(&backup).map_err(|e| e.to_string())?;
        }

        fs::create_dir_all(&staging).map_err(|e| e.to_string())?;
        extract_zip(archive, &staging, progress)?;

        if install_dir.exists() {
            fs::rename(install_dir, &backup).map_err(|e| e.to_string())?;
        }

        match fs::rename(&staging, install_dir) {
            Ok(()) => {
                if backup.exists() {
                    let _ = fs::remove_dir_all(&backup);
                }
                Ok(())
            }
            Err(err) => {
                let _ = fs::remove_dir_all(install_dir);
                if backup.exists() {
                    let _ = fs::rename(&backup, install_dir);
                }
                Err(err.to_string())
            }
        }
    }
}

pub(crate) fn staging_dir(install_dir: &Path) -> PathBuf {
    let name = install_dir
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("game");
    install_dir
        .parent()
        .unwrap_or(Path::new("."))
        .join(format!(".{name}.staging"))
}

pub(crate) fn backup_dir(install_dir: &Path) -> PathBuf {
    let name = install_dir
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("game");
    install_dir
        .parent()
        .unwrap_or(Path::new("."))
        .join(format!(".{name}.backup"))
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

        if entry.name().ends_with('/') {
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
        }
    }

    emit(total_uncompressed.max(extracted));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::install::traits::ProgressSink;
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
        assert!(!staging_dir(&install).exists());
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
        assert!(!install.exists());
        let _ = fs::remove_dir_all(root);
    }
}
