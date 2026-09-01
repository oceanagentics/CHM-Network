import type {
  RyuPortalRoute,
  RyuPortalSource,
  RyuSystemQuery,
  RyuSystemRecord,
  Source,
} from "../../shared/domain";
import { createGraphRepository } from "./repositoryFactory";

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc?: "2.0";
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
};

type FrameMode = "line" | "content-length";

type WmsRouteContext = {
  system: RyuSystemRecord;
  route: RyuPortalRoute;
  source: RyuPortalSource | null;
  wms: Record<string, unknown>;
};

const defaultWmsCrs = ["EPSG:4326", "EPSG:3395", "EPSG:3857"];
const defaultWmsBbox = {
  west: -180,
  south: -90,
  east: 360,
  north: 90,
};

const repository = createGraphRepository();

let inputBuffer = "";
let frameMode: FrameMode = "line";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.flatMap((item) => readStringList(item) ?? []);
  }
  if (typeof value !== "string") {
    return undefined;
  }

  const values = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  if (value === true || value === "true") {
    return true;
  }
  if (value === false || value === "false") {
    return false;
  }

  return undefined;
}

function readSystemQuery(value: unknown): RyuSystemQuery {
  const input = isRecord(value) ? value : {};
  return {
    query: typeof input.query === "string" ? input.query : undefined,
    domains: readStringList(input.domains),
    geographies: readStringList(input.geographies),
    capabilities: readStringList(input.capabilities),
    deliveryFormats: readStringList(input.deliveryFormats),
    routeStatus: readStringList(input.routeStatus),
    includeRoutes: readBoolean(input.includeRoutes),
    includeSources: readBoolean(input.includeSources),
  };
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function sourceIdsForRoute(route: RyuPortalRoute): string[] {
  return readStringList(route.properties.sourceRefs) ?? [];
}

async function getWmsRouteContext(args: unknown): Promise<WmsRouteContext> {
  const input = isRecord(args) ? args : {};
  const ryuSystemId = readString(input.ryuSystemId);
  const ryuRouteId = readString(input.ryuRouteId);
  if (!ryuSystemId || !ryuRouteId) {
    throw new Error("ryuSystemId and ryuRouteId are required");
  }

  const system = await repository.getPortalSystem(ryuSystemId, {
    includeRoutes: true,
    includeSources: true,
  });
  const route = system.routes.find((candidate) => candidate.routeId === ryuRouteId);
  if (!route) {
    throw new Error(`route not found: ${ryuRouteId}`);
  }
  if (route.connectorRef !== "connector:wms") {
    throw new Error(`route ${ryuRouteId} does not use connector:wms`);
  }

  const sourceIds = sourceIdsForRoute(route);
  const source =
    system.sources.find((candidate) => sourceIds.includes(candidate.ryuSourceId)) ??
    system.sources[0] ??
    null;
  const wms = isRecord(route.properties.wms) ? route.properties.wms : {};
  return { system, route, source, wms };
}

function wmsLayerName(context: WmsRouteContext): string {
  const layers = readString(context.wms.layers) ?? readString(context.wms.layerName);
  if (!layers) {
    throw new Error(`WMS route ${context.route.routeId} is missing route.properties.wms.layers`);
  }

  return layers;
}

function connectorLayerId(context: WmsRouteContext): string {
  return (
    readString(context.wms.connectorLayerId) ??
    readString(context.wms.layerId) ??
    `${context.route.routeId}:${wmsLayerName(context)}`
  );
}

function connectorSource(source: RyuPortalSource | Source | null) {
  if (!source) {
    return {
      ryuSourceId: null,
      title: null,
      provider: null,
      originalUrl: null,
      citation: null,
      license: null,
      updateCadence: null,
      accessedAt: null,
      caveats: [],
    };
  }

  if ("ryuSourceId" in source) {
    return {
      ryuSourceId: source.ryuSourceId,
      title: source.title,
      provider: source.provider,
      originalUrl: source.originalUrl,
      citation: source.citation,
      license: source.license,
      updateCadence: source.updateCadence,
      accessedAt: source.accessedAt,
      caveats: source.caveats,
    };
  }

  return {
    ryuSourceId: source.id,
    title: source.title,
    provider: source.publisher,
    originalUrl: source.url,
    citation: null,
    license: null,
    updateCadence: null,
    accessedAt: source.accessedAt,
    caveats: [],
  };
}

function wmsLayerRecord(context: WmsRouteContext) {
  const source = connectorSource(context.source);
  const sourceId = source.ryuSourceId;
  const layerName = wmsLayerName(context);
  const deliveryFormats = uniqueStrings([
    "raster_wms",
    "wms",
    ...context.route.deliveryFormats,
  ]);

  return {
    connectorLayerId: connectorLayerId(context),
    ryuSystemId: context.system.ryuSystemId,
    ryuRouteId: context.route.routeId,
    ryuSourceId: sourceId,
    title: readString(context.wms.label) ?? context.system.title,
    family: readString(context.wms.family) ?? "basemap",
    semantics: readString(context.wms.semantics) ?? "bathymetry_context",
    species: null,
    geography: context.system.geographies[0] ?? "global ocean",
    delivery: {
      type: "raster_wms",
      baseUrl: context.route.connectorTarget,
      layers: layerName,
      format: readString(context.wms.format) ?? "image/png",
      transparent: readBoolean(context.wms.transparent) ?? false,
      version: readString(context.wms.version) ?? "1.3.0",
      attribution: readString(context.wms.attribution) ?? source.provider,
      supportedCrs: readStringList(context.wms.supportedCrs) ?? defaultWmsCrs,
      bbox: defaultWmsBbox,
      url: null,
    },
    deliveryFormats,
    source,
    retrieval: {
      status: context.route.status === "blocked" ? "blocked" : "ready",
      generatedAt: null,
    },
    caveats: uniqueStrings([
      ...context.route.caveats,
      ...source.caveats,
    ]),
  };
}

function matchesStringFilters(value: string, filters: string[] | undefined): boolean {
  if (!filters?.length) {
    return true;
  }

  const normalizedValue = value.toLowerCase().replace(/[_-]+/g, " ");
  return filters.some((filter) => {
    const normalizedFilter = filter.toLowerCase().replace(/[_-]+/g, " ");
    return normalizedValue === normalizedFilter ||
      normalizedValue.includes(normalizedFilter) ||
      normalizedFilter.includes(normalizedValue);
  });
}

function matchesQuery(value: string, query: string | undefined): boolean {
  if (!query) {
    return true;
  }

  const searchText = value.toLowerCase().replace(/[_-]+/g, " ");
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean)
    .every((term) => searchText.includes(term));
}

async function searchWmsLayers(args: unknown) {
  const input = isRecord(args) ? args : {};
  const context = await getWmsRouteContext(input);
  const layer = wmsLayerRecord(context);
  const query = readString(input.query);
  const searchText = JSON.stringify(layer).toLowerCase();
  const formats = layer.deliveryFormats;

  if (!matchesQuery(searchText, query)) {
    return { layers: [] };
  }
  if (!matchesStringFilters(layer.family, readStringList(input.families))) {
    return { layers: [] };
  }
  if (!matchesStringFilters(layer.semantics, readStringList(input.semantics))) {
    return { layers: [] };
  }
  if (!matchesStringFilters(layer.geography, readStringList(input.geographies))) {
    return { layers: [] };
  }
  if (readStringList(input.deliveryFormats)?.some((format) => !matchesStringFilters(format, formats))) {
    return { layers: [] };
  }

  return { layers: [layer] };
}

async function getWmsLayer(args: unknown) {
  const input = isRecord(args) ? args : {};
  const context = await getWmsRouteContext(input);
  const layer = wmsLayerRecord(context);
  const requestedLayerId = readString(input.connectorLayerId);
  if (requestedLayerId && requestedLayerId !== layer.connectorLayerId) {
    throw new Error(`layer not found: ${requestedLayerId}`);
  }

  return { layer };
}

async function getWmsLayerAsset(args: unknown) {
  const input = isRecord(args) ? args : {};
  const layer = (await getWmsLayer(args)).layer;
  const requestedDeliveryType = readString(input.deliveryType);
  if (requestedDeliveryType && !matchesStringFilters(requestedDeliveryType, layer.deliveryFormats)) {
    throw new Error(`delivery type not available: ${requestedDeliveryType}`);
  }

  return {
    asset: {
      type: layer.delivery.type,
      baseUrl: layer.delivery.baseUrl,
      layers: layer.delivery.layers,
      format: layer.delivery.format,
      transparent: layer.delivery.transparent,
      version: layer.delivery.version,
      attribution: layer.delivery.attribution,
      supportedCrs: layer.delivery.supportedCrs,
      bbox: layer.delivery.bbox,
    },
  };
}

async function getConnectorSource(args: unknown) {
  const input = isRecord(args) ? args : {};
  const ryuSourceId = readString(input.ryuSourceId);
  if (!ryuSourceId) {
    throw new Error("ryuSourceId is required");
  }

  return {
    source: connectorSource(await repository.getSource(ryuSourceId)),
  };
}

function wmsCapabilitiesUrl(context: WmsRouteContext): string {
  if (!context.route.connectorTarget) {
    throw new Error(`WMS route ${context.route.routeId} is missing connectorTarget`);
  }

  const url = new URL(context.route.connectorTarget);
  url.searchParams.set("service", "WMS");
  url.searchParams.set("request", "GetCapabilities");
  url.searchParams.set("version", readString(context.wms.version) ?? "1.3.0");
  return url.toString();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getWmsHealth(args: unknown) {
  const context = await getWmsRouteContext(args);
  const checkedAt = new Date().toISOString();
  const capabilitiesUrl = wmsCapabilitiesUrl(context);
  const layerNames = wmsLayerName(context).split(",").map((item) => item.trim()).filter(Boolean);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(capabilitiesUrl, { signal: controller.signal });
    const body = await response.text();
    const hasNamedLayer = layerNames.some((layerName) =>
      new RegExp(`<Name>\\s*${escapeRegExp(layerName)}\\s*</Name>`).test(body),
    );

    if (!response.ok) {
      return {
        status: "degraded",
        checkedAt,
        message: `GetCapabilities returned HTTP ${response.status}`,
        capabilitiesUrl,
      };
    }
    if (!hasNamedLayer) {
      return {
        status: "degraded",
        checkedAt,
        message: `GetCapabilities did not include ${layerNames.join(", ")}`,
        capabilitiesUrl,
      };
    }

    return {
      status: "ready",
      checkedAt,
      message: null,
      capabilitiesUrl,
    };
  } catch (error) {
    return {
      status: "blocked",
      checkedAt,
      message: error instanceof Error ? error.message : "GetCapabilities failed",
      capabilitiesUrl,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function toolResult(value: unknown): unknown {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2),
      },
    ],
    structuredContent: value,
  };
}

function toolSchemas() {
  const systemQueryProperties = {
    query: {
      type: "string",
      description: "Natural-language or keyword search text.",
    },
    domains: {
      type: "array",
      items: { type: "string" },
      description: "Domain filters such as whale_ecology, fisheries, basemap, or boundary_context.",
    },
    geographies: {
      type: "array",
      items: { type: "string" },
      description: "Geography filters such as Oregon coast or USA.",
    },
    capabilities: {
      type: "array",
      items: { type: "string" },
      description: "Capability filters such as map_layers, habitat_shapes, or management_boundaries.",
    },
    deliveryFormats: {
      type: "array",
      items: { type: "string" },
      description: "Route delivery formats such as geojson, arcgis_rest, pmtiles, wms, or parquet.",
    },
    routeStatus: {
      type: "array",
      items: { type: "string" },
      description: "Route status filters such as active, live, planned, blocked, or deprecated.",
    },
    includeRoutes: {
      type: "boolean",
      description: "Whether to include route metadata. Defaults to true.",
    },
    includeSources: {
      type: "boolean",
      description: "Whether to include source metadata. Defaults to true.",
    },
  };

  return [
    {
      name: "list_systems",
      description: "List Ryu system records with optional structured filters.",
      inputSchema: {
        type: "object",
        properties: systemQueryProperties,
        additionalProperties: false,
      },
    },
    {
      name: "search_systems",
      description: "Search Ryu systems by text and optional route, capability, domain, geography, and delivery filters.",
      inputSchema: {
        type: "object",
        properties: systemQueryProperties,
        additionalProperties: false,
      },
    },
    {
      name: "get_system",
      description: "Get one Ryu system record by id, including routes and source metadata by default.",
      inputSchema: {
        type: "object",
        properties: {
          ryuSystemId: {
            type: "string",
            description: "Ryu system id, such as oregon-dlcd-coastal-gis.",
          },
          includeRoutes: {
            type: "boolean",
            description: "Whether to include route metadata. Defaults to true.",
          },
          includeSources: {
            type: "boolean",
            description: "Whether to include source metadata. Defaults to true.",
          },
        },
        required: ["ryuSystemId"],
        additionalProperties: false,
      },
    },
    {
      name: "health",
      description: "Check a connector route. Currently supports connector:wms routes such as GEBCO.",
      inputSchema: {
        type: "object",
        properties: {
          ryuSystemId: {
            type: "string",
            description: "Ryu system id.",
          },
          ryuRouteId: {
            type: "string",
            description: "Ryu route id.",
          },
        },
        required: ["ryuSystemId", "ryuRouteId"],
        additionalProperties: false,
      },
    },
    {
      name: "search_layers",
      description: "Search normalized connector layer records for a route. Currently supports connector:wms routes.",
      inputSchema: {
        type: "object",
        properties: {
          ryuSystemId: {
            type: "string",
            description: "Ryu system id.",
          },
          ryuRouteId: {
            type: "string",
            description: "Ryu route id.",
          },
          query: {
            type: "string",
            description: "Keyword search text.",
          },
          families: {
            type: "array",
            items: { type: "string" },
            description: "Layer family filters such as basemap or boundary_context.",
          },
          semantics: {
            type: "array",
            items: { type: "string" },
            description: "Layer semantic filters such as bathymetry_context.",
          },
          geographies: {
            type: "array",
            items: { type: "string" },
            description: "Geography filters such as global ocean or Oregon coast.",
          },
          deliveryFormats: {
            type: "array",
            items: { type: "string" },
            description: "Delivery filters such as raster_wms or wms.",
          },
        },
        required: ["ryuSystemId", "ryuRouteId"],
        additionalProperties: false,
      },
    },
    {
      name: "get_layer",
      description: "Get one normalized connector layer record. Currently supports connector:wms routes.",
      inputSchema: {
        type: "object",
        properties: {
          connectorLayerId: {
            type: "string",
            description: "Connector layer id returned by search_layers.",
          },
          ryuSystemId: {
            type: "string",
            description: "Ryu system id.",
          },
          ryuRouteId: {
            type: "string",
            description: "Ryu route id.",
          },
        },
        required: ["ryuSystemId", "ryuRouteId"],
        additionalProperties: false,
      },
    },
    {
      name: "get_source",
      description: "Get source provenance for a connector layer.",
      inputSchema: {
        type: "object",
        properties: {
          ryuSourceId: {
            type: "string",
            description: "Ryu source id.",
          },
        },
        required: ["ryuSourceId"],
        additionalProperties: false,
      },
    },
    {
      name: "get_layer_asset",
      description: "Get renderable delivery instructions for a connector layer. Currently supports connector:wms routes.",
      inputSchema: {
        type: "object",
        properties: {
          connectorLayerId: {
            type: "string",
            description: "Connector layer id returned by search_layers.",
          },
          ryuSystemId: {
            type: "string",
            description: "Ryu system id.",
          },
          ryuRouteId: {
            type: "string",
            description: "Ryu route id.",
          },
          deliveryType: {
            type: "string",
            description: "Requested delivery type, such as raster_wms.",
          },
        },
        required: ["ryuSystemId", "ryuRouteId"],
        additionalProperties: false,
      },
    },
  ];
}

async function callTool(name: string, args: unknown): Promise<unknown> {
  if (name === "list_systems") {
    return toolResult({
      systems: await repository.listPortalSystems(readSystemQuery(args)),
    });
  }

  if (name === "search_systems") {
    return toolResult({
      systems: await repository.searchPortalSystems(readSystemQuery(args)),
    });
  }

  if (name === "get_system") {
    const input = isRecord(args) ? args : {};
    const ryuSystemId = typeof input.ryuSystemId === "string" ? input.ryuSystemId : null;
    if (!ryuSystemId) {
      throw new Error("ryuSystemId is required");
    }

    return toolResult({
      system: await repository.getPortalSystem(ryuSystemId, readSystemQuery(input)),
    });
  }

  if (name === "health") {
    return toolResult(await getWmsHealth(args));
  }

  if (name === "search_layers") {
    return toolResult(await searchWmsLayers(args));
  }

  if (name === "get_layer") {
    return toolResult(await getWmsLayer(args));
  }

  if (name === "get_source") {
    return toolResult(await getConnectorSource(args));
  }

  if (name === "get_layer_asset") {
    return toolResult(await getWmsLayerAsset(args));
  }

  throw new Error(`unknown tool: ${name}`);
}

async function handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  const id = request.id ?? null;

  try {
    if (!request.method) {
      throw new Error("method is required");
    }

    if (request.method.startsWith("notifications/")) {
      return null;
    }

    if (request.method === "initialize") {
      const params = isRecord(request.params) ? request.params : {};
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: typeof params.protocolVersion === "string"
            ? params.protocolVersion
            : "2024-11-05",
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: "ryu-mcp-portal",
            version: "0.1.0",
          },
        },
      };
    }

    if (request.method === "ping") {
      return {
        jsonrpc: "2.0",
        id,
        result: {},
      };
    }

    if (request.method === "tools/list") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: toolSchemas(),
        },
      };
    }

    if (request.method === "tools/call") {
      const params = isRecord(request.params) ? request.params : {};
      const name = typeof params.name === "string" ? params.name : null;
      if (!name) {
        throw new Error("tool name is required");
      }

      return {
        jsonrpc: "2.0",
        id,
        result: await callTool(name, params.arguments),
      };
    }

    if (request.method === "resources/list" || request.method === "prompts/list") {
      return {
        jsonrpc: "2.0",
        id,
        result: request.method === "resources/list" ? { resources: [] } : { prompts: [] },
      };
    }

    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32601,
        message: `method not found: ${request.method}`,
      },
    };
  } catch (error) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : "request failed",
      },
    };
  }
}

function writeResponse(response: JsonRpcResponse): void {
  const payload = JSON.stringify(response);
  if (frameMode === "content-length") {
    process.stdout.write(`Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n${payload}`);
    return;
  }

  process.stdout.write(`${payload}\n`);
}

async function processMessage(payload: string): Promise<void> {
  let parsed: JsonRpcRequest;
  try {
    parsed = JSON.parse(payload) as JsonRpcRequest;
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid JSON";
    writeResponse({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32700,
        message,
      },
    });
    return;
  }

  const response = await handleRequest(parsed);
  if (response) {
    writeResponse(response);
  }
}

function processLineFrames(): void {
  while (true) {
    const newlineIndex = inputBuffer.indexOf("\n");
    if (newlineIndex === -1) {
      return;
    }

    const line = inputBuffer.slice(0, newlineIndex).trim();
    inputBuffer = inputBuffer.slice(newlineIndex + 1);
    if (line) {
      void processMessage(line);
    }
  }
}

function processContentLengthFrames(): void {
  while (true) {
    const headerEnd = inputBuffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) {
      return;
    }

    const header = inputBuffer.slice(0, headerEnd);
    const lengthMatch = /content-length:\s*(\d+)/i.exec(header);
    if (!lengthMatch) {
      inputBuffer = inputBuffer.slice(headerEnd + 4);
      continue;
    }

    const contentLength = Number(lengthMatch[1]);
    const messageStart = headerEnd + 4;
    const messageEnd = messageStart + contentLength;
    if (inputBuffer.length < messageEnd) {
      return;
    }

    const payload = inputBuffer.slice(messageStart, messageEnd);
    inputBuffer = inputBuffer.slice(messageEnd);
    void processMessage(payload);
  }
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  inputBuffer += chunk;
  if (inputBuffer.toLowerCase().startsWith("content-length:")) {
    frameMode = "content-length";
    processContentLengthFrames();
    return;
  }

  processLineFrames();
});

process.stdin.on("error", (error) => {
  console.error(error);
});

process.stdin.on("end", () => {
  void repository.close?.();
});
