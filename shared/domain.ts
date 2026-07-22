export type EntityKind =
  | "country"
  | "organization"
  | "system";

export type RelationshipType =
  | "governs"
  | "operates"
  | "part_of"
  | "publishes_to"
  | "syncs_to";

export type ViewMode = "governance" | "country" | "technical";

export interface Entity {
  id: string;
  kind: EntityKind;
  name: string;
  parentEntityId: string | null;
  countryCode: string | null;
  subtype: string | null;
  properties: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Relationship {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  type: RelationshipType;
  note: string | null;
  properties: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

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

export interface Tag {
  id: string;
  name: string;
  category: string;
}

export interface EntityTag {
  entityId: string;
  tagId: string;
}

export interface RelationshipTag {
  relationshipId: string;
  tagId: string;
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

export interface SystemRyuRoute {
  id: string;
  status: string;
  mode: string;
  priority: number;
  capabilities: string[];
  target: string | null;
  upstream: string | null;
  format: string | null;
  contractRef: string | null;
  caveat: string | null;
}

export interface SystemRyu {
  routes: SystemRyuRoute[];
}

export interface SystemNode {
  id: string;
  kind: "system";
  name: string;
  countryCode: string | null;
  parentSystemId: string | null;
  operator: SystemOperatorRef | null;
  primaryUrl: string | null;
  shortDescription: string | null;
  longDescription: string | null;
  aliases: string[];
  role: string | null;
  disciplineFamily: string | null;
  geographicScope: string | null;
  gallery: SystemGalleryItem[];
  data: {
    descriptors: SystemDataDescriptor[];
    recordCount: SourcedMetric | null;
    storageSize: SourcedMetric | null;
  };
  access: SystemAccessPath[];
  identifiers: SystemIdentifierScheme[];
  usage: SourcedMetric[];
  ryu: SystemRyu;
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
  entities: Entity[];
  relationships: Relationship[];
  sources: Source[];
  tags: Tag[];
  entityTags: EntityTag[];
  relationshipTags: RelationshipTag[];
  systemNodes: SystemNode[];
  savedViews: SavedView[];
}

export interface SavedViewInput {
  name: string;
  scope: string;
  filter: Record<string, unknown>;
  layout: Record<string, unknown>;
  style: Record<string, unknown>;
}

export interface EntityInput {
  kind: EntityKind;
  name: string;
  parentEntityId: string | null;
  countryCode: string | null;
  subtype: string | null;
  properties: Record<string, unknown>;
}

export interface RelationshipInput {
  sourceEntityId: string;
  targetEntityId: string;
  type: RelationshipType;
  note: string | null;
  properties: Record<string, unknown>;
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
