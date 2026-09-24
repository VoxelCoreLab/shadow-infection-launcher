mod auth;
mod install;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            auth::commands::store_refresh_token,
            auth::commands::get_refresh_token,
            auth::commands::clear_refresh_token,
            install::commands::get_settings,
            install::commands::save_settings,
            install::commands::get_default_install_path,
            install::commands::open_install_folder,
            install::commands::get_install_status,
            install::commands::start_install,
            install::commands::uninstall_game,
        ])
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
