import type { Pool } from "pg";
import crypto from "node:crypto";

import type {
  GraphBootstrapPayload,
  GraphEdge,
  GraphEdgeInput,
  GraphNode,
  GraphNodeInput,
  RyuPortalRoute,
  RyuRoute,
  RyuSystemOperator,
  RyuSystemQuery,
  RyuSystemRecord,
  SavedView,
  SavedViewInput,
  Source,
  SourceInput,
} from "../../shared/domain";
import type { GraphRepository } from "./graphRepository";
import {
  collectSourceIds,
  createId,
  emptyNodeDetails,
  filterSavedViews,
  idPart,
  isEdgeKind,
  isNodeKind,
  isRecord,
  isRecordDepth,
  isReviewState,
  mapEdge,
  mapNode,
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
  type RawRyuRoute,
} from "./graphRepositorySupport";

function jsonText(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

function timestampText(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapPostgresNode(row: Record<string, unknown>): GraphNode {
  return mapNode({
    ...(row as RawNode),
    review_json: jsonText(row.review_json),
    details_json: jsonText(row.details_json),
    properties_json: jsonText(row.properties_json),
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
    const [nodeRows, edgeRows, sourceRows, routeRows] = await Promise.all([
      this.query("SELECT * FROM nodes ORDER BY name"),
      this.query("SELECT * FROM edges ORDER BY id"),
      this.query("SELECT * FROM sources ORDER BY title"),
      this.query("SELECT * FROM ryu_routes ORDER BY node_id, priority, id"),
    ]);
    const nodes = nodeRows.map(mapPostgresNode);
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
        right.score - left.score || left.system.name.localeCompare(right.system.name),
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

  async createNode(input: GraphNodeInput): Promise<GraphNode> {
    const node = this.validateNodeInput(input);
    const id = await this.createNodeId(node.name);
    const params = this.nodeParams(id, node);

    await this.pool.query(
      `
        INSERT INTO nodes (
          id, kind, name, country_code, subtype, url, summary, description,
          record_depth, review_state, review_json, details_json, properties_json
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11::jsonb, $12::jsonb, $13::jsonb
        )
      `,
      [
        params.id,
        params.kind,
        params.name,
        params.countryCode,
        params.subtype,
        params.url,
        params.summary,
        params.description,
        params.recordDepth,
        params.reviewState,
        params.reviewJson,
        params.detailsJson,
        params.propertiesJson,
      ],
    );

    return this.getNode(id);
  }

  async updateNode(id: string, input: GraphNodeInput): Promise<GraphNode> {
    const existing = await this.getNode(id);
    const node = this.validateNodeInput(input, existing);
    const params = this.nodeParams(id, node);

    await this.pool.query(
      `
        UPDATE nodes
        SET kind = $2,
            name = $3,
            country_code = $4,
            subtype = $5,
            url = $6,
            summary = $7,
            description = $8,
            record_depth = $9,
            review_state = $10,
            review_json = $11::jsonb,
            details_json = $12::jsonb,
            properties_json = $13::jsonb
        WHERE id = $1
      `,
      [
        params.id,
        params.kind,
        params.name,
        params.countryCode,
        params.subtype,
        params.url,
        params.summary,
        params.description,
        params.recordDepth,
        params.reviewState,
        params.reviewJson,
        params.detailsJson,
        params.propertiesJson,
      ],
    );

    return this.getNode(id);
  }

  async deleteNode(id: string): Promise<void> {
    await this.getNode(id);
    await this.pool.query("DELETE FROM nodes WHERE id = $1", [id]);
  }

  async createEdge(input: GraphEdgeInput): Promise<GraphEdge> {
    const edge = await this.validateEdgeInput(input);
    const id = createId("edge");

    await this.pool.query(
      `
        INSERT INTO edges (
          id, source_node_id, target_node_id, kind, note, properties_json
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [
        id,
        edge.sourceNodeId,
        edge.targetNodeId,
        edge.kind,
        edge.note,
        stringifyJson(edge.properties ?? {}),
      ],
    );

    return this.getEdge(id);
  }

  async updateEdge(id: string, input: GraphEdgeInput): Promise<GraphEdge> {
    await this.getEdge(id);
    const edge = await this.validateEdgeInput(input, id);

    await this.pool.query(
      `
        UPDATE edges
        SET source_node_id = $2,
            target_node_id = $3,
            kind = $4,
            note = $5,
            properties_json = $6::jsonb
        WHERE id = $1
      `,
      [
        id,
        edge.sourceNodeId,
        edge.targetNodeId,
        edge.kind,
        edge.note,
        stringifyJson(edge.properties ?? {}),
      ],
    );

    return this.getEdge(id);
  }

  async deleteEdge(id: string): Promise<void> {
    await this.getEdge(id);
    await this.pool.query("DELETE FROM edges WHERE id = $1", [id]);
  }

  async getSource(id: string): Promise<Source> {
    const row = await this.queryOne("SELECT * FROM sources WHERE id = $1", [id]);
    if (!row) {
      throw new Error(`source not found: ${id}`);
    }

    return mapSource(row);
  }

  async createSource(input: SourceInput): Promise<Source> {
    const source = this.validateSourceInput(input);
    const id = createId("src");

    await this.pool.query(
      `
        INSERT INTO sources (
          id, title, source_type, url, local_path, publisher, published_at, accessed_at, note
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        id,
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

    return this.getSource(id);
  }

  async updateSource(id: string, input: SourceInput): Promise<Source> {
    await this.getSource(id);
    const source = this.validateSourceInput(input);

    await this.pool.query(
      `
        UPDATE sources
        SET title = $2,
            source_type = $3,
            url = $4,
            local_path = $5,
            publisher = $6,
            published_at = $7,
            accessed_at = $8,
            note = $9
        WHERE id = $1
      `,
      [
        id,
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

    return this.getSource(id);
  }

  async deleteSource(id: string): Promise<void> {
    await this.getSource(id);
    await this.pool.query("DELETE FROM sources WHERE id = $1", [id]);
  }

  async listSavedViews(): Promise<SavedView[]> {
    return (await this.query("SELECT * FROM saved_views ORDER BY updated_at DESC"))
      .map(mapPostgresSavedView);
  }

  async createSavedView(input: SavedViewInput): Promise<SavedView> {
    const id = createId("view");
    await this.pool.query(
      `
        INSERT INTO saved_views (id, name, scope, filter_json, layout_json, style_json)
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb)
      `,
      [
        id,
        input.name,
        input.scope,
        stringifyJson(input.filter),
        stringifyJson(input.layout),
        stringifyJson(input.style),
      ],
    );

    return this.getSavedView(id);
  }

  async updateSavedView(id: string, input: SavedViewInput): Promise<SavedView> {
    await this.pool.query(
      `
        UPDATE saved_views
        SET name = $2,
            scope = $3,
            filter_json = $4::jsonb,
            layout_json = $5::jsonb,
            style_json = $6::jsonb
        WHERE id = $1
      `,
      [
        id,
        input.name,
        input.scope,
        stringifyJson(input.filter),
        stringifyJson(input.layout),
        stringifyJson(input.style),
      ],
    );

    return this.getSavedView(id);
  }

  async deleteSavedView(id: string): Promise<void> {
    await this.pool.query("DELETE FROM saved_views WHERE id = $1", [id]);
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
        const details = node.details as unknown as Record<string, unknown>;
        const sourceIds = collectSourceIds(node.details);
        collectSourceIds(node.properties, sourceIds);
        const routes = (routesByNodeId.get(node.id) ?? [])
          .map((route) => mapPortalRoute(route))
          .sort((left, right) => left.priority - right.priority || left.routeId.localeCompare(right.routeId));
        const routeCapabilities = routes.flatMap((route) => route.capabilities);
        const routeSupportsLayerSearch = routes.some((route) =>
          route.supportedTools.includes("search_layers"),
        );
        const descriptorLabels = node.details.data.descriptors.map((descriptor) => descriptor.label);
        const accessValues = node.details.access.flatMap((accessPath) => [
          accessPath.type,
          accessPath.method,
          accessPath.label,
        ]);

        return {
          ryuSystemId: node.id,
          name: node.name,
          operator: this.findSystemOperator(node, graph.edges, nodesById),
          summary: node.summary,
          description: node.description,
          url: node.url,
          domains: uniqueStrings([
            ...readStringArray(node.properties, "domains"),
            ...readStringArray(node.properties, "families"),
            node.subtype,
            node.details.role,
            node.details.disciplineFamily,
          ]),
          geographies: uniqueStrings([
            ...readStringArray(node.properties, "geographies"),
            node.details.geographicScope,
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
          reviewState: node.reviewState,
          updatedAt: node.updatedAt,
        };
      });
  }

  private findSystemOperator(
    system: GraphNode,
    edges: GraphEdge[],
    nodesById: Map<string, GraphNode>,
  ): RyuSystemOperator | null {
    if (system.details.operator?.id && system.details.operator.name) {
      return {
        id: system.details.operator.id,
        name: system.details.operator.name,
        countryCode: system.details.operator.countryCode,
      };
    }

    const operatesEdge = edges.find((edge) =>
      edge.kind === "operates" && edge.targetNodeId === system.id,
    );
    const operator = operatesEdge ? nodesById.get(operatesEdge.sourceNodeId) : null;
    if (!operator) {
      return null;
    }

    return {
      id: operator.id,
      name: operator.name,
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

  private async createNodeId(name: string): Promise<string> {
    const baseId = idPart(name).replace(/^(system|org|country)-/, "") || createId("node");
    if (!(await this.queryOne("SELECT 1 FROM nodes WHERE id = $1 LIMIT 1", [baseId]))) {
      return baseId;
    }

    for (let suffix = 2; suffix < 1000; suffix += 1) {
      const candidate = `${baseId}-${suffix}`;
      if (!(await this.queryOne("SELECT 1 FROM nodes WHERE id = $1 LIMIT 1", [candidate]))) {
        return candidate;
      }
    }

    return `${baseId}-${crypto.randomUUID()}`;
  }

  private nodeParams(id: string, input: GraphNodeInput) {
    const details = input.details ?? emptyNodeDetails();

    return {
      id,
      kind: input.kind,
      name: input.name,
      countryCode: input.countryCode ?? null,
      subtype: input.kind === "organization" ? input.subtype ?? null : null,
      url: input.url ?? null,
      summary: input.summary ?? null,
      description: input.description ?? null,
      recordDepth: input.recordDepth ?? "stub",
      reviewState: input.reviewState ?? "unreviewed",
      reviewJson: stringifyJson(input.review ?? {}),
      detailsJson: stringifyJson(details as unknown as Record<string, unknown>),
      propertiesJson: stringifyJson(input.properties ?? {}),
    };
  }

  private validateNodeInput(input: GraphNodeInput, existing?: GraphNode): GraphNodeInput {
    if (!isNodeKind(input.kind)) {
      throw new Error("invalid node kind");
    }
    if (!input.name?.trim()) {
      throw new Error("name is required");
    }

    return {
      kind: input.kind,
      name: input.name.trim(),
      countryCode: normalizeString(input.countryCode),
      subtype: normalizeString(input.subtype),
      url: input.url === undefined ? existing?.url ?? null : normalizeString(input.url),
      summary: input.summary === undefined
        ? existing?.summary ?? null
        : normalizeString(input.summary),
      description: input.description === undefined
        ? existing?.description ?? null
        : normalizeString(input.description),
      recordDepth: isRecordDepth(input.recordDepth)
        ? input.recordDepth
        : existing?.recordDepth ?? "stub",
      reviewState: isReviewState(input.reviewState)
        ? input.reviewState
        : existing?.reviewState ?? "unreviewed",
      review: isRecord(input.review) ? input.review : existing?.review ?? {},
      details: input.details ?? existing?.details ?? emptyNodeDetails(),
      properties: input.properties ?? existing?.properties ?? {},
    };
  }

  private async validateEdgeInput(
    input: GraphEdgeInput,
    edgeId?: string,
  ): Promise<GraphEdgeInput> {
    if (!isEdgeKind(input.kind)) {
      throw new Error("invalid edge kind");
    }
    if (!input.sourceNodeId || !input.targetNodeId) {
      throw new Error("source and target are required");
    }
    if (input.sourceNodeId === input.targetNodeId) {
      throw new Error("edge endpoints must differ");
    }

    const source = await this.getNode(input.sourceNodeId);
    const target = await this.getNode(input.targetNodeId);

    if (input.kind === "governs" && (source.kind !== "country" || target.kind !== "organization")) {
      throw new Error("governs must connect country to organization");
    }
    if (
      (input.kind === "operates" || input.kind === "publishes_to") &&
      (source.kind !== "organization" || target.kind !== "system")
    ) {
      throw new Error(`${input.kind} must connect organization to system`);
    }
    if (
      (input.kind === "part_of" || input.kind === "syncs_to") &&
      (source.kind !== "system" || target.kind !== "system")
    ) {
      throw new Error(`${input.kind} must connect system to system`);
    }

    if (input.kind === "governs") {
      const existing = edgeId
        ? await this.queryOne(
            "SELECT id FROM edges WHERE target_node_id = $1 AND kind = 'governs' AND id <> $2 LIMIT 1",
            [input.targetNodeId, edgeId],
          )
        : await this.queryOne(
            "SELECT id FROM edges WHERE target_node_id = $1 AND kind = 'governs' LIMIT 1",
            [input.targetNodeId],
          );
      if (existing) {
        throw new Error("organization may only have one governs edge");
      }
    }

    return {
      sourceNodeId: input.sourceNodeId,
      targetNodeId: input.targetNodeId,
      kind: input.kind,
      note: normalizeString(input.note),
      properties: input.properties ?? {},
    };
  }

  private validateSourceInput(input: SourceInput): SourceInput {
    if (!input.title?.trim()) {
      throw new Error("source title is required");
    }
    if (!input.sourceType?.trim()) {
      throw new Error("source type is required");
    }

    return {
      title: input.title.trim(),
      sourceType: input.sourceType.trim(),
      url: normalizeString(input.url),
      localPath: normalizeString(input.localPath),
      publisher: normalizeString(input.publisher),
      publishedAt: normalizeString(input.publishedAt),
      accessedAt: normalizeString(input.accessedAt),
      note: normalizeString(input.note),
    };
  }

  private async getNode(id: string): Promise<GraphNode> {
    const row = await this.queryOne("SELECT * FROM nodes WHERE id = $1", [id]);
    if (!row) {
      throw new Error(`node not found: ${id}`);
    }

    return mapPostgresNode(row);
  }

  private async getEdge(id: string): Promise<GraphEdge> {
    const row = await this.queryOne("SELECT * FROM edges WHERE id = $1", [id]);
    if (!row) {
      throw new Error(`edge not found: ${id}`);
    }

    return mapPostgresEdge(row);
  }

  private async getSavedView(id: string): Promise<SavedView> {
    const row = await this.queryOne("SELECT * FROM saved_views WHERE id = $1", [id]);
    if (!row) {
      throw new Error(`saved view not found: ${id}`);
    }

    return mapPostgresSavedView(row);
  }
}
