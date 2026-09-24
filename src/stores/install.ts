import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type { UnlistenFn } from "@tauri-apps/api/event";
import {
  getInstallStatus,
  listenInstallProgress,
  startInstall,
  uninstallGame,
  type InstallPhase,
  type InstallProgressUpdate,
  type InstallStatus,
  type ProgressPhase,
} from "@/api/install";
import { fetchDownloadForPlatform } from "@/api/game-downloads";
import { shopApi } from "@/api/shop";

const LICENCE_MISSING_MESSAGE =
  "No valid licence. Download is not available.";

export const useInstallStore = defineStore("install", () => {
  const phase = ref<InstallPhase>("not_installed");
  const installPath = ref("");
  const localVersion = ref<string | null>(null);
  const lastError = ref<string | null>(null);
  const downloaded = ref(0);
  const total = ref<number | null>(null);
  const percent = ref<number | null>(null);
  const progressPhase = ref<ProgressPhase>("download");
  const loading = ref(false);
  const uninstalling = ref(false);
  const error = ref<string | null>(null);

  let progressUnlisten: UnlistenFn | null = null;

  const isDownloading = computed(() => phase.value === "downloading");
  const isExtracting = computed(() => phase.value === "extracting");
  const isBusy = computed(
    () =>
      loading.value ||
      phase.value === "downloading" ||
      phase.value === "extracting",
  );
  const isInstalled = computed(() => phase.value === "installed");
  const canStartInstall = computed(
    () =>
      !loading.value &&
      phase.value !== "downloading" &&
      phase.value !== "extracting",
  );
  const canUninstall = computed(
    () =>
      !loading.value &&
      !uninstalling.value &&
      phase.value !== "downloading" &&
      phase.value !== "extracting" &&
      (phase.value === "installed" || phase.value === "failed"),
  );

  function applyStatus(status: InstallStatus) {
    phase.value = status.phase;
    installPath.value = status.install_path;
    localVersion.value = status.local_version;
    lastError.value = status.last_error;
    if (status.download) {
      downloaded.value = status.download.bytes;
      total.value = status.download.size;
      percent.value =
        status.download.size > 0
          ? (status.download.bytes / status.download.size) * 100
          : null;
      progressPhase.value = "download";
    }
  }

  function applyProgress(update: InstallProgressUpdate) {
    const nextPhase: ProgressPhase =
      update.phase === "extract" ? "extract" : "download";
    progressPhase.value = nextPhase;
    phase.value = nextPhase === "extract" ? "extracting" : "downloading";
    downloaded.value = update.downloaded ?? 0;
    total.value = update.total ?? null;
    percent.value = update.percent ?? 0;
  }

  async function ensureProgressListener() {
    if (progressUnlisten) {
      return;
    }
    progressUnlisten = await listenInstallProgress(applyProgress);
  }

  async function refreshStatus(): Promise<void> {
    if (
      loading.value ||
      phase.value === "downloading" ||
      phase.value === "extracting"
    ) {
      return;
    }
    try {
      const status = await getInstallStatus();
      applyStatus(status);
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    }
  }

  async function startGameInstall(): Promise<boolean> {
    if (!canStartInstall.value) {
      error.value = "An installation is already in progress.";
      return false;
    }

    error.value = null;
    loading.value = true;
    phase.value = "downloading";
    progressPhase.value = "download";
    percent.value = 0;
    downloaded.value = 0;
    total.value = null;

    try {
      await ensureProgressListener();

      const licence =
        await shopApi.gameLicences.gameLicencesControllerGetMyLicence();
      if (!licence.data) {
        error.value = LICENCE_MISSING_MESSAGE;
        phase.value = "not_installed";
        return false;
      }

      const download = await fetchDownloadForPlatform();
      const status = await startInstall(download.url, download.version);
      applyStatus(status);
      return status.phase === "installed";
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      error.value = message;
      phase.value = "failed";
      lastError.value = message;
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function uninstall(): Promise<boolean> {
    if (!canUninstall.value) {
      error.value =
        phase.value === "downloading" || phase.value === "extracting"
          ? "Cannot uninstall while an installation is running."
          : "Nothing to uninstall.";
      return false;
    }

    error.value = null;
    uninstalling.value = true;
    try {
      const status = await uninstallGame();
      applyStatus(status);
      downloaded.value = 0;
      total.value = null;
      percent.value = null;
      progressPhase.value = "download";
      return status.phase === "not_installed";
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      return false;
    } finally {
      uninstalling.value = false;
    }
  }

  function clearError() {
    error.value = null;
  }

  function formatBytes(value: number | null): string {
    if (value === null || Number.isNaN(value)) {
      return "–";
    }
    if (value < 1024) {
      return `${value} B`;
    }
    if (value < 1024 * 1024) {
      return `${(value / 1024).toFixed(1)} KB`;
    }
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  return {
    phase,
    installPath,
    localVersion,
    lastError,
    downloaded,
    total,
    percent,
    progressPhase,
    loading,
    uninstalling,
    error,
    isDownloading,
    isExtracting,
    isBusy,
    isInstalled,
    canStartInstall,
    canUninstall,
    refreshStatus,
    startGameInstall,
    uninstall,
    clearError,
    formatBytes,
  };
});
