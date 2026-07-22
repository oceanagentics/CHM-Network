import type {
  Entity,
  Relationship,
  SourceRef,
  SystemDataDescriptorCategory,
  SystemNode,
} from "../../../shared/domain";
import type { IndexedGraph } from "./graph/indexGraph";

export type ClaimFilterKey = Extract<SystemDataDescriptorCategory, "type" | "format">;

export type GraphSearchFilters = {
  role: string[];
  countryCode: string[];
  disciplineFamily: string[];
  dataClaims: Record<ClaimFilterKey, string[]>;
  accessMethods: string[];
};

export type GraphSearchIntent = {
  query: string;
  filters: GraphSearchFilters;
};

export type SearchMatchReason = {
  field: string;
  label: string;
  value: string;
  token: string;
  score: number;
};

export type EntitySearchResult = {
  entity: Entity;
  score: number;
  reasons: SearchMatchReason[];
};

export type SystemSearchRecord = {
  entity: Entity;
  system: SystemNode;
  operatorName: string;
  countryCode: string;
  role: string;
  disciplineFamily: string;
  geographicScope: string;
  dataTypes: string[];
  dataFormats: string[];
  accessMethods: string[];
  identifierSchemes: string[];
  sourceTitles: string[];
  connectedNames: string[];
  relationships: Relationship[];
  score: number;
  matchReasons: SearchMatchReason[];
};

export type ResolvedGraphSearch = {
  active: boolean;
  query: string;
  entityResults: EntitySearchResult[];
  matchingEntityIds: Set<string>;
  systemRecords: SystemSearchRecord[];
  filteredSystemRecords: SystemSearchRecord[];
};

type SearchFieldDefinition = {
  field: string;
  label: string;
  weight: number;
  getValues: (
    entity: Entity,
    graph: IndexedGraph,
    context: SearchContext,
  ) => unknown[];
};

type SearchContext = {
  systemRecordById: Record<string, SystemSearchRecord>;
};

export const claimFilterLabels: Record<ClaimFilterKey, string> = {
  type: "Data types",
  format: "Data formats",
};

export const claimFilterKeys = Object.keys(claimFilterLabels) as ClaimFilterKey[];

const countryAliasesByCode: Record<string, string[]> = {
  CAN: ["Canada", "Canadian"],
  DEU: ["Germany", "German"],
  EUR: ["Europe", "European", "European Union", "EU"],
  INT: ["International", "Global"],
  JPN: ["Japan", "Japanese"],
  USA: ["United States", "US", "U.S.", "USA", "American"],
};

export const emptySearchFilters = (): GraphSearchFilters => ({
  role: [],
  countryCode: [],
  disciplineFamily: [],
  dataClaims: {
    type: [],
    format: [],
  },
  accessMethods: [],
});

export function labelize(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function normalizeSearchValue(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function tokenize(value: string): string[] {
  return normalizeSearchValue(value).split(/[^a-z0-9]+/).filter(Boolean);
}

function collectText(value: unknown): string[] {
  if (value == null || value === "") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectText(item));
  }

  if (typeof value === "object") {
    return Object.values(value).flatMap((child) => collectText(child));
  }

  return [String(value)];
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
    .sort((left, right) => left.localeCompare(right));
}

export function selectOptions(values: Array<string | null | undefined>) {
  return uniqueSorted(values).map((value) => ({
    label: labelize(value),
    value,
  }));
}

export function countActiveFilters(filters: GraphSearchFilters): number {
  return [
    filters.role,
    filters.countryCode,
    filters.disciplineFamily,
    filters.accessMethods,
    ...Object.values(filters.dataClaims),
  ].filter((value) => value.length > 0).length;
}

function getRelationships(entityId: string, graph: IndexedGraph): Relationship[] {
  return [
    ...(graph.outgoingByEntityId[entityId] ?? []),
    ...(graph.incomingByEntityId[entityId] ?? []),
  ].map((relationshipId) => graph.relationshipById[relationshipId]);
}

function getConnectedNames(entity: Entity, graph: IndexedGraph): string[] {
  return uniqueSorted(
    getRelationships(entity.id, graph)
      .flatMap((relationship) => [
        graph.entityById[relationship.sourceEntityId]?.name,
        graph.entityById[relationship.targetEntityId]?.name,
      ])
      .filter((name): name is string => Boolean(name) && name !== entity.name),
  );
}

function getCountryValues(entity: Entity, graph: IndexedGraph): string[] {
  if (!entity.countryCode) {
    return [];
  }

  const country = graph.entities.find(
    (candidate) =>
      candidate.kind === "country" &&
      candidate.countryCode === entity.countryCode,
  );

  return collectText([
    entity.countryCode,
    country?.name,
    countryAliasesByCode[entity.countryCode],
  ]);
}

function sourceRefs(system: SystemNode): SourceRef[] {
  return [
    ...system.gallery.map((item) => item.source),
    ...system.data.descriptors.flatMap((descriptor) => descriptor.source ? [descriptor.source] : []),
    ...(system.data.recordCount ? [system.data.recordCount.source] : []),
    ...(system.data.storageSize ? [system.data.storageSize.source] : []),
    ...system.access.map((path) => path.source),
    ...system.identifiers.flatMap((scheme) => scheme.source ? [scheme.source] : []),
    ...system.usage.map((metric) => metric.source),
  ];
}

function buildSystemRecord(entity: Entity, graph: IndexedGraph): SystemSearchRecord | null {
  const system = graph.systemNodeById[entity.id];
  if (!system) {
    return null;
  }

  const relationships = getRelationships(entity.id, graph);
  const connectedNames = getConnectedNames(entity, graph);
  const dataTypes = uniqueSorted(
    system.data.descriptors
      .filter((descriptor) => descriptor.category === "type")
      .map((descriptor) => descriptor.label),
  );
  const dataFormats = uniqueSorted(
    system.data.descriptors
      .filter((descriptor) => descriptor.category === "format")
      .map((descriptor) => descriptor.label),
  );

  return {
    entity,
    system,
    operatorName: system.operator?.name ?? "",
    countryCode: system.operator?.countryCode ?? system.countryCode ?? entity.countryCode ?? "",
    role: system.role ?? "",
    disciplineFamily: system.disciplineFamily ?? "",
    geographicScope: system.geographicScope ?? "",
    dataTypes,
    dataFormats,
    accessMethods: uniqueSorted(system.access.map((path) => path.label)),
    identifierSchemes: uniqueSorted(system.identifiers.map((scheme) => scheme.scheme)),
    sourceTitles: uniqueSorted(sourceRefs(system).map((source) => source.title)),
    connectedNames,
    relationships,
    score: 0,
    matchReasons: [],
  };
}

function buildSystemRecords(graph: IndexedGraph): SystemSearchRecord[] {
  return graph.entities
    .filter((entity) => entity.kind === "system")
    .flatMap((entity) => {
      const record = buildSystemRecord(entity, graph);
      return record ? [record] : [];
    })
    .sort((left, right) => left.entity.name.localeCompare(right.entity.name));
}

function withCommonFields(
  definitions: SearchFieldDefinition[],
): SearchFieldDefinition[] {
  return [
    {
      field: "name",
      label: "Name",
      weight: 100,
      getValues: (entity) => [entity.name],
    },
    {
      field: "kind",
      label: "Node type",
      weight: 80,
      getValues: (entity) => [entity.kind, labelize(entity.kind)],
    },
    {
      field: "country",
      label: "Country",
      weight: 90,
      getValues: (entity, graph) => getCountryValues(entity, graph),
    },
    {
      field: "subtype",
      label: "Subtype",
      weight: 60,
      getValues: (entity) => [entity.subtype, entity.subtype ? labelize(entity.subtype) : null],
    },
    ...definitions,
  ];
}

const organizationFieldDefinitions = withCommonFields([
  {
    field: "relationships.connectedNames",
    label: "Connected node",
    weight: 35,
    getValues: (entity, graph) => getConnectedNames(entity, graph),
  },
  {
    field: "relationships.type",
    label: "Relationship",
    weight: 35,
    getValues: (entity, graph) =>
      getRelationships(entity.id, graph).map((relationship) => relationship.type),
  },
  {
    field: "relationships.note",
    label: "Relationship note",
    weight: 20,
    getValues: (entity, graph) =>
      getRelationships(entity.id, graph).map((relationship) => relationship.note),
  },
]);

const countryFieldDefinitions = withCommonFields([
  {
    field: "children",
    label: "Contained node",
    weight: 30,
    getValues: (entity, graph) =>
      graph.entities
        .filter((candidate) => candidate.countryCode === entity.countryCode)
        .map((candidate) => candidate.name),
  },
]);

const systemFieldDefinitions = withCommonFields([
  {
    field: "operator",
    label: "Operator",
    weight: 75,
    getValues: (entity, _graph, context) => [
      context.systemRecordById[entity.id]?.operatorName,
    ],
  },
  {
    field: "system.aliases",
    label: "Alias",
    weight: 90,
    getValues: (entity, graph) => graph.systemNodeById[entity.id]?.aliases ?? [],
  },
  {
    field: "system.role",
    label: "Role",
    weight: 65,
    getValues: (entity, graph) => [graph.systemNodeById[entity.id]?.role],
  },
  {
    field: "system.disciplineFamily",
    label: "Discipline",
    weight: 62,
    getValues: (entity, graph) => [graph.systemNodeById[entity.id]?.disciplineFamily],
  },
  {
    field: "system.geographicScope",
    label: "Geographic scope",
    weight: 58,
    getValues: (entity, graph) => [graph.systemNodeById[entity.id]?.geographicScope],
  },
  {
    field: "system.description",
    label: "Description",
    weight: 45,
    getValues: (entity, graph) => {
      const system = graph.systemNodeById[entity.id];
      return [system?.shortDescription, system?.longDescription];
    },
  },
  {
    field: "data.descriptors",
    label: "Data",
    weight: 70,
    getValues: (entity, graph) =>
      graph.systemNodeById[entity.id]?.data.descriptors.flatMap((descriptor) => [
        descriptor.category,
        descriptor.label,
        descriptor.description,
      ]) ?? [],
  },
  {
    field: "data.metrics",
    label: "Metric",
    weight: 55,
    getValues: (entity, graph) => {
      const system = graph.systemNodeById[entity.id];
      return [
        system?.data.recordCount,
        system?.data.storageSize,
        ...(system?.usage ?? []),
      ];
    },
  },
  {
    field: "access",
    label: "Access",
    weight: 58,
    getValues: (entity, graph) =>
      graph.systemNodeById[entity.id]?.access.flatMap((path) => [
        path.type,
        path.method,
        path.label,
        path.url,
        path.description,
        path.source.title,
        path.source.url,
      ]) ?? [],
  },
  {
    field: "identifiers",
    label: "Identifier",
    weight: 55,
    getValues: (entity, graph) =>
      graph.systemNodeById[entity.id]?.identifiers.flatMap((scheme) => [
        scheme.scheme,
        scheme.appliesTo,
        scheme.description,
      ]) ?? [],
  },
  {
    field: "relationships.connectedNames",
    label: "Connected node",
    weight: 32,
    getValues: (entity, _graph, context) =>
      context.systemRecordById[entity.id]?.connectedNames ?? [],
  },
  {
    field: "relationships.type",
    label: "Relationship",
    weight: 35,
    getValues: (entity, graph) =>
      getRelationships(entity.id, graph).map((relationship) => relationship.type),
  },
  {
    field: "relationships.note",
    label: "Relationship note",
    weight: 20,
    getValues: (entity, graph) =>
      getRelationships(entity.id, graph).map((relationship) => relationship.note),
  },
  {
    field: "sources",
    label: "Source",
    weight: 18,
    getValues: (entity, graph) => {
      const system = graph.systemNodeById[entity.id];
      return system
        ? sourceRefs(system).flatMap((source) => [source.title, source.url])
        : [];
    },
  },
]);

const searchFieldDefinitionsByKind = {
  country: countryFieldDefinitions,
  organization: organizationFieldDefinitions,
  system: systemFieldDefinitions,
} satisfies Record<Entity["kind"], SearchFieldDefinition[]>;

function editDistanceWithinOne(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1) {
    return false;
  }

  let edits = 0;
  let leftIndex = 0;
  let rightIndex = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }

    edits += 1;
    if (edits > 1) {
      return false;
    }

    if (left.length > right.length) {
      leftIndex += 1;
    } else if (right.length > left.length) {
      rightIndex += 1;
    } else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }

  return edits + (left.length - leftIndex) + (right.length - rightIndex) <= 1;
}

function scoreTokenAgainstValue(token: string, value: string): number | null {
  const normalizedValue = normalizeSearchValue(value);
  const words = tokenize(value);

  if (words.length === 0) {
    return null;
  }

  if (normalizedValue === token) {
    return 1.1;
  }

  if (words.includes(token)) {
    return 1;
  }

  if (words.some((word) => word.startsWith(token))) {
    return 0.9;
  }

  if (token.length >= 3 && words.some((word) => word.includes(token))) {
    return 0.72;
  }

  if (
    token.length >= 4 &&
    words.some((word) => word.length >= 4 && editDistanceWithinOne(token, word))
  ) {
    return 0.64;
  }

  return null;
}

function uniqueReasons(reasons: SearchMatchReason[]): SearchMatchReason[] {
  const bestReasonByKey = new Map<string, SearchMatchReason>();

  for (const reason of reasons) {
    const key = `${reason.field}:${reason.value}`;
    const current = bestReasonByKey.get(key);
    if (!current || reason.score > current.score) {
      bestReasonByKey.set(key, reason);
    }
  }

  return [...bestReasonByKey.values()].sort((left, right) => right.score - left.score);
}

function scoreEntity(
  entity: Entity,
  graph: IndexedGraph,
  context: SearchContext,
  tokens: string[],
): EntitySearchResult | null {
  const bestReasonByToken = new Map<string, SearchMatchReason>();

  for (const definition of searchFieldDefinitionsByKind[entity.kind]) {
    for (const value of collectText(definition.getValues(entity, graph, context))) {
      for (const token of tokens) {
        const tokenScore = scoreTokenAgainstValue(token, value);
        if (tokenScore == null) {
          continue;
        }

        const score = definition.weight * tokenScore;
        const currentBestReason = bestReasonByToken.get(token);
        if (!currentBestReason || score > currentBestReason.score) {
          bestReasonByToken.set(token, {
            field: definition.field,
            label: definition.label,
            value,
            token,
            score,
          });
        }
      }
    }
  }

  if (tokens.some((token) => !bestReasonByToken.has(token))) {
    return null;
  }

  const tokenReasons = [...bestReasonByToken.values()];
  return {
    entity,
    score: tokenReasons.reduce((sum, reason) => sum + reason.score, 0),
    reasons: uniqueReasons(tokenReasons).slice(0, 4),
  };
}

function matchesSelected(values: string[], selected: string[]): boolean {
  return selected.length === 0 || selected.includes(values[0] ?? "");
}

function matchesAny(values: string[], selected: string[]): boolean {
  return selected.length === 0 || values.some((value) => selected.includes(value));
}

function claimList(record: SystemSearchRecord, key: ClaimFilterKey): string[] {
  return key === "type" ? record.dataTypes : record.dataFormats;
}

function matchesSystemFilters(
  record: SystemSearchRecord,
  filters: GraphSearchFilters,
): boolean {
  return (
    matchesSelected([record.role], filters.role) &&
    matchesSelected([record.countryCode], filters.countryCode) &&
    matchesSelected([record.disciplineFamily], filters.disciplineFamily) &&
    matchesAny(record.accessMethods, filters.accessMethods) &&
    claimFilterKeys.every((key) =>
      matchesAny(claimList(record, key), filters.dataClaims[key]),
    )
  );
}

export function getSystemFilterOptions(records: SystemSearchRecord[]) {
  return {
    role: selectOptions(records.map((record) => record.role)),
    countryCode: selectOptions(records.map((record) => record.countryCode)),
    disciplineFamily: selectOptions(records.map((record) => record.disciplineFamily)),
    dataClaims: {
      type: selectOptions(records.flatMap((record) => record.dataTypes)),
      format: selectOptions(records.flatMap((record) => record.dataFormats)),
    },
    accessMethods: selectOptions(records.flatMap((record) => record.accessMethods)),
  };
}

export function resolveGraphSearch(
  graph: IndexedGraph,
  intent: GraphSearchIntent,
): ResolvedGraphSearch {
  const query = intent.query.trim();
  const tokens = tokenize(query);
  const systemRecords = buildSystemRecords(graph);
  const systemRecordById = Object.fromEntries(
    systemRecords.map((record) => [record.entity.id, record]),
  );
  const context = { systemRecordById };
  const entityResults = tokens.length
    ? graph.entities
        .flatMap((entity) => {
          const result = scoreEntity(entity, graph, context, tokens);
          return result ? [result] : [];
        })
        .sort((left, right) => right.score - left.score)
    : [];
  const entityResultById = new Map(
    entityResults.map((result) => [result.entity.id, result]),
  );
  const filteredSystemRecords = systemRecords
    .flatMap((record) => {
      const result = entityResultById.get(record.entity.id);
      if (tokens.length > 0 && !result) {
        return [];
      }

      return [
        {
          ...record,
          score: result?.score ?? 0,
          matchReasons: result?.reasons ?? [],
        },
      ];
    })
    .filter((record) => matchesSystemFilters(record, intent.filters))
    .sort((left, right) => {
      if (tokens.length > 0) {
        return right.score - left.score;
      }
      return left.entity.name.localeCompare(right.entity.name);
    });
  const active = tokens.length > 0 || countActiveFilters(intent.filters) > 0;
  const matchingEntityIds = new Set<string>();

  if (active) {
    if (tokens.length > 0) {
      for (const result of entityResults) {
        if (result.entity.kind !== "system") {
          matchingEntityIds.add(result.entity.id);
        }
      }
    }

    for (const record of filteredSystemRecords) {
      matchingEntityIds.add(record.entity.id);
    }
  }

  return {
    active,
    query,
    entityResults,
    matchingEntityIds,
    systemRecords,
    filteredSystemRecords,
  };
}
