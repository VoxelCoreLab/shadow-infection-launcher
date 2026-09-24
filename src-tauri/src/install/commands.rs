use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

use super::default_paths::{default_install_dir, default_install_path_string};
use super::download::ReqwestDownloader;
use super::extract::ZipExtractor;
use super::paths::SettingsPathProvider;
use super::progress::TauriProgressSink;
use super::service::InstallService;
use super::settings::{validate_settings, FileSettingsStore};
use super::state::FileInstallStateStore;
use super::traits::{
    ArchiveExtractor, HttpDownloader, InstallStateStore, InstallStatusDto, LauncherSettings,
    PathProvider, SettingsStore,
};

struct InstallRuntime {
    settings: Arc<dyn SettingsStore>,
    paths: Arc<dyn PathProvider>,
    service: Arc<InstallService>,
}

static RUNTIME: OnceLock<Mutex<Option<InstallRuntime>>> = OnceLock::new();

fn runtime_slot() -> &'static Mutex<Option<InstallRuntime>> {
    RUNTIME.get_or_init(|| Mutex::new(None))
}

/// Launcher metadata (`settings.json`, install state, temp downloads) live in
/// Tauri `app_data_dir`. The default **game** install path is separate (dev tmp
/// vs release OS data dir).
fn default_paths(app: &AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let data_root = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let default_install = default_install_dir();
    Ok((data_root, default_install))
}

fn ensure_runtime(app: &AppHandle) -> Result<(), String> {
    let mut guard = runtime_slot().lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Ok(());
    }
    let (data_root, default_install) = default_paths(app)?;
    std::fs::create_dir_all(&data_root).map_err(|e| e.to_string())?;

    let settings: Arc<dyn SettingsStore> =
        Arc::new(FileSettingsStore::new(&data_root, &default_install));
    let paths: Arc<dyn PathProvider> =
        Arc::new(SettingsPathProvider::new(Arc::clone(&settings), &default_install));
    let state_store: Arc<dyn InstallStateStore> =
        Arc::new(FileInstallStateStore::new(&data_root));
    let downloader: Arc<dyn HttpDownloader> = Arc::new(ReqwestDownloader::new()?);
    let extractor: Arc<dyn ArchiveExtractor> = Arc::new(ZipExtractor);
    let service = Arc::new(InstallService::new(
        Arc::clone(&paths),
        state_store,
        downloader,
        extractor,
        data_root,
    ));

    *guard = Some(InstallRuntime {
        settings,
        paths,
        service,
    });
    Ok(())
}

fn with_runtime<T>(
    app: &AppHandle,
    f: impl FnOnce(&InstallRuntime) -> Result<T, String>,
) -> Result<T, String> {
    ensure_runtime(app)?;
    let guard = runtime_slot().lock().map_err(|e| e.to_string())?;
    let runtime = guard
        .as_ref()
        .ok_or_else(|| "install runtime not initialized".to_string())?;
    f(runtime)
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<LauncherSettings, String> {
    with_runtime(&app, |rt| rt.settings.load())
}

#[tauri::command]
pub fn get_default_install_path() -> String {
    default_install_path_string()
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: LauncherSettings) -> Result<LauncherSettings, String> {
    with_runtime(&app, |rt| {
        if rt.service.is_busy()? {
            return Err("cannot change settings while an installation is running".into());
        }

        let mut normalized = settings;
        normalized.install_path = normalized.install_path.trim().to_string();
        validate_settings(&normalized)?;

        let current = rt.settings.load()?;
        if current.install_path.trim() != normalized.install_path {
            let state = rt.service.install_state()?;
            if state.version.is_some() || state.download.is_some() {
                return Err(
                    "uninstall the game (or cancel the download) before changing the install path"
                        .into(),
                );
            }
        }

        rt.settings.save(&normalized)?;
        rt.settings.load()
    })
}

#[tauri::command]
pub fn open_install_folder(app: AppHandle) -> Result<(), String> {
    with_runtime(&app, |rt| {
        let path = rt.paths.install_path()?;
        if !path.exists() {
            std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
        }
        app.opener()
            .open_path(path.display().to_string(), None::<&str>)
            .map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub fn get_install_status(app: AppHandle) -> Result<InstallStatusDto, String> {
    with_runtime(&app, |rt| rt.service.status())
}

#[tauri::command]
pub async fn start_install(
    app: AppHandle,
    url: String,
    version: String,
) -> Result<InstallStatusDto, String> {
    if url.trim().is_empty() {
        return Err("download url must not be empty".into());
    }
    if version.trim().is_empty() {
        return Err("version must not be empty".into());
    }

    ensure_runtime(&app)?;
    let service = {
        let guard = runtime_slot().lock().map_err(|e| e.to_string())?;
        Arc::clone(
            &guard
                .as_ref()
                .ok_or_else(|| "install runtime not initialized".to_string())?
                .service,
        )
    };

    let url = url.trim().to_string();
    let version = version.trim().to_string();
    let progress = TauriProgressSink::new(app);

    tauri::async_runtime::spawn_blocking(move || service.install(&url, &version, &progress))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn uninstall_game(app: AppHandle) -> Result<InstallStatusDto, String> {
    with_runtime(&app, |rt| rt.service.uninstall())
}
