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
  | "unreviewed"
  | "agent_researched"
  | "needs_human_review"
  | "human_reviewed"
  | "needs_revision";

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
  description: string | null;
  source: SourceRef | null;
}

export type SystemAccessType = "read" | "submit" | "partner_sync" | "none";

export interface SystemAccessPath {
  id: string;
  type: SystemAccessType;
  method: string;
  label: string;
  url: string;
  description: string;
  source: SourceRef;
}

export interface SystemGalleryItem {
  id: string;
  type: "image" | "embed";
  url: string;
  thumbnailUrl: string | null;
  title: string | null;
  caption: string | null;
  source: SourceRef;
  sortOrder: number;
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
  description: string | null;
  observedAt: string | null;
  source: SourceRef;
}

export interface SystemIdentifierScheme {
  id: string;
  scheme: string;
  appliesTo: string | null;
  description: string | null;
  source: SourceRef | null;
}

export interface NodeDataDetails {
  descriptors: SystemDataDescriptor[];
  recordCount: SourcedMetric | null;
  storageSize: SourcedMetric | null;
}

export interface NodeDetails {
  aliases: string[];
  operator: SystemOperatorRef | null;
  role: string | null;
  disciplineFamily: string | null;
  geographicScope: string | null;
  gallery: SystemGalleryItem[];
  data: NodeDataDetails;
  access: SystemAccessPath[];
  identifiers: SystemIdentifierScheme[];
  usage: SourcedMetric[];
}

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  name: string;
  countryCode: string | null;
  subtype: string | null;
  url: string | null;
  summary: string | null;
  description: string | null;
  recordDepth: RecordDepth;
  reviewState: ReviewState;
  review: Record<string, unknown>;
  details: NodeDetails;
  properties: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
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

export interface GraphNodeInput {
  kind: GraphNodeKind;
  name: string;
  countryCode?: string | null;
  subtype?: string | null;
  url?: string | null;
  summary?: string | null;
  description?: string | null;
  recordDepth?: RecordDepth;
  reviewState?: ReviewState;
  review?: Record<string, unknown>;
  details?: NodeDetails;
  properties?: Record<string, unknown>;
}

export interface GraphEdgeInput {
  sourceNodeId: string;
  targetNodeId: string;
  kind: GraphEdgeKind;
  note?: string | null;
  properties?: Record<string, unknown>;
}

export interface SourceInput {
  title: string;
  sourceType: string;
  url: string | null;
  localPath: string | null;
  publisher: string | null;
  publishedAt: string | null;
  accessedAt: string | null;
  note: string | null;
}
