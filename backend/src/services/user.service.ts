import { pool } from "../db/pool";

export interface UserRow {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  totp_secret: string | null;
  two_fa_enabled: boolean;
  email_verified: boolean;
  created_at: Date;
  last_login: Date | null;
}

export interface PublicUser {
  id: string;
  username: string;
  email: string;
  two_fa_enabled: boolean;
  created_at: string;
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    two_fa_enabled: row.two_fa_enabled,
    created_at: row.created_at.toISOString(),
  };
}

export async function findByUsernameOrEmail(
  identifier: string
): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    `SELECT * FROM users WHERE username = $1 OR email = $1 LIMIT 1`,
    [identifier]
  );
  return result.rows[0] ?? null;
}

export async function findById(id: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(`SELECT * FROM users WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function updateLastLogin(userId: string): Promise<void> {
  await pool.query(`UPDATE users SET last_login = NOW() WHERE id = $1`, [userId]);
}

export async function updateProfile(
  userId: string,
  data: { email?: string }
): Promise<PublicUser | null> {
  if (data.email) {
    await pool.query(`UPDATE users SET email = $1 WHERE id = $2`, [data.email, userId]);
  }
  const user = await findById(userId);
  return user ? toPublicUser(user) : null;
}
