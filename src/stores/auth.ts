import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { invoke } from "@tauri-apps/api/core";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, firebaseApiKey } from "@/lib/firebase";
import { mapFirebaseError } from "@/lib/firebase-errors";
import {
  expiresAtFromIdToken,
  isInvalidRefreshTokenError,
  refreshStoredSession,
  type SessionTokens,
} from "@/lib/session";

const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;
const LOGOUT_FAILED_MESSAGE = "Could not sign out. Please try again.";

export type AuthUser = {
  uid: string;
  email: string | null;
};

export const useAuthStore = defineStore("auth", () => {
  const user = ref<AuthUser | null>(null);
  const idToken = ref<string | null>(null);
  const expiresAt = ref<number | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const ready = ref(false);
  const isLoggedIn = computed(() => user.value !== null);

  let initPromise: Promise<void> | null = null;
  let refreshPromise: Promise<string | null> | null = null;

  function applySession(session: SessionTokens) {
    user.value = { uid: session.uid, email: session.email };
    idToken.value = session.idToken;
    expiresAt.value = session.expiresAt;
  }

  function clearSession() {
    user.value = null;
    idToken.value = null;
    expiresAt.value = null;
  }

  function hasFreshIdToken(): boolean {
    return (
      idToken.value !== null &&
      expiresAt.value !== null &&
      Date.now() < expiresAt.value - TOKEN_REFRESH_SKEW_MS
    );
  }

  async function restoreSession(): Promise<void> {
    try {
      const session = await refreshStoredSession(firebaseApiKey);
      if (session) {
        applySession(session);
      }
    } catch {
      // Invalid tokens are already removed from the vault by the backend.
      clearSession();
    } finally {
      ready.value = true;
    }
  }

  function initialize(): Promise<void> {
    if (!initPromise) {
      initPromise = restoreSession();
    }
    return initPromise;
  }

  async function login(email: string, password: string): Promise<boolean> {
    error.value = null;
    loading.value = true;

    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        email,
        password,
      );
      const token = await credential.user.getIdToken();
      await invoke("store_refresh_token", {
        token: credential.user.refreshToken,
      });
      // The vault now owns the refresh token and later refreshes run in Rust;
      // drop the SDK's in-memory copy so it can't be read from the webview.
      try {
        await signOut(auth);
      } catch {
        // Best effort: the session continues from the vault either way.
      }

      applySession({
        idToken: token,
        expiresAt: expiresAtFromIdToken(token),
        uid: credential.user.uid,
        email: credential.user.email,
      });
      return true;
    } catch (err: unknown) {
      error.value = mapFirebaseError(err);
      clearSession();
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function logout(): Promise<boolean> {
    try {
      await invoke("clear_refresh_token");
    } catch {
      error.value = LOGOUT_FAILED_MESSAGE;
      return false;
    }

    try {
      await signOut(auth);
    } catch {
      // In-memory Firebase session is secondary after the vault is cleared.
    }

    clearSession();
    error.value = null;
    return true;
  }

  async function refreshSession(): Promise<string | null> {
    if (!refreshPromise) {
      refreshPromise = performRefresh().finally(() => {
        refreshPromise = null;
      });
    }
    return refreshPromise;
  }

  async function performRefresh(): Promise<string | null> {
    try {
      const session = await refreshStoredSession(firebaseApiKey);
      if (!session) {
        clearSession();
        return null;
      }

      applySession(session);
      return session.idToken;
    } catch (err) {
      if (isInvalidRefreshTokenError(err)) {
        clearSession();
      }
      return null;
    }
  }

  async function getIdToken(): Promise<string | null> {
    if (hasFreshIdToken()) {
      return idToken.value;
    }

    return refreshSession();
  }

  function clearError() {
    error.value = null;
  }

  return {
    user,
    loading,
    error,
    ready,
    isLoggedIn,
    initialize,
    login,
    logout,
    getIdToken,
    refreshSession,
    clearError,
  };
});
