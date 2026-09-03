import assert from "node:assert/strict";
import { test } from "node:test";

import type { Pool } from "pg";

import type { LocaleAvailability, RecordAggregateContentInput } from "../../shared/recordApi";
import { PostgresGraphRepository } from "./postgresGraphRepository";
import { readRecordSearchQuery } from "./recordContracts";

class FakePoolClient {
  calls: string[] = [];
  released = false;

  async query(sql: string): Promise<{ rows: unknown[]; rowCount: number }> {
    this.calls.push(sql.trim().replace(/\s+/g, " "));
    if (sql.includes("SELECT id FROM nodes")) {
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes("INSERT INTO node_localizations")) {
      throw new Error("localization failure");
    }

    return { rows: [], rowCount: 1 };
  }

  release() {
    this.released = true;
  }
}

class CapturingPool {
  queries: Array<{ sql: string; params: unknown[] }> = [];

  async query(sql: string, params: unknown[] = []): Promise<{ rows: unknown[]; rowCount: number }> {
    this.queries.push({ sql: sql.trim().replace(/\s+/g, " "), params });
    return { rows: [], rowCount: 0 };
  }
}

function referencedSqlParams(sql: string): number[] {
  return [...new Set([...sql.matchAll(/\$(\d+)/g)].map((match) => Number(match[1])))]
    .sort((left, right) => left - right);
}

test("builds SQL-backed record searches for the full filter set", async () => {
  const pool = new CapturingPool();
  const repository = new PostgresGraphRepository(pool as unknown as Pool);
  const query = readRecordSearchQuery({
    q: "fish",
    kind: "system",
    geography: "global",
    dataType: "geojson",
    recordDepth: "rich",
    reviewState: "agent_researched",
    locale: "fr",
    localeMode: "all_locales",
    localeAvailability: "partial",
    reviewLocale: "any",
    routeStatus: "active",
    routeCapability: "download",
    accessType: "read",
    accessMethod: "api",
    include: "matchReasons",
    limit: "10",
  });

  await repository.listRecords(query);

  const searchSql = pool.queries[0].sql;
  assert.match(searchSql, /FROM nodes n/);
  assert.match(searchSql, /node_localizations display_l/);
  assert.match(searchSql, /node_localizations review_l/);
  assert.match(searchSql, /ryu_routes status_r/);
  assert.match(searchSql, /ryu_routes capability_r/);
  assert.match(searchSql, /capabilities_json \?\|/);
  assert.match(searchSql, /ORDER BY lower\(coalesce\(display_l.title, n.id\)\), n.id/);
  assert.equal(pool.queries[0].params.at(-1), 11);
});

test("does not allocate unused params for locale availability filters", async () => {
  for (const localeAvailability of ["available", "missing", "partial", "complete"] satisfies LocaleAvailability[]) {
    const pool = new CapturingPool();
    const repository = new PostgresGraphRepository(pool as unknown as Pool);

    await repository.listRecords(readRecordSearchQuery({ localeAvailability }));

    const placeholders = referencedSqlParams(pool.queries[0].sql);
    assert.deepEqual(placeholders, pool.queries[0].params.map((_, index) => index + 1));
  }
});

test("rolls back transactional record upserts when a related row write fails", async () => {
  const client = new FakePoolClient();
  const repository = new PostgresGraphRepository({
    connect: async () => client,
    query: async () => ({ rows: [{ record_updated_at: null }], rowCount: 1 }),
  } as unknown as Pool);
  const input: RecordAggregateContentInput = {
    id: "node-1",
    record: {
      kind: "system",
    },
    localizations: {
      en: {
        title: "Test System",
      },
    },
  };

  await assert.rejects(
    () => repository.upsertRecord("node-1", input, { createOnly: true }),
    /localization failure/,
  );

  assert.equal(client.calls[0], "BEGIN");
  assert.equal(client.calls.at(-1), "ROLLBACK");
  assert.equal(client.calls.includes("COMMIT"), false);
  assert.equal(client.released, true);
});
