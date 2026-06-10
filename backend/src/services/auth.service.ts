import { env } from "../config/env";
import { pool } from "../db/pool";
import { verifyPassword } from "../utils/argon2";
import {
  createRefreshToken,
  getAccessExpiresInSeconds,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from "./token.service";
import { verifyTotp } from "./totp.service";
import {
  findByUsernameOrEmail,
  toPublicUser,
  updateLastLogin,
  type PublicUser,
} from "./user.service";

export type LoginResult =
  | { success: true; accessToken: string; refreshToken: string; expiresIn: number; user: PublicUser }
  | { success: false; requires2fa: true; user: PublicUser }
  | { success: false; error: string; status: number };

async function isLockedOut(identifier: string): Promise<boolean> {
  const since = new Date();
  since.setMinutes(since.getMinutes() - env.loginLockoutMinutes);

  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM login_attempts
     WHERE identifier = $1 AND success = FALSE AND attempted_at > $2`,
    [identifier, since]
  );

  return parseInt(result.rows[0]?.count ?? "0", 10) >= env.loginMaxAttempts;
}

async function recordAttempt(identifier: string, success: boolean): Promise<void> {
  await pool.query(
    `INSERT INTO login_attempts (identifier, success) VALUES ($1, $2)`,
    [identifier, success]
  );
}

export async function login(
  username: string,
  password: string,
  otp: string | undefined,
  clientIp: string
): Promise<LoginResult> {
  const lockKey = `${clientIp}:${username.toLowerCase()}`;

  if (await isLockedOut(lockKey)) {
    return {
      success: false,
      error: `Too many failed attempts. Try again in ${env.loginLockoutMinutes} minutes.`,
      status: 429,
    };
  }

  const user = await findByUsernameOrEmail(username);
  if (!user || !user.email_verified) {
    await recordAttempt(lockKey, false);
    return { success: false, error: "Invalid credentials", status: 401 };
  }

  const passwordValid = await verifyPassword(password, user.password_hash);
  if (!passwordValid) {
    await recordAttempt(lockKey, false);
    return { success: false, error: "Invalid credentials", status: 401 };
  }

  if (user.two_fa_enabled) {
    if (!otp) {
      return {
        success: false,
        requires2fa: true,
        user: toPublicUser(user),
      };
    }
    if (!user.totp_secret || !verifyTotp(user.totp_secret, otp)) {
      await recordAttempt(lockKey, false);
      return { success: false, error: "Invalid authentication code", status: 401 };
    }
  }

  await recordAttempt(lockKey, true);
  await updateLastLogin(user.id);

  const accessToken = signAccessToken(user.id, user.username);
  const refreshToken = await createRefreshToken(user.id);

  return {
    success: true,
    accessToken,
    refreshToken,
    expiresIn: getAccessExpiresInSeconds(),
    user: toPublicUser(user),
  };
}

export async function refresh(rawRefreshToken: string) {
  const result = await rotateRefreshToken(rawRefreshToken);
  if (result === "invalid") {
    return { success: false as const, error: "Invalid refresh token", status: 401 };
  }
  if (result === "reuse_detected") {
    return { success: false as const, error: "Session invalidated", status: 401 };
  }
  return {
    success: true as const,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresIn: result.expiresIn,
  };
}

export async function logout(rawRefreshToken: string): Promise<void> {
  await revokeRefreshToken(rawRefreshToken);
}
