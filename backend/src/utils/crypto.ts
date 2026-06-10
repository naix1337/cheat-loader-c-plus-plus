import crypto from "crypto";

/** SHA-256 hash of opaque refresh token — never store raw tokens in DB. */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Generate a cryptographically secure opaque refresh token (256-bit). */
export function generateOpaqueToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

/** Encrypt TOTP secret for storage at rest. */
export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/** Decrypt TOTP secret from DB. */
export function decryptSecret(ciphertext: string, key: Buffer): string {
  const data = Buffer.from(ciphertext, "base64");
  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + 16);
  const encrypted = data.subarray(IV_LENGTH + 16);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
