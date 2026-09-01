import assert from "node:assert/strict";
import { test } from "node:test";

import type { GraphNode, NodeLocalization, SupportedLocale } from "../../shared/domain";
import { emptyLocalizationDetails, resolveNodeLocalization } from "../../shared/localization";

function localization(locale: SupportedLocale, title: string): NodeLocalization {
  return {
    locale,
    title,
    summary: null,
    description: null,
    details: emptyLocalizationDetails(),
    sourceExcerpt: null,
    translatedFromLocale: null,
    contentUpdatedAt: "2026-09-01T00:00:00.000Z",
    reviewState: "agent_researched",
    reviewerNote: null,
    reviewer: null,
    lastReviewed: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

function node(localizations: GraphNode["localizations"], availableLocales: SupportedLocale[]): GraphNode {
  return {
    id: "node-1",
    kind: "system",
    countryCode: null,
    subtype: null,
    url: null,
    recordDepth: "stub",
    properties: {},
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    localizations,
    availableLocales,
    requestedLocale: "en",
    displayLocale: "en",
    isLocaleFallback: false,
  };
}

test("resolves requested locale before fallback locales", () => {
  const resolved = resolveNodeLocalization(
    node(
      {
        en: localization("en", "English title"),
        fr: localization("fr", "Titre francais"),
      },
      ["en", "fr"],
    ),
    "fr",
  );

  assert.equal(resolved.title, "Titre francais");
  assert.equal(resolved.displayLocale, "fr");
  assert.equal(resolved.isLocaleFallback, false);
});

test("falls back to English when the requested localization is missing", () => {
  const resolved = resolveNodeLocalization(
    node({ en: localization("en", "English title") }, ["en"]),
    "fr",
  );

  assert.equal(resolved.title, "English title");
  assert.equal(resolved.displayLocale, "en");
  assert.equal(resolved.isLocaleFallback, true);
});

test("falls back to first available localization before node id", () => {
  const resolved = resolveNodeLocalization(
    node({ es: localization("es", "Titulo espanol") }, ["es"]),
    "fr",
  );

  assert.equal(resolved.title, "Titulo espanol");
  assert.equal(resolved.displayLocale, "es");
  assert.equal(resolved.isLocaleFallback, true);
});

test("uses node id when no localization exists", () => {
  const resolved = resolveNodeLocalization(node({}, []), "fr");

  assert.equal(resolved.title, "node-1");
  assert.equal(resolved.displayLocale, null);
  assert.equal(resolved.hasLocalization, false);
  assert.equal(resolved.isLocaleFallback, true);
});
