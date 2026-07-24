import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { GraphEdgeKind, GraphNodeKind, NodeDetails } from "../../shared/domain";
import { getDatabase } from "./db";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const defaultInventoryDir = path.join(
  repoRoot,
  "research",
  "2026-05-26-global-system-inventory",
);
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
};

function normalizeString(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function splitList(value: string): string[] {
  return value
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function emptyNodeDetails(): NodeDetails {
  return {
    aliases: [],
    operator: null,
    role: null,
    disciplineFamily: null,
    geographicScope: null,
    gallery: [],
    data: {
      descriptors: [],
      recordCount: null,
      storageSize: null,
    },
    access: [],
    identifiers: [],
    usage: [],
  };
}

function idPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
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
  const findImportedNodeById = db.prepare(
    "SELECT id, kind FROM nodes WHERE id = ? LIMIT 1",
  );

  const sourceIds = new Set(sources.map((row) => row.source_id));
  const systemIds = new Set(systems.map((row) => row.system_id));
  const operatorCountryByOrgId = new Map<string, string>();
  const resolvedSystemIds = new Map<string, string>();

  function resolveExistingSystemId(preferredId: string): string | null {
    const exact = findImportedNodeById.get(preferredId) as
      | { id: string; kind: string }
      | undefined;
    if (exact) {
      if (exact.kind !== "system") {
        throw new Error(`node ${preferredId} exists with unexpected kind ${exact.kind}`);
      }
      return exact.id;
    }

    const aliasId = entityAliases.get(preferredId);
    if (!aliasId) {
      return null;
    }

    const aliased = findImportedNodeById.get(aliasId) as
      | { id: string; kind: string }
      | undefined;
    if (!aliased) {
      return null;
    }
    if (aliased.kind !== "system") {
      throw new Error(`node alias ${aliasId} exists with unexpected kind ${aliased.kind}`);
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
    const orgId = `org-${idPart(system.operator_name)}`;
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
    if (!relationshipTypes.has(link.relation_type)) {
      throw new Error(`link ${link.link_id} has unsupported relation_type ${link.relation_type}`);
    }
  }

  const findNodeById = db.prepare(
    "SELECT id, kind FROM nodes WHERE id = ?",
  );
  const findNodeByName = db.prepare(
    "SELECT id, kind FROM nodes WHERE kind = ? AND name = ? LIMIT 1",
  );
  const insertNode = db.prepare(`
    INSERT INTO nodes (
      id, kind, name, country_code, subtype, url, summary, details_json, properties_json
    ) VALUES (
      @id, @kind, @name, @countryCode, @subtype, @url, @summary, @detailsJson, @propertiesJson
    )
  `);
  const updateImportedSystemNode = db.prepare(`
    UPDATE nodes
    SET name = @name,
        country_code = @countryCode,
        url = @url,
        summary = @summary,
        details_json = @detailsJson
    WHERE id = @id
  `);
  const insertSource = db.prepare(`
    INSERT OR IGNORE INTO sources (
      id, title, source_type, url, local_path, publisher, published_at, accessed_at, note
    ) VALUES (
      @id, @title, @sourceType, @url, NULL, @publisher, NULL, @accessedAt, @note
    )
  `);
  const insertEdge = db.prepare(`
    INSERT INTO edges (
      id, source_node_id, target_node_id, kind, note, properties_json
    ) VALUES (
      @id, @sourceNodeId, @targetNodeId, @kind, @note, @propertiesJson
    )
  `);
  const findEdgeById = db.prepare(
    "SELECT id FROM edges WHERE id = ?",
  );
  const findEdgeByShape = db.prepare(
    `
      SELECT id
      FROM edges
      WHERE source_node_id = ?
        AND target_node_id = ?
        AND kind = ?
      LIMIT 1
    `,
  );

  function resolveNodeId(
    preferredId: string,
    kind: GraphNodeKind,
    name: string,
  ): string {
    const exact = findNodeById.get(preferredId) as
      | { id: string; kind: string }
      | undefined;
    if (exact) {
      if (exact.kind !== kind) {
        throw new Error(`node ${preferredId} exists with unexpected kind ${exact.kind}`);
      }
      return exact.id;
    }

    const aliasId = entityAliases.get(preferredId);
    if (aliasId) {
      const aliased = findNodeById.get(aliasId) as
        | { id: string; kind: string }
        | undefined;
      if (aliased) {
        if (aliased.kind !== kind) {
          throw new Error(`node alias ${aliasId} exists with unexpected kind ${aliased.kind}`);
        }
        return aliased.id;
      }
    }

    const byName = findNodeByName.get(kind, name) as
      | { id: string; kind: string }
      | undefined;
    return byName?.id ?? preferredId;
  }

  function ensureNode(params: {
    preferredId: string;
    kind: GraphNodeKind;
    name: string;
    countryCode: string | null;
    subtype: string | null;
    url: string | null;
    summary: string | null;
    details: NodeDetails;
    properties: Record<string, unknown>;
  }): string {
    const actualId = resolveNodeId(params.preferredId, params.kind, params.name);
    const existing = findNodeById.get(actualId) as
      | { id: string; kind: string }
      | undefined;

    if (!existing) {
      insertNode.run({
        id: actualId,
        kind: params.kind,
        name: params.name,
        countryCode: params.countryCode,
        subtype: params.subtype,
        url: params.url,
        summary: params.summary,
        detailsJson: JSON.stringify(params.details),
        propertiesJson: JSON.stringify(params.properties),
      });
      return actualId;
    }

    if (existing.kind !== params.kind) {
      throw new Error(`node ${actualId} exists with unexpected kind ${existing.kind}`);
    }

    if (params.kind === "system") {
      updateImportedSystemNode.run({
        id: actualId,
        name: params.name,
        countryCode: params.countryCode,
        url: params.url,
        summary: params.summary,
        detailsJson: JSON.stringify(params.details),
      });
    }

    return actualId;
  }

  function ensureEdge(params: {
    preferredId: string;
    sourceNodeId: string;
    targetNodeId: string;
    kind: GraphEdgeKind;
    note: string | null;
    properties: Record<string, unknown>;
  }): string {
    const exact = findEdgeById.get(params.preferredId) as { id: string } | undefined;
    if (exact) {
      return exact.id;
    }

    const byShape = findEdgeByShape.get(
      params.sourceNodeId,
      params.targetNodeId,
      params.kind,
    ) as { id: string } | undefined;
    if (byShape) {
      return byShape.id;
    }

    insertEdge.run({
      id: params.preferredId,
      sourceNodeId: params.sourceNodeId,
      targetNodeId: params.targetNodeId,
      kind: params.kind,
      note: params.note,
      propertiesJson: JSON.stringify(params.properties),
    });

    return params.preferredId;
  }

  function systemDetails(system: SystemRow, operatorId: string, countryCode: string): NodeDetails {
    return {
      ...emptyNodeDetails(),
      aliases: splitList(system.aliases),
      operator: {
        id: operatorId,
        name: system.operator_name,
        countryCode,
      },
      role: normalizeString(system.role_class),
      disciplineFamily: normalizeString(system.discipline_family),
      geographicScope: normalizeString(system.geographic_scope),
    };
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
      const orgSlug = idPart(system.operator_name);
      const countryId = ensureNode({
        preferredId: country.id,
        kind: "country",
        name: country.name,
        countryCode: country.code,
        subtype: null,
        url: null,
        summary: null,
        details: emptyNodeDetails(),
        properties: {
          pseudoCountry: Boolean(country.pseudoCountry),
        },
      });
      const orgId = ensureNode({
        preferredId: `org-${orgSlug}`,
        kind: "organization",
        name: system.operator_name,
        countryCode: country.code,
        subtype: "system_operator",
        url: null,
        summary: null,
        details: emptyNodeDetails(),
        properties: {},
      });
      const systemId = ensureNode({
        preferredId: system.system_id,
        kind: "system",
        name: system.system_name,
        countryCode: country.code,
        subtype: null,
        url: normalizeString(system.canonical_url),
        summary: normalizeString(system.notes),
        details: systemDetails(system, orgId, country.code),
        properties: {},
      });
      resolvedSystemIds.set(system.system_id, systemId);

      ensureEdge({
        preferredId: `rel-${country.code.toLowerCase()}-governs-${orgSlug}`,
        sourceNodeId: countryId,
        targetNodeId: orgId,
        kind: "governs",
        note: null,
        properties: {},
      });
      ensureEdge({
        preferredId: `rel-${orgSlug}-operates-${idPart(system.system_name)}`,
        sourceNodeId: orgId,
        targetNodeId: systemId,
        kind: "operates",
        note: null,
        properties: {},
      });
    }

    for (const system of systems) {
      const systemId = resolvedSystemIds.get(system.system_id) ?? system.system_id;
      const parentSystemId = normalizeString(system.parent_system_id);
      const parentNodeId = parentSystemId
        ? (resolvedSystemIds.get(parentSystemId) ?? resolveExistingSystemId(parentSystemId))
        : null;

      if (parentNodeId === systemId) {
        throw new Error(`system ${system.system_id} cannot parent itself`);
      }

      if (parentNodeId) {
        ensureEdge({
          preferredId: `rel-${systemId}-part-of-${parentNodeId}`,
          sourceNodeId: systemId,
          targetNodeId: parentNodeId,
          kind: "part_of",
          note: null,
          properties: {},
        });
      }
    }

    for (const link of links) {
      ensureEdge({
        preferredId: link.link_id,
        sourceNodeId:
          resolvedSystemIds.get(link.source_system_id) ??
          resolveExistingSystemId(link.source_system_id) ??
          link.source_system_id,
        targetNodeId:
          resolvedSystemIds.get(link.target_system_id) ??
          resolveExistingSystemId(link.target_system_id) ??
          link.target_system_id,
        kind: "syncs_to",
        note: normalizeString(link.direction_note),
        properties: {
          originalRelationType: normalizeString(link.relation_type),
          directionNote: normalizeString(link.direction_note),
          mechanism: normalizeString(link.mechanism),
          semanticDirection: link.relation_type === "federates_with" ? "bidirectional" : "outbound",
        },
      });
    }
  })();

  console.log(
    `Imported ${systems.length} systems, ${links.length} links, and ${sources.length} sources from ${inventoryDir}`,
  );
}

main();
