import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getInstallStatus = vi.fn();
const startInstall = vi.fn();
const uninstallGame = vi.fn();
const listenInstallProgress = vi.fn();
const fetchDownloadForPlatform = vi.fn();
const getMyLicence = vi.fn();

vi.mock("@/api/install", () => ({
  getInstallStatus: (...args: unknown[]) => getInstallStatus(...args),
  startInstall: (...args: unknown[]) => startInstall(...args),
  uninstallGame: (...args: unknown[]) => uninstallGame(...args),
  listenInstallProgress: (...args: unknown[]) => listenInstallProgress(...args),
}));

vi.mock("@/api/game-downloads", () => ({
  fetchDownloadForPlatform: (...args: unknown[]) =>
    fetchDownloadForPlatform(...args),
}));

vi.mock("@/api/shop", () => ({
  shopApi: {
    gameLicences: {
      gameLicencesControllerGetMyLicence: (...args: unknown[]) =>
        getMyLicence(...args),
    },
  },
}));

import { useInstallStore } from "./install";

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
  });

  it("applies progress events", async () => {
    let handler: ((u: {
      downloaded: number;
      total: number | null;
      percent: number | null;
      phase: "download" | "extract";
    }) => void) | null = null;
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
    let handler: ((u: {
      downloaded: number;
      total: number | null;
      percent: number | null;
      phase: "download" | "extract";
    }) => void) | null = null;
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
    expect(store.error).toMatch(/licence/i);
  });

  it("surfaces shop download errors", async () => {
    getMyLicence.mockResolvedValue({ data: true });
    fetchDownloadForPlatform.mockRejectedValue(new Error("shop down"));

    const store = useInstallStore();
    const ok = await store.startGameInstall();

    expect(ok).toBe(false);
    expect(startInstall).not.toHaveBeenCalled();
    expect(store.error).toBe("shop down");
    expect(store.phase).toBe("failed");
  });

  it("surfaces rust install failures", async () => {
    getMyLicence.mockResolvedValue({ data: true });
    fetchDownloadForPlatform.mockResolvedValue({
      url: "https://cdn.example/game.zip",
      version: "1.0.0",
    });
    startInstall.mockRejectedValue(new Error("disk full"));

    const store = useInstallStore();
    const ok = await store.startGameInstall();

    expect(ok).toBe(false);
    expect(store.error).toBe("disk full");
    expect(store.phase).toBe("failed");
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
});
