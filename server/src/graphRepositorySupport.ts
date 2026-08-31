import type {
  GraphEdge,
  GraphEdgeKind,
  GraphNode,
  GraphNodeKind,
  NodeDetails,
  RecordDepth,
  ReviewState,
  RyuPortalRoute,
  RyuPortalSource,
  RyuRoute,
  RyuSystemOperator,
  RyuSystemQuery,
  RyuSystemRecord,
  SavedView,
  Source,
} from "../../shared/domain";

export type JsonValue = Record<string, unknown>;

export type RawNode = {
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

export type RawEdge = {
  id: string;
  source_node_id: string;
  target_node_id: string;
  kind: GraphEdgeKind;
  note: string | null;
  properties_json: string | null;
  created_at: string;
  updated_at: string;
};

export type RawRyuRoute = {
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
  "agent_researched",
  "human_reviewed",
  "needs_revision",
] as const;

export function emptyNodeDetails(): NodeDetails {
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

export function parseJson(value: string | null): JsonValue {
  if (!value) {
    return {};
  }

  return JSON.parse(value) as JsonValue;
}

export function stringifyJson(value: Record<string, unknown>): string {
  return JSON.stringify(value ?? {});
}

export function parseStringArray(value: string | null): string[] {
  const parsed = value ? JSON.parse(value) : [];
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map((item) => normalizeString(item))
    .filter((item): item is string => Boolean(item));
}

export function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
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

export function isNodeKind(value: unknown): value is GraphNodeKind {
  return typeof value === "string" && nodeKinds.includes(value as GraphNodeKind);
}

export function isEdgeKind(value: unknown): value is GraphEdgeKind {
  return typeof value === "string" && edgeKinds.includes(value as GraphEdgeKind);
}

export function isRecordDepth(value: unknown): value is RecordDepth {
  return typeof value === "string" && recordDepths.includes(value as RecordDepth);
}

export function isReviewState(value: unknown): value is ReviewState {
  return typeof value === "string" && reviewStates.includes(value as ReviewState);
}

function readReviewString(review: JsonValue, key: string): string | null {
  const value = review[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export function mapNode(row: RawNode): GraphNode {
  const review = parseJson(row.review_json);

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
    reviewerNote: readReviewString(review, "reviewerNote"),
    reviewer: readReviewString(review, "reviewer"),
    lastReviewed: readReviewString(review, "lastReviewed"),
    review,
    details: normalizeDetails(parseJson(row.details_json)),
    properties: parseJson(row.properties_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapEdge(row: RawEdge): GraphEdge {
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

export function mapSource(row: Record<string, unknown>): Source {
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

export function mapRyuRoute(row: RawRyuRoute): RyuRoute {
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

export function mapSavedView(row: Record<string, unknown>): SavedView {
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

export function filterSavedViews(savedViews: SavedView[], nodeIds: Set<string>): SavedView[] {
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

export function idPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values
    .map((value) => normalizeString(value))
    .filter((value): value is string => Boolean(value)))];
}

export function readStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return uniqueStrings(value.map((item) => normalizeString(item)));
}

export function readString(record: Record<string, unknown>, key: string): string | null {
  return normalizeString(record[key]);
}

export function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, " ");
}

export function valuesMatchAny(values: string[], filters: string[] | undefined): boolean {
  const normalizedFilters = uniqueStrings(filters ?? []).map(normalizeSearchText);
  if (normalizedFilters.length === 0) {
    return true;
  }

  const normalizedValues = values.map(normalizeSearchText);
  return normalizedFilters.some((filter) =>
    normalizedValues.some((value) => value === filter || value.includes(filter) || filter.includes(value)),
  );
}

export function collectStrings(value: unknown, results: string[] = []): string[] {
  if (typeof value === "string") {
    results.push(value);
    return results;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, results));
    return results;
  }

  if (isRecord(value)) {
    Object.values(value).forEach((item) => collectStrings(item, results));
  }

  return results;
}

export function collectSourceIds(value: unknown, results = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((item) => collectSourceIds(item, results));
    return results;
  }

  if (!isRecord(value)) {
    return results;
  }

  if (typeof value.id === "string" && value.id.startsWith("src-")) {
    results.add(value.id);
  }

  if (Array.isArray(value.sourceRefs)) {
    value.sourceRefs
      .map((item) => normalizeString(item))
      .filter((item): item is string => Boolean(item))
      .forEach((item) => results.add(item));
  }

  Object.values(value).forEach((item) => collectSourceIds(item, results));
  return results;
}

export function inferConnectorRef(route: RyuRoute): string | null {
  if (route.mode.includes("arcgis") || route.format === "arcgis_rest") {
    return "connector:arcgis-rest";
  }
  if (route.contractRef?.includes("downloadable-gis-snapshot")) {
    return "connector:downloadable-gis-snapshot";
  }
  if (route.contractRef?.includes("geojson-snapshot")) {
    return "connector:geojson";
  }
  if (route.mode.includes("wms") || route.format === "wms") {
    return "connector:wms";
  }
  if (route.format === "pmtiles") {
    return "connector:pmtiles";
  }
  if (route.format === "geojson") {
    return "connector:geojson";
  }
  if (route.format === "parquet") {
    return "connector:parquet";
  }

  return null;
}

export function inferSupportedTools(route: RyuRoute): string[] {
  const format = route.format ?? "";
  const searchableFormats = ["arcgis_rest", "geojson", "pmtiles", "raster_tile", "vector_tile", "wms"];
  const hasLayerCapability = route.capabilities.some((capability) =>
    normalizeSearchText(capability).includes("layer") ||
    normalizeSearchText(capability).includes("boundary") ||
    normalizeSearchText(capability).includes("underlay"),
  );

  if (searchableFormats.includes(format) || hasLayerCapability) {
    return ["search_layers", "get_layer", "get_source", "get_layer_asset", "health"];
  }

  return ["health"];
}

export function mapPortalRoute(route: RyuRoute): RyuPortalRoute {
  const supportedTools = readStringArray(route.properties, "supportedTools");
  const deliveryFormats = uniqueStrings([
    route.format,
    ...readStringArray(route.properties, "deliveryFormats"),
  ]);
  const auth = isRecord(route.properties.auth) ? route.properties.auth : {};
  const authRequired =
    typeof auth.required === "boolean"
      ? auth.required
      : route.properties.authRequired === true;

  return {
    routeId: route.id,
    status: route.status,
    mode: route.mode,
    priority: route.priority,
    connectorRef: readString(route.properties, "connectorRef") ?? inferConnectorRef(route),
    connectorTarget: route.target,
    upstream: route.upstream,
    supportedTools: supportedTools.length > 0 ? supportedTools : inferSupportedTools(route),
    capabilities: route.capabilities,
    deliveryFormats,
    auth: {
      required: authRequired,
    },
    contractRef: route.contractRef,
    caveats: uniqueStrings([route.caveat, ...readStringArray(route.properties, "caveats")]),
    properties: route.properties,
    createdAt: route.createdAt,
    updatedAt: route.updatedAt,
  };
}

export function mapPortalSource(source: Source): RyuPortalSource {
  return {
    ryuSourceId: source.id,
    title: source.title,
    sourceType: source.sourceType,
    provider: source.publisher,
    originalUrl: source.url,
    ryuUrl: `/sources/${encodeURIComponent(source.id)}`,
    localPath: source.localPath,
    citation: null,
    license: null,
    updateCadence: null,
    accessedAt: source.accessedAt,
    caveats: [],
  };
}

export function systemSearchScore(system: RyuSystemRecord, query: string | undefined): number {
  const terms = uniqueStrings(query?.split(/\s+/) ?? []).map(normalizeSearchText);
  if (terms.length === 0) {
    return 1;
  }

  const searchText = normalizeSearchText(collectStrings(system).join(" "));
  const score = terms.reduce((total, term) => total + (searchText.includes(term) ? 1 : 0), 0);
  return searchText.includes(normalizeSearchText(query ?? "")) ? score + terms.length : score;
}
