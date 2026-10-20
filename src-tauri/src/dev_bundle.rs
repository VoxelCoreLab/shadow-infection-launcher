//! Debug-only macOS app bundle so `shadowinfection-launcher://` has a handler.
//!
//! Launch Services will not deliver a custom scheme to the raw binary that
//! `tauri dev` starts. Each debug launch installs a small bundle, points the
//! scheme at it, and re-execs that bundle so the running process can receive
//! the Google sign-in callback. When that process exits, the scheme goes back
//! to the installed app.

use std::fs;
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::auth::google::DEEP_LINK_SCHEME;

const ENV_FLAG: &str = "SHADOW_INFECTION_DEV_BUNDLE";
const BUNDLE_ID: &str = "com.voxelcorelab.shadowinfection.launcher.dev";
const LSREGISTER: &str = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";

/// Replaces this process with one Launch Services recognizes as the dev bundle.
/// If setup fails, the normal `tauri dev` process keeps running.
pub fn relaunch_inside_bundle() {
    if std::env::var_os(ENV_FLAG).is_some() {
        // The flag only exists so this relaunch happens once. Drop it so a
        // launched game does not inherit it.
        std::env::remove_var(ENV_FLAG);
        return;
    }

    let Ok(current_exe) = std::env::current_exe() else {
        return;
    };
    let Some((app_dir, bundle_exe)) = install_bundle(&current_exe) else {
        return;
    };
    if !register_handler(&app_dir) {
        eprintln!(
            "{DEEP_LINK_SCHEME}:// was not registered; Google sign-in cannot return to this dev session"
        );
        return;
    }

    eprintln!("Registered {DEEP_LINK_SCHEME}:// for this development session");

    let mut command = Command::new(&bundle_exe);
    command.args(std::env::args_os().skip(1));
    command.env(ENV_FLAG, "1");
    // exec replaces this process with the same binary via its bundle path.
    // On failure it returns and the original process continues.
    let error = command.exec();
    eprintln!("Could not relaunch inside the dev app bundle: {error}");
}

fn install_bundle(current_exe: &Path) -> Option<(PathBuf, PathBuf)> {
    let file_name = current_exe.file_name()?;
    let app_dir = dev_app_dir()?;
    let macos_dir = app_dir.join("Contents/MacOS");
    fs::create_dir_all(&macos_dir).ok()?;
    fs::write(
        app_dir.join("Contents/Info.plist"),
        info_plist(&file_name.to_string_lossy()),
    )
    .ok()?;

    let bundle_exe = macos_dir.join(file_name);
    if bundle_exe != current_exe {
        place_executable(current_exe, &bundle_exe).ok()?;
    }
    Some((app_dir, bundle_exe))
}

fn dev_app_dir() -> Option<PathBuf> {
    Some(
        dirs::data_dir()?
            .join("shadow-infection-launcher-dev-bundle")
            .join("Shadow Infection Launcher Dev.app"),
    )
}

fn place_executable(source: &Path, dest: &Path) -> std::io::Result<()> {
    if dest.exists() {
        fs::remove_file(dest)?;
    }
    match fs::hard_link(source, dest) {
        Ok(()) => Ok(()),
        Err(_) => fs::copy(source, dest).map(|_| ()),
    }
}

fn register_handler(app_dir: &Path) -> bool {
    let registered = Command::new(LSREGISTER)
        .arg("-f")
        .arg(app_dir)
        .status()
        .is_ok_and(|status| status.success());
    registered && crate::url_scheme::claim(BUNDLE_ID)
}

fn info_plist(executable: &str) -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleExecutable</key>
    <string>{}</string>
    <key>CFBundleIdentifier</key>
    <string>{BUNDLE_ID}</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>Shadow Infection Launcher</string>
    <key>CFBundleDisplayName</key>
    <string>Shadow Infection Launcher</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSPrincipalClass</key>
    <string>NSApplication</string>
    <key>CFBundleURLTypes</key>
    <array>
        <dict>
            <key>CFBundleURLName</key>
            <string>{BUNDLE_ID}</string>
            <key>CFBundleURLSchemes</key>
            <array>
                <string>{DEEP_LINK_SCHEME}</string>
            </array>
        </dict>
    </array>
</dict>
</plist>
"#,
        xml_escape(executable)
    )
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plist_claims_the_launcher_scheme() {
        let plist = info_plist("shadow-infection-launcher");
        assert!(plist.contains("<string>shadow-infection-launcher</string>"));
        assert!(plist.contains(&format!("<string>{DEEP_LINK_SCHEME}</string>")));
        assert!(plist.contains(&format!("<string>{BUNDLE_ID}</string>")));
    }

    #[test]
    fn plist_escapes_the_executable_name() {
        let plist = info_plist("a&b<c>");
        assert!(plist.contains("<string>a&amp;b&lt;c&gt;</string>"));
        assert!(!plist.contains("<string>a&b<c></string>"));
    }
}
