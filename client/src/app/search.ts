import type {
  GraphEdge,
  GraphNode,
  RyuRoute,
  SourceRef,
  SystemDataDescriptorCategory,
} from "../../../shared/domain";
import type { IndexedGraph } from "./graph/indexGraph";

export type ClaimFilterKey = SystemDataDescriptorCategory;

export type GraphSearchFilters = {
  role: string[];
  countryCode: string[];
  disciplineFamily: string[];
  dataClaims: Record<ClaimFilterKey, string[]>;
  accessTypes: string[];
  accessMethods: string[];
  identifierSchemes: string[];
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
  entity: GraphNode;
  score: number;
  reasons: SearchMatchReason[];
};

export type SystemSearchRecord = {
  entity: GraphNode;
  system: GraphNode;
  operatorName: string;
  countryCode: string;
  role: string;
  disciplineFamily: string;
  geographicScope: string;
  dataTypes: string[];
  dataFormats: string[];
  dataStandards: string[];
  accessTypes: string[];
  accessMethods: string[];
  accessLabels: string[];
  identifierSchemes: string[];
  sourceTitles: string[];
  connectedNames: string[];
  relationships: GraphEdge[];
  ryuRoutes: RyuRoute[];
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
    entity: GraphNode,
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
  standard: "Data standards",
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
    standard: [],
  },
  accessTypes: [],
  accessMethods: [],
  identifierSchemes: [],
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
    filters.accessTypes,
    filters.accessMethods,
    filters.identifierSchemes,
    ...Object.values(filters.dataClaims),
  ].filter((value) => value.length > 0).length;
}

function getRelationships(entityId: string, graph: IndexedGraph): GraphEdge[] {
  return [
    ...(graph.outgoingByNodeId[entityId] ?? []),
    ...(graph.incomingByNodeId[entityId] ?? []),
  ].map((edgeId) => graph.edgeById[edgeId]);
}

function getConnectedNames(entity: GraphNode, graph: IndexedGraph): string[] {
  return uniqueSorted(
    getRelationships(entity.id, graph)
      .flatMap((edge) => [
        graph.nodeById[edge.sourceNodeId]?.name,
        graph.nodeById[edge.targetNodeId]?.name,
      ])
      .filter((name): name is string => Boolean(name) && name !== entity.name),
  );
}

function getCountryValues(entity: GraphNode, graph: IndexedGraph): string[] {
  if (!entity.countryCode) {
    return [];
  }

  const country = graph.nodes.find(
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

function sourceRefs(system: GraphNode): SourceRef[] {
  return [
    ...system.details.gallery.map((item) => item.source),
    ...system.details.data.descriptors.flatMap((descriptor) => descriptor.source ? [descriptor.source] : []),
    ...(system.details.data.recordCount ? [system.details.data.recordCount.source] : []),
    ...(system.details.data.storageSize ? [system.details.data.storageSize.source] : []),
    ...system.details.access.map((path) => path.source),
    ...system.details.identifiers.flatMap((scheme) => scheme.source ? [scheme.source] : []),
    ...system.details.usage.map((metric) => metric.source),
  ];
}

function sourceValues(source: SourceRef, graph: IndexedGraph): string[] {
  const fullSource = graph.sourceById[source.id];
  return [
    source.title,
    source.url,
    fullSource?.sourceType,
    fullSource?.publisher,
    fullSource?.note,
  ].filter((value): value is string => Boolean(value));
}

function descriptorLabels(
  system: GraphNode,
  category: SystemDataDescriptorCategory,
): string[] {
  return uniqueSorted(
    system.details.data.descriptors
      .filter((descriptor) => descriptor.category === category)
      .map((descriptor) => descriptor.label),
  );
}

function descriptorValues(
  system: GraphNode | undefined,
  category: SystemDataDescriptorCategory,
): string[] {
  return system?.details.data.descriptors
    .filter((descriptor) => descriptor.category === category)
    .flatMap((descriptor) => [
      descriptor.label,
      descriptor.description,
      descriptor.source?.title,
    ])
    .filter((value): value is string => Boolean(value)) ?? [];
}

function buildSystemRecord(entity: GraphNode, graph: IndexedGraph): SystemSearchRecord | null {
  if (entity.kind !== "system") {
    return null;
  }

  const system = entity;
  const relationships = getRelationships(entity.id, graph);
  const connectedNames = getConnectedNames(entity, graph);
  const dataTypes = descriptorLabels(system, "type");
  const dataFormats = descriptorLabels(system, "format");
  const dataStandards = descriptorLabels(system, "standard");
  const ryuRoutes = graph.ryuRoutesByNodeId[entity.id] ?? [];

  return {
    entity,
    system,
    operatorName: system.details.operator?.name ?? "",
    countryCode: system.details.operator?.countryCode ?? system.countryCode ?? entity.countryCode ?? "",
    role: system.details.role ?? "",
    disciplineFamily: system.details.disciplineFamily ?? "",
    geographicScope: system.details.geographicScope ?? "",
    dataTypes,
    dataFormats,
    dataStandards,
    accessTypes: uniqueSorted(system.details.access.map((path) => path.type)),
    accessMethods: uniqueSorted(system.details.access.map((path) => path.method)),
    accessLabels: uniqueSorted(system.details.access.map((path) => path.label)),
    identifierSchemes: uniqueSorted(system.details.identifiers.map((scheme) => scheme.scheme)),
    sourceTitles: uniqueSorted(sourceRefs(system).map((source) => source.title)),
    connectedNames,
    relationships,
    ryuRoutes,
    score: 0,
    matchReasons: [],
  };
}

function buildSystemRecords(graph: IndexedGraph): SystemSearchRecord[] {
  return graph.nodes
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
      getRelationships(entity.id, graph).map((relationship) => relationship.kind),
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
      graph.nodes
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
    getValues: (entity, graph) => graph.nodeById[entity.id]?.details.aliases ?? [],
  },
  {
    field: "system.role",
    label: "Role",
    weight: 65,
    getValues: (entity, graph) => [graph.nodeById[entity.id]?.details.role],
  },
  {
    field: "system.disciplineFamily",
    label: "Discipline",
    weight: 62,
    getValues: (entity, graph) => [graph.nodeById[entity.id]?.details.disciplineFamily],
  },
  {
    field: "system.geographicScope",
    label: "Geographic scope",
    weight: 58,
    getValues: (entity, graph) => [graph.nodeById[entity.id]?.details.geographicScope],
  },
  {
    field: "system.shortDescription",
    label: "Summary",
    weight: 48,
    getValues: (entity, graph) => {
      const system = graph.nodeById[entity.id];
      return [system?.summary];
    },
  },
  {
    field: "system.longDescription",
    label: "Description",
    weight: 24,
    getValues: (entity, graph) => [graph.nodeById[entity.id]?.description],
  },
  {
    field: "data.descriptors.type",
    label: "Data type",
    weight: 74,
    getValues: (entity, graph) =>
      descriptorValues(graph.nodeById[entity.id], "type"),
  },
  {
    field: "data.descriptors.format",
    label: "Data format",
    weight: 72,
    getValues: (entity, graph) =>
      descriptorValues(graph.nodeById[entity.id], "format"),
  },
  {
    field: "data.descriptors.standard",
    label: "Data standard",
    weight: 68,
    getValues: (entity, graph) =>
      descriptorValues(graph.nodeById[entity.id], "standard"),
  },
  {
    field: "data.metrics",
    label: "Metric",
    weight: 55,
    getValues: (entity, graph) => {
      const system = graph.nodeById[entity.id];
      return [
        system?.details.data.recordCount,
        system?.details.data.storageSize,
        ...(system?.details.usage ?? []),
      ].flatMap((metric) =>
        metric
          ? [
              metric.key,
              labelize(metric.key),
              String(metric.value),
              metric.unit,
              metric.description,
            ]
          : [],
      );
    },
  },
  {
    field: "access.type",
    label: "Access type",
    weight: 62,
    getValues: (entity, graph) =>
      graph.nodeById[entity.id]?.details.access.flatMap((path) => [
        path.type,
        labelize(path.type),
      ]) ?? [],
  },
  {
    field: "access.method",
    label: "Access method",
    weight: 64,
    getValues: (entity, graph) =>
      graph.nodeById[entity.id]?.details.access.flatMap((path) => [
        path.method,
        labelize(path.method),
        path.label,
      ]) ?? [],
  },
  {
    field: "access.detail",
    label: "Access detail",
    weight: 36,
    getValues: (entity, graph) =>
      graph.nodeById[entity.id]?.details.access.flatMap((path) => [
        path.description,
        path.url,
        path.source.title,
      ]) ?? [],
  },
  {
    field: "identifiers.scheme",
    label: "Identifier",
    weight: 72,
    getValues: (entity, graph) =>
      graph.nodeById[entity.id]?.details.identifiers.map((scheme) => scheme.scheme) ?? [],
  },
  {
    field: "identifiers.detail",
    label: "Identifier detail",
    weight: 34,
    getValues: (entity, graph) =>
      graph.nodeById[entity.id]?.details.identifiers.flatMap((scheme) => [
        scheme.appliesTo,
        scheme.description,
        scheme.source?.title,
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
      getRelationships(entity.id, graph).map((relationship) => relationship.kind),
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
      const system = graph.nodeById[entity.id];
      return system
        ? sourceRefs(system).flatMap((source) => sourceValues(source, graph))
        : [];
    },
  },
  {
    field: "gallery",
    label: "Gallery",
    weight: 28,
    getValues: (entity, graph) =>
      graph.nodeById[entity.id]?.details.gallery.flatMap((item) => [
        item.title,
        item.caption,
        item.source.title,
      ]) ?? [],
  },
  {
    field: "ryu.routes",
    label: "Agent route",
    weight: 40,
    getValues: (entity, graph) =>
      (graph.ryuRoutesByNodeId[entity.id] ?? []).flatMap((route) => [
        route.status,
        route.mode,
        route.capabilities,
        route.target,
        route.upstream,
        route.format,
        route.contractRef,
        route.caveat,
      ]) ?? [],
  },
]);

const searchFieldDefinitionsByKind = {
  country: countryFieldDefinitions,
  organization: organizationFieldDefinitions,
  system: systemFieldDefinitions,
} satisfies Record<GraphNode["kind"], SearchFieldDefinition[]>;

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
  entity: GraphNode,
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
  if (key === "type") {
    return record.dataTypes;
  }
  if (key === "format") {
    return record.dataFormats;
  }
  return record.dataStandards;
}

function matchesSystemFilters(
  record: SystemSearchRecord,
  filters: GraphSearchFilters,
): boolean {
  return (
    matchesSelected([record.role], filters.role) &&
    matchesSelected([record.countryCode], filters.countryCode) &&
    matchesSelected([record.disciplineFamily], filters.disciplineFamily) &&
    matchesAny(record.accessTypes, filters.accessTypes) &&
    matchesAny(record.accessMethods, filters.accessMethods) &&
    matchesAny(record.identifierSchemes, filters.identifierSchemes) &&
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
      standard: selectOptions(records.flatMap((record) => record.dataStandards)),
    },
    accessTypes: selectOptions(records.flatMap((record) => record.accessTypes)),
    accessMethods: selectOptions(records.flatMap((record) => record.accessMethods)),
    identifierSchemes: selectOptions(records.flatMap((record) => record.identifierSchemes)),
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
    ? graph.nodes
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
