import { ArcgisRestConnector } from "./arcgisRestConnector";
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

const repository = createGraphRepository();
const connector = new ArcgisRestConnector(repository);

let inputBuffer = "";
let frameMode: FrameMode = "line";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const values = value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
    return values.length > 0 ? values : undefined;
  }
  if (typeof value !== "string") {
    return undefined;
  }

  const values = value.split(",").map((item) => item.trim()).filter(Boolean);
  return values.length > 0 ? values : undefined;
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

function routeInput(args: unknown) {
  const input = isRecord(args) ? args : {};
  const ryuSystemId = typeof input.ryuSystemId === "string" ? input.ryuSystemId : null;
  const ryuRouteId = typeof input.ryuRouteId === "string" ? input.ryuRouteId : null;
  if (!ryuSystemId || !ryuRouteId) {
    throw new Error("ryuSystemId and ryuRouteId are required");
  }

  return { input, ryuSystemId, ryuRouteId };
}

function layerInput(args: unknown) {
  const input = isRecord(args) ? args : {};
  const connectorLayerId = typeof input.connectorLayerId === "string"
    ? input.connectorLayerId
    : null;
  if (!connectorLayerId) {
    throw new Error("connectorLayerId is required");
  }

  return {
    connectorLayerId,
    ryuSystemId: typeof input.ryuSystemId === "string" ? input.ryuSystemId : undefined,
    ryuRouteId: typeof input.ryuRouteId === "string" ? input.ryuRouteId : undefined,
    deliveryType: typeof input.deliveryType === "string" ? input.deliveryType : undefined,
  };
}

function toolSchemas() {
  const routeProperties = {
    ryuSystemId: {
      type: "string",
      description: "Ryu system id, such as oregon-dlcd-coastal-gis.",
    },
    ryuRouteId: {
      type: "string",
      description: "Ryu ArcGIS REST route id.",
    },
  };
  const layerFilters = {
    query: {
      type: "string",
      description: "Optional keyword search text.",
    },
    families: {
      type: "array",
      items: { type: "string" },
      description: "Layer families such as boundary_context or whale_ecology.",
    },
    semantics: {
      type: "array",
      items: { type: "string" },
      description: "Layer semantics such as management_area or important_area.",
    },
    geographies: {
      type: "array",
      items: { type: "string" },
      description: "Geographies such as Oregon coast.",
    },
    species: {
      type: "array",
      items: { type: "string" },
      description: "Species filters for source layers that expose species.",
    },
    deliveryFormats: {
      type: "array",
      items: { type: "string" },
      description: "Delivery formats such as geojson or arcgis_rest.",
    },
  };

  return [
    {
      name: "health",
      description: "Check whether a Ryu ArcGIS REST route is reachable and inspectable.",
      inputSchema: {
        type: "object",
        properties: routeProperties,
        required: ["ryuSystemId", "ryuRouteId"],
        additionalProperties: false,
      },
    },
    {
      name: "search_layers",
      description: "Search layers exposed by a Ryu ArcGIS REST route.",
      inputSchema: {
        type: "object",
        properties: {
          ...routeProperties,
          ...layerFilters,
        },
        required: ["ryuSystemId", "ryuRouteId"],
        additionalProperties: false,
      },
    },
    {
      name: "get_layer",
      description: "Get normalized metadata for one ArcGIS REST connector layer.",
      inputSchema: {
        type: "object",
        properties: {
          connectorLayerId: { type: "string" },
          ryuSystemId: { type: "string" },
          ryuRouteId: { type: "string" },
        },
        required: ["connectorLayerId"],
        additionalProperties: false,
      },
    },
    {
      name: "get_source",
      description: "Get a Ryu source record by source id.",
      inputSchema: {
        type: "object",
        properties: {
          ryuSourceId: { type: "string" },
        },
        required: ["ryuSourceId"],
        additionalProperties: false,
      },
    },
    {
      name: "get_layer_asset",
      description: "Get a renderable ArcGIS REST or GeoJSON asset URL for one connector layer.",
      inputSchema: {
        type: "object",
        properties: {
          connectorLayerId: { type: "string" },
          ryuSystemId: { type: "string" },
          ryuRouteId: { type: "string" },
          deliveryType: {
            type: "string",
            enum: ["geojson", "arcgis_rest"],
          },
        },
        required: ["connectorLayerId"],
        additionalProperties: false,
      },
    },
  ];
}

async function callTool(name: string, args: unknown): Promise<unknown> {
  if (name === "health") {
    const { ryuSystemId, ryuRouteId } = routeInput(args);
    return toolResult(await connector.health({ ryuSystemId, ryuRouteId }));
  }

  if (name === "search_layers") {
    const { input, ryuSystemId, ryuRouteId } = routeInput(args);
    return toolResult(await connector.searchLayers({
      ryuSystemId,
      ryuRouteId,
      query: typeof input.query === "string" ? input.query : undefined,
      families: readStringList(input.families),
      semantics: readStringList(input.semantics),
      geographies: readStringList(input.geographies),
      species: readStringList(input.species),
      deliveryFormats: readStringList(input.deliveryFormats),
    }));
  }

  if (name === "get_layer") {
    return toolResult(await connector.getLayer(layerInput(args)));
  }

  if (name === "get_source") {
    const input = isRecord(args) ? args : {};
    const ryuSourceId = typeof input.ryuSourceId === "string" ? input.ryuSourceId : null;
    if (!ryuSourceId) {
      throw new Error("ryuSourceId is required");
    }

    return toolResult(await connector.getSource({ ryuSourceId }));
  }

  if (name === "get_layer_asset") {
    return toolResult(await connector.getLayerAsset(layerInput(args)));
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
            name: "ryu-arcgis-rest-connector",
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
    const contentLengthMatch = header.match(/Content-Length:\s*(\d+)/i);
    if (!contentLengthMatch) {
      inputBuffer = inputBuffer.slice(headerEnd + 4);
      continue;
    }

    const contentLength = Number(contentLengthMatch[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + contentLength;
    if (inputBuffer.length < bodyEnd) {
      return;
    }

    const body = inputBuffer.slice(bodyStart, bodyEnd);
    inputBuffer = inputBuffer.slice(bodyEnd);
    void processMessage(body);
  }
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  inputBuffer += chunk;
  if (inputBuffer.startsWith("Content-Length:")) {
    frameMode = "content-length";
  }

  if (frameMode === "content-length") {
    processContentLengthFrames();
  } else {
    processLineFrames();
  }
});

process.stdin.on("end", () => {
  void repository.close?.();
});
