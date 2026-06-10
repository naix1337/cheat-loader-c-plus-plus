import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env";
import { pool } from "../db/pool";
import { generateOpaqueToken, hashToken } from "../utils/crypto";

export interface JwtPayload {
  sub: string;
  username: string;
}

const REFRESH_TOKEN_DAYS = 7;

export function signAccessToken(userId: string, username: string): string {
  const options: SignOptions = {
    algorithm: "RS256",
    expiresIn: env.jwtAccessExpiresIn as SignOptions["expiresIn"],
  };
  return jwt.sign({ sub: userId, username } satisfies JwtPayload, env.jwtPrivateKey, options);
}

export function verifyAccessToken(token: string): JwtPayload | null {
  try {
    const payload = jwt.verify(token, env.jwtPublicKey, {
      algorithms: ["RS256"],
    }) as JwtPayload;
    return payload;
  } catch {
    return null;
  }
}

export function getAccessExpiresInSeconds(): number {
  return 15 * 60; // 15 minutes
}

export async function createRefreshToken(userId: string): Promise<string> {
  const rawToken = generateOpaqueToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_DAYS);

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );

  return rawToken;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  userId: string;
}

export async function rotateRefreshToken(
  rawToken: string
): Promise<RefreshResult | "invalid" | "reuse_detected"> {
  const tokenHash = hashToken(rawToken);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query<{
      id: string;
      user_id: string;
      used: boolean;
      revoked: boolean;
      expires_at: Date;
      username: string;
    }>(
      `SELECT rt.id, rt.user_id, rt.used, rt.revoked, rt.expires_at, u.username
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1
       FOR UPDATE`,
      [tokenHash]
    );

    const row = result.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return "invalid";
    }

    if (row.used || row.revoked) {
      // Reuse detection — possible token theft; invalidate all user sessions.
      await client.query(
        `UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1 AND revoked = FALSE`,
        [row.user_id]
      );
      await client.query("COMMIT");
      console.warn(`[security] Refresh token reuse detected for user ${row.user_id}`);
      return "reuse_detected";
    }

    if (new Date(row.expires_at) < new Date()) {
      await client.query("ROLLBACK");
      return "invalid";
    }

    await client.query(`UPDATE refresh_tokens SET used = TRUE WHERE id = $1`, [row.id]);

    const newRawToken = generateOpaqueToken();
    const newHash = hashToken(newRawToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_DAYS);

    await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [row.user_id, newHash, expiresAt]
    );

    await client.query("COMMIT");

    return {
      accessToken: signAccessToken(row.user_id, row.username),
      refreshToken: newRawToken,
      expiresIn: getAccessExpiresInSeconds(),
      userId: row.user_id,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function revokeRefreshToken(rawToken: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  await pool.query(`UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1`, [
    tokenHash,
  ]);
}
