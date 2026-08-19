import "server-only";
import crypto from "node:crypto";

// Backup format: [12-byte IV][16-byte auth tag][ciphertext], AES-256-GCM.
// BACKUP_ENCRYPTION_KEY is a 32-byte key, hex or base64 encoded.

function loadKey(): Buffer {
  const raw = process.env.BACKUP_ENCRYPTION_KEY;
  if (!raw) throw new Error("BACKUP_ENCRYPTION_KEY is not configured");
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("BACKUP_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  return key;
}

export function encryptBackup(plaintext: string): Buffer {
  const key = loadKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

export function decryptBackup(payload: Buffer): string {
  const key = loadKey();
  const iv = payload.subarray(0, 12);
  const authTag = payload.subarray(12, 28);
  const ciphertext = payload.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
