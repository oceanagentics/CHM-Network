import type { Pool, PoolClient } from "pg";

import type {
  GraphBootstrapPayload,
  GraphEdge,
  GraphNode,
  NodeLocalization,
  NodeLocalizationReviewInput,
  RyuPortalRoute,
  RyuRoute,
  RyuSystemOperator,
  RyuSystemQuery,
  RyuSystemRecord,
  SavedView,
  Source,
  SupportedLocale,
} from "../../shared/domain";
import { defaultLocale, resolveNodeLocalization, supportedLocales } from "../../shared/localization";
import type {
  BulkRecordValidationInput,
  BulkRecordValidationResult,
  RecordAggregate,
  RecordAggregateContentInput,
  RecordDeleteImpact,
  RecordEdgeInput,
  LocalizationContentInput,
  RecordListResult,
  RecordMutationOptions,
  RecordPatchInput,
  RecordRouteInput,
  RecordSearchQuery,
  RecordSourceInput,
  RecordValidationResult,
} from "../../shared/recordApi";
import type { GraphRepository } from "./graphRepository";
import {
  collectSourceIds,
  filterSavedViews,
  isReviewState,
  mapEdge,
  mapNode,
  mapNodeLocalization,
  mapPortalRoute,
  mapPortalSource,
  mapRyuRoute,
  mapSavedView,
  mapSource,
  normalizeString,
  readStringArray,
  stringifyJson,
  systemSearchScore,
  uniqueStrings,
  valuesMatchAny,
  type RawEdge,
  type RawNode,
  type RawNodeLocalization,
  type RawRyuRoute,
} from "./graphRepositorySupport";
import {
  ApiRequestError,
  buildDeleteImpactHash,
  encodeRecordCursor,
  validateBulkRecordPayload,
} from "./recordContracts";

type UpsertLocalizationInput = LocalizationContentInput | Extract<
  NonNullable<RecordPatchInput["localizations"]>[SupportedLocale],
  { mode: "replace" }
>;
type PatchLocalizationInput = Extract<
  NonNullable<RecordPatchInput["localizations"]>[SupportedLocale],
  { mode: "patch" }
>;

function jsonText(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

function stripRetiredNodeProperties(
  value: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const properties = { ...(value ?? {}) };
  delete properties.operator;
  return properties;
}

function timestampText(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapPostgresNode(
  row: Record<string, unknown>,
  localizations: NodeLocalization[] = [],
  requestedLocale: SupportedLocale = defaultLocale,
): GraphNode {
  return mapNode(
    {
      ...(row as RawNode),
      properties_json: jsonText(row.properties_json),
      created_at: timestampText(row.created_at),
      updated_at: timestampText(row.updated_at),
    },
    localizations,
    requestedLocale,
  );
}

function mapPostgresNodeLocalization(row: Record<string, unknown>): NodeLocalization {
  return mapNodeLocalization({
    ...(row as RawNodeLocalization),
    details_json: jsonText(row.details_json),
    content_updated_at: timestampText(row.content_updated_at),
    last_reviewed: row.last_reviewed == null ? null : timestampText(row.last_reviewed),
    created_at: timestampText(row.created_at),
    updated_at: timestampText(row.updated_at),
  });
}

function mapPostgresEdge(row: Record<string, unknown>): GraphEdge {
  return mapEdge({
    ...(row as RawEdge),
    properties_json: jsonText(row.properties_json),
    created_at: timestampText(row.created_at),
    updated_at: timestampText(row.updated_at),
  });
}

function mapPostgresRoute(row: Record<string, unknown>): RyuRoute {
  return mapRyuRoute({
    ...(row as RawRyuRoute),
    capabilities_json: jsonText(row.capabilities_json),
    properties_json: jsonText(row.properties_json),
    priority: Number(row.priority),
    created_at: timestampText(row.created_at),
    updated_at: timestampText(row.updated_at),
  });
}

function mapPostgresSavedView(row: Record<string, unknown>): SavedView {
  return mapSavedView({
    ...row,
    filter_json: jsonText(row.filter_json),
    layout_json: jsonText(row.layout_json),
    style_json: jsonText(row.style_json),
    created_at: timestampText(row.created_at),
    updated_at: timestampText(row.updated_at),
  });
}

export class PostgresGraphRepository implements GraphRepository {
  constructor(private readonly pool: Pool) {}

  async close(): Promise<void> {
    await this.pool.end();
  }

  async getBootstrap(): Promise<GraphBootstrapPayload> {
    const [nodeRows, localizationRows, edgeRows, sourceRows, routeRows] = await Promise.all([
      this.query("SELECT * FROM nodes ORDER BY id"),
      this.query("SELECT * FROM node_localizations ORDER BY node_id, locale"),
      this.query("SELECT * FROM edges ORDER BY id"),
      this.query("SELECT * FROM sources ORDER BY title"),
      this.query("SELECT * FROM ryu_routes ORDER BY node_id, priority, id"),
    ]);
    const localizationsByNodeId = new Map<string, NodeLocalization[]>();
    for (const row of localizationRows) {
      const localization = mapPostgresNodeLocalization(row);
      const nodeId = String(row.node_id);
      localizationsByNodeId.set(nodeId, [
        ...(localizationsByNodeId.get(nodeId) ?? []),
        localization,
      ]);
    }
    const nodes = nodeRows
      .map((row) => mapPostgresNode(row, localizationsByNodeId.get(String(row.id)) ?? []))
      .sort((left, right) =>
        resolveNodeLocalization(left, defaultLocale).title.localeCompare(
          resolveNodeLocalization(right, defaultLocale).title,
        ) || left.id.localeCompare(right.id),
      );
    const savedViews = filterSavedViews(
      await this.listSavedViews(),
      new Set(nodes.map((node) => node.id)),
    );

    return {
      nodes,
      edges: edgeRows.map(mapPostgresEdge),
      sources: sourceRows.map((row) => mapSource(row)),
      ryuRoutes: routeRows.map(mapPostgresRoute),
      savedViews,
    };
  }

  async listPortalSystems(query: RyuSystemQuery = {}): Promise<RyuSystemRecord[]> {
    const systems = await this.buildPortalSystems();
    return systems
      .filter((system) => this.matchesPortalSystem(system, query))
      .map((system) => this.withPortalIncludes(system, query));
  }

  async searchPortalSystems(query: RyuSystemQuery = {}): Promise<RyuSystemRecord[]> {
    return (await this.listPortalSystems(query))
      .map((system) => ({
        system,
        score: systemSearchScore(system, query.query),
      }))
      .filter(({ score }) => score > 0)
      .sort((left, right) =>
        right.score - left.score || left.system.title.localeCompare(right.system.title),
      )
      .map(({ system }) => system);
  }

  async getPortalSystem(id: string, query: RyuSystemQuery = {}): Promise<RyuSystemRecord> {
    const system = (await this.buildPortalSystems()).find((candidate) => candidate.ryuSystemId === id);
    if (!system) {
      throw new Error(`system not found: ${id}`);
    }

    return this.withPortalIncludes(system, query);
  }

  async listRecords(query: RecordSearchQuery): Promise<RecordListResult> {
    const { sql, params } = this.buildRecordSearchSql(query);
    const rows = await this.query(sql, params);
    const pageRows = rows.slice(0, query.limit);
    const ids = pageRows.map((row) => String(row.id));
    const records = await this.getRecordAggregatesByIds(ids, query.locale, query);
    const lastRow = pageRows[pageRows.length - 1];

    return {
      records,
      nextCursor: rows.length > query.limit && lastRow
        ? encodeRecordCursor({
            title: String(lastRow.cursor_title ?? lastRow.id).toLowerCase(),
            id: String(lastRow.id),
          })
        : null,
    };
  }

  async getRecord(id: string, query: RecordSearchQuery): Promise<RecordAggregate> {
    const [record] = await this.getRecordAggregatesByIds([id], query.locale, query);
    if (!record) {
      throw new Error(`record not found: ${id}`);
    }

    return record;
  }

  async validateRecordAggregate(
    id: string,
    _input: RecordAggregateContentInput,
  ): Promise<RecordValidationResult> {
    return {
      valid: true,
      recordId: id,
      issues: [],
      recordUpdatedAt: await this.getRecordUpdatedAt(id),
    };
  }

  async upsertRecord(
    id: string,
    input: RecordAggregateContentInput,
    options: RecordMutationOptions = {},
  ): Promise<RecordAggregate | RecordValidationResult> {
    const validation = await this.validateRecordAggregate(id, input);
    if (options.validateOnly) {
      const precondition = await this.validateRecordMutation(id, options);
      const issues = [...validation.issues, ...precondition.issues];
      return {
        ...validation,
        valid: validation.valid && precondition.valid,
        issues,
        recordUpdatedAt: precondition.recordUpdatedAt,
      };
    }

    await this.withTransaction(async (client) => {
      await this.requireUpsertPrecondition(client, id, options);
      await client.query(
        `
          INSERT INTO nodes (
            id,
            kind,
            country_code,
            subtype,
            url,
            record_depth,
            properties_json
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
          ON CONFLICT (id) DO UPDATE
          SET kind = EXCLUDED.kind,
              country_code = EXCLUDED.country_code,
              subtype = EXCLUDED.subtype,
              url = EXCLUDED.url,
              record_depth = EXCLUDED.record_depth,
              properties_json = EXCLUDED.properties_json
        `,
        [
          id,
          input.record.kind,
          input.record.countryCode ?? null,
          input.record.subtype ?? null,
          input.record.url ?? null,
          input.record.recordDepth ?? "stub",
          stringifyJson(stripRetiredNodeProperties(input.record.properties)),
        ],
      );

      await this.upsertSources(client, input.sources?.upsert ?? []);
      for (const [locale, localization] of Object.entries(input.localizations ?? {})) {
        if (localization) {
          await this.upsertLocalization(client, id, locale as SupportedLocale, localization);
        }
      }
      await this.upsertEdges(client, input.edges ?? []);
      await this.upsertRoutes(client, id, input.routes ?? []);
    });

    return this.getRecordAfterWrite(id);
  }

  async patchRecord(
    id: string,
    input: RecordPatchInput,
    options: RecordMutationOptions = {},
  ): Promise<RecordAggregate | RecordValidationResult> {
    if (options.validateOnly) {
      return this.validateRecordMutation(id, options);
    }

    await this.withTransaction(async (client) => {
      await this.requireExistingRecordPrecondition(client, id, options);
      if (input.record) {
        await this.patchNeutralRecord(client, id, input.record);
      }

      await this.upsertSources(client, input.sources?.upsert ?? []);

      for (const [locale, patch] of Object.entries(input.localizations ?? {})) {
        if (!patch) {
          continue;
        }
        if (patch.mode === "replace") {
          await this.upsertLocalization(client, id, locale as SupportedLocale, patch);
        } else {
          await this.patchLocalization(client, id, locale as SupportedLocale, patch);
        }
      }

      await this.upsertEdges(client, input.edges?.upsert ?? []);
      for (const edgeId of input.edges?.delete ?? []) {
        const result = await client.query(
          `
            DELETE FROM edges
            WHERE id = $1
              AND (source_node_id = $2 OR target_node_id = $2)
          `,
          [edgeId, id],
        );
        if (result.rowCount !== 1) {
          throw new Error(`edge not found for record: ${edgeId}`);
        }
      }

      await this.upsertRoutes(client, id, input.routes?.upsert ?? []);
      for (const routeId of input.routes?.delete ?? []) {
        const result = await client.query(
          "DELETE FROM ryu_routes WHERE id = $1 AND node_id = $2",
          [routeId, id],
        );
        if (result.rowCount !== 1) {
          throw new Error(`route not found for record: ${routeId}`);
        }
      }
    });

    return this.getRecordAfterWrite(id);
  }

  async getRecordDeleteImpact(id: string): Promise<RecordDeleteImpact> {
    const recordUpdatedAt = await this.getRecordUpdatedAt(id);
    if (!recordUpdatedAt) {
      throw new Error(`record not found: ${id}`);
    }

    const nodeRows = await this.countRows("SELECT count(*) AS count FROM nodes WHERE id = $1", [id]);
    if (nodeRows === 0) {
      throw new Error(`record not found: ${id}`);
    }

    const [
      localizationRows,
      inboundEdges,
      outboundEdges,
      routeRows,
      savedViewRows,
    ] = await Promise.all([
      this.countRows("SELECT count(*) AS count FROM node_localizations WHERE node_id = $1", [id]),
      this.countRows("SELECT count(*) AS count FROM edges WHERE target_node_id = $1", [id]),
      this.countRows("SELECT count(*) AS count FROM edges WHERE source_node_id = $1", [id]),
      this.countRows("SELECT count(*) AS count FROM ryu_routes WHERE node_id = $1", [id]),
      this.query(
        `
          SELECT id
          FROM saved_views
          WHERE scope = $1
             OR filter_json::text LIKE $2
             OR layout_json::text LIKE $2
             OR style_json::text LIKE $2
          ORDER BY id
        `,
        [id, `%${id}%`],
      ),
    ]);
    const [aggregate] = await this.getRecordAggregatesByIds([id], defaultLocale);
    const sourceIds = aggregate ? this.collectRecordSourceIds(aggregate) : [];
    const orphanedSourceCandidates: string[] = [];
    for (const sourceId of sourceIds) {
      if (!(await this.sourceIsReferencedOutsideRecord(sourceId, id))) {
        orphanedSourceCandidates.push(sourceId);
      }
    }

    const impactWithoutHash = {
      recordId: id,
      recordUpdatedAt,
      nodeRows,
      localizationRows,
      inboundEdges,
      outboundEdges,
      routeRows,
      affectedSavedViews: savedViewRows.map((row) => String(row.id)),
      orphanedSourceCandidates,
    };

    return {
      ...impactWithoutHash,
      impactHash: buildDeleteImpactHash(impactWithoutHash),
    };
  }

  async deleteRecord(
    id: string,
    impactHash: string,
    options: RecordMutationOptions = {},
  ): Promise<RecordDeleteImpact> {
    const impact = await this.getRecordDeleteImpact(id);
    if (impact.impactHash !== impactHash) {
      throw new ApiRequestError(409, "stale delete impact hash");
    }

    await this.withTransaction(async (client) => {
      await this.requireExistingRecordPrecondition(client, id, options);
      const result = await client.query("DELETE FROM nodes WHERE id = $1", [id]);
      if (result.rowCount !== 1) {
        throw new Error(`record not found: ${id}`);
      }
    });

    return impact;
  }

  async validateBulkRecords(input: BulkRecordValidationInput): Promise<BulkRecordValidationResult> {
    return validateBulkRecordPayload(input);
  }

  async updateNodeLocalizationReview(
    id: string,
    locale: SupportedLocale,
    input: NodeLocalizationReviewInput,
    reviewer: string,
    options: RecordMutationOptions = {},
  ): Promise<GraphNode> {
    const normalizedReviewer = normalizeString(reviewer);
    if (!normalizedReviewer) {
      throw new Error("reviewer is required");
    }

    const hasReviewState = Object.prototype.hasOwnProperty.call(input, "reviewState");
    const hasReviewerNote = Object.prototype.hasOwnProperty.call(input, "reviewerNote");
    if (!hasReviewState && !hasReviewerNote) {
      throw new Error("reviewState or reviewerNote is required");
    }
    if (hasReviewState && !isReviewState(input.reviewState)) {
      throw new Error("invalid reviewState");
    }

    if (options.validateOnly) {
      await this.withTransaction(async (client) => {
        await this.requireExistingRecordPrecondition(client, id, options);
        await this.getNodeLocalization(id, locale, client);
      });
      return this.getNode(id);
    }

    await this.withTransaction(async (client) => {
      await this.requireExistingRecordPrecondition(client, id, options);
      const existing = await this.getNodeLocalization(id, locale, client);
      const reviewState = hasReviewState ? input.reviewState : existing.reviewState;
      const reviewerNote = hasReviewerNote
        ? normalizeString(input.reviewerNote)
        : existing.reviewerNote;
      const lastReviewed = new Date().toISOString();

      await client.query(
        `
          UPDATE node_localizations
          SET review_state = $2,
              reviewer_note = $3,
              reviewer = $4,
              last_reviewed = $5
          WHERE node_id = $1
            AND locale = $6
        `,
        [
          id,
          reviewState,
          reviewerNote,
          normalizedReviewer,
          lastReviewed,
          locale,
        ],
      );
    });

    return this.getNode(id);
  }

  async getSource(id: string): Promise<Source> {
    const row = await this.queryOne("SELECT * FROM sources WHERE id = $1", [id]);
    if (!row) {
      throw new Error(`source not found: ${id}`);
    }

    return mapSource(row);
  }

  async listSavedViews(): Promise<SavedView[]> {
    return (await this.query("SELECT * FROM saved_views ORDER BY updated_at DESC"))
      .map(mapPostgresSavedView);
  }

  private buildRecordSearchSql(query: RecordSearchQuery): { sql: string; params: unknown[] } {
    const params: unknown[] = [query.locale, defaultLocale];
    const filters: string[] = [];
    const addParam = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    const addPatterns = (values: string[]) =>
      addParam(values.map((value) => `%${value}%`));

    if (query.kind.length > 0) {
      filters.push(`n.kind = ANY(${addParam(query.kind)}::text[])`);
    }
    if (query.recordDepth.length > 0) {
      filters.push(`n.record_depth = ANY(${addParam(query.recordDepth)}::text[])`);
    }
    if (query.geography.length > 0) {
      const patterns = addPatterns(query.geography);
      filters.push(`
        (
          n.country_code ILIKE ANY(${patterns}::text[])
          OR n.properties_json->>'geographicScope' ILIKE ANY(${patterns}::text[])
          OR (n.properties_json->'geographies')::text ILIKE ANY(${patterns}::text[])
        )
      `);
    }
    if (query.dataType.length > 0) {
      const patterns = addPatterns(query.dataType);
      filters.push(`
        (
          n.properties_json#>>'{data,descriptors}' ILIKE ANY(${patterns}::text[])
          OR EXISTS (
            SELECT 1
            FROM node_localizations data_l
            WHERE data_l.node_id = n.id
              AND data_l.details_json#>>'{data,descriptors}' ILIKE ANY(${patterns}::text[])
          )
        )
      `);
    }
    if (query.reviewState.length > 0) {
      const reviewStates = addParam(query.reviewState);
      if (query.reviewLocale === "requested") {
        filters.push(`
          EXISTS (
            SELECT 1
            FROM node_localizations review_l
            WHERE review_l.node_id = n.id
              AND review_l.locale = $1
              AND review_l.review_state = ANY(${reviewStates}::text[])
          )
        `);
      } else if (query.reviewLocale === "any") {
        filters.push(`
          EXISTS (
            SELECT 1
            FROM node_localizations review_l
            WHERE review_l.node_id = n.id
              AND review_l.review_state = ANY(${reviewStates}::text[])
          )
        `);
      } else {
        filters.push(`display_l.review_state = ANY(${reviewStates}::text[])`);
      }
    }
    if (query.localeAvailability) {
      if (query.localeAvailability === "available") {
        filters.push(`
          EXISTS (
            SELECT 1
            FROM node_localizations locale_l
            WHERE locale_l.node_id = n.id
              AND locale_l.locale = $1
          )
        `);
      } else if (query.localeAvailability === "missing") {
        filters.push(`
          NOT EXISTS (
            SELECT 1
            FROM node_localizations locale_l
            WHERE locale_l.node_id = n.id
              AND locale_l.locale = $1
          )
        `);
      } else if (query.localeAvailability === "partial") {
        const supported = addParam([...supportedLocales]);
        filters.push(`
          (
            SELECT count(DISTINCT locale_l.locale)
            FROM node_localizations locale_l
            WHERE locale_l.node_id = n.id
              AND locale_l.locale = ANY(${supported}::text[])
          ) < ${supportedLocales.length}
        `);
      } else {
        const supported = addParam([...supportedLocales]);
        filters.push(`
          (
            SELECT count(DISTINCT locale_l.locale)
            FROM node_localizations locale_l
            WHERE locale_l.node_id = n.id
              AND locale_l.locale = ANY(${supported}::text[])
          ) = ${supportedLocales.length}
        `);
      }
    }
    if (query.routeStatus.length > 0) {
      const statuses = addParam(query.routeStatus);
      filters.push(`
        EXISTS (
          SELECT 1
          FROM ryu_routes status_r
          WHERE status_r.node_id = n.id
            AND status_r.status = ANY(${statuses}::text[])
        )
      `);
    }
    if (query.routeCapability.length > 0) {
      const capabilities = addParam(query.routeCapability);
      filters.push(`
        EXISTS (
          SELECT 1
          FROM ryu_routes capability_r
          WHERE capability_r.node_id = n.id
            AND capability_r.capabilities_json ?| ${capabilities}::text[]
        )
      `);
    }
    if (query.accessType.length > 0 || query.accessMethod.length > 0) {
      for (const [values, key] of [
        [query.accessType, "type"],
        [query.accessMethod, "method"],
      ] as const) {
        if (values.length === 0) {
          continue;
        }
        const patterns = addPatterns(values);
        filters.push(`
          (
            n.properties_json#>>'{access}' ILIKE ANY(${patterns}::text[])
            OR EXISTS (
              SELECT 1
              FROM node_localizations access_l
              WHERE access_l.node_id = n.id
                AND access_l.details_json#>>'{access}' ILIKE ANY(${patterns}::text[])
                AND access_l.details_json#>>'{access}' ILIKE '%${key}%'
            )
          )
        `);
      }
    }
    if (query.q) {
      const patterns = addPatterns([query.q]);
      const localizationSearch =
        query.localeMode === "display_locale"
          ? `
            (
              display_l.title ILIKE ANY(${patterns}::text[])
              OR display_l.summary ILIKE ANY(${patterns}::text[])
              OR display_l.description ILIKE ANY(${patterns}::text[])
              OR display_l.source_excerpt ILIKE ANY(${patterns}::text[])
            )
          `
          : `
            EXISTS (
              SELECT 1
              FROM node_localizations search_l
              WHERE search_l.node_id = n.id
                AND ${this.localizationModeSql("search_l", query.localeMode)}
                AND (
                  search_l.title ILIKE ANY(${patterns}::text[])
                  OR search_l.summary ILIKE ANY(${patterns}::text[])
                  OR search_l.description ILIKE ANY(${patterns}::text[])
                  OR search_l.source_excerpt ILIKE ANY(${patterns}::text[])
                  OR search_l.details_json::text ILIKE ANY(${patterns}::text[])
                )
            )
          `;
      filters.push(`
        (
          n.id ILIKE ANY(${patterns}::text[])
          OR n.country_code ILIKE ANY(${patterns}::text[])
          OR n.subtype ILIKE ANY(${patterns}::text[])
          OR n.url ILIKE ANY(${patterns}::text[])
          OR (n.properties_json - 'operator')::text ILIKE ANY(${patterns}::text[])
          OR EXISTS (
            SELECT 1
            FROM ryu_routes search_r
            WHERE search_r.node_id = n.id
              AND (
                search_r.status ILIKE ANY(${patterns}::text[])
                OR search_r.mode ILIKE ANY(${patterns}::text[])
                OR search_r.format ILIKE ANY(${patterns}::text[])
                OR search_r.capabilities_json::text ILIKE ANY(${patterns}::text[])
              )
          )
          OR ${localizationSearch}
        )
      `);
    }
    if (query.cursor) {
      filters.push(`
        (lower(coalesce(display_l.title, n.id)), n.id)
          > (${addParam(query.cursor.title.toLowerCase())}, ${addParam(query.cursor.id)})
      `);
    }

    const limit = addParam(query.limit + 1);
    const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

    return {
      params,
      sql: `
        SELECT
          n.*,
          lower(coalesce(display_l.title, n.id)) AS cursor_title
        FROM nodes n
        LEFT JOIN LATERAL (
          SELECT
            locale,
            title,
            summary,
            description,
            source_excerpt,
            review_state
          FROM node_localizations display_l
          WHERE display_l.node_id = n.id
          ORDER BY
            CASE
              WHEN display_l.locale = $1 THEN 0
              WHEN display_l.locale = $2 THEN 1
              ELSE 2
            END,
            display_l.locale
          LIMIT 1
        ) display_l ON true
        ${where}
        ORDER BY lower(coalesce(display_l.title, n.id)), n.id
        LIMIT ${limit}
      `,
    };
  }

  private localizationModeSql(alias: string, mode: RecordSearchQuery["localeMode"]): string {
    if (mode === "locale_only") {
      return `${alias}.locale = $1`;
    }
    if (mode === "locale_with_fallbacks") {
      return `${alias}.locale IN ($1, $2)`;
    }

    return "true";
  }

  private async getRecordAggregatesByIds(
    ids: string[],
    requestedLocale: SupportedLocale,
    query?: RecordSearchQuery,
  ): Promise<RecordAggregate[]> {
    if (ids.length === 0) {
      return [];
    }

    const [nodeRows, localizationRows, edgeRows, routeRows] = await Promise.all([
      this.query("SELECT * FROM nodes WHERE id = ANY($1::text[])", [ids]),
      this.query(
        "SELECT * FROM node_localizations WHERE node_id = ANY($1::text[]) ORDER BY node_id, locale",
        [ids],
      ),
      this.query(
        `
          SELECT *
          FROM edges
          WHERE source_node_id = ANY($1::text[])
             OR target_node_id = ANY($1::text[])
          ORDER BY id
        `,
        [ids],
      ),
      this.query(
        "SELECT * FROM ryu_routes WHERE node_id = ANY($1::text[]) ORDER BY node_id, priority, id",
        [ids],
      ),
    ]);
    const localizationsByNodeId = new Map<string, NodeLocalization[]>();
    for (const row of localizationRows) {
      const nodeId = String(row.node_id);
      localizationsByNodeId.set(nodeId, [
        ...(localizationsByNodeId.get(nodeId) ?? []),
        mapPostgresNodeLocalization(row),
      ]);
    }

    const nodesById = new Map(
      nodeRows.map((row) => [
        String(row.id),
        mapPostgresNode(row, localizationsByNodeId.get(String(row.id)) ?? [], requestedLocale),
      ]),
    );
    const edges = edgeRows.map(mapPostgresEdge);
    const routes = routeRows.map(mapPostgresRoute);
    const sourceIds = new Set<string>();
    for (const id of ids) {
      const node = nodesById.get(id);
      if (!node) {
        continue;
      }
      collectSourceIds(node.properties, sourceIds);
      Object.values(node.localizations).forEach((localization) => {
        if (localization) {
          collectSourceIds(localization.details, sourceIds);
        }
      });
      edges
        .filter((edge) => edge.sourceNodeId === id || edge.targetNodeId === id)
        .forEach((edge) => collectSourceIds(edge.properties, sourceIds));
      routes
        .filter((route) => route.nodeId === id)
        .forEach((route) => collectSourceIds(route.properties, sourceIds));
    }
    const sources = sourceIds.size > 0
      ? (await this.query("SELECT * FROM sources WHERE id = ANY($1::text[]) ORDER BY title", [[...sourceIds]])).map(mapSource)
      : [];
    const sourcesById = new Map(sources.map((source) => [source.id, source]));

    return ids.flatMap((id) => {
      const node = nodesById.get(id);
      if (!node) {
        return [];
      }

      const recordEdges = edges.filter((edge) => edge.sourceNodeId === id || edge.targetNodeId === id);
      const recordRoutes = routes.filter((route) => route.nodeId === id);
      const recordSourceIds = this.collectRecordSourceIds({
        node,
        edges: recordEdges,
        routes: recordRoutes,
      });

      return [{
        node,
        edges: recordEdges,
        routes: recordRoutes,
        sources: recordSourceIds
          .map((sourceId) => sourcesById.get(sourceId))
          .filter((source): source is Source => Boolean(source)),
        matchReasons: this.recordMatchReasons(node, query),
      }];
    });
  }

  private recordMatchReasons(node: GraphNode, query: RecordSearchQuery | undefined): string[] {
    if (!query) {
      return [];
    }

    return uniqueStrings([
      query.q ? `q:${query.q}` : null,
      query.kind.length > 0 ? `kind:${node.kind}` : null,
      query.recordDepth.length > 0 ? `recordDepth:${node.recordDepth}` : null,
      query.geography.length > 0 ? "geography" : null,
      query.dataType.length > 0 ? "dataType" : null,
      query.reviewState.length > 0 ? "reviewState" : null,
      query.localeAvailability ? `localeAvailability:${query.localeAvailability}` : null,
      query.routeStatus.length > 0 ? "routeStatus" : null,
      query.routeCapability.length > 0 ? "routeCapability" : null,
      query.accessType.length > 0 ? "accessType" : null,
      query.accessMethod.length > 0 ? "accessMethod" : null,
    ]);
  }

  private collectRecordSourceIds(record: {
    node: GraphNode;
    edges: GraphEdge[];
    routes: RyuRoute[];
  }): string[] {
    const sourceIds = new Set<string>();
    collectSourceIds(record.node.properties, sourceIds);
    Object.values(record.node.localizations).forEach((localization) => {
      if (localization) {
        collectSourceIds(localization.details, sourceIds);
      }
    });
    record.edges.forEach((edge) => collectSourceIds(edge.properties, sourceIds));
    record.routes.forEach((route) => collectSourceIds(route.properties, sourceIds));
    return [...sourceIds].sort();
  }

  private async getRecordAfterWrite(id: string): Promise<RecordAggregate> {
    const [record] = await this.getRecordAggregatesByIds([id], defaultLocale);
    if (!record) {
      throw new Error(`record not found: ${id}`);
    }

    return record;
  }

  private async countRows(sql: string, params: unknown[]): Promise<number> {
    const row = await this.queryOne(sql, params);
    return Number(row?.count ?? 0);
  }

  private async sourceIsReferencedOutsideRecord(sourceId: string, recordId: string): Promise<boolean> {
    const pattern = `%${sourceId}%`;
    const row = await this.queryOne(
      `
        SELECT EXISTS (
          SELECT 1
          FROM nodes
          WHERE id <> $2
            AND properties_json::text LIKE $1
          UNION ALL
          SELECT 1
          FROM node_localizations
          WHERE node_id <> $2
            AND details_json::text LIKE $1
          UNION ALL
          SELECT 1
          FROM edges
          WHERE source_node_id <> $2
            AND target_node_id <> $2
            AND properties_json::text LIKE $1
          UNION ALL
          SELECT 1
          FROM ryu_routes
          WHERE node_id <> $2
            AND properties_json::text LIKE $1
        ) AS referenced
      `,
      [pattern, recordId],
    );

    return row?.referenced === true;
  }

  private async getRecordUpdatedAt(
    id: string,
    client: Pool | PoolClient = this.pool,
  ): Promise<string | null> {
    const result = await client.query(
      `
        SELECT max(updated_at) AS record_updated_at
        FROM (
          SELECT updated_at
          FROM nodes
          WHERE id = $1
          UNION ALL
          SELECT updated_at
          FROM node_localizations
          WHERE node_id = $1
          UNION ALL
          SELECT updated_at
          FROM edges
          WHERE source_node_id = $1 OR target_node_id = $1
          UNION ALL
          SELECT updated_at
          FROM ryu_routes
          WHERE node_id = $1
        ) record_versions
      `,
      [id],
    );
    const value = result.rows[0]?.record_updated_at;
    return value == null ? null : timestampText(value);
  }

  private async validateRecordMutation(
    id: string,
    options: RecordMutationOptions,
  ): Promise<RecordValidationResult> {
    const recordUpdatedAt = await this.getRecordUpdatedAt(id);
    const issues: RecordValidationResult["issues"] = [];
    if (options.recordUpdatedAt && recordUpdatedAt && options.recordUpdatedAt !== recordUpdatedAt) {
      issues.push({ recordId: id, message: "stale recordUpdatedAt" });
    }

    return {
      valid: issues.length === 0,
      recordId: id,
      issues,
      recordUpdatedAt,
    };
  }

  private async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async requireExistingNode(client: PoolClient, id: string): Promise<void> {
    const result = await client.query("SELECT id FROM nodes WHERE id = $1 FOR UPDATE", [id]);
    if (result.rowCount !== 1) {
      throw new Error(`record not found: ${id}`);
    }
  }

  private async requireUpsertPrecondition(
    client: PoolClient,
    id: string,
    options: RecordMutationOptions,
  ): Promise<void> {
    const result = await client.query("SELECT id FROM nodes WHERE id = $1 FOR UPDATE", [id]);
    if (result.rowCount === 0) {
      if (options.createOnly) {
        return;
      }
      throw new ApiRequestError(428, "createOnly precondition is required");
    }

    if (options.createOnly) {
      throw new ApiRequestError(412, "record already exists");
    }

    await this.requireRecordUpdatedAt(client, id, options);
  }

  private async requireExistingRecordPrecondition(
    client: PoolClient,
    id: string,
    options: RecordMutationOptions,
  ): Promise<void> {
    await this.requireExistingNode(client, id);
    await this.requireRecordUpdatedAt(client, id, options);
  }

  private async requireRecordUpdatedAt(
    client: PoolClient,
    id: string,
    options: RecordMutationOptions,
  ): Promise<void> {
    if (!options.recordUpdatedAt) {
      throw new ApiRequestError(428, "recordUpdatedAt precondition is required");
    }

    const current = await this.getRecordUpdatedAt(id, client);
    if (current !== options.recordUpdatedAt) {
      throw new ApiRequestError(412, "stale recordUpdatedAt");
    }
  }

  private async patchNeutralRecord(
    client: PoolClient,
    id: string,
    input: RecordPatchInput["record"],
  ): Promise<void> {
    if (!input) {
      return;
    }

    const sets: string[] = [];
    const params: unknown[] = [id];
    const addField = (column: string, value: unknown, cast = "") => {
      params.push(value);
      sets.push(`${column} = $${params.length}${cast}`);
    };

    if (input.kind !== undefined) {
      addField("kind", input.kind);
    }
    if (input.countryCode !== undefined) {
      addField("country_code", input.countryCode);
    }
    if (input.subtype !== undefined) {
      addField("subtype", input.subtype);
    }
    if (input.url !== undefined) {
      addField("url", input.url);
    }
    if (input.recordDepth !== undefined) {
      addField("record_depth", input.recordDepth);
    }
    if (input.propertiesReplace !== undefined) {
      addField(
        "properties_json",
        stringifyJson(stripRetiredNodeProperties(input.propertiesReplace)),
        "::jsonb",
      );
    }
    if (sets.length === 0) {
      return;
    }

    const result = await client.query(
      `UPDATE nodes SET ${sets.join(", ")} WHERE id = $1`,
      params,
    );
    if (result.rowCount !== 1) {
      throw new Error(`record not found: ${id}`);
    }
  }

  private async upsertLocalization(
    client: PoolClient,
    nodeId: string,
    locale: SupportedLocale,
    input: UpsertLocalizationInput,
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO node_localizations (
          node_id,
          locale,
          title,
          summary,
          description,
          details_json,
          source_excerpt,
          translated_from_locale,
          review_state
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, 'agent_researched')
        ON CONFLICT (node_id, locale) DO UPDATE
        SET title = EXCLUDED.title,
            summary = EXCLUDED.summary,
            description = EXCLUDED.description,
            details_json = EXCLUDED.details_json,
            source_excerpt = EXCLUDED.source_excerpt,
            translated_from_locale = EXCLUDED.translated_from_locale
      `,
      [
        nodeId,
        locale,
        input.title,
        input.summary ?? null,
        input.description ?? null,
        stringifyJson(input.details ?? {}),
        input.sourceExcerpt ?? null,
        input.translatedFromLocale ?? null,
      ],
    );
  }

  private async patchLocalization(
    client: PoolClient,
    nodeId: string,
    locale: SupportedLocale,
    input: PatchLocalizationInput,
  ): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [nodeId, locale];
    const addField = (column: string, value: unknown, cast = "") => {
      params.push(value);
      sets.push(`${column} = $${params.length}${cast}`);
    };

    if (input.title !== undefined) {
      addField("title", input.title);
    }
    if (input.summary !== undefined) {
      addField("summary", input.summary);
    }
    if (input.description !== undefined) {
      addField("description", input.description);
    }
    if ("detailsReplace" in input && input.detailsReplace !== undefined) {
      addField("details_json", stringifyJson(input.detailsReplace), "::jsonb");
    }
    if (input.sourceExcerpt !== undefined) {
      addField("source_excerpt", input.sourceExcerpt);
    }
    if (input.translatedFromLocale !== undefined) {
      addField("translated_from_locale", input.translatedFromLocale);
    }
    if (sets.length === 0) {
      return;
    }

    const result = await client.query(
      `
        UPDATE node_localizations
        SET ${sets.join(", ")}
        WHERE node_id = $1
          AND locale = $2
      `,
      params,
    );
    if (result.rowCount !== 1) {
      throw new Error(`node localization not found: ${nodeId}/${locale}`);
    }
  }

  private async upsertSources(client: PoolClient, sources: RecordSourceInput[]): Promise<void> {
    for (const source of sources) {
      await client.query(
        `
          INSERT INTO sources (
            id,
            title,
            source_type,
            url,
            local_path,
            publisher,
            published_at,
            accessed_at,
            note
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO UPDATE
          SET title = EXCLUDED.title,
              source_type = EXCLUDED.source_type,
              url = EXCLUDED.url,
              local_path = EXCLUDED.local_path,
              publisher = EXCLUDED.publisher,
              published_at = EXCLUDED.published_at,
              accessed_at = EXCLUDED.accessed_at,
              note = EXCLUDED.note
        `,
        [
          source.id,
          source.title,
          source.sourceType,
          source.url,
          source.localPath,
          source.publisher,
          source.publishedAt,
          source.accessedAt,
          source.note,
        ],
      );
    }
  }

  private async upsertEdges(client: PoolClient, edges: RecordEdgeInput[]): Promise<void> {
    for (const edge of edges) {
      await client.query(
        `
          INSERT INTO edges (
            id,
            source_node_id,
            target_node_id,
            kind,
            note,
            properties_json
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb)
          ON CONFLICT (id) DO UPDATE
          SET source_node_id = EXCLUDED.source_node_id,
              target_node_id = EXCLUDED.target_node_id,
              kind = EXCLUDED.kind,
              note = EXCLUDED.note,
              properties_json = EXCLUDED.properties_json
        `,
        [
          edge.id,
          edge.sourceNodeId,
          edge.targetNodeId,
          edge.kind,
          edge.note ?? null,
          stringifyJson(edge.properties ?? {}),
        ],
      );
    }
  }

  private async upsertRoutes(
    client: PoolClient,
    nodeId: string,
    routes: RecordRouteInput[],
  ): Promise<void> {
    for (const route of routes) {
      await client.query(
        `
          INSERT INTO ryu_routes (
            id,
            node_id,
            status,
            mode,
            priority,
            capabilities_json,
            target,
            upstream,
            format,
            contract_ref,
            caveat,
            properties_json
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12::jsonb)
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
        `,
        [
          route.id,
          nodeId,
          route.status,
          route.mode,
          route.priority ?? 1,
          JSON.stringify(route.capabilities ?? []),
          route.target ?? null,
          route.upstream ?? null,
          route.format ?? null,
          route.contractRef ?? null,
          route.caveat ?? null,
          stringifyJson(route.properties ?? {}),
        ],
      );
    }
  }

  private async query(sql: string, params: unknown[] = []): Promise<Array<Record<string, unknown>>> {
    const result = await this.pool.query(sql, params);
    return result.rows as Array<Record<string, unknown>>;
  }

  private async queryOne(
    sql: string,
    params: unknown[] = [],
  ): Promise<Record<string, unknown> | undefined> {
    return (await this.query(sql, params))[0];
  }

  private async buildPortalSystems(): Promise<RyuSystemRecord[]> {
    const graph = await this.getBootstrap();
    const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
    const sourcesById = new Map(graph.sources.map((source) => [source.id, source]));
    const routesByNodeId = new Map<string, RyuRoute[]>();

    graph.ryuRoutes.forEach((route) => {
      routesByNodeId.set(route.nodeId, [...(routesByNodeId.get(route.nodeId) ?? []), route]);
    });

    return graph.nodes
      .filter((node) => node.kind === "system")
      .map((node) => {
        const localization = resolveNodeLocalization(node, defaultLocale);
        const details = localization.details as unknown as Record<string, unknown>;
        const sourceIds = collectSourceIds(localization.details);
        collectSourceIds(node.properties, sourceIds);
        const routes = (routesByNodeId.get(node.id) ?? [])
          .map((route) => mapPortalRoute(route))
          .sort((left, right) => left.priority - right.priority || left.routeId.localeCompare(right.routeId));
        const routeCapabilities = routes.flatMap((route) => route.capabilities);
        const routeSupportsLayerSearch = routes.some((route) =>
          route.supportedTools.includes("search_layers"),
        );
        const descriptorLabels = node.properties.data?.descriptors.map((descriptor) => descriptor.label) ?? [];
        const accessValues = node.properties.access?.flatMap((accessPath) => [
          accessPath.type,
          accessPath.method,
        ]) ?? [];

        return {
          ryuSystemId: node.id,
          title: localization.title,
          operator: this.findSystemOperator(
            node,
            graph.edges,
            nodesById,
            localization.requestedLocale,
          ),
          summary: localization.summary,
          description: localization.description,
          requestedLocale: localization.requestedLocale,
          displayLocale: localization.displayLocale,
          isLocaleFallback: localization.isLocaleFallback,
          url: node.url,
          domains: uniqueStrings([
            ...readStringArray(node.properties, "domains"),
            ...readStringArray(node.properties, "families"),
            node.subtype,
            node.properties.role,
            node.properties.disciplineFamily,
          ]),
          geographies: uniqueStrings([
            ...readStringArray(node.properties, "geographies"),
            node.properties.geographicScope,
            node.countryCode,
          ]),
          capabilities: uniqueStrings([
            ...readStringArray(node.properties, "capabilities"),
            ...routeCapabilities,
            ...descriptorLabels,
            ...accessValues,
            routeSupportsLayerSearch ? "map_layers" : null,
          ]),
          routes,
          sources: [...sourceIds]
            .map((sourceId) => sourcesById.get(sourceId))
            .filter((source): source is Source => Boolean(source))
            .map((source) => mapPortalSource(source)),
          caveats: uniqueStrings([
            ...readStringArray(details, "caveats"),
            ...readStringArray(node.properties, "caveats"),
          ]),
          recordDepth: node.recordDepth,
          reviewState: localization.reviewState,
          updatedAt: node.updatedAt,
        };
      });
  }

  private findSystemOperator(
    system: GraphNode,
    edges: GraphEdge[],
    nodesById: Map<string, GraphNode>,
    locale: SupportedLocale,
  ): RyuSystemOperator | null {
    const operatesEdge = edges.find((edge) =>
      edge.kind === "operates" && edge.targetNodeId === system.id,
    );
    const operator = operatesEdge ? nodesById.get(operatesEdge.sourceNodeId) : null;
    if (!operator) {
      return null;
    }

    return {
      id: operator.id,
      name: resolveNodeLocalization(operator, locale).title,
      countryCode: operator.countryCode,
    };
  }

  private matchesPortalSystem(system: RyuSystemRecord, query: RyuSystemQuery): boolean {
    const routeStatus = uniqueStrings(query.routeStatus ?? []);
    const deliveryFormats = uniqueStrings(query.deliveryFormats ?? []);
    const hasRouteFilters = routeStatus.length > 0 || deliveryFormats.length > 0;
    const matchingRoutes = this.filterPortalRoutes(system.routes, query);

    return (
      valuesMatchAny(system.domains, query.domains) &&
      valuesMatchAny(system.geographies, query.geographies) &&
      valuesMatchAny(system.capabilities, query.capabilities) &&
      (!hasRouteFilters || matchingRoutes.length > 0)
    );
  }

  private filterPortalRoutes(routes: RyuPortalRoute[], query: RyuSystemQuery): RyuPortalRoute[] {
    return routes.filter((route) =>
      valuesMatchAny([route.status], query.routeStatus) &&
      valuesMatchAny(route.deliveryFormats, query.deliveryFormats),
    );
  }

  private withPortalIncludes(
    system: RyuSystemRecord,
    query: RyuSystemQuery,
  ): RyuSystemRecord {
    return {
      ...system,
      routes: query.includeRoutes === false ? [] : this.filterPortalRoutes(system.routes, query),
      sources: query.includeSources === false ? [] : system.sources,
    };
  }

  private async getNode(id: string): Promise<GraphNode> {
    const row = await this.queryOne("SELECT * FROM nodes WHERE id = $1", [id]);
    if (!row) {
      throw new Error(`node not found: ${id}`);
    }

    const localizationRows = await this.query(
      "SELECT * FROM node_localizations WHERE node_id = $1 ORDER BY locale",
      [id],
    );

    return mapPostgresNode(row, localizationRows.map(mapPostgresNodeLocalization));
  }

  private async getNodeLocalization(
    id: string,
    locale: SupportedLocale,
    client: Pool | PoolClient = this.pool,
  ): Promise<NodeLocalization> {
    const result = await client.query(
      "SELECT * FROM node_localizations WHERE node_id = $1 AND locale = $2",
      [id, locale],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error(`node localization not found: ${id}/${locale}`);
    }

    return mapPostgresNodeLocalization(row);
  }
}
