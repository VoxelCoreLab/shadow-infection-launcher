//! Google authorization-code flow with PKCE.
//!
//! The browser returns to the website with `code` and `state`. The shop API
//! holds the client secret, exchanges the code, and keeps the ID token. The
//! deep link only carries `state`. This process fetches the token over HTTPS
//! with `login_secret`, which never leaves the launcher.

use std::time::{Duration, SystemTime};

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use sha2::{Digest, Sha256};
use url::Url;

pub const AUTHORIZE_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
pub const DEEP_LINK_SCHEME: &str = "shadowinfection-launcher";
pub const LOGIN_TTL: Duration = Duration::from_secs(3 * 60);

/// Stable codes for the webview. The login screen owns the sentences.
pub const SIGN_IN_FAILED: &str = "failed";
pub const SIGN_IN_TIMEOUT: &str = "timeout";
pub const SIGN_IN_UNAVAILABLE: &str = "unavailable";
pub const SIGN_IN_TOO_MANY: &str = "too_many";

const ALLOWED_REDIRECTS: &[&str] = &[
    "https://shadowinfection.com/auth/launcher",
    "https://shadowinfection-dev.web.app/auth/launcher",
];

const ALLOWED_SHOP_APIS: &[&str] = &[
    "https://shop-api.shadowinfection.com",
    "https://shop-api-dev.shadowinfection.com",
    "http://127.0.0.1:3000",
    "http://localhost:3000",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PendingLogin {
    state: String,
    verifier: String,
    login_secret: String,
    client_id: String,
    redirect_uri: String,
    expires_at: SystemTime,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CallbackQuery {
    pub state: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IdTokenPoll {
    Pending,
    Ready(String),
    Rejected,
    RateLimited,
    Retry,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CallbackError {
    Mismatch,
    Expired,
    Missing,
}

pub fn pkce_challenge(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

pub fn prepare_login(
    client_id: &str,
    redirect_uri: &str,
    now: SystemTime,
) -> Result<PendingLogin, &'static str> {
    if !valid_client_id(client_id) {
        return Err(SIGN_IN_UNAVAILABLE);
    }
    if !ALLOWED_REDIRECTS.contains(&redirect_uri) {
        return Err(SIGN_IN_FAILED);
    }

    Ok(PendingLogin {
        state: random_url_safe(16)?,
        verifier: random_url_safe(32)?,
        login_secret: random_url_safe(32)?,
        client_id: client_id.to_owned(),
        redirect_uri: redirect_uri.to_owned(),
        expires_at: now + LOGIN_TTL,
    })
}

pub fn authorize_url(pending: &PendingLogin) -> String {
    let mut url = Url::parse(AUTHORIZE_URL).expect("google authorize url");
    url.query_pairs_mut()
        .append_pair("client_id", &pending.client_id)
        .append_pair("redirect_uri", &pending.redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", "openid email profile")
        .append_pair("code_challenge", &pkce_challenge(&pending.verifier))
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", &pending.state)
        .append_pair("prompt", "select_account");
    url.into()
}

/// Consumes the pending login only when `state` matches and it is still fresh.
/// A wrong state leaves the pending login in place.
pub fn take_pending(
    slot: &mut Option<PendingLogin>,
    now: SystemTime,
    state: &str,
) -> Result<PendingLogin, CallbackError> {
    let Some(pending) = slot.as_ref() else {
        return Err(CallbackError::Missing);
    };
    if pending.state != state {
        return Err(CallbackError::Mismatch);
    }
    let pending = slot.take().expect("pending was present");
    if now >= pending.expires_at {
        return Err(CallbackError::Expired);
    }
    Ok(pending)
}

impl PendingLogin {
    pub fn state(&self) -> &str {
        &self.state
    }

    pub fn code_verifier(&self) -> &str {
        &self.verifier
    }

    pub fn login_secret(&self) -> &str {
        &self.login_secret
    }

    pub fn redirect_uri(&self) -> &str {
        &self.redirect_uri
    }

    pub fn expires_at(&self) -> SystemTime {
        self.expires_at
    }
}

pub fn shop_api_base(raw: &str) -> Result<String, &'static str> {
    let trimmed = raw.trim().trim_end_matches('/');
    if ALLOWED_SHOP_APIS.contains(&trimmed) {
        Ok(trimmed.to_owned())
    } else {
        Err(SIGN_IN_FAILED)
    }
}

pub fn parse_callback(raw: &str) -> Result<CallbackQuery, ()> {
    let url = Url::parse(raw).map_err(|_| ())?;
    if url.scheme() != DEEP_LINK_SCHEME
        || url.host_str() != Some("auth")
        || url.path() != "/callback"
    {
        return Err(());
    }
    callback_from_pairs(url.query_pairs())
}

fn callback_from_pairs<'a>(
    pairs: impl Iterator<Item = (std::borrow::Cow<'a, str>, std::borrow::Cow<'a, str>)>,
) -> Result<CallbackQuery, ()> {
    let mut state = None;
    for (key, value) in pairs {
        if key == "state" {
            state = Some(value.into_owned());
        }
    }

    match state {
        Some(state) if valid_param(&state) => Ok(CallbackQuery { state }),
        _ => Err(()),
    }
}

#[derive(serde::Deserialize)]
struct SessionBody {
    status: String,
    #[serde(default, rename = "idToken")]
    id_token: Option<String>,
}

/// Reads the shop API session response. `200` with `pending` means the browser
/// has not finished. `ready` yields the ID token. `400` closes the login.
pub fn interpret_session_response(status: u16, body: &str) -> IdTokenPoll {
    if status != 200 {
        return if status == 429 {
            IdTokenPoll::RateLimited
        } else if matches!(status, 400 | 401 | 403 | 404) {
            IdTokenPoll::Rejected
        } else {
            IdTokenPoll::Retry
        };
    }

    let Ok(parsed) = serde_json::from_str::<SessionBody>(body) else {
        return IdTokenPoll::Rejected;
    };
    match parsed.status.as_str() {
        "pending" => IdTokenPoll::Pending,
        "ready" => match parsed.id_token {
            Some(token) if valid_id_token(&token) => IdTokenPoll::Ready(token),
            _ => IdTokenPoll::Rejected,
        },
        _ => IdTokenPoll::Rejected,
    }
}

fn valid_client_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 200
        && id.ends_with(".apps.googleusercontent.com")
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.')
}

fn valid_param(value: &str) -> bool {
    !value.is_empty() && value.len() <= 2048 && !value.chars().any(char::is_control)
}

fn valid_id_token(value: &str) -> bool {
    let mut parts = value.split('.');
    let Some(header) = parts.next() else {
        return false;
    };
    let Some(payload) = parts.next() else {
        return false;
    };
    let Some(signature) = parts.next() else {
        return false;
    };
    parts.next().is_none()
        && [header, payload, signature].iter().all(|part| {
            !part.is_empty()
                && part
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        })
}

fn random_url_safe(bytes: usize) -> Result<String, &'static str> {
    let mut buf = vec![0u8; bytes];
    getrandom::getrandom(&mut buf).map_err(|_| SIGN_IN_FAILED)?;
    Ok(URL_SAFE_NO_PAD.encode(buf))
}

#[cfg(test)]
mod tests {
    use super::*;

    const CLIENT_ID: &str = "1234567890-abc.apps.googleusercontent.com";
    const REDIRECT: &str = "https://shadowinfection.com/auth/launcher";
    const ID_TOKEN: &str = "header.payload.signature";

    fn pending_at(now: SystemTime) -> PendingLogin {
        prepare_login(CLIENT_ID, REDIRECT, now).expect("pending")
    }

    #[test]
    fn pkce_challenge_matches_rfc7636_example() {
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        assert_eq!(
            pkce_challenge(verifier),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn authorize_url_uses_pkce_and_omits_offline_access() {
        let now = SystemTime::UNIX_EPOCH;
        let pending = pending_at(now);
        let url = authorize_url(&pending);

        assert!(url.starts_with(AUTHORIZE_URL));
        assert!(url.contains("response_type=code"));
        assert!(url.contains("code_challenge_method=S256"));
        assert!(url.contains(&format!(
            "code_challenge={}",
            pkce_challenge(&pending.verifier)
        )));
        assert!(url.contains(&format!("state={}", pending.state)));
        assert!(url.contains("redirect_uri=https%3A%2F%2Fshadowinfection.com%2Fauth%2Flauncher"));
        assert!(!url.contains("access_type"));
        assert!(!url.contains("client_secret"));
        assert!(!url.contains(&pending.verifier));
        assert!(!url.contains(pending.login_secret()));
    }

    #[test]
    fn rejects_unknown_redirect_and_client() {
        let now = SystemTime::UNIX_EPOCH;
        assert_eq!(
            prepare_login(CLIENT_ID, "https://evil.example/auth/launcher", now),
            Err(SIGN_IN_FAILED)
        );
        assert_eq!(
            prepare_login(CLIENT_ID, "http://127.0.0.1:43123/callback", now),
            Err(SIGN_IN_FAILED)
        );
        assert!(shop_api_base("https://shop-api.shadowinfection.com/").is_ok());
        assert!(shop_api_base("https://evil.example").is_err());
        assert_eq!(
            prepare_login("not-a-google-client", REDIRECT, now),
            Err(SIGN_IN_UNAVAILABLE)
        );
    }

    #[test]
    fn matching_state_is_consumed_once() {
        let now = SystemTime::UNIX_EPOCH;
        let pending = pending_at(now);
        let state = pending.state.clone();
        let mut slot = Some(pending);

        let taken = take_pending(&mut slot, now, &state).expect("match");
        assert_eq!(taken.state, state);
        assert!(slot.is_none());
        assert_eq!(
            take_pending(&mut slot, now, &state),
            Err(CallbackError::Missing)
        );
    }

    #[test]
    fn wrong_state_does_not_consume_the_pending_login() {
        let now = SystemTime::UNIX_EPOCH;
        let pending = pending_at(now);
        let mut slot = Some(pending);

        assert_eq!(
            take_pending(&mut slot, now, "other-state"),
            Err(CallbackError::Mismatch)
        );
        assert!(slot.is_some());
    }

    #[test]
    fn expired_login_is_consumed_and_rejected() {
        let now = SystemTime::UNIX_EPOCH + Duration::from_secs(10);
        let pending = pending_at(now);
        let state = pending.state.clone();
        let mut slot = Some(pending);

        assert_eq!(
            take_pending(&mut slot, now + LOGIN_TTL, &state),
            Err(CallbackError::Expired)
        );
        assert!(slot.is_none());
    }

    #[test]
    fn replacing_a_pending_login_rejects_the_old_state() {
        let now = SystemTime::UNIX_EPOCH;
        let first = pending_at(now);
        let first_state = first.state.clone();
        let second = pending_at(now);
        let mut slot = Some(first);
        assert!(slot.replace(second).is_some());

        assert_eq!(
            take_pending(&mut slot, now, &first_state),
            Err(CallbackError::Mismatch)
        );
        assert!(slot.is_some());
    }

    #[test]
    fn deep_link_carries_only_the_state() {
        let state = "YYcpEj9YN8tvoy9bGGzW";
        let query = parse_callback(&format!(
            "shadowinfection-launcher://auth/callback?state={state}&id_token={ID_TOKEN}&code=ignored"
        ))
        .expect("callback");
        assert_eq!(query.state, state);
        assert!(parse_callback("shadowinfection-launcher://auth/callback?code=abc").is_err());
        assert!(parse_callback("shadowinfection-launcher://auth/callback?state=").is_err());
        assert!(
            parse_callback("shadowinfection://auth/callback?state=YYcpEj9YN8tvoy9bGGzW").is_err()
        );
    }

    #[test]
    fn session_response_hides_the_token_until_it_is_ready() {
        assert_eq!(
            interpret_session_response(200, r#"{"status":"pending"}"#),
            IdTokenPoll::Pending
        );
        assert_eq!(
            interpret_session_response(
                200,
                r#"{"status":"ready","idToken":"header.payload.signature"}"#
            ),
            IdTokenPoll::Ready(ID_TOKEN.to_owned())
        );
        assert_eq!(
            interpret_session_response(200, r#"{"status":"ready","idToken":"nope"}"#),
            IdTokenPoll::Rejected
        );
        assert_eq!(
            interpret_session_response(400, r#"{"message":"Google sign-in failed."}"#),
            IdTokenPoll::Rejected
        );
        assert_eq!(
            interpret_session_response(429, ""),
            IdTokenPoll::RateLimited
        );
        assert_eq!(interpret_session_response(503, ""), IdTokenPoll::Retry);
    }
}
