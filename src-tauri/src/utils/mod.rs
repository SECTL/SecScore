use rand::distributions::Alphanumeric;
use rand::Rng;
use chrono::{DateTime, Local};

#[allow(dead_code)]
pub fn format_datetime(dt: &DateTime<Local>) -> String {
    dt.format("%Y-%m-%d %H:%M:%S").to_string()
}

#[allow(dead_code)]
pub fn generate_random_string(length: usize) -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(length)
        .map(char::from)
        .collect()
}

#[allow(dead_code)]
pub fn validate_password(password: &str) -> bool {
    password.len() >= 6
}
