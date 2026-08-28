import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PoolClient } from "pg";

import { createPostgresPool } from "./postgresConnection";
import { runPostgresMigrations } from "./runPostgresMigrations";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const defaultSqlitePath = path.join(repoRoot, "data", "ryu.sqlite");
const tables = ["sources", "nodes", "edges", "ryu_routes", "saved_views"] as const;

type TableName = typeof tables[number];

type TableSpec = {
  columns: string[];
  jsonColumns?: Set<string>;
};

const tableSpecs: Record<TableName, TableSpec> = {
  sources: {
    columns: [
      "id",
      "title",
      "source_type",
      "url",
      "local_path",
      "publisher",
      "published_at",
      "accessed_at",
      "note",
    ],
  },
  nodes: {
    columns: [
      "id",
      "kind",
      "name",
      "country_code",
      "subtype",
      "url",
      "summary",
      "description",
      "record_depth",
      "review_state",
      "review_json",
      "details_json",
      "properties_json",
      "created_at",
      "updated_at",
    ],
    jsonColumns: new Set(["review_json", "details_json", "properties_json"]),
  },
  edges: {
    columns: [
      "id",
      "source_node_id",
      "target_node_id",
      "kind",
      "note",
      "properties_json",
      "created_at",
      "updated_at",
    ],
    jsonColumns: new Set(["properties_json"]),
  },
  ryu_routes: {
    columns: [
      "id",
      "node_id",
      "status",
      "mode",
      "priority",
      "capabilities_json",
      "target",
      "upstream",
      "format",
      "contract_ref",
      "caveat",
      "properties_json",
      "created_at",
      "updated_at",
    ],
    jsonColumns: new Set(["capabilities_json", "properties_json"]),
  },
  saved_views: {
    columns: [
      "id",
      "name",
      "scope",
      "filter_json",
      "layout_json",
      "style_json",
      "created_at",
      "updated_at",
    ],
    jsonColumns: new Set(["filter_json", "layout_json", "style_json"]),
  },
};

function readArgs() {
  const args = new Set(process.argv.slice(2));
  return {
    sqlitePath: process.env.RYU_SQLITE_PATH ?? defaultSqlitePath,
    truncate: args.has("--truncate"),
  };
}

function placeholders(spec: TableSpec): string {
  return spec.columns
    .map((column, index) => `$${index + 1}${spec.jsonColumns?.has(column) ? "::jsonb" : ""}`)
    .join(", ");
}

function upsertSql(table: TableName, spec: TableSpec): string {
  const updates = spec.columns
    .filter((column) => column !== "id")
    .map((column) => `${column} = EXCLUDED.${column}`)
    .join(", ");

  return `
    INSERT INTO ${table} (${spec.columns.join(", ")})
    VALUES (${placeholders(spec)})
    ON CONFLICT (id) DO UPDATE SET ${updates}
  `;
}

function readRows(db: Database.Database, table: TableName): Array<Record<string, unknown>> {
  const spec = tableSpecs[table];
  return db.prepare(`SELECT ${spec.columns.join(", ")} FROM ${table}`).all() as Array<Record<string, unknown>>;
}

async function importTable(
  client: PoolClient,
  db: Database.Database,
  table: TableName,
): Promise<number> {
  const spec = tableSpecs[table];
  const sql = upsertSql(table, spec);
  const rows = readRows(db, table);

  for (const row of rows) {
    await client.query(sql, spec.columns.map((column) => row[column] ?? null));
  }

  return rows.length;
}

async function validateCounts(
  client: PoolClient,
  sqliteCounts: Record<TableName, number>,
): Promise<void> {
  for (const table of tables) {
    const result = await client.query(`SELECT count(*)::int AS count FROM ${table}`);
    const postgresCount = Number(result.rows[0]?.count ?? 0);
    const sqliteCount = sqliteCounts[table];

    if (postgresCount !== sqliteCount) {
      throw new Error(`${table} count mismatch: SQLite ${sqliteCount}, Postgres ${postgresCount}`);
    }
  }
}

async function main() {
  const { sqlitePath, truncate } = readArgs();
  if (!fs.existsSync(sqlitePath)) {
    throw new Error(`SQLite database not found: ${sqlitePath}`);
  }

  const sqlite = new Database(sqlitePath, { readonly: true });
  const pool = createPostgresPool();

  try {
    await runPostgresMigrations(pool);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      if (truncate) {
        await client.query("TRUNCATE saved_views, ryu_routes, edges, nodes, sources");
      }

      const sqliteCounts = Object.fromEntries(
        tables.map((table) => [table, readRows(sqlite, table).length]),
      ) as Record<TableName, number>;

      for (const table of tables) {
        const count = await importTable(client, sqlite, table);
        console.log(`Imported ${count} ${table} rows`);
      }

      await validateCounts(client, sqliteCounts);
      await client.query("COMMIT");
      console.log("SQLite to Postgres import complete");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } finally {
    sqlite.close();
    await pool.end();
  }
}

if (process.env.NODE_ENV !== "test") {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
