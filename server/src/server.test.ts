import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  GraphBootstrapPayload,
  GraphNode,
  NodeReviewInput,
  RyuSystemQuery,
  RyuSystemRecord,
  SavedView,
  Source,
} from "../../shared/domain";
import type { GraphRepository } from "./graphRepository";
import { createApp, toPublicBootstrap, type RyuRuntimeMode } from "./server";

const bootstrap: GraphBootstrapPayload = {
  nodes: [],
  edges: [],
  sources: [],
  ryuRoutes: [],
  savedViews: [],
};

function createFakeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: "node-1",
    kind: "system",
    name: "Test System",
    countryCode: null,
    subtype: null,
    url: null,
    summary: null,
    description: null,
    recordDepth: "stub",
    reviewState: "agent_researched",
    reviewerNote: null,
    reviewer: null,
    lastReviewed: null,
    review: {},
    details: {
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
    properties: {},
    createdAt: "2026-08-27T00:00:00.000Z",
    updatedAt: "2026-08-27T00:00:00.000Z",
    ...overrides,
  };
}

class FakeRepository implements GraphRepository {
  private node = createFakeNode();

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

  updateNodeReview(id: string, input: NodeReviewInput, reviewer: string): GraphNode {
    const lastReviewed = "2026-08-27T01:00:00.000Z";
    this.node = createFakeNode({
      ...this.node,
      id,
      reviewState: input.reviewState ?? this.node.reviewState,
      reviewerNote: input.reviewerNote ?? this.node.reviewerNote,
      reviewer,
      lastReviewed,
      review: {
        reviewerNote: input.reviewerNote ?? this.node.reviewerNote,
        reviewer,
        lastReviewed,
      },
      updatedAt: lastReviewed,
    });

    return this.node;
  }

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

  listSavedViews(): SavedView[] {
    return [];
  }
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

test("redacts private review fields from public bootstrap payloads", () => {
  const publicBootstrap = toPublicBootstrap({
    ...bootstrap,
    nodes: [
      createFakeNode({
        reviewerNote: "Private reviewer note",
        reviewer: "danny@oceanagentics.com",
        lastReviewed: "2026-08-31T00:00:00.000Z",
        review: {
          reviewerNote: "Private reviewer note",
          reviewer: "danny@oceanagentics.com",
          lastReviewed: "2026-08-31T00:00:00.000Z",
        },
      }),
    ],
    sources: [
      {
        id: "source-1",
        title: "Source",
        sourceType: "web",
        url: "https://example.com",
        localPath: "/private/source.md",
        publisher: null,
        publishedAt: null,
        accessedAt: null,
        note: null,
      },
    ],
  });

  assert.equal(publicBootstrap.nodes[0].reviewState, "agent_researched");
  assert.equal(publicBootstrap.nodes[0].reviewerNote, null);
  assert.equal(publicBootstrap.nodes[0].reviewer, null);
  assert.equal(publicBootstrap.nodes[0].lastReviewed, null);
  assert.deepEqual(publicBootstrap.nodes[0].review, {});
  assert.equal(publicBootstrap.sources[0].localPath, null);
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

test("rejects review writes in public mode", async () => {
  await withServer("public", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explorer/api/nodes/node-1/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewState: "human_reviewed" }),
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "writes_disabled" });
  });
});

test("requires CHM user context for review writes in api mode", async () => {
  await withServer("api", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explorer/api/nodes/node-1/review`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-chm-caller-service-account": "chm-sa@chm-network.iam.gserviceaccount.com",
      },
      body: JSON.stringify({ reviewState: "human_reviewed" }),
    });

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "missing_chm_user_context" });
  });
});

test("requires CHM user email for reviewer identity", async () => {
  await withServer("api", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explorer/api/nodes/node-1/review`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-chm-caller-service-account": "chm-sa@chm-network.iam.gserviceaccount.com",
        "x-chm-user-subject": "accounts.google.com:123",
      },
      body: JSON.stringify({ reviewState: "human_reviewed" }),
    });

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "missing_chm_user_email" });
  });
});

test("allows CHM service review writes in api mode", async () => {
  await withServer("api", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explorer/api/nodes/node-1/review`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-chm-caller-service-account": "chm-sa@chm-network.iam.gserviceaccount.com",
        "x-chm-user-email": "danny@oceanagentics.com",
        "x-chm-user-subject": "accounts.google.com:123",
      },
      body: JSON.stringify({
        reviewState: "human_reviewed",
        reviewerNote: "Checked against source.",
      }),
    });

    assert.equal(response.status, 200);
    const body = await response.json() as GraphNode;
    assert.equal(body.reviewState, "human_reviewed");
    assert.equal(body.reviewerNote, "Checked against source.");
    assert.equal(body.reviewer, "danny@oceanagentics.com");
    assert.equal(body.lastReviewed, "2026-08-27T01:00:00.000Z");
  });
});

test("rejects client-controlled review fields", async () => {
  await withServer("api", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explorer/api/nodes/node-1/review`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-chm-caller-service-account": "chm-sa@chm-network.iam.gserviceaccount.com",
        "x-chm-user-email": "danny@oceanagentics.com",
      },
      body: JSON.stringify({
        reviewState: "human_reviewed",
        reviewer: "other@example.com",
      }),
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "unsupported review fields: reviewer" });
  });
});

test("rejects removed review states", async () => {
  await withServer("api", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explorer/api/nodes/node-1/review`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-chm-caller-service-account": "chm-sa@chm-network.iam.gserviceaccount.com",
        "x-chm-user-email": "danny@oceanagentics.com",
      },
      body: JSON.stringify({ reviewState: "needs_human_review" }),
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid reviewState" });
  });
});

test("does not expose broad node writes", async () => {
  await withServer("api", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explorer/api/nodes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-chm-caller-service-account": "chm-sa@chm-network.iam.gserviceaccount.com",
        "x-chm-user-email": "danny@oceanagentics.com",
      },
      body: JSON.stringify({ kind: "system", name: "Test System" }),
    });

    assert.equal(response.status, 404);
  });
});
