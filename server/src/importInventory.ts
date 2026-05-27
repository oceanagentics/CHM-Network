import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getDatabase } from "./db";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const defaultInventoryDir = path.join(
  repoRoot,
  "research",
  "2026-05-26-global-system-inventory",
);
const importedAt = new Date().toISOString();

const relationshipTypes = new Set([
  "publishes_to",
  "pulls_from",
  "syncs_to",
  "indexes",
  "uses_reference_from",
  "federates_with",
]);

const entityAliases = new Map<string, string>([
  ["system-obis", "platform-obis"],
  ["system-bbnj-chm", "platform-bbnj-chm"],
]);

const countryMap = new Map<
  string,
  { id: string; code: string; name: string; pseudoCountry?: boolean }
>([
  ["Japan", { id: "country-jpn", code: "JPN", name: "Japan" }],
  ["USA", { id: "country-usa", code: "USA", name: "United States" }],
  ["Germany", { id: "country-deu", code: "DEU", name: "Germany" }],
  ["Canada", { id: "country-can", code: "CAN", name: "Canada" }],
  ["EU", { id: "country-eur", code: "EUR", name: "European Union", pseudoCountry: true }],
  [
    "international",
    { id: "country-int", code: "INT", name: "International", pseudoCountry: true },
  ],
]);

type CsvRow = Record<string, string>;

type SourceRow = {
  source_id: string;
  title: string;
  source_type: string;
  publisher: string;
  url: string;
  accessed_at: string;
  evidence_scope: string;
  notes: string;
};

type SystemRow = {
  system_id: string;
  system_name: string;
  aliases: string;
  canonical_url: string;
  operator_name: string;
  operator_country: string;
  discipline_family: string;
  role_class: string;
  scope_tier: string;
  geographic_scope: string;
  marine_relevance: string;
  researcher_interaction: string;
  data_types: string;
  submission_supported: string;
  access_supported: string;
  api_or_download_modes: string;
  formats_or_standards: string;
  persistent_identifier_support: string;
  parent_system_id: string;
  status: string;
  confidence: string;
  official_source_id: string;
  workflow_source_id: string;
  notes: string;
};

type LinkRow = {
  link_id: string;
  source_system_id: string;
  target_system_id: string;
  relation_type: string;
  direction_note: string;
  mechanism: string;
  status: string;
  confidence: string;
  evidence_source_id: string;
  evidence_note: string;
};

function normalizeString(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function parseConfidence(raw: string, fieldName: string): number {
  const value = Number(raw);
  if (Number.isNaN(value) || value < 0 || value > 1) {
    throw new Error(`invalid ${fieldName}: ${raw}`);
  }
  return value;
}

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let currentField = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentField += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ",") {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      currentRow.push(currentField);
      currentField = "";
      if (currentRow.some((value) => value !== "")) {
        rows.push(currentRow);
      }
      currentRow = [];
      continue;
    }

    currentField += char;
  }

  currentRow.push(currentField);
  if (currentRow.some((value) => value !== "")) {
    rows.push(currentRow);
  }

  if (rows.length === 0) {
    return [];
  }

  const [header, ...dataRows] = rows;
  return dataRows.map((row, rowIndex) => {
    if (row.length !== header.length) {
      throw new Error(
        `CSV row ${rowIndex + 2} has ${row.length} columns, expected ${header.length}`,
      );
    }

    return Object.fromEntries(header.map((key, index) => [key, row[index] ?? ""]));
  });
}

function readCsv<T extends CsvRow>(filePath: string): T[] {
  return parseCsv(fs.readFileSync(filePath, "utf8")) as T[];
}

function assertUniqueRows<T extends CsvRow>(rows: T[], key: keyof T, label: string): void {
  const seen = new Set<string>();
  for (const row of rows) {
    const value = row[key];
    if (!value) {
      throw new Error(`${label} row missing ${String(key)}`);
    }
    if (seen.has(value)) {
      throw new Error(`duplicate ${label} ${String(key)}: ${value}`);
    }
    seen.add(value);
  }
}

function resolveCountry(rawCountry: string) {
  const normalized = countryMap.get(rawCountry);
  if (!normalized) {
    throw new Error(`unknown operator_country: ${rawCountry}`);
  }
  return normalized;
}

function readInventory(inventoryDir: string) {
  const sources = readCsv<SourceRow>(path.join(inventoryDir, "sources.csv"));
  const systems = readCsv<SystemRow>(path.join(inventoryDir, "systems.csv"));
  const links = readCsv<LinkRow>(path.join(inventoryDir, "system_links.csv"));

  assertUniqueRows(sources, "source_id", "source");
  assertUniqueRows(systems, "system_id", "system");
  assertUniqueRows(links, "link_id", "link");

  return { sources, systems, links };
}

function main() {
  const requestedDir = process.argv[2];
  const inventoryDir = requestedDir
    ? path.resolve(repoRoot, requestedDir)
    : defaultInventoryDir;
  const { sources, systems, links } = readInventory(inventoryDir);
  const db = getDatabase();
  const findImportedEntityById = db.prepare(
    "SELECT id, kind FROM entities WHERE id = ? LIMIT 1",
  );

  const sourceIds = new Set(sources.map((row) => row.source_id));
  const systemIds = new Set(systems.map((row) => row.system_id));
  const operatorCountryByOrgId = new Map<string, string>();
  const resolvedSystemIds = new Map<string, string>();

  function resolveExistingSystemId(preferredId: string): string | null {
    const exact = findImportedEntityById.get(preferredId) as
      | { id: string; kind: string }
      | undefined;
    if (exact) {
      if (exact.kind !== "system") {
        throw new Error(`entity ${preferredId} exists with unexpected kind ${exact.kind}`);
      }
      return exact.id;
    }

    const aliasId = entityAliases.get(preferredId);
    if (!aliasId) {
      return null;
    }

    const aliased = findImportedEntityById.get(aliasId) as
      | { id: string; kind: string }
      | undefined;
    if (!aliased) {
      return null;
    }
    if (aliased.kind !== "system") {
      throw new Error(`entity alias ${aliasId} exists with unexpected kind ${aliased.kind}`);
    }
    return aliased.id;
  }

  for (const system of systems) {
    if (!sourceIds.has(system.official_source_id)) {
      throw new Error(`system ${system.system_id} references missing source ${system.official_source_id}`);
    }
    if (!sourceIds.has(system.workflow_source_id)) {
      throw new Error(`system ${system.system_id} references missing source ${system.workflow_source_id}`);
    }
    const parentSystemId = normalizeString(system.parent_system_id);
    if (parentSystemId) {
      if (parentSystemId === system.system_id) {
        throw new Error(`system ${system.system_id} cannot parent itself`);
      }
      if (!systemIds.has(parentSystemId) && !resolveExistingSystemId(parentSystemId)) {
        throw new Error(
          `system ${system.system_id} references missing parent system ${parentSystemId}`,
        );
      }
    }
    resolveCountry(system.operator_country);
    const orgId = `org-${slugify(system.operator_name)}`;
    const existingCountry = operatorCountryByOrgId.get(orgId);
    if (existingCountry && existingCountry !== system.operator_country) {
      throw new Error(`operator ${system.operator_name} has conflicting countries`);
    }
    operatorCountryByOrgId.set(orgId, system.operator_country);
  }

  for (const link of links) {
    if (!systemIds.has(link.source_system_id) && !resolveExistingSystemId(link.source_system_id)) {
      throw new Error(`link ${link.link_id} references missing source system ${link.source_system_id}`);
    }
    if (!systemIds.has(link.target_system_id) && !resolveExistingSystemId(link.target_system_id)) {
      throw new Error(`link ${link.link_id} references missing target system ${link.target_system_id}`);
    }
    if (!sourceIds.has(link.evidence_source_id)) {
      throw new Error(`link ${link.link_id} references missing source ${link.evidence_source_id}`);
    }
    if (!relationshipTypes.has(link.relation_type)) {
      throw new Error(`link ${link.link_id} has unsupported relation_type ${link.relation_type}`);
    }
  }

  const findEntityById = db.prepare(
    "SELECT id, kind, slug, parent_entity_id FROM entities WHERE id = ?",
  );
  const findEntityBySlug = db.prepare(
    "SELECT id, kind, slug, parent_entity_id FROM entities WHERE kind = ? AND slug = ? LIMIT 1",
  );
  const insertEntity = db.prepare(`
    INSERT INTO entities (
      id, kind, name, slug, parent_entity_id, country_code, institution_type,
      status, confidence, description, properties_json
    ) VALUES (
      @id, @kind, @name, @slug, @parentEntityId, @countryCode, @institutionType,
      @status, @confidence, @description, @propertiesJson
    )
  `);
  const insertSource = db.prepare(`
    INSERT OR IGNORE INTO sources (
      id, title, source_type, url, local_path, publisher, published_at, accessed_at, note
    ) VALUES (
      @id, @title, @sourceType, @url, NULL, @publisher, NULL, @accessedAt, @note
    )
  `);
  const insertEntitySource = db.prepare(`
    INSERT OR IGNORE INTO entity_sources (
      entity_id, source_id, claim_type, excerpt, confidence_override
    ) VALUES (
      @entityId, @sourceId, @claimType, @excerpt, @confidenceOverride
    )
  `);
  const insertRelationship = db.prepare(`
    INSERT INTO relationships (
      id, source_entity_id, target_entity_id, type, status, confidence, note, properties_json
    ) VALUES (
      @id, @sourceEntityId, @targetEntityId, @type, @status, @confidence, @note, @propertiesJson
    )
  `);
  const findRelationshipById = db.prepare(
    "SELECT id FROM relationships WHERE id = ?",
  );
  const findRelationshipByShape = db.prepare(
    `
      SELECT id
      FROM relationships
      WHERE source_entity_id = ?
        AND target_entity_id = ?
        AND type = ?
      LIMIT 1
    `,
  );
  const updateEntityParentIfMissing = db.prepare(
    "UPDATE entities SET parent_entity_id = ? WHERE id = ? AND parent_entity_id IS NULL",
  );
  const syncEntityParent = db.prepare(
    "UPDATE entities SET parent_entity_id = ? WHERE id = ?",
  );
  const insertRelationshipSource = db.prepare(`
    INSERT OR IGNORE INTO relationship_sources (
      relationship_id, source_id, claim_type, excerpt, confidence_override
    ) VALUES (
      @relationshipId, @sourceId, @claimType, @excerpt, @confidenceOverride
    )
  `);

  function resolveEntityId(
    preferredId: string,
    kind: "country" | "organization" | "system",
    slug: string,
  ): string {
    const exact = findEntityById.get(preferredId) as
      | { id: string; kind: string; slug: string | null }
      | undefined;
    if (exact) {
      if (exact.kind !== kind) {
        throw new Error(`entity ${preferredId} exists with unexpected kind ${exact.kind}`);
      }
      return exact.id;
    }

    const aliasId = entityAliases.get(preferredId);
    if (aliasId) {
      const aliased = findEntityById.get(aliasId) as
        | { id: string; kind: string; slug: string | null }
        | undefined;
      if (aliased) {
        if (aliased.kind !== kind) {
          throw new Error(`entity alias ${aliasId} exists with unexpected kind ${aliased.kind}`);
        }
        return aliased.id;
      }
    }

    const bySlug = findEntityBySlug.get(kind, slug) as
      | { id: string; kind: string; slug: string | null }
      | undefined;
    return bySlug?.id ?? preferredId;
  }

  function ensureEntity(params: {
    preferredId: string;
    kind: "country" | "organization" | "system";
    name: string;
    slug: string;
    parentEntityId: string | null;
    countryCode: string | null;
    institutionType: string | null;
    status: string;
    confidence: number;
    description: string | null;
    properties: Record<string, unknown>;
  }): string {
    const actualId = resolveEntityId(params.preferredId, params.kind, params.slug);
    const existing = findEntityById.get(actualId) as
      | { id: string; kind: string; parent_entity_id: string | null }
      | undefined;

    if (!existing) {
      insertEntity.run({
        id: actualId,
        kind: params.kind,
        name: params.name,
        slug: params.slug,
        parentEntityId: params.parentEntityId,
        countryCode: params.countryCode,
        institutionType: params.institutionType,
        status: params.status,
        confidence: params.confidence,
        description: params.description,
        propertiesJson: JSON.stringify(params.properties),
      });
      return actualId;
    }

    if (params.kind === "organization" && params.parentEntityId && !existing.parent_entity_id) {
      updateEntityParentIfMissing.run(params.parentEntityId, actualId);
    }

    return actualId;
  }

  function ensureRelationship(params: {
    preferredId: string;
    sourceEntityId: string;
    targetEntityId: string;
    type: "governs" | "operates" | "syncs_to";
    status: string;
    confidence: number;
    note: string | null;
    properties: Record<string, unknown>;
  }): string {
    const exact = findRelationshipById.get(params.preferredId) as { id: string } | undefined;
    if (exact) {
      return exact.id;
    }

    const byShape = findRelationshipByShape.get(
      params.sourceEntityId,
      params.targetEntityId,
      params.type,
    ) as { id: string } | undefined;
    if (byShape) {
      return byShape.id;
    }

    insertRelationship.run({
      id: params.preferredId,
      sourceEntityId: params.sourceEntityId,
      targetEntityId: params.targetEntityId,
      type: params.type,
      status: params.status,
      confidence: params.confidence,
      note: params.note,
      propertiesJson: JSON.stringify(params.properties),
    });

    return params.preferredId;
  }

  db.transaction(() => {
    for (const source of sources) {
      insertSource.run({
        id: source.source_id,
        title: source.title,
        sourceType: source.source_type,
        url: normalizeString(source.url),
        publisher: normalizeString(source.publisher),
        accessedAt: normalizeString(source.accessed_at),
        note: normalizeString(source.notes),
      });
    }

    for (const system of systems) {
      const country = resolveCountry(system.operator_country);
      const confidence = parseConfidence(system.confidence, `${system.system_id} confidence`);
      const orgSlug = slugify(system.operator_name);
      const orgEntitySlug = `org-${orgSlug}`;
      const countryId = ensureEntity({
        preferredId: country.id,
        kind: "country",
        name: country.name,
        slug: slugify(country.name),
        parentEntityId: null,
        countryCode: country.code,
        institutionType: null,
        status: "active",
        confidence,
        description: null,
        properties: {
          importDataset: path.basename(inventoryDir),
          importSource: "csv_inventory",
          importedAt,
          operatorCountryRaw: system.operator_country,
          pseudoCountry: Boolean(country.pseudoCountry),
        },
      });
      const orgId = ensureEntity({
        preferredId: `org-${orgSlug}`,
        kind: "organization",
        name: system.operator_name,
        slug: orgEntitySlug,
        parentEntityId: null,
        countryCode: country.code,
        institutionType: "system_operator",
        status: "active",
        confidence,
        description: null,
        properties: {
          importDataset: path.basename(inventoryDir),
          importSource: "csv_inventory",
          importedAt,
          operatorCountryRaw: system.operator_country,
        },
      });
      const systemId = ensureEntity({
        preferredId: system.system_id,
        kind: "system",
        name: system.system_name,
        slug: slugify(system.system_name),
        parentEntityId: null,
        countryCode: country.code,
        institutionType: null,
        status: system.status,
        confidence,
        description: normalizeString(system.notes),
        properties: {
          importDataset: path.basename(inventoryDir),
          importSource: "csv_inventory",
          importedAt,
          subtype: normalizeString(system.role_class),
          aliases: normalizeString(system.aliases),
          canonicalUrl: normalizeString(system.canonical_url),
          operatorName: normalizeString(system.operator_name),
          operatorCountryRaw: normalizeString(system.operator_country),
          disciplineFamily: normalizeString(system.discipline_family),
          scopeTier: normalizeString(system.scope_tier),
          geographicScope: normalizeString(system.geographic_scope),
          marineRelevance: normalizeString(system.marine_relevance),
          researcherInteraction: normalizeString(system.researcher_interaction),
          dataTypes: normalizeString(system.data_types),
          submissionSupported: normalizeString(system.submission_supported),
          accessSupported: normalizeString(system.access_supported),
          apiOrDownloadModes: normalizeString(system.api_or_download_modes),
          formatsOrStandards: normalizeString(system.formats_or_standards),
          persistentIdentifierSupport: normalizeString(system.persistent_identifier_support),
          parentSystemId: normalizeString(system.parent_system_id),
        },
      });
      resolvedSystemIds.set(system.system_id, systemId);

      const governsId = ensureRelationship({
        preferredId: `rel-${country.code.toLowerCase()}-governs-${orgSlug}`,
        sourceEntityId: countryId,
        targetEntityId: orgId,
        type: "governs",
        status: "active",
        confidence,
        note: null,
        properties: {
          importDataset: path.basename(inventoryDir),
          importSource: "csv_inventory",
          importedAt,
        },
      });
      const operatesId = ensureRelationship({
        preferredId: `rel-${orgSlug}-operates-${slugify(system.system_name)}`,
        sourceEntityId: orgId,
        targetEntityId: systemId,
        type: "operates",
        status: "active",
        confidence,
        note: null,
        properties: {
          importDataset: path.basename(inventoryDir),
          importSource: "csv_inventory",
          importedAt,
        },
      });

      for (const sourceLink of [
        {
          sourceId: system.official_source_id,
          claimType: "official_definition",
          excerpt: normalizeString(system.notes),
        },
        {
          sourceId: system.workflow_source_id,
          claimType: "workflow_context",
          excerpt: normalizeString(system.notes),
        },
      ]) {
        insertEntitySource.run({
          entityId: systemId,
          sourceId: sourceLink.sourceId,
          claimType: sourceLink.claimType,
          excerpt: sourceLink.excerpt,
          confidenceOverride: null,
        });
      }

      for (const sourceLink of [
        {
          targetId: orgId,
          claimType: "operator_inferred_from_system",
        },
        {
          targetId: countryId,
          claimType: "country_scope_inferred_from_system",
        },
      ]) {
        for (const sourceId of [system.official_source_id, system.workflow_source_id]) {
          insertEntitySource.run({
            entityId: sourceLink.targetId,
            sourceId,
            claimType: sourceLink.claimType,
            excerpt: normalizeString(system.notes),
            confidenceOverride: null,
          });
        }
      }

      for (const sourceLink of [
        {
          relationshipId: operatesId,
          claimType: "operator_inferred_from_system",
        },
        {
          relationshipId: governsId,
          claimType: "country_scope_inferred_from_system",
        },
      ]) {
        for (const sourceId of [system.official_source_id, system.workflow_source_id]) {
          insertRelationshipSource.run({
            relationshipId: sourceLink.relationshipId,
            sourceId,
            claimType: sourceLink.claimType,
            excerpt: normalizeString(system.notes),
            confidenceOverride: null,
          });
        }
      }
    }

    for (const system of systems) {
      const systemId = resolvedSystemIds.get(system.system_id) ?? system.system_id;
      const parentSystemId = normalizeString(system.parent_system_id);
      const parentEntityId = parentSystemId
        ? (resolvedSystemIds.get(parentSystemId) ?? resolveExistingSystemId(parentSystemId))
        : null;

      if (parentEntityId === systemId) {
        throw new Error(`system ${system.system_id} cannot parent itself`);
      }

      syncEntityParent.run(parentEntityId, systemId);
    }

    for (const link of links) {
      const relationshipId = ensureRelationship({
        preferredId: link.link_id,
        sourceEntityId:
          resolvedSystemIds.get(link.source_system_id) ??
          resolveExistingSystemId(link.source_system_id) ??
          link.source_system_id,
        targetEntityId:
          resolvedSystemIds.get(link.target_system_id) ??
          resolveExistingSystemId(link.target_system_id) ??
          link.target_system_id,
        type: "syncs_to",
        status: link.status,
        confidence: parseConfidence(link.confidence, `${link.link_id} confidence`),
        note: normalizeString(link.direction_note),
        properties: {
          importDataset: path.basename(inventoryDir),
          importSource: "csv_inventory",
          importedAt,
          originalRelationType: normalizeString(link.relation_type),
          directionNote: normalizeString(link.direction_note),
          mechanism: normalizeString(link.mechanism),
          evidenceNote: normalizeString(link.evidence_note),
          semanticDirection: link.relation_type === "federates_with" ? "bidirectional" : "outbound",
        },
      });

      insertRelationshipSource.run({
        relationshipId,
        sourceId: link.evidence_source_id,
        claimType: "relationship_evidence",
        excerpt: normalizeString(link.evidence_note),
        confidenceOverride: null,
      });
    }
  })();

  console.log(
    `Imported ${systems.length} systems, ${links.length} links, and ${sources.length} sources from ${inventoryDir}`,
  );
}

main();
