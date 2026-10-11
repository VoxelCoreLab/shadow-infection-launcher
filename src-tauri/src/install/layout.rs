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
/// Marks a version folder as created by the launcher. Cleanup and uninstall
/// only delete folders that carry it, so an install root shared with other
/// data (e.g. a user-picked `D:\Games`) never loses anything it doesn't own.
pub const VERSION_MARKER: &str = ".shadow-infection-version";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivePointer {
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionManifest {
    pub version: String,
    pub platform: String,
}

const MAX_VERSION_LEN: usize = 64;

/// A version is used verbatim as a folder and file name, so only allow a
/// plain segment: ASCII alphanumerics plus `.`, `_`, `-`, starting and ending
/// with an alphanumeric. This rules out `.`/`..`, separators, drive prefixes
/// and Windows' silently stripped trailing dots.
pub fn is_valid_version(version: &str) -> bool {
    let bytes = version.as_bytes();
    let (Some(first), Some(last)) = (bytes.first(), bytes.last()) else {
        return false;
    };
    bytes.len() <= MAX_VERSION_LEN
        && first.is_ascii_alphanumeric()
        && last.is_ascii_alphanumeric()
        && bytes
            .iter()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'))
}

pub fn validate_version(version: &str) -> Result<(), String> {
    if is_valid_version(version) {
        Ok(())
    } else {
        Err(format!("invalid game version {version:?}"))
    }
}

/// Callers must pass a version accepted by [`validate_version`].
pub fn version_dir(install_root: &Path, version: &str) -> PathBuf {
    install_root.join(version)
}

pub fn read_active_version(install_root: &Path) -> Option<String> {
    let path = install_root.join(ACTIVE_FILE);
    let raw = std::fs::read_to_string(path).ok()?;
    let pointer: ActivePointer = serde_json::from_str(&raw).ok()?;
    is_valid_version(&pointer.version).then_some(pointer.version)
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

pub fn write_version_marker(dir: &Path) -> Result<(), String> {
    let path = dir.join(VERSION_MARKER);
    std::fs::write(&path, b"").map_err(|e| format!("Cannot write {}: {e}", path.display()))
}

fn is_launcher_version_dir(path: &Path) -> bool {
    path.is_dir() && path.join(VERSION_MARKER).is_file()
}

/// Version folders in `install_root` that the launcher owns.
fn owned_version_dirs(install_root: &Path) -> Result<Vec<PathBuf>, String> {
    let entries = match std::fs::read_dir(install_root) {
        Ok(e) => e,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(format!("Cannot read install directory: {e}")),
    };
    Ok(entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| is_launcher_version_dir(path))
        .collect())
}

/// After a successful install of `keep_version`, remove other version folders
/// created by the launcher. Unmarked folders are never touched.
pub fn cleanup_old_installs(install_root: &Path, keep_version: &str) -> Result<(), String> {
    let keep_dir = version_dir(install_root, keep_version);
    for path in owned_version_dirs(install_root)? {
        if path != keep_dir {
            let _ = std::fs::remove_dir_all(&path);
        }
    }
    Ok(())
}

/// Remove every version folder the launcher owns plus `active.json`, then the
/// root itself only if nothing else is left in it.
pub fn remove_install(install_root: &Path) -> Result<(), String> {
    let mut dirs = owned_version_dirs(install_root)?;
    // Installs made before version markers existed: the active folder is ours.
    if let Some(active) = resolve_active_dir(install_root) {
        if !dirs.contains(&active) {
            dirs.push(active);
        }
    }
    for dir in dirs {
        std::fs::remove_dir_all(&dir)
            .map_err(|e| format!("Cannot remove {}: {e}", dir.display()))?;
    }

    let active_file = install_root.join(ACTIVE_FILE);
    if active_file.exists() {
        std::fs::remove_file(&active_file)
            .map_err(|e| format!("Cannot remove {}: {e}", active_file.display()))?;
    }

    // Fails when the folder still holds files we didn't create; keep them.
    let _ = std::fs::remove_dir(install_root);
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

/// `rel` as a path that can only descend: no absolute paths, drive prefixes
/// or `..`, so `launch.json` can't make the launcher run something outside
/// the game folder.
#[cfg(not(target_os = "macos"))]
fn contained_relative(rel: &str) -> Option<&Path> {
    use std::path::Component;

    let path = Path::new(rel);
    let mut components = path.components().peekable();
    components.peek()?;
    components
        .all(|c| matches!(c, Component::Normal(_)))
        .then_some(path)
}

#[cfg(not(target_os = "macos"))]
fn find_executable(dir: &Path) -> Option<PathBuf> {
    let manifest = dir.join("launch.json");
    if manifest.exists() {
        if let Ok(raw) = std::fs::read_to_string(&manifest) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&raw) {
                if let Some(rel) = json["executable"].as_str().and_then(contained_relative) {
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
        write_version_marker(&dir).unwrap();
        write_active(root, version).unwrap();
    }

    fn seed_foreign_data(root: &Path) -> (PathBuf, PathBuf) {
        let other_game = root.join("OtherGame");
        std::fs::create_dir_all(&other_game).unwrap();
        std::fs::write(other_game.join("save.dat"), b"precious").unwrap();
        let loose_file = root.join("notes.txt");
        std::fs::write(&loose_file, b"precious").unwrap();
        (other_game, loose_file)
    }

    #[test]
    fn accepts_plain_versions() {
        for v in ["1.2.3", "0.9.1-beta", "2024_10_build7", "v1"] {
            assert!(is_valid_version(v), "{v} should be valid");
        }
    }

    #[test]
    fn rejects_traversal_and_unsafe_versions() {
        for v in [
            "", ".", "..", "../x", "1.0/2", "1.0\\2", "C:x", "/abs", ".hidden", "1.0.", "1.0 ",
            " 1.0", "1.0\0", "ü1",
        ] {
            assert!(!is_valid_version(v), "{v:?} should be rejected");
        }
        assert!(!is_valid_version(&"1".repeat(MAX_VERSION_LEN + 1)));
    }

    #[cfg(not(target_os = "macos"))]
    #[test]
    fn launch_manifest_must_stay_inside_game_dir() {
        assert!(contained_relative("bin/Game.exe").is_some());
        for rel in ["", "../outside.exe", "bin/../../outside.exe", "/usr/bin/sh"] {
            assert!(
                contained_relative(rel).is_none(),
                "{rel:?} should be rejected"
            );
        }
        #[cfg(windows)]
        for rel in [
            r"C:\Windows\System32\cmd.exe",
            r"\\server\share\x.exe",
            r"..\x.exe",
        ] {
            assert!(
                contained_relative(rel).is_none(),
                "{rel:?} should be rejected"
            );
        }
    }

    #[cfg(not(target_os = "macos"))]
    #[test]
    fn find_executable_ignores_escaping_launch_manifest() {
        let root = temp_root("launch-escape");
        let game = root.join("game");
        std::fs::create_dir_all(&game).unwrap();
        std::fs::write(root.join("outside.exe"), b"evil").unwrap();
        std::fs::write(
            game.join("launch.json"),
            r#"{"executable":"../outside.exe"}"#,
        )
        .unwrap();
        assert_eq!(find_executable(&game), None);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn ignores_active_pointer_with_unsafe_version() {
        let root = temp_root("bad-active");
        std::fs::write(root.join(ACTIVE_FILE), r#"{"version":".."}"#).unwrap();
        assert_eq!(read_active_version(&root), None);
        assert_eq!(resolve_active_dir(&root), None);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn verified_version_round_trip() {
        let root = temp_root("ok");
        seed_version(&root, "1.2.3");
        assert_eq!(
            get_verified_installed_version(&root).as_deref(),
            Some("1.2.3")
        );
        assert_eq!(resolve_active_dir(&root), Some(version_dir(&root, "1.2.3")));
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

    #[test]
    fn cleanup_keeps_folders_not_created_by_launcher() {
        let root = temp_root("cleanup-foreign");
        let (other_game, loose_file) = seed_foreign_data(&root);
        seed_version(&root, "2.0.0");
        cleanup_old_installs(&root, "2.0.0").unwrap();
        assert!(other_game.join("save.dat").exists());
        assert!(loose_file.exists());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn remove_install_removes_root_when_only_launcher_files() {
        let root = temp_root("remove-own");
        seed_version(&root, "1.0.0");
        remove_install(&root).unwrap();
        assert!(!root.exists());
    }

    #[test]
    fn remove_install_spares_foreign_data_in_shared_root() {
        let root = temp_root("remove-shared");
        let (other_game, loose_file) = seed_foreign_data(&root);
        seed_version(&root, "1.0.0");
        remove_install(&root).unwrap();
        assert!(!version_dir(&root, "1.0.0").exists());
        assert!(!root.join(ACTIVE_FILE).exists());
        assert!(other_game.join("save.dat").exists());
        assert!(loose_file.exists());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn remove_install_handles_legacy_install_without_marker() {
        let root = temp_root("remove-legacy");
        seed_version(&root, "1.0.0");
        std::fs::remove_file(version_dir(&root, "1.0.0").join(VERSION_MARKER)).unwrap();
        remove_install(&root).unwrap();
        assert!(!root.exists());
    }
}
