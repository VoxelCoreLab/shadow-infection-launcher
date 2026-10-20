use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::Path;

use super::traits::{HttpDownloader, ProgressPhase, ProgressSink, ProgressUpdate};

pub struct ReqwestDownloader {
    client: reqwest::blocking::Client,
}

const MAX_REDIRECTS: usize = 5;

impl ReqwestDownloader {
    pub fn new() -> Result<Self, String> {
        // Redirects must stay on HTTPS too, or a hop could downgrade the
        // download of an executable to plain HTTP.
        let redirects = reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= MAX_REDIRECTS {
                attempt.error("too many redirects")
            } else if attempt.url().scheme() != "https" {
                attempt.error("redirect to a non-HTTPS URL refused")
            } else {
                attempt.follow()
            }
        });
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(60 * 30))
            .https_only(true)
            .redirect(redirects)
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Self { client })
    }
}

/// Game builds are executed after install, so only accept plain HTTPS URLs
/// without embedded credentials.
pub fn validate_download_url(raw: &str) -> Result<(), String> {
    let url = reqwest::Url::parse(raw).map_err(|_| "invalid download url".to_string())?;
    if url.scheme() != "https" {
        return Err("download url must use https".into());
    }
    if url.host_str().is_none_or(str::is_empty) {
        return Err("download url has no host".into());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("download url must not contain credentials".into());
    }
    Ok(())
}

fn download_percent(downloaded: u64, total: Option<u64>) -> Option<f64> {
    total.map(|t| {
        if t == 0 {
            0.0
        } else {
            (downloaded as f64 / t as f64 * 100.0).min(100.0)
        }
    })
}

impl HttpDownloader for ReqwestDownloader {
    fn download(
        &self,
        url: &str,
        dest: &Path,
        resume_from: u64,
        expected_total: Option<u64>,
        progress: &dyn ProgressSink,
    ) -> Result<u64, String> {
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        let mut request = self.client.get(url);
        if resume_from > 0 {
            request = request.header(reqwest::header::RANGE, format!("bytes={resume_from}-"));
        }

        let mut response = request.send().map_err(|e| e.to_string())?;
        let status = response.status();
        if !(status.is_success() || status.as_u16() == 206) {
            return Err(format!("download failed with status {status}"));
        }

        let content_length = response.content_length();
        let total = match (expected_total, content_length, resume_from, status.as_u16()) {
            (Some(t), _, _, _) => Some(t),
            (None, Some(len), 0, _) => Some(len),
            (None, Some(len), offset, 206) => Some(offset + len),
            (None, Some(len), _, _) => Some(len),
            _ => None,
        };

        let append = resume_from > 0 && status.as_u16() == 206;
        let mut file = if append {
            fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(dest)
                .map_err(|e| e.to_string())?
        } else {
            if dest.exists() && resume_from == 0 {
                fs::remove_file(dest).map_err(|e| e.to_string())?;
            }
            File::create(dest).map_err(|e| e.to_string())?
        };

        let report_interval = match total {
            Some(t) if t > 0 => (t / 200).max(64 * 1024),
            _ => 512 * 1024,
        };

        let mut downloaded = if append { resume_from } else { 0 };
        let mut last_reported = downloaded;
        let mut buffer = [0u8; 64 * 1024];

        let emit = |downloaded: u64| {
            progress.on_progress(ProgressUpdate {
                downloaded,
                total,
                percent: download_percent(downloaded, total),
                phase: ProgressPhase::Download,
            });
        };

        // Start this phase at the current offset (0 on a fresh download).
        emit(downloaded);

        loop {
            let n = response.read(&mut buffer).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            file.write_all(&buffer[..n]).map_err(|e| e.to_string())?;
            downloaded += n as u64;
            if downloaded - last_reported >= report_interval {
                emit(downloaded);
                last_reported = downloaded;
            }
        }

        emit(downloaded);
        file.flush().map_err(|e| e.to_string())?;

        if let Some(expected) = total {
            if downloaded != expected {
                return Err(format!(
                    "content length mismatch: expected {expected} bytes, got {downloaded}"
                ));
            }
        }

        if downloaded == 0 {
            return Err("download produced an empty file".into());
        }

        Ok(downloaded)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_https_presigned_url() {
        assert!(validate_download_url(
            "https://storage.example.com/builds/game.zip?X-Amz-Signature=abc"
        )
        .is_ok());
    }

    #[test]
    fn rejects_non_https_and_odd_urls() {
        for url in [
            "http://storage.example.com/game.zip",
            "file:///C:/Windows/System32/calc.exe",
            "ftp://example.com/game.zip",
            "https://user:pass@example.com/game.zip",
            "not a url",
            "",
        ] {
            assert!(
                validate_download_url(url).is_err(),
                "{url} should be rejected"
            );
        }
    }
}
