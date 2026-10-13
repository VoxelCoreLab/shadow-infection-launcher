import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchPatchNotes = vi.fn();
const fetchLatestVersions = vi.fn();
const detectGameDownloadPlatform = vi.fn<(...args: unknown[]) => "macos">(
  () => "macos",
);
const refreshStatus = vi.fn();
const checkForUpdate = vi.fn();

const installState = {
  localVersion: null as string | null,
  remoteVersion: null as string | null,
};

vi.mock("@/api/patch-notes", () => ({
  fetchPatchNotes: (...args: unknown[]) => fetchPatchNotes(...args),
}));

vi.mock("@/api/game-downloads", () => ({
  fetchLatestVersions: (...args: unknown[]) => fetchLatestVersions(...args),
}));

vi.mock("@/lib/platform", () => ({
  detectGameDownloadPlatform: (...args: unknown[]) =>
    detectGameDownloadPlatform(...args),
}));

vi.mock("@/stores/install", () => ({
  useInstallStore: () => ({
    get localVersion() {
      return installState.localVersion;
    },
    get remoteVersion() {
      return installState.remoteVersion;
    },
    refreshStatus: (...args: unknown[]) => refreshStatus(...args),
    checkForUpdate: (...args: unknown[]) => checkForUpdate(...args),
  }),
}));

import { NETWORK_ERROR_MESSAGE } from "@/lib/operation-errors";
import { sortNotes, usePatchNotesStore } from "./patch-notes";

const noteA = {
  id: "11111111-1111-4111-8111-111111111111",
  version: "1.2.3",
  title: "Balance",
  content: "Damage down.",
  createdAt: "2026-09-25T10:00:00.000Z",
  updatedAt: "2026-09-25T10:00:00.000Z",
};

const noteB = {
  id: "22222222-2222-4222-8222-222222222222",
  version: "1.1.0",
  title: "Launch",
  content: "First release.",
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
};

const noteC = {
  id: "33333333-3333-4333-8333-333333333333",
  version: "1.10.0",
  title: "Arena",
  content: "New arena.",
  // Created earlier than 1.2.3 — version order must still win.
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-01T10:00:00.000Z",
};

describe("usePatchNotesStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    installState.localVersion = null;
    installState.remoteVersion = null;
    fetchPatchNotes.mockReset();
    fetchLatestVersions.mockReset();
    refreshStatus.mockReset();
    checkForUpdate.mockReset();
    refreshStatus.mockResolvedValue(undefined);
    checkForUpdate.mockResolvedValue(undefined);
  });

  it("sorts by semantic version descending, not createdAt", () => {
    expect(sortNotes([noteA, noteC, noteB]).map((note) => note.version)).toEqual(
      ["1.10.0", "1.2.3", "1.1.0"],
    );
  });

  it("puts 0.0.94 above 0.0.85 even when 0.0.85 is newer", () => {
    const olderHigher: typeof noteA = {
      ...noteA,
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      version: "0.0.94",
      createdAt: "2026-09-01T10:00:00.000Z",
    };
    const newerLower: typeof noteA = {
      ...noteA,
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      version: "0.0.85",
      createdAt: "2026-10-13T20:00:00.000Z",
    };

    expect(
      sortNotes([newerLower, olderHigher]).map((note) => note.version),
    ).toEqual(["0.0.94", "0.0.85"]);
  });

  it("loads notes and prefers the installed version", async () => {
    installState.localVersion = "1.2.3";
    fetchPatchNotes.mockResolvedValue([noteB, noteA]);

    const store = usePatchNotesStore();
    await store.load();

    expect(store.focusVersion).toBe("1.2.3");
    expect(store.notes.map((note) => note.id)).toEqual([noteA.id, noteB.id]);
    expect(store.focusNote?.id).toBe(noteA.id);
    expect(store.error).toBeNull();
    expect(fetchLatestVersions).not.toHaveBeenCalled();
  });

  it("falls back to latest shop version when nothing is installed", async () => {
    fetchLatestVersions.mockResolvedValue({
      windows: "1.0.0",
      macos: "1.2.3",
      linux: "1.0.0",
    });
    fetchPatchNotes.mockResolvedValue([noteA]);

    const store = usePatchNotesStore();
    await store.load();

    expect(store.focusVersion).toBe("1.2.3");
    expect(fetchLatestVersions).toHaveBeenCalled();
  });

  it("maps network failures to a user-facing message", async () => {
    fetchPatchNotes.mockRejectedValue(new Error("Failed to fetch"));

    const store = usePatchNotesStore();
    await store.load();

    expect(store.notes).toEqual([]);
    expect(store.error).toBe(NETWORK_ERROR_MESSAGE);
  });
});
