use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum PermissionLevel {
    View,
    Points,
    Admin,
}

impl PermissionLevel {
    pub fn rank(&self) -> u8 {
        match self {
            PermissionLevel::View => 0,
            PermissionLevel::Points => 1,
            PermissionLevel::Admin => 2,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            PermissionLevel::View => "view",
            PermissionLevel::Points => "points",
            PermissionLevel::Admin => "admin",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "view" => Some(PermissionLevel::View),
            "points" => Some(PermissionLevel::Points),
            "admin" => Some(PermissionLevel::Admin),
            _ => None,
        }
    }
}

pub const SETTINGS_SECURITY_ADMIN: &str = "security_admin_password";
pub const SETTINGS_SECURITY_POINTS: &str = "security_points_password";

pub struct PermissionService {
    permissions_by_sender: HashMap<u32, PermissionLevel>,
    has_admin_password: bool,
    has_points_password: bool,
}

impl Default for PermissionService {
    fn default() -> Self {
        Self::new()
    }
}

impl PermissionService {
    pub fn new() -> Self {
        Self {
            permissions_by_sender: HashMap::new(),
            has_admin_password: false,
            has_points_password: false,
        }
    }

    pub fn update_password_status(&mut self, has_admin: bool, has_points: bool) {
        self.has_admin_password = has_admin;
        self.has_points_password = has_points;
    }

    pub fn should_protect(&self) -> bool {
        self.has_admin_password || self.has_points_password
    }

    pub fn get_default_permission(&self) -> PermissionLevel {
        if self.should_protect() {
            PermissionLevel::View
        } else {
            PermissionLevel::Admin
        }
    }

    pub fn get_permission(&mut self, sender_id: u32) -> PermissionLevel {
        if let Some(&level) = self.permissions_by_sender.get(&sender_id) {
            level
        } else {
            let default = self.get_default_permission();
            self.permissions_by_sender.insert(sender_id, default);
            default
        }
    }

    pub fn set_permission(&mut self, sender_id: u32, level: PermissionLevel) {
        self.permissions_by_sender.insert(sender_id, level);
    }

    pub fn require_permission(&mut self, sender_id: u32, required: PermissionLevel) -> bool {
        let current = self.get_permission(sender_id);
        current.rank() >= required.rank()
    }

    pub fn clear_permission(&mut self, sender_id: u32) {
        self.permissions_by_sender.remove(&sender_id);
    }

    pub fn clear_all_permissions(&mut self) {
        self.permissions_by_sender.clear();
    }
}
