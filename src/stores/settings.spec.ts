import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSettings = vi.fn();
const saveSettings = vi.fn();
const getDefaultInstallPath = vi.fn();
const openInstallFolder = vi.fn();
const pickInstallDirectory = vi.fn();

vi.mock("@/api/settings", () => ({
  getSettings: (...args: unknown[]) => getSettings(...args),
  saveSettings: (...args: unknown[]) => saveSettings(...args),
  getDefaultInstallPath: (...args: unknown[]) => getDefaultInstallPath(...args),
  openInstallFolder: (...args: unknown[]) => openInstallFolder(...args),
  pickInstallDirectory: (...args: unknown[]) => pickInstallDirectory(...args),
}));

import { useSettingsStore } from "./settings";

describe("useSettingsStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("loads settings into the draft", async () => {
    getSettings.mockResolvedValue({
      install_path: "/custom",
      update_mode: "manual",
    });
    getDefaultInstallPath.mockResolvedValue("/default");

    const store = useSettingsStore();
    await store.load();

    expect(store.installPath).toBe("/custom");
    expect(store.updateMode).toBe("manual");
    expect(store.defaultInstallPath).toBe("/default");
  });

  it("saves path and update mode", async () => {
    getSettings.mockResolvedValue({
      install_path: "/custom",
      update_mode: "auto",
    });
    getDefaultInstallPath.mockResolvedValue("/default");
    saveSettings.mockResolvedValue({
      install_path: "/saved",
      update_mode: "manual",
    });

    const store = useSettingsStore();
    await store.load();
    store.installPath = "/saved";
    store.setAutoUpdates(false);

    const ok = await store.save();

    expect(ok).toBe(true);
    expect(saveSettings).toHaveBeenCalledWith({
      install_path: "/saved",
      update_mode: "manual",
    });
    expect(store.installPath).toBe("/saved");
  });

  it("resets draft path to default", async () => {
    getSettings.mockResolvedValue({
      install_path: "/custom",
      update_mode: "auto",
    });
    getDefaultInstallPath.mockResolvedValue("/default");

    const store = useSettingsStore();
    await store.load();
    store.resetToDefaultPath();

    expect(store.installPath).toBe("/default");
  });

  it("discards unsaved draft changes", async () => {
    getSettings.mockResolvedValue({
      install_path: "/custom",
      update_mode: "auto",
    });
    getDefaultInstallPath.mockResolvedValue("/default");

    const store = useSettingsStore();
    await store.load();
    store.installPath = "/changed";
    store.setAutoUpdates(false);
    store.discard();

    expect(store.installPath).toBe("/custom");
    expect(store.updateMode).toBe("auto");
  });

  it("blocks save with empty path", async () => {
    getSettings.mockResolvedValue({
      install_path: "/custom",
      update_mode: "auto",
    });
    getDefaultInstallPath.mockResolvedValue("/default");

    const store = useSettingsStore();
    await store.load();
    store.installPath = "   ";

    const ok = await store.save();

    expect(ok).toBe(false);
    expect(saveSettings).not.toHaveBeenCalled();
    expect(store.error).toMatch(/empty/i);
  });

  it("keeps usable state when save fails", async () => {
    getSettings.mockResolvedValue({
      install_path: "/custom",
      update_mode: "auto",
    });
    getDefaultInstallPath.mockResolvedValue("/default");
    saveSettings.mockRejectedValue(new Error("disk error"));

    const store = useSettingsStore();
    await store.load();
    store.installPath = "/new";

    const ok = await store.save();

    expect(ok).toBe(false);
    expect(store.error).toBe("disk error");
    expect(store.installPath).toBe("/new");
  });
});
