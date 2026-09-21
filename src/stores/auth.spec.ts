import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionError } from "@/lib/session";

const signInWithEmailAndPassword = vi.fn();
const signOut = vi.fn();
const invoke = vi.fn();
const exchangeRefreshToken = vi.fn();

vi.mock("firebase/auth", () => ({
  signInWithEmailAndPassword: (...args: unknown[]) =>
    signInWithEmailAndPassword(...args),
  signOut: (...args: unknown[]) => signOut(...args),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

vi.mock("@/lib/firebase", () => ({
  auth: { name: "mock-auth" },
  firebaseApiKey: "test-api-key",
}));

vi.mock("@/lib/session", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/session")>("@/lib/session");
  return {
    ...actual,
    exchangeRefreshToken: (...args: unknown[]) => exchangeRefreshToken(...args),
  };
});

import { useAuthStore } from "./auth";

function encodeJwt(payload: object): string {
  const json = JSON.stringify(payload);
  const base64 = btoa(json)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `e30.${base64}.sig`;
}

function idTokenFor(
  uid: string,
  email: string,
  expiresInMs = 3_600_000,
): string {
  return encodeJwt({
    sub: uid,
    email,
    exp: Math.floor((Date.now() + expiresInMs) / 1000),
  });
}

describe("useAuthStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    invoke.mockResolvedValue(null);
  });

  it("logs in and stores the refresh token", async () => {
    const token = idTokenFor("uid-1", "a@example.com");
    const getIdToken = vi.fn().mockResolvedValue(token);
    signInWithEmailAndPassword.mockResolvedValue({
      user: {
        uid: "uid-1",
        email: "a@example.com",
        refreshToken: "refresh-1",
        getIdToken,
      },
    });
    invoke.mockResolvedValue(undefined);

    const auth = useAuthStore();
    const ok = await auth.login("a@example.com", "secret");

    expect(ok).toBe(true);
    expect(invoke).toHaveBeenCalledWith("store_refresh_token", {
      token: "refresh-1",
    });
    expect(auth.isLoggedIn).toBe(true);
    expect(auth.user).toEqual({ uid: "uid-1", email: "a@example.com" });
    expect(await auth.getIdToken()).toBe(token);
    expect(exchangeRefreshToken).not.toHaveBeenCalled();
  });

  it("maps invalid credentials to a single error message", async () => {
    signInWithEmailAndPassword.mockRejectedValue({
      code: "auth/invalid-credential",
    });

    const auth = useAuthStore();
    const ok = await auth.login("a@example.com", "bad");

    expect(ok).toBe(false);
    expect(auth.error).toBe("Invalid email or password.");
    expect(auth.isLoggedIn).toBe(false);
    expect(auth.user).toBeNull();
  });

  it("maps user-not-found to the same credential error", async () => {
    signInWithEmailAndPassword.mockRejectedValue({
      code: "auth/user-not-found",
    });

    const auth = useAuthStore();
    await auth.login("missing@example.com", "secret");

    expect(auth.error).toBe("Invalid email or password.");
  });

  it("restores a session from the vault", async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === "get_refresh_token") {
        return "refresh-1";
      }
      return undefined;
    });
    exchangeRefreshToken.mockResolvedValue({
      idToken: "id-token-2",
      refreshToken: "refresh-2",
      expiresAt: Date.now() + 3_600_000,
      uid: "uid-1",
      email: "a@example.com",
    });

    const auth = useAuthStore();
    await auth.initialize();

    expect(auth.ready).toBe(true);
    expect(auth.isLoggedIn).toBe(true);
    expect(auth.user).toEqual({ uid: "uid-1", email: "a@example.com" });
    expect(invoke).toHaveBeenCalledWith("store_refresh_token", {
      token: "refresh-2",
    });
    expect(await auth.getIdToken()).toBe("id-token-2");
  });

  it("stays logged out when the vault is empty", async () => {
    const auth = useAuthStore();
    await auth.initialize();

    expect(auth.ready).toBe(true);
    expect(auth.isLoggedIn).toBe(false);
    expect(await auth.getIdToken()).toBeNull();
  });

  it("does not clear the vault when session restore fails transiently", async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === "get_refresh_token") {
        return "refresh-1";
      }
      return undefined;
    });
    exchangeRefreshToken.mockRejectedValue(new SessionError("transient"));

    const auth = useAuthStore();
    await auth.initialize();

    expect(auth.ready).toBe(true);
    expect(auth.isLoggedIn).toBe(false);
    expect(invoke).not.toHaveBeenCalledWith("clear_refresh_token");
  });

  it("clears the vault when the stored refresh token is invalid", async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === "get_refresh_token") {
        return "refresh-1";
      }
      return undefined;
    });
    exchangeRefreshToken.mockRejectedValue(new SessionError("invalid_token"));

    const auth = useAuthStore();
    await auth.initialize();

    expect(auth.isLoggedIn).toBe(false);
    expect(invoke).toHaveBeenCalledWith("clear_refresh_token");
  });

  it("clears the session and vault on logout", async () => {
    const token = idTokenFor("uid-1", "a@example.com");
    const getIdToken = vi.fn().mockResolvedValue(token);
    signInWithEmailAndPassword.mockResolvedValue({
      user: {
        uid: "uid-1",
        email: "a@example.com",
        refreshToken: "refresh-1",
        getIdToken,
      },
    });
    invoke.mockResolvedValue(undefined);

    const auth = useAuthStore();
    await auth.login("a@example.com", "secret");
    const ok = await auth.logout();

    expect(ok).toBe(true);
    expect(signOut).toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith("clear_refresh_token");
    expect(auth.isLoggedIn).toBe(false);
    expect(auth.user).toBeNull();
    expect(await auth.getIdToken()).toBeNull();
  });

  it("keeps the session when the vault cannot be cleared", async () => {
    const token = idTokenFor("uid-1", "a@example.com");
    signInWithEmailAndPassword.mockResolvedValue({
      user: {
        uid: "uid-1",
        email: "a@example.com",
        refreshToken: "refresh-1",
        getIdToken: vi.fn().mockResolvedValue(token),
      },
    });
    invoke.mockImplementation(async (command: string) => {
      if (command === "clear_refresh_token") {
        throw new Error("vault locked");
      }
      return undefined;
    });

    const auth = useAuthStore();
    await auth.login("a@example.com", "secret");
    const ok = await auth.logout();

    expect(ok).toBe(false);
    expect(auth.isLoggedIn).toBe(true);
    expect(auth.user).toEqual({ uid: "uid-1", email: "a@example.com" });
    expect(auth.error).toBe("Could not sign out. Please try again.");
    expect(signOut).not.toHaveBeenCalled();
  });

  it("refreshes an expired id token", async () => {
    const expired = idTokenFor("uid-1", "a@example.com", 30_000);
    signInWithEmailAndPassword.mockResolvedValue({
      user: {
        uid: "uid-1",
        email: "a@example.com",
        refreshToken: "refresh-1",
        getIdToken: vi.fn().mockResolvedValue(expired),
      },
    });
    invoke.mockImplementation(async (command: string) => {
      if (command === "get_refresh_token") {
        return "refresh-1";
      }
      return undefined;
    });
    exchangeRefreshToken.mockResolvedValue({
      idToken: "id-token-fresh",
      refreshToken: "refresh-2",
      expiresAt: Date.now() + 3_600_000,
      uid: "uid-1",
      email: "a@example.com",
    });

    const auth = useAuthStore();
    await auth.login("a@example.com", "secret");

    expect(await auth.getIdToken()).toBe("id-token-fresh");
    expect(exchangeRefreshToken).toHaveBeenCalledWith(
      "refresh-1",
      "test-api-key",
    );
  });

  it("keeps the vault when a refresh fails transiently", async () => {
    const expired = idTokenFor("uid-1", "a@example.com", 30_000);
    signInWithEmailAndPassword.mockResolvedValue({
      user: {
        uid: "uid-1",
        email: "a@example.com",
        refreshToken: "refresh-1",
        getIdToken: vi.fn().mockResolvedValue(expired),
      },
    });
    invoke.mockImplementation(async (command: string) => {
      if (command === "get_refresh_token") {
        return "refresh-1";
      }
      return undefined;
    });
    exchangeRefreshToken.mockRejectedValue(new SessionError("transient"));

    const auth = useAuthStore();
    await auth.login("a@example.com", "secret");

    expect(await auth.getIdToken()).toBeNull();
    expect(auth.isLoggedIn).toBe(true);
    expect(invoke).not.toHaveBeenCalledWith("clear_refresh_token");
  });

  it("clears the session when a refresh token is invalid", async () => {
    const expired = idTokenFor("uid-1", "a@example.com", 30_000);
    signInWithEmailAndPassword.mockResolvedValue({
      user: {
        uid: "uid-1",
        email: "a@example.com",
        refreshToken: "refresh-1",
        getIdToken: vi.fn().mockResolvedValue(expired),
      },
    });
    invoke.mockImplementation(async (command: string) => {
      if (command === "get_refresh_token") {
        return "refresh-1";
      }
      return undefined;
    });
    exchangeRefreshToken.mockRejectedValue(new SessionError("invalid_token"));

    const auth = useAuthStore();
    await auth.login("a@example.com", "secret");

    expect(await auth.getIdToken()).toBeNull();
    expect(auth.isLoggedIn).toBe(false);
    expect(invoke).toHaveBeenCalledWith("clear_refresh_token");
  });

  it("shares an in-flight refresh across concurrent getIdToken calls", async () => {
    let resolveExchange: ((value: unknown) => void) | undefined;
    exchangeRefreshToken.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveExchange = resolve;
        }),
    );
    invoke.mockImplementation(async (command: string) => {
      if (command === "get_refresh_token") {
        return "refresh-1";
      }
      return undefined;
    });

    const auth = useAuthStore();
    const first = auth.getIdToken();
    const second = auth.getIdToken();

    await vi.waitFor(() => {
      expect(resolveExchange).toBeTypeOf("function");
    });
    expect(exchangeRefreshToken).toHaveBeenCalledTimes(1);

    resolveExchange?.({
      idToken: "id-token-3",
      refreshToken: "refresh-2",
      expiresAt: Date.now() + 3_600_000,
      uid: "uid-1",
      email: "a@example.com",
    });

    expect(await first).toBe("id-token-3");
    expect(await second).toBe("id-token-3");
    expect(exchangeRefreshToken).toHaveBeenCalledTimes(1);
  });
});
