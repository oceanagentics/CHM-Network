import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool, PoolClient } from "pg";

import type { GraphBootstrapPayload } from "../../shared/domain";
import { createPostgresPool } from "./postgresConnection";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const defaultSeedPaths = [
  path.join(repoRoot, "client", "dist", "bootstrap.public.json"),
  path.join(repoRoot, "client", "public", "bootstrap.public.json"),
];

type SeedResult = {
  seedPath: string;
  seedSha256: string;
  changedRows: Record<keyof GraphBootstrapPayload, number>;
  tableRows: Record<keyof GraphBootstrapPayload, number>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertBootstrapPayload(value: unknown): GraphBootstrapPayload {
  if (
    !isRecord(value) ||
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.edges) ||
    !Array.isArray(value.sources) ||
    !Array.isArray(value.ryuRoutes) ||
    !Array.isArray(value.savedViews)
  ) {
    throw new Error("bootstrap seed must include nodes, edges, sources, ryuRoutes, and savedViews arrays");
  }

  return value as unknown as GraphBootstrapPayload;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveSeedPath(): Promise<string> {
  const explicitPath = process.argv.find((arg) => !arg.startsWith("--") && arg !== process.argv[0] && arg !== process.argv[1]) ??
    process.env.BOOTSTRAP_SEED_PATH;
  if (explicitPath) {
    return path.resolve(repoRoot, explicitPath);
  }

  for (const seedPath of defaultSeedPaths) {
    if (await exists(seedPath)) {
      return seedPath;
    }
  }

  return defaultSeedPaths[0];
}

async function readBootstrap(seedPath: string): Promise<{ payload: GraphBootstrapPayload; sha256: string }> {
  const raw = await fs.readFile(seedPath, "utf8");
  const payload = assertBootstrapPayload(JSON.parse(raw) as unknown);
  const sha256 = crypto.createHash("sha256").update(raw).digest("hex");
  return { payload, sha256 };
}

async function upsertSources(client: PoolClient, payload: GraphBootstrapPayload): Promise<number> {
  const result = await client.query(
    `
      WITH input AS (
        SELECT *
        FROM jsonb_to_recordset($1::jsonb) AS row(
          id text,
          title text,
          "sourceType" text,
          url text,
          "localPath" text,
          publisher text,
          "publishedAt" text,
          "accessedAt" text,
          note text
        )
      )
      INSERT INTO sources (
        id, title, source_type, url, local_path, publisher, published_at, accessed_at, note
      )
      SELECT
        id, title, "sourceType", url, "localPath", publisher, "publishedAt", "accessedAt", note
      FROM input
      ON CONFLICT (id) DO UPDATE
      SET title = EXCLUDED.title,
          source_type = EXCLUDED.source_type,
          url = EXCLUDED.url,
          local_path = EXCLUDED.local_path,
          publisher = EXCLUDED.publisher,
          published_at = EXCLUDED.published_at,
          accessed_at = EXCLUDED.accessed_at,
          note = EXCLUDED.note
      WHERE (
        sources.title,
        sources.source_type,
        sources.url,
        sources.local_path,
        sources.publisher,
        sources.published_at,
        sources.accessed_at,
        sources.note
      ) IS DISTINCT FROM (
        EXCLUDED.title,
        EXCLUDED.source_type,
        EXCLUDED.url,
        EXCLUDED.local_path,
        EXCLUDED.publisher,
        EXCLUDED.published_at,
        EXCLUDED.accessed_at,
        EXCLUDED.note
      )
    `,
    [JSON.stringify(payload.sources)],
  );
  return result.rowCount ?? 0;
}

async function upsertNodes(client: PoolClient, payload: GraphBootstrapPayload): Promise<number> {
  const result = await client.query(
    `
      WITH input AS (
        SELECT *
        FROM jsonb_to_recordset($1::jsonb) AS row(
          id text,
          kind text,
          name text,
          "countryCode" text,
          subtype text,
          url text,
          summary text,
          description text,
          "recordDepth" text,
          "reviewState" text,
          review jsonb,
          details jsonb,
          properties jsonb,
          "createdAt" timestamptz,
          "updatedAt" timestamptz
        )
      )
      INSERT INTO nodes (
        id, kind, name, country_code, subtype, url, summary, description,
        record_depth, review_state, review_json, details_json, properties_json,
        created_at, updated_at
      )
      SELECT
        id,
        kind,
        name,
        "countryCode",
        subtype,
        url,
        summary,
        description,
        COALESCE("recordDepth", 'stub'),
        COALESCE("reviewState", 'unreviewed'),
        COALESCE(review, '{}'::jsonb),
        COALESCE(details, '{}'::jsonb),
        COALESCE(properties, '{}'::jsonb),
        COALESCE("createdAt", CURRENT_TIMESTAMP),
        COALESCE("updatedAt", CURRENT_TIMESTAMP)
      FROM input
      ON CONFLICT (id) DO UPDATE
      SET kind = EXCLUDED.kind,
          name = EXCLUDED.name,
          country_code = EXCLUDED.country_code,
          subtype = EXCLUDED.subtype,
          url = EXCLUDED.url,
          summary = EXCLUDED.summary,
          description = EXCLUDED.description,
          record_depth = EXCLUDED.record_depth,
          review_state = EXCLUDED.review_state,
          review_json = EXCLUDED.review_json,
          details_json = EXCLUDED.details_json,
          properties_json = EXCLUDED.properties_json
      WHERE (
        nodes.kind,
        nodes.name,
        nodes.country_code,
        nodes.subtype,
        nodes.url,
        nodes.summary,
        nodes.description,
        nodes.record_depth,
        nodes.review_state,
        nodes.review_json,
        nodes.details_json,
        nodes.properties_json
      ) IS DISTINCT FROM (
        EXCLUDED.kind,
        EXCLUDED.name,
        EXCLUDED.country_code,
        EXCLUDED.subtype,
        EXCLUDED.url,
        EXCLUDED.summary,
        EXCLUDED.description,
        EXCLUDED.record_depth,
        EXCLUDED.review_state,
        EXCLUDED.review_json,
        EXCLUDED.details_json,
        EXCLUDED.properties_json
      )
    `,
    [JSON.stringify(payload.nodes)],
  );
  return result.rowCount ?? 0;
}

async function upsertEdges(client: PoolClient, payload: GraphBootstrapPayload): Promise<number> {
  const result = await client.query(
    `
      WITH input AS (
        SELECT *
        FROM jsonb_to_recordset($1::jsonb) AS row(
          id text,
          "sourceNodeId" text,
          "targetNodeId" text,
          kind text,
          note text,
          properties jsonb,
          "createdAt" timestamptz,
          "updatedAt" timestamptz
        )
      )
      INSERT INTO edges (
        id, source_node_id, target_node_id, kind, note, properties_json, created_at, updated_at
      )
      SELECT
        id,
        "sourceNodeId",
        "targetNodeId",
        kind,
        note,
        COALESCE(properties, '{}'::jsonb),
        COALESCE("createdAt", CURRENT_TIMESTAMP),
        COALESCE("updatedAt", CURRENT_TIMESTAMP)
      FROM input
      ON CONFLICT (id) DO UPDATE
      SET source_node_id = EXCLUDED.source_node_id,
          target_node_id = EXCLUDED.target_node_id,
          kind = EXCLUDED.kind,
          note = EXCLUDED.note,
          properties_json = EXCLUDED.properties_json
      WHERE (
        edges.source_node_id,
        edges.target_node_id,
        edges.kind,
        edges.note,
        edges.properties_json
      ) IS DISTINCT FROM (
        EXCLUDED.source_node_id,
        EXCLUDED.target_node_id,
        EXCLUDED.kind,
        EXCLUDED.note,
        EXCLUDED.properties_json
      )
    `,
    [JSON.stringify(payload.edges)],
  );
  return result.rowCount ?? 0;
}

async function upsertRyuRoutes(client: PoolClient, payload: GraphBootstrapPayload): Promise<number> {
  const result = await client.query(
    `
      WITH input AS (
        SELECT *
        FROM jsonb_to_recordset($1::jsonb) AS row(
          id text,
          "nodeId" text,
          status text,
          mode text,
          priority integer,
          capabilities jsonb,
          target text,
          upstream text,
          format text,
          "contractRef" text,
          caveat text,
          properties jsonb,
          "createdAt" timestamptz,
          "updatedAt" timestamptz
        )
      )
      INSERT INTO ryu_routes (
        id, node_id, status, mode, priority, capabilities_json, target, upstream,
        format, contract_ref, caveat, properties_json, created_at, updated_at
      )
      SELECT
        id,
        "nodeId",
        status,
        mode,
        COALESCE(priority, 1),
        COALESCE(capabilities, '[]'::jsonb),
        target,
        upstream,
        format,
        "contractRef",
        caveat,
        COALESCE(properties, '{}'::jsonb),
        COALESCE("createdAt", CURRENT_TIMESTAMP),
        COALESCE("updatedAt", CURRENT_TIMESTAMP)
      FROM input
      ON CONFLICT (id) DO UPDATE
      SET node_id = EXCLUDED.node_id,
          status = EXCLUDED.status,
          mode = EXCLUDED.mode,
          priority = EXCLUDED.priority,
          capabilities_json = EXCLUDED.capabilities_json,
          target = EXCLUDED.target,
          upstream = EXCLUDED.upstream,
          format = EXCLUDED.format,
          contract_ref = EXCLUDED.contract_ref,
          caveat = EXCLUDED.caveat,
          properties_json = EXCLUDED.properties_json
      WHERE (
        ryu_routes.node_id,
        ryu_routes.status,
        ryu_routes.mode,
        ryu_routes.priority,
        ryu_routes.capabilities_json,
        ryu_routes.target,
        ryu_routes.upstream,
        ryu_routes.format,
        ryu_routes.contract_ref,
        ryu_routes.caveat,
        ryu_routes.properties_json
      ) IS DISTINCT FROM (
        EXCLUDED.node_id,
        EXCLUDED.status,
        EXCLUDED.mode,
        EXCLUDED.priority,
        EXCLUDED.capabilities_json,
        EXCLUDED.target,
        EXCLUDED.upstream,
        EXCLUDED.format,
        EXCLUDED.contract_ref,
        EXCLUDED.caveat,
        EXCLUDED.properties_json
      )
    `,
    [JSON.stringify(payload.ryuRoutes)],
  );
  return result.rowCount ?? 0;
}

async function upsertSavedViews(client: PoolClient, payload: GraphBootstrapPayload): Promise<number> {
  const result = await client.query(
    `
      WITH input AS (
        SELECT *
        FROM jsonb_to_recordset($1::jsonb) AS row(
          id text,
          name text,
          scope text,
          filter jsonb,
          layout jsonb,
          style jsonb,
          "createdAt" timestamptz,
          "updatedAt" timestamptz
        )
      )
      INSERT INTO saved_views (
        id, name, scope, filter_json, layout_json, style_json, created_at, updated_at
      )
      SELECT
        id,
        name,
        scope,
        COALESCE(filter, '{}'::jsonb),
        COALESCE(layout, '{}'::jsonb),
        COALESCE(style, '{}'::jsonb),
        COALESCE("createdAt", CURRENT_TIMESTAMP),
        COALESCE("updatedAt", CURRENT_TIMESTAMP)
      FROM input
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name,
          scope = EXCLUDED.scope,
          filter_json = EXCLUDED.filter_json,
          layout_json = EXCLUDED.layout_json,
          style_json = EXCLUDED.style_json
      WHERE (
        saved_views.name,
        saved_views.scope,
        saved_views.filter_json,
        saved_views.layout_json,
        saved_views.style_json
      ) IS DISTINCT FROM (
        EXCLUDED.name,
        EXCLUDED.scope,
        EXCLUDED.filter_json,
        EXCLUDED.layout_json,
        EXCLUDED.style_json
      )
    `,
    [JSON.stringify(payload.savedViews)],
  );
  return result.rowCount ?? 0;
}

async function pruneTable(
  client: PoolClient,
  tableName: "saved_views" | "ryu_routes" | "edges" | "nodes" | "sources",
  ids: string[],
): Promise<void> {
  if (ids.length === 0) {
    await client.query(`DELETE FROM ${tableName}`);
    return;
  }

  await client.query(`DELETE FROM ${tableName} WHERE NOT (id = ANY($1::text[]))`, [ids]);
}

async function tableRows(client: PoolClient): Promise<SeedResult["tableRows"]> {
  const result = await client.query(
    `
      SELECT
        (SELECT count(*)::int FROM nodes) AS nodes,
        (SELECT count(*)::int FROM edges) AS edges,
        (SELECT count(*)::int FROM sources) AS sources,
        (SELECT count(*)::int FROM ryu_routes) AS "ryuRoutes",
        (SELECT count(*)::int FROM saved_views) AS "savedViews"
    `,
  );

  return result.rows[0] as SeedResult["tableRows"];
}

export async function seedPostgresBootstrap(
  pool: Pool,
  payload: GraphBootstrapPayload,
  options: { seedPath: string; seedSha256: string; prune?: boolean },
): Promise<SeedResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const changedRows = {
      sources: await upsertSources(client, payload),
      nodes: await upsertNodes(client, payload),
      edges: await upsertEdges(client, payload),
      ryuRoutes: await upsertRyuRoutes(client, payload),
      savedViews: await upsertSavedViews(client, payload),
    };

    if (options.prune) {
      await pruneTable(client, "saved_views", payload.savedViews.map((row) => row.id));
      await pruneTable(client, "ryu_routes", payload.ryuRoutes.map((row) => row.id));
      await pruneTable(client, "edges", payload.edges.map((row) => row.id));
      await pruneTable(client, "nodes", payload.nodes.map((row) => row.id));
      await pruneTable(client, "sources", payload.sources.map((row) => row.id));
    }

    const rows = await tableRows(client);
    await client.query("COMMIT");

    return {
      seedPath: options.seedPath,
      seedSha256: options.seedSha256,
      changedRows,
      tableRows: rows,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const seedPath = await resolveSeedPath();
  const { payload, sha256 } = await readBootstrap(seedPath);
  const pool = createPostgresPool();

  try {
    const result = await seedPostgresBootstrap(pool, payload, {
      seedPath,
      seedSha256: sha256,
      prune: process.argv.includes("--prune") || process.env.RYU_SEED_PRUNE === "true",
    });

    console.log(JSON.stringify(result, null, 2));
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
