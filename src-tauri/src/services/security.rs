use aes::cipher::{block_padding::Pkcs7, BlockDecryptMut, BlockEncryptMut, KeyIvInit};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use sha2::{Digest, Sha256};

type Aes256CbcEnc = cbc::Encryptor<aes::Aes256>;
type Aes256CbcDec = cbc::Decryptor<aes::Aes256>;

const SALT: &[u8] = b"secscore-salt";

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

    // AES-CBC 的加解密必须使用同一个 IV。历史上这里曾由命令层每次请求传入一个
    // 随机 IV，既不持久化也不复用，导致"设密码后永远无法用密码解锁"。这里改为由
    // 密钥确定性派生 IV：同一份密钥下，无论进程重启、还是切换本地班级，加密与解密
    // 都得到一致的 IV，密文可跨会话解密。
    fn derive_iv(&self) -> [u8; 16] {
        let key = self.derive_key();
        let mut iv = [0u8; 16];
        iv.copy_from_slice(&key[..16]);
        iv
    }

    pub fn encrypt_secret(&self, plain_text: &str) -> Result<String, String> {
        let iv = self.derive_iv();
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

    pub fn decrypt_secret(&self, cipher_text: &str) -> Result<String, String> {
        if cipher_text.is_empty() {
            return Ok(String::new());
        }

        let iv = self.derive_iv();
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

    pub fn generate_recovery_string() -> String {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        let bytes: [u8; 18] = rng.gen();
        URL_SAFE_NO_PAD.encode(&bytes)
    }
}
