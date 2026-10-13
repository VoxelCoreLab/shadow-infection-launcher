mod auth;
#[cfg(all(debug_assertions, target_os = "macos"))]
pub mod dev_bundle;
mod install;
#[cfg(target_os = "macos")]
mod url_scheme;

use tauri_plugin_deep_link::DeepLinkExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Windows and Linux open a deep link by starting another process. This
    // plugin has to be first so that process exits and the URL is delivered
    // to the launcher that is already open.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            focus_running_launcher(app);
        }));
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_deep_link::init())
        .manage(auth::commands::GoogleAuth::default())
        .setup(|app| {
            #[cfg(all(not(debug_assertions), target_os = "macos"))]
            {
                url_scheme::claim(app.config().identifier.as_str());
            }

            // A dev run saves the handler under HKCU, and that overrides the
            // installer's entry. Claim the scheme for this executable on every
            // launch so the deep link reaches the launcher that is open.
            #[cfg(any(target_os = "linux", windows))]
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

#[cfg(desktop)]
fn focus_running_launcher(app: &tauri::AppHandle) {
    use tauri::Manager;

    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
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
