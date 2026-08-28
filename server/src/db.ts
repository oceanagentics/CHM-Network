import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const dbPath = path.join(repoRoot, "data", "ryu.sqlite");
const requiredTables = [
  "nodes",
  "edges",
  "sources",
  "ryu_routes",
  "saved_views",
] as const;

let database: Database.Database | null = null;

function validateDatabase(db: Database.Database): void {
  const tableRows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all() as Array<{ name: string }>;
  const tableNames = new Set(tableRows.map((row) => row.name));
  const missingTables = requiredTables.filter((tableName) => !tableNames.has(tableName));

  if (missingTables.length > 0) {
    throw new Error(
      `Database at ${dbPath} is missing required tables: ${missingTables.join(", ")}`,
    );
  }

  const prefixedNodeRows = db
    .prepare(
      `
        SELECT id
        FROM nodes
        WHERE id GLOB 'system-*'
           OR id GLOB 'org-*'
           OR id GLOB 'country-*'
        ORDER BY id
        LIMIT 10
      `,
    )
    .all() as Array<{ id: string }>;

  if (prefixedNodeRows.length > 0) {
    throw new Error(
      `Node ids must be kindless slugs; found legacy prefixed ids: ${prefixedNodeRows
        .map((row) => row.id)
        .join(", ")}`,
    );
  }
}

function openDatabase(): Database.Database {
  if (!fs.existsSync(dbPath)) {
    throw new Error(
      `Database not found at ${dbPath}. The app uses this live SQLite file as its only graph source of truth.`,
    );
  }

  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  try {
    validateDatabase(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function getDatabase(): Database.Database {
  if (!database) {
    database = openDatabase();
  }

  return database;
}
