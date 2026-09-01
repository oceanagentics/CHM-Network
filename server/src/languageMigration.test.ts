import assert from "node:assert/strict";
import { test } from "node:test";

import {
  normalizeAccessType,
  splitLegacyNodeContent,
  validateMigratedNodeContent,
  type LegacyNodeRow,
} from "./languageMigration";

const baseRow: LegacyNodeRow = {
  id: "algaebase",
  name: "AlgaeBase",
  summary: "Global algal taxonomy and distribution reference system",
  description: "Reference record",
  review_state: "agent_researched",
  review_json: {
    reviewerNote: "Private note",
    reviewer: "danny@oceanagentics.com",
    lastReviewed: "2026-08-31T00:00:00.000Z",
  },
  details_json: {
    aliases: ["AlgaeBase"],
    operator: {
      id: "algaebase-operator",
      name: "AlgaeBase",
      countryCode: "EUR",
    },
    role: "reference_backbone",
    disciplineFamily: "reference",
    geographicScope: "global",
    gallery: [
      {
        id: "gallery-1",
        type: "image",
        url: "/gallery/algaebase.png",
        thumbnailUrl: "/gallery/algaebase-thumb.png",
        title: "AlgaeBase screenshot",
        caption: "A public record page.",
        source: {
          id: "src-algaebase",
          title: "AlgaeBase",
          url: "https://www.algaebase.org/",
        },
        sortOrder: 1,
      },
    ],
    data: {
      descriptors: [
        {
          id: "descriptor-1",
          category: "type",
          label: "Taxonomy",
          description: "Taxonomic backbone.",
          source: null,
        },
        {
          id: "legacy-identifier-vocab",
          category: "standard",
          label: "Identifier vocabulary",
          description: "Internal identifiers.",
          source: null,
        },
      ],
      recordCount: {
        id: "metric-1",
        key: "record_count",
        value: 100,
        unit: "records",
        description: "Observed public record count.",
        observedAt: "2026-08-31",
        source: {
          id: "src-algaebase",
          title: "AlgaeBase",
          url: "https://www.algaebase.org/",
        },
      },
    },
    access: [
      {
        id: "read-web",
        type: "documentation",
        method: "web",
        label: "Documentation",
        url: "https://www.algaebase.org/",
        description: "Access through documentation.",
        source: {
          id: "src-algaebase",
          title: "AlgaeBase",
          url: "https://www.algaebase.org/",
        },
      },
      {
        id: "no-write",
        type: "none",
        method: "no_direct_write",
        label: "No direct write",
        url: "https://www.algaebase.org/",
        description: "No direct write path.",
        source: {
          id: "src-algaebase",
          title: "AlgaeBase",
          url: "https://www.algaebase.org/",
        },
      },
    ],
    identifiers: [
      {
        id: "legacy-id",
        scheme: "species records",
      },
    ],
  },
  properties_json: {
    domains: ["taxonomy"],
  },
  created_at: "2026-08-27T00:00:00.000Z",
  updated_at: "2026-08-31T00:00:00.000Z",
};

test("splits legacy node content into neutral properties and English localization", () => {
  const content = splitLegacyNodeContent(baseRow);

  assert.equal(content.localization.title, "AlgaeBase");
  assert.equal(content.localization.summary, baseRow.summary);
  assert.equal(content.localization.description, baseRow.description);
  assert.equal(content.localization.reviewState, "agent_researched");
  assert.equal(content.localization.reviewerNote, "Private note");
  assert.equal(content.localization.contentUpdatedAt, baseRow.updated_at);

  assert.equal(content.propertiesJson.operator?.id, "algaebase-operator");
  assert.equal(content.propertiesJson.role, "reference_backbone");
  assert.deepEqual(content.propertiesJson.domains, ["taxonomy"]);
  assert.deepEqual(content.propertiesJson.access?.map((row) => row.type), ["read"]);
  assert.equal(content.propertiesJson.access?.[0]?.method, "web");
  assert.equal(content.localization.detailsJson.access[0]?.label, "Documentation");
  assert.equal(content.localization.detailsJson.access[0]?.description, "Access through documentation.");
  assert.equal(content.propertiesJson.gallery?.[0]?.url, "/gallery/algaebase.png");
  assert.equal(content.localization.detailsJson.gallery[0]?.caption, "A public record page.");
  assert.equal(content.propertiesJson.data?.descriptors[0]?.label, "Taxonomy");
  assert.equal(content.propertiesJson.data?.descriptors.length, 1);
  assert.equal(content.localization.detailsJson.data.descriptors[0]?.description, "Taxonomic backbone.");
  assert.equal(content.localization.detailsJson.data.descriptors.length, 1);
  assert.equal(content.propertiesJson.data?.recordCount?.value, 100);
  assert.equal(content.localization.detailsJson.data.recordCount?.description, "Observed public record count.");
  assert.equal("identifiers" in content.propertiesJson, false);
  assert.equal("identifiers" in content.localization.detailsJson, false);
  assert.deepEqual(validateMigratedNodeContent(content), []);
});

test("normalizes legacy access types", () => {
  assert.equal(normalizeAccessType("read"), "read");
  assert.equal(normalizeAccessType("submit"), "submit");
  assert.equal(normalizeAccessType("partner_sync"), "partner_sync");
  assert.equal(normalizeAccessType("service"), "read");
  assert.equal(normalizeAccessType("documentation"), "read");
  assert.equal(normalizeAccessType("download"), "read");
  assert.equal(normalizeAccessType("none"), null);
  assert.throws(() => normalizeAccessType("other"), /unexpected access type/);
});
