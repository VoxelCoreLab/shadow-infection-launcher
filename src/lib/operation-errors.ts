export const LICENCE_MISSING_MESSAGE =
  "No valid licence. Download is not available.";

export const INSTALL_IN_PROGRESS_MESSAGE =
  "An installation is already in progress.";

export const ALREADY_UP_TO_DATE_MESSAGE = "Game is already up to date.";

export const UNINSTALL_WHILE_INSTALLING_MESSAGE =
  "Cannot uninstall while an installation is running.";

export const NOTHING_TO_UNINSTALL_MESSAGE = "Nothing to uninstall.";

export const LAUNCH_WHILE_INSTALLING_MESSAGE =
  "Cannot launch while an installation is running.";

export const ALREADY_STARTING_MESSAGE = "Game is already starting.";

export const INSTALL_BEFORE_LAUNCH_MESSAGE =
  "Install the game before launching.";

export const UPDATE_BEFORE_LAUNCH_MESSAGE = "Update the game before launching.";

export const EMPTY_INSTALL_PATH_MESSAGE = "Install path must not be empty.";

export const NETWORK_ERROR_MESSAGE =
  "Network error. Check your internet connection.";

export const FILE_ERROR_MESSAGE =
  "Could not access the install files. Check the path and try again.";

export const INSTALL_FAILED_MESSAGE = "Install failed. Please try again.";

export const LAUNCH_FAILED_MESSAGE =
  "Could not start the game. Please try again.";

export const UNINSTALL_FAILED_MESSAGE =
  "Could not uninstall the game. Please try again.";

export const SETTINGS_FAILED_MESSAGE =
  "Could not update settings. Please try again.";

export const STATUS_FAILED_MESSAGE =
  "Could not read the install status. Please try again.";

export const UPDATE_CHECK_FAILED_MESSAGE =
  "Could not check for updates. Please try again.";

export type OperationKind =
  "install" | "launch" | "uninstall" | "settings" | "status" | "update";

const USER_MESSAGES = [
  LICENCE_MISSING_MESSAGE,
  INSTALL_IN_PROGRESS_MESSAGE,
  ALREADY_UP_TO_DATE_MESSAGE,
  UNINSTALL_WHILE_INSTALLING_MESSAGE,
  NOTHING_TO_UNINSTALL_MESSAGE,
  LAUNCH_WHILE_INSTALLING_MESSAGE,
  ALREADY_STARTING_MESSAGE,
  INSTALL_BEFORE_LAUNCH_MESSAGE,
  UPDATE_BEFORE_LAUNCH_MESSAGE,
  EMPTY_INSTALL_PATH_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  FILE_ERROR_MESSAGE,
  INSTALL_FAILED_MESSAGE,
  LAUNCH_FAILED_MESSAGE,
  UNINSTALL_FAILED_MESSAGE,
  SETTINGS_FAILED_MESSAGE,
  STATUS_FAILED_MESSAGE,
  UPDATE_CHECK_FAILED_MESSAGE,
];

const FALLBACK: Record<OperationKind, string> = {
  install: INSTALL_FAILED_MESSAGE,
  launch: LAUNCH_FAILED_MESSAGE,
  uninstall: UNINSTALL_FAILED_MESSAGE,
  settings: SETTINGS_FAILED_MESSAGE,
  status: STATUS_FAILED_MESSAGE,
  update: UPDATE_CHECK_FAILED_MESSAGE,
};

const NETWORK_PATTERN =
  /network|failed to fetch|fetch failed|econnrefused|econnreset|enotfound|etimedout|timed out|timeout|connection refused|error sending request|download failed|offline|\bdns\b/;

const FILE_PATTERN =
  /disk|permission denied|access is denied|os error|no such file|enoent|enospc|eacces|eperm|cannot (create|write|read|clear)|invalid zip|extract failed|not a directory/;

export function technicalMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  return "Unknown error";
}

function knownMessage(text: string): string | null {
  const existing = USER_MESSAGES.find(
    (message) => message.toLowerCase() === text,
  );
  if (existing) {
    return existing;
  }

  if (text.includes("licence") || text.includes("license")) {
    return LICENCE_MISSING_MESSAGE;
  }
  if (text.includes("already starting")) {
    return ALREADY_STARTING_MESSAGE;
  }
  if (text.includes("already up to date")) {
    return ALREADY_UP_TO_DATE_MESSAGE;
  }
  if (text.includes("nothing to uninstall")) {
    return NOTHING_TO_UNINSTALL_MESSAGE;
  }
  if (text.includes("install the game before")) {
    return INSTALL_BEFORE_LAUNCH_MESSAGE;
  }
  if (text.includes("update the game before")) {
    return UPDATE_BEFORE_LAUNCH_MESSAGE;
  }
  if (text.includes("path") && text.includes("empty")) {
    return EMPTY_INSTALL_PATH_MESSAGE;
  }
  if (text.includes("uninstall") && text.includes("installation")) {
    return UNINSTALL_WHILE_INSTALLING_MESSAGE;
  }
  if (text.includes("launch") && text.includes("installation is running")) {
    return LAUNCH_WHILE_INSTALLING_MESSAGE;
  }
  if (
    text.includes("already in progress") ||
    text.includes("already running") ||
    text.includes("installation is running")
  ) {
    return INSTALL_IN_PROGRESS_MESSAGE;
  }
  if (NETWORK_PATTERN.test(text)) {
    return NETWORK_ERROR_MESSAGE;
  }
  if (FILE_PATTERN.test(text)) {
    return FILE_ERROR_MESSAGE;
  }
  return null;
}

export function mapOperationError(error: unknown, kind: OperationKind): string {
  const known = knownMessage(technicalMessage(error).trim().toLowerCase());
  return known ?? FALLBACK[kind];
}
