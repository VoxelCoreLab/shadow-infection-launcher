import { Api } from "./generated/patch-notes/Api";
import {
  fetchWithAuthRetry,
  firebaseSecurityWorker,
} from "./firebase-auth";

const DEFAULT_PATCH_NOTES_API_URL =
  "https://patch-notes.shadowinfection.com";

export const patchNotesApi = new Api({
  baseUrl:
    import.meta.env.VITE_PATCH_NOTES_API_URL ?? DEFAULT_PATCH_NOTES_API_URL,
  securityWorker: firebaseSecurityWorker,
  customFetch: fetchWithAuthRetry,
});
