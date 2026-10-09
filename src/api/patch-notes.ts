import type { PatchNoteDto } from "./generated/patch-notes/Api";
import { Api } from "./generated/patch-notes/Api";
import { fetchWithAuthRetry, firebaseSecurityWorker } from "./firebase-auth";

const DEFAULT_PATCH_NOTES_API_URL = "https://patch-notes.shadowinfection.com";

export const patchNotesApi = new Api({
  baseUrl:
    import.meta.env.VITE_PATCH_NOTES_API_URL ?? DEFAULT_PATCH_NOTES_API_URL,
  securityWorker: firebaseSecurityWorker,
  customFetch: fetchWithAuthRetry,
});

/** Public list; optional Major.Minor.Patch filter (at most one note). */
export async function fetchPatchNotes(
  version?: string,
): Promise<PatchNoteDto[]> {
  const res = await patchNotesApi.patchNotes.patchNotesControllerFindAll(
    version ? { version } : undefined,
  );
  return res.data;
}

/** Public detail by UUID. */
export async function fetchPatchNoteById(id: string): Promise<PatchNoteDto> {
  const res =
    await patchNotesApi.patchNotes.patchNotesControllerFindOne(id);
  return res.data;
}
