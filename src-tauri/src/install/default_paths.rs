use std::path::PathBuf;

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
        .map(|repo| repo.join("tmp").join("ShadowInfection"))
        .unwrap_or_else(|| manifest_dir.join("tmp").join("ShadowInfection"))
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

    base.join("ShadowInfection")
}

#[cfg(test)]
mod tests {
    use super::*;

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
            path.parent().and_then(|p| p.file_name()).and_then(|s| s.to_str()),
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
