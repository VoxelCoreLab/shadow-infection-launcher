import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

export type UpdateMode = "auto" | "manual";

export type LauncherSettings = {
  install_path: string;
  update_mode: UpdateMode;
};

export async function getSettings(): Promise<LauncherSettings> {
  return invoke<LauncherSettings>("get_settings");
}

export async function saveSettings(
  settings: LauncherSettings,
): Promise<LauncherSettings> {
  return invoke<LauncherSettings>("save_settings", { settings });
}

export async function getDefaultInstallPath(): Promise<string> {
  return invoke<string>("get_default_install_path");
}

export async function openInstallFolder(): Promise<void> {
  await invoke("open_install_folder");
}

/** Native folder picker via dialog plugin (must not block the Rust IPC thread). */
export async function pickInstallDirectory(): Promise<string | null> {
  const selected = await openDialog({
    directory: true,
    multiple: false,
    title: "Choose install path",
  });
  return typeof selected === "string" ? selected : null;
}
