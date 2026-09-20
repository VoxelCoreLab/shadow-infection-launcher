import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "./ui";

describe("useUiStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("opens and closes settings", () => {
    const ui = useUiStore();

    expect(ui.isSettingsOpen).toBe(false);

    ui.openSettings();
    expect(ui.isSettingsOpen).toBe(true);

    ui.closeSettings();
    expect(ui.isSettingsOpen).toBe(false);
  });
});
