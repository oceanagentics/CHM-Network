import type {
  RyuPortalRoute,
  RyuPortalSource,
  RyuSystemRecord,
  Source,
} from "../../shared/domain";
import type { GraphRepository } from "./graphRepository";

type ConnectorStatus = "ready" | "degraded" | "blocked" | "unimplemented";

type ArcgisLayerSummary = {
  id?: number | string;
  name?: string;
  type?: string;
  subLayerIds?: number[] | null;
};

type ArcgisMetadata = {
  id?: number | string;
  name?: string;
  type?: string;
  layers?: ArcgisLayerSummary[];
  tables?: ArcgisLayerSummary[];
  error?: {
    message?: string;
    details?: string[];
  };
};

type LayerSearchInput = {
  ryuSystemId: string;
  ryuRouteId: string;
  query?: string;
  families?: string[];
  semantics?: string[];
  geographies?: string[];
  species?: string[];
  deliveryFormats?: string[];
};

type LayerLookupInput = {
  connectorLayerId: string;
  ryuSystemId?: string;
  ryuRouteId?: string;
  deliveryType?: string;
};

type ConnectorLayer = {
  connectorLayerId: string;
  ryuSystemId: string;
  ryuRouteId: string;
  ryuSourceId: string | null;
  title: string;
  family: string;
  semantics: string;
  species: string | null;
  geography: string | null;
  delivery: {
    type: string;
    url: string | null;
  };
  source: {
    provider: string | null;
    originalUrl: string | null;
    ryuUrl: string | null;
    citation: string | null;
    license: string | null;
    updateCadence: string | null;
    caveats: string[];
  };
  retrieval: {
    status: ConnectorStatus;
    generatedAt: string | null;
  };
  caveats: string[];
};

const connectorPrefix = "arcgis-rest";
const timeoutMs = 15_000;
const userAgent = "Ryu-ArcGIS-Rest-Connector/0.1 (+https://oceanagentics.com)";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => readString(item))
    .filter((item): item is string => Boolean(item));
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matchesAny(values: string[], filters: string[] | undefined): boolean {
  if (!filters || filters.length === 0) {
    return true;
  }

  const normalizedValues = values.map(normalizeSearchText);
  return filters.some((filter) => {
    const normalizedFilter = normalizeSearchText(filter);
    return normalizedValues.some((value) => value.includes(normalizedFilter));
  });
}

function matchesQuery(values: string[], query: string | undefined): boolean {
  if (!query?.trim()) {
    return true;
  }

  const searchText = normalizeSearchText(values.join(" "));
  const normalizedQuery = normalizeSearchText(query);
  const queryTerms = normalizedQuery.split(/\s+/).filter((term) => term.length > 2);
  return (
    searchText.includes(normalizedQuery) ||
    queryTerms.length === 0 ||
    queryTerms.some((term) => searchText.includes(term))
  );
}

function metadataUrl(target: string): string {
  const url = new URL(target);
  url.searchParams.set("f", "json");
  return url.toString();
}

function appendPathSegment(target: string, segment: string): string {
  return `${target.replace(/\/+$/, "")}/${encodeURIComponent(segment)}`;
}

function targetLayerId(target: string): string | null {
  const match = target.match(/\/(?:MapServer|FeatureServer)\/([^/?#]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function layerUrl(target: string, arcgisLayerId: string): string {
  return targetLayerId(target) === arcgisLayerId
    ? target.replace(/\/+$/, "")
    : appendPathSegment(target, arcgisLayerId);
}

function queryGeojsonUrl(target: string, arcgisLayerId: string): string {
  const url = new URL(appendPathSegment(layerUrl(target, arcgisLayerId), "query"));
  url.searchParams.set("where", "1=1");
  url.searchParams.set("outFields", "*");
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("f", "geojson");
  return url.toString();
}

function connectorLayerId(routeId: string, arcgisLayerId: string): string {
  return `${connectorPrefix}--${routeId}--${arcgisLayerId}`;
}

function parseConnectorLayerId(value: string): { routeId: string; arcgisLayerId: string } | null {
  const prefix = `${connectorPrefix}--`;
  if (!value.startsWith(prefix)) {
    return null;
  }

  const rest = value.slice(prefix.length);
  const separator = rest.lastIndexOf("--");
  if (separator === -1) {
    return null;
  }

  return {
    routeId: rest.slice(0, separator),
    arcgisLayerId: rest.slice(separator + 2),
  };
}

function inferFamily(system: RyuSystemRecord, route: RyuPortalRoute): string {
  const text = normalizeSearchText([
    system.name,
    ...system.domains,
    ...system.capabilities,
    ...route.capabilities,
    route.routeId,
    route.mode,
  ].join(" "));

  if (text.includes("whale") || text.includes("cetacean")) {
    return "whale_ecology";
  }
  if (text.includes("fishery") || text.includes("fisheries")) {
    return "fisheries";
  }
  if (text.includes("boundary") || text.includes("management") || text.includes("coastal")) {
    return "boundary_context";
  }

  return system.domains[0] ?? "boundary_context";
}

function inferSemantics(system: RyuSystemRecord, route: RyuPortalRoute, layerTitle: string): string {
  const text = normalizeSearchText([
    system.name,
    ...system.capabilities,
    ...route.capabilities,
    route.routeId,
    layerTitle,
  ].join(" "));

  if (text.includes("critical habitat")) {
    return "critical_habitat";
  }
  if (text.includes("whale") || text.includes("cetacean") || text.includes("important")) {
    return "important_area";
  }
  if (text.includes("fishery use") || text.includes("uses and values")) {
    return "fishery_use_area";
  }
  if (text.includes("fishery boundary")) {
    return "fishery_boundary";
  }
  if (text.includes("management") || text.includes("boundary") || text.includes("territorial sea")) {
    return "management_area";
  }

  return "management_area";
}

function inferSpecies(layerTitle: string, family: string): string | null {
  if (family !== "whale_ecology") {
    return null;
  }

  const title = normalizeSearchText(layerTitle);
  const speciesByNeedle: Array<[string, string]> = [
    ["humpback", "humpback whale"],
    ["blue whale", "blue whale"],
    ["fin whale", "fin whale"],
    ["gray whale", "gray whale"],
    ["killer whale", "killer whale"],
    ["orca", "killer whale"],
    ["sperm whale", "sperm whale"],
  ];

  return speciesByNeedle.find(([needle]) => title.includes(needle))?.[1] ?? null;
}

function sourceFromRecord(source: Source): RyuPortalSource {
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

async function fetchJson(url: string): Promise<ArcgisMetadata> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": userAgent,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json() as unknown;
    if (!isRecord(payload)) {
      throw new Error("ArcGIS endpoint did not return a JSON object");
    }

    const metadata = payload as ArcgisMetadata;
    if (metadata.error) {
      throw new Error(metadata.error.message ?? "ArcGIS endpoint returned an error");
    }

    return metadata;
  } finally {
    clearTimeout(timeout);
  }
}

export class ArcgisRestConnector {
  constructor(private readonly repository: GraphRepository) {}

  async health(input: { ryuSystemId: string; ryuRouteId: string }) {
    const checkedAt = new Date().toISOString();

    try {
      const { route } = await this.resolveRoute(input.ryuSystemId, input.ryuRouteId);
      const metadata = await fetchJson(metadataUrl(route.connectorTarget ?? ""));
      const hasLayers = Array.isArray(metadata.layers) || readString(metadata.name) !== null;

      return {
        status: (hasLayers ? "ready" : "degraded") as ConnectorStatus,
        checkedAt,
        message: hasLayers ? null : "ArcGIS metadata did not include layers or a layer name.",
      };
    } catch (error) {
      return {
        status: "blocked" as ConnectorStatus,
        checkedAt,
        message: error instanceof Error ? error.message : "ArcGIS health check failed",
      };
    }
  }

  async searchLayers(input: LayerSearchInput) {
    const { system, route } = await this.resolveRoute(input.ryuSystemId, input.ryuRouteId);
    const metadata = await fetchJson(metadataUrl(route.connectorTarget ?? ""));
    const layers = (await Promise.all(
      this.layerSummaries(metadata, route).map((summary) => this.mapLayer(system, route, summary)),
    )).filter((layer) => this.matchesLayer(layer, input));

    return { layers };
  }

  async getLayer(input: LayerLookupInput) {
    const { system, route, arcgisLayerId } = await this.resolveLayerLookup(input);
    const metadata = await fetchJson(metadataUrl(layerUrl(route.connectorTarget ?? "", arcgisLayerId)));
    const layer = await this.mapLayer(system, route, {
      id: metadata.id ?? arcgisLayerId,
      name: metadata.name ?? arcgisLayerId,
      type: metadata.type,
      subLayerIds: null,
    });

    return {
      layer: {
        ...layer,
        native: metadata,
      },
    };
  }

  async getSource(input: { ryuSourceId: string }) {
    return {
      source: sourceFromRecord(await this.repository.getSource(input.ryuSourceId)),
    };
  }

  async getLayerAsset(input: LayerLookupInput) {
    const { route, arcgisLayerId } = await this.resolveLayerLookup(input);
    const deliveryType = input.deliveryType ?? "geojson";

    if (deliveryType !== "geojson" && deliveryType !== "arcgis_rest") {
      throw new Error(`unsupported delivery type for ArcGIS REST connector: ${deliveryType}`);
    }

    return {
      asset: deliveryType === "arcgis_rest"
        ? {
            type: "arcgis_rest",
            url: layerUrl(route.connectorTarget ?? "", arcgisLayerId),
            headers: {},
            expiresAt: null,
          }
        : {
            type: "geojson",
            url: queryGeojsonUrl(route.connectorTarget ?? "", arcgisLayerId),
            headers: {},
            expiresAt: null,
          },
    };
  }

  private async resolveRoute(ryuSystemId: string, ryuRouteId: string) {
    const system = await this.repository.getPortalSystem(ryuSystemId);
    const route = system.routes.find((candidate) => candidate.routeId === ryuRouteId);
    if (!route) {
      throw new Error(`route not found for ${ryuSystemId}: ${ryuRouteId}`);
    }
    if (route.connectorRef !== "connector:arcgis-rest") {
      throw new Error(`route is not an ArcGIS REST route: ${ryuRouteId}`);
    }
    if (!route.connectorTarget) {
      throw new Error(`ArcGIS REST route has no connector target: ${ryuRouteId}`);
    }

    return { system, route };
  }

  private async resolveLayerLookup(input: LayerLookupInput) {
    const parsed = parseConnectorLayerId(input.connectorLayerId);
    const ryuRouteId = input.ryuRouteId ?? parsed?.routeId;
    if (!ryuRouteId) {
      throw new Error("ryuRouteId is required when connectorLayerId cannot be parsed");
    }

    const system = input.ryuSystemId
      ? await this.repository.getPortalSystem(input.ryuSystemId)
      : (await this.repository
          .listPortalSystems())
          .find((candidate) =>
            candidate.routes.some((route) => route.routeId === ryuRouteId),
          );
    if (!system) {
      throw new Error(`system not found for route: ${ryuRouteId}`);
    }

    const { route } = await this.resolveRoute(system.ryuSystemId, ryuRouteId);
    return {
      system,
      route,
      arcgisLayerId: parsed?.arcgisLayerId ?? input.connectorLayerId,
    };
  }

  private layerSummaries(metadata: ArcgisMetadata, route: RyuPortalRoute): ArcgisLayerSummary[] {
    const targetId = targetLayerId(route.connectorTarget ?? "");
    if (targetId && readString(metadata.name)) {
      return [{
        id: metadata.id ?? targetId,
        name: metadata.name ?? targetId,
        type: metadata.type,
        subLayerIds: null,
      }];
    }

    return [...(metadata.layers ?? []), ...(metadata.tables ?? [])]
      .filter((layer) => layer.id !== undefined && readString(layer.name))
      .filter((layer) => !Array.isArray(layer.subLayerIds) || layer.subLayerIds.length === 0);
  }

  private async routeSource(
    system: RyuSystemRecord,
    route: RyuPortalRoute,
  ): Promise<RyuPortalSource | null> {
    const sourceIds = readStringArray(route.properties.sourceRefs);
    for (const sourceId of sourceIds) {
      const source = system.sources.find((candidate) => candidate.ryuSourceId === sourceId);
      if (source) {
        return source;
      }

      try {
        return sourceFromRecord(await this.repository.getSource(sourceId));
      } catch {
        continue;
      }
    }

    return system.sources[0] ?? null;
  }

  private async mapLayer(
    system: RyuSystemRecord,
    route: RyuPortalRoute,
    layer: ArcgisLayerSummary,
  ): Promise<ConnectorLayer> {
    const arcgisLayerId = String(layer.id);
    const title = readString(layer.name) ?? arcgisLayerId;
    const family = inferFamily(system, route);
    const semantics = inferSemantics(system, route, title);
    const source = await this.routeSource(system, route);
    const deliveryType = route.deliveryFormats.includes("geojson") ? "geojson" : "arcgis_rest";
    const caveats = uniqueStrings([...route.caveats, ...(source?.caveats ?? [])]);

    return {
      connectorLayerId: connectorLayerId(route.routeId, arcgisLayerId),
      ryuSystemId: system.ryuSystemId,
      ryuRouteId: route.routeId,
      ryuSourceId: source?.ryuSourceId ?? null,
      title,
      family,
      semantics,
      species: inferSpecies(title, family),
      geography: system.geographies.find((geography) =>
        normalizeSearchText(geography).includes("oregon coast"),
      ) ?? system.geographies[0] ?? null,
      delivery: {
        type: deliveryType,
        url: null,
      },
      source: {
        provider: source?.provider ?? system.operator?.name ?? null,
        originalUrl: source?.originalUrl ?? route.connectorTarget,
        ryuUrl: source?.ryuUrl ?? null,
        citation: source?.citation ?? null,
        license: source?.license ?? null,
        updateCadence: source?.updateCadence ?? null,
        caveats: source?.caveats ?? [],
      },
      retrieval: {
        status: "ready",
        generatedAt: null,
      },
      caveats,
    };
  }

  private matchesLayer(layer: ConnectorLayer, input: LayerSearchInput): boolean {
    const values = [
      layer.title,
      layer.family,
      layer.semantics,
      layer.species,
      layer.geography,
    ].filter((value): value is string => Boolean(value));

    return (
      matchesQuery(values, input.query) &&
      matchesAny([layer.family], input.families) &&
      matchesAny([layer.semantics], input.semantics) &&
      matchesAny(layer.geography ? [layer.geography] : [], input.geographies) &&
      matchesAny(layer.species ? [layer.species] : [], input.species) &&
      matchesAny([layer.delivery.type], input.deliveryFormats)
    );
  }
}
