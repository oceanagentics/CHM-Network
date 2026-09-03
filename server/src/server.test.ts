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
import type {
  BulkRecordValidationInput,
  BulkRecordValidationResult,
  RecordDeleteImpact,
  RecordAggregate,
  RecordAggregateContentInput,
  RecordListResult,
  RecordMutationOptions,
  RecordPatchInput,
  RecordSearchQuery,
  RecordValidationResult,
} from "../../shared/recordApi";
import { defaultLocale, emptyLocalizationDetails } from "../../shared/localization";
import type { GraphRepository } from "./graphRepository";
import { ApiRequestError } from "./recordContracts";
import {
  createApp,
  hashApiToken,
  toPublicBootstrap,
  type ApiTokenRecord,
  type RyuRuntimeMode,
} from "./server";

const bootstrap: GraphBootstrapPayload = {
  nodes: [],
  edges: [],
  sources: [],
  ryuRoutes: [],
  savedViews: [],
};
const writerToken = "ryu_live_writer";
const reviewerToken = "ryu_live_reviewer";
const adminToken = "ryu_live_admin";
const apiTokens: ApiTokenRecord[] = [
  {
    name: "writer",
    scopes: ["writer"],
    hash: hashApiToken(writerToken),
    owner: "writer@oceanagentics.com",
    expiresAt: null,
  },
  {
    name: "reviewer",
    scopes: ["reviewer"],
    hash: hashApiToken(reviewerToken),
    owner: "reviewer@oceanagentics.com",
    expiresAt: null,
  },
  {
    name: "admin",
    scopes: ["admin"],
    hash: hashApiToken(adminToken),
    owner: "admin@oceanagentics.com",
    expiresAt: null,
  },
];
const recordUpdatedAt = "2026-08-27T00:00:00.000Z";

function authHeaders(token = writerToken, includePrecondition = false): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    ...(includePrecondition ? { "x-ryu-record-updated-at": recordUpdatedAt } : {}),
  };
}

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
  lastRecordQuery: RecordSearchQuery | null = null;
  private node: GraphNode;
  private deleted = false;

  constructor(node = createFakeNode()) {
    this.node = node;
  }

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

  listRecords(query: RecordSearchQuery): RecordListResult {
    this.lastRecordQuery = query;
    return {
      records: this.deleted ? [] : [this.recordAggregate()],
      nextCursor: null,
    };
  }

  getRecord(id: string): RecordAggregate {
    if (this.deleted || id === "missing") {
      throw new Error(`record not found: ${id}`);
    }

    return this.recordAggregate({ id });
  }

  validateRecordAggregate(
    id: string,
    _input: RecordAggregateContentInput,
  ): RecordValidationResult {
    return {
      valid: true,
      recordId: id,
      issues: [],
      recordUpdatedAt: this.deleted ? null : this.recordUpdatedAt(),
    };
  }

  upsertRecord(
    id: string,
    input: RecordAggregateContentInput,
    options: RecordMutationOptions = {},
  ): RecordAggregate | RecordValidationResult {
    if (options.validateOnly) {
      return this.validateRecordAggregate(id, input);
    }
    this.requireUpsertPrecondition(options);

    this.node = createFakeNode({
      id,
      kind: input.record.kind,
      countryCode: input.record.countryCode ?? null,
      subtype: input.record.subtype ?? null,
      url: input.record.url ?? null,
      recordDepth: input.record.recordDepth ?? "stub",
      properties: (input.record.properties ?? {}) as GraphNode["properties"],
    });
    return this.recordAggregate();
  }

  patchRecord(
    id: string,
    input: RecordPatchInput,
    options: RecordMutationOptions = {},
  ): RecordAggregate | RecordValidationResult {
    if (options.validateOnly) {
      return { valid: true, recordId: id, issues: [], recordUpdatedAt: this.recordUpdatedAt() };
    }
    this.requireExistingPrecondition(options);

    this.node = createFakeNode({
      ...this.node,
      id,
      kind: input.record?.kind ?? this.node.kind,
      countryCode: input.record?.countryCode ?? this.node.countryCode,
      subtype: input.record?.subtype ?? this.node.subtype,
      url: input.record?.url ?? this.node.url,
      recordDepth: input.record?.recordDepth ?? this.node.recordDepth,
      properties: (input.record?.propertiesReplace ?? this.node.properties) as GraphNode["properties"],
    });
    return this.recordAggregate();
  }

  getRecordDeleteImpact(id: string): RecordDeleteImpact {
    if (this.deleted) {
      throw new Error(`record not found: ${id}`);
    }

    return {
      recordId: id,
      recordUpdatedAt: this.recordUpdatedAt(),
      nodeRows: 1,
      localizationRows: 1,
      inboundEdges: 0,
      outboundEdges: 0,
      routeRows: 0,
      affectedSavedViews: [],
      orphanedSourceCandidates: [],
      impactHash: "impact-1",
    };
  }

  deleteRecord(
    id: string,
    impactHash: string,
    options: RecordMutationOptions = {},
  ): RecordDeleteImpact {
    const impact = this.getRecordDeleteImpact(id);
    if (impact.impactHash !== impactHash) {
      throw new Error("stale delete impact hash");
    }
    this.requireExistingPrecondition(options);

    this.deleted = true;
    return impact;
  }

  validateBulkRecords(input: BulkRecordValidationInput): BulkRecordValidationResult {
    return {
      valid: true,
      issues: [],
      checkedRecords: input.records.length,
    };
  }

  updateNodeLocalizationReview(
    id: string,
    locale: SupportedLocale,
    input: NodeLocalizationReviewInput,
    reviewer: string,
    options: RecordMutationOptions = {},
  ): GraphNode {
    this.requireExistingPrecondition(options);
    if (options.validateOnly) {
      return this.node;
    }

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

  private recordUpdatedAt(): string {
    return Object.values(this.node.localizations)
      .map((localization) => localization?.updatedAt)
      .filter((value): value is string => Boolean(value))
      .concat(this.node.updatedAt)
      .sort()
      .at(-1) ?? this.node.updatedAt;
  }

  private requireUpsertPrecondition(options: RecordMutationOptions) {
    if (this.deleted) {
      if (options.createOnly) {
        return;
      }
      throw new ApiRequestError(428, "createOnly precondition is required");
    }
    if (options.createOnly) {
      throw new ApiRequestError(412, "record already exists");
    }
    this.requireExistingPrecondition(options);
  }

  private requireExistingPrecondition(options: RecordMutationOptions) {
    if (this.deleted) {
      throw new Error("record not found: node-1");
    }
    if (!options.recordUpdatedAt) {
      throw new ApiRequestError(428, "recordUpdatedAt precondition is required");
    }
    if (options.recordUpdatedAt !== this.recordUpdatedAt()) {
      throw new ApiRequestError(412, "stale recordUpdatedAt");
    }
  }

  private recordAggregate(overrides: Partial<GraphNode> = {}): RecordAggregate {
    return {
      node: createFakeNode({ ...this.node, ...overrides }),
      edges: [],
      sources: [
        {
          id: "src-test",
          title: "Source",
          sourceType: "web",
          url: "https://example.com/source",
          localPath: "/private/source.md",
          publisher: null,
          publishedAt: null,
          accessedAt: null,
          note: null,
        },
      ],
      routes: [
        {
          id: "route-1",
          nodeId: this.node.id,
          status: "active",
          mode: "api",
          priority: 1,
          capabilities: ["download"],
          target: "https://private.example.com",
          upstream: "internal-upstream",
          format: "json",
          contractRef: null,
          caveat: null,
          properties: { secret: "do-not-leak" },
          createdAt: "2026-08-27T00:00:00.000Z",
          updatedAt: "2026-08-27T00:00:00.000Z",
        },
      ],
      matchReasons: [],
    };
  }
}

async function withServer(
  mode: RyuRuntimeMode,
  fn: (baseUrl: string) => Promise<void>,
  options: {
    repository?: FakeRepository;
    adminUsers?: string[];
    apiTokens?: ApiTokenRecord[];
    apiWriteRateLimitPerMinute?: number;
  } = {},
) {
  const repository = options.repository ?? new FakeRepository();
  const app = createApp({
    basePath: "/explorer",
    mode,
    repository,
    adminUsers: options.adminUsers ?? [],
    apiTokens: options.apiTokens ?? apiTokens,
    apiWriteRateLimitPerMinute: options.apiWriteRateLimitPerMinute,
    staticDirectory: "client/public",
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

test("does not expose source lookup as a launch API route", async () => {
  await withServer("public", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explorer/api/sources/source-1`);

    assert.equal(response.status, 404);
  });
});

test("does not expose ryu portal routes as launch API routes", async () => {
  await withServer("public", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explorer/api/ryu/systems`);

    assert.equal(response.status, 404);
  });
});

test("serves public record details with allowlisted DTO fields", async () => {
  const node = createFakeNode({
    localizations: {
      en: createFakeLocalization({
        reviewerNote: "Private reviewer note",
        reviewer: "danny@oceanagentics.com",
        lastReviewed: "2026-08-31T00:00:00.000Z",
      }),
    },
  });

  await withServer("public", async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/explorer/api/records/node-1?include=localizations,sources,routes`,
    );

    assert.equal(response.status, 200);
    const body = await response.json() as Record<string, any>;
    assert.equal(body.localizations.en.reviewState, "agent_researched");
    assert.equal("reviewerNote" in body.localizations.en, false);
    assert.equal("reviewer" in body.localizations.en, false);
    assert.equal("lastReviewed" in body.localizations.en, false);
    assert.equal("localPath" in body.sources[0], false);
    assert.equal("target" in body.routes[0], false);
    assert.equal("upstream" in body.routes[0], false);
    assert.equal("properties" in body.routes[0], false);
  }, { repository: new FakeRepository(node) });
});

test("requires bearer token for private record reads", async () => {
  await withServer("api", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explorer/api/records/node-1`);

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "missing_bearer_token" });
  });
});

test("rejects invalid and expired bearer tokens", async () => {
  await withServer("api", async (baseUrl) => {
    const invalid = await fetch(`${baseUrl}/explorer/api/records/node-1`, {
      headers: { Authorization: "Bearer nope" },
    });

    assert.equal(invalid.status, 403);
    assert.deepEqual(await invalid.json(), { error: "invalid_bearer_token" });

    const expired = await fetch(`${baseUrl}/explorer/api/records/node-1`, {
      headers: { Authorization: "Bearer ryu_live_expired" },
    });

    assert.equal(expired.status, 403);
    assert.deepEqual(await expired.json(), { error: "expired_bearer_token" });
  }, {
    apiTokens: [
      ...apiTokens,
      {
        name: "expired",
        scopes: ["reader"],
        hash: hashApiToken("ryu_live_expired"),
        owner: "expired@oceanagentics.com",
        expiresAt: "2020-01-01T00:00:00.000Z",
      },
    ],
  });
});

test("serves private record details through bearer token auth", async () => {
  await withServer("api", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explorer/api/records/node-1`, {
      headers: authHeaders(),
    });

    assert.equal(response.status, 200);
    const body = await response.json() as Record<string, any>;
    assert.equal(body.sources[0].localPath, "/private/source.md");
    assert.equal(body.routes[0].target, "https://private.example.com");
    assert.deepEqual(body.routes[0].properties, { secret: "do-not-leak" });
  });
});

test("rate limits runaway token reads", async () => {
  await withServer("api", async (baseUrl) => {
    const first = await fetch(`${baseUrl}/explorer/api/records/node-1`, {
      headers: authHeaders(),
    });
    assert.equal(first.status, 200);

    const second = await fetch(`${baseUrl}/explorer/api/records/node-1`, {
      headers: authHeaders(),
    });

    assert.equal(second.status, 429);
    assert.equal(second.headers.has("retry-after"), true);
    assert.deepEqual(await second.json(), { error: "rate_limited" });
  }, { apiWriteRateLimitPerMinute: 1 });
});

test("parses the full record search filter set", async () => {
  const repository = new FakeRepository();

  await withServer("public", async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/explorer/api/records?q=fish&kind=system,country&geography=global&dataType=geojson&recordDepth=rich&reviewState=agent_researched&locale=fr&localeMode=all_locales&localeAvailability=missing&reviewLocale=any&routeStatus=active&routeCapability=download&accessType=read&accessMethod=api&include=localizations,routes,matchReasons&limit=7`,
    );

    assert.equal(response.status, 200);
    assert.equal(repository.lastRecordQuery?.q, "fish");
    assert.deepEqual(repository.lastRecordQuery?.kind, ["system", "country"]);
    assert.deepEqual(repository.lastRecordQuery?.geography, ["global"]);
    assert.deepEqual(repository.lastRecordQuery?.dataType, ["geojson"]);
    assert.deepEqual(repository.lastRecordQuery?.recordDepth, ["rich"]);
    assert.deepEqual(repository.lastRecordQuery?.reviewState, ["agent_researched"]);
    assert.equal(repository.lastRecordQuery?.locale, "fr");
    assert.equal(repository.lastRecordQuery?.localeMode, "all_locales");
    assert.equal(repository.lastRecordQuery?.localeAvailability, "missing");
    assert.equal(repository.lastRecordQuery?.reviewLocale, "any");
    assert.deepEqual(repository.lastRecordQuery?.routeStatus, ["active"]);
    assert.deepEqual(repository.lastRecordQuery?.routeCapability, ["download"]);
    assert.deepEqual(repository.lastRecordQuery?.accessType, ["read"]);
    assert.deepEqual(repository.lastRecordQuery?.accessMethod, ["api"]);
    assert.deepEqual(repository.lastRecordQuery?.include, ["localizations", "routes", "matchReasons"]);
    assert.equal(repository.lastRecordQuery?.limit, 7);
  }, { repository });
});

test("rejects unsupported record query fields", async () => {
  await withServer("public", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explorer/api/records?table=nodes`);

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "unsupported query fields: table" });
  });
});

test("rejects review writes in public mode", async () => {
  await withServer("public", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explorer/api/records/node-1/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: "en", reviewState: "human_reviewed" }),
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "writes_disabled" });
  });
});

test("allows record-oriented review writes in api mode", async () => {
  await withServer("api", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explorer/api/records/node-1/review`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(reviewerToken, true),
      },
      body: JSON.stringify({
        locale: "en",
        reviewState: "human_reviewed",
        reviewerNote: "Checked.",
      }),
    });

    assert.equal(response.status, 200);
    const body = await response.json() as Record<string, any>;
    assert.equal(body.localizations.en.reviewState, "human_reviewed");
    assert.equal(body.localizations.en.reviewer, "reviewer@oceanagentics.com");
  });
});

test("dry-runs record review writes without mutating", async () => {
  await withServer("api", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explorer/api/records/node-1/review?validateOnly=true`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(reviewerToken, true),
      },
      body: JSON.stringify({
        locale: "en",
        reviewState: "human_reviewed",
        reviewerNote: "Checked.",
      }),
    });

    assert.equal(response.status, 200);
    const body = await response.json() as Record<string, any>;
    assert.equal(body.localizations.en.reviewState, "agent_researched");
    assert.equal(body.localizations.en.reviewer, null);
  });
});

test("prevents writer tokens from setting human_reviewed", async () => {
  await withServer("api", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explorer/api/records/node-1/review`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(writerToken, true),
      },
      body: JSON.stringify({
        locale: "en",
        reviewState: "human_reviewed",
      }),
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "review_scope_required" });
  });
});

test("rejects review fields in content upserts", async () => {
  await withServer("api", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explorer/api/records/node-1`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(writerToken, true),
      },
      body: JSON.stringify({
        id: "node-1",
        record: { kind: "system" },
        localizations: {
          en: {
            title: "Test System",
            reviewState: "human_reviewed",
          },
        },
      }),
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "review/audit fields are not allowed in localizations.en: reviewState",
    });
  });
});

test("validates deterministic record upserts without applying changes", async () => {
  await withServer("api", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explorer/api/records/node-1?validateOnly=true`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({
        id: "node-1",
        record: { kind: "system" },
        localizations: {
          en: {
            title: "Test System",
          },
        },
      }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      valid: true,
      recordId: "node-1",
      issues: [],
      recordUpdatedAt,
    });
  });
});

test("rejects ambiguous nested JSON patch fields", async () => {
  await withServer("api", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explorer/api/records/node-1`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(writerToken, true),
      },
      body: JSON.stringify({
        record: {
          properties: {},
        },
      }),
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "unsupported record fields: properties" });
  });
});

test("enforces review route payload limits", async () => {
  await withServer("api", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explorer/api/records/node-1/review`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(writerToken, true),
      },
      body: JSON.stringify({
        locale: "en",
        reviewerNote: "x".repeat(9 * 1024),
      }),
    });

    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: "payload_too_large" });
  });
});

test("requires admin token for delete dry runs", async () => {
  await withServer("api", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explorer/api/records/node-1?validateOnly=true`, {
      method: "DELETE",
      headers: authHeaders(writerToken),
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "wrong_scope" });
  });
});

test("allows admin delete dry runs and requires impact hash to apply", async () => {
  await withServer("api", async (baseUrl) => {
    const headers = authHeaders(adminToken);
    const dryRun = await fetch(`${baseUrl}/explorer/api/records/node-1?validateOnly=true`, {
      method: "DELETE",
      headers,
    });

    assert.equal(dryRun.status, 200);
    const dryRunBody = await dryRun.json() as Record<string, unknown>;
    assert.equal(dryRunBody.impactHash, "impact-1");

    const missingHash = await fetch(`${baseUrl}/explorer/api/records/node-1`, {
      method: "DELETE",
      headers,
    });

    assert.equal(missingHash.status, 400);
    assert.deepEqual(await missingHash.json(), { error: "impactHash is required" });

    const apply = await fetch(`${baseUrl}/explorer/api/records/node-1?impactHash=impact-1`, {
      method: "DELETE",
      headers: authHeaders(adminToken, true),
    });

    assert.equal(apply.status, 200);
  });
});

test("does not expose bulk validation as a launch API route", async () => {
  await withServer("api", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explorer/api/records:bulk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(adminToken),
      },
      body: JSON.stringify({ validateOnly: true, records: [] }),
    });

    assert.equal(response.status, 404);
  });
});

test("requires recordUpdatedAt on applied record patches", async () => {
  await withServer("api", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explorer/api/records/node-1`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(writerToken),
      },
      body: JSON.stringify({ record: { url: "https://example.com" } }),
    });

    assert.equal(response.status, 428);
    assert.deepEqual(await response.json(), {
      error: "recordUpdatedAt precondition is required",
    });
  });
});

test("rejects stale recordUpdatedAt on applied record patches", async () => {
  await withServer("api", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explorer/api/records/node-1`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${writerToken}`,
        "x-ryu-record-updated-at": "2026-08-26T00:00:00.000Z",
      },
      body: JSON.stringify({ record: { url: "https://example.com" } }),
    });

    assert.equal(response.status, 412);
    assert.deepEqual(await response.json(), { error: "stale recordUpdatedAt" });
  });
});

test("rate limits runaway token writes", async () => {
  await withServer("api", async (baseUrl) => {
    const first = await fetch(`${baseUrl}/explorer/api/records/node-1?validateOnly=true`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(writerToken),
      },
      body: JSON.stringify({ record: { url: "https://example.com/one" } }),
    });
    assert.equal(first.status, 200);

    const second = await fetch(`${baseUrl}/explorer/api/records/node-1?validateOnly=true`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(writerToken),
      },
      body: JSON.stringify({ record: { url: "https://example.com/two" } }),
    });

    assert.equal(second.status, 429);
    assert.equal(second.headers.has("retry-after"), true);
    assert.deepEqual(await second.json(), { error: "rate_limited" });
  }, { apiWriteRateLimitPerMinute: 1 });
});

test("allows writer review changes below human_reviewed", async () => {
  await withServer("api", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explorer/api/records/node-1/review`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(writerToken, true),
      },
      body: JSON.stringify({
        locale: "en",
        reviewState: "needs_revision",
        reviewerNote: "Checked against source.",
      }),
    });

    assert.equal(response.status, 200);
    const body = await response.json() as Record<string, any>;
    assert.equal(body.localizations.en.reviewState, "needs_revision");
    assert.equal(body.localizations.en.reviewerNote, "Checked against source.");
    assert.equal(body.localizations.en.reviewer, "writer@oceanagentics.com");
  });
});

test("rejects client-controlled review fields", async () => {
  await withServer("api", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explorer/api/records/node-1/review`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(reviewerToken, true),
      },
      body: JSON.stringify({
        locale: "en",
        reviewState: "human_reviewed",
        reviewer: "other@example.com",
      }),
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "unsupported body fields: reviewer" });
  });
});

test("rejects removed review states", async () => {
  await withServer("api", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explorer/api/records/node-1/review`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(reviewerToken, true),
      },
      body: JSON.stringify({ locale: "en", reviewState: "needs_human_review" }),
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
        ...authHeaders(),
      },
      body: JSON.stringify({ kind: "system", name: "Test System" }),
    });

    assert.equal(response.status, 404);
  });
});
