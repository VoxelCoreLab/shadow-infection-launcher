import { describe, expect, it } from "vitest";
import {
  ALREADY_STARTING_MESSAGE,
  EMPTY_INSTALL_PATH_MESSAGE,
  FILE_ERROR_MESSAGE,
  INSTALL_FAILED_MESSAGE,
  INSTALL_IN_PROGRESS_MESSAGE,
  LAUNCH_FAILED_MESSAGE,
  LAUNCH_WHILE_INSTALLING_MESSAGE,
  LICENCE_MISSING_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  NOTHING_TO_UNINSTALL_MESSAGE,
  SETTINGS_FAILED_MESSAGE,
  mapOperationError,
  technicalMessage,
} from "./operation-errors";

describe("mapOperationError", () => {
  it("keeps known user sentences", () => {
    expect(
      mapOperationError(new Error(LICENCE_MISSING_MESSAGE), "install"),
    ).toBe(LICENCE_MISSING_MESSAGE);
    expect(
      mapOperationError(new Error(ALREADY_STARTING_MESSAGE), "launch"),
    ).toBe(ALREADY_STARTING_MESSAGE);
    expect(
      mapOperationError(new Error("Nothing to uninstall."), "uninstall"),
    ).toBe(NOTHING_TO_UNINSTALL_MESSAGE);
    expect(
      mapOperationError(
        new Error("install path must not be empty"),
        "settings",
      ),
    ).toBe(EMPTY_INSTALL_PATH_MESSAGE);
  });

  it("maps installation and launch guards from the core", () => {
    expect(
      mapOperationError(
        new Error("an installation is already running"),
        "install",
      ),
    ).toBe(INSTALL_IN_PROGRESS_MESSAGE);
    expect(
      mapOperationError(
        new Error("cannot launch while an installation is running"),
        "launch",
      ),
    ).toBe(LAUNCH_WHILE_INSTALLING_MESSAGE);
  });

  it("maps network failures", () => {
    expect(
      mapOperationError(
        new Error("error sending request: connection refused"),
        "install",
      ),
    ).toBe(NETWORK_ERROR_MESSAGE);
    expect(mapOperationError(new Error("Failed to fetch"), "update")).toBe(
      NETWORK_ERROR_MESSAGE,
    );
  });

  it("maps file failures", () => {
    expect(mapOperationError(new Error("disk full"), "install")).toBe(
      FILE_ERROR_MESSAGE,
    );
    expect(
      mapOperationError(
        new Error("Cannot write /games/build: os error 5"),
        "install",
      ),
    ).toBe(FILE_ERROR_MESSAGE);
  });

  it("replaces unknown exceptions with a general sentence", () => {
    expect(mapOperationError(new Error("shop down"), "install")).toBe(
      INSTALL_FAILED_MESSAGE,
    );
    expect(mapOperationError(new Error("executable missing"), "launch")).toBe(
      LAUNCH_FAILED_MESSAGE,
    );
    expect(mapOperationError("boom", "settings")).toBe(SETTINGS_FAILED_MESSAGE);
    expect(technicalMessage(new Error("shop down"))).toBe("shop down");
  });
});
