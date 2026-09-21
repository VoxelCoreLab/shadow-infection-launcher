use keyring::Entry;
#[cfg(test)]
use std::sync::Mutex;

const SERVICE: &str = "com.voxelcorelab.shadowinfection.launcher";
const ACCOUNT: &str = "firebase-refresh-token";

pub trait TokenVault {
    fn store(&self, token: &str) -> Result<(), String>;
    fn get(&self) -> Result<Option<String>, String>;
    fn clear(&self) -> Result<(), String>;
}

pub struct KeyringVault;

impl TokenVault for KeyringVault {
    fn store(&self, token: &str) -> Result<(), String> {
        if token.is_empty() {
            return Err("refresh token must not be empty".into());
        }

        let entry = Entry::new(SERVICE, ACCOUNT).map_err(map_err)?;
        entry.set_password(token).map_err(map_err)
    }

    fn get(&self) -> Result<Option<String>, String> {
        let entry = Entry::new(SERVICE, ACCOUNT).map_err(map_err)?;
        match entry.get_password() {
            Ok(password) => Ok(Some(password)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(err) => Err(map_err(err)),
        }
    }

    fn clear(&self) -> Result<(), String> {
        let entry = Entry::new(SERVICE, ACCOUNT).map_err(map_err)?;
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) => Err(map_err(err)),
        }
    }
}

fn map_err(err: keyring::Error) -> String {
    err.to_string()
}

#[cfg(test)]
#[derive(Default)]
struct InMemoryVault {
    token: Mutex<Option<String>>,
}

#[cfg(test)]
impl TokenVault for InMemoryVault {
    fn store(&self, token: &str) -> Result<(), String> {
        if token.is_empty() {
            return Err("refresh token must not be empty".into());
        }

        let mut slot = self
            .token
            .lock()
            .map_err(|_| "vault lock poisoned".to_string())?;
        *slot = Some(token.to_string());
        Ok(())
    }

    fn get(&self) -> Result<Option<String>, String> {
        let slot = self
            .token
            .lock()
            .map_err(|_| "vault lock poisoned".to_string())?;
        Ok(slot.clone())
    }

    fn clear(&self) -> Result<(), String> {
        let mut slot = self
            .token
            .lock()
            .map_err(|_| "vault lock poisoned".to_string())?;
        *slot = None;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn store_get_clear_roundtrip() {
        let vault = InMemoryVault::default();
        assert_eq!(vault.get().unwrap(), None);

        vault.store("secret-token").unwrap();
        assert_eq!(vault.get().unwrap().as_deref(), Some("secret-token"));

        vault.clear().unwrap();
        assert_eq!(vault.get().unwrap(), None);
    }

    #[test]
    fn rejects_empty_token() {
        let vault = InMemoryVault::default();
        assert!(vault.store("").is_err());
        assert_eq!(vault.get().unwrap(), None);
    }

    #[test]
    fn clear_when_empty_is_ok() {
        let vault = InMemoryVault::default();
        assert!(vault.clear().is_ok());
    }

    #[test]
    fn native_credential_store_allows_entry_creation() {
        let result = Entry::new(SERVICE, ACCOUNT);
        assert!(
            result.is_ok(),
            "native keyring backend is not compiled in: {:?}",
            result.err()
        );
    }
}
