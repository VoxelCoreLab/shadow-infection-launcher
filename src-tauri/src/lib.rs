#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    #[test]
    fn crate_metadata_matches_manifest() {
        assert_eq!(env!("CARGO_PKG_NAME"), "shadow-infection-launcher");
        assert!(!env!("CARGO_PKG_VERSION").is_empty());
    }
}
