use std::sync::Mutex;
use std::time::{Duration, SystemTime};

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_opener::OpenerExt;

use super::google::{
    authorize_url, interpret_session_response, parse_callback, prepare_login, shop_api_base,
    take_pending, CallbackError, CallbackQuery, IdTokenPoll, PendingLogin, SIGN_IN_FAILED,
    SIGN_IN_TIMEOUT, SIGN_IN_TOO_MANY,
};
use super::session::{exchange_refresh_token, refresh_stored_session, RefreshedSession, TRANSIENT};
use super::vault::{KeyringVault, TokenVault};

#[derive(Clone)]
struct ActiveGoogleLogin {
    login: PendingLogin,
    shop_api: String,
}

pub struct GoogleAuth {
    active: Mutex<Option<ActiveGoogleLogin>>,
    /// One in-flight token fetch, so a poll and a deep link cannot both
    /// decide the outcome of the same login.
    pull: Mutex<()>,
}

impl Default for GoogleAuth {
    fn default() -> Self {
        Self {
            active: Mutex::new(None),
            pull: Mutex::new(()),
        }
    }
}

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

#[tauri::command]
pub fn start_google_login(
    app: AppHandle,
    client_id: String,
    redirect_uri: String,
    shop_api_url: String,
) -> Result<(), String> {
    let shop_api = match shop_api_base(&shop_api_url) {
        Ok(shop_api) => shop_api,
        Err(message) => {
            eprintln!("google login: rejected shop API {shop_api_url}: {message}");
            return Err(message.to_owned());
        }
    };
    let pending = match prepare_login(&client_id, &redirect_uri, SystemTime::now()) {
        Ok(pending) => pending,
        Err(message) => {
            eprintln!("google login: could not prepare the login: {message}");
            return Err(message.to_owned());
        }
    };
    if let Err(err) = register_pending(&shop_api, &pending) {
        eprintln!("google login: {}", err.detail());
        return Err(err.code().to_owned());
    }
    let url = authorize_url(&pending);
    {
        let state = app.state::<GoogleAuth>();
        let mut guard = state.active.lock().map_err(|_| SIGN_IN_FAILED.to_owned())?;
        *guard = Some(ActiveGoogleLogin {
            login: pending,
            shop_api,
        });
    }

    if app.opener().open_url(url, None::<&str>).is_err() {
        eprintln!("google login: could not open the browser");
        if let Ok(mut guard) = app.state::<GoogleAuth>().active.lock() {
            *guard = None;
        }
        return Err(SIGN_IN_FAILED.to_owned());
    }

    let poll_app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(1));
        if !pull_id_token(&poll_app) {
            break;
        }
    });
    Ok(())
}

enum RegisterError {
    TooMany,
    Failed(String),
}

impl RegisterError {
    fn code(&self) -> &'static str {
        match self {
            Self::TooMany => SIGN_IN_TOO_MANY,
            Self::Failed(_) => SIGN_IN_FAILED,
        }
    }

    fn detail(&self) -> &str {
        match self {
            Self::TooMany => "the shop API rate limited this sign-in",
            Self::Failed(detail) => detail,
        }
    }
}

enum LoginEnd {
    Ready(String),
    Failed,
    TimedOut,
    TooMany,
}

fn register_pending(shop_api: &str, pending: &PendingLogin) -> Result<(), RegisterError> {
    let body = serde_json::json!({
        "state": pending.state(),
        "codeVerifier": pending.code_verifier(),
        "loginSecret": pending.login_secret(),
        "redirectUri": pending.redirect_uri(),
    });
    let url = format!("{shop_api}/google-auth/pending");
    let response = post_json(&url, &body).map_err(RegisterError::Failed)?;
    if response.status().is_success() {
        Ok(())
    } else if response.status().as_u16() == 429 {
        let _ = response.text();
        Err(RegisterError::TooMany)
    } else {
        let status = response.status();
        let body = response.text().unwrap_or_default();
        Err(RegisterError::Failed(format!(
            "{url} returned {status}: {}",
            clip(&body, 400)
        )))
    }
}

fn post_json(url: &str, body: &serde_json::Value) -> Result<reqwest::blocking::Response, String> {
    let client = reqwest::blocking::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|err| format!("could not prepare the shop API request: {err}"))?;
    client
        .post(url)
        .header("content-type", "application/json")
        .body(body.to_string())
        .send()
        .map_err(|err| format!("could not reach {url}: {err}"))
}

fn clip(value: &str, max: usize) -> String {
    let mut clipped: String = value.chars().take(max).collect();
    if value.chars().count() > max {
        clipped.push('…');
    }
    clipped
}

pub fn handle_google_callback(app: &AppHandle, url: &str) {
    let Ok(query) = parse_callback(url) else {
        return;
    };
    complete_google_login(app, query);
}

pub(crate) fn complete_google_login(app: &AppHandle, query: CallbackQuery) {
    let matches = {
        let state = app.state::<GoogleAuth>();
        let Ok(guard) = state.active.lock() else {
            return;
        };
        guard
            .as_ref()
            .is_some_and(|active| active.login.state() == query.state)
    };
    if matches {
        let _ = pull_id_token(app);
    }
}

/// Fetches the ID token when the shop API has it. Returns whether the login
/// is still in progress and another poll should run.
fn pull_id_token(app: &AppHandle) -> bool {
    let state = app.state::<GoogleAuth>();
    let Ok(_single_flight) = state.pull.lock() else {
        return false;
    };

    let active = {
        let Ok(guard) = state.active.lock() else {
            return false;
        };
        guard.clone()
    };
    let Some(active) = active else {
        return false;
    };

    if SystemTime::now() >= active.login.expires_at() {
        finish_login(app, active.login.state(), LoginEnd::TimedOut);
        return false;
    }

    let end = match request_id_token(&active.shop_api, &active.login) {
        IdTokenPoll::Pending | IdTokenPoll::Retry => {
            return same_login_is_active(app, active.login.state());
        }
        IdTokenPoll::Ready(token) => LoginEnd::Ready(token),
        IdTokenPoll::Rejected => LoginEnd::Failed,
        IdTokenPoll::RateLimited => LoginEnd::TooMany,
    };
    finish_login(app, active.login.state(), end);
    false
}

fn same_login_is_active(app: &AppHandle, state_value: &str) -> bool {
    app.state::<GoogleAuth>()
        .active
        .lock()
        .ok()
        .and_then(|guard| {
            guard
                .as_ref()
                .map(|active| active.login.state() == state_value)
        })
        .unwrap_or(false)
}

fn finish_login(app: &AppHandle, state_value: &str, end: LoginEnd) {
    let google_auth = app.state::<GoogleAuth>();
    let mut slot = match google_auth.active.lock() {
        Ok(guard) => guard,
        Err(_) => return,
    };
    let Some(active) = slot.as_ref() else {
        return;
    };
    if active.login.state() != state_value {
        return;
    }

    let session = slot.take().expect("login was present");
    drop(slot);
    let mut pending = Some(session.login);
    let taken = take_pending(&mut pending, SystemTime::now(), state_value);

    match (end, taken) {
        (_, Err(CallbackError::Expired)) | (LoginEnd::TimedOut, _) => {
            let _ = app.emit("google-login-error", SIGN_IN_TIMEOUT);
        }
        (LoginEnd::Ready(token), Ok(_)) => {
            let _ = app.emit("google-login-success", token);
        }
        (LoginEnd::TooMany, Ok(_)) => {
            let _ = app.emit("google-login-error", SIGN_IN_TOO_MANY);
        }
        _ => {
            eprintln!("google login: the shop API rejected this sign-in");
            let _ = app.emit("google-login-error", SIGN_IN_FAILED);
        }
    }
}

fn request_id_token(shop_api: &str, login: &PendingLogin) -> IdTokenPoll {
    let body = serde_json::json!({
        "state": login.state(),
        "loginSecret": login.login_secret(),
    });
    let url = format!("{shop_api}/google-auth/session");
    let response = match post_json(&url, &body) {
        Ok(response) => response,
        Err(err) => {
            eprintln!("google login: {err}");
            return IdTokenPoll::Retry;
        }
    };
    let status = response.status().as_u16();
    let body = response.text().unwrap_or_default();
    if status != 200 {
        eprintln!(
            "google login: session response {status}: {}",
            clip(&body, 400)
        );
    }
    interpret_session_response(status, &body)
}
