/**
 * One-time script to create a test user (run on server only).
 * Usage: npx tsx src/scripts/create-user.ts <username> <email> <password>
 */
import { hashPassword } from "../utils/argon2";
import { pool } from "../db/pool";

async function main(): Promise<void> {
  const [username, email, password] = process.argv.slice(2);
  if (!username || !email || !password) {
    console.error("Usage: create-user <username> <email> <password>");
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  await pool.query(
    `INSERT INTO users (username, email, password_hash, email_verified, two_fa_enabled)
     VALUES ($1, $2, $3, TRUE, FALSE)
     ON CONFLICT (username) DO NOTHING`,
    [username, email, passwordHash]
  );

  console.log(`User '${username}' created (email_verified=true, 2FA=off).`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
