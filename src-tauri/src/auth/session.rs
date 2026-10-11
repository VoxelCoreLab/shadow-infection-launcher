//! Firebase refresh-token exchange done natively, so the long-lived refresh
//! token never has to be handed back to the webview. JS only ever receives
//! the short-lived ID token.

use serde::{Deserialize, Serialize};

use super::vault::TokenVault;

const TOKEN_ENDPOINT: &str = "https://securetoken.googleapis.com/v1/token";

/// Errors the frontend distinguishes; serialized as the command's error string.
pub const INVALID_TOKEN: &str = "invalid_token";
pub const TRANSIENT: &str = "transient";

const INVALID_TOKEN_MARKERS: &[&str] = &[
    "INVALID_REFRESH_TOKEN",
    "INVALID_GRANT",
    "TOKEN_EXPIRED",
    "USER_DISABLED",
    "USER_NOT_FOUND",
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RefreshedSession {
    pub id_token: String,
    pub expires_in: Option<u64>,
    pub user_id: Option<String>,
}

/// Successful token-endpoint response, including the rotated refresh token
/// that stays on the Rust side.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TokenExchange {
    pub session: RefreshedSession,
    pub refresh_token: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExchangeError {
    InvalidToken,
    Transient,
}

#[derive(Deserialize)]
struct TokenResponse {
    id_token: Option<String>,
    refresh_token: Option<String>,
    expires_in: Option<String>,
    user_id: Option<String>,
}

fn error_message(body: &str) -> String {
    let Ok(json) = serde_json::from_str::<serde_json::Value>(body) else {
        return String::new();
    };
    match &json["error"] {
        serde_json::Value::String(s) => s.clone(),
        other => other["message"].as_str().unwrap_or_default().to_owned(),
    }
}

pub fn parse_token_response(status: u16, body: &str) -> Result<TokenExchange, ExchangeError> {
    if !(200..300).contains(&status) {
        let message = error_message(body).to_uppercase();
        return Err(
            if INVALID_TOKEN_MARKERS.iter().any(|m| message.contains(m)) {
                ExchangeError::InvalidToken
            } else {
                ExchangeError::Transient
            },
        );
    }

    let data: TokenResponse = serde_json::from_str(body).map_err(|_| ExchangeError::Transient)?;
    match (data.id_token, data.refresh_token) {
        (Some(id_token), Some(refresh_token))
            if !id_token.is_empty() && !refresh_token.is_empty() =>
        {
            Ok(TokenExchange {
                session: RefreshedSession {
                    id_token,
                    expires_in: data.expires_in.and_then(|s| s.parse().ok()),
                    user_id: data.user_id,
                },
                refresh_token,
            })
        }
        _ => Err(ExchangeError::Transient),
    }
}

pub fn exchange_refresh_token(
    api_key: &str,
    refresh_token: &str,
) -> Result<TokenExchange, ExchangeError> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .https_only(true)
        .build()
        .map_err(|_| ExchangeError::Transient)?;
    let response = client
        .post(TOKEN_ENDPOINT)
        .query(&[("key", api_key)])
        .form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
        ])
        .send()
        .map_err(|_| ExchangeError::Transient)?;
    let status = response.status().as_u16();
    let body = response.text().map_err(|_| ExchangeError::Transient)?;
    parse_token_response(status, &body)
}

/// Exchange the stored refresh token for a fresh ID token.
/// `Ok(None)` when nothing is stored. A rejected token is removed from the
/// vault; transient failures keep it for the next attempt.
pub fn refresh_stored_session(
    vault: &dyn TokenVault,
    exchange: impl FnOnce(&str) -> Result<TokenExchange, ExchangeError>,
) -> Result<Option<RefreshedSession>, String> {
    let Some(stored) = vault.get().map_err(|_| TRANSIENT.to_string())? else {
        return Ok(None);
    };

    match exchange(&stored) {
        Ok(result) => {
            if result.refresh_token != stored {
                vault
                    .store(&result.refresh_token)
                    .map_err(|_| TRANSIENT.to_string())?;
            }
            Ok(Some(result.session))
        }
        Err(ExchangeError::InvalidToken) => {
            let _ = vault.clear();
            Err(INVALID_TOKEN.into())
        }
        Err(ExchangeError::Transient) => Err(TRANSIENT.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::vault::InMemoryVault;

    fn exchange_ok(refresh_token: &str) -> TokenExchange {
        TokenExchange {
            session: RefreshedSession {
                id_token: "id-2".into(),
                expires_in: Some(3600),
                user_id: Some("uid-1".into()),
            },
            refresh_token: refresh_token.into(),
        }
    }

    #[test]
    fn parses_successful_response() {
        let body = r#"{"id_token":"id","refresh_token":"rt","expires_in":"3600","user_id":"u"}"#;
        let result = parse_token_response(200, body).unwrap();
        assert_eq!(result.refresh_token, "rt");
        assert_eq!(
            result.session,
            RefreshedSession {
                id_token: "id".into(),
                expires_in: Some(3600),
                user_id: Some("u".into()),
            }
        );
    }

    #[test]
    fn missing_tokens_are_transient() {
        assert_eq!(
            parse_token_response(200, r#"{"id_token":"id"}"#),
            Err(ExchangeError::Transient)
        );
        assert_eq!(
            parse_token_response(200, "garbage"),
            Err(ExchangeError::Transient)
        );
    }

    #[test]
    fn classifies_invalid_token_errors() {
        let nested = r#"{"error":{"message":"INVALID_REFRESH_TOKEN"}}"#;
        let flat = r#"{"error":"invalid_grant"}"#;
        assert_eq!(
            parse_token_response(400, nested),
            Err(ExchangeError::InvalidToken)
        );
        assert_eq!(
            parse_token_response(400, flat),
            Err(ExchangeError::InvalidToken)
        );
    }

    #[test]
    fn server_errors_are_transient() {
        assert_eq!(parse_token_response(503, ""), Err(ExchangeError::Transient));
        assert_eq!(
            parse_token_response(400, r#"{"error":{"message":"QUOTA_EXCEEDED"}}"#),
            Err(ExchangeError::Transient)
        );
    }

    #[test]
    fn empty_vault_returns_none_without_exchange() {
        let vault = InMemoryVault::default();
        let result = refresh_stored_session(&vault, |_| panic!("must not exchange"));
        assert_eq!(result, Ok(None));
    }

    #[test]
    fn stores_rotated_refresh_token() {
        let vault = InMemoryVault::default();
        vault.store("rt-1").unwrap();
        let session = refresh_stored_session(&vault, |rt| {
            assert_eq!(rt, "rt-1");
            Ok(exchange_ok("rt-2"))
        })
        .unwrap()
        .unwrap();
        assert_eq!(session.id_token, "id-2");
        assert_eq!(vault.get().unwrap().as_deref(), Some("rt-2"));
    }

    #[test]
    fn invalid_token_clears_vault() {
        let vault = InMemoryVault::default();
        vault.store("rt-1").unwrap();
        let result = refresh_stored_session(&vault, |_| Err(ExchangeError::InvalidToken));
        assert_eq!(result, Err(INVALID_TOKEN.to_string()));
        assert_eq!(vault.get().unwrap(), None);
    }

    #[test]
    fn transient_failure_keeps_vault() {
        let vault = InMemoryVault::default();
        vault.store("rt-1").unwrap();
        let result = refresh_stored_session(&vault, |_| Err(ExchangeError::Transient));
        assert_eq!(result, Err(TRANSIENT.to_string()));
        assert_eq!(vault.get().unwrap().as_deref(), Some("rt-1"));
    }
}
