import { invoke } from "@tauri-apps/api/core";

export const FALLBACK_TTL_MS = 55 * 60 * 1000;

export type SessionErrorKind = "invalid_token" | "transient";

export class SessionError extends Error {
  readonly kind: SessionErrorKind;

  constructor(kind: SessionErrorKind, message = "Failed to refresh session") {
    super(message);
    this.name = "SessionError";
    this.kind = kind;
  }
}

export function isInvalidRefreshTokenError(error: unknown): boolean {
  return error instanceof SessionError && error.kind === "invalid_token";
}

export type SessionTokens = {
  idToken: string;
  expiresAt: number;
  uid: string;
  email: string | null;
};

export type IdTokenClaims = {
  uid: string | null;
  email: string | null;
  exp: number | null;
};

export function decodeIdTokenClaims(idToken: string): IdTokenClaims {
  const segment = idToken.split(".")[1];
  if (!segment) {
    return { uid: null, email: null, exp: null };
  }

  const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = padded.length % 4;
  const base64 = remainder === 0 ? padded : padded + "=".repeat(4 - remainder);

  try {
    const payload = JSON.parse(atob(base64)) as {
      sub?: string;
      user_id?: string;
      email?: string;
      exp?: number;
    };

    return {
      uid: payload.sub ?? payload.user_id ?? null,
      email: payload.email ?? null,
      exp: typeof payload.exp === "number" ? payload.exp : null,
    };
  } catch {
    return { uid: null, email: null, exp: null };
  }
}

export function expiresAtFromIdToken(idToken: string): number {
  const { exp } = decodeIdTokenClaims(idToken);
  if (exp) {
    return exp * 1000;
  }
  return Date.now() + FALLBACK_TTL_MS;
}

type RefreshedSession = {
  id_token: string;
  expires_in: number | null;
  user_id: string | null;
};

/**
 * Exchanges the refresh token stored in the OS vault for a fresh ID token.
 * The exchange (and token rotation) happens in Rust, so the long-lived
 * refresh token never enters the webview. Resolves to null when no session
 * is stored; a rejected token is removed from the vault by the backend.
 */
export async function refreshStoredSession(
  apiKey: string,
): Promise<SessionTokens | null> {
  let data: RefreshedSession | null;
  try {
    data = await invoke<RefreshedSession | null>("refresh_session", {
      apiKey,
    });
  } catch (err) {
    throw new SessionError(
      err === "invalid_token" ? "invalid_token" : "transient",
    );
  }

  if (!data) {
    return null;
  }

  const claims = decodeIdTokenClaims(data.id_token);
  const uid = data.user_id ?? claims.uid;
  if (!uid) {
    throw new SessionError("transient");
  }

  const expiresAt =
    typeof data.expires_in === "number"
      ? Date.now() + data.expires_in * 1000
      : expiresAtFromIdToken(data.id_token);

  return {
    idToken: data.id_token,
    expiresAt,
    uid,
    email: claims.email,
  };
}
