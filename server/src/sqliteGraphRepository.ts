import type Database from "better-sqlite3";
import crypto from "node:crypto";

import type {
  Entity,
  EntityInput,
  EntityKind,
  EntitySource,
  EntitySourceInput,
  EntityTag,
  GraphBootstrapPayload,
  Relationship,
  RelationshipInput,
  RelationshipSource,
  RelationshipSourceInput,
  RelationshipTag,
  SavedView,
  SavedViewInput,
  Source,
  SourceInput,
  Status,
  Tag,
} from "../../shared/domain";

type JsonValue = Record<string, unknown>;

type RawEntity = {
  id: string;
  kind: EntityKind;
  name: string;
  slug: string | null;
  parent_entity_id: string | null;
  country_code: string | null;
  institution_type: string | null;
  status: Status;
  confidence: number;
  description: string | null;
  properties_json: string | null;
  created_at: string;
  updated_at: string;
};

type RawRelationship = {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  type: Relationship["type"];
  status: Status;
  confidence: number;
  note: string | null;
  properties_json: string | null;
  created_at: string;
  updated_at: string;
};

const entityKinds = ["country", "organization", "system"] as const;
const relationshipTypes = ["part_of", "operates", "publishes_to", "syncs_to"] as const;
const statuses = ["active", "planned", "speculative", "deprecated"] as const;

function parseJson(value: string | null): JsonValue {
  if (!value) {
    return {};
  }

  return JSON.parse(value) as JsonValue;
}

function stringifyJson(value: Record<string, unknown>): string {
  return JSON.stringify(value ?? {});
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

function isStatus(value: unknown): value is Status {
  return typeof value === "string" && statuses.includes(value as Status);
}

function isEntityKind(value: unknown): value is EntityKind {
  return typeof value === "string" && entityKinds.includes(value as EntityKind);
}

function isRelationshipType(value: unknown): value is Relationship["type"] {
  return typeof value === "string" && relationshipTypes.includes(value as Relationship["type"]);
}

function assertConfidence(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0 || value > 1) {
    throw new Error("confidence must be a number between 0 and 1");
  }

  return value;
}

function mapEntity(row: RawEntity): Entity {
  const properties = parseJson(row.properties_json);
  const subtypeFromProperties =
    typeof properties.subtype === "string" ? properties.subtype : null;

  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    slug: row.slug,
    parentEntityId: row.parent_entity_id,
    countryCode: row.country_code,
    subtype: row.kind === "organization" ? row.institution_type : subtypeFromProperties,
    status: row.status,
    confidence: Number(row.confidence),
    description: row.description,
    properties,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRelationship(row: RawRelationship): Relationship {
  return {
    id: row.id,
    sourceEntityId: row.source_entity_id,
    targetEntityId: row.target_entity_id,
    type: row.type,
    status: row.status,
    confidence: Number(row.confidence),
    note: row.note,
    properties: parseJson(row.properties_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSource(row: Record<string, unknown>): Source {
  return {
    id: String(row.id),
    title: String(row.title),
    sourceType: String(row.source_type),
    url: (row.url as string | null) ?? null,
    localPath: (row.local_path as string | null) ?? null,
    publisher: (row.publisher as string | null) ?? null,
    publishedAt: (row.published_at as string | null) ?? null,
    accessedAt: (row.accessed_at as string | null) ?? null,
    note: (row.note as string | null) ?? null,
  };
}

function mapEntitySource(row: Record<string, unknown>): EntitySource {
  return {
    entityId: String(row.entity_id),
    sourceId: String(row.source_id),
    claimType: String(row.claim_type),
    excerpt: (row.excerpt as string | null) ?? null,
    confidenceOverride:
      row.confidence_override == null ? null : Number(row.confidence_override),
  };
}

function mapRelationshipSource(row: Record<string, unknown>): RelationshipSource {
  return {
    relationshipId: String(row.relationship_id),
    sourceId: String(row.source_id),
    claimType: String(row.claim_type),
    excerpt: (row.excerpt as string | null) ?? null,
    confidenceOverride:
      row.confidence_override == null ? null : Number(row.confidence_override),
  };
}

function mapSavedView(row: Record<string, unknown>): SavedView {
  return {
    id: String(row.id),
    name: String(row.name),
    scope: String(row.scope),
    filter: parseJson((row.filter_json as string | null) ?? "{}"),
    layout: parseJson((row.layout_json as string | null) ?? "{}"),
    style: parseJson((row.style_json as string | null) ?? "{}"),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function filterSavedViews(savedViews: SavedView[], entityIds: Set<string>): SavedView[] {
  return savedViews.filter((savedView) => {
    const filter = savedView.filter as { focusEntityId?: string | null };
    const scopeIsViewMode =
      savedView.scope === "governance" ||
      savedView.scope === "country" ||
      savedView.scope === "technical";

    return (
      (scopeIsViewMode || entityIds.has(savedView.scope)) &&
      (!filter.focusEntityId || entityIds.has(filter.focusEntityId))
    );
  });
}

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export class SqliteGraphRepository {
  constructor(private readonly db: Database.Database) {}

  getBootstrap(): GraphBootstrapPayload {
    const entities = this.db
      .prepare("SELECT * FROM entities ORDER BY name")
      .all() as RawEntity[];
    const relationships = this.db
      .prepare("SELECT * FROM relationships ORDER BY id")
      .all() as RawRelationship[];
    const sources = this.db
      .prepare("SELECT * FROM sources ORDER BY title")
      .all()
      .map((row) => mapSource(row as Record<string, unknown>));
    const entitySources = this.db
      .prepare("SELECT * FROM entity_sources ORDER BY entity_id, source_id, claim_type")
      .all()
      .map((row) => mapEntitySource(row as Record<string, unknown>));
    const relationshipSources = this.db
      .prepare("SELECT * FROM relationship_sources ORDER BY relationship_id, source_id, claim_type")
      .all()
      .map((row) => mapRelationshipSource(row as Record<string, unknown>));
    const tags = this.db
      .prepare("SELECT * FROM tags ORDER BY category, name")
      .all() as Tag[];
    const entityTags = this.db
      .prepare("SELECT * FROM entity_tags ORDER BY entity_id, tag_id")
      .all() as EntityTag[];
    const relationshipTags = this.db
      .prepare("SELECT * FROM relationship_tags ORDER BY relationship_id, tag_id")
      .all() as RelationshipTag[];

    const mappedEntities = entities.map((entity) => mapEntity(entity));
    const savedViews = filterSavedViews(
      this.listSavedViews(),
      new Set(mappedEntities.map((entity) => entity.id)),
    );

    return {
      entities: mappedEntities,
      relationships: relationships.map((relationship) => mapRelationship(relationship)),
      sources,
      entitySources,
      relationshipSources,
      tags,
      entityTags,
      relationshipTags,
      savedViews,
    };
  }

  createEntity(input: EntityInput): Entity {
    const entity = this.validateEntityInput(input);
    const id = createId(
      entity.kind === "country"
        ? "country"
        : entity.kind === "organization"
          ? "org"
          : "system",
    );

    this.db.transaction(() => {
      this.db
        .prepare(
          `
          INSERT INTO entities (
            id, kind, name, slug, parent_entity_id, country_code, institution_type,
            status, confidence, description, properties_json
          ) VALUES (
            @id, @kind, @name, @slug, @parentEntityId, @countryCode, @institutionType,
            @status, @confidence, @description, @propertiesJson
          )
        `,
        )
        .run(this.entityParams(id, entity));
      this.syncPartOfRelationship(id, entity.parentEntityId, entity.confidence);
      this.replaceEntitySources(id, entity.sources);
    })();

    return this.getEntity(id);
  }

  updateEntity(id: string, input: EntityInput): Entity {
    this.getEntity(id);
    const entity = this.validateEntityInput(input, id);

    this.db.transaction(() => {
      this.db
        .prepare(
          `
          UPDATE entities
          SET kind = @kind,
              name = @name,
              slug = @slug,
              parent_entity_id = @parentEntityId,
              country_code = @countryCode,
              institution_type = @institutionType,
              status = @status,
              confidence = @confidence,
              description = @description,
              properties_json = @propertiesJson
          WHERE id = @id
        `,
        )
        .run(this.entityParams(id, entity));
      this.syncPartOfRelationship(id, entity.parentEntityId, entity.confidence);
      this.replaceEntitySources(id, entity.sources);
    })();

    return this.getEntity(id);
  }

  deleteEntity(id: string): void {
    this.getEntity(id);
    this.db.prepare("DELETE FROM entities WHERE id = ?").run(id);
  }

  createRelationship(input: RelationshipInput): Relationship {
    const relationship = this.validateRelationshipInput(input);
    const id = createId("rel");

    this.db.transaction(() => {
      this.db
        .prepare(
          `
          INSERT INTO relationships (
            id, source_entity_id, target_entity_id, type, status, confidence, note, properties_json
          ) VALUES (
            @id, @sourceEntityId, @targetEntityId, @type, @status, @confidence, @note, @propertiesJson
          )
        `,
        )
        .run({
          id,
          sourceEntityId: relationship.sourceEntityId,
          targetEntityId: relationship.targetEntityId,
          type: relationship.type,
          status: relationship.status,
          confidence: relationship.confidence,
          note: relationship.note,
          propertiesJson: stringifyJson(relationship.properties),
        });
      if (relationship.type === "part_of") {
        this.db
          .prepare("UPDATE entities SET parent_entity_id = ? WHERE id = ?")
          .run(relationship.targetEntityId, relationship.sourceEntityId);
      }
      this.replaceRelationshipSources(id, relationship.sources);
    })();

    return this.getRelationship(id);
  }

  updateRelationship(id: string, input: RelationshipInput): Relationship {
    const existing = this.getRelationship(id);
    const relationship = this.validateRelationshipInput(input, id);

    this.db.transaction(() => {
      if (existing.type === "part_of") {
        this.db
          .prepare("UPDATE entities SET parent_entity_id = NULL WHERE id = ? AND parent_entity_id = ?")
          .run(existing.sourceEntityId, existing.targetEntityId);
      }

      this.db
        .prepare(
          `
          UPDATE relationships
          SET source_entity_id = @sourceEntityId,
              target_entity_id = @targetEntityId,
              type = @type,
              status = @status,
              confidence = @confidence,
              note = @note,
              properties_json = @propertiesJson
          WHERE id = @id
        `,
        )
        .run({
          id,
          sourceEntityId: relationship.sourceEntityId,
          targetEntityId: relationship.targetEntityId,
          type: relationship.type,
          status: relationship.status,
          confidence: relationship.confidence,
          note: relationship.note,
          propertiesJson: stringifyJson(relationship.properties),
        });

      if (relationship.type === "part_of") {
        this.db
          .prepare("UPDATE entities SET parent_entity_id = ? WHERE id = ?")
          .run(relationship.targetEntityId, relationship.sourceEntityId);
      }

      this.replaceRelationshipSources(id, relationship.sources);
    })();

    return this.getRelationship(id);
  }

  deleteRelationship(id: string): void {
    const relationship = this.getRelationship(id);

    this.db.transaction(() => {
      if (relationship.type === "part_of") {
        this.db
          .prepare("UPDATE entities SET parent_entity_id = NULL WHERE id = ? AND parent_entity_id = ?")
          .run(relationship.sourceEntityId, relationship.targetEntityId);
      }
      this.db.prepare("DELETE FROM relationships WHERE id = ?").run(id);
    })();
  }

  createSource(input: SourceInput): Source {
    const source = this.validateSourceInput(input);
    const id = createId("src");
    this.db
      .prepare(
        `
        INSERT INTO sources (
          id, title, source_type, url, local_path, publisher, published_at, accessed_at, note
        ) VALUES (
          @id, @title, @sourceType, @url, @localPath, @publisher, @publishedAt, @accessedAt, @note
        )
      `,
      )
      .run({
        id,
        ...source,
      });

    return this.getSource(id);
  }

  updateSource(id: string, input: SourceInput): Source {
    this.getSource(id);
    const source = this.validateSourceInput(input);
    this.db
      .prepare(
        `
        UPDATE sources
        SET title = @title,
            source_type = @sourceType,
            url = @url,
            local_path = @localPath,
            publisher = @publisher,
            published_at = @publishedAt,
            accessed_at = @accessedAt,
            note = @note
        WHERE id = @id
      `,
      )
      .run({
        id,
        ...source,
      });

    return this.getSource(id);
  }

  deleteSource(id: string): void {
    this.getSource(id);
    this.db.prepare("DELETE FROM sources WHERE id = ?").run(id);
  }

  listSavedViews(): SavedView[] {
    return this.db
      .prepare("SELECT * FROM saved_views ORDER BY updated_at DESC")
      .all()
      .map((row) => mapSavedView(row as Record<string, unknown>));
  }

  createSavedView(input: SavedViewInput): SavedView {
    const id = `view-${crypto.randomUUID()}`;
    this.db
      .prepare(
        `
        INSERT INTO saved_views (id, name, scope, filter_json, layout_json, style_json)
        VALUES (@id, @name, @scope, @filterJson, @layoutJson, @styleJson)
      `,
      )
      .run({
        id,
        name: input.name,
        scope: input.scope,
        filterJson: JSON.stringify(input.filter),
        layoutJson: JSON.stringify(input.layout),
        styleJson: JSON.stringify(input.style),
      });

    return this.getSavedView(id);
  }

  updateSavedView(id: string, input: SavedViewInput): SavedView {
    this.db
      .prepare(
        `
        UPDATE saved_views
        SET name = @name,
            scope = @scope,
            filter_json = @filterJson,
            layout_json = @layoutJson,
            style_json = @styleJson
        WHERE id = @id
      `,
      )
      .run({
        id,
        name: input.name,
        scope: input.scope,
        filterJson: JSON.stringify(input.filter),
        layoutJson: JSON.stringify(input.layout),
        styleJson: JSON.stringify(input.style),
      });

    return this.getSavedView(id);
  }

  deleteSavedView(id: string): void {
    this.db.prepare("DELETE FROM saved_views WHERE id = ?").run(id);
  }

  private entityParams(id: string, input: EntityInput) {
    const properties = { ...input.properties };
    if (input.kind === "system" && input.subtype) {
      properties.subtype = input.subtype;
    } else if (input.kind !== "system") {
      delete properties.subtype;
    }

    return {
      id,
      kind: input.kind,
      name: input.name,
      slug: input.slug,
      parentEntityId: input.kind === "organization" ? input.parentEntityId : null,
      countryCode: input.countryCode,
      institutionType: input.kind === "organization" ? input.subtype : null,
      status: input.status,
      confidence: input.confidence,
      description: input.description,
      propertiesJson: stringifyJson(properties),
    };
  }

  private replaceEntitySources(entityId: string, sources: EntitySourceInput[]): void {
    this.ensureSourcesExist(sources.map((source) => source.sourceId));
    this.db.prepare("DELETE FROM entity_sources WHERE entity_id = ?").run(entityId);
    const statement = this.db.prepare(
      `
      INSERT INTO entity_sources (
        entity_id, source_id, claim_type, excerpt, confidence_override
      ) VALUES (
        @entityId, @sourceId, @claimType, @excerpt, @confidenceOverride
      )
    `,
    );

    for (const source of sources) {
      statement.run({
        entityId,
        sourceId: source.sourceId,
        claimType: source.claimType,
        excerpt: source.excerpt,
        confidenceOverride: source.confidenceOverride,
      });
    }
  }

  private replaceRelationshipSources(
    relationshipId: string,
    sources: RelationshipSourceInput[],
  ): void {
    this.ensureSourcesExist(sources.map((source) => source.sourceId));
    this.db
      .prepare("DELETE FROM relationship_sources WHERE relationship_id = ?")
      .run(relationshipId);
    const statement = this.db.prepare(
      `
      INSERT INTO relationship_sources (
        relationship_id, source_id, claim_type, excerpt, confidence_override
      ) VALUES (
        @relationshipId, @sourceId, @claimType, @excerpt, @confidenceOverride
      )
    `,
    );

    for (const source of sources) {
      statement.run({
        relationshipId,
        sourceId: source.sourceId,
        claimType: source.claimType,
        excerpt: source.excerpt,
        confidenceOverride: source.confidenceOverride,
      });
    }
  }

  private syncPartOfRelationship(
    entityId: string,
    parentEntityId: string | null,
    confidence: number,
  ): void {
    const existing = this.db
      .prepare(
        "SELECT id FROM relationships WHERE source_entity_id = ? AND type = 'part_of' LIMIT 1",
      )
      .get(entityId) as { id: string } | undefined;

    if (!parentEntityId) {
      if (existing) {
        this.db.prepare("DELETE FROM relationships WHERE id = ?").run(existing.id);
      }
      return;
    }

    if (existing) {
      this.db
        .prepare(
          `
          UPDATE relationships
          SET target_entity_id = @targetEntityId
          WHERE id = @id
        `,
        )
        .run({
          id: existing.id,
          targetEntityId: parentEntityId,
        });
      return;
    }

    this.db
      .prepare(
        `
        INSERT INTO relationships (
          id, source_entity_id, target_entity_id, type, status, confidence, note, properties_json
        ) VALUES (
          @id, @sourceEntityId, @targetEntityId, 'part_of', 'active', @confidence, NULL, '{}'
        )
      `,
      )
      .run({
        id: createId("rel"),
        sourceEntityId: entityId,
        targetEntityId: parentEntityId,
        confidence,
      });
  }

  private ensureSourcesExist(sourceIds: string[]): void {
    for (const sourceId of sourceIds) {
      const exists = this.db.prepare("SELECT id FROM sources WHERE id = ?").get(sourceId);
      if (!exists) {
        throw new Error(`source not found: ${sourceId}`);
      }
    }
  }

  private validateEntityInput(input: EntityInput, entityId?: string): EntityInput {
    if (!isEntityKind(input.kind)) {
      throw new Error("invalid entity kind");
    }
    if (!input.name?.trim()) {
      throw new Error("name is required");
    }
    if (!isStatus(input.status)) {
      throw new Error("invalid entity status");
    }

    const parentEntityId = normalizeString(input.parentEntityId);
    if (input.kind !== "organization" && parentEntityId) {
      throw new Error("only organizations may have a parent");
    }

    if (input.kind === "organization" && parentEntityId) {
      const parent = this.getEntity(parentEntityId);
      if (parent.kind !== "country" && parent.kind !== "organization") {
        throw new Error("organization parent must be a country or organization");
      }
      if (entityId && parent.id === entityId) {
        throw new Error("entity cannot be its own parent");
      }
    }

    return {
      kind: input.kind,
      name: input.name.trim(),
      slug: normalizeString(input.slug),
      parentEntityId,
      countryCode: normalizeString(input.countryCode),
      subtype: normalizeString(input.subtype),
      status: input.status,
      confidence: assertConfidence(input.confidence),
      description: normalizeString(input.description),
      properties: input.properties ?? {},
      sources: this.validateEntitySources(input.sources ?? []),
    };
  }

  private validateRelationshipInput(
    input: RelationshipInput,
    relationshipId?: string,
  ): RelationshipInput {
    if (!isRelationshipType(input.type)) {
      throw new Error("invalid relationship type");
    }
    if (!isStatus(input.status)) {
      throw new Error("invalid relationship status");
    }
    if (!input.sourceEntityId || !input.targetEntityId) {
      throw new Error("source and target are required");
    }
    if (input.sourceEntityId === input.targetEntityId) {
      throw new Error("relationship endpoints must differ");
    }

    const source = this.getEntity(input.sourceEntityId);
    const target = this.getEntity(input.targetEntityId);

    if (
      input.type === "part_of" &&
      (source.kind !== "organization" ||
        (target.kind !== "organization" && target.kind !== "country"))
    ) {
      throw new Error("part_of must connect organization to organization or country");
    }
    if (
      (input.type === "operates" || input.type === "publishes_to") &&
      (source.kind !== "organization" || target.kind !== "system")
    ) {
      throw new Error(`${input.type} must connect organization to system`);
    }
    if (
      input.type === "syncs_to" &&
      (source.kind !== "system" || target.kind !== "system")
    ) {
      throw new Error("syncs_to must connect system to system");
    }

    if (input.type === "part_of" && relationshipId) {
      const existing = this.db
        .prepare(
          "SELECT id FROM relationships WHERE source_entity_id = ? AND type = 'part_of' AND id <> ? LIMIT 1",
        )
        .get(input.sourceEntityId, relationshipId);
      if (existing) {
        throw new Error("organization may only have one part_of relationship");
      }
    }

    return {
      sourceEntityId: input.sourceEntityId,
      targetEntityId: input.targetEntityId,
      type: input.type,
      status: input.status,
      confidence: assertConfidence(input.confidence),
      note: normalizeString(input.note),
      properties: input.properties ?? {},
      sources: this.validateRelationshipSources(input.sources ?? []),
    };
  }

  private validateEntitySources(sources: EntitySourceInput[]): EntitySourceInput[] {
    return sources.map((source) => ({
      sourceId: source.sourceId,
      claimType: source.claimType?.trim() || "supports_claim",
      excerpt: normalizeString(source.excerpt),
      confidenceOverride:
        source.confidenceOverride == null
          ? null
          : assertConfidence(source.confidenceOverride),
    }));
  }

  private validateRelationshipSources(
    sources: RelationshipSourceInput[],
  ): RelationshipSourceInput[] {
    return sources.map((source) => ({
      sourceId: source.sourceId,
      claimType: source.claimType?.trim() || "supports_claim",
      excerpt: normalizeString(source.excerpt),
      confidenceOverride:
        source.confidenceOverride == null
          ? null
          : assertConfidence(source.confidenceOverride),
    }));
  }

  private validateSourceInput(input: SourceInput): SourceInput {
    if (!input.title?.trim()) {
      throw new Error("source title is required");
    }
    if (!input.sourceType?.trim()) {
      throw new Error("source type is required");
    }

    return {
      title: input.title.trim(),
      sourceType: input.sourceType.trim(),
      url: normalizeString(input.url),
      localPath: normalizeString(input.localPath),
      publisher: normalizeString(input.publisher),
      publishedAt: normalizeString(input.publishedAt),
      accessedAt: normalizeString(input.accessedAt),
      note: normalizeString(input.note),
    };
  }

  private getEntity(id: string): Entity {
    const row = this.db.prepare("SELECT * FROM entities WHERE id = ?").get(id) as RawEntity | undefined;
    if (!row) {
      throw new Error(`entity not found: ${id}`);
    }

    return mapEntity(row);
  }

  private getRelationship(id: string): Relationship {
    const row = this.db
      .prepare("SELECT * FROM relationships WHERE id = ?")
      .get(id) as RawRelationship | undefined;
    if (!row) {
      throw new Error(`relationship not found: ${id}`);
    }

    return mapRelationship(row);
  }

  private getSource(id: string): Source {
    const row = this.db.prepare("SELECT * FROM sources WHERE id = ?").get(id);
    if (!row) {
      throw new Error(`source not found: ${id}`);
    }

    return mapSource(row as Record<string, unknown>);
  }

  private getSavedView(id: string): SavedView {
    const row = this.db.prepare("SELECT * FROM saved_views WHERE id = ?").get(id);
    if (!row) {
      throw new Error(`saved view not found: ${id}`);
    }

    return mapSavedView(row as Record<string, unknown>);
  }
}
