import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

import { createPostgresPool } from "./postgresConnection";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDirectory = path.resolve(__dirname, "..", "migrations");

export async function runPostgresMigrations(pool: Pool): Promise<void> {
  const entries = await fs.readdir(migrationsDirectory);
  const migrationFiles = entries
    .filter((entry) => entry.endsWith(".sql"))
    .sort();

  for (const file of migrationFiles) {
    const sql = await fs.readFile(path.join(migrationsDirectory, file), "utf8");
    await pool.query(sql);
    console.log(`Applied ${file}`);
  }
}

async function main() {
  const pool = createPostgresPool();
  try {
    await runPostgresMigrations(pool);
  } finally {
    await pool.end();
  }
}

if (process.env.NODE_ENV !== "test") {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
