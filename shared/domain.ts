export type EntityKind =
  | "country"
  | "organization"
  | "system";

export type RelationshipType =
  | "part_of"
  | "operates"
  | "publishes_to"
  | "syncs_to";

export type Status = "active" | "planned" | "speculative" | "deprecated";
export type ViewMode = "governance" | "country" | "technical";

export interface Entity {
  id: string;
  kind: EntityKind;
  name: string;
  slug: string | null;
  parentEntityId: string | null;
  countryCode: string | null;
  subtype: string | null;
  status: Status;
  confidence: number;
  description: string | null;
  properties: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Relationship {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  type: RelationshipType;
  status: Status;
  confidence: number;
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

export interface EntitySource {
  entityId: string;
  sourceId: string;
  claimType: string;
  excerpt: string | null;
  confidenceOverride: number | null;
}

export interface RelationshipSource {
  relationshipId: string;
  sourceId: string;
  claimType: string;
  excerpt: string | null;
  confidenceOverride: number | null;
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
  entitySources: EntitySource[];
  relationshipSources: RelationshipSource[];
  tags: Tag[];
  entityTags: EntityTag[];
  relationshipTags: RelationshipTag[];
  savedViews: SavedView[];
}

export interface SavedViewInput {
  name: string;
  scope: string;
  filter: Record<string, unknown>;
  layout: Record<string, unknown>;
  style: Record<string, unknown>;
}

export interface EntitySourceInput {
  sourceId: string;
  claimType: string;
  excerpt: string | null;
  confidenceOverride: number | null;
}

export interface RelationshipSourceInput {
  sourceId: string;
  claimType: string;
  excerpt: string | null;
  confidenceOverride: number | null;
}

export interface EntityInput {
  kind: EntityKind;
  name: string;
  slug: string | null;
  parentEntityId: string | null;
  countryCode: string | null;
  subtype: string | null;
  status: Status;
  confidence: number;
  description: string | null;
  properties: Record<string, unknown>;
  sources: EntitySourceInput[];
}

export interface RelationshipInput {
  sourceEntityId: string;
  targetEntityId: string;
  type: RelationshipType;
  status: Status;
  confidence: number;
  note: string | null;
  properties: Record<string, unknown>;
  sources: RelationshipSourceInput[];
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
