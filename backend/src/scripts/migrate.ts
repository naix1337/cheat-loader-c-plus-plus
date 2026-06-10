import fs from "fs";
import path from "path";
import { pool } from "../db/pool";

async function migrate(): Promise<void> {
  const migrationPath = path.join(__dirname, "../db/migrations/001_initial.sql");
  const sql = fs.readFileSync(migrationPath, "utf8");
  await pool.query(sql);
  console.log("Migration completed successfully.");
  await pool.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
