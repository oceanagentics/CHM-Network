import cors from "cors";
import express from "express";

import type {
  EntityInput,
  RelationshipInput,
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

app.get("/api/saved-views", (_request, response) => {
  response.json(repository.listSavedViews());
});

app.post("/api/entities", (request, response) => {
  try {
    response.status(201).json(repository.createEntity(request.body as EntityInput));
  } catch (error) {
    sendError(response, error);
  }
});

app.put("/api/entities/:id", (request, response) => {
  try {
    response.json(
      repository.updateEntity(request.params.id, request.body as EntityInput),
    );
  } catch (error) {
    sendError(response, error);
  }
});

app.delete("/api/entities/:id", (request, response) => {
  try {
    repository.deleteEntity(request.params.id);
    response.status(204).send();
  } catch (error) {
    sendError(response, error);
  }
});

app.post("/api/relationships", (request, response) => {
  try {
    response
      .status(201)
      .json(repository.createRelationship(request.body as RelationshipInput));
  } catch (error) {
    sendError(response, error);
  }
});

app.put("/api/relationships/:id", (request, response) => {
  try {
    response.json(
      repository.updateRelationship(
        request.params.id,
        request.body as RelationshipInput,
      ),
    );
  } catch (error) {
    sendError(response, error);
  }
});

app.delete("/api/relationships/:id", (request, response) => {
  try {
    repository.deleteRelationship(request.params.id);
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
