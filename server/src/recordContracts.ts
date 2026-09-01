import crypto from "node:crypto";

import type {
  GraphEdge,
  GraphNode,
  NodeLocalization,
  NodeLocalizationDetails,
  NodeLocalizationReviewInput,
  ReviewState,
  RyuRoute,
  Source,
  SupportedLocale,
} from "../../shared/domain";
import {
  defaultLocale,
  isSupportedLocale,
  resolveNodeLocalization,
  supportedLocales,
} from "../../shared/localization";
import type {
  AdminRecordLocalizationDto,
  AdminRouteDto,
  BulkRecordValidationInput,
  BulkRecordValidationResult,
  LocaleAvailability,
  LocaleMode,
  LocalizationContentInput,
  LocalizationPatchInput,
  PrivateRouteDto,
  PublicRecordLocalizationDto,
  PublicRouteDto,
  PublicSourceDto,
  RecordAggregate,
  RecordAggregateContentInput,
  RecordDeleteImpact,
  RecordDetailDto,
  RecordDtoScope,
  RecordEdgeInput,
  RecordInclude,
  RecordListDto,
  RecordNeutralContentInput,
  RecordNeutralPatchInput,
  RecordPatchInput,
  RecordReviewInput,
  RecordRouteInput,
  RecordSearchCursor,
  RecordSearchQuery,
  RecordSummaryDto,
  RecordValidationIssue,
  RecordValidationResult,
  ReviewLocaleMode,
} from "../../shared/recordApi";
import {
  isEdgeKind,
  isNodeKind,
  isRecord,
  isRecordDepth,
  isReviewState,
  normalizeString,
} from "./graphRepositorySupport";

const defaultRecordLimit = 50;
const maxRecordLimit = 100;

const queryFields = new Set([
  "q",
  "kind",
  "geography",
  "dataType",
  "recordDepth",
  "reviewState",
  "locale",
  "localeMode",
  "localeAvailability",
  "reviewLocale",
  "routeStatus",
  "routeCapability",
  "accessType",
  "accessMethod",
  "include",
  "limit",
  "cursor",
]);
const recordIncludes = new Set<RecordInclude>([
  "localizationSummary",
  "localizations",
  "edges",
  "sources",
  "routes",
  "matchReasons",
]);
const localeModes = new Set<LocaleMode>([
  "locale_only",
  "locale_with_fallbacks",
  "display_locale",
  "all_locales",
]);
const localeAvailabilityValues = new Set<LocaleAvailability>([
  "available",
  "missing",
  "partial",
  "complete",
]);
const reviewLocaleModes = new Set<ReviewLocaleMode>(["requested", "displayed", "any"]);
const reviewAuditFields = new Set([
  "reviewState",
  "reviewerNote",
  "reviewer",
  "lastReviewed",
  "contentUpdatedAt",
  "createdAt",
  "updatedAt",
]);

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = message,
  ) {
    super(message);
  }
}

export function encodeRecordCursor(cursor: RecordSearchCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeRecordCursor(value: string): RecordSearchCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (
      isRecord(parsed) &&
      typeof parsed.title === "string" &&
      typeof parsed.id === "string"
    ) {
      return { title: parsed.title, id: parsed.id };
    }
  } catch {
    // handled below
  }

  throw new ApiRequestError(400, "invalid cursor");
}

export function hashJson(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 24);
}

export function readValidateOnly(value: unknown): boolean {
  if (value === undefined) {
    return false;
  }
  if (value === "true" || value === true) {
    return true;
  }
  if (value === "false" || value === false) {
    return false;
  }

  throw new ApiRequestError(400, "validateOnly must be true or false");
}

export function readRecordSearchQuery(input: Record<string, unknown>): RecordSearchQuery {
  assertAllowedFields(input, queryFields, "query");

  const locale = readOptionalEnum(input.locale, isSupportedLocale, "locale") ?? defaultLocale;
  const localeMode =
    readOptionalSetValue(input.localeMode, localeModes, "localeMode") ?? "display_locale";
  const localeAvailability = readOptionalSetValue(
    input.localeAvailability,
    localeAvailabilityValues,
    "localeAvailability",
  );
  const reviewLocale =
    readOptionalSetValue(input.reviewLocale, reviewLocaleModes, "reviewLocale") ?? "displayed";
  const cursorValue = readOptionalString(input.cursor, "cursor");

  return {
    q: readOptionalString(input.q, "q") ?? undefined,
    kind: readList(input.kind, "kind").map((value) =>
      readEnumValue(value, isNodeKind, "kind"),
    ),
    geography: readList(input.geography, "geography"),
    dataType: readList(input.dataType, "dataType"),
    recordDepth: readList(input.recordDepth, "recordDepth").map((value) =>
      readEnumValue(value, isRecordDepth, "recordDepth"),
    ),
    reviewState: readList(input.reviewState, "reviewState").map((value) =>
      readEnumValue(value, isReviewState, "reviewState"),
    ),
    locale,
    localeMode,
    localeAvailability,
    reviewLocale,
    routeStatus: readList(input.routeStatus, "routeStatus"),
    routeCapability: readList(input.routeCapability, "routeCapability"),
    accessType: readList(input.accessType, "accessType"),
    accessMethod: readList(input.accessMethod, "accessMethod"),
    include: readList(input.include, "include").map((value) =>
      readSetValue(value, recordIncludes, "include"),
    ),
    limit: readLimit(input.limit),
    cursor: cursorValue ? decodeRecordCursor(cursorValue) : undefined,
  };
}

export function readRecordReviewInput(input: unknown): RecordReviewInput {
  const body = readObject(input, "body");
  assertAllowedFields(body, new Set(["locale", "reviewState", "reviewerNote"]), "body");

  const hasReviewState = hasOwn(body, "reviewState");
  const hasReviewerNote = hasOwn(body, "reviewerNote");
  if (!hasReviewState && !hasReviewerNote) {
    throw new ApiRequestError(400, "reviewState or reviewerNote is required");
  }

  return {
    locale: readRequiredEnum(body.locale, isSupportedLocale, "locale"),
    ...(hasReviewState
      ? { reviewState: readRequiredEnum(body.reviewState, isReviewState, "reviewState") }
      : {}),
    ...(hasReviewerNote
      ? { reviewerNote: readNullableString(body.reviewerNote, "reviewerNote") }
      : {}),
  };
}

export function toNodeLocalizationReviewInput(
  input: RecordReviewInput | Omit<RecordReviewInput, "locale">,
): NodeLocalizationReviewInput {
  return {
    ...(hasOwn(input, "reviewState") ? { reviewState: input.reviewState as ReviewState } : {}),
    ...(hasOwn(input, "reviewerNote") ? { reviewerNote: input.reviewerNote ?? null } : {}),
  };
}

export function readRecordAggregateContentInput(
  recordId: string,
  input: unknown,
): RecordAggregateContentInput {
  const body = readObject(input, "body");
  assertAllowedFields(
    body,
    new Set(["id", "record", "localizations", "edges", "sources", "routes", "incomplete"]),
    "body",
  );
  if (hasOwn(body, "id") && readRequiredString(body.id, "id") !== recordId) {
    throw new ApiRequestError(400, "body id must match path id");
  }

  const record = readRecordNeutralContentInput(body.record, "record");
  const localizations = hasOwn(body, "localizations")
    ? readLocalizationContentMap(body.localizations, "localizations")
    : undefined;
  const incomplete = hasOwn(body, "incomplete")
    ? readRequiredBoolean(body.incomplete, "incomplete")
    : undefined;

  if (
    record.recordDepth === "rich" &&
    incomplete !== true &&
    supportedLocales.some((locale) => !localizations?.[locale])
  ) {
    throw new ApiRequestError(
      400,
      "rich records require all supported localizations unless incomplete is true",
    );
  }

  return {
    ...(hasOwn(body, "id") ? { id: recordId } : {}),
    record,
    ...(localizations ? { localizations } : {}),
    ...(hasOwn(body, "edges") ? { edges: readEdgeInputs(body.edges, recordId, "edges") } : {}),
    ...(hasOwn(body, "sources") ? { sources: readSourceSection(body.sources, "sources") } : {}),
    ...(hasOwn(body, "routes") ? { routes: readRouteInputs(body.routes, recordId, "routes") } : {}),
    ...(hasOwn(body, "incomplete") ? { incomplete } : {}),
  };
}

export function readRecordPatchInput(recordId: string, input: unknown): RecordPatchInput {
  const body = readObject(input, "body");
  assertAllowedFields(body, new Set(["record", "localizations", "edges", "sources", "routes"]), "body");

  if (Object.keys(body).length === 0) {
    throw new ApiRequestError(400, "patch body must include at least one section");
  }

  return {
    ...(hasOwn(body, "record") ? { record: readRecordNeutralPatchInput(body.record, "record") } : {}),
    ...(hasOwn(body, "localizations")
      ? { localizations: readLocalizationPatchMap(body.localizations, "localizations") }
      : {}),
    ...(hasOwn(body, "edges") ? { edges: readEdgePatchSection(body.edges, recordId, "edges") } : {}),
    ...(hasOwn(body, "sources") ? { sources: readSourceSection(body.sources, "sources") } : {}),
    ...(hasOwn(body, "routes")
      ? { routes: readRoutePatchSection(body.routes, recordId, "routes") }
      : {}),
  };
}

export function readBulkRecordValidationInput(input: unknown): BulkRecordValidationInput {
  const body = readObject(input, "body");
  assertAllowedFields(body, new Set(["validateOnly", "records"]), "body");
  if (body.validateOnly !== true) {
    throw new ApiRequestError(400, "bulk records only supports validateOnly=true");
  }
  if (!Array.isArray(body.records)) {
    throw new ApiRequestError(400, "records must be an array");
  }

  const issues: RecordValidationIssue[] = [];
  const records = body.records.flatMap((record, index) => {
    const id = isRecord(record) && typeof record.id === "string" ? record.id : undefined;
    try {
      if (!id) {
        throw new ApiRequestError(400, "record id is required");
      }
      return [readRecordAggregateContentInput(id, record)];
    } catch (error) {
      issues.push({
        index,
        recordId: id,
        message: error instanceof Error ? error.message : "invalid record",
      });
      return [];
    }
  });

  if (issues.length > 0) {
    throw new ApiRequestError(400, "invalid bulk records", "invalid_bulk_records");
  }

  return {
    validateOnly: true,
    records,
  };
}

export function validateRecordAggregateContentInput(
  recordId: string,
  input: unknown,
): RecordValidationResult {
  try {
    readRecordAggregateContentInput(recordId, input);
    return { valid: true, recordId, issues: [] };
  } catch (error) {
    return {
      valid: false,
      recordId,
      issues: [{ recordId, message: error instanceof Error ? error.message : "invalid record" }],
    };
  }
}

export function validateBulkRecordPayload(input: BulkRecordValidationInput): BulkRecordValidationResult {
  return {
    valid: true,
    issues: [],
    checkedRecords: input.records.length,
  };
}

export function toRecordListDto(
  records: RecordAggregate[],
  nextCursor: string | null,
  scope: RecordDtoScope,
  include: RecordInclude[],
  locale: SupportedLocale,
): RecordListDto {
  const expanded = include.some((item) =>
    item === "localizations" ||
    item === "edges" ||
    item === "sources" ||
    item === "routes",
  );

  return {
    records: records.map((record) =>
      expanded
        ? toRecordDetailDto(record, scope, include, locale)
        : toRecordSummaryDto(record, include, locale),
    ),
    nextCursor,
  };
}

export function toRecordDetailDto(
  aggregate: RecordAggregate,
  scope: RecordDtoScope,
  include: RecordInclude[],
  locale: SupportedLocale,
): RecordDetailDto {
  const node = aggregate.node;
  const includeSet = new Set(include);

  return {
    ...toRecordSummaryDto(aggregate, include, locale),
    record: {
      id: node.id,
      kind: node.kind,
      countryCode: node.countryCode,
      subtype: node.subtype,
      url: node.url,
      recordDepth: node.recordDepth,
      ...(scope === "private" ? { properties: node.properties } : {}),
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
    },
    ...(includeSet.has("localizations")
      ? { localizations: mapLocalizations(node.localizations, scope) }
      : {}),
    ...(includeSet.has("edges") ? { edges: aggregate.edges.map(mapEdgeDto) } : {}),
    ...(includeSet.has("sources")
      ? { sources: aggregate.sources.map((source) => mapSourceDto(source, scope)) }
      : {}),
    ...(includeSet.has("routes")
      ? { routes: aggregate.routes.map((route) => mapRouteDto(route, scope)) }
      : {}),
  };
}

export function toDefaultRecordDetailDto(
  aggregate: RecordAggregate,
  scope: RecordDtoScope,
  include: RecordInclude[],
  locale: SupportedLocale,
): RecordDetailDto {
  const defaultIncludes: RecordInclude[] = ["localizations", "edges", "sources", "routes"];
  return toRecordDetailDto(
    aggregate,
    scope,
    [...new Set([...defaultIncludes, ...include])],
    locale,
  );
}

export function toRecordSummaryDto(
  aggregate: RecordAggregate,
  include: RecordInclude[],
  locale: SupportedLocale,
): RecordSummaryDto {
  const node = aggregate.node;
  const localization = resolveNodeLocalization(node, locale);
  const reviewStatesByLocale = Object.fromEntries(
    Object.entries(node.localizations).map(([key, value]) => [
      key,
      value?.reviewState,
    ]),
  ) as RecordSummaryDto["reviewStatesByLocale"];

  return {
    id: node.id,
    kind: node.kind,
    countryCode: node.countryCode,
    subtype: node.subtype,
    url: node.url,
    recordDepth: node.recordDepth,
    title: localization.title,
    summary: localization.summary,
    availableLocales: node.availableLocales,
    missingLocales: supportedLocales.filter((candidate) => !node.availableLocales.includes(candidate)),
    reviewStatesByLocale,
    requestedLocale: localization.requestedLocale,
    displayLocale: localization.displayLocale,
    isLocaleFallback: localization.isLocaleFallback,
    updatedAt: node.updatedAt,
    ...(include.includes("matchReasons") ? { matchReasons: aggregate.matchReasons } : {}),
  };
}

export function buildDeleteImpactHash(input: Omit<RecordDeleteImpact, "impactHash">): string {
  return hashJson(input);
}

function mapLocalizations(
  localizations: GraphNode["localizations"],
  scope: RecordDtoScope,
): RecordDetailDto["localizations"] {
  return Object.fromEntries(
    Object.entries(localizations).map(([locale, localization]) => [
      locale,
      localization ? mapLocalizationDto(localization, scope) : localization,
    ]),
  ) as RecordDetailDto["localizations"];
}

function mapLocalizationDto(
  localization: NodeLocalization,
  scope: RecordDtoScope,
): PublicRecordLocalizationDto | AdminRecordLocalizationDto | NodeLocalization {
  if (scope === "private") {
    return localization;
  }

  const publicDto: PublicRecordLocalizationDto = {
    locale: localization.locale,
    title: localization.title,
    summary: localization.summary,
    description: localization.description,
    details: localization.details,
    sourceExcerpt: localization.sourceExcerpt,
    translatedFromLocale: localization.translatedFromLocale,
    contentUpdatedAt: localization.contentUpdatedAt,
    reviewState: localization.reviewState,
    createdAt: localization.createdAt,
    updatedAt: localization.updatedAt,
  };

  if (scope === "public") {
    return publicDto;
  }

  return {
    ...publicDto,
    reviewerNote: localization.reviewerNote,
    reviewer: localization.reviewer,
    lastReviewed: localization.lastReviewed,
  };
}

function mapSourceDto(source: Source, scope: RecordDtoScope): Source | PublicSourceDto {
  if (scope === "private") {
    return source;
  }

  const { localPath: _localPath, ...publicSource } = source;
  return publicSource;
}

function mapRouteDto(route: RyuRoute, scope: RecordDtoScope): PublicRouteDto | AdminRouteDto | PrivateRouteDto {
  if (scope === "private") {
    return route;
  }

  const publicRoute: PublicRouteDto = {
    id: route.id,
    nodeId: route.nodeId,
    status: route.status,
    mode: route.mode,
    priority: route.priority,
    capabilities: route.capabilities,
    format: route.format,
    contractRef: route.contractRef,
    caveat: route.caveat,
    createdAt: route.createdAt,
    updatedAt: route.updatedAt,
  };

  if (scope === "public") {
    return publicRoute;
  }

  return {
    ...publicRoute,
    target: route.target,
    upstream: route.upstream,
  };
}

function mapEdgeDto(edge: GraphEdge): GraphEdge {
  return {
    id: edge.id,
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    kind: edge.kind,
    note: edge.note,
    properties: edge.properties,
    createdAt: edge.createdAt,
    updatedAt: edge.updatedAt,
  };
}

function readRecordNeutralContentInput(input: unknown, path: string): RecordNeutralContentInput {
  const body = readObject(input, path);
  assertAllowedFields(body, new Set(["kind", "countryCode", "subtype", "url", "recordDepth", "properties"]), path);

  return {
    kind: readRequiredEnum(body.kind, isNodeKind, `${path}.kind`),
    countryCode: hasOwn(body, "countryCode") ? readNullableCountryCode(body.countryCode, `${path}.countryCode`) : undefined,
    subtype: hasOwn(body, "subtype") ? readNullableString(body.subtype, `${path}.subtype`) : undefined,
    url: hasOwn(body, "url") ? readNullableString(body.url, `${path}.url`) : undefined,
    recordDepth: hasOwn(body, "recordDepth")
      ? readRequiredEnum(body.recordDepth, isRecordDepth, `${path}.recordDepth`)
      : undefined,
    properties: hasOwn(body, "properties") ? readJsonObject(body.properties, `${path}.properties`) : undefined,
  };
}

function readRecordNeutralPatchInput(input: unknown, path: string): RecordNeutralPatchInput {
  const body = readObject(input, path);
  assertAllowedFields(
    body,
    new Set(["kind", "countryCode", "subtype", "url", "recordDepth", "propertiesReplace"]),
    path,
  );
  if (Object.keys(body).length === 0) {
    throw new ApiRequestError(400, `${path} must include at least one field`);
  }

  return {
    kind: hasOwn(body, "kind") ? readRequiredEnum(body.kind, isNodeKind, `${path}.kind`) : undefined,
    countryCode: hasOwn(body, "countryCode") ? readNullableCountryCode(body.countryCode, `${path}.countryCode`) : undefined,
    subtype: hasOwn(body, "subtype") ? readNullableString(body.subtype, `${path}.subtype`) : undefined,
    url: hasOwn(body, "url") ? readNullableString(body.url, `${path}.url`) : undefined,
    recordDepth: hasOwn(body, "recordDepth")
      ? readRequiredEnum(body.recordDepth, isRecordDepth, `${path}.recordDepth`)
      : undefined,
    propertiesReplace: hasOwn(body, "propertiesReplace")
      ? readJsonObject(body.propertiesReplace, `${path}.propertiesReplace`)
      : undefined,
  };
}

function readLocalizationContentMap(input: unknown, path: string): RecordAggregateContentInput["localizations"] {
  const body = readObject(input, path);
  const localizations: RecordAggregateContentInput["localizations"] = {};
  for (const [locale, value] of Object.entries(body)) {
    if (!isSupportedLocale(locale)) {
      throw new ApiRequestError(400, `unsupported locale: ${locale}`);
    }
    localizations[locale] = readLocalizationContentInput(value, `${path}.${locale}`);
  }

  return localizations;
}

function readLocalizationPatchMap(input: unknown, path: string): RecordPatchInput["localizations"] {
  const body = readObject(input, path);
  const localizations: RecordPatchInput["localizations"] = {};
  for (const [locale, value] of Object.entries(body)) {
    if (!isSupportedLocale(locale)) {
      throw new ApiRequestError(400, `unsupported locale: ${locale}`);
    }
    localizations[locale] = readLocalizationPatchInput(value, `${path}.${locale}`);
  }

  return localizations;
}

function readLocalizationContentInput(input: unknown, path: string): LocalizationContentInput {
  const body = readObject(input, path);
  assertNoReviewAuditFields(body, path);
  assertAllowedFields(
    body,
    new Set(["title", "summary", "description", "details", "sourceExcerpt", "translatedFromLocale"]),
    path,
  );

  return {
    title: readRequiredString(body.title, `${path}.title`),
    summary: hasOwn(body, "summary") ? readNullableString(body.summary, `${path}.summary`) : undefined,
    description: hasOwn(body, "description")
      ? readNullableString(body.description, `${path}.description`)
      : undefined,
    details: hasOwn(body, "details")
      ? readJsonObject(body.details, `${path}.details`) as NodeLocalizationDetails
      : undefined,
    sourceExcerpt: hasOwn(body, "sourceExcerpt")
      ? readNullableString(body.sourceExcerpt, `${path}.sourceExcerpt`)
      : undefined,
    translatedFromLocale: hasOwn(body, "translatedFromLocale")
      ? readOptionalEnum(body.translatedFromLocale, isSupportedLocale, `${path}.translatedFromLocale`) ?? null
      : undefined,
  };
}

function readLocalizationPatchInput(input: unknown, path: string): LocalizationPatchInput {
  const body = readObject(input, path);
  assertNoReviewAuditFields(body, path);
  const mode = readRequiredSetValue(
    body.mode,
    new Set<"patch" | "replace">(["patch", "replace"]),
    `${path}.mode`,
  );
  if (mode === "replace") {
    assertAllowedFields(
      body,
      new Set(["mode", "title", "summary", "description", "details", "sourceExcerpt", "translatedFromLocale"]),
      path,
    );
    const content = readLocalizationContentInput(
      Object.fromEntries(Object.entries(body).filter(([key]) => key !== "mode")),
      path,
    );
    return { mode, ...content };
  }

  assertAllowedFields(
    body,
    new Set(["mode", "title", "summary", "description", "detailsReplace", "sourceExcerpt", "translatedFromLocale"]),
    path,
  );
  if (Object.keys(body).length === 1) {
    throw new ApiRequestError(400, `${path} must include at least one content field`);
  }

  return {
    mode,
    title: hasOwn(body, "title") ? readRequiredString(body.title, `${path}.title`) : undefined,
    summary: hasOwn(body, "summary") ? readNullableString(body.summary, `${path}.summary`) : undefined,
    description: hasOwn(body, "description")
      ? readNullableString(body.description, `${path}.description`)
      : undefined,
    detailsReplace: hasOwn(body, "detailsReplace")
      ? readJsonObject(body.detailsReplace, `${path}.detailsReplace`) as NodeLocalizationDetails
      : undefined,
    sourceExcerpt: hasOwn(body, "sourceExcerpt")
      ? readNullableString(body.sourceExcerpt, `${path}.sourceExcerpt`)
      : undefined,
    translatedFromLocale: hasOwn(body, "translatedFromLocale")
      ? readOptionalEnum(body.translatedFromLocale, isSupportedLocale, `${path}.translatedFromLocale`) ?? null
      : undefined,
  };
}

function readEdgePatchSection(input: unknown, recordId: string, path: string): NonNullable<RecordPatchInput["edges"]> {
  const body = readObject(input, path);
  assertAllowedFields(body, new Set(["upsert", "delete"]), path);
  return {
    upsert: hasOwn(body, "upsert") ? readEdgeInputs(body.upsert, recordId, `${path}.upsert`) : undefined,
    delete: hasOwn(body, "delete") ? readIdList(body.delete, `${path}.delete`) : undefined,
  };
}

function readSourceSection(input: unknown, path: string): NonNullable<RecordPatchInput["sources"]> {
  const body = readObject(input, path);
  assertAllowedFields(body, new Set(["upsert"]), path);
  return {
    upsert: hasOwn(body, "upsert") ? readSourceInputs(body.upsert, `${path}.upsert`) : undefined,
  };
}

function readRoutePatchSection(input: unknown, recordId: string, path: string): NonNullable<RecordPatchInput["routes"]> {
  const body = readObject(input, path);
  assertAllowedFields(body, new Set(["upsert", "delete"]), path);
  return {
    upsert: hasOwn(body, "upsert") ? readRouteInputs(body.upsert, recordId, `${path}.upsert`) : undefined,
    delete: hasOwn(body, "delete") ? readIdList(body.delete, `${path}.delete`) : undefined,
  };
}

function readEdgeInputs(input: unknown, recordId: string, path: string): RecordEdgeInput[] {
  if (!Array.isArray(input)) {
    throw new ApiRequestError(400, `${path} must be an array`);
  }

  return input.map((item, index) => readEdgeInput(item, recordId, `${path}[${index}]`));
}

function readEdgeInput(input: unknown, recordId: string, path: string): RecordEdgeInput {
  const body = readObject(input, path);
  assertAllowedFields(body, new Set(["id", "sourceNodeId", "targetNodeId", "kind", "note", "properties"]), path);
  const edge = {
    id: readRequiredId(body.id, `${path}.id`),
    sourceNodeId: readRequiredId(body.sourceNodeId, `${path}.sourceNodeId`),
    targetNodeId: readRequiredId(body.targetNodeId, `${path}.targetNodeId`),
    kind: readRequiredEnum(body.kind, isEdgeKind, `${path}.kind`),
    note: hasOwn(body, "note") ? readNullableString(body.note, `${path}.note`) : undefined,
    properties: hasOwn(body, "properties") ? readJsonObject(body.properties, `${path}.properties`) : undefined,
  };

  if (edge.sourceNodeId !== recordId && edge.targetNodeId !== recordId) {
    throw new ApiRequestError(400, `${path} must be incident to ${recordId}`);
  }

  return edge;
}

function readSourceInputs(input: unknown, path: string) {
  if (!Array.isArray(input)) {
    throw new ApiRequestError(400, `${path} must be an array`);
  }

  return input.map((item, index) => {
    const body = readObject(item, `${path}[${index}]`);
    assertAllowedFields(
      body,
      new Set(["id", "title", "sourceType", "url", "localPath", "publisher", "publishedAt", "accessedAt", "note"]),
      `${path}[${index}]`,
    );
    return {
      id: readRequiredId(body.id, `${path}[${index}].id`),
      title: readRequiredString(body.title, `${path}[${index}].title`),
      sourceType: readRequiredString(body.sourceType, `${path}[${index}].sourceType`),
      url: readNullableString(body.url, `${path}[${index}].url`),
      localPath: readNullableString(body.localPath, `${path}[${index}].localPath`),
      publisher: readNullableString(body.publisher, `${path}[${index}].publisher`),
      publishedAt: readNullableString(body.publishedAt, `${path}[${index}].publishedAt`),
      accessedAt: readNullableString(body.accessedAt, `${path}[${index}].accessedAt`),
      note: readNullableString(body.note, `${path}[${index}].note`),
    };
  });
}

function readRouteInputs(input: unknown, recordId: string, path: string): RecordRouteInput[] {
  if (!Array.isArray(input)) {
    throw new ApiRequestError(400, `${path} must be an array`);
  }

  return input.map((item, index) => {
    const body = readObject(item, `${path}[${index}]`);
    assertAllowedFields(
      body,
      new Set([
        "id",
        "nodeId",
        "status",
        "mode",
        "priority",
        "capabilities",
        "target",
        "upstream",
        "format",
        "contractRef",
        "caveat",
        "properties",
      ]),
      `${path}[${index}]`,
    );
    const nodeId = hasOwn(body, "nodeId")
      ? readRequiredId(body.nodeId, `${path}[${index}].nodeId`)
      : recordId;
    if (nodeId !== recordId) {
      throw new ApiRequestError(400, `${path}[${index}].nodeId must match path id`);
    }

    return {
      id: readRequiredId(body.id, `${path}[${index}].id`),
      nodeId,
      status: readRequiredString(body.status, `${path}[${index}].status`),
      mode: readRequiredString(body.mode, `${path}[${index}].mode`),
      priority: hasOwn(body, "priority")
        ? readRequiredInteger(body.priority, `${path}[${index}].priority`)
        : undefined,
      capabilities: hasOwn(body, "capabilities")
        ? readStringArray(body.capabilities, `${path}[${index}].capabilities`)
        : undefined,
      target: hasOwn(body, "target") ? readNullableString(body.target, `${path}[${index}].target`) : undefined,
      upstream: hasOwn(body, "upstream")
        ? readNullableString(body.upstream, `${path}[${index}].upstream`)
        : undefined,
      format: hasOwn(body, "format") ? readNullableString(body.format, `${path}[${index}].format`) : undefined,
      contractRef: hasOwn(body, "contractRef")
        ? readNullableString(body.contractRef, `${path}[${index}].contractRef`)
        : undefined,
      caveat: hasOwn(body, "caveat") ? readNullableString(body.caveat, `${path}[${index}].caveat`) : undefined,
      properties: hasOwn(body, "properties")
        ? readJsonObject(body.properties, `${path}[${index}].properties`)
        : undefined,
    };
  });
}

function readIdList(input: unknown, path: string): string[] {
  if (!Array.isArray(input)) {
    throw new ApiRequestError(400, `${path} must be an array`);
  }

  return input.map((item, index) => readRequiredId(item, `${path}[${index}]`));
}

function readObject(input: unknown, path: string): Record<string, unknown> {
  if (!isRecord(input)) {
    throw new ApiRequestError(400, `${path} must be an object`);
  }

  return input;
}

function assertAllowedFields(input: Record<string, unknown>, allowed: Set<string>, path: string) {
  const unsupported = Object.keys(input).filter((key) => !allowed.has(key));
  if (unsupported.length > 0) {
    throw new ApiRequestError(400, `unsupported ${path} fields: ${unsupported.join(", ")}`);
  }
}

function assertNoReviewAuditFields(input: Record<string, unknown>, path: string) {
  const unsupported = Object.keys(input).filter((key) => reviewAuditFields.has(key));
  if (unsupported.length > 0) {
    throw new ApiRequestError(400, `review/audit fields are not allowed in ${path}: ${unsupported.join(", ")}`);
  }
}

function hasOwn(input: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function readList(value: unknown, path: string): string[] {
  if (value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => readList(item, path));
  }
  if (typeof value !== "string") {
    throw new ApiRequestError(400, `${path} must be a string`);
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readLimit(value: unknown): number {
  if (value === undefined) {
    return defaultRecordLimit;
  }
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = typeof raw === "string" ? Number.parseInt(raw, 10) : raw;
  if (!Number.isInteger(parsed) || Number(parsed) <= 0) {
    throw new ApiRequestError(400, "limit must be a positive integer");
  }

  return Math.min(Number(parsed), maxRecordLimit);
}

function readOptionalString(value: unknown, path: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (Array.isArray(value)) {
    if (value.length !== 1) {
      throw new ApiRequestError(400, `${path} must be a single string`);
    }
    return readOptionalString(value[0], path);
  }
  if (typeof value !== "string") {
    throw new ApiRequestError(400, `${path} must be a string`);
  }

  return normalizeString(value);
}

function readRequiredString(value: unknown, path: string): string {
  const normalized = readOptionalString(value, path);
  if (!normalized) {
    throw new ApiRequestError(400, `${path} is required`);
  }

  return normalized;
}

function readNullableString(value: unknown, path: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return readRequiredString(value, path);
}

function readNullableCountryCode(value: unknown, path: string): string | null {
  const code = readNullableString(value, path);
  if (code !== null && code.length !== 3) {
    throw new ApiRequestError(400, `${path} must be a 3-character country code`);
  }

  return code;
}

function readRequiredId(value: unknown, path: string): string {
  const id = readRequiredString(value, path);
  if (!/^[a-z0-9][a-z0-9._:-]*$/.test(id)) {
    throw new ApiRequestError(400, `${path} must be a deterministic slug id`);
  }

  return id;
}

function readJsonObject(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ApiRequestError(400, `${path} must be a JSON object`);
  }

  return value;
}

function readStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) {
    throw new ApiRequestError(400, `${path} must be an array`);
  }

  return value.map((item, index) => readRequiredString(item, `${path}[${index}]`));
}

function readRequiredInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value)) {
    throw new ApiRequestError(400, `${path} must be an integer`);
  }

  return Number(value);
}

function readRequiredBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new ApiRequestError(400, `${path} must be a boolean`);
  }

  return value;
}

function readEnumValue<T extends string>(
  value: string,
  predicate: (value: unknown) => value is T,
  path: string,
): T {
  if (!predicate(value)) {
    throw new ApiRequestError(400, `invalid ${path}`);
  }

  return value;
}

function readRequiredEnum<T extends string>(
  value: unknown,
  predicate: (value: unknown) => value is T,
  path: string,
): T {
  if (!predicate(value)) {
    throw new ApiRequestError(400, `invalid ${path}`);
  }

  return value;
}

function readOptionalEnum<T extends string>(
  value: unknown,
  predicate: (value: unknown) => value is T,
  path: string,
): T | null {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = readRequiredString(value, path);
  return readRequiredEnum(normalized, predicate, path);
}

function readSetValue<T extends string>(value: string, allowed: Set<T>, path: string): T {
  if (!allowed.has(value as T)) {
    throw new ApiRequestError(400, `invalid ${path}`);
  }

  return value as T;
}

function readRequiredSetValue<T extends string>(
  value: unknown,
  allowed: Set<T>,
  path: string,
): T {
  const normalized = readRequiredString(value, path);
  return readSetValue(normalized, allowed, path);
}

function readOptionalSetValue<T extends string>(
  value: unknown,
  allowed: Set<T>,
  path: string,
): T | undefined {
  const normalized = readOptionalString(value, path);
  return normalized ? readSetValue(normalized, allowed, path) : undefined;
}
