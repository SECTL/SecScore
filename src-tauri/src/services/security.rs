use aes::cipher::{block_padding::Pkcs7, BlockDecryptMut, BlockEncryptMut, KeyIvInit};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use sha2::{Digest, Sha256};

type Aes256CbcEnc = cbc::Encryptor<aes::Aes256>;
type Aes256CbcDec = cbc::Decryptor<aes::Aes256>;

const SALT: &[u8] = b"secscore-salt";
const IV_KEY: &str = "security_crypto_iv";

pub struct SecurityService {
    app_data_dir: Option<String>,
}

impl Default for SecurityService {
    fn default() -> Self {
        Self::new()
    }
}

impl SecurityService {
    pub fn new() -> Self {
        Self { app_data_dir: None }
    }

    pub fn set_app_data_dir(&mut self, dir: &str) {
        self.app_data_dir = Some(dir.to_string());
    }

    fn derive_key(&self) -> [u8; 32] {
        let data_dir = self.app_data_dir.as_deref().unwrap_or("secscore-default");
        let mut hasher = Sha256::new();
        hasher.update(data_dir.as_bytes());
        hasher.update(SALT);
        let result = hasher.finalize();
        let mut key = [0u8; 32];
        key.copy_from_slice(&result[..32]);
        key
    }

    fn generate_iv() -> [u8; 16] {
        use rand::RngCore;
        let mut iv = [0u8; 16];
        rand::thread_rng().fill_bytes(&mut iv);
        iv
    }

    fn iv_hex_to_bytes(hex: &str) -> Option<[u8; 16]> {
        if hex.len() != 32 {
            return None;
        }
        let mut bytes = [0u8; 16];
        for i in 0..16 {
            bytes[i] = u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).ok()?;
        }
        Some(bytes)
    }

    fn bytes_to_iv_hex(bytes: &[u8; 16]) -> String {
        bytes.iter().map(|b| format!("{:02x}", b)).collect()
    }

    pub fn encrypt_secret(&self, plain_text: &str, iv_hex: &str) -> Result<String, String> {
        let iv = Self::iv_hex_to_bytes(iv_hex).ok_or("Invalid IV hex string")?;
        let key = self.derive_key();

        let cipher = Aes256CbcEnc::new(&key.into(), &iv.into());
        let plaintext = plain_text.as_bytes();
        let buf_len = plaintext.len();
        let ciphertext_len = buf_len + 16 - (buf_len % 16);
        let mut buf = vec![0u8; ciphertext_len];
        buf[..buf_len].copy_from_slice(plaintext);
        let ciphertext = cipher
            .encrypt_padded_mut::<Pkcs7>(&mut buf, buf_len)
            .map_err(|_| "Padding error".to_string())?;

        Ok(hex::encode(ciphertext))
    }

    pub fn decrypt_secret(&self, cipher_text: &str, iv_hex: &str) -> Result<String, String> {
        if cipher_text.is_empty() {
            return Ok(String::new());
        }

        let iv = Self::iv_hex_to_bytes(iv_hex).ok_or("Invalid IV hex string")?;
        let key = self.derive_key();

        let mut ciphertext = hex::decode(cipher_text).map_err(|e| e.to_string())?;

        let cipher = Aes256CbcDec::new(&key.into(), &iv.into());
        let plaintext = cipher
            .decrypt_padded_mut::<Pkcs7>(&mut ciphertext)
            .map_err(|_| "Decryption failed".to_string())?;

        String::from_utf8(plaintext.to_vec()).map_err(|e| e.to_string())
    }

    pub fn is_six_digit(s: &str) -> bool {
        s.len() == 6 && s.chars().all(|c| c.is_ascii_digit())
    }

    pub fn generate_iv_hex() -> String {
        let iv = Self::generate_iv();
        Self::bytes_to_iv_hex(&iv)
    }

    pub fn generate_recovery_string() -> String {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        let bytes: [u8; 18] = rng.gen();
        URL_SAFE_NO_PAD.encode(&bytes)
    }

    pub fn get_iv_key() -> &'static str {
        IV_KEY
    }
}
