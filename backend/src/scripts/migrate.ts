import fs from "fs";
import path from "path";
import { pool } from "../db/pool";

async function migrate(): Promise<void> {
  const migrationsDir = path.join(__dirname, "../db/migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("No migration files found.");
    await pool.end();
    return;
  }

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, "utf8");
    console.log(`Running migration: ${file} ...`);
    await pool.query(sql);
    console.log(`  ✅ ${file} completed`);
  }

  console.log("All migrations completed successfully.");
  await pool.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
