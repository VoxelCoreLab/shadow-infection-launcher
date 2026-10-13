mod auth;
#[cfg(all(debug_assertions, target_os = "macos"))]
pub mod dev_bundle;
mod install;
#[cfg(target_os = "macos")]
mod url_scheme;

use tauri_plugin_deep_link::DeepLinkExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_deep_link::init())
        .manage(auth::commands::GoogleAuth::default())
        .setup(|app| {
            #[cfg(all(not(debug_assertions), target_os = "macos"))]
            {
                url_scheme::claim(app.config().identifier.as_str());
            }

            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            {
                app.deep_link().register_all()?;
            }

            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    auth::commands::handle_google_callback(&handle, url.as_str());
                }
            });

            if let Ok(Some(urls)) = app.deep_link().get_current() {
                for url in urls {
                    auth::commands::handle_google_callback(app.handle(), url.as_str());
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            auth::commands::store_refresh_token,
            auth::commands::refresh_session,
            auth::commands::clear_refresh_token,
            auth::commands::start_google_login,
            install::commands::get_settings,
            install::commands::save_settings,
            install::commands::get_default_install_path,
            install::commands::open_install_folder,
            install::commands::get_install_status,
            install::commands::start_install,
            install::commands::uninstall_game,
            install::commands::launch_game,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                restore_deep_link_handler(&app);
            }
        });
}

fn restore_deep_link_handler(app: &tauri::AppHandle) {
    #[cfg(all(debug_assertions, target_os = "macos"))]
    url_scheme::claim(app.config().identifier.as_str());
    #[cfg(not(all(debug_assertions, target_os = "macos")))]
    let _ = app;
}

#[cfg(test)]
mod tests {
    #[test]
    fn crate_metadata_matches_manifest() {
        assert_eq!(env!("CARGO_PKG_NAME"), "shadow-infection-launcher");
        assert!(!env!("CARGO_PKG_VERSION").is_empty());
    }
}
