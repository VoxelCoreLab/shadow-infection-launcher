import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

import {
  decodeIdTokenClaims,
  expiresAtFromIdToken,
  FALLBACK_TTL_MS,
  isInvalidRefreshTokenError,
  refreshStoredSession,
  SessionError,
} from "./session";

function encodeJwt(payload: object): string {
  const json = JSON.stringify(payload);
  const base64 = btoa(json)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `e30.${base64}.sig`;
}

describe("decodeIdTokenClaims", () => {
  it("reads uid, email, and exp from an unpadded payload", () => {
    const token = encodeJwt({
      sub: "uid-1",
      email: "a@example.com",
      exp: 1_700_000_000,
    });

    expect((token.split(".")[1]?.length ?? 0) % 4).not.toBe(0);
    expect(decodeIdTokenClaims(token)).toEqual({
      uid: "uid-1",
      email: "a@example.com",
      exp: 1_700_000_000,
    });
  });

  it("accepts user_id when sub is missing", () => {
    const token = encodeJwt({ user_id: "uid-2" });
    expect(decodeIdTokenClaims(token).uid).toBe("uid-2");
  });

  it("returns empty claims for a malformed token", () => {
    expect(decodeIdTokenClaims("not-a-jwt")).toEqual({
      uid: null,
      email: null,
      exp: null,
    });
  });
});

describe("expiresAtFromIdToken", () => {
  it("uses exp when present", () => {
    const token = encodeJwt({ exp: 1_700_000_000 });
    expect(expiresAtFromIdToken(token)).toBe(1_700_000_000_000);
  });

  it("falls back when exp is missing", () => {
    const before = Date.now();
    const expiresAt = expiresAtFromIdToken(encodeJwt({ sub: "uid-1" }));
    const after = Date.now();
    expect(expiresAt).toBeGreaterThanOrEqual(before + FALLBACK_TTL_MS);
    expect(expiresAt).toBeLessThanOrEqual(after + FALLBACK_TTL_MS);
  });
});

describe("refreshStoredSession", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("returns session tokens from the backend exchange", async () => {
    const idToken = encodeJwt({ sub: "uid-1", email: "a@example.com" });
    invoke.mockResolvedValue({
      id_token: idToken,
      expires_in: 3600,
      user_id: "uid-1",
    });

    const before = Date.now();
    const session = await refreshStoredSession("api-key");
    const after = Date.now();

    expect(invoke).toHaveBeenCalledWith("refresh_session", {
      apiKey: "api-key",
    });
    expect(session).toMatchObject({
      idToken,
      uid: "uid-1",
      email: "a@example.com",
    });
    expect(session).not.toHaveProperty("refreshToken");
    expect(session!.expiresAt).toBeGreaterThanOrEqual(before + 3_600_000);
    expect(session!.expiresAt).toBeLessThanOrEqual(after + 3_600_000);
  });

  it("uses JWT exp when expires_in is missing", async () => {
    const idToken = encodeJwt({ sub: "uid-1", exp: 1_800_000_000 });
    invoke.mockResolvedValue({
      id_token: idToken,
      expires_in: null,
      user_id: null,
    });

    const session = await refreshStoredSession("api-key");
    expect(session?.uid).toBe("uid-1");
    expect(session?.expiresAt).toBe(1_800_000_000_000);
  });

  it("returns null when no session is stored", async () => {
    invoke.mockResolvedValue(null);
    expect(await refreshStoredSession("api-key")).toBeNull();
  });

  it("maps the backend invalid_token error", async () => {
    invoke.mockRejectedValue("invalid_token");
    await expect(refreshStoredSession("api-key")).rejects.toSatisfy(
      (err: unknown) => isInvalidRefreshTokenError(err),
    );
  });

  it("maps any other backend failure to transient", async () => {
    invoke.mockRejectedValue("transient");
    await expect(refreshStoredSession("api-key")).rejects.toSatisfy(
      (err: unknown) => err instanceof SessionError && err.kind === "transient",
    );

    invoke.mockRejectedValue(new Error("IPC unavailable"));
    await expect(refreshStoredSession("api-key")).rejects.toSatisfy(
      (err: unknown) => !isInvalidRefreshTokenError(err),
    );
  });
});
