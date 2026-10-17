import { useAuthStore } from "@/stores/auth";

/** Default HTTP timeout for shop and patch-notes API calls. */
export const API_FETCH_TIMEOUT_MS = 15_000;

const RETRYABLE_STATUS = new Set([502, 503, 504]);

/** Attaches Firebase JWT only when swagger-typescript-api marks the call as secure. */
export async function firebaseSecurityWorker(): Promise<{
  headers: { Authorization: string };
} | void> {
  const token = await useAuthStore().getIdToken();
  if (!token) {
    return;
  }
  return { headers: { Authorization: `Bearer ${token}` } };
}

function mergeAbortSignals(
  timeoutMs: number,
  external?: AbortSignal | null,
): { signal: AbortSignal; cancelTimer: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(
      new DOMException("The operation was aborted.", "TimeoutError"),
    );
  }, timeoutMs);

  const onExternalAbort = () => {
    controller.abort(external?.reason);
  };

  if (external) {
    if (external.aborted) {
      onExternalAbort();
    } else {
      external.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cancelTimer: () => {
      clearTimeout(timer);
      external?.removeEventListener("abort", onExternalAbort);
    },
  };
}

function isRetryableNetworkError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return true;
  }
  if (error instanceof TypeError) {
    return true;
  }
  if (error instanceof Error) {
    return /failed to fetch|network|timed out|timeout|econnreset|econnrefused|enotfound/i.test(
      error.message,
    );
  }
  return false;
}

async function fetchOnce(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const { signal, cancelTimer } = mergeAbortSignals(
    API_FETCH_TIMEOUT_MS,
    init?.signal,
  );

  try {
    return await fetch(input, { ...init, signal });
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      throw new Error("Request timed out");
    }
    throw error;
  } finally {
    cancelTimer();
  }
}

/**
 * One network/5xx retry for transient failures, then the usual single 401
 * token refresh when the original call already sent Authorization.
 */
export async function fetchWithAuthRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetchOnce(input, init);
  } catch (error) {
    if (!isRetryableNetworkError(error)) {
      throw error;
    }
    response = await fetchOnce(input, init);
  }

  if (RETRYABLE_STATUS.has(response.status)) {
    response = await fetchOnce(input, init);
  }

  if (response.status !== 401) {
    return response;
  }

  const hadBearer = new Headers(init?.headers).has("Authorization");
  if (!hadBearer) {
    return response;
  }

  const token = await useAuthStore().refreshSession();
  if (!token) {
    return response;
  }

  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetchOnce(input, { ...init, headers });
}
