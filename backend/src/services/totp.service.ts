import { authenticator } from "otplib";
import { env } from "../config/env";
import { decryptSecret, encryptSecret } from "../utils/crypto";

// ±1 step tolerance (±30 seconds per RFC 6238 default period).
authenticator.options = { window: 1 };

export function encryptTotpSecret(secret: string): string {
  return encryptSecret(secret, env.totpEncryptionKey);
}

export function decryptTotpSecret(encrypted: string): string {
  return decryptSecret(encrypted, env.totpEncryptionKey);
}

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function verifyTotp(encryptedSecret: string, token: string): boolean {
  if (!token || token.length !== 6) {
    return false;
  }
  try {
    const secret = decryptTotpSecret(encryptedSecret);
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}

export function getTotpUri(secret: string, username: string, issuer: string): string {
  return authenticator.keyuri(username, issuer, secret);
}
