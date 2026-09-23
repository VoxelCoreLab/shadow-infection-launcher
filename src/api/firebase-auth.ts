import { useAuthStore } from "@/stores/auth";

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

/**
 * Retries once after 401 only if the original request already sent Authorization
 * (i.e. the endpoint required auth). Public calls never trigger a token refresh.
 */
export async function fetchWithAuthRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, init);
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
  return fetch(input, { ...init, headers });
}
