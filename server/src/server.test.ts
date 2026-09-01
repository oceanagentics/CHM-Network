import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  GraphBootstrapPayload,
  GraphNode,
  NodeLocalization,
  NodeLocalizationReviewInput,
  RyuSystemQuery,
  RyuSystemRecord,
  SavedView,
  Source,
  SupportedLocale,
} from "../../shared/domain";
import { defaultLocale, emptyLocalizationDetails } from "../../shared/localization";
import type { GraphRepository } from "./graphRepository";
import { createApp, toPublicBootstrap, type RyuRuntimeMode } from "./server";

const bootstrap: GraphBootstrapPayload = {
  nodes: [],
  edges: [],
  sources: [],
  ryuRoutes: [],
  savedViews: [],
};

function createFakeLocalization(
  overrides: Partial<NodeLocalization> = {},
): NodeLocalization {
  return {
    locale: defaultLocale,
    title: "Test System",
    summary: null,
    description: null,
    details: emptyLocalizationDetails(),
    sourceExcerpt: null,
    translatedFromLocale: null,
    contentUpdatedAt: "2026-08-27T00:00:00.000Z",
    reviewState: "agent_researched",
    reviewerNote: null,
    reviewer: null,
    lastReviewed: null,
    createdAt: "2026-08-27T00:00:00.000Z",
    updatedAt: "2026-08-27T00:00:00.000Z",
    ...overrides,
  };
}

function createFakeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  const localization = createFakeLocalization();
  return {
    id: "node-1",
    kind: "system",
    countryCode: null,
    subtype: null,
    url: null,
    recordDepth: "stub",
    properties: {
      operator: null,
      role: null,
      disciplineFamily: null,
      geographicScope: null,
      gallery: [],
      data: { descriptors: [], recordCount: null, storageSize: null },
      access: [],
      usage: [],
    },
    createdAt: "2026-08-27T00:00:00.000Z",
    updatedAt: "2026-08-27T00:00:00.000Z",
    localizations: {
      en: localization,
    },
    availableLocales: ["en"],
    requestedLocale: "en",
    displayLocale: "en",
    isLocaleFallback: false,
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

  updateNodeLocalizationReview(
    id: string,
    locale: SupportedLocale,
    input: NodeLocalizationReviewInput,
    reviewer: string,
  ): GraphNode {
    const lastReviewed = "2026-08-27T01:00:00.000Z";
    const existingLocalization =
      this.node.localizations[locale] ?? createFakeLocalization({ locale });
    const nextLocalization = createFakeLocalization({
      ...existingLocalization,
      reviewState: input.reviewState ?? existingLocalization.reviewState,
      reviewerNote: input.reviewerNote ?? existingLocalization.reviewerNote,
      reviewer,
      lastReviewed,
      updatedAt: lastReviewed,
    });
    this.node = createFakeNode({
      ...this.node,
      id,
      localizations: {
        ...this.node.localizations,
        [locale]: nextLocalization,
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
      localPath: `/private/${id}.md`,
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
        localizations: {
          en: createFakeLocalization({
            reviewerNote: "Private reviewer note",
            reviewer: "danny@oceanagentics.com",
            lastReviewed: "2026-08-31T00:00:00.000Z",
          }),
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
    ryuRoutes: [
      {
        id: "route-1",
        nodeId: "node-1",
        status: "active",
        mode: "api",
        priority: 1,
        capabilities: ["review"],
        target: "https://private.example.com/route",
        upstream: "private-upstream",
        format: "json",
        contractRef: null,
        caveat: null,
        properties: {},
        createdAt: "2026-08-31T00:00:00.000Z",
        updatedAt: "2026-08-31T00:00:00.000Z",
      },
    ],
  });

  assert.equal(publicBootstrap.nodes[0].localizations.en?.reviewState, "agent_researched");
  assert.equal(publicBootstrap.nodes[0].localizations.en?.reviewerNote, null);
  assert.equal(publicBootstrap.nodes[0].localizations.en?.reviewer, null);
  assert.equal(publicBootstrap.nodes[0].localizations.en?.lastReviewed, null);
  assert.equal(publicBootstrap.sources[0].localPath, null);
  assert.deepEqual(publicBootstrap.ryuRoutes, []);
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

test("redacts source local paths from public source endpoints", async () => {
  await withServer("public", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explorer/api/sources/source-1`);

    assert.equal(response.status, 200);
    const body = await response.json() as Source;
    assert.equal(body.localPath, null);
  });
});

test("rejects review writes in public mode", async () => {
  await withServer("public", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explorer/api/nodes/node-1/localizations/en/review`, {
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
    const response = await fetch(`${baseUrl}/explorer/api/nodes/node-1/localizations/en/review`, {
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
    const response = await fetch(`${baseUrl}/explorer/api/nodes/node-1/localizations/en/review`, {
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
    const response = await fetch(`${baseUrl}/explorer/api/nodes/node-1/localizations/en/review`, {
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
    assert.equal(body.localizations.en?.reviewState, "human_reviewed");
    assert.equal(body.localizations.en?.reviewerNote, "Checked against source.");
    assert.equal(body.localizations.en?.reviewer, "danny@oceanagentics.com");
    assert.equal(body.localizations.en?.lastReviewed, "2026-08-27T01:00:00.000Z");
  });
});

test("rejects client-controlled review fields", async () => {
  await withServer("api", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explorer/api/nodes/node-1/localizations/en/review`, {
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
    const response = await fetch(`${baseUrl}/explorer/api/nodes/node-1/localizations/en/review`, {
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
