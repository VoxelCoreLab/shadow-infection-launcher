import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("useAuthStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    invoke.mockResolvedValue(null);
  });

  it("logs in and stores the refresh token", async () => {
    const getIdToken = vi.fn().mockResolvedValue("id-token-1");
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
    expect(await auth.getIdToken()).toBe("id-token-1");
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

  it("clears the session and vault on logout", async () => {
    const getIdToken = vi.fn().mockResolvedValue("id-token-1");
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
    await auth.logout();

    expect(signOut).toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith("clear_refresh_token");
    expect(auth.isLoggedIn).toBe(false);
    expect(auth.user).toBeNull();
    expect(await auth.getIdToken()).toBeNull();
  });
});
