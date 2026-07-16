import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const dbPath = path.join(repoRoot, "data", "chm-network.sqlite");
const requiredTables = [
  "entities",
  "relationships",
  "sources",
  "entity_sources",
  "relationship_sources",
  "tags",
  "entity_tags",
  "relationship_tags",
  "system_profiles",
  "system_data_claims",
  "system_access_paths",
  "system_submission_paths",
  "system_identifier_schemes",
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
