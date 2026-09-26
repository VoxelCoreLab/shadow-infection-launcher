import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type { UnlistenFn } from "@tauri-apps/api/event";
import {
  getInstallStatus,
  launchGame,
  listenInstallProgress,
  startInstall,
  uninstallGame,
  type InstallPhase,
  type InstallProgressUpdate,
  type InstallStatus,
  type ProgressPhase,
} from "@/api/install";
import {
  fetchDownloadForPlatform,
  fetchLatestVersions,
} from "@/api/game-downloads";
import { getSettings } from "@/api/settings";
import { shopApi } from "@/api/shop";
import { detectGameDownloadPlatform } from "@/lib/platform";

const LICENCE_MISSING_MESSAGE =
  "No valid licence. Download is not available.";

export const useInstallStore = defineStore("install", () => {
  const phase = ref<InstallPhase>("not_installed");
  const installPath = ref("");
  const localVersion = ref<string | null>(null);
  const remoteVersion = ref<string | null>(null);
  const updateAvailable = ref(false);
  const lastError = ref<string | null>(null);
  const downloaded = ref(0);
  const total = ref<number | null>(null);
  const percent = ref<number | null>(null);
  const progressPhase = ref<ProgressPhase>("download");
  const loading = ref(false);
  const checkingUpdate = ref(false);
  const uninstalling = ref(false);
  const launching = ref(false);
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
  /** Install when missing, or update when a newer remote version is known. */
  const canInstallOrUpdate = computed(
    () =>
      canStartInstall.value && (!isInstalled.value || updateAvailable.value),
  );
  /** Play when installed and up to date (no install/update in progress). */
  const canPlay = computed(
    () =>
      isInstalled.value &&
      !updateAvailable.value &&
      !isBusy.value &&
      !checkingUpdate.value &&
      !launching.value,
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
    recomputeUpdateAvailable();
  }

  // Inequality only — no SemVer "greater than". Shop can force a downpatch
  // by pointing latest at an older build (e.g. after a game-breaking release).
  function recomputeUpdateAvailable() {
    const local = localVersion.value?.trim() ?? null;
    const remote = remoteVersion.value?.trim() ?? null;
    updateAvailable.value =
      phase.value === "installed" &&
      local !== null &&
      remote !== null &&
      local !== "" &&
      remote !== "" &&
      local !== remote;
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

  /**
   * Compare local install with Shop latest version for this platform.
   * When `applyAuto` is true and settings say auto, start the update install.
   */
  async function checkForUpdate(
    options: { applyAuto?: boolean } = {},
  ): Promise<boolean> {
    if (isBusy.value) {
      return false;
    }

    checkingUpdate.value = true;
    error.value = null;
    try {
      const latest = await fetchLatestVersions();
      const platform = detectGameDownloadPlatform();
      remoteVersion.value = latest[platform] ?? null;
      recomputeUpdateAvailable();

      if (
        options.applyAuto &&
        updateAvailable.value &&
        canStartInstall.value
      ) {
        const settings = await getSettings();
        if (settings.update_mode === "auto") {
          return startGameInstall();
        }
      }

      return updateAvailable.value;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      return false;
    } finally {
      checkingUpdate.value = false;
    }
  }

  async function startGameInstall(): Promise<boolean> {
    if (!canStartInstall.value) {
      error.value = "An installation is already in progress.";
      return false;
    }
    if (isInstalled.value && !updateAvailable.value && remoteVersion.value) {
      error.value = "Game is already up to date.";
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
      if (status.phase === "installed") {
        remoteVersion.value = status.local_version;
        recomputeUpdateAvailable();
      }
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
      remoteVersion.value = null;
      updateAvailable.value = false;
      return status.phase === "not_installed";
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      return false;
    } finally {
      uninstalling.value = false;
    }
  }

  async function launch(): Promise<boolean> {
    if (isBusy.value || launching.value) {
      error.value = "Cannot launch while an installation is running.";
      return false;
    }
    if (!isInstalled.value) {
      error.value = "Install the game before launching.";
      return false;
    }
    if (updateAvailable.value) {
      error.value = "Update the game before launching.";
      return false;
    }

    error.value = null;
    launching.value = true;
    try {
      await launchGame();
      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      return false;
    } finally {
      launching.value = false;
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
    remoteVersion,
    updateAvailable,
    lastError,
    downloaded,
    total,
    percent,
    progressPhase,
    loading,
    checkingUpdate,
    uninstalling,
    launching,
    error,
    isDownloading,
    isExtracting,
    isBusy,
    isInstalled,
    canStartInstall,
    canInstallOrUpdate,
    canPlay,
    canUninstall,
    refreshStatus,
    checkForUpdate,
    startGameInstall,
    uninstall,
    launch,
    clearError,
    formatBytes,
  };
});
