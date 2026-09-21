const TOKEN_ENDPOINT = "https://securetoken.googleapis.com/v1/token";
const FALLBACK_TTL_MS = 55 * 60 * 1000;

export type SessionTokens = {
  idToken: string;
  refreshToken: string;
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

export async function exchangeRefreshToken(
  refreshToken: string,
  apiKey: string,
): Promise<SessionTokens> {
  const response = await fetch(
    `${TOKEN_ENDPOINT}?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to refresh session");
  }

  const data = (await response.json()) as {
    id_token?: string;
    refresh_token?: string;
    expires_in?: string;
    user_id?: string;
  };

  if (!data.id_token || !data.refresh_token) {
    throw new Error("Failed to refresh session");
  }

  const claims = decodeIdTokenClaims(data.id_token);
  const uid = data.user_id ?? claims.uid;
  if (!uid) {
    throw new Error("Failed to refresh session");
  }

  const expiresInSec = Number(data.expires_in);
  const expiresAt = Number.isFinite(expiresInSec)
    ? Date.now() + expiresInSec * 1000
    : expiresAtFromIdToken(data.id_token);

  return {
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    expiresAt,
    uid,
    email: claims.email,
  };
}
