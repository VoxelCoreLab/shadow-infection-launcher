// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(all(debug_assertions, target_os = "macos"))]
    shadow_infection_launcher_lib::dev_bundle::relaunch_inside_bundle();

    shadow_infection_launcher_lib::run()
}
