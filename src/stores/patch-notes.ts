import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type { PatchNoteDto } from "@/api/generated/patch-notes/Api";
import { fetchLatestVersions } from "@/api/game-downloads";
import { fetchPatchNotes } from "@/api/patch-notes";
import { detectGameDownloadPlatform } from "@/lib/platform";
import { mapOperationError } from "@/lib/operation-errors";
import { compareSemver } from "@/lib/semver";
import { useInstallStore } from "@/stores/install";

/** Newest game version first (wireframe timeline), then newest createdAt. */
export function sortNotes(notes: PatchNoteDto[]): PatchNoteDto[] {
  return [...notes].sort((a, b) => {
    const byVersion = compareSemver(b.version, a.version);
    if (byVersion !== 0) {
      return byVersion;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export const usePatchNotesStore = defineStore("patch-notes", () => {
  const notesRaw = ref<PatchNoteDto[]>([]);
  const focusVersion = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const notes = computed(() => sortNotes(notesRaw.value));
  const hasNotes = computed(() => notes.value.length > 0);
  const focusNote = computed(
    () =>
      notes.value.find((note) => note.version === focusVersion.value) ?? null,
  );

  /** Best-effort: local install version, else remote/latest from shop. */
  async function resolveFocusVersion(): Promise<string | null> {
    const install = useInstallStore();
    if (install.localVersion) {
      return install.localVersion;
    }
    if (install.remoteVersion) {
      return install.remoteVersion;
    }

    try {
      const latest = await fetchLatestVersions();
      const platform = detectGameDownloadPlatform();
      return latest[platform] ?? null;
    } catch {
      return null;
    }
  }

  /** Refresh install status so focus version can use local/remote. Failures are ignored. */
  async function syncInstallContext(): Promise<void> {
    const install = useInstallStore();
    await Promise.all([
      install.refreshStatus().catch(() => undefined),
      install.checkForUpdate({ applyAuto: false }).catch(() => undefined),
    ]);
  }

  async function load() {
    loading.value = true;
    error.value = null;

    try {
      await syncInstallContext();
      focusVersion.value = await resolveFocusVersion();
      notesRaw.value = await fetchPatchNotes();
    } catch (err) {
      notesRaw.value = [];
      error.value = mapOperationError(err, "patchNotes");
    } finally {
      loading.value = false;
    }
  }

  function clearError() {
    error.value = null;
  }

  return {
    notes,
    focusVersion,
    focusNote,
    loading,
    error,
    hasNotes,
    load,
    clearError,
  };
});
