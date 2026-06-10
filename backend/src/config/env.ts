import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  DATABASE_URL: z.string().min(1),
  JWT_PRIVATE_KEY_PATH: z.string().min(1),
  JWT_PUBLIC_KEY_PATH: z.string().min(1),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  ARGON2_PEPPER: z.string().min(16),
  TOTP_ENCRYPTION_KEY: z.string().length(64),
  CORS_ORIGINS: z.string().default(""),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().default(5),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().default(15),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const data = parsed.data;

function readKey(filePath: string): string {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Key file not found: ${resolved}`);
  }
  return fs.readFileSync(resolved, "utf8");
}

export const env = {
  port: data.PORT,
  nodeEnv: data.NODE_ENV,
  databaseUrl: data.DATABASE_URL,
  jwtPrivateKey: readKey(data.JWT_PRIVATE_KEY_PATH),
  jwtPublicKey: readKey(data.JWT_PUBLIC_KEY_PATH),
  jwtAccessExpiresIn: data.JWT_ACCESS_EXPIRES_IN,
  argon2Pepper: data.ARGON2_PEPPER,
  totpEncryptionKey: Buffer.from(data.TOTP_ENCRYPTION_KEY, "hex"),
  corsOrigins: data.CORS_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  loginMaxAttempts: data.LOGIN_MAX_ATTEMPTS,
  loginLockoutMinutes: data.LOGIN_LOCKOUT_MINUTES,
  isProduction: data.NODE_ENV === "production",
};
