import argon2 from "argon2";
import { env } from "../config/env";

// OWASP 2025 recommendation: Argon2id, 19 MiB memory, 2 iterations, 1 parallelism.
const ARGON2_OPTIONS: argon2.Options & { type: typeof argon2.argon2id } = {
  type: argon2.argon2id,
  memoryCost: 19_456, // KiB ≈ 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(password: string): Promise<string> {
  const peppered = password + env.argon2Pepper;
  return argon2.hash(peppered, ARGON2_OPTIONS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const peppered = password + env.argon2Pepper;
  try {
    return await argon2.verify(hash, peppered);
  } catch {
    return false;
  }
}
