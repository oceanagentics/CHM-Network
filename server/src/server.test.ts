import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  GraphBootstrapPayload,
  GraphEdge,
  GraphEdgeInput,
  GraphNode,
  GraphNodeInput,
  RyuSystemQuery,
  RyuSystemRecord,
  SavedView,
  SavedViewInput,
  Source,
  SourceInput,
} from "../../shared/domain";
import type { GraphRepository } from "./graphRepository";
import { createApp, type RyuRuntimeMode } from "./server";

const bootstrap: GraphBootstrapPayload = {
  nodes: [],
  edges: [],
  sources: [],
  ryuRoutes: [],
  savedViews: [],
};

class FakeRepository implements GraphRepository {
  getBootstrap(): GraphBootstrapPayload {
    return bootstrap;
  }

  listPortalSystems(_query?: RyuSystemQuery): RyuSystemRecord[] {
    return [];
  }

  searchPortalSystems(_query?: RyuSystemQuery): RyuSystemRecord[] {
    return [];
  }

  getPortalSystem(id: string): RyuSystemRecord {
    throw new Error(`system not found: ${id}`);
  }

  createNode(input: GraphNodeInput): GraphNode {
    return {
      id: "node-1",
      kind: input.kind,
      name: input.name,
      countryCode: input.countryCode ?? null,
      subtype: input.subtype ?? null,
      url: input.url ?? null,
      summary: input.summary ?? null,
      description: input.description ?? null,
      recordDepth: input.recordDepth ?? "stub",
      reviewState: input.reviewState ?? "unreviewed",
      review: input.review ?? {},
      details: input.details ?? {
        aliases: [],
        operator: null,
        role: null,
        disciplineFamily: null,
        geographicScope: null,
        gallery: [],
        data: { descriptors: [], recordCount: null, storageSize: null },
        access: [],
        identifiers: [],
        usage: [],
      },
      properties: input.properties ?? {},
      createdAt: "2026-08-27T00:00:00.000Z",
      updatedAt: "2026-08-27T00:00:00.000Z",
    };
  }

  updateNode(_id: string, input: GraphNodeInput): GraphNode {
    return this.createNode(input);
  }

  deleteNode(_id: string): void {}
  createEdge(input: GraphEdgeInput): GraphEdge {
    return {
      id: "edge-1",
      sourceNodeId: input.sourceNodeId,
      targetNodeId: input.targetNodeId,
      kind: input.kind,
      note: input.note ?? null,
      properties: input.properties ?? {},
      createdAt: "2026-08-27T00:00:00.000Z",
      updatedAt: "2026-08-27T00:00:00.000Z",
    };
  }

  updateEdge(_id: string, input: GraphEdgeInput): GraphEdge {
    return this.createEdge(input);
  }

  deleteEdge(_id: string): void {}
  getSource(id: string): Source {
    return {
      id,
      title: "Source",
      sourceType: "web",
      url: null,
      localPath: null,
      publisher: null,
      publishedAt: null,
      accessedAt: null,
      note: null,
    };
  }

  createSource(input: SourceInput): Source {
    return { id: "src-1", ...input };
  }

  updateSource(_id: string, input: SourceInput): Source {
    return { id: "src-1", ...input };
  }

  deleteSource(_id: string): void {}
  listSavedViews(): SavedView[] {
    return [];
  }

  createSavedView(input: SavedViewInput): SavedView {
    return {
      id: "view-1",
      ...input,
      createdAt: "2026-08-27T00:00:00.000Z",
      updatedAt: "2026-08-27T00:00:00.000Z",
    };
  }

  updateSavedView(_id: string, input: SavedViewInput): SavedView {
    return this.createSavedView(input);
  }

  deleteSavedView(_id: string): void {}
}

async function withServer(
  mode: RyuRuntimeMode,
  fn: (baseUrl: string) => Promise<void>,
) {
  const app = createApp({
    basePath: "/explorer",
    mode,
    repository: new FakeRepository(),
    staticDirectory: "client/public",
    trustedCallerServiceAccounts: ["chm-sa@chm-network.iam.gserviceaccount.com"],
  });
  const server = app.listen(0, "127.0.0.1");

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("server did not bind to a TCP address");
    }
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  }
}

test("serves root health outside the Explorer base path", async () => {
  await withServer("public", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/healthz`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  });
});

test("serves Explorer API under /explorer", async () => {
  await withServer("public", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explorer/api/graph/bootstrap`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), bootstrap);
  });
});

test("does not expose Explorer API at the root when base path is /explorer", async () => {
  await withServer("public", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/graph/bootstrap`);

    assert.equal(response.status, 404);
  });
});

test("rejects writes in public mode", async () => {
  await withServer("public", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explorer/api/nodes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "system", name: "Test System" }),
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "writes_disabled" });
  });
});

test("requires CHM user context in api mode", async () => {
  await withServer("api", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explorer/api/nodes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-chm-caller-service-account": "chm-sa@chm-network.iam.gserviceaccount.com",
      },
      body: JSON.stringify({ kind: "system", name: "Test System" }),
    });

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "missing_chm_user_context" });
  });
});

test("allows CHM service writes in api mode", async () => {
  await withServer("api", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explorer/api/nodes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-chm-caller-service-account": "chm-sa@chm-network.iam.gserviceaccount.com",
        "x-chm-user-email": "danny@oceanagentics.com",
        "x-chm-user-subject": "accounts.google.com:123",
      },
      body: JSON.stringify({ kind: "system", name: "Test System" }),
    });

    assert.equal(response.status, 201);
    const body = await response.json() as { name: string };
    assert.equal(body.name, "Test System");
  });
});
