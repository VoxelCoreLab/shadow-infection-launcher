import { ref } from "vue";
import { defineStore } from "pinia";
import {
  getDefaultInstallPath,
  getSettings,
  openInstallFolder,
  pickInstallDirectory,
  saveSettings,
  type LauncherSettings,
  type UpdateMode,
} from "@/api/settings";

export const useSettingsStore = defineStore("settings", () => {
  const installPath = ref("");
  const updateMode = ref<UpdateMode>("auto");
  const defaultInstallPath = ref("");
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);

  let snapshot: LauncherSettings | null = null;

  async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const [settings, defaultPath] = await Promise.all([
        getSettings(),
        getDefaultInstallPath(),
      ]);
      applyDraft(settings);
      defaultInstallPath.value = defaultPath;
      snapshot = { ...settings };
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  function applyDraft(settings: LauncherSettings) {
    installPath.value = settings.install_path;
    updateMode.value = settings.update_mode;
  }

  function resetToDefaultPath() {
    if (defaultInstallPath.value) {
      installPath.value = defaultInstallPath.value;
    }
  }

  function discard() {
    if (snapshot) {
      applyDraft(snapshot);
    }
    error.value = null;
  }

  async function browse(): Promise<void> {
    error.value = null;
    try {
      const picked = await pickInstallDirectory();
      if (picked) {
        installPath.value = picked;
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    }
  }

  async function openFolder(): Promise<void> {
    error.value = null;
    try {
      await openInstallFolder();
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    }
  }

  async function save(): Promise<boolean> {
    const trimmed = installPath.value.trim();
    if (!trimmed) {
      error.value = "Install path must not be empty.";
      return false;
    }

    saving.value = true;
    error.value = null;
    try {
      const saved = await saveSettings({
        install_path: trimmed,
        update_mode: updateMode.value,
      });
      applyDraft(saved);
      snapshot = { ...saved };
      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      return false;
    } finally {
      saving.value = false;
    }
  }

  function setAutoUpdates(enabled: boolean) {
    updateMode.value = enabled ? "auto" : "manual";
  }

  return {
    installPath,
    updateMode,
    defaultInstallPath,
    loading,
    saving,
    error,
    load,
    resetToDefaultPath,
    discard,
    browse,
    openFolder,
    save,
    setAutoUpdates,
  };
});
