use serde::{Deserialize, Serialize};

use super::permission::PermissionLevel;
use super::security::SecurityService;
use super::settings::SettingsService;

pub const SETTINGS_SECURITY_ADMIN: &str = "security_admin_password";
pub const SETTINGS_SECURITY_POINTS: &str = "security_points_password";
pub const SETTINGS_SECURITY_RECOVERY: &str = "security_recovery_string";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthStatus {
    pub permission: String,
    pub has_admin_password: bool,
    pub has_points_password: bool,
    pub has_recovery_string: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginResult {
    pub success: bool,
    pub permission: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetPasswordsPayload {
    pub admin_password: Option<String>,
    pub points_password: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetPasswordsResult {
    pub success: bool,
    pub recovery_string: Option<String>,
    pub message: Option<String>,
}

pub struct AuthService;

impl Default for AuthService {
    fn default() -> Self {
        Self::new()
    }
}

impl AuthService {
    pub fn new() -> Self {
        Self
    }

    pub fn get_status(
        settings: &SettingsService,
        sender_id: Option<u32>,
        permissions: &mut super::permission::PermissionService,
    ) -> AuthStatus {
        let permission = if let Some(id) = sender_id {
            permissions.get_permission(id)
        } else {
            permissions.get_default_permission()
        };

        AuthStatus {
            permission: permission.as_str().to_string(),
            has_admin_password: settings.has_secret(SETTINGS_SECURITY_ADMIN),
            has_points_password: settings.has_secret(SETTINGS_SECURITY_POINTS),
            has_recovery_string: settings.has_secret(SETTINGS_SECURITY_RECOVERY),
        }
    }

    pub async fn login(
        settings: &mut SettingsService,
        security: &SecurityService,
        permissions: &mut super::permission::PermissionService,
        sender_id: u32,
        password: &str,
        iv_hex: &str,
    ) -> LoginResult {
        if !SecurityService::is_six_digit(password) {
            permissions.set_permission(sender_id, permissions.get_default_permission());
            return LoginResult {
                success: false,
                permission: None,
                message: Some("Invalid password format".to_string()),
            };
        }

        let admin_cipher = settings.get_raw(SETTINGS_SECURITY_ADMIN);
        let points_cipher = settings.get_raw(SETTINGS_SECURITY_POINTS);

        let admin_plain = security
            .decrypt_secret(&admin_cipher, iv_hex)
            .unwrap_or_default();
        let points_plain = security
            .decrypt_secret(&points_cipher, iv_hex)
            .unwrap_or_default();

        if !admin_cipher.is_empty() && admin_plain == password {
            permissions.set_permission(sender_id, PermissionLevel::Admin);
            return LoginResult {
                success: true,
                permission: Some("admin".to_string()),
                message: None,
            };
        }

        if !points_cipher.is_empty() && points_plain == password {
            permissions.set_permission(sender_id, PermissionLevel::Points);
            return LoginResult {
                success: true,
                permission: Some("points".to_string()),
                message: None,
            };
        }

        permissions.set_permission(sender_id, permissions.get_default_permission());
        LoginResult {
            success: false,
            permission: None,
            message: Some("Password incorrect".to_string()),
        }
    }

    pub fn logout(
        permissions: &mut super::permission::PermissionService,
        sender_id: u32,
    ) -> PermissionLevel {
        let default = permissions.get_default_permission();
        permissions.set_permission(sender_id, default);
        default
    }

    pub async fn set_passwords(
        settings: &mut SettingsService,
        security: &SecurityService,
        permissions: &mut super::permission::PermissionService,
        sender_id: u32,
        payload: SetPasswordsPayload,
        iv_hex: &str,
    ) -> SetPasswordsResult {
        let has_admin = settings.has_secret(SETTINGS_SECURITY_ADMIN);
        if has_admin && !permissions.require_permission(sender_id, PermissionLevel::Admin) {
            return SetPasswordsResult {
                success: false,
                recovery_string: None,
                message: Some("Permission denied".to_string()),
            };
        }

        if let Some(admin_pwd) = payload.admin_password {
            let trimmed = admin_pwd.trim();
            if trimmed.is_empty() {
                let _ = settings.set_raw(SETTINGS_SECURITY_ADMIN, "").await;
            } else {
                if !SecurityService::is_six_digit(trimmed) {
                    return SetPasswordsResult {
                        success: false,
                        recovery_string: None,
                        message: Some("Admin password must be 6 digits".to_string()),
                    };
                }
                match security.encrypt_secret(trimmed, iv_hex) {
                    Ok(encrypted) => {
                        let _ = settings.set_raw(SETTINGS_SECURITY_ADMIN, &encrypted).await;
                    }
                    Err(e) => {
                        return SetPasswordsResult {
                            success: false,
                            recovery_string: None,
                            message: Some(format!("Encryption failed: {}", e)),
                        };
                    }
                }
            }
        }

        if let Some(points_pwd) = payload.points_password {
            let trimmed = points_pwd.trim();
            if trimmed.is_empty() {
                let _ = settings.set_raw(SETTINGS_SECURITY_POINTS, "").await;
            } else {
                if !SecurityService::is_six_digit(trimmed) {
                    return SetPasswordsResult {
                        success: false,
                        recovery_string: None,
                        message: Some("Points password must be 6 digits".to_string()),
                    };
                }
                match security.encrypt_secret(trimmed, iv_hex) {
                    Ok(encrypted) => {
                        let _ = settings.set_raw(SETTINGS_SECURITY_POINTS, &encrypted).await;
                    }
                    Err(e) => {
                        return SetPasswordsResult {
                            success: false,
                            recovery_string: None,
                            message: Some(format!("Encryption failed: {}", e)),
                        };
                    }
                }
            }
        }

        if !settings.has_secret(SETTINGS_SECURITY_RECOVERY) {
            let recovery = SecurityService::generate_recovery_string();
            match security.encrypt_secret(&recovery, iv_hex) {
                Ok(encrypted) => {
                    let _ = settings
                        .set_raw(SETTINGS_SECURITY_RECOVERY, &encrypted)
                        .await;
                    return SetPasswordsResult {
                        success: true,
                        recovery_string: Some(recovery),
                        message: None,
                    };
                }
                Err(e) => {
                    return SetPasswordsResult {
                        success: false,
                        recovery_string: None,
                        message: Some(format!("Failed to encrypt recovery: {}", e)),
                    };
                }
            }
        }

        SetPasswordsResult {
            success: true,
            recovery_string: None,
            message: None,
        }
    }

    pub async fn generate_recovery(
        settings: &mut SettingsService,
        security: &SecurityService,
        permissions: &mut super::permission::PermissionService,
        sender_id: u32,
        iv_hex: &str,
    ) -> SetPasswordsResult {
        if settings.has_secret(SETTINGS_SECURITY_ADMIN)
            && !permissions.require_permission(sender_id, PermissionLevel::Admin)
        {
            return SetPasswordsResult {
                success: false,
                recovery_string: None,
                message: Some("Permission denied".to_string()),
            };
        }

        let recovery = SecurityService::generate_recovery_string();
        match security.encrypt_secret(&recovery, iv_hex) {
            Ok(encrypted) => {
                let _ = settings
                    .set_raw(SETTINGS_SECURITY_RECOVERY, &encrypted)
                    .await;
                SetPasswordsResult {
                    success: true,
                    recovery_string: Some(recovery),
                    message: None,
                }
            }
            Err(e) => SetPasswordsResult {
                success: false,
                recovery_string: None,
                message: Some(format!("Failed to encrypt recovery: {}", e)),
            },
        }
    }

    pub async fn reset_by_recovery(
        settings: &mut SettingsService,
        security: &SecurityService,
        permissions: &mut super::permission::PermissionService,
        sender_id: u32,
        recovery_string: &str,
        iv_hex: &str,
    ) -> SetPasswordsResult {
        let cipher = settings.get_raw(SETTINGS_SECURITY_RECOVERY);
        let plain = security.decrypt_secret(&cipher, iv_hex).unwrap_or_default();

        if plain.is_empty() || plain != recovery_string.trim() {
            return SetPasswordsResult {
                success: false,
                recovery_string: None,
                message: Some("Recovery string incorrect".to_string()),
            };
        }

        let _ = settings.set_raw(SETTINGS_SECURITY_ADMIN, "").await;
        let _ = settings.set_raw(SETTINGS_SECURITY_POINTS, "").await;

        let new_recovery = SecurityService::generate_recovery_string();
        match security.encrypt_secret(&new_recovery, iv_hex) {
            Ok(encrypted) => {
                let _ = settings
                    .set_raw(SETTINGS_SECURITY_RECOVERY, &encrypted)
                    .await;
            }
            Err(e) => {
                return SetPasswordsResult {
                    success: false,
                    recovery_string: None,
                    message: Some(format!("Failed to encrypt new recovery: {}", e)),
                };
            }
        }

        permissions.set_permission(sender_id, permissions.get_default_permission());
        SetPasswordsResult {
            success: true,
            recovery_string: Some(new_recovery),
            message: None,
        }
    }

    pub async fn clear_all(
        settings: &mut SettingsService,
        permissions: &mut super::permission::PermissionService,
        sender_id: u32,
    ) -> Result<(), String> {
        if !permissions.require_permission(sender_id, PermissionLevel::Admin) {
            return Err("Permission denied".to_string());
        }

        let _ = settings.set_raw(SETTINGS_SECURITY_ADMIN, "").await;
        let _ = settings.set_raw(SETTINGS_SECURITY_POINTS, "").await;
        let _ = settings.set_raw(SETTINGS_SECURITY_RECOVERY, "").await;
        permissions.set_permission(sender_id, permissions.get_default_permission());
        Ok(())
    }
}
