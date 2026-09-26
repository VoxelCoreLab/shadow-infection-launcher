import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type InstallPhase =
  | "not_installed"
  | "downloading"
  | "extracting"
  | "installed"
  | "failed";

export type ProgressPhase = "download" | "extract";

export type DownloadProgress = {
  version: string;
  size: number;
  bytes: number;
};

export type InstallStatus = {
  phase: InstallPhase;
  install_path: string;
  local_version: string | null;
  last_error: string | null;
  download: DownloadProgress | null;
};

export type InstallProgressUpdate = {
  downloaded: number;
  total: number | null;
  percent: number | null;
  phase: ProgressPhase;
};

const PROGRESS_EVENT = "install-progress";

export async function getInstallStatus(): Promise<InstallStatus> {
  return invoke<InstallStatus>("get_install_status");
}

export async function startInstall(
  url: string,
  version: string,
): Promise<InstallStatus> {
  return invoke<InstallStatus>("start_install", { url, version });
}

export async function uninstallGame(): Promise<InstallStatus> {
  return invoke<InstallStatus>("uninstall_game");
}

export async function launchGame(): Promise<void> {
  return invoke<void>("launch_game");
}

export async function listenInstallProgress(
  onProgress: (update: InstallProgressUpdate) => void,
): Promise<UnlistenFn> {
  return listen<InstallProgressUpdate>(PROGRESS_EVENT, (event) => {
    onProgress(event.payload);
  });
}
