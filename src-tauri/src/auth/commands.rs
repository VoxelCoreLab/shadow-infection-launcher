use super::session::{exchange_refresh_token, refresh_stored_session, RefreshedSession, TRANSIENT};
use super::vault::{KeyringVault, TokenVault};

#[tauri::command]
pub fn store_refresh_token(token: String) -> Result<(), String> {
    KeyringVault.store(&token)
}

/// Returns a fresh ID token for the stored session. The refresh token itself
/// is never returned to the webview.
#[tauri::command]
pub async fn refresh_session(api_key: String) -> Result<Option<RefreshedSession>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        refresh_stored_session(&KeyringVault, |refresh_token| {
            exchange_refresh_token(&api_key, refresh_token)
        })
    })
    .await
    .map_err(|_| TRANSIENT.to_string())?
}

#[tauri::command]
pub fn clear_refresh_token() -> Result<(), String> {
    KeyringVault.clear()
}
