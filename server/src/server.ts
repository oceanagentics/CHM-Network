import cors from "cors";
import express from "express";

import type {
  GraphEdgeInput,
  GraphNodeInput,
  RyuSystemQuery,
  SavedViewInput,
  SourceInput,
} from "../../shared/domain";
import { getDatabase } from "./db";
import { SqliteGraphRepository } from "./sqliteGraphRepository";

const app = express();
const port = Number(process.env.PORT ?? 8787);

const repository = new SqliteGraphRepository(getDatabase());

function sendError(response: express.Response, error: unknown) {
  const message = error instanceof Error ? error.message : "request failed";
  const status = message.includes("not found") ? 404 : 400;
  response.status(status).json({ error: message });
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

function readBoolean(value: unknown): boolean | undefined {
  if (value === "true" || value === true) {
    return true;
  }
  if (value === "false" || value === false) {
    return false;
  }

  return undefined;
}

function readSystemQuery(input: Record<string, unknown>): RyuSystemQuery {
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

app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
  }),
);
app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/graph/bootstrap", (_request, response) => {
  response.json(repository.getBootstrap());
});

app.get("/api/ryu/systems", (request, response) => {
  response.json(repository.listPortalSystems(readSystemQuery(request.query)));
});

app.get("/api/ryu/systems/search", (request, response) => {
  response.json(repository.searchPortalSystems(readSystemQuery(request.query)));
});

app.post("/api/ryu/systems/search", (request, response) => {
  response.json(repository.searchPortalSystems(readSystemQuery(request.body)));
});

app.get("/api/ryu/systems/:id", (request, response) => {
  try {
    response.json(repository.getPortalSystem(request.params.id, readSystemQuery(request.query)));
  } catch (error) {
    sendError(response, error);
  }
});

app.get("/api/saved-views", (_request, response) => {
  response.json(repository.listSavedViews());
});

app.post("/api/nodes", (request, response) => {
  try {
    response.status(201).json(repository.createNode(request.body as GraphNodeInput));
  } catch (error) {
    sendError(response, error);
  }
});

app.put("/api/nodes/:id", (request, response) => {
  try {
    response.json(
      repository.updateNode(request.params.id, request.body as GraphNodeInput),
    );
  } catch (error) {
    sendError(response, error);
  }
});

app.delete("/api/nodes/:id", (request, response) => {
  try {
    repository.deleteNode(request.params.id);
    response.status(204).send();
  } catch (error) {
    sendError(response, error);
  }
});

app.post("/api/edges", (request, response) => {
  try {
    response
      .status(201)
      .json(repository.createEdge(request.body as GraphEdgeInput));
  } catch (error) {
    sendError(response, error);
  }
});

app.put("/api/edges/:id", (request, response) => {
  try {
    response.json(
      repository.updateEdge(
        request.params.id,
        request.body as GraphEdgeInput,
      ),
    );
  } catch (error) {
    sendError(response, error);
  }
});

app.delete("/api/edges/:id", (request, response) => {
  try {
    repository.deleteEdge(request.params.id);
    response.status(204).send();
  } catch (error) {
    sendError(response, error);
  }
});

app.post("/api/sources", (request, response) => {
  try {
    response.status(201).json(repository.createSource(request.body as SourceInput));
  } catch (error) {
    sendError(response, error);
  }
});

app.put("/api/sources/:id", (request, response) => {
  try {
    response.json(repository.updateSource(request.params.id, request.body as SourceInput));
  } catch (error) {
    sendError(response, error);
  }
});

app.delete("/api/sources/:id", (request, response) => {
  try {
    repository.deleteSource(request.params.id);
    response.status(204).send();
  } catch (error) {
    sendError(response, error);
  }
});

app.post("/api/saved-views", (request, response) => {
  const body = request.body as Partial<SavedViewInput>;
  if (!body.name || !body.scope) {
    response.status(400).json({ error: "name and scope are required" });
    return;
  }

  const savedView = repository.createSavedView({
    name: body.name,
    scope: body.scope,
    filter: body.filter ?? {},
    layout: body.layout ?? {},
    style: body.style ?? {},
  });

  response.status(201).json(savedView);
});

app.put("/api/saved-views/:id", (request, response) => {
  const body = request.body as Partial<SavedViewInput>;
  if (!body.name || !body.scope) {
    response.status(400).json({ error: "name and scope are required" });
    return;
  }

  try {
    const savedView = repository.updateSavedView(request.params.id, {
      name: body.name,
      scope: body.scope,
      filter: body.filter ?? {},
      layout: body.layout ?? {},
      style: body.style ?? {},
    });
    response.json(savedView);
  } catch (error) {
    response.status(404).json({
      error: error instanceof Error ? error.message : "saved view not found",
    });
  }
});

app.delete("/api/saved-views/:id", (request, response) => {
  repository.deleteSavedView(request.params.id);
  response.status(204).send();
});

app.listen(port, () => {
  console.log(`CHM API listening on http://localhost:${port}`);
});
