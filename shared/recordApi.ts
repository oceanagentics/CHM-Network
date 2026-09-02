import type {
  GraphEdge,
  GraphEdgeKind,
  GraphNode,
  GraphNodeKind,
  NodeLocalization,
  NodeLocalizationDetails,
  NodeProperties,
  RecordDepth,
  ReviewState,
  RyuRoute,
  Source,
  SupportedLocale,
} from "./domain";

export type RecordDtoScope = "public" | "admin" | "private";

export type RecordInclude =
  | "localizationSummary"
  | "localizations"
  | "edges"
  | "sources"
  | "routes"
  | "matchReasons";

export type LocaleMode =
  | "locale_only"
  | "locale_with_fallbacks"
  | "display_locale"
  | "all_locales";

export type LocaleAvailability =
  | "available"
  | "missing"
  | "partial"
  | "complete";

export type ReviewLocaleMode = "requested" | "displayed" | "any";

export interface RecordSearchCursor {
  title: string;
  id: string;
}

export interface RecordSearchQuery {
  q?: string;
  kind: GraphNodeKind[];
  geography: string[];
  dataType: string[];
  recordDepth: RecordDepth[];
  reviewState: ReviewState[];
  locale: SupportedLocale;
  localeMode: LocaleMode;
  localeAvailability?: LocaleAvailability;
  reviewLocale: ReviewLocaleMode;
  routeStatus: string[];
  routeCapability: string[];
  accessType: string[];
  accessMethod: string[];
  include: RecordInclude[];
  limit: number;
  cursor?: RecordSearchCursor;
}

export interface RecordAggregate {
  node: GraphNode;
  edges: GraphEdge[];
  sources: Source[];
  routes: RyuRoute[];
  matchReasons: string[];
}

export interface RecordListResult {
  records: RecordAggregate[];
  nextCursor: string | null;
}

export interface RecordNeutralDto {
  id: string;
  kind: GraphNodeKind;
  countryCode: string | null;
  subtype: string | null;
  url: string | null;
  recordDepth: RecordDepth;
  properties?: NodeProperties | Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RecordSummaryDto {
  id: string;
  kind: GraphNodeKind;
  countryCode: string | null;
  subtype: string | null;
  url: string | null;
  recordDepth: RecordDepth;
  title: string;
  summary: string | null;
  availableLocales: SupportedLocale[];
  missingLocales: SupportedLocale[];
  reviewStatesByLocale: Partial<Record<SupportedLocale, ReviewState>>;
  requestedLocale: SupportedLocale;
  displayLocale: SupportedLocale | null;
  isLocaleFallback: boolean;
  updatedAt: string;
  recordUpdatedAt: string;
  matchReasons?: string[];
}

export interface PublicRecordLocalizationDto {
  locale: SupportedLocale;
  title: string;
  summary: string | null;
  description: string | null;
  details: NodeLocalizationDetails;
  sourceExcerpt: string | null;
  translatedFromLocale: SupportedLocale | null;
  contentUpdatedAt: string;
  reviewState: ReviewState;
  createdAt: string;
  updatedAt: string;
}

export interface AdminRecordLocalizationDto extends PublicRecordLocalizationDto {
  reviewerNote: string | null;
  reviewer: string | null;
  lastReviewed: string | null;
}

export type PrivateRecordLocalizationDto = NodeLocalization;

export interface PublicSourceDto extends Omit<Source, "localPath"> {
  localPath?: never;
}

export type AdminSourceDto = PublicSourceDto;
export type PrivateSourceDto = Source;

export interface PublicRouteDto {
  id: string;
  nodeId: string;
  status: string;
  mode: string;
  priority: number;
  capabilities: string[];
  format: string | null;
  contractRef: string | null;
  caveat: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminRouteDto extends PublicRouteDto {
  target: string | null;
  upstream: string | null;
}

export type PrivateRouteDto = RyuRoute;

export type RecordLocalizationDto =
  | PublicRecordLocalizationDto
  | AdminRecordLocalizationDto
  | PrivateRecordLocalizationDto;

export type RecordSourceDto = PublicSourceDto | AdminSourceDto | PrivateSourceDto;
export type RecordRouteDto = PublicRouteDto | AdminRouteDto | PrivateRouteDto;

export interface RecordDetailDto extends RecordSummaryDto {
  record: RecordNeutralDto;
  localizations?: Partial<Record<SupportedLocale, RecordLocalizationDto>>;
  edges?: GraphEdge[];
  sources?: RecordSourceDto[];
  routes?: RecordRouteDto[];
}

export interface RecordListDto {
  records: RecordSummaryDto[];
  nextCursor: string | null;
}

export interface LocalizationContentInput {
  title: string;
  summary?: string | null;
  description?: string | null;
  details?: NodeLocalizationDetails;
  sourceExcerpt?: string | null;
  translatedFromLocale?: SupportedLocale | null;
}

export interface RecordNeutralContentInput {
  kind: GraphNodeKind;
  countryCode?: string | null;
  subtype?: string | null;
  url?: string | null;
  recordDepth?: RecordDepth;
  properties?: NodeProperties | Record<string, unknown>;
}

export interface RecordEdgeInput {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  kind: GraphEdgeKind;
  note?: string | null;
  properties?: Record<string, unknown>;
}

export interface RecordSourceInput extends Source {}

export interface RecordRouteInput {
  id: string;
  nodeId?: string;
  status: string;
  mode: string;
  priority?: number;
  capabilities?: string[];
  target?: string | null;
  upstream?: string | null;
  format?: string | null;
  contractRef?: string | null;
  caveat?: string | null;
  properties?: Record<string, unknown>;
}

export interface RecordAggregateContentInput {
  id?: string;
  record: RecordNeutralContentInput;
  localizations?: Partial<Record<SupportedLocale, LocalizationContentInput>>;
  edges?: RecordEdgeInput[];
  sources?: {
    upsert?: RecordSourceInput[];
  };
  routes?: RecordRouteInput[];
  incomplete?: boolean;
}

export interface RecordNeutralPatchInput {
  kind?: GraphNodeKind;
  countryCode?: string | null;
  subtype?: string | null;
  url?: string | null;
  recordDepth?: RecordDepth;
  propertiesReplace?: NodeProperties | Record<string, unknown>;
}

export type LocalizationPatchInput =
  | ({
      mode: "patch";
    } & Partial<Omit<LocalizationContentInput, "details">> & {
      detailsReplace?: NodeLocalizationDetails;
    })
  | ({
      mode: "replace";
    } & LocalizationContentInput);

export interface RecordPatchInput {
  record?: RecordNeutralPatchInput;
  localizations?: Partial<Record<SupportedLocale, LocalizationPatchInput>>;
  edges?: {
    upsert?: RecordEdgeInput[];
    delete?: string[];
  };
  sources?: {
    upsert?: RecordSourceInput[];
  };
  routes?: {
    upsert?: RecordRouteInput[];
    delete?: string[];
  };
}

export interface RecordReviewInput {
  locale: SupportedLocale;
  reviewState?: ReviewState;
  reviewerNote?: string | null;
}

export interface RecordMutationOptions {
  validateOnly?: boolean;
  recordUpdatedAt?: string | null;
  createOnly?: boolean;
}

export interface RecordValidationIssue {
  index?: number;
  recordId?: string;
  message: string;
}

export interface RecordValidationResult {
  valid: boolean;
  recordId?: string;
  issues: RecordValidationIssue[];
  warnings?: string[];
  affectedSections?: string[];
  recordUpdatedAt?: string | null;
}

export interface BulkRecordValidationInput {
  validateOnly: true;
  records: RecordAggregateContentInput[];
}

export interface BulkRecordValidationResult {
  valid: boolean;
  issues: RecordValidationIssue[];
  checkedRecords: number;
}

export interface RecordDeleteImpact {
  recordId: string;
  recordUpdatedAt: string;
  nodeRows: number;
  localizationRows: number;
  inboundEdges: number;
  outboundEdges: number;
  routeRows: number;
  affectedSavedViews: string[];
  orphanedSourceCandidates: string[];
  impactHash: string;
}
