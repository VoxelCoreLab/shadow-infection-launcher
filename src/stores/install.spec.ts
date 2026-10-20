import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getInstallStatus = vi.fn();
const startInstall = vi.fn();
const clearInstallError = vi.fn();
const uninstallGame = vi.fn();
const launchGame = vi.fn();
const listenInstallProgress = vi.fn();
const fetchDownloadForPlatform = vi.fn();
const fetchLatestVersions = vi.fn();
const getSettings = vi.fn();
const getMyLicence = vi.fn();
const detectGameDownloadPlatform = vi.fn<(...args: unknown[]) => "macos">(
  () => "macos",
);

vi.mock("@/api/install", () => ({
  getInstallStatus: (...args: unknown[]) => getInstallStatus(...args),
  startInstall: (...args: unknown[]) => startInstall(...args),
  clearInstallError: (...args: unknown[]) => clearInstallError(...args),
  uninstallGame: (...args: unknown[]) => uninstallGame(...args),
  launchGame: (...args: unknown[]) => launchGame(...args),
  listenInstallProgress: (...args: unknown[]) => listenInstallProgress(...args),
}));

vi.mock("@/api/game-downloads", () => ({
  fetchDownloadForPlatform: (...args: unknown[]) =>
    fetchDownloadForPlatform(...args),
  fetchLatestVersions: (...args: unknown[]) => fetchLatestVersions(...args),
}));

vi.mock("@/api/settings", () => ({
  getSettings: (...args: unknown[]) => getSettings(...args),
}));

vi.mock("@/lib/platform", () => ({
  detectGameDownloadPlatform: (...args: unknown[]) =>
    detectGameDownloadPlatform(...args),
}));

vi.mock("@/api/shop", () => ({
  shopApi: {
    gameLicences: {
      gameLicencesControllerGetMyLicence: (...args: unknown[]) =>
        getMyLicence(...args),
    },
  },
}));

import {
  FILE_ERROR_MESSAGE,
  INSTALL_FAILED_MESSAGE,
  LAUNCH_FAILED_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  UPDATE_CHECK_FAILED_MESSAGE,
} from "@/lib/operation-errors";
import { LAUNCH_COOLDOWN_MS, useInstallStore } from "./install";

describe("useInstallStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    listenInstallProgress.mockResolvedValue(() => undefined);
  });

  it("is busy immediately before startInstall resolves", async () => {
    type InstallStatusResult = {
      phase: string;
      install_path: string;
      local_version: string | null;
      last_error: string | null;
      download: null;
    };
    let resolveInstall: ((status: InstallStatusResult) => void) | undefined;
    getMyLicence.mockResolvedValue({ data: true });
    fetchDownloadForPlatform.mockResolvedValue({
      url: "https://cdn.example/game.zip",
      version: "1.0.0",
    });
    startInstall.mockImplementation(
      () =>
        new Promise<InstallStatusResult>((resolve) => {
          resolveInstall = resolve;
        }),
    );

    const store = useInstallStore();
    const pending = store.startGameInstall();

    await vi.waitFor(() => {
      expect(startInstall).toHaveBeenCalled();
    });

    expect(store.phase).toBe("downloading");
    expect(store.loading).toBe(true);
    expect(store.isBusy).toBe(true);

    expect(resolveInstall).toBeDefined();
    resolveInstall!({
      phase: "installed",
      install_path: "/game",
      local_version: "1.0.0",
      last_error: null,
      download: null,
    });
    await pending;

    expect(store.phase).toBe("installed");
    expect(store.isBusy).toBe(false);
  });

  it("skips refreshStatus while busy", async () => {
    const store = useInstallStore();
    store.phase = "downloading";
    store.loading = true;

    await store.refreshStatus();

    expect(getInstallStatus).not.toHaveBeenCalled();
  });

  it("loads installed status", async () => {
    getInstallStatus.mockResolvedValue({
      phase: "installed",
      install_path: "/games",
      local_version: "1.0.0",
      last_error: null,
      download: null,
    });

    const store = useInstallStore();
    await store.refreshStatus();

    expect(store.phase).toBe("installed");
    expect(store.localVersion).toBe("1.0.0");
    expect(store.installPath).toBe("/games");
  });

  it("starts install when licence is valid", async () => {
    getMyLicence.mockResolvedValue({ data: true });
    fetchDownloadForPlatform.mockResolvedValue({
      url: "https://cdn.example/game.zip",
      version: "1.2.3",
    });
    startInstall.mockResolvedValue({
      phase: "installed",
      install_path: "/game",
      local_version: "1.2.3",
      last_error: null,
      download: null,
    });

    const store = useInstallStore();
    const ok = await store.startGameInstall();

    expect(ok).toBe(true);
    expect(startInstall).toHaveBeenCalledWith(
      "https://cdn.example/game.zip",
      "1.2.3",
    );
    expect(store.phase).toBe("installed");
    expect(store.hasLicence).toBe(true);
  });

  it("applies progress events", async () => {
    let handler:
      | ((u: {
          downloaded: number;
          total: number | null;
          percent: number | null;
          phase: "download" | "extract";
        }) => void)
      | null = null;
    listenInstallProgress.mockImplementation(async (cb) => {
      handler = cb;
      return () => undefined;
    });
    getMyLicence.mockResolvedValue({ data: true });
    fetchDownloadForPlatform.mockResolvedValue({
      url: "https://cdn.example/game.zip",
      version: "1.0.0",
    });
    startInstall.mockImplementation(async () => {
      handler?.({
        downloaded: 50,
        total: 100,
        percent: 50,
        phase: "download",
      });
      return {
        phase: "installed",
        install_path: "/game",
        local_version: "1.0.0",
        last_error: null,
        download: null,
      };
    });

    const store = useInstallStore();
    await store.startGameInstall();

    expect(store.downloaded).toBe(50);
    expect(store.total).toBe(100);
    expect(store.percent).toBe(50);
  });

  it("switches to extracting on extract progress events", async () => {
    let handler:
      | ((u: {
          downloaded: number;
          total: number | null;
          percent: number | null;
          phase: "download" | "extract";
        }) => void)
      | null = null;
    listenInstallProgress.mockImplementation(async (cb) => {
      handler = cb;
      return () => undefined;
    });
    getMyLicence.mockResolvedValue({ data: true });
    fetchDownloadForPlatform.mockResolvedValue({
      url: "https://cdn.example/game.zip",
      version: "1.0.0",
    });
    startInstall.mockImplementation(async () => {
      handler?.({
        downloaded: 100,
        total: 100,
        percent: 100,
        phase: "download",
      });
      handler?.({ downloaded: 10, total: 50, percent: 20, phase: "extract" });
      return {
        phase: "installed",
        install_path: "/game",
        local_version: "1.0.0",
        last_error: null,
        download: null,
      };
    });

    const store = useInstallStore();
    // Capture mid-flight via spy on apply by checking after first extract event
    // before install resolves — startInstall awaits fully, so check last progress
    // was applied then status overwrote. Re-fire extract after resolve:
    await store.startGameInstall();
    // Manually simulate extract event as during install:
    store.phase = "downloading";
    const listenCb = listenInstallProgress.mock.calls[0]?.[0] as
      | ((u: {
          downloaded: number;
          total: number | null;
          percent: number | null;
          phase: "download" | "extract";
        }) => void)
      | undefined;
    listenCb?.({ downloaded: 25, total: 100, percent: 25, phase: "extract" });

    expect(store.phase).toBe("extracting");
    expect(store.progressPhase).toBe("extract");
    expect(store.percent).toBe(25);
    expect(store.isBusy).toBe(true);
  });

  it("blocks download without licence", async () => {
    getMyLicence.mockResolvedValue({ data: false });

    const store = useInstallStore();
    const ok = await store.startGameInstall();

    expect(ok).toBe(false);
    expect(startInstall).not.toHaveBeenCalled();
    expect(store.hasLicence).toBe(false);
    expect(store.error).toMatch(/licence/i);
    expect(store.phase).toBe("not_installed");
  });

  it("remembers a missing licence from the shop check", async () => {
    getMyLicence.mockResolvedValue({ data: false });

    const store = useInstallStore();
    const valid = await store.refreshLicence();

    expect(valid).toBe(false);
    expect(store.hasLicence).toBe(false);
    expect(store.error).toMatch(/licence/i);
  });

  it("does not auto-install when the licence is missing", async () => {
    fetchLatestVersions.mockResolvedValue({
      windows: "1.0.0",
      macos: "2.0.0",
      linux: "1.0.0",
    });
    getSettings.mockResolvedValue({
      install_path: "/games",
      update_mode: "auto",
    });
    getMyLicence.mockResolvedValue({ data: false });

    const store = useInstallStore();
    store.phase = "installed";
    store.localVersion = "1.0.0";
    await store.refreshLicence();

    const available = await store.checkForUpdate({ applyAuto: true });

    expect(available).toBe(true);
    expect(startInstall).not.toHaveBeenCalled();
    expect(store.hasLicence).toBe(false);
    expect(store.error).toMatch(/licence/i);
    expect(store.phase).toBe("installed");
  });

  it("surfaces shop download errors", async () => {
    getMyLicence.mockResolvedValue({ data: true });
    fetchDownloadForPlatform.mockRejectedValue(new Error("shop down"));
    getInstallStatus.mockResolvedValue({
      phase: "not_installed",
      install_path: "/games",
      local_version: null,
      last_error: null,
      download: null,
    });

    const store = useInstallStore();
    const ok = await store.startGameInstall();

    expect(ok).toBe(false);
    expect(startInstall).not.toHaveBeenCalled();
    expect(store.error).toBe(INSTALL_FAILED_MESSAGE);
    expect(store.error).not.toBe("shop down");
    expect(store.phase).toBe("not_installed");
  });

  it("surfaces rust install failures", async () => {
    getMyLicence.mockResolvedValue({ data: true });
    fetchDownloadForPlatform.mockResolvedValue({
      url: "https://cdn.example/game.zip",
      version: "1.0.0",
    });
    startInstall.mockRejectedValue(new Error("disk full"));
    getInstallStatus.mockResolvedValue({
      phase: "failed",
      install_path: "/games",
      local_version: null,
      last_error: "disk full",
      download: { version: "1.0.0", size: 100, bytes: 40 },
    });

    const store = useInstallStore();
    const ok = await store.startGameInstall();

    expect(ok).toBe(false);
    expect(store.error).toBe(FILE_ERROR_MESSAGE);
    expect(store.error).not.toBe("disk full");
    expect(store.lastError).toBe("disk full");
    expect(store.phase).toBe("failed");
    expect(store.downloaded).toBe(40);
  });

  it("keeps the installed version when an update fails", async () => {
    getMyLicence.mockResolvedValue({ data: true });
    fetchDownloadForPlatform.mockResolvedValue({
      url: "https://cdn.example/game.zip",
      version: "2.0.0",
    });
    startInstall.mockRejectedValue(new Error("extract failed"));
    getInstallStatus.mockResolvedValue({
      phase: "installed",
      install_path: "/games",
      local_version: "1.0.0",
      last_error: "extract failed",
      download: null,
    });

    const store = useInstallStore();
    store.phase = "installed";
    store.localVersion = "1.0.0";
    store.remoteVersion = "2.0.0";
    store.updateAvailable = true;
    const ok = await store.startGameInstall();

    expect(ok).toBe(false);
    expect(store.phase).toBe("installed");
    expect(store.localVersion).toBe("1.0.0");
    expect(store.error).toBe(FILE_ERROR_MESSAGE);
    expect(store.error).not.toContain("extract failed");
    expect(store.updateAvailable).toBe(true);
    expect(store.canPlay).toBe(false);
  });

  it("maps network failures without showing the raw message", async () => {
    getMyLicence.mockResolvedValue({ data: true });
    fetchDownloadForPlatform.mockRejectedValue(
      new Error("error sending request: connection refused"),
    );
    getInstallStatus.mockResolvedValue({
      phase: "not_installed",
      install_path: "/games",
      local_version: null,
      last_error: null,
      download: null,
    });

    const store = useInstallStore();
    const ok = await store.startGameInstall();

    expect(ok).toBe(false);
    expect(store.error).toBe(NETWORK_ERROR_MESSAGE);
    expect(store.error).not.toContain("connection refused");
    expect(store.phase).toBe("not_installed");
  });

  it("keeps a persisted error while checking for updates", async () => {
    getInstallStatus.mockResolvedValue({
      phase: "failed",
      install_path: "/games",
      local_version: null,
      last_error: "disk full",
      download: null,
    });
    fetchLatestVersions.mockResolvedValue({
      windows: "1.0.0",
      macos: "1.0.0",
      linux: "1.0.0",
    });

    const store = useInstallStore();
    store.hasLicence = true;
    await store.refreshStatus();
    await store.checkForUpdate();

    expect(store.error).toBe(FILE_ERROR_MESSAGE);
    expect(store.phase).toBe("failed");
  });

  it("keeps the current message when the status read fails", async () => {
    getInstallStatus.mockRejectedValue(new Error("state file locked"));

    const store = useInstallStore();
    store.error = INSTALL_FAILED_MESSAGE;

    await store.refreshStatus();

    expect(store.error).toBe(INSTALL_FAILED_MESSAGE);
    expect(store.error).not.toContain("locked");
  });

  it("shows a stored install error after refresh", async () => {
    getInstallStatus.mockResolvedValue({
      phase: "failed",
      install_path: "/games",
      local_version: null,
      last_error: "disk full",
      download: { version: "1.0.0", size: 100, bytes: 40 },
    });

    const store = useInstallStore();
    await store.refreshStatus();

    expect(store.phase).toBe("failed");
    expect(store.error).toBe(FILE_ERROR_MESSAGE);
    expect(store.error).not.toBe("disk full");
    expect(store.downloaded).toBe(40);
  });

  it("maps a stored update error while the old version stays installed", async () => {
    getInstallStatus.mockResolvedValue({
      phase: "installed",
      install_path: "/games",
      local_version: "1.0.0",
      last_error: "updater blew up",
      download: null,
    });

    const store = useInstallStore();
    await store.refreshStatus();

    expect(store.phase).toBe("installed");
    expect(store.localVersion).toBe("1.0.0");
    expect(store.error).toBe(UPDATE_CHECK_FAILED_MESSAGE);
    expect(store.error).not.toContain("blew up");
  });

  it("clears only the error and keeps a partial download", async () => {
    clearInstallError.mockResolvedValue({
      phase: "not_installed",
      install_path: "/games",
      local_version: null,
      last_error: null,
      download: { version: "1.0.0", size: 100, bytes: 40 },
    });

    const store = useInstallStore();
    store.phase = "failed";
    store.error = INSTALL_FAILED_MESSAGE;
    store.lastError = "disk full";

    const ok = await store.dismissError();

    expect(ok).toBe(true);
    expect(clearInstallError).toHaveBeenCalledOnce();
    expect(store.phase).toBe("not_installed");
    expect(store.error).toBeNull();
    expect(store.lastError).toBeNull();
    expect(store.downloaded).toBe(40);
  });

  it("dismisses an update error without dropping the installed version", async () => {
    clearInstallError.mockResolvedValue({
      phase: "installed",
      install_path: "/games",
      local_version: "1.0.0",
      last_error: null,
      download: null,
    });

    const store = useInstallStore();
    store.phase = "installed";
    store.localVersion = "1.0.0";
    store.error = FILE_ERROR_MESSAGE;
    store.lastError = "extract failed";

    const ok = await store.dismissError();

    expect(ok).toBe(true);
    expect(store.phase).toBe("installed");
    expect(store.localVersion).toBe("1.0.0");
    expect(store.error).toBeNull();
    expect(store.lastError).toBeNull();
  });

  it("rejects a second start while downloading", async () => {
    const store = useInstallStore();
    store.phase = "downloading";
    store.loading = true;

    const ok = await store.startGameInstall();

    expect(ok).toBe(false);
    expect(getMyLicence).not.toHaveBeenCalled();
    expect(store.error).toMatch(/already/i);
  });

  it("uninstalls when installed", async () => {
    uninstallGame.mockResolvedValue({
      phase: "not_installed",
      install_path: "/games",
      local_version: null,
      last_error: null,
      download: null,
    });

    const store = useInstallStore();
    store.phase = "installed";
    store.installPath = "/games";
    store.localVersion = "1.0.0";

    const ok = await store.uninstall();

    expect(ok).toBe(true);
    expect(uninstallGame).toHaveBeenCalledOnce();
    expect(store.phase).toBe("not_installed");
    expect(store.localVersion).toBeNull();
  });

  it("blocks uninstall while downloading", async () => {
    const store = useInstallStore();
    store.phase = "downloading";

    const ok = await store.uninstall();

    expect(ok).toBe(false);
    expect(uninstallGame).not.toHaveBeenCalled();
    expect(store.error).toMatch(/uninstall/i);
  });

  it("detects update when remote version differs", async () => {
    fetchLatestVersions.mockResolvedValue({
      windows: "1.0.0",
      macos: "2.0.0",
      linux: "1.0.0",
    });

    const store = useInstallStore();
    store.phase = "installed";
    store.localVersion = "1.0.0";

    const available = await store.checkForUpdate();

    expect(available).toBe(true);
    expect(store.remoteVersion).toBe("2.0.0");
    expect(store.updateAvailable).toBe(true);
    expect(store.canInstallOrUpdate).toBe(true);
    expect(startInstall).not.toHaveBeenCalled();
  });

  it("does not flag update when versions match", async () => {
    fetchLatestVersions.mockResolvedValue({
      windows: "1.0.0",
      macos: "1.0.0",
      linux: "1.0.0",
    });

    const store = useInstallStore();
    store.phase = "installed";
    store.localVersion = "1.0.0";

    const available = await store.checkForUpdate();

    expect(available).toBe(false);
    expect(store.updateAvailable).toBe(false);
    expect(store.canInstallOrUpdate).toBe(false);
  });

  it("does not flag update when versions match after trim", async () => {
    fetchLatestVersions.mockResolvedValue({
      windows: "1.0.0",
      macos: " 1.0.0 ",
      linux: "1.0.0",
    });

    const store = useInstallStore();
    store.phase = "installed";
    store.localVersion = "1.0.0";

    const available = await store.checkForUpdate();

    expect(available).toBe(false);
    expect(store.updateAvailable).toBe(false);
  });

  it("auto-applies update when settings say auto", async () => {
    fetchLatestVersions.mockResolvedValue({
      windows: "1.0.0",
      macos: "2.0.0",
      linux: "1.0.0",
    });
    getSettings.mockResolvedValue({
      install_path: "/games",
      update_mode: "auto",
    });
    getMyLicence.mockResolvedValue({ data: true });
    fetchDownloadForPlatform.mockResolvedValue({
      url: "https://cdn.example/game.zip",
      version: "2.0.0",
    });
    startInstall.mockResolvedValue({
      phase: "installed",
      install_path: "/game",
      local_version: "2.0.0",
      last_error: null,
      download: null,
    });

    const store = useInstallStore();
    store.phase = "installed";
    store.localVersion = "1.0.0";

    const available = await store.checkForUpdate({ applyAuto: true });

    expect(available).toBe(true);
    expect(startInstall).toHaveBeenCalledWith(
      "https://cdn.example/game.zip",
      "2.0.0",
    );
    expect(store.localVersion).toBe("2.0.0");
    expect(store.updateAvailable).toBe(false);
  });

  it("does not auto-apply when update mode is manual", async () => {
    fetchLatestVersions.mockResolvedValue({
      windows: "1.0.0",
      macos: "2.0.0",
      linux: "1.0.0",
    });
    getSettings.mockResolvedValue({
      install_path: "/games",
      update_mode: "manual",
    });

    const store = useInstallStore();
    store.phase = "installed";
    store.localVersion = "1.0.0";

    const available = await store.checkForUpdate({ applyAuto: true });

    expect(available).toBe(true);
    expect(store.updateAvailable).toBe(true);
    expect(getSettings).toHaveBeenCalledOnce();
    expect(startInstall).not.toHaveBeenCalled();
  });

  it("flags and auto-applies when remote is older than local (forced downpatch)", async () => {
    fetchLatestVersions.mockResolvedValue({
      windows: "1.0.0",
      macos: "1.0.0",
      linux: "1.0.0",
    });
    getSettings.mockResolvedValue({
      install_path: "/games",
      update_mode: "auto",
    });
    getMyLicence.mockResolvedValue({ data: true });
    fetchDownloadForPlatform.mockResolvedValue({
      url: "https://cdn.example/game-1.0.0.zip",
      version: "1.0.0",
    });
    startInstall.mockResolvedValue({
      phase: "installed",
      install_path: "/game",
      local_version: "1.0.0",
      last_error: null,
      download: null,
    });

    const store = useInstallStore();
    store.phase = "installed";
    store.localVersion = "2.0.0";

    const available = await store.checkForUpdate({ applyAuto: true });

    expect(available).toBe(true);
    expect(startInstall).toHaveBeenCalledWith(
      "https://cdn.example/game-1.0.0.zip",
      "1.0.0",
    );
    expect(store.localVersion).toBe("1.0.0");
    expect(store.updateAvailable).toBe(false);
  });

  it("launches when installed and up to date", async () => {
    vi.useFakeTimers();
    launchGame.mockResolvedValue(undefined);

    const store = useInstallStore();
    store.phase = "installed";
    store.localVersion = "1.0.0";
    store.remoteVersion = "1.0.0";
    store.updateAvailable = false;
    store.hasLicence = true;

    expect(store.canPlay).toBe(true);
    const ok = await store.launch();

    expect(ok).toBe(true);
    expect(launchGame).toHaveBeenCalledOnce();
    expect(store.error).toBeNull();
    expect(store.launching).toBe(true);
    expect(store.canPlay).toBe(false);

    await vi.advanceTimersByTimeAsync(LAUNCH_COOLDOWN_MS);
    expect(store.launching).toBe(false);
    expect(store.canPlay).toBe(true);
    vi.useRealTimers();
  });

  it("blocks spam launches during the start cooldown", async () => {
    vi.useFakeTimers();
    launchGame.mockResolvedValue(undefined);

    const store = useInstallStore();
    store.phase = "installed";
    store.localVersion = "1.0.0";
    store.updateAvailable = false;
    store.hasLicence = true;

    expect(await store.launch()).toBe(true);
    expect(await store.launch()).toBe(false);
    expect(launchGame).toHaveBeenCalledOnce();
    expect(store.error).toMatch(/already starting/i);

    await vi.advanceTimersByTimeAsync(LAUNCH_COOLDOWN_MS);
    expect(await store.launch()).toBe(true);
    expect(launchGame).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("blocks launch when not installed", async () => {
    const store = useInstallStore();
    store.phase = "not_installed";

    const ok = await store.launch();

    expect(ok).toBe(false);
    expect(launchGame).not.toHaveBeenCalled();
    expect(store.error).toMatch(/install/i);
  });

  it("blocks launch while downloading", async () => {
    const store = useInstallStore();
    store.phase = "downloading";
    store.loading = true;

    const ok = await store.launch();

    expect(ok).toBe(false);
    expect(launchGame).not.toHaveBeenCalled();
    expect(store.error).toMatch(/installation is running/i);
  });

  it("blocks launch when the account has no licence", async () => {
    const store = useInstallStore();
    store.phase = "installed";
    store.localVersion = "1.0.0";
    store.remoteVersion = "1.0.0";
    store.updateAvailable = false;
    store.hasLicence = false;

    expect(store.canPlay).toBe(false);
    const ok = await store.launch();

    expect(ok).toBe(false);
    expect(launchGame).not.toHaveBeenCalled();
    expect(store.error).toMatch(/licence/i);
  });

  it("blocks launch when update is available", async () => {
    const store = useInstallStore();
    store.phase = "installed";
    store.localVersion = "1.0.0";
    store.remoteVersion = "2.0.0";
    store.updateAvailable = true;

    expect(store.canPlay).toBe(false);
    const ok = await store.launch();

    expect(ok).toBe(false);
    expect(launchGame).not.toHaveBeenCalled();
    expect(store.error).toMatch(/update/i);
  });

  it("surfaces launch failures", async () => {
    launchGame.mockRejectedValue(new Error("executable missing"));

    const store = useInstallStore();
    store.phase = "installed";
    store.localVersion = "1.0.0";
    store.hasLicence = true;

    const ok = await store.launch();

    expect(ok).toBe(false);
    expect(store.error).toBe(LAUNCH_FAILED_MESSAGE);
    expect(store.error).not.toBe("executable missing");
    expect(store.lastError).toBe("executable missing");
  });
});
