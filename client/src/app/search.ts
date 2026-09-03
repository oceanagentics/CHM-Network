import type {
  GraphEdge,
  GraphNode,
  ResolvedNodeLocalization,
  ReviewState,
  RyuRoute,
  SourceRef,
  SupportedLocale,
  SystemDataDescriptorCategory,
} from "../../../shared/domain";
import type { IndexedGraph } from "./graph/indexGraph";
import {
  facetLabel,
  humanizeCode,
  t,
  type FacetGroup,
  type UiMessageKey,
} from "./i18n";
import {
  nodeTitle,
  resolveNodeDisplay,
  systemDataDescriptors,
  systemAccessPaths,
  systemGallery,
} from "./localization";

export type ClaimFilterKey = SystemDataDescriptorCategory;
export type LocalizationCoverageFilter =
  | "current_locale"
  | "missing_current_locale";

export type GraphSearchFilters = {
  role: string[];
  countryCode: string[];
  disciplineFamily: string[];
  dataClaims: Record<ClaimFilterKey, string[]>;
  accessTypes: string[];
  accessMethods: string[];
  localizationCoverage: LocalizationCoverageFilter[];
  reviewState: ReviewState[];
};

export type GraphSearchIntent = {
  query: string;
  filters: GraphSearchFilters;
  searchAllLanguages?: boolean;
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
  displayLocale: SupportedLocale | null;
  matchedLocale: SupportedLocale | null;
  isLocaleFallback: boolean;
  reasons: SearchMatchReason[];
};

export type SystemSearchRecord = {
  entity: GraphNode;
  system: GraphNode;
  title: string;
  summary: string | null;
  localization: ResolvedNodeLocalization;
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
  hasCurrentLocale: boolean;
  currentLocaleReviewState: ReviewState | null;
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
  label: UiMessageKey;
  weight: number;
  getValues: (
    entity: GraphNode,
    graph: IndexedGraph,
    context: SearchContext,
    localization: ResolvedNodeLocalization,
  ) => unknown[];
};

type SearchContext = {
  systemRecordById: Record<string, SystemSearchRecord>;
  locale: SupportedLocale;
};

export const claimFilterKeys = ["type", "format", "standard"] as const;

export function claimFilterLabel(locale: SupportedLocale, value: ClaimFilterKey): string {
  return facetLabel(locale, "dataClaim", value);
}

export function localizationCoverageFilterOptions(locale: SupportedLocale): Array<{
  label: string;
  value: LocalizationCoverageFilter;
}> {
  return [
    {
      label: facetLabel(locale, "localizationCoverage", "current_locale"),
      value: "current_locale",
    },
    {
      label: facetLabel(locale, "localizationCoverage", "missing_current_locale"),
      value: "missing_current_locale",
    },
  ];
}

export function reviewStateFilterOptions(
  locale: SupportedLocale,
): Array<{ label: string; value: ReviewState }> {
  return [
    { label: facetLabel(locale, "reviewState", "agent_researched"), value: "agent_researched" },
    { label: facetLabel(locale, "reviewState", "human_reviewed"), value: "human_reviewed" },
    { label: facetLabel(locale, "reviewState", "needs_revision"), value: "needs_revision" },
  ];
}

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
  localizationCoverage: [],
  reviewState: [],
});

export function labelize(value: string): string {
  return humanizeCode(value);
}

export function normalizeSearchValue(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFKC");
}

function tokenize(value: string, locale?: SupportedLocale): string[] {
  const normalized = normalizeSearchValue(value);
  const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(locale, { granularity: "word" })
    : null;
  const tokens = segmenter
    ? Array.from(segmenter.segment(normalized))
        .filter((segment) => segment.isWordLike)
        .map((segment) => segment.segment)
    : normalized.match(/[\p{L}\p{N}]+/gu) ?? [];

  return [...new Set(tokens.filter(Boolean))];
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

export function selectOptions(
  values: Array<string | null | undefined>,
  locale: SupportedLocale,
  facetGroup?: FacetGroup,
) {
  return uniqueSorted(values).map((value) => ({
    label: facetGroup ? facetLabel(locale, facetGroup, value) : labelize(value),
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
    filters.localizationCoverage,
    filters.reviewState,
    ...Object.values(filters.dataClaims),
  ].filter((value) => value.length > 0).length;
}

function getRelationships(entityId: string, graph: IndexedGraph): GraphEdge[] {
  return [
    ...(graph.outgoingByNodeId[entityId] ?? []),
    ...(graph.incomingByNodeId[entityId] ?? []),
  ].map((edgeId) => graph.edgeById[edgeId]);
}

function getConnectedNames(
  entity: GraphNode,
  graph: IndexedGraph,
  locale: SupportedLocale,
): string[] {
  const entityTitle = nodeTitle(entity, locale);
  return uniqueSorted(
    getRelationships(entity.id, graph)
      .flatMap((edge) => [
        graph.nodeById[edge.sourceNodeId]
          ? nodeTitle(graph.nodeById[edge.sourceNodeId], locale)
          : null,
        graph.nodeById[edge.targetNodeId]
          ? nodeTitle(graph.nodeById[edge.targetNodeId], locale)
          : null,
      ])
      .filter((name): name is string => Boolean(name) && name !== entityTitle),
  );
}

function getCountryValues(
  entity: GraphNode,
  graph: IndexedGraph,
  locale: SupportedLocale,
): string[] {
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
    country ? nodeTitle(country, locale) : null,
    countryAliasesByCode[entity.countryCode],
  ]);
}

function sourceRefs(system: GraphNode): SourceRef[] {
  return [
    ...(system.properties.gallery ?? []).map((item) => item.source),
    ...(system.properties.data?.descriptors ?? []).flatMap((descriptor) =>
      descriptor.source ? [descriptor.source] : [],
    ),
    ...(system.properties.data?.recordCount ? [system.properties.data.recordCount.source] : []),
    ...(system.properties.data?.storageSize ? [system.properties.data.storageSize.source] : []),
    ...(system.properties.access ?? []).map((path) => path.source),
    ...(system.properties.usage ?? []).map((metric) => metric.source),
  ];
}

function sourceValues(
  source: SourceRef,
  graph: IndexedGraph,
  locale: SupportedLocale,
): string[] {
  const fullSource = graph.sourceById[source.id];
  return [
    source.title,
    source.url,
    fullSource?.sourceType,
    fullSource?.sourceType ? facetLabel(locale, "sourceType", fullSource.sourceType) : null,
    fullSource?.publisher,
    fullSource?.note,
  ].filter((value): value is string => Boolean(value));
}

function descriptorLabels(
  system: GraphNode,
  category: SystemDataDescriptorCategory,
): string[] {
  return uniqueSorted(
    (system.properties.data?.descriptors ?? [])
      .filter((descriptor) => descriptor.category === category)
      .map((descriptor) => descriptor.label),
  );
}

function descriptorValues(
  system: GraphNode | undefined,
  localization: ResolvedNodeLocalization,
  category: SystemDataDescriptorCategory,
  locale: SupportedLocale,
): string[] {
  return system
    ? systemDataDescriptors(system, localization)
    .filter((descriptor) => descriptor.category === category)
    .flatMap((descriptor) => [
      descriptor.label,
      descriptor.localizedLabel,
      descriptor.description,
      facetLabel(locale, "descriptorLabel", descriptor.label),
      descriptor.source?.title,
    ])
    .filter((value): value is string => Boolean(value))
    : [];
}

function buildSystemRecord(
  entity: GraphNode,
  graph: IndexedGraph,
  locale: SupportedLocale,
): SystemSearchRecord | null {
  if (entity.kind !== "system") {
    return null;
  }

  const system = entity;
  const localization = resolveNodeDisplay(system, locale);
  const currentLocalization = system.localizations[locale] ?? null;
  const accessPaths = systemAccessPaths(system, localization);
  const relationships = getRelationships(entity.id, graph);
  const connectedNames = getConnectedNames(entity, graph, locale);
  const dataTypes = descriptorLabels(system, "type");
  const dataFormats = descriptorLabels(system, "format");
  const dataStandards = descriptorLabels(system, "standard");
  const ryuRoutes = graph.ryuRoutesByNodeId[entity.id] ?? [];

  return {
    entity,
    system,
    title: localization.title,
    summary: localization.summary,
    localization,
    operatorName: system.properties.operator?.name ?? "",
    countryCode: system.properties.operator?.countryCode ?? system.countryCode ?? entity.countryCode ?? "",
    role: system.properties.role ?? "",
    disciplineFamily: system.properties.disciplineFamily ?? "",
    geographicScope: system.properties.geographicScope ?? "",
    dataTypes,
    dataFormats,
    dataStandards,
    accessTypes: uniqueSorted(accessPaths.map((path) => path.type)),
    accessMethods: uniqueSorted(accessPaths.map((path) => path.method)),
    accessLabels: uniqueSorted(accessPaths.map((path) =>
      path.label === path.method
        ? facetLabel(locale, "accessMethod", path.method)
        : path.label,
    )),
    hasCurrentLocale: Boolean(currentLocalization),
    currentLocaleReviewState: currentLocalization?.reviewState ?? null,
    sourceTitles: uniqueSorted(sourceRefs(system).map((source) => source.title)),
    connectedNames,
    relationships,
    ryuRoutes,
    score: 0,
    matchReasons: [],
  };
}

function buildSystemRecords(
  graph: IndexedGraph,
  locale: SupportedLocale,
): SystemSearchRecord[] {
  return graph.nodes
    .filter((entity) => entity.kind === "system")
    .flatMap((entity) => {
      const record = buildSystemRecord(entity, graph, locale);
      return record ? [record] : [];
    })
    .sort((left, right) => left.title.localeCompare(right.title));
}

function withCommonFields(
  definitions: SearchFieldDefinition[],
): SearchFieldDefinition[] {
  return [
    {
      field: "name",
      label: "search.field.name",
      weight: 100,
      getValues: (_entity, _graph, _context, localization) => [localization.title],
    },
    {
      field: "kind",
      label: "search.field.nodeType",
      weight: 80,
      getValues: (entity, _graph, context) => [
        entity.kind,
        facetLabel(context.locale, "nodeKind", entity.kind),
      ],
    },
    {
      field: "country",
      label: "search.field.country",
      weight: 90,
      getValues: (entity, graph, context) => getCountryValues(entity, graph, context.locale),
    },
    {
      field: "subtype",
      label: "search.field.subtype",
      weight: 60,
      getValues: (entity, _graph, context) => [
        entity.subtype,
        entity.subtype ? facetLabel(context.locale, "subtype", entity.subtype) : null,
      ],
    },
    ...definitions,
  ];
}

const organizationFieldDefinitions = withCommonFields([
  {
    field: "relationships.connectedNames",
    label: "search.field.connectedNode",
    weight: 35,
    getValues: (entity, graph, context) =>
      getConnectedNames(entity, graph, context.locale),
  },
  {
    field: "relationships.type",
    label: "search.field.relationship",
    weight: 35,
    getValues: (entity, graph, context) =>
      getRelationships(entity.id, graph).flatMap((relationship) => [
        relationship.kind,
        facetLabel(context.locale, "edgeKind", relationship.kind),
      ]),
  },
  {
    field: "relationships.note",
    label: "search.field.relationshipNote",
    weight: 20,
    getValues: (entity, graph) =>
      getRelationships(entity.id, graph).map((relationship) => relationship.note),
  },
]);

const countryFieldDefinitions = withCommonFields([
  {
    field: "children",
    label: "search.field.containedNode",
    weight: 30,
    getValues: (entity, graph, context) =>
      graph.nodes
        .filter((candidate) => candidate.countryCode === entity.countryCode)
        .map((candidate) => nodeTitle(candidate, context.locale)),
  },
]);

const systemFieldDefinitions = withCommonFields([
  {
    field: "operator",
    label: "search.field.operator",
    weight: 75,
    getValues: (entity, _graph, context) => [
      context.systemRecordById[entity.id]?.operatorName,
    ],
  },
  {
    field: "system.aliases",
    label: "search.field.alias",
    weight: 90,
    getValues: (_entity, _graph, _context, localization) => localization.details.aliases,
  },
  {
    field: "system.role",
    label: "search.field.role",
    weight: 65,
    getValues: (entity, graph, context) => {
      const value = graph.nodeById[entity.id]?.properties.role;
      return [value, value ? facetLabel(context.locale, "systemRole", value) : null];
    },
  },
  {
    field: "system.disciplineFamily",
    label: "search.field.discipline",
    weight: 62,
    getValues: (entity, graph, context) => {
      const value = graph.nodeById[entity.id]?.properties.disciplineFamily;
      return [value, value ? facetLabel(context.locale, "disciplineFamily", value) : null];
    },
  },
  {
    field: "system.geographicScope",
    label: "search.field.geographicScope",
    weight: 58,
    getValues: (entity, graph, context) => {
      const value = graph.nodeById[entity.id]?.properties.geographicScope;
      return [value, value ? facetLabel(context.locale, "geographicScope", value) : null];
    },
  },
  {
    field: "system.shortDescription",
    label: "search.field.summary",
    weight: 48,
    getValues: (_entity, _graph, _context, localization) => [localization.summary],
  },
  {
    field: "system.longDescription",
    label: "search.field.description",
    weight: 24,
    getValues: (_entity, _graph, _context, localization) => [localization.description],
  },
  {
    field: "data.descriptors.type",
    label: "search.field.dataType",
    weight: 74,
    getValues: (entity, graph, context, localization) =>
      descriptorValues(graph.nodeById[entity.id], localization, "type", context.locale),
  },
  {
    field: "data.descriptors.format",
    label: "search.field.dataFormat",
    weight: 72,
    getValues: (entity, graph, context, localization) =>
      descriptorValues(graph.nodeById[entity.id], localization, "format", context.locale),
  },
  {
    field: "data.descriptors.standard",
    label: "search.field.dataStandard",
    weight: 68,
    getValues: (entity, graph, context, localization) =>
      descriptorValues(graph.nodeById[entity.id], localization, "standard", context.locale),
  },
  {
    field: "data.metrics",
    label: "search.field.metric",
    weight: 55,
    getValues: (entity, graph, context) => {
      const system = graph.nodeById[entity.id];
      return [
        system?.properties.data?.recordCount,
        system?.properties.data?.storageSize,
        ...(system?.properties.usage ?? []),
      ].flatMap((metric) =>
        metric
          ? [
              metric.key,
              facetLabel(context.locale, "metricKey", metric.key),
              String(metric.value),
              metric.unit,
              facetLabel(context.locale, "unit", metric.unit),
            ]
          : [],
      );
    },
  },
  {
    field: "access.type",
    label: "search.field.accessType",
    weight: 62,
    getValues: (entity, graph, context, localization) => {
      const system = graph.nodeById[entity.id];
      return systemAccessPaths(system, localization).flatMap((path) => [
        path.type,
        facetLabel(context.locale, "accessType", path.type),
      ]);
    },
  },
  {
    field: "access.method",
    label: "search.field.accessMethod",
    weight: 64,
    getValues: (entity, graph, context, localization) => {
      const system = graph.nodeById[entity.id];
      return systemAccessPaths(system, localization).flatMap((path) => [
        path.method,
        facetLabel(context.locale, "accessMethod", path.method),
        path.label,
      ]);
    },
  },
  {
    field: "access.detail",
    label: "search.field.accessDetail",
    weight: 36,
    getValues: (entity, graph, _context, localization) => {
      const system = graph.nodeById[entity.id];
      return systemAccessPaths(system, localization).flatMap((path) => [
        path.description,
        path.url,
        path.source.title,
      ]);
    },
  },
  {
    field: "relationships.connectedNames",
    label: "search.field.connectedNode",
    weight: 32,
    getValues: (entity, _graph, context) =>
      context.systemRecordById[entity.id]?.connectedNames ?? [],
  },
  {
    field: "relationships.type",
    label: "search.field.relationship",
    weight: 35,
    getValues: (entity, graph, context) =>
      getRelationships(entity.id, graph).flatMap((relationship) => [
        relationship.kind,
        facetLabel(context.locale, "edgeKind", relationship.kind),
      ]),
  },
  {
    field: "relationships.note",
    label: "search.field.relationshipNote",
    weight: 20,
    getValues: (entity, graph) =>
      getRelationships(entity.id, graph).map((relationship) => relationship.note),
  },
  {
    field: "sources",
    label: "search.field.source",
    weight: 18,
    getValues: (entity, graph, context) => {
      const system = graph.nodeById[entity.id];
      return system
        ? sourceRefs(system).flatMap((source) => sourceValues(source, graph, context.locale))
        : [];
    },
  },
  {
    field: "gallery",
    label: "search.field.gallery",
    weight: 28,
    getValues: (entity, graph, _context, localization) => {
      const system = graph.nodeById[entity.id];
      return systemGallery(system, localization).flatMap((item) => [
        item.title,
        item.caption,
        item.source.title,
      ]);
    },
  },
  {
    field: "ryu.routes",
    label: "search.field.agentRoute",
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

function scoreTokenAgainstValue(
  token: string,
  value: string,
  locale: SupportedLocale,
): number | null {
  const normalizedValue = normalizeSearchValue(value);
  const words = tokenize(value, locale);

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
  localization: ResolvedNodeLocalization,
): EntitySearchResult | null {
  const bestReasonByToken = new Map<string, SearchMatchReason>();

  for (const definition of searchFieldDefinitionsByKind[entity.kind]) {
    for (const value of collectText(definition.getValues(entity, graph, context, localization))) {
      for (const token of tokens) {
        const tokenScore = scoreTokenAgainstValue(token, value, context.locale);
        if (tokenScore == null) {
          continue;
        }

        const score = definition.weight * tokenScore;
        const currentBestReason = bestReasonByToken.get(token);
        if (!currentBestReason || score > currentBestReason.score) {
          bestReasonByToken.set(token, {
            field: definition.field,
            label: t(context.locale, definition.label),
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
    displayLocale: localization.displayLocale,
    matchedLocale: localization.displayLocale,
    isLocaleFallback: localization.isLocaleFallback,
    reasons: uniqueReasons(tokenReasons).slice(0, 4),
  };
}

function localizationCandidates(
  entity: GraphNode,
  locale: SupportedLocale,
  searchAllLanguages: boolean,
): ResolvedNodeLocalization[] {
  if (!searchAllLanguages) {
    return [resolveNodeDisplay(entity, locale)];
  }

  const localizations = Object.values(entity.localizations).filter(Boolean);
  if (localizations.length === 0) {
    return [resolveNodeDisplay(entity, locale)];
  }

  return localizations.map((localization) => ({
    requestedLocale: locale,
    displayLocale: localization.locale,
    isLocaleFallback: localization.locale !== locale,
    hasLocalization: true,
    title: localization.title,
    summary: localization.summary,
    description: localization.description,
    details: localization.details,
    sourceExcerpt: localization.sourceExcerpt,
    translatedFromLocale: localization.translatedFromLocale,
    contentUpdatedAt: localization.contentUpdatedAt,
    reviewState: localization.reviewState,
    reviewerNote: localization.reviewerNote,
    reviewer: localization.reviewer,
    lastReviewed: localization.lastReviewed,
    createdAt: localization.createdAt,
    updatedAt: localization.updatedAt,
  }));
}

function scoreEntityCandidates(
  entity: GraphNode,
  graph: IndexedGraph,
  context: SearchContext,
  tokens: string[],
  searchAllLanguages: boolean,
): EntitySearchResult | null {
  return localizationCandidates(entity, context.locale, searchAllLanguages)
    .flatMap((localization) => {
      const result = scoreEntity(entity, graph, context, tokens, localization);
      return result ? [result] : [];
    })
    .sort((left, right) => right.score - left.score)[0] ?? null;
}

function matchesSelected(values: string[], selected: string[]): boolean {
  return selected.length === 0 || selected.includes(values[0] ?? "");
}

function matchesAny(values: string[], selected: string[]): boolean {
  return selected.length === 0 || values.some((value) => selected.includes(value));
}

function matchesLocalizationCoverage(
  record: SystemSearchRecord,
  selected: LocalizationCoverageFilter[],
): boolean {
  return selected.length === 0 || selected.some((value) => (
    value === "current_locale"
      ? record.hasCurrentLocale
      : !record.hasCurrentLocale
  ));
}

function matchesReviewState(
  record: SystemSearchRecord,
  selected: ReviewState[],
): boolean {
  return (
    selected.length === 0 ||
    (record.currentLocaleReviewState != null &&
      selected.includes(record.currentLocaleReviewState))
  );
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
    matchesLocalizationCoverage(record, filters.localizationCoverage) &&
    matchesReviewState(record, filters.reviewState) &&
    claimFilterKeys.every((key) =>
      matchesAny(claimList(record, key), filters.dataClaims[key]),
    )
  );
}

export function getSystemFilterOptions(
  records: SystemSearchRecord[],
  locale: SupportedLocale,
) {
  return {
    role: selectOptions(records.map((record) => record.role), locale, "systemRole"),
    countryCode: selectOptions(records.map((record) => record.countryCode), locale),
    disciplineFamily: selectOptions(
      records.map((record) => record.disciplineFamily),
      locale,
      "disciplineFamily",
    ),
    dataClaims: {
      type: selectOptions(records.flatMap((record) => record.dataTypes), locale, "descriptorLabel"),
      format: selectOptions(records.flatMap((record) => record.dataFormats), locale, "descriptorLabel"),
      standard: selectOptions(records.flatMap((record) => record.dataStandards), locale, "descriptorLabel"),
    },
    accessTypes: selectOptions(records.flatMap((record) => record.accessTypes), locale, "accessType"),
    accessMethods: selectOptions(records.flatMap((record) => record.accessMethods), locale, "accessMethod"),
  };
}

export function resolveGraphSearch(
  graph: IndexedGraph,
  intent: GraphSearchIntent,
  locale: SupportedLocale,
): ResolvedGraphSearch {
  const query = intent.query.trim();
  const tokens = tokenize(query, locale);
  const searchAllLanguages = intent.searchAllLanguages === true;
  const systemRecords = buildSystemRecords(graph, locale);
  const systemRecordById = Object.fromEntries(
    systemRecords.map((record) => [record.entity.id, record]),
  );
  const context = { systemRecordById, locale };
  const entityResults = tokens.length
    ? graph.nodes
        .flatMap((entity) => {
          const result = scoreEntityCandidates(
            entity,
            graph,
            context,
            tokens,
            searchAllLanguages,
          );
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
      return left.title.localeCompare(right.title);
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
