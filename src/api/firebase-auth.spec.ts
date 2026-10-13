import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getIdToken = vi.fn();
const refreshSession = vi.fn();

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    getIdToken: (...args: unknown[]) => getIdToken(...args),
    refreshSession: (...args: unknown[]) => refreshSession(...args),
  }),
}));

import { API_FETCH_TIMEOUT_MS, fetchWithAuthRetry } from "./firebase-auth";

describe("fetchWithAuthRetry", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    getIdToken.mockReset();
    refreshSession.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns the first successful response", async () => {
    fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));

    const response = await fetchWithAuthRetry("https://example.test/notes");

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("retries once after a network failure", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const response = await fetchWithAuthRetry("https://example.test/notes");

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries once after a 503", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("down", { status: 503 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const response = await fetchWithAuthRetry("https://example.test/notes");

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refreshes the session once after 401 when a bearer was sent", async () => {
    refreshSession.mockResolvedValue("new-token");
    fetchMock
      .mockResolvedValueOnce(new Response("auth", { status: 401 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const response = await fetchWithAuthRetry("https://example.test/secure", {
      headers: { Authorization: "Bearer old-token" },
    });

    expect(response.status).toBe(200);
    expect(refreshSession).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("Authorization")).toBe(
      "Bearer new-token",
    );
  });

  it("does not refresh after 401 on public calls", async () => {
    fetchMock.mockResolvedValue(new Response("auth", { status: 401 }));

    const response = await fetchWithAuthRetry("https://example.test/public");

    expect(response.status).toBe(401);
    expect(refreshSession).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("aborts slow requests with a timeout error", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(init.signal?.reason ?? new DOMException("aborted", "AbortError"));
          });
        }),
    );

    const pending = fetchWithAuthRetry("https://example.test/slow");
    const assertion = expect(pending).rejects.toThrow("Request timed out");
    await vi.advanceTimersByTimeAsync(API_FETCH_TIMEOUT_MS);
    // One retry after the first timeout.
    await vi.advanceTimersByTimeAsync(API_FETCH_TIMEOUT_MS);
    await assertion;
  });
});
