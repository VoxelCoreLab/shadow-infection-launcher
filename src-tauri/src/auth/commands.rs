use super::vault::{KeyringVault, TokenVault};

#[tauri::command]
pub fn store_refresh_token(token: String) -> Result<(), String> {
    KeyringVault.store(&token)
}

#[tauri::command]
pub fn get_refresh_token() -> Result<Option<String>, String> {
    KeyringVault.get()
}

#[tauri::command]
pub fn clear_refresh_token() -> Result<(), String> {
    KeyringVault.clear()
}
