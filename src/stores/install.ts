import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type { UnlistenFn } from "@tauri-apps/api/event";
import {
  clearInstallError,
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
import {
  ALREADY_STARTING_MESSAGE,
  ALREADY_UP_TO_DATE_MESSAGE,
  INSTALL_BEFORE_LAUNCH_MESSAGE,
  INSTALL_IN_PROGRESS_MESSAGE,
  LAUNCH_WHILE_INSTALLING_MESSAGE,
  LICENCE_MISSING_MESSAGE,
  mapOperationError,
  NOTHING_TO_UNINSTALL_MESSAGE,
  technicalMessage,
  UNINSTALL_WHILE_INSTALLING_MESSAGE,
  UPDATE_BEFORE_LAUNCH_MESSAGE,
  type OperationKind,
} from "@/lib/operation-errors";
import { detectGameDownloadPlatform } from "@/lib/platform";

/** Keeps Play disabled briefly so spam-clicks cannot spawn many processes. */
export const LAUNCH_COOLDOWN_MS = 1500;

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
  /** `null` until the shop licence check has run. */
  const hasLicence = ref<boolean | null>(null);

  let progressUnlisten: UnlistenFn | null = null;
  let launchCooldownTimer: ReturnType<typeof setTimeout> | null = null;

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
  /** Play when this account has a licence, and the build is installed and up to date. */
  const canPlay = computed(
    () =>
      hasLicence.value === true &&
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

  function showFailure(err: unknown, kind: OperationKind) {
    lastError.value = technicalMessage(err);
    error.value = mapOperationError(err, kind);
  }

  /** Persisted core failure: update when a version is still installed, otherwise install. */
  function showPersistedError() {
    if (!lastError.value) {
      return;
    }
    const kind: OperationKind =
      phase.value === "installed" ? "update" : "install";
    error.value = mapOperationError(lastError.value, kind);
  }

  function clearLaunchCooldown() {
    if (launchCooldownTimer !== null) {
      clearTimeout(launchCooldownTimer);
      launchCooldownTimer = null;
    }
  }

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
    if (
      typeof update.percent === "number" &&
      Number.isFinite(update.percent)
    ) {
      percent.value = update.percent;
    } else if (update.total != null && update.total > 0) {
      percent.value = (update.downloaded / update.total) * 100;
    } else {
      percent.value = 0;
    }
  }

  async function ensureProgressListener() {
    if (progressUnlisten) {
      return;
    }
    progressUnlisten = await listenInstallProgress(applyProgress);
  }

  function applyLicence(valid: boolean) {
    hasLicence.value = valid;
    if (!valid) {
      error.value = LICENCE_MISSING_MESSAGE;
      return;
    }
    if (error.value === LICENCE_MISSING_MESSAGE) {
      error.value = null;
    }
  }

  /** Drop the previous account's licence so the next login cannot inherit Play. */
  function clearLicence() {
    hasLicence.value = null;
    if (error.value === LICENCE_MISSING_MESSAGE) {
      error.value = null;
    }
  }

  async function refreshLicence(): Promise<boolean | null> {
    try {
      const licence =
        await shopApi.gameLicences.gameLicencesControllerGetMyLicence();
      const valid = Boolean(licence.data);
      applyLicence(valid);
      return valid;
    } catch {
      return hasLicence.value;
    }
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
      applyStatus(await getInstallStatus());
      showPersistedError();
    } catch (err) {
      if (!error.value) {
        showFailure(err, "status");
      }
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
    if (hasLicence.value !== false && !lastError.value) {
      error.value = null;
    }
    try {
      const latest = await fetchLatestVersions();
      const platform = detectGameDownloadPlatform();
      remoteVersion.value = latest[platform] ?? null;
      recomputeUpdateAvailable();

      if (
        options.applyAuto &&
        updateAvailable.value &&
        canStartInstall.value &&
        hasLicence.value !== false
      ) {
        const settings = await getSettings();
        if (settings.update_mode === "auto") {
          return startGameInstall();
        }
      }

      return updateAvailable.value;
    } catch (err) {
      showFailure(err, "update");
      return false;
    } finally {
      checkingUpdate.value = false;
    }
  }

  async function startGameInstall(): Promise<boolean> {
    if (!canStartInstall.value) {
      error.value = INSTALL_IN_PROGRESS_MESSAGE;
      return false;
    }
    if (isInstalled.value && !updateAvailable.value && remoteVersion.value) {
      error.value = ALREADY_UP_TO_DATE_MESSAGE;
      return false;
    }

    error.value = null;
    clearLaunchCooldown();
    launching.value = false;

    try {
      const licence =
        await shopApi.gameLicences.gameLicencesControllerGetMyLicence();
      applyLicence(Boolean(licence.data));
      if (!hasLicence.value) {
        return false;
      }

      loading.value = true;
      phase.value = "downloading";
      progressPhase.value = "download";
      percent.value = 0;
      downloaded.value = 0;
      total.value = null;

      await ensureProgressListener();

      const download = await fetchDownloadForPlatform();
      const status = await startInstall(download.url, download.version);
      applyStatus(status);
      if (status.phase === "installed") {
        remoteVersion.value = status.local_version;
        recomputeUpdateAvailable();
      }
      return status.phase === "installed";
    } catch (err) {
      showFailure(err, "install");
      try {
        const status = await getInstallStatus();
        applyStatus(status);
        if (status.last_error) {
          error.value = mapOperationError(
            status.last_error,
            status.phase === "installed" ? "update" : "install",
          );
        }
      } catch {
        phase.value = "failed";
      }
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function uninstall(): Promise<boolean> {
    if (!canUninstall.value) {
      error.value =
        phase.value === "downloading" || phase.value === "extracting"
          ? UNINSTALL_WHILE_INSTALLING_MESSAGE
          : NOTHING_TO_UNINSTALL_MESSAGE;
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
      clearLaunchCooldown();
      launching.value = false;
      return status.phase === "not_installed";
    } catch (err) {
      showFailure(err, "uninstall");
      return false;
    } finally {
      uninstalling.value = false;
    }
  }

  async function launch(): Promise<boolean> {
    if (isBusy.value) {
      error.value = LAUNCH_WHILE_INSTALLING_MESSAGE;
      return false;
    }
    if (launching.value) {
      error.value = ALREADY_STARTING_MESSAGE;
      return false;
    }
    if (!isInstalled.value) {
      error.value = INSTALL_BEFORE_LAUNCH_MESSAGE;
      return false;
    }
    if (updateAvailable.value) {
      error.value = UPDATE_BEFORE_LAUNCH_MESSAGE;
      return false;
    }
    if (hasLicence.value === false) {
      error.value = LICENCE_MISSING_MESSAGE;
      return false;
    }

    error.value = null;
    clearLaunchCooldown();
    launching.value = true;
    try {
      await launchGame();
      // Hold the Starting… state briefly so double-clicks do not spawn extras.
      // After the cooldown, Play is available again for another instance.
      launchCooldownTimer = setTimeout(() => {
        launching.value = false;
        launchCooldownTimer = null;
      }, LAUNCH_COOLDOWN_MS);
      return true;
    } catch (err) {
      launching.value = false;
      showFailure(err, "launch");
      return false;
    }
  }

  function clearError() {
    error.value = null;
  }

  /** Leave `fehlerhaft` without deleting a partial download or an installed build. */
  async function dismissError(): Promise<boolean> {
    try {
      const status = await clearInstallError();
      applyStatus(status);
      error.value = null;
      return true;
    } catch (err) {
      showFailure(err, phase.value === "installed" ? "update" : "install");
      return false;
    }
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
    hasLicence,
    isDownloading,
    isExtracting,
    isBusy,
    isInstalled,
    canStartInstall,
    canInstallOrUpdate,
    canPlay,
    canUninstall,
    refreshStatus,
    refreshLicence,
    clearLicence,
    checkForUpdate,
    startGameInstall,
    uninstall,
    launch,
    clearError,
    dismissError,
    formatBytes,
  };
});
