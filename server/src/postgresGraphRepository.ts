import type { Pool } from "pg";

import type {
  GraphBootstrapPayload,
  GraphEdge,
  GraphNode,
  NodeReviewInput,
  RyuPortalRoute,
  RyuRoute,
  RyuSystemOperator,
  RyuSystemQuery,
  RyuSystemRecord,
  SavedView,
  Source,
} from "../../shared/domain";
import type { GraphRepository } from "./graphRepository";
import {
  collectSourceIds,
  filterSavedViews,
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

  async updateNodeReview(
    id: string,
    input: NodeReviewInput,
    reviewer: string,
  ): Promise<GraphNode> {
    const existing = await this.getNode(id);
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

    const reviewState = hasReviewState ? input.reviewState : existing.reviewState;
    const reviewerNote = hasReviewerNote
      ? normalizeString(input.reviewerNote)
      : existing.reviewerNote;
    const lastReviewed = new Date().toISOString();

    await this.pool.query(
      `
        UPDATE nodes
        SET review_state = $2,
            review_json = $3::jsonb
        WHERE id = $1
      `,
      [
        id,
        reviewState,
        stringifyJson({
          reviewerNote,
          reviewer: normalizedReviewer,
          lastReviewed,
        }),
      ],
    );

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

  private async getNode(id: string): Promise<GraphNode> {
    const row = await this.queryOne("SELECT * FROM nodes WHERE id = $1", [id]);
    if (!row) {
      throw new Error(`node not found: ${id}`);
    }

    return mapPostgresNode(row);
  }
}
