use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::AppHandle;

use crate::state::AppState;

use super::response::IpcResponse;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterUrlProtocolResult {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub registered: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UrlProtocolStatus {
    pub registered: bool,
    pub protocol: String,
    pub platform: String,
    pub details: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElevationStatus {
    pub is_elevated: bool,
    pub platform: String,
    pub can_request_elevation: bool,
}

#[tauri::command]
pub async fn check_url_protocol_status(
    _state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<UrlProtocolStatus>, String> {
    let protocol = "secscore";
    eprintln!("[URL Protocol] Checking status for protocol: {}", protocol);

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;

        let ps_check = format!(
            r#"
$ErrorActionPreference = 'SilentlyContinue'
$key = Get-Item 'HKCU:\Software\Classes\{protocol}'
if (-not $key) {{
    Write-Output 'NOT_FOUND'
    exit 0
}}
$urlProtocol = Get-ItemProperty -Path 'HKCU:\Software\Classes\{protocol}' -Name 'URL Protocol'
$command = Get-ItemProperty -Path 'HKCU:\Software\Classes\{protocol}\shell\open\command' -Name '(Default)'
if ($urlProtocol -and $command) {{
    Write-Output 'REGISTERED'
    Write-Output ("CMD:" + $command.'(Default)')
}} else {{
    Write-Output 'PARTIAL'
    Write-Output ("URL_PROTOCOL:" + [string]($null -ne $urlProtocol))
    Write-Output ("COMMAND:" + [string]($null -ne $command))
}}
"#,
            protocol = protocol
        );

        let output = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &ps_check])
            .output();

        let (registered, details) = match output {
            Ok(o) => {
                let stdout = String::from_utf8_lossy(&o.stdout).to_string();
                eprintln!(
                    "[URL Protocol] Windows PowerShell check output: {}",
                    stdout.trim()
                );

                if stdout.contains("REGISTERED") {
                    (
                        true,
                        "URL protocol fully registered in Windows Registry".to_string(),
                    )
                } else if stdout.contains("PARTIAL") {
                    (false, format!("Partial registration: {}", stdout.trim()))
                } else {
                    (
                        false,
                        "Registry key HKCU\\Software\\Classes\\secscore not found".to_string(),
                    )
                }
            }
            Err(e) => {
                eprintln!("[URL Protocol] Windows PowerShell check error: {}", e);
                (false, format!("Failed to check registry: {}", e))
            }
        };

        eprintln!(
            "[URL Protocol] Windows check result: registered={}, {}",
            registered, details
        );

        Ok(IpcResponse::success(UrlProtocolStatus {
            registered,
            protocol: protocol.to_string(),
            platform: "windows".to_string(),
            details,
        }))
    }

    #[cfg(target_os = "macos")]
    {
        let mut registered = false;
        let mut details = String::new();

        let exe_path = std::env::current_exe().unwrap_or_default();
        let app_bundle = find_app_bundle(&exe_path);

        if app_bundle.is_some() {
            let lsregister = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";
            let output = std::process::Command::new(lsregister)
                .args(["-dump"])
                .output();

            match output {
                Ok(o) => {
                    let stdout = String::from_utf8_lossy(&o.stdout);
                    if stdout.contains("secscore") {
                        registered = true;
                        details =
                            "secscore:// registered via Launch Services (app bundle)".to_string();
                    } else {
                        details = "secscore:// not found in Launch Services dump".to_string();
                    }
                }
                Err(e) => {
                    details = format!("Failed to query Launch Services: {}", e);
                }
            }
        }

        if !registered {
            let home = dirs::home_dir().unwrap_or_default();
            let plist_path = home.join("Library/LaunchAgents/com.secscore.url-handler.plist");
            if plist_path.exists() {
                registered = true;
                details = "URL handler plist found at ~/Library/LaunchAgents".to_string();
            } else if details.is_empty() {
                details = "No app bundle or plist found for URL protocol".to_string();
            }
        }

        eprintln!(
            "[URL Protocol] macOS check result: registered={}, {}",
            registered, details
        );

        Ok(IpcResponse::success(UrlProtocolStatus {
            registered,
            protocol: protocol.to_string(),
            platform: "macos".to_string(),
            details,
        }))
    }

    #[cfg(target_os = "linux")]
    {
        let home = dirs::home_dir().unwrap_or_default();
        let desktop_path = home.join(".local/share/applications/secscore.desktop");
        let mut registered = false;
        let mut details = String::new();

        if desktop_path.exists() {
            match std::fs::read_to_string(&desktop_path) {
                Ok(content) => {
                    if content.contains("x-scheme-handler/secscore") {
                        let xdg_output = std::process::Command::new("xdg-settings")
                            .args(["get", "default-url-scheme-handler", "secscore"])
                            .output();

                        match xdg_output {
                            Ok(o) if o.status.success() => {
                                let handler = String::from_utf8_lossy(&o.stdout).trim().to_string();
                                if handler == "secscore.desktop" {
                                    registered = true;
                                    details = "secscore.desktop is default URL scheme handler"
                                        .to_string();
                                } else {
                                    registered = true;
                                    details = format!(
                                        "Desktop file exists with MimeType, but default handler is: {}",
                                        handler
                                    );
                                }
                            }
                            _ => {
                                registered = true;
                                details =
                                    "Desktop file exists with MimeType (xdg-settings query failed)"
                                        .to_string();
                            }
                        }
                    } else {
                        details =
                            "Desktop file exists but missing x-scheme-handler/secscore MimeType"
                                .to_string();
                    }
                }
                Err(e) => {
                    details = format!("Failed to read desktop file: {}", e);
                }
            }
        } else {
            details = "secscore.desktop not found in ~/.local/share/applications".to_string();
        }

        eprintln!(
            "[URL Protocol] Linux check result: registered={}, {}",
            registered, details
        );

        Ok(IpcResponse::success(UrlProtocolStatus {
            registered,
            protocol: protocol.to_string(),
            platform: "linux".to_string(),
            details,
        }))
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Ok(IpcResponse::success(UrlProtocolStatus {
            registered: false,
            protocol: "secscore".to_string(),
            platform: "unknown".to_string(),
            details: "URL protocol check not supported on this platform".to_string(),
        }))
    }
}

#[tauri::command]
pub async fn unregister_url_protocol(
    _state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<RegisterUrlProtocolResult>, String> {
    let protocol = "secscore";
    eprintln!("[URL Protocol] Unregistering protocol: {}", protocol);

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;

        let ps_script = format!(
            r#"
$ErrorActionPreference = 'SilentlyContinue'
Remove-Item -Path 'HKCU:\Software\Classes\{protocol}' -Recurse -Force
if (-not (Test-Path 'HKCU:\Software\Classes\{protocol}')) {{
    Write-Output 'SUCCESS'
}} else {{
    Write-Output 'FAILED'
}}
"#,
            protocol = protocol
        );

        let output = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &ps_script])
            .output();

        let success = match output {
            Ok(o) => {
                let stdout = String::from_utf8_lossy(&o.stdout);
                let ok = o.status.success() && stdout.contains("SUCCESS");
                eprintln!(
                    "[URL Protocol] Windows PowerShell unregister result: {}",
                    ok
                );
                ok
            }
            Err(e) => {
                eprintln!("[URL Protocol] Windows PowerShell unregister error: {}", e);
                false
            }
        };

        return Ok(IpcResponse::success(RegisterUrlProtocolResult {
            registered: Some(!success),
        }));
    }

    #[cfg(target_os = "macos")]
    {
        let exe_path = std::env::current_exe().unwrap_or_default();
        let mut unregistered = true;

        if let Some(bundle_path) = find_app_bundle(&exe_path) {
            let lsregister = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";
            let output = std::process::Command::new(lsregister)
                .args(["-u", &bundle_path.to_string_lossy()])
                .output();

            match output {
                Ok(o) => {
                    eprintln!(
                        "[URL Protocol] macOS lsregister -u result: {}",
                        o.status.success()
                    );
                }
                Err(e) => {
                    eprintln!("[URL Protocol] macOS lsregister -u error: {}", e);
                    unregistered = false;
                }
            }
        }

        let home = dirs::home_dir().unwrap_or_default();
        let plist_path = home.join("Library/LaunchAgents/com.secscore.url-handler.plist");
        if plist_path.exists() {
            match std::fs::remove_file(&plist_path) {
                Ok(_) => {
                    eprintln!("[URL Protocol] macOS plist removed: {:?}", plist_path);
                }
                Err(e) => {
                    eprintln!("[URL Protocol] macOS plist remove error: {}", e);
                    unregistered = false;
                }
            }
        }

        return Ok(IpcResponse::success(RegisterUrlProtocolResult {
            registered: Some(!unregistered),
        }));
    }

    #[cfg(target_os = "linux")]
    {
        use std::fs;

        let home = dirs::home_dir().unwrap_or_default();
        let desktop_path = home.join(".local/share/applications/secscore.desktop");
        let mut unregistered = true;

        if desktop_path.exists() {
            match fs::remove_file(&desktop_path) {
                Ok(_) => {
                    eprintln!(
                        "[URL Protocol] Linux desktop file removed: {:?}",
                        desktop_path
                    );
                    let apps_dir = home.join(".local/share/applications");
                    let _ = std::process::Command::new("update-desktop-database")
                        .arg(apps_dir.to_string_lossy().to_string())
                        .status();
                }
                Err(e) => {
                    eprintln!("[URL Protocol] Linux desktop file remove error: {}", e);
                    unregistered = false;
                }
            }
        }

        return Ok(IpcResponse::success(RegisterUrlProtocolResult {
            registered: Some(!unregistered),
        }));
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Ok(IpcResponse::error(
            "URL protocol unregistration is not supported on this platform",
        ))
    }
}

#[tauri::command]
pub async fn check_elevation(
    _state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<ElevationStatus>, String> {
    #[cfg(target_os = "windows")]
    {
        let is_elevated = check_windows_elevation();
        return Ok(IpcResponse::success(ElevationStatus {
            is_elevated,
            platform: "windows".to_string(),
            can_request_elevation: true,
        }));
    }

    #[cfg(target_os = "macos")]
    {
        let is_elevated = unsafe { libc::geteuid() == 0 };
        return Ok(IpcResponse::success(ElevationStatus {
            is_elevated,
            platform: "macos".to_string(),
            can_request_elevation: true,
        }));
    }

    #[cfg(target_os = "linux")]
    {
        let is_elevated = unsafe { libc::geteuid() == 0 };
        return Ok(IpcResponse::success(ElevationStatus {
            is_elevated,
            platform: "linux".to_string(),
            can_request_elevation: true,
        }));
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Ok(IpcResponse::success(ElevationStatus {
            is_elevated: false,
            platform: "unknown".to_string(),
            can_request_elevation: false,
        }))
    }
}

#[tauri::command]
pub async fn request_elevation(
    app: AppHandle,
    _state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<()>, String> {
    #[cfg(target_os = "windows")]
    {
        let exe_path =
            std::env::current_exe().map_err(|e| format!("Failed to get exe path: {}", e))?;
        let exe_str = exe_path.to_string_lossy().to_string();

        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::UI::Shell::ShellExecuteW;
        use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOW;

        let verb: Vec<u16> = OsStr::new("runas\0").encode_wide().collect();
        let file: Vec<u16> = OsStr::new(&format!("{}\0", exe_str))
            .encode_wide()
            .collect();
        let params: Vec<u16> = OsStr::new("\0").encode_wide().collect();

        let result = unsafe {
            ShellExecuteW(
                0 as _,
                verb.as_ptr(),
                file.as_ptr(),
                params.as_ptr(),
                std::ptr::null(),
                SW_SHOW,
            )
        };

        if result as usize > 32 {
            app.exit(0);
            Ok(IpcResponse::success(()))
        } else {
            Err(format!(
                "Failed to request elevation (ShellExecuteW returned {})",
                result as usize
            ))
        }
    }

    #[cfg(target_os = "macos")]
    {
        let exe_path =
            std::env::current_exe().map_err(|e| format!("Failed to get exe path: {}", e))?;
        let exe_str = exe_path.to_string_lossy().to_string();

        let script = format!(
            "do shell script \"\\\"{}\\\"\" with administrator privileges",
            exe_str
        );

        let status = std::process::Command::new("osascript")
            .args(["-e", &script])
            .status();

        match status {
            Ok(s) if s.success() => {
                app.exit(0);
                Ok(IpcResponse::success(()))
            }
            Ok(s) => Err(format!(
                "Elevation cancelled or failed (exit code: {:?})",
                s.code()
            )),
            Err(e) => Err(format!("Failed to request elevation: {}", e)),
        }
    }

    #[cfg(target_os = "linux")]
    {
        let exe_path =
            std::env::current_exe().map_err(|e| format!("Failed to get exe path: {}", e))?;
        let exe_str = exe_path.to_string_lossy().to_string();

        let status = std::process::Command::new("pkexec").arg(&exe_str).status();

        match status {
            Ok(s) if s.success() => {
                app.exit(0);
                Ok(IpcResponse::success(()))
            }
            Ok(s) => Err(format!(
                "Elevation cancelled or failed (exit code: {:?})",
                s.code()
            )),
            Err(e) => Err(format!("Failed to request elevation: {}", e)),
        }
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        let _ = app;
        Err("Elevation is not supported on this platform".to_string())
    }
}

#[tauri::command]
pub async fn register_url_protocol(
    app: AppHandle,
    _state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<IpcResponse<RegisterUrlProtocolResult>, String> {
    let protocol = "secscore";
    eprintln!(
        "[URL Protocol] Starting registration for protocol: {}",
        protocol
    );

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;

        let exe_path =
            std::env::current_exe().map_err(|e| format!("Failed to get executable path: {}", e))?;
        let exe_path_str = exe_path.to_string_lossy();

        eprintln!("[URL Protocol] Windows: Exe path = {}", exe_path_str);

        let ps_script = format!(
            r#"
$ErrorActionPreference = 'Stop'
try {{
    New-Item -Path 'HKCU:\Software\Classes\{protocol}' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\Software\Classes\{protocol}' -Name '(Default)' -Value 'URL:SecScore Protocol' -Force
    Set-ItemProperty -Path 'HKCU:\Software\Classes\{protocol}' -Name 'URL Protocol' -Value '' -Force
    New-Item -Path 'HKCU:\Software\Classes\{protocol}\DefaultIcon' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\Software\Classes\{protocol}\DefaultIcon' -Name '(Default)' -Value '{exe},1' -Force
    New-Item -Path 'HKCU:\Software\Classes\{protocol}\shell' -Force | Out-Null
    New-Item -Path 'HKCU:\Software\Classes\{protocol}\shell\open' -Force | Out-Null
    New-Item -Path 'HKCU:\Software\Classes\{protocol}\shell\open\command' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\Software\Classes\{protocol}\shell\open\command' -Name '(Default)' -Value '"{exe}" "%1"' -Force
    Write-Output 'SUCCESS'
}} catch {{
    Write-Error $_.Exception.Message
    exit 1
}}
"#,
            protocol = protocol,
            exe = exe_path_str
        );

        let output = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &ps_script])
            .output();

        let mut registered = false;
        match output {
            Ok(o) => {
                let stdout = String::from_utf8_lossy(&o.stdout);
                let stderr = String::from_utf8_lossy(&o.stderr);
                let success = o.status.success() && stdout.contains("SUCCESS");
                eprintln!(
                    "[URL Protocol] Windows PowerShell result: success={}, stdout={}, stderr={}",
                    success,
                    stdout.trim(),
                    stderr.trim()
                );
                if success {
                    let query_cmd = format!(
                        r#"reg query "HKCU\Software\Classes\{}\shell\open\command" /ve"#,
                        protocol
                    );
                    let verify = Command::new("cmd").args(["/C", &query_cmd]).output();
                    registered = verify.map(|v| v.status.success()).unwrap_or(false);
                }
            }
            Err(e) => {
                eprintln!("[URL Protocol] Windows PowerShell error: {}", e);
            }
        }

        eprintln!(
            "[URL Protocol] Windows registration verification: {}",
            registered
        );

        let _ = app;
        return Ok(IpcResponse::success(RegisterUrlProtocolResult {
            registered: Some(registered),
        }));
    }

    #[cfg(target_os = "macos")]
    {
        use std::fs;
        use std::process::Command;

        let exe_path =
            std::env::current_exe().map_err(|e| format!("Failed to get executable path: {}", e))?;

        let app_bundle = find_app_bundle(&exe_path);
        let mut registered = false;

        if let Some(bundle_path) = app_bundle {
            eprintln!(
                "[URL Protocol] macOS: Found app bundle at {:?}",
                bundle_path
            );
            let output = Command::new(
                "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister",
            )
            .args(["-f", &bundle_path.to_string_lossy()])
            .output();

            match output {
                Ok(o) if o.status.success() => {
                    eprintln!("[URL Protocol] macOS: lsregister -f succeeded");
                    registered = true;
                }
                Ok(o) => {
                    eprintln!(
                        "[URL Protocol] macOS: lsregister -f failed (exit: {:?}), trying -R -f",
                        o.status.code()
                    );
                    let _ = Command::new("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister")
                        .args(["-R", "-f", &bundle_path.to_string_lossy()])
                        .output();
                    registered = true;
                }
                Err(e) => {
                    eprintln!("[URL Protocol] macOS: lsregister error: {}", e);
                }
            }
        } else {
            eprintln!("[URL Protocol] macOS: No app bundle found, using plist fallback");
            let home = dirs::home_dir().unwrap_or_default();
            let plist_dir = home.join("Library/LaunchAgents");
            let _ = fs::create_dir_all(&plist_dir);

            let plist_path = plist_dir.join("com.secscore.url-handler.plist");
            let plist_content = format!(
                r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.secscore.url-handler</string>
    <key>ProgramArguments</key>
    <array>
        <string>{}</string>
    </array>
    <key>Sockets</key>
    <dict>
        <key>secscore</key>
        <dict>
            <key>SockServiceName</key>
            <string>secscore</string>
        </dict>
    </dict>
</dict>
</plist>"#,
                exe_path.to_string_lossy()
            );

            match fs::write(&plist_path, plist_content) {
                Ok(_) => {
                    eprintln!("[URL Protocol] macOS: Plist written to {:?}", plist_path);
                    registered = plist_path.exists();
                }
                Err(e) => {
                    eprintln!("[URL Protocol] macOS: Plist write error: {}", e);
                }
            }
        }

        let _ = app;
        return Ok(IpcResponse::success(RegisterUrlProtocolResult {
            registered: Some(registered),
        }));
    }

    #[cfg(target_os = "linux")]
    {
        use std::fs;

        let exe_path =
            std::env::current_exe().map_err(|e| format!("Failed to get executable path: {}", e))?;
        let exe_str = exe_path.to_string_lossy();

        let home = dirs::home_dir().unwrap_or_default();
        let apps_dir = home.join(".local/share/applications");
        let _ = fs::create_dir_all(&apps_dir);

        let desktop_path = apps_dir.join("secscore.desktop");
        let desktop_content = format!(
            r#"[Desktop Entry]
Name=SecScore
Comment=Security Score Application
Exec={} %u
Icon=secscore
Type=Application
Terminal=false
Categories=Utility;
MimeType=x-scheme-handler/secscore;
"#,
            exe_str
        );

        match fs::write(&desktop_path, &desktop_content) {
            Ok(_) => {
                eprintln!(
                    "[URL Protocol] Linux: Desktop file written to {:?}",
                    desktop_path
                );
            }
            Err(e) => {
                eprintln!("[URL Protocol] Linux: Desktop file write error: {}", e);
                let _ = app;
                return Ok(IpcResponse::success(RegisterUrlProtocolResult {
                    registered: Some(false),
                }));
            }
        }

        let update_result = std::process::Command::new("update-desktop-database")
            .arg(apps_dir.to_string_lossy().to_string())
            .status();
        eprintln!(
            "[URL Protocol] Linux: update-desktop-database result: {:?}",
            update_result
        );

        let xdg_set_result = std::process::Command::new("xdg-settings")
            .args([
                "set",
                "default-url-scheme-handler",
                "secscore",
                "secscore.desktop",
            ])
            .status();
        eprintln!(
            "[URL Protocol] Linux: xdg-settings set result: {:?}",
            xdg_set_result
        );

        let xdg_mime_result = std::process::Command::new("xdg-mime")
            .args(["default", "secscore.desktop", "x-scheme-handler/secscore"])
            .status();
        eprintln!(
            "[URL Protocol] Linux: xdg-mime default result: {:?}",
            xdg_mime_result
        );

        let verify_exists = desktop_path.exists();
        let verify_content = fs::read_to_string(&desktop_path).unwrap_or_default();
        let actually_registered =
            verify_exists && verify_content.contains("x-scheme-handler/secscore");

        eprintln!(
            "[URL Protocol] Linux registration verification: {}",
            actually_registered
        );

        let _ = app;
        return Ok(IpcResponse::success(RegisterUrlProtocolResult {
            registered: Some(actually_registered),
        }));
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        let _ = app;
        Ok(IpcResponse::error(
            "URL protocol registration is not supported on this platform",
        ))
    }
}

#[tauri::command]
pub async fn app_quit(
    app: AppHandle,
    _state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

#[tauri::command]
pub async fn app_restart(
    app: AppHandle,
    _state: tauri::State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    app.restart();
}

#[cfg(target_os = "windows")]
fn check_windows_elevation() -> bool {
    use std::process::Command;

    Command::new("net")
        .args(["session"])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[cfg(target_os = "macos")]
fn find_app_bundle(exe_path: &std::path::Path) -> Option<std::path::PathBuf> {
    let mut current = exe_path.parent()?;
    loop {
        if current.extension().map_or(false, |e| e == "app") {
            return Some(current.to_path_buf());
        }
        if !current.parent().map_or(false, |p| p != current) {
            break;
        }
        current = current.parent()?;
    }
    None
}
