import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decodeIdTokenClaims,
  exchangeRefreshToken,
  expiresAtFromIdToken,
  FALLBACK_TTL_MS,
  isInvalidRefreshTokenError,
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

describe("exchangeRefreshToken", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns session tokens from a successful exchange", async () => {
    const idToken = encodeJwt({ sub: "uid-1", email: "a@example.com" });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        id_token: idToken,
        refresh_token: "refresh-2",
        expires_in: "3600",
        user_id: "uid-1",
      }),
    });

    const before = Date.now();
    const session = await exchangeRefreshToken("refresh-1", "api-key");
    const after = Date.now();

    expect(session).toMatchObject({
      idToken,
      refreshToken: "refresh-2",
      uid: "uid-1",
      email: "a@example.com",
    });
    expect(session.expiresAt).toBeGreaterThanOrEqual(before + 3_600_000);
    expect(session.expiresAt).toBeLessThanOrEqual(after + 3_600_000);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://securetoken.googleapis.com/v1/token?key=api-key",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("uses JWT exp when expires_in is missing", async () => {
    const idToken = encodeJwt({
      sub: "uid-1",
      exp: 1_800_000_000,
    });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        id_token: idToken,
        refresh_token: "refresh-2",
      }),
    });

    const session = await exchangeRefreshToken("refresh-1", "api-key");
    expect(session.expiresAt).toBe(1_800_000_000_000);
  });

  it("marks INVALID_REFRESH_TOKEN as invalid_token", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: { message: "INVALID_REFRESH_TOKEN" },
      }),
    });

    await expect(exchangeRefreshToken("bad", "api-key")).rejects.toSatisfy(
      (err: unknown) => isInvalidRefreshTokenError(err),
    );
  });

  it("marks INVALID_GRANT as invalid_token", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: { message: "invalid_grant" },
      }),
    });

    await expect(exchangeRefreshToken("bad", "api-key")).rejects.toSatisfy(
      (err: unknown) => isInvalidRefreshTokenError(err),
    );
  });

  it("marks a network failure as transient", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    try {
      await exchangeRefreshToken("refresh-1", "api-key");
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SessionError);
      expect((err as SessionError).kind).toBe("transient");
      expect(isInvalidRefreshTokenError(err)).toBe(false);
    }
  });

  it("marks a 5xx response as transient", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: { message: "UNAVAILABLE" } }),
    });

    try {
      await exchangeRefreshToken("refresh-1", "api-key");
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SessionError);
      expect((err as SessionError).kind).toBe("transient");
    }
  });
});
