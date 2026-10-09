import { beforeEach, describe, expect, it, vi } from "vitest";

const findAll = vi.fn();
const findOne = vi.fn();

vi.mock("./generated/patch-notes/Api", () => ({
  Api: class {
    patchNotes = {
      patchNotesControllerFindAll: (...args: unknown[]) => findAll(...args),
      patchNotesControllerFindOne: (...args: unknown[]) => findOne(...args),
    };
  },
}));

vi.mock("./firebase-auth", () => ({
  firebaseSecurityWorker: vi.fn(),
  fetchWithAuthRetry: vi.fn(),
}));

import { fetchPatchNoteById, fetchPatchNotes } from "./patch-notes";

const sampleNote = {
  id: "11111111-1111-4111-8111-111111111111",
  version: "1.2.3",
  title: "Balance",
  content: "Damage down.",
  createdAt: "2026-09-25T10:00:00.000Z",
  updatedAt: "2026-09-25T10:00:00.000Z",
};

describe("patch-notes", () => {
  beforeEach(() => {
    findAll.mockReset();
    findOne.mockReset();
  });

  it("fetchPatchNotes lists without filter", async () => {
    findAll.mockResolvedValue({ data: [sampleNote] });

    await expect(fetchPatchNotes()).resolves.toEqual([sampleNote]);
    expect(findAll).toHaveBeenCalledWith(undefined);
  });

  it("fetchPatchNotes passes version filter", async () => {
    findAll.mockResolvedValue({ data: [sampleNote] });

    await expect(fetchPatchNotes("1.2.3")).resolves.toEqual([sampleNote]);
    expect(findAll).toHaveBeenCalledWith({ version: "1.2.3" });
  });

  it("fetchPatchNoteById returns one note", async () => {
    findOne.mockResolvedValue({ data: sampleNote });

    await expect(fetchPatchNoteById(sampleNote.id)).resolves.toEqual(
      sampleNote,
    );
    expect(findOne).toHaveBeenCalledWith(sampleNote.id);
  });
});
