import { beforeEach, describe, expect, it, vi } from "vitest";

const getLatest = vi.fn();
const getWindows = vi.fn();
const getMacOs = vi.fn();
const getLinux = vi.fn();

vi.mock("./shop", () => ({
  shopApi: {
    gameDownloads: {
      gameDownloadsControllerGetLatestGameVersions: (...args: unknown[]) =>
        getLatest(...args),
      gameDownloadsControllerGetWindowsDownloadUrl: (...args: unknown[]) =>
        getWindows(...args),
      gameDownloadsControllerGetMacOsDownloadUrl: (...args: unknown[]) =>
        getMacOs(...args),
      gameDownloadsControllerGetLinuxDownloadUrl: (...args: unknown[]) =>
        getLinux(...args),
    },
  },
}));

import {
  fetchDownloadForPlatform,
  fetchLatestVersions,
} from "./game-downloads";

describe("game-downloads", () => {
  beforeEach(() => {
    getLatest.mockReset();
    getWindows.mockReset();
    getMacOs.mockReset();
    getLinux.mockReset();
  });

  it("fetchLatestVersions returns the DTO body", async () => {
    const versions = { windows: "1.0.0", macos: "1.0.1", linux: "1.0.2" };
    getLatest.mockResolvedValue({ data: versions });

    await expect(fetchLatestVersions()).resolves.toEqual(versions);
    expect(getLatest).toHaveBeenCalledOnce();
  });

  it("fetchDownloadForPlatform routes by platform", async () => {
    const payload = { url: "https://cdn.example/game.zip", version: "1.2.3" };
    getMacOs.mockResolvedValue({ data: payload });

    await expect(fetchDownloadForPlatform("macos")).resolves.toEqual(payload);
    expect(getMacOs).toHaveBeenCalledOnce();
    expect(getWindows).not.toHaveBeenCalled();
    expect(getLinux).not.toHaveBeenCalled();
  });
});
