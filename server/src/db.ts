import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const dataDir = path.join(repoRoot, "data");
const dbPath = path.join(dataDir, "chm-network.sqlite");
const schemaPath = path.join(repoRoot, "sql", "chm_schema.sql");
const seedPath = path.join(repoRoot, "sql", "chm_seed_japan.sql");

let database: Database.Database | null = null;

function loadSchemaAndSeed(db: Database.Database) {
  const schemaSql = fs.readFileSync(schemaPath, "utf8");
  const seedSql = fs.readFileSync(seedPath, "utf8");
  db.exec(schemaSql);
  db.exec(seedSql);
}

function shouldResetDatabase(db: Database.Database): boolean {
  const hasLegacyEntity = db
    .prepare(
      `
      SELECT 1
      FROM entities
      WHERE kind NOT IN ('country', 'organization', 'system')
         OR id = 'org-jamstec-godac'
      LIMIT 1
    `,
    )
    .get();

  if (hasLegacyEntity) {
    return true;
  }

  const hasLegacyRelationship = db
    .prepare(
      `
      SELECT 1
      FROM relationships
      WHERE type NOT IN ('part_of', 'operates', 'publishes_to', 'syncs_to')
      LIMIT 1
    `,
    )
    .get();

  return Boolean(hasLegacyRelationship);
}

function removeDatabaseFiles() {
  for (const filePath of [dbPath, `${dbPath}-shm`, `${dbPath}-wal`]) {
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath);
    }
  }
}

function initializeDatabase(): Database.Database {
  fs.mkdirSync(dataDir, { recursive: true });

  let db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  const hasEntitiesTable = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'entities'",
    )
    .get();

  if (!hasEntitiesTable) {
    loadSchemaAndSeed(db);
    return db;
  }

  if (shouldResetDatabase(db)) {
    db.close();
    removeDatabaseFiles();
    db = new Database(dbPath);
    db.pragma("foreign_keys = ON");
    loadSchemaAndSeed(db);
  }

  return db;
}

export function getDatabase(): Database.Database {
  if (!database) {
    database = initializeDatabase();
  }

  return database;
}
