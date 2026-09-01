import type { PoolClient } from "pg";

import type { ReviewState } from "../../shared/domain";
import { createPostgresPool } from "./postgresConnection";
import {
  languageMigrationId,
  splitLegacyNodeContent,
  validateMigratedNodeContent,
  type LegacyNodeRow,
} from "./languageMigration";

const oldNodeColumns = [
  "name",
  "summary",
  "description",
  "review_state",
  "review_json",
  "details_json",
];

function jsonRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    const parsed = JSON.parse(value) as unknown;
    return jsonRecord(parsed);
  }

  return {};
}

function timestampText(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

async function ensurePreconditions(client: PoolClient) {
  const functionResult = await client.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1
      FROM pg_proc
      WHERE proname = 'set_updated_at_timestamp'
    ) AS exists
  `);
  if (!functionResult.rows[0]?.exists) {
    throw new Error("required trigger function set_updated_at_timestamp() is missing");
  }

  const columnResult = await client.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'nodes'
        AND column_name = ANY($1)
    `,
    [oldNodeColumns],
  );
  const columns = new Set(columnResult.rows.map((row) => row.column_name));
  const missing = oldNodeColumns.filter((column) => !columns.has(column));
  if (missing.length > 0) {
    throw new Error(`nodes table is not in the expected pre-migration shape; missing ${missing.join(", ")}`);
  }

  const supportedLocaleTable = await client.query<{ exists: boolean }>(`
    SELECT to_regclass('public.supported_locales') IS NOT NULL AS exists
  `);
  if (supportedLocaleTable.rows[0]?.exists) {
    throw new Error("supported_locales already exists; refusing partial migration");
  }

  const localizationTable = await client.query<{ exists: boolean }>(`
    SELECT to_regclass('public.node_localizations') IS NOT NULL AS exists
  `);
  if (localizationTable.rows[0]?.exists) {
    const count = await client.query<{ count: string }>("SELECT count(*) FROM node_localizations");
    if (Number(count.rows[0]?.count ?? 0) > 0) {
      throw new Error("node_localizations already contains rows; refusing partial migration");
    }
  }
}

async function ensureMigrationLedger(client: PoolClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function hasMigrationApplied(client: PoolClient): Promise<boolean> {
  const applied = await client.query<{ id: string }>(
    "SELECT id FROM schema_migrations WHERE id = $1",
    [languageMigrationId],
  );
  return Boolean(applied.rowCount);
}

async function createMigrationTables(client: PoolClient) {
  await client.query(`
    CREATE TABLE supported_locales (
      locale text PRIMARY KEY
        CHECK (locale IN ('ar', 'zh', 'en', 'fr', 'ru', 'es')),
      language_name text NOT NULL CHECK (btrim(language_name) <> ''),
      direction text NOT NULL CHECK (direction IN ('ltr', 'rtl')),
      sort_order integer NOT NULL UNIQUE CHECK (sort_order > 0)
    )
  `);

  await client.query(`
    INSERT INTO supported_locales (locale, language_name, direction, sort_order)
    VALUES
      ('ar', 'Arabic', 'rtl', 10),
      ('zh', 'Chinese', 'ltr', 20),
      ('en', 'English', 'ltr', 30),
      ('fr', 'French', 'ltr', 40),
      ('ru', 'Russian', 'ltr', 50),
      ('es', 'Spanish', 'ltr', 60)
  `);

  await client.query(`
    CREATE TABLE node_localizations (
      node_id text NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
      locale text NOT NULL REFERENCES supported_locales(locale),
      title text NOT NULL CHECK (btrim(title) <> ''),
      summary text,
      description text,
      details_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      source_excerpt text,
      translated_from_locale text REFERENCES supported_locales(locale)
        CHECK (translated_from_locale IS NULL OR translated_from_locale <> locale),
      content_updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      review_state text NOT NULL DEFAULT 'agent_researched'
        CHECK (review_state IN ('agent_researched', 'human_reviewed', 'needs_revision')),
      reviewer_note text,
      reviewer text,
      last_reviewed timestamptz,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (node_id, locale)
    )
  `);

  await client.query("CREATE INDEX idx_node_localizations_locale ON node_localizations (locale)");
  await client.query("CREATE INDEX idx_node_localizations_review_state ON node_localizations (review_state)");
  await client.query("CREATE INDEX idx_node_localizations_locale_review_state ON node_localizations (locale, review_state)");

  await client.query(`
    CREATE OR REPLACE FUNCTION set_node_localization_content_updated_at()
    RETURNS trigger AS $$
    BEGIN
      IF NEW.title IS DISTINCT FROM OLD.title
        OR NEW.summary IS DISTINCT FROM OLD.summary
        OR NEW.description IS DISTINCT FROM OLD.description
        OR NEW.details_json IS DISTINCT FROM OLD.details_json
        OR NEW.source_excerpt IS DISTINCT FROM OLD.source_excerpt
        OR NEW.translated_from_locale IS DISTINCT FROM OLD.translated_from_locale THEN
        NEW.content_updated_at = CURRENT_TIMESTAMP;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

  await client.query(`
    CREATE TRIGGER trg_node_localizations_content_updated_at
    BEFORE UPDATE ON node_localizations
    FOR EACH ROW
    EXECUTE FUNCTION set_node_localization_content_updated_at()
  `);

  await client.query(`
    CREATE TRIGGER trg_node_localizations_updated_at
    BEFORE UPDATE ON node_localizations
    FOR EACH ROW
    WHEN (NEW.updated_at = OLD.updated_at)
    EXECUTE FUNCTION set_updated_at_timestamp()
  `);
}

async function backfillLocalizations(client: PoolClient) {
  const result = await client.query(`
    SELECT id, name, summary, description, review_state, review_json,
           details_json, properties_json, created_at, updated_at
    FROM nodes
    ORDER BY id
  `);
  const rows = result.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    summary: row.summary as string | null,
    description: row.description as string | null,
    review_state: row.review_state as ReviewState,
    review_json: jsonRecord(row.review_json),
    details_json: jsonRecord(row.details_json),
    properties_json: jsonRecord(row.properties_json),
    created_at: timestampText(row.created_at),
    updated_at: timestampText(row.updated_at),
  } satisfies LegacyNodeRow));

  const errors: string[] = [];
  for (const row of rows) {
    const content = splitLegacyNodeContent(row);
    errors.push(...validateMigratedNodeContent(content));
    if (errors.length > 0) {
      continue;
    }

    await client.query(
      "UPDATE nodes SET properties_json = $2::jsonb WHERE id = $1",
      [row.id, JSON.stringify(content.propertiesJson)],
    );
    await client.query(
      `
        INSERT INTO node_localizations (
          node_id, locale, title, summary, description, details_json,
          source_excerpt, translated_from_locale, content_updated_at,
          review_state, reviewer_note, reviewer, last_reviewed,
          created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6::jsonb,
          $7, $8, $9::timestamptz,
          $10, $11, $12, $13::timestamptz,
          $14::timestamptz, $15::timestamptz
        )
      `,
      [
        content.localization.nodeId,
        content.localization.locale,
        content.localization.title,
        content.localization.summary,
        content.localization.description,
        JSON.stringify(content.localization.detailsJson),
        content.localization.sourceExcerpt,
        content.localization.translatedFromLocale,
        content.localization.contentUpdatedAt,
        content.localization.reviewState,
        content.localization.reviewerNote,
        content.localization.reviewer,
        content.localization.lastReviewed,
        content.localization.createdAt,
        content.localization.updatedAt,
      ],
    );
  }

  if (errors.length > 0) {
    throw new Error(`migration validation failed:\n${errors.join("\n")}`);
  }

  return rows.length;
}

async function validatePostflight(client: PoolClient) {
  const identifierCount = await client.query<{ count: string }>(
    "SELECT count(*) FROM node_localizations WHERE details_json ? 'identifiers'",
  );
  if (Number(identifierCount.rows[0]?.count ?? 0) > 0) {
    throw new Error("identifier data remains in migrated localization JSON");
  }

  const accessTypeRows = await client.query<{ type: string | null; count: string }>(`
    SELECT access_path->>'type' AS type, count(*)
    FROM nodes,
    LATERAL jsonb_array_elements(properties_json->'access') AS access_path
    WHERE jsonb_typeof(properties_json->'access') = 'array'
    GROUP BY access_path->>'type'
  `);
  const unexpectedAccessTypes = accessTypeRows.rows
    .map((row) => row.type)
    .filter((type) => type !== "read" && type !== "submit" && type !== "partner_sync");
  if (unexpectedAccessTypes.length > 0) {
    throw new Error(`unexpected access types remain: ${unexpectedAccessTypes.join(", ")}`);
  }
}

async function dropObsoleteColumns(client: PoolClient) {
  await client.query("DROP INDEX IF EXISTS idx_nodes_review_state");
  await client.query(`
    ALTER TABLE nodes
      DROP COLUMN name,
      DROP COLUMN summary,
      DROP COLUMN description,
      DROP COLUMN review_state,
      DROP COLUMN review_json,
      DROP COLUMN details_json
  `);
}

async function grantAccess(client: PoolClient) {
  await client.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'explorer_read') THEN
        GRANT SELECT ON supported_locales, node_localizations TO explorer_read;
      END IF;

      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'explorer_write') THEN
        GRANT SELECT ON supported_locales TO explorer_write;
        GRANT SELECT, INSERT, UPDATE, DELETE ON node_localizations TO explorer_write;
      END IF;

      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'explorer_schema_admin') THEN
        GRANT ALL PRIVILEGES ON supported_locales, node_localizations TO explorer_schema_admin;
      END IF;
    END $$;
  `);
}

async function main() {
  const pool = createPostgresPool();
  const client = await pool.connect();
  const backupId = process.env.EXPLORER_BACKUP_ID ?? "not-provided";

  try {
    await client.query("BEGIN");
    await ensureMigrationLedger(client);
    if (await hasMigrationApplied(client)) {
      console.info("language migration already applied", {
        migrationId: languageMigrationId,
      });
      await client.query("COMMIT");
      return;
    }
    console.info("language migration preflight", {
      migrationId: languageMigrationId,
      backupId,
    });
    await ensurePreconditions(client);
    await createMigrationTables(client);
    const backfilledCount = await backfillLocalizations(client);
    await validatePostflight(client);
    await dropObsoleteColumns(client);
    await grantAccess(client);
    await client.query(
      "INSERT INTO schema_migrations (id) VALUES ($1)",
      [languageMigrationId],
    );
    await client.query("COMMIT");
    console.info("language migration complete", {
      migrationId: languageMigrationId,
      backfilledCount,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
