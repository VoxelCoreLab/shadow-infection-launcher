use std::path::{Path, PathBuf};

/// Leaf folder the game always lives in, so a picked parent like `D:\Games`
/// is never used as the install root itself.
pub const INSTALL_DIR_NAME: &str = "ShadowInfection";

/// `path` if it already is a `ShadowInfection` folder, else that subfolder.
pub fn dedicated_install_dir(path: &Path) -> PathBuf {
    let is_dedicated = path
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.eq_ignore_ascii_case(INSTALL_DIR_NAME));
    if is_dedicated {
        path.to_path_buf()
    } else {
        path.join(INSTALL_DIR_NAME)
    }
}

/// Default directory for the **game** install (not launcher settings).
///
/// - Debug (`tauri dev`): `<repo>/tmp/ShadowInfection` — easy to inspect, gitignored
/// - Release: OS application data directory + `ShadowInfection`
pub fn default_install_dir() -> PathBuf {
    default_install_dir_inner()
}

pub fn default_install_path_string() -> String {
    default_install_dir().to_string_lossy().into_owned()
}

#[cfg(debug_assertions)]
fn default_install_dir_inner() -> PathBuf {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")); // …/src-tauri
    manifest_dir
        .parent()
        .map(|repo| repo.join("tmp").join(INSTALL_DIR_NAME))
        .unwrap_or_else(|| manifest_dir.join("tmp").join(INSTALL_DIR_NAME))
}

#[cfg(not(debug_assertions))]
fn default_install_dir_inner() -> PathBuf {
    #[cfg(target_os = "windows")]
    let base = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("C:\\Games"));

    #[cfg(target_os = "macos")]
    let base = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/"))
        .join("Library/Application Support");

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let base = dirs::data_local_dir()
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_else(|| PathBuf::from("/home")));

    base.join(INSTALL_DIR_NAME)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dedicated_dir_appends_subfolder_to_shared_parent() {
        let picked = PathBuf::from("games");
        assert_eq!(
            dedicated_install_dir(&picked),
            picked.join(INSTALL_DIR_NAME)
        );
    }

    #[test]
    fn dedicated_dir_keeps_existing_game_folder() {
        let picked = PathBuf::from("games").join("shadowinfection");
        assert_eq!(dedicated_install_dir(&picked), picked);
    }

    #[test]
    #[cfg(debug_assertions)]
    fn debug_default_is_repo_tmp_shadow_infection() {
        let path = default_install_dir();
        let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("src-tauri has a parent")
            .to_path_buf();
        assert_eq!(path, repo.join("tmp").join("ShadowInfection"));
        assert_eq!(
            path.file_name().and_then(|s| s.to_str()),
            Some("ShadowInfection")
        );
        assert_eq!(
            path.parent()
                .and_then(|p| p.file_name())
                .and_then(|s| s.to_str()),
            Some("tmp")
        );
    }

    #[test]
    #[cfg(not(debug_assertions))]
    fn release_default_ends_with_shadow_infection() {
        let path = default_install_dir();
        assert_eq!(
            path.file_name().and_then(|s| s.to_str()),
            Some("ShadowInfection")
        );
    }
}
