import crypto from "crypto";

/**
 * Get the encryption key from the environment variable.
 * STORAGE_ENCRYPTION_KEY must be a base64-encoded 32-byte key.
 * @returns {Buffer} - 32-byte key buffer
 */
function getKey() {
  const keyBase64 = process.env.STORAGE_ENCRYPTION_KEY;
  if (!keyBase64) {
    throw new Error(
      "STORAGE_ENCRYPTION_KEY environment variable is not set. " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
  }
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) {
    throw new Error(
      `STORAGE_ENCRYPTION_KEY must be exactly 32 bytes (256 bits) when base64-decoded. Got ${key.length} bytes.`
    );
  }
  return key;
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * @param {string} plaintext - The string to encrypt
 * @returns {string} - JSON string containing { iv, ciphertext, tag } (all hex-encoded)
 */
export function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(12); // 12 bytes = NIST recommended for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag(); // Must call after final()
  return JSON.stringify({
    iv: iv.toString("hex"),
    ciphertext: encrypted,
    tag: authTag.toString("hex"),
  });
}

/**
 * Decrypt an encrypted string produced by encrypt().
 * @param {string} encryptedStr - JSON string containing { iv, ciphertext, tag }
 * @returns {string} - The original plaintext
 */
export function decrypt(encryptedStr) {
  const key = getKey();
  const { iv, ciphertext, tag } = JSON.parse(encryptedStr);
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "hex")
  );
  decipher.setAuthTag(Buffer.from(tag, "hex")); // Must call before final()
  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8"); // Throws on auth tag mismatch
  return decrypted;
}
