export type GraphNodeKind =
  | "country"
  | "organization"
  | "system";

export type GraphEdgeKind =
  | "governs"
  | "operates"
  | "part_of"
  | "publishes_to"
  | "syncs_to";

export type ViewMode = "governance" | "country" | "technical";

export type RecordDepth = "stub" | "thin" | "rich";

export type ReviewState =
  | "agent_researched"
  | "human_reviewed"
  | "needs_revision";

export type SupportedLocale = "ar" | "zh" | "en" | "fr" | "ru" | "es";

export interface Source {
  id: string;
  title: string;
  sourceType: string;
  url: string | null;
  localPath: string | null;
  publisher: string | null;
  publishedAt: string | null;
  accessedAt: string | null;
  note: string | null;
}

export interface SourceRef {
  id: string;
  title: string;
  url: string;
}

export interface SystemOperatorRef {
  id: string;
  name: string;
  countryCode: string | null;
}

export type SystemDataDescriptorCategory = "type" | "format" | "standard";

export interface SystemDataDescriptor {
  id: string;
  category: SystemDataDescriptorCategory;
  label: string;
  source: SourceRef | null;
}

export interface LocalizedSystemDataDescriptor {
  id: string;
  label?: string | null;
  description: string | null;
}

export type SystemAccessType = "read" | "submit" | "partner_sync";

export interface SystemAccessPath {
  id: string;
  type: SystemAccessType;
  method: string;
  url: string;
  source: SourceRef;
}

export interface LocalizedSystemAccessPath {
  id: string;
  label: string | null;
  description: string | null;
  instructions?: string | null;
  caveats?: string[];
}

export interface SystemGalleryItem {
  id: string;
  type: "image" | "embed";
  url: string;
  thumbnailUrl: string | null;
  source: SourceRef;
  sortOrder: number;
}

export interface LocalizedSystemGalleryItem {
  id: string;
  title: string | null;
  caption: string | null;
  altText?: string | null;
}

export type SystemMetricKey =
  | "record_count"
  | "storage_size_bytes"
  | "publication_count"
  | "citation_count"
  | "view_count"
  | "download_count"
  | "registered_user_count"
  | "contributor_count"
  | string;

export interface SourcedMetric {
  id: string;
  key: SystemMetricKey;
  value: number;
  unit: string;
  observedAt: string | null;
  source: SourceRef;
}

export interface LocalizedSourcedMetric {
  id: string;
  label?: string | null;
  unit?: string | null;
  description: string | null;
}

export interface NodeDataDetails {
  descriptors: SystemDataDescriptor[];
  recordCount: SourcedMetric | null;
  storageSize: SourcedMetric | null;
}

export interface LocalizedNodeDataDetails {
  descriptors: LocalizedSystemDataDescriptor[];
  recordCount: LocalizedSourcedMetric | null;
  storageSize: LocalizedSourcedMetric | null;
}

export interface NodeLocalizationDetails extends Record<string, unknown> {
  aliases: string[];
  gallery: LocalizedSystemGalleryItem[];
  data: LocalizedNodeDataDetails;
  access: LocalizedSystemAccessPath[];
  usage: LocalizedSourcedMetric[];
}

export interface NodeProperties extends Record<string, unknown> {
  operator?: SystemOperatorRef | null;
  role?: string | null;
  disciplineFamily?: string | null;
  geographicScope?: string | null;
  gallery?: SystemGalleryItem[];
  data?: NodeDataDetails;
  access?: SystemAccessPath[];
  usage?: SourcedMetric[];
}

export interface NodeLocalization {
  locale: SupportedLocale;
  title: string;
  summary: string | null;
  description: string | null;
  details: NodeLocalizationDetails;
  sourceExcerpt: string | null;
  translatedFromLocale: SupportedLocale | null;
  contentUpdatedAt: string;
  reviewState: ReviewState;
  reviewerNote: string | null;
  reviewer: string | null;
  lastReviewed: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NodeLocalizationMap = Partial<Record<SupportedLocale, NodeLocalization>>;

export interface ResolvedNodeLocalization {
  requestedLocale: SupportedLocale;
  displayLocale: SupportedLocale | null;
  isLocaleFallback: boolean;
  hasLocalization: boolean;
  title: string;
  summary: string | null;
  description: string | null;
  details: NodeLocalizationDetails;
  sourceExcerpt: string | null;
  translatedFromLocale: SupportedLocale | null;
  contentUpdatedAt: string | null;
  reviewState: ReviewState | null;
  reviewerNote: string | null;
  reviewer: string | null;
  lastReviewed: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  countryCode: string | null;
  subtype: string | null;
  url: string | null;
  recordDepth: RecordDepth;
  properties: NodeProperties;
  createdAt: string;
  updatedAt: string;
  localizations: NodeLocalizationMap;
  availableLocales: SupportedLocale[];
  requestedLocale: SupportedLocale;
  displayLocale: SupportedLocale | null;
  isLocaleFallback: boolean;
}

export interface GraphEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  kind: GraphEdgeKind;
  note: string | null;
  properties: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RyuRoute {
  id: string;
  nodeId: string;
  status: string;
  mode: string;
  priority: number;
  capabilities: string[];
  target: string | null;
  upstream: string | null;
  format: string | null;
  contractRef: string | null;
  caveat: string | null;
  properties: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RyuPortalSource {
  ryuSourceId: string;
  title: string;
  sourceType: string;
  provider: string | null;
  originalUrl: string | null;
  ryuUrl: string;
  localPath: string | null;
  citation: string | null;
  license: string | null;
  updateCadence: string | null;
  accessedAt: string | null;
  caveats: string[];
}

export interface RyuPortalRoute {
  routeId: string;
  status: string;
  mode: string;
  priority: number;
  connectorRef: string | null;
  connectorTarget: string | null;
  upstream: string | null;
  supportedTools: string[];
  capabilities: string[];
  deliveryFormats: string[];
  auth: {
    required: boolean;
  };
  contractRef: string | null;
  caveats: string[];
  properties: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RyuSystemOperator {
  id: string;
  name: string;
  countryCode: string | null;
}

export interface RyuSystemRecord {
  ryuSystemId: string;
  title: string;
  operator: RyuSystemOperator | null;
  summary: string | null;
  description: string | null;
  requestedLocale: SupportedLocale;
  displayLocale: SupportedLocale | null;
  isLocaleFallback: boolean;
  url: string | null;
  domains: string[];
  geographies: string[];
  capabilities: string[];
  routes: RyuPortalRoute[];
  sources: RyuPortalSource[];
  caveats: string[];
  recordDepth: RecordDepth;
  reviewState: ReviewState | null;
  updatedAt: string;
}

export interface RyuSystemQuery {
  query?: string;
  domains?: string[];
  geographies?: string[];
  capabilities?: string[];
  deliveryFormats?: string[];
  routeStatus?: string[];
  includeRoutes?: boolean;
  includeSources?: boolean;
}

export interface SavedView {
  id: string;
  name: string;
  scope: string;
  filter: Record<string, unknown>;
  layout: Record<string, unknown>;
  style: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface GraphBootstrapPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
  sources: Source[];
  ryuRoutes: RyuRoute[];
  savedViews: SavedView[];
}

export interface SavedViewInput {
  name: string;
  scope: string;
  filter: Record<string, unknown>;
  layout: Record<string, unknown>;
  style: Record<string, unknown>;
}

export interface NodeLocalizationReviewInput {
  reviewState?: ReviewState;
  reviewerNote?: string | null;
}
