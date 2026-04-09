/**
 * AES-256-GCM symmetric encryption for sensitive DB fields.
 * Requires ENCRYPTION_KEY env var: 64 hex chars (= 32 bytes).
 *
 * Format stored in DB: "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 * Backwards-compatible: if decryption fails (plaintext legacy value), returns raw value as-is.
 */
const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

function getKey() {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    return null;
  }
  return Buffer.from(hex, "hex");
}

function encrypt(plaintext) {
  if (!plaintext) {
    return plaintext;
  }
  const key = getKey();
  if (!key) {
    return plaintext; // No key configured → store plaintext (dev mode)
  }

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decrypt(ciphertext) {
  if (!ciphertext) {
    return ciphertext;
  }
  const key = getKey();
  if (!key) {
    return ciphertext; // No key → return as-is
  }

  // Format check: must be "iv:authTag:data" with exactly 2 colons
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    return ciphertext; // Plaintext legacy value
  }

  try {
    const [ivHex, authTagHex, dataHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const data = Buffer.from(dataHex, "hex");
    if (iv.length !== IV_BYTES) {
      return ciphertext;
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return ciphertext; // Decryption failed → must be legacy plaintext
  }
}

module.exports = { encrypt, decrypt };
