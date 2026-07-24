import type Database from "better-sqlite3";
import crypto from "node:crypto";

import type {
  GraphBootstrapPayload,
  GraphEdge,
  GraphEdgeInput,
  GraphEdgeKind,
  GraphNode,
  GraphNodeInput,
  GraphNodeKind,
  NodeDetails,
  RecordDepth,
  ReviewState,
  RyuRoute,
  SavedView,
  SavedViewInput,
  Source,
  SourceInput,
} from "../../shared/domain";

type JsonValue = Record<string, unknown>;

type RawNode = {
  id: string;
  kind: GraphNodeKind;
  name: string;
  country_code: string | null;
  subtype: string | null;
  url: string | null;
  summary: string | null;
  description: string | null;
  record_depth: RecordDepth;
  review_state: ReviewState;
  review_json: string | null;
  details_json: string | null;
  properties_json: string | null;
  created_at: string;
  updated_at: string;
};

type RawEdge = {
  id: string;
  source_node_id: string;
  target_node_id: string;
  kind: GraphEdgeKind;
  note: string | null;
  properties_json: string | null;
  created_at: string;
  updated_at: string;
};

type RawRyuRoute = {
  id: string;
  node_id: string;
  status: string;
  mode: string;
  priority: number;
  capabilities_json: string | null;
  target: string | null;
  upstream: string | null;
  format: string | null;
  contract_ref: string | null;
  caveat: string | null;
  properties_json: string | null;
  created_at: string;
  updated_at: string;
};

const nodeKinds = ["country", "organization", "system"] as const;
const edgeKinds = ["governs", "operates", "part_of", "publishes_to", "syncs_to"] as const;
const recordDepths = ["stub", "thin", "rich"] as const;
const reviewStates = [
  "unreviewed",
  "agent_researched",
  "needs_human_review",
  "human_reviewed",
  "needs_revision",
] as const;

function emptyNodeDetails(): NodeDetails {
  return {
    aliases: [],
    operator: null,
    role: null,
    disciplineFamily: null,
    geographicScope: null,
    gallery: [],
    data: {
      descriptors: [],
      recordCount: null,
      storageSize: null,
    },
    access: [],
    identifiers: [],
    usage: [],
  };
}

function parseJson(value: string | null): JsonValue {
  if (!value) {
    return {};
  }

  return JSON.parse(value) as JsonValue;
}

function stringifyJson(value: Record<string, unknown>): string {
  return JSON.stringify(value ?? {});
}

function parseStringArray(value: string | null): string[] {
  const parsed = value ? JSON.parse(value) : [];
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map((item) => normalizeString(item))
    .filter((item): item is string => Boolean(item));
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeDetails(value: unknown): NodeDetails {
  const base = emptyNodeDetails();
  if (!isRecord(value)) {
    return base;
  }

  const data = isRecord(value.data) ? value.data : {};

  return {
    aliases: Array.isArray(value.aliases) ? value.aliases.filter(isString) : [],
    operator: isRecord(value.operator)
      ? {
          id: String(value.operator.id ?? ""),
          name: String(value.operator.name ?? ""),
          countryCode: normalizeString(value.operator.countryCode),
        }
      : null,
    role: normalizeString(value.role),
    disciplineFamily: normalizeString(value.disciplineFamily),
    geographicScope: normalizeString(value.geographicScope),
    gallery: Array.isArray(value.gallery) ? value.gallery as NodeDetails["gallery"] : [],
    data: {
      descriptors: Array.isArray(data.descriptors)
        ? data.descriptors as NodeDetails["data"]["descriptors"]
        : [],
      recordCount: isRecord(data.recordCount)
        ? data.recordCount as unknown as NodeDetails["data"]["recordCount"]
        : null,
      storageSize: isRecord(data.storageSize)
        ? data.storageSize as unknown as NodeDetails["data"]["storageSize"]
        : null,
    },
    access: Array.isArray(value.access) ? value.access as NodeDetails["access"] : [],
    identifiers: Array.isArray(value.identifiers)
      ? value.identifiers as NodeDetails["identifiers"]
      : [],
    usage: Array.isArray(value.usage) ? value.usage as NodeDetails["usage"] : [],
  };
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNodeKind(value: unknown): value is GraphNodeKind {
  return typeof value === "string" && nodeKinds.includes(value as GraphNodeKind);
}

function isEdgeKind(value: unknown): value is GraphEdgeKind {
  return typeof value === "string" && edgeKinds.includes(value as GraphEdgeKind);
}

function isRecordDepth(value: unknown): value is RecordDepth {
  return typeof value === "string" && recordDepths.includes(value as RecordDepth);
}

function isReviewState(value: unknown): value is ReviewState {
  return typeof value === "string" && reviewStates.includes(value as ReviewState);
}

function mapNode(row: RawNode): GraphNode {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    countryCode: row.country_code,
    subtype: row.subtype,
    url: row.url,
    summary: row.summary,
    description: row.description,
    recordDepth: row.record_depth,
    reviewState: row.review_state,
    review: parseJson(row.review_json),
    details: normalizeDetails(parseJson(row.details_json)),
    properties: parseJson(row.properties_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEdge(row: RawEdge): GraphEdge {
  return {
    id: row.id,
    sourceNodeId: row.source_node_id,
    targetNodeId: row.target_node_id,
    kind: row.kind,
    note: row.note,
    properties: parseJson(row.properties_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSource(row: Record<string, unknown>): Source {
  return {
    id: String(row.id),
    title: String(row.title),
    sourceType: String(row.source_type),
    url: (row.url as string | null) ?? null,
    localPath: (row.local_path as string | null) ?? null,
    publisher: (row.publisher as string | null) ?? null,
    publishedAt: (row.published_at as string | null) ?? null,
    accessedAt: (row.accessed_at as string | null) ?? null,
    note: (row.note as string | null) ?? null,
  };
}

function mapRyuRoute(row: RawRyuRoute): RyuRoute {
  return {
    id: row.id,
    nodeId: row.node_id,
    status: row.status,
    mode: row.mode,
    priority: Number(row.priority),
    capabilities: parseStringArray(row.capabilities_json),
    target: row.target,
    upstream: row.upstream,
    format: row.format,
    contractRef: row.contract_ref,
    caveat: row.caveat,
    properties: parseJson(row.properties_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSavedView(row: Record<string, unknown>): SavedView {
  return {
    id: String(row.id),
    name: String(row.name),
    scope: String(row.scope),
    filter: parseJson((row.filter_json as string | null) ?? "{}"),
    layout: parseJson((row.layout_json as string | null) ?? "{}"),
    style: parseJson((row.style_json as string | null) ?? "{}"),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function filterSavedViews(savedViews: SavedView[], nodeIds: Set<string>): SavedView[] {
  return savedViews.filter((savedView) => {
    const filter = savedView.filter as { focusEntityId?: string | null };
    const scopeIsViewMode =
      savedView.scope === "governance" ||
      savedView.scope === "country" ||
      savedView.scope === "technical";

    return (
      (scopeIsViewMode || nodeIds.has(savedView.scope)) &&
      (!filter.focusEntityId || nodeIds.has(filter.focusEntityId))
    );
  });
}

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export class SqliteGraphRepository {
  constructor(private readonly db: Database.Database) {}

  getBootstrap(): GraphBootstrapPayload {
    const nodes = (this.db
      .prepare("SELECT * FROM nodes ORDER BY name")
      .all() as RawNode[]).map((node) => mapNode(node));
    const edges = (this.db
      .prepare("SELECT * FROM edges ORDER BY id")
      .all() as RawEdge[]).map((edge) => mapEdge(edge));
    const sources = this.db
      .prepare("SELECT * FROM sources ORDER BY title")
      .all()
      .map((row) => mapSource(row as Record<string, unknown>));
    const ryuRoutes = (this.db
      .prepare("SELECT * FROM ryu_routes ORDER BY node_id, priority, id")
      .all() as RawRyuRoute[]).map((route) => mapRyuRoute(route));
    const savedViews = filterSavedViews(
      this.listSavedViews(),
      new Set(nodes.map((node) => node.id)),
    );

    return {
      nodes,
      edges,
      sources,
      ryuRoutes,
      savedViews,
    };
  }

  createNode(input: GraphNodeInput): GraphNode {
    const node = this.validateNodeInput(input);
    const id = createId(
      node.kind === "country"
        ? "country"
        : node.kind === "organization"
          ? "org"
          : "system",
    );

    this.db
      .prepare(
        `
        INSERT INTO nodes (
          id, kind, name, country_code, subtype, url, summary, description,
          record_depth, review_state, review_json, details_json, properties_json
        ) VALUES (
          @id, @kind, @name, @countryCode, @subtype, @url, @summary, @description,
          @recordDepth, @reviewState, @reviewJson, @detailsJson, @propertiesJson
        )
      `,
      )
      .run(this.nodeParams(id, node));

    return this.getNode(id);
  }

  updateNode(id: string, input: GraphNodeInput): GraphNode {
    const existing = this.getNode(id);
    const node = this.validateNodeInput(input, existing);

    this.db
      .prepare(
        `
        UPDATE nodes
        SET kind = @kind,
            name = @name,
            country_code = @countryCode,
            subtype = @subtype,
            url = @url,
            summary = @summary,
            description = @description,
            record_depth = @recordDepth,
            review_state = @reviewState,
            review_json = @reviewJson,
            details_json = @detailsJson,
            properties_json = @propertiesJson
        WHERE id = @id
      `,
      )
      .run(this.nodeParams(id, node));

    return this.getNode(id);
  }

  deleteNode(id: string): void {
    this.getNode(id);
    this.db.prepare("DELETE FROM nodes WHERE id = ?").run(id);
  }

  createEdge(input: GraphEdgeInput): GraphEdge {
    const edge = this.validateEdgeInput(input);
    const id = createId("edge");

    this.db
      .prepare(
        `
        INSERT INTO edges (
          id, source_node_id, target_node_id, kind, note, properties_json
        ) VALUES (
          @id, @sourceNodeId, @targetNodeId, @kind, @note, @propertiesJson
        )
      `,
      )
      .run({
        id,
        sourceNodeId: edge.sourceNodeId,
        targetNodeId: edge.targetNodeId,
        kind: edge.kind,
        note: edge.note,
        propertiesJson: stringifyJson(edge.properties ?? {}),
      });

    return this.getEdge(id);
  }

  updateEdge(id: string, input: GraphEdgeInput): GraphEdge {
    this.getEdge(id);
    const edge = this.validateEdgeInput(input, id);

    this.db
      .prepare(
        `
        UPDATE edges
        SET source_node_id = @sourceNodeId,
            target_node_id = @targetNodeId,
            kind = @kind,
            note = @note,
            properties_json = @propertiesJson
        WHERE id = @id
      `,
      )
      .run({
        id,
        sourceNodeId: edge.sourceNodeId,
        targetNodeId: edge.targetNodeId,
        kind: edge.kind,
        note: edge.note,
        propertiesJson: stringifyJson(edge.properties ?? {}),
      });

    return this.getEdge(id);
  }

  deleteEdge(id: string): void {
    this.getEdge(id);
    this.db.prepare("DELETE FROM edges WHERE id = ?").run(id);
  }

  createSource(input: SourceInput): Source {
    const source = this.validateSourceInput(input);
    const id = createId("src");
    this.db
      .prepare(
        `
        INSERT INTO sources (
          id, title, source_type, url, local_path, publisher, published_at, accessed_at, note
        ) VALUES (
          @id, @title, @sourceType, @url, @localPath, @publisher, @publishedAt, @accessedAt, @note
        )
      `,
      )
      .run({
        id,
        ...source,
      });

    return this.getSource(id);
  }

  updateSource(id: string, input: SourceInput): Source {
    this.getSource(id);
    const source = this.validateSourceInput(input);
    this.db
      .prepare(
        `
        UPDATE sources
        SET title = @title,
            source_type = @sourceType,
            url = @url,
            local_path = @localPath,
            publisher = @publisher,
            published_at = @publishedAt,
            accessed_at = @accessedAt,
            note = @note
        WHERE id = @id
      `,
      )
      .run({
        id,
        ...source,
      });

    return this.getSource(id);
  }

  deleteSource(id: string): void {
    this.getSource(id);
    this.db.prepare("DELETE FROM sources WHERE id = ?").run(id);
  }

  listSavedViews(): SavedView[] {
    return this.db
      .prepare("SELECT * FROM saved_views ORDER BY updated_at DESC")
      .all()
      .map((row) => mapSavedView(row as Record<string, unknown>));
  }

  createSavedView(input: SavedViewInput): SavedView {
    const id = `view-${crypto.randomUUID()}`;
    this.db
      .prepare(
        `
        INSERT INTO saved_views (id, name, scope, filter_json, layout_json, style_json)
        VALUES (@id, @name, @scope, @filterJson, @layoutJson, @styleJson)
      `,
      )
      .run({
        id,
        name: input.name,
        scope: input.scope,
        filterJson: JSON.stringify(input.filter),
        layoutJson: JSON.stringify(input.layout),
        styleJson: JSON.stringify(input.style),
      });

    return this.getSavedView(id);
  }

  updateSavedView(id: string, input: SavedViewInput): SavedView {
    this.db
      .prepare(
        `
        UPDATE saved_views
        SET name = @name,
            scope = @scope,
            filter_json = @filterJson,
            layout_json = @layoutJson,
            style_json = @styleJson
        WHERE id = @id
      `,
      )
      .run({
        id,
        name: input.name,
        scope: input.scope,
        filterJson: JSON.stringify(input.filter),
        layoutJson: JSON.stringify(input.layout),
        styleJson: JSON.stringify(input.style),
      });

    return this.getSavedView(id);
  }

  deleteSavedView(id: string): void {
    this.db.prepare("DELETE FROM saved_views WHERE id = ?").run(id);
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

  private validateEdgeInput(
    input: GraphEdgeInput,
    edgeId?: string,
  ): GraphEdgeInput {
    if (!isEdgeKind(input.kind)) {
      throw new Error("invalid edge kind");
    }
    if (!input.sourceNodeId || !input.targetNodeId) {
      throw new Error("source and target are required");
    }
    if (input.sourceNodeId === input.targetNodeId) {
      throw new Error("edge endpoints must differ");
    }

    const source = this.getNode(input.sourceNodeId);
    const target = this.getNode(input.targetNodeId);

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
        ? this.db
            .prepare(
              "SELECT id FROM edges WHERE target_node_id = ? AND kind = 'governs' AND id <> ? LIMIT 1",
            )
            .get(input.targetNodeId, edgeId)
        : this.db
            .prepare(
              "SELECT id FROM edges WHERE target_node_id = ? AND kind = 'governs' LIMIT 1",
            )
            .get(input.targetNodeId);
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

  private getNode(id: string): GraphNode {
    const row = this.db.prepare("SELECT * FROM nodes WHERE id = ?").get(id) as RawNode | undefined;
    if (!row) {
      throw new Error(`node not found: ${id}`);
    }

    return mapNode(row);
  }

  private getEdge(id: string): GraphEdge {
    const row = this.db
      .prepare("SELECT * FROM edges WHERE id = ?")
      .get(id) as RawEdge | undefined;
    if (!row) {
      throw new Error(`edge not found: ${id}`);
    }

    return mapEdge(row);
  }

  private getSource(id: string): Source {
    const row = this.db.prepare("SELECT * FROM sources WHERE id = ?").get(id);
    if (!row) {
      throw new Error(`source not found: ${id}`);
    }

    return mapSource(row as Record<string, unknown>);
  }

  private getSavedView(id: string): SavedView {
    const row = this.db.prepare("SELECT * FROM saved_views WHERE id = ?").get(id);
    if (!row) {
      throw new Error(`saved view not found: ${id}`);
    }

    return mapSavedView(row as Record<string, unknown>);
  }
}
