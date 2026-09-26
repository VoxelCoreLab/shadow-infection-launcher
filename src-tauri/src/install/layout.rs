//! Versioned install layout.
//!
//! ```text
//! {install_root}/
//!   active.json          # {"version":"1.2.3"} — which build is live
//!   1.2.3/
//!     version.json
//!     Shadow Infection.exe
//!     Shadow Infection_Data/
//! ```
//!
//! New builds extract into `{root}/{version}/` without touching the previous
//! version folder. `active.json` flips only after a successful extract+verify,
//! so a failed update leaves the old game playable.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub const ACTIVE_FILE: &str = "active.json";
pub const VERSION_FILE: &str = "version.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivePointer {
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionManifest {
    pub version: String,
    pub platform: String,
}

/// Make a release version safe as a single path segment.
pub fn sanitize_version(version: &str) -> String {
    let cleaned: String = version
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c => c,
        })
        .collect();
    if cleaned.is_empty() {
        "unknown".into()
    } else {
        cleaned
    }
}

pub fn version_dir(install_root: &Path, version: &str) -> PathBuf {
    install_root.join(sanitize_version(version))
}

pub fn read_active_version(install_root: &Path) -> Option<String> {
    let path = install_root.join(ACTIVE_FILE);
    let raw = std::fs::read_to_string(path).ok()?;
    let pointer: ActivePointer = serde_json::from_str(&raw).ok()?;
    if pointer.version.is_empty() {
        None
    } else {
        Some(pointer.version)
    }
}

pub fn write_active(install_root: &Path, version: &str) -> Result<(), String> {
    let pointer = ActivePointer {
        version: version.to_owned(),
    };
    let path = install_root.join(ACTIVE_FILE);
    let json = serde_json::to_string_pretty(&pointer)
        .map_err(|e| format!("Cannot serialize active pointer: {e}"))?;
    std::fs::write(&path, json).map_err(|e| format!("Cannot write {}: {e}", path.display()))
}

pub fn write_version_manifest(dir: &Path, version: &str) -> Result<(), String> {
    let info = VersionManifest {
        version: version.to_owned(),
        platform: current_platform().to_owned(),
    };
    let path = dir.join(VERSION_FILE);
    let json = serde_json::to_string_pretty(&info)
        .map_err(|e| format!("Cannot serialize version: {e}"))?;
    std::fs::write(&path, json).map_err(|e| format!("Cannot write {}: {e}", path.display()))
}

pub fn read_version_manifest(dir: &Path) -> Option<String> {
    let path = dir.join(VERSION_FILE);
    let raw = std::fs::read_to_string(path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&raw).ok()?;
    json["version"].as_str().map(|s| s.to_owned())
}

fn current_platform() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    }
}

/// Directory that contains the live game build, if any (`active.json` → version folder).
pub fn resolve_active_dir(install_root: &Path) -> Option<PathBuf> {
    let version = read_active_version(install_root)?;
    let dir = version_dir(install_root, &version);
    dir.is_dir().then_some(dir)
}

/// Find the executable / app we would launch from `game_dir`.
pub fn find_launch_target(game_dir: &Path) -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        find_app_bundle(game_dir)
    }
    #[cfg(not(target_os = "macos"))]
    {
        find_executable(game_dir)
    }
}

/// Directory that should hold `version.json` for the launch target.
pub fn manifest_dir_for_target(target: &Path) -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        target
            .parent()
            .map(Path::to_owned)
            .unwrap_or_else(|| target.to_owned())
    }
    #[cfg(not(target_os = "macos"))]
    {
        target
            .parent()
            .map(Path::to_owned)
            .unwrap_or_else(|| target.to_owned())
    }
}

/// Confirm game files exist and version.json next to the launch target matches
/// `expected_version`.
pub fn verify_install(game_dir: &Path, expected_version: &str) -> Result<(), String> {
    let target = find_launch_target(game_dir).ok_or_else(|| {
        "Game executable not found after extract. Installation is incomplete.".to_owned()
    })?;

    let manifest_dir = manifest_dir_for_target(&target);
    let installed = read_version_manifest(&manifest_dir).ok_or_else(|| {
        format!(
            "Missing {} next to launched game at {}",
            VERSION_FILE,
            manifest_dir.display()
        )
    })?;

    if installed != expected_version {
        return Err(format!(
            "Version mismatch after extract: expected {expected_version}, found {installed}"
        ));
    }

    Ok(())
}

/// Verified active version, or None if not installed / broken.
pub fn get_verified_installed_version(install_root: &Path) -> Option<String> {
    let version = read_active_version(install_root)?;
    let game_dir = version_dir(install_root, &version);
    verify_install(&game_dir, &version).ok()?;
    Some(version)
}

/// After a successful install of `keep_version`, remove other version folders.
pub fn cleanup_old_installs(install_root: &Path, keep_version: &str) -> Result<(), String> {
    let keep_name = sanitize_version(keep_version);
    let keep_dir = install_root.join(&keep_name);

    let entries = match std::fs::read_dir(install_root) {
        Ok(e) => e,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(format!("Cannot read install directory: {e}")),
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();

        if path == keep_dir || name == ACTIVE_FILE {
            continue;
        }
        if path.is_dir() {
            let _ = std::fs::remove_dir_all(&path);
        }
    }

    Ok(())
}

#[cfg(target_os = "macos")]
fn find_app_bundle(dir: &Path) -> Option<PathBuf> {
    if dir.extension().is_some_and(|e| e == "app") {
        return Some(dir.to_owned());
    }

    for name in ["Shadow Infection.app", "ShadowInfection.app"] {
        let known = dir.join(name);
        if known.exists() {
            return Some(known);
        }
    }

    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && path.extension().is_some_and(|e| e == "app") {
                return Some(path);
            }
        }
    }

    None
}

#[cfg(not(target_os = "macos"))]
fn find_executable(dir: &Path) -> Option<PathBuf> {
    let manifest = dir.join("launch.json");
    if manifest.exists() {
        if let Ok(raw) = std::fs::read_to_string(&manifest) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&raw) {
                if let Some(rel) = json["executable"].as_str() {
                    let candidate = dir.join(rel);
                    if candidate.exists() {
                        return Some(candidate);
                    }
                }
            }
        }
    }

    let names: &[&str] = if cfg!(target_os = "windows") {
        &[
            "Shadow Infection.exe",
            "ShadowInfection.exe",
            "shadow-infection.exe",
            "ShadowInfection/ShadowInfection.exe",
            "Shadow Infection/Shadow Infection.exe",
        ]
    } else {
        &[
            "Shadow Infection.x86_64",
            "ShadowInfection.x86_64",
            "Shadow Infection",
            "ShadowInfection",
            "shadow-infection",
        ]
    };

    for name in names {
        let candidate = dir.join(name);
        if candidate.exists() {
            return Some(candidate);
        }
    }

    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            for name in names {
                if name.contains('/') || name.contains('\\') {
                    continue;
                }
                let candidate = path.join(name);
                if candidate.exists() {
                    return Some(candidate);
                }
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_root(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("sil-layout-{label}-{nanos}"));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn seed_version(root: &Path, version: &str) {
        let dir = version_dir(root, version);
        std::fs::create_dir_all(&dir).unwrap();
        #[cfg(target_os = "windows")]
        std::fs::write(dir.join("Shadow Infection.exe"), b"game").unwrap();
        #[cfg(target_os = "macos")]
        {
            let app = dir.join("Shadow Infection.app");
            std::fs::create_dir_all(&app).unwrap();
        }
        #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
        std::fs::write(dir.join("ShadowInfection.x86_64"), b"game").unwrap();
        write_version_manifest(&dir, version).unwrap();
        write_active(root, version).unwrap();
    }

    #[test]
    fn sanitize_replaces_path_separators() {
        assert_eq!(sanitize_version("1.0/2"), "1.0_2");
        assert_eq!(sanitize_version(""), "unknown");
    }

    #[test]
    fn verified_version_round_trip() {
        let root = temp_root("ok");
        seed_version(&root, "1.2.3");
        assert_eq!(
            get_verified_installed_version(&root).as_deref(),
            Some("1.2.3")
        );
        assert_eq!(
            resolve_active_dir(&root),
            Some(version_dir(&root, "1.2.3"))
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn cleanup_removes_other_versions_keeps_active() {
        let root = temp_root("cleanup");
        seed_version(&root, "1.0.0");
        seed_version(&root, "2.0.0");
        write_active(&root, "2.0.0").unwrap();
        cleanup_old_installs(&root, "2.0.0").unwrap();
        assert!(version_dir(&root, "2.0.0").is_dir());
        assert!(!version_dir(&root, "1.0.0").exists());
        let _ = std::fs::remove_dir_all(root);
    }
}
