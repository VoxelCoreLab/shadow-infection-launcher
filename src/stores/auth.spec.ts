import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionError } from "@/lib/session";

const signInWithEmailAndPassword = vi.fn();
const signInWithCredential = vi.fn();
const googleCredential = vi.fn();
const signOut = vi.fn();
const invoke = vi.fn();
const listen = vi.fn();
const refreshStoredSession = vi.fn();

vi.mock("firebase/auth", () => ({
  signInWithEmailAndPassword: (...args: unknown[]) =>
    signInWithEmailAndPassword(...args),
  signInWithCredential: (...args: unknown[]) => signInWithCredential(...args),
  GoogleAuthProvider: {
    credential: (...args: unknown[]) => googleCredential(...args),
  },
  signOut: (...args: unknown[]) => signOut(...args),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => listen(...args),
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
    refreshStoredSession: (...args: unknown[]) => refreshStoredSession(...args),
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

const GOOGLE_CLIENT_ID = "1234567890-abc.apps.googleusercontent.com";
const GOOGLE_REDIRECT = "https://shadowinfection.com/auth/launcher";
const SHOP_API = "https://shop-api.shadowinfection.com";

type GoogleHandler = (event: { payload: string }) => void;

describe("useAuthStore", () => {
  const googleHandlers = new Map<string, GoogleHandler>();

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    googleHandlers.clear();
    invoke.mockResolvedValue(null);
    refreshStoredSession.mockResolvedValue(null);
    listen.mockImplementation(async (event: string, handler: GoogleHandler) => {
      googleHandlers.set(event, handler);
      return () => {
        googleHandlers.delete(event);
      };
    });
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
    expect(refreshStoredSession).not.toHaveBeenCalled();
  });

  it("drops the SDK's in-memory refresh token after storing it", async () => {
    const order: string[] = [];
    signInWithEmailAndPassword.mockResolvedValue({
      user: {
        uid: "uid-1",
        email: "a@example.com",
        refreshToken: "refresh-1",
        getIdToken: vi
          .fn()
          .mockResolvedValue(idTokenFor("uid-1", "a@example.com")),
      },
    });
    invoke.mockImplementation(async (command: string) => {
      order.push(command);
    });
    signOut.mockImplementation(async () => {
      order.push("signOut");
    });

    const auth = useAuthStore();
    await auth.login("a@example.com", "secret");

    expect(order).toEqual(["store_refresh_token", "signOut"]);
    expect(auth.isLoggedIn).toBe(true);
    expect(invoke).not.toHaveBeenCalledWith("get_refresh_token");
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
    refreshStoredSession.mockResolvedValue({
      idToken: "id-token-2",
      expiresAt: Date.now() + 3_600_000,
      uid: "uid-1",
      email: "a@example.com",
    });

    const auth = useAuthStore();
    await auth.initialize();

    expect(auth.ready).toBe(true);
    expect(auth.isLoggedIn).toBe(true);
    expect(auth.user).toEqual({ uid: "uid-1", email: "a@example.com" });
    expect(refreshStoredSession).toHaveBeenCalledWith("test-api-key");
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
    refreshStoredSession.mockRejectedValue(new SessionError("transient"));

    const auth = useAuthStore();
    await auth.initialize();

    expect(auth.ready).toBe(true);
    expect(auth.isLoggedIn).toBe(false);
    expect(invoke).not.toHaveBeenCalledWith("clear_refresh_token");
  });

  it("stays logged out when the stored refresh token is invalid", async () => {
    // The backend removes the rejected token from the vault itself.
    refreshStoredSession.mockRejectedValue(new SessionError("invalid_token"));

    const auth = useAuthStore();
    await auth.initialize();

    expect(auth.ready).toBe(true);
    expect(auth.isLoggedIn).toBe(false);
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
    // Only the post-login SDK sign-out; logout aborted before reaching it.
    expect(signOut).toHaveBeenCalledTimes(1);
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
    refreshStoredSession.mockResolvedValue({
      idToken: "id-token-fresh",
      expiresAt: Date.now() + 3_600_000,
      uid: "uid-1",
      email: "a@example.com",
    });

    const auth = useAuthStore();
    await auth.login("a@example.com", "secret");

    expect(await auth.getIdToken()).toBe("id-token-fresh");
    expect(refreshStoredSession).toHaveBeenCalledWith("test-api-key");
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
    refreshStoredSession.mockRejectedValue(new SessionError("transient"));

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
    refreshStoredSession.mockRejectedValue(new SessionError("invalid_token"));

    const auth = useAuthStore();
    await auth.login("a@example.com", "secret");

    expect(await auth.getIdToken()).toBeNull();
    expect(auth.isLoggedIn).toBe(false);
  });

  it("shares an in-flight refresh across concurrent getIdToken calls", async () => {
    let resolveExchange: ((value: unknown) => void) | undefined;
    refreshStoredSession.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveExchange = resolve;
        }),
    );

    const auth = useAuthStore();
    const first = auth.getIdToken();
    const second = auth.getIdToken();

    await vi.waitFor(() => {
      expect(resolveExchange).toBeTypeOf("function");
    });
    expect(refreshStoredSession).toHaveBeenCalledTimes(1);

    resolveExchange?.({
      idToken: "id-token-3",
      expiresAt: Date.now() + 3_600_000,
      uid: "uid-1",
      email: "a@example.com",
    });

    expect(await first).toBe("id-token-3");
    expect(await second).toBe("id-token-3");
    expect(refreshStoredSession).toHaveBeenCalledTimes(1);
  });

  it("stores the Firebase refresh token after a Google sign-in", async () => {
    const token = idTokenFor("uid-1", "a@example.com");
    const order: string[] = [];
    googleCredential.mockReturnValue({ providerId: "google.com" });
    signInWithCredential.mockResolvedValue({
      user: {
        uid: "uid-1",
        email: "a@example.com",
        refreshToken: "refresh-1",
        getIdToken: vi.fn().mockResolvedValue(token),
      },
    });
    listen.mockImplementation(async (event: string, handler: GoogleHandler) => {
      order.push(`listen:${event}`);
      googleHandlers.set(event, handler);
      return () => {
        googleHandlers.delete(event);
      };
    });
    invoke.mockImplementation(async (command: string) => {
      order.push(command);
      if (command === "start_google_login") {
        googleHandlers.get("google-login-success")?.({
          payload: "google-id-token",
        });
      }
    });
    signOut.mockImplementation(async () => {
      order.push("signOut");
    });

    const auth = useAuthStore();
    const ok = await auth.loginWithGoogle(
      GOOGLE_CLIENT_ID,
      GOOGLE_REDIRECT,
      SHOP_API,
    );

    expect(ok).toBe(true);
    expect(listen).toHaveBeenCalledWith(
      "google-login-success",
      expect.any(Function),
    );
    expect(googleCredential).toHaveBeenCalledWith("google-id-token");
    expect(signInWithCredential).toHaveBeenCalledWith(
      { name: "mock-auth" },
      { providerId: "google.com" },
    );
    expect(order).toEqual([
      "listen:google-login-success",
      "listen:google-login-error",
      "start_google_login",
      "store_refresh_token",
      "signOut",
    ]);
    expect(invoke).toHaveBeenCalledWith("store_refresh_token", {
      token: "refresh-1",
    });
    expect(auth.isLoggedIn).toBe(true);
    expect(auth.user).toEqual({ uid: "uid-1", email: "a@example.com" });
  });

  it("does not store a refresh token when Google sign-in fails", async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === "start_google_login") {
        googleHandlers.get("google-login-error")?.({
          payload: "failed",
        });
      }
    });

    const auth = useAuthStore();
    const ok = await auth.loginWithGoogle(
      GOOGLE_CLIENT_ID,
      GOOGLE_REDIRECT,
      SHOP_API,
    );

    expect(ok).toBe(false);
    expect(auth.error).toBe("Google sign-in failed. Please try again.");
    expect(auth.isLoggedIn).toBe(false);
    expect(invoke).not.toHaveBeenCalledWith(
      "store_refresh_token",
      expect.anything(),
    );
    expect(signInWithCredential).not.toHaveBeenCalled();
  });

  it("shows the rate limit when Google sign-in is attempted too often", async () => {
    invoke.mockRejectedValue("too_many");

    const auth = useAuthStore();
    const ok = await auth.loginWithGoogle(
      GOOGLE_CLIENT_ID,
      GOOGLE_REDIRECT,
      SHOP_API,
    );

    expect(ok).toBe(false);
    expect(auth.error).toBe(
      "Too many sign-in attempts. Wait a minute and try again.",
    );
  });

  it("times out when the deep link never arrives", async () => {
    vi.useFakeTimers();
    try {
      const auth = useAuthStore();
      const pending = auth.loginWithGoogle(
        GOOGLE_CLIENT_ID,
        GOOGLE_REDIRECT,
        SHOP_API,
      );
      await vi.advanceTimersByTimeAsync(3 * 60 * 1000);

      expect(await pending).toBe(false);
      expect(auth.error).toBe("Google sign-in timed out. Please try again.");
      expect(signInWithCredential).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a missing Google client id without opening the browser", async () => {
    const auth = useAuthStore();
    const ok = await auth.loginWithGoogle("  ", GOOGLE_REDIRECT, SHOP_API);

    expect(ok).toBe(false);
    expect(auth.error).toBe("Google sign-in is not configured.");
    expect(invoke).not.toHaveBeenCalled();
  });
});
