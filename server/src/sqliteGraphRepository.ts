import type Database from "better-sqlite3";
import crypto from "node:crypto";

import type {
  Entity,
  EntityInput,
  EntityKind,
  EntityTag,
  GraphBootstrapPayload,
  Relationship,
  RelationshipInput,
  RelationshipTag,
  SavedView,
  SavedViewInput,
  Source,
  SourceInput,
  SourceRef,
  SourcedMetric,
  SystemAccessPath,
  SystemDataDescriptor,
  SystemGalleryItem,
  SystemIdentifierScheme,
  SystemNode,
  SystemRyu,
  Tag,
} from "../../shared/domain";

type JsonValue = Record<string, unknown>;

type RawEntity = {
  id: string;
  kind: EntityKind;
  name: string;
  parent_entity_id: string | null;
  country_code: string | null;
  institution_type: string | null;
  properties_json: string | null;
  created_at: string;
  updated_at: string;
};

type RawRelationship = {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  type: Relationship["type"];
  note: string | null;
  properties_json: string | null;
  created_at: string;
  updated_at: string;
};

type RawSystemProfile = {
  system_id: string;
  primary_url: string | null;
  short_description: string | null;
  long_description: string | null;
  aliases: string | null;
  role: string | null;
  discipline_family: string | null;
  geographic_scope: string | null;
};

type RawSystemDataDescriptor = {
  id: string;
  system_id: string;
  category: SystemDataDescriptor["category"];
  label: string;
  description: string | null;
  source_id: string | null;
};

type RawSystemAccessPath = {
  id: string;
  system_id: string;
  access_type: SystemAccessPath["type"];
  method: string;
  label: string;
  url: string;
  description: string;
  source_id: string;
};

type RawSystemGalleryItem = {
  id: string;
  system_id: string;
  item_type: SystemGalleryItem["type"];
  url: string;
  thumbnail_url: string | null;
  title: string | null;
  caption: string | null;
  source_id: string;
  sort_order: number;
};

type RawSystemMetric = {
  id: string;
  system_id: string;
  metric_key: string;
  value_numeric: number;
  unit: string;
  description: string | null;
  observed_at: string | null;
  source_id: string;
};

type RawSystemIdentifierScheme = {
  id: string;
  system_id: string;
  scheme: string;
  applies_to: string | null;
  description: string | null;
  source_id: string | null;
};

const entityKinds = ["country", "organization", "system"] as const;
const relationshipTypes = ["governs", "operates", "part_of", "publishes_to", "syncs_to"] as const;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeString(item))
    .filter((item): item is string => Boolean(item));
}

function normalizeRyu(value: unknown): SystemRyu {
  if (!isRecord(value) || !Array.isArray(value.routes)) {
    return { routes: [] };
  }

  const routes = value.routes.flatMap((route, index) => {
    if (!isRecord(route)) {
      return [];
    }

    const id = normalizeString(route.id);
    const mode = normalizeString(route.mode);
    if (!id || !mode) {
      return [];
    }

    const priority = typeof route.priority === "number" && Number.isFinite(route.priority)
      ? route.priority
      : index + 1;

    return [{
      id,
      status: normalizeString(route.status) ?? "active",
      mode,
      priority,
      capabilities: normalizeStringList(route.capabilities),
      target: normalizeString(route.target),
      upstream: normalizeString(route.upstream),
      format: normalizeString(route.format),
      contractRef: normalizeString(route.contractRef),
      caveat: normalizeString(route.caveat),
    }];
  });

  return {
    routes: routes.sort((left, right) => left.priority - right.priority),
  };
}

function isEntityKind(value: unknown): value is EntityKind {
  return typeof value === "string" && entityKinds.includes(value as EntityKind);
}

function isRelationshipType(value: unknown): value is Relationship["type"] {
  return typeof value === "string" && relationshipTypes.includes(value as Relationship["type"]);
}

function mapEntity(row: RawEntity): Entity {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    parentEntityId: row.parent_entity_id,
    countryCode: row.country_code,
    subtype: row.kind === "organization" ? row.institution_type : null,
    properties: parseJson(row.properties_json),
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

function mapEntityTag(row: Record<string, unknown>): EntityTag {
  return {
    entityId: String(row.entity_id),
    tagId: String(row.tag_id),
  };
}

function mapRelationshipTag(row: Record<string, unknown>): RelationshipTag {
  return {
    relationshipId: String(row.relationship_id),
    tagId: String(row.tag_id),
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

function splitAliases(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(/[;,]/)
    .map((alias) => alias.trim())
    .filter(Boolean);
}

function optionalSourceRef(
  sourceById: Record<string, Source>,
  sourceId: string | null,
): SourceRef | null {
  if (!sourceId) {
    return null;
  }

  const source = sourceById[sourceId];
  if (!source?.url) {
    return null;
  }

  return {
    id: source.id,
    title: source.title,
    url: source.url,
  };
}

function requiredSourceRef(sourceById: Record<string, Source>, sourceId: string): SourceRef {
  const source = optionalSourceRef(sourceById, sourceId);
  if (!source) {
    throw new Error(`source ${sourceId} needs a URL before it can support a sourced field`);
  }

  return source;
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

function groupBySystemId<T extends { system_id: string }>(rows: T[]): Record<string, T[]> {
  const grouped: Record<string, T[]> = {};
  for (const row of rows) {
    grouped[row.system_id] ??= [];
    grouped[row.system_id].push(row);
  }
  return grouped;
}

function mapMetric(
  row: RawSystemMetric,
  sourceById: Record<string, Source>,
): SourcedMetric {
  return {
    id: row.id,
    key: row.metric_key,
    value: Number(row.value_numeric),
    unit: row.unit,
    description: row.description,
    observedAt: row.observed_at,
    source: requiredSourceRef(sourceById, row.source_id),
  };
}

function buildSystemNodes(input: {
  entities: Entity[];
  relationships: Relationship[];
  sources: Source[];
  profiles: RawSystemProfile[];
  descriptors: RawSystemDataDescriptor[];
  accessPaths: RawSystemAccessPath[];
  galleryItems: RawSystemGalleryItem[];
  metrics: RawSystemMetric[];
  identifierSchemes: RawSystemIdentifierScheme[];
}): SystemNode[] {
  const entityById = Object.fromEntries(input.entities.map((entity) => [entity.id, entity]));
  const sourceById = Object.fromEntries(input.sources.map((source) => [source.id, source]));
  const profileBySystemId = Object.fromEntries(
    input.profiles.map((profile) => [profile.system_id, profile]),
  );
  const descriptorsBySystemId = groupBySystemId(input.descriptors);
  const accessBySystemId = groupBySystemId(input.accessPaths);
  const galleryBySystemId = groupBySystemId(input.galleryItems);
  const metricsBySystemId = groupBySystemId(input.metrics);
  const identifiersBySystemId = groupBySystemId(input.identifierSchemes);

  return input.entities
    .filter((entity) => entity.kind === "system")
    .map((entity) => {
      const profile = profileBySystemId[entity.id];
      const operatorRelationship = input.relationships.find(
        (relationship) =>
          relationship.type === "operates" && relationship.targetEntityId === entity.id,
      );
      const operator = operatorRelationship
        ? entityById[operatorRelationship.sourceEntityId]
        : null;
      const parentRelationship = input.relationships.find(
        (relationship) =>
          relationship.type === "part_of" && relationship.sourceEntityId === entity.id,
      );
      const metrics = (metricsBySystemId[entity.id] ?? []).map((metric) =>
        mapMetric(metric, sourceById),
      );
      const metricByKey = Object.fromEntries(metrics.map((metric) => [metric.key, metric]));

      return {
        id: entity.id,
        kind: "system",
        name: entity.name,
        countryCode: entity.countryCode,
        parentSystemId: parentRelationship?.targetEntityId ?? null,
        operator: operator
          ? {
              id: operator.id,
              name: operator.name,
              countryCode: operator.countryCode,
            }
          : null,
        primaryUrl: profile?.primary_url ?? null,
        shortDescription: profile?.short_description ?? null,
        longDescription: profile?.long_description ?? null,
        aliases: splitAliases(profile?.aliases ?? null),
        role: profile?.role ?? null,
        disciplineFamily: profile?.discipline_family ?? null,
        geographicScope: profile?.geographic_scope ?? null,
        gallery: (galleryBySystemId[entity.id] ?? []).map((item) => ({
          id: item.id,
          type: item.item_type,
          url: item.url,
          thumbnailUrl: item.thumbnail_url,
          title: item.title,
          caption: item.caption,
          source: requiredSourceRef(sourceById, item.source_id),
          sortOrder: Number(item.sort_order),
        })),
        data: {
          descriptors: (descriptorsBySystemId[entity.id] ?? []).map((descriptor) => ({
            id: descriptor.id,
            category: descriptor.category,
            label: descriptor.label,
            description: descriptor.description,
            source: optionalSourceRef(sourceById, descriptor.source_id),
          })),
          recordCount: metricByKey.record_count ?? null,
          storageSize: metricByKey.storage_size_bytes ?? null,
        },
        access: (accessBySystemId[entity.id] ?? []).map((path) => ({
          id: path.id,
          type: path.access_type,
          method: path.method,
          label: path.label,
          url: path.url,
          description: path.description,
          source: requiredSourceRef(sourceById, path.source_id),
        })),
        identifiers: (identifiersBySystemId[entity.id] ?? []).map((scheme) => ({
          id: scheme.id,
          scheme: scheme.scheme,
          appliesTo: scheme.applies_to,
          description: scheme.description,
          source: optionalSourceRef(sourceById, scheme.source_id),
        })),
        usage: metrics.filter(
          (metric) => metric.key !== "record_count" && metric.key !== "storage_size_bytes",
        ),
        ryu: normalizeRyu(entity.properties.ryu),
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
      } satisfies SystemNode;
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export class SqliteGraphRepository {
  constructor(private readonly db: Database.Database) {}

  getBootstrap(): GraphBootstrapPayload {
    const entities = (this.db
      .prepare("SELECT * FROM entities ORDER BY name")
      .all() as RawEntity[]).map((entity) => mapEntity(entity));
    const relationships = (this.db
      .prepare("SELECT * FROM relationships ORDER BY id")
      .all() as RawRelationship[]).map((relationship) => mapRelationship(relationship));
    const sources = this.db
      .prepare("SELECT * FROM sources ORDER BY title")
      .all()
      .map((row) => mapSource(row as Record<string, unknown>));
    const tags = this.db
      .prepare("SELECT * FROM tags ORDER BY category, name")
      .all() as Tag[];
    const entityTags = this.db
      .prepare("SELECT * FROM entity_tags ORDER BY entity_id, tag_id")
      .all()
      .map((row) => mapEntityTag(row as Record<string, unknown>));
    const relationshipTags = this.db
      .prepare("SELECT * FROM relationship_tags ORDER BY relationship_id, tag_id")
      .all()
      .map((row) => mapRelationshipTag(row as Record<string, unknown>));
    const profiles = this.db
      .prepare("SELECT * FROM system_profiles ORDER BY system_id")
      .all() as RawSystemProfile[];
    const descriptors = this.db
      .prepare("SELECT * FROM system_data_descriptors ORDER BY system_id, category, label")
      .all() as RawSystemDataDescriptor[];
    const accessPaths = this.db
      .prepare("SELECT * FROM system_access_paths ORDER BY system_id, access_type, method, label")
      .all() as RawSystemAccessPath[];
    const galleryItems = this.db
      .prepare("SELECT * FROM system_gallery_items ORDER BY system_id, sort_order, title")
      .all() as RawSystemGalleryItem[];
    const metrics = this.db
      .prepare("SELECT * FROM system_metrics ORDER BY system_id, metric_key, id")
      .all() as RawSystemMetric[];
    const identifierSchemes = this.db
      .prepare("SELECT * FROM system_identifier_schemes ORDER BY system_id, scheme")
      .all() as RawSystemIdentifierScheme[];
    const savedViews = filterSavedViews(
      this.listSavedViews(),
      new Set(entities.map((entity) => entity.id)),
    );

    return {
      entities,
      relationships,
      sources,
      tags,
      entityTags,
      relationshipTags,
      systemNodes: buildSystemNodes({
        entities,
        relationships,
        sources,
        profiles,
        descriptors,
        accessPaths,
        galleryItems,
        metrics,
        identifierSchemes,
      }),
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

    this.db
      .prepare(
        `
        INSERT INTO entities (
          id, kind, name, parent_entity_id, country_code, institution_type, properties_json
        ) VALUES (
          @id, @kind, @name, @parentEntityId, @countryCode, @institutionType, @propertiesJson
        )
      `,
      )
      .run(this.entityParams(id, entity));

    return this.getEntity(id);
  }

  updateEntity(id: string, input: EntityInput): Entity {
    this.getEntity(id);
    const entity = this.validateEntityInput(input, id);

    this.db
      .prepare(
        `
        UPDATE entities
        SET kind = @kind,
            name = @name,
            parent_entity_id = @parentEntityId,
            country_code = @countryCode,
            institution_type = @institutionType,
            properties_json = @propertiesJson
        WHERE id = @id
      `,
      )
      .run(this.entityParams(id, entity));

    return this.getEntity(id);
  }

  deleteEntity(id: string): void {
    this.getEntity(id);
    this.db.prepare("DELETE FROM entities WHERE id = ?").run(id);
  }

  createRelationship(input: RelationshipInput): Relationship {
    const relationship = this.validateRelationshipInput(input);
    const id = createId("rel");

    this.db
      .prepare(
        `
        INSERT INTO relationships (
          id, source_entity_id, target_entity_id, type, note, properties_json
        ) VALUES (
          @id, @sourceEntityId, @targetEntityId, @type, @note, @propertiesJson
        )
      `,
      )
      .run({
        id,
        sourceEntityId: relationship.sourceEntityId,
        targetEntityId: relationship.targetEntityId,
        type: relationship.type,
        note: relationship.note,
        propertiesJson: stringifyJson(relationship.properties),
      });

    return this.getRelationship(id);
  }

  updateRelationship(id: string, input: RelationshipInput): Relationship {
    this.getRelationship(id);
    const relationship = this.validateRelationshipInput(input, id);

    this.db
      .prepare(
        `
        UPDATE relationships
        SET source_entity_id = @sourceEntityId,
            target_entity_id = @targetEntityId,
            type = @type,
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
        note: relationship.note,
        propertiesJson: stringifyJson(relationship.properties),
      });

    return this.getRelationship(id);
  }

  deleteRelationship(id: string): void {
    this.getRelationship(id);
    this.db.prepare("DELETE FROM relationships WHERE id = ?").run(id);
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
    delete properties.subtype;

    return {
      id,
      kind: input.kind,
      name: input.name,
      parentEntityId: input.kind === "organization" ? input.parentEntityId : null,
      countryCode: input.countryCode,
      institutionType: input.kind === "organization" ? input.subtype : null,
      propertiesJson: stringifyJson(properties),
    };
  }

  private validateEntityInput(input: EntityInput, entityId?: string): EntityInput {
    if (!isEntityKind(input.kind)) {
      throw new Error("invalid entity kind");
    }
    if (!input.name?.trim()) {
      throw new Error("name is required");
    }

    const parentEntityId = normalizeString(input.parentEntityId);
    if (input.kind !== "organization" && parentEntityId) {
      throw new Error("only organizations may have a parent");
    }

    if (input.kind === "organization" && parentEntityId) {
      const parent = this.getEntity(parentEntityId);
      if (parent.kind !== "organization") {
        throw new Error("organization parent must be an organization");
      }
      if (entityId && parent.id === entityId) {
        throw new Error("entity cannot be its own parent");
      }
    }

    return {
      kind: input.kind,
      name: input.name.trim(),
      parentEntityId,
      countryCode: normalizeString(input.countryCode),
      subtype: normalizeString(input.subtype),
      properties: input.properties ?? {},
    };
  }

  private validateRelationshipInput(
    input: RelationshipInput,
    relationshipId?: string,
  ): RelationshipInput {
    if (!isRelationshipType(input.type)) {
      throw new Error("invalid relationship type");
    }
    if (!input.sourceEntityId || !input.targetEntityId) {
      throw new Error("source and target are required");
    }
    if (input.sourceEntityId === input.targetEntityId) {
      throw new Error("relationship endpoints must differ");
    }

    const source = this.getEntity(input.sourceEntityId);
    const target = this.getEntity(input.targetEntityId);

    if (input.type === "governs" && (source.kind !== "country" || target.kind !== "organization")) {
      throw new Error("governs must connect country to organization");
    }
    if (
      (input.type === "operates" || input.type === "publishes_to") &&
      (source.kind !== "organization" || target.kind !== "system")
    ) {
      throw new Error(`${input.type} must connect organization to system`);
    }
    if (
      input.type === "part_of" &&
      (source.kind !== "system" || target.kind !== "system")
    ) {
      throw new Error("part_of must connect system to system");
    }
    if (
      input.type === "syncs_to" &&
      (source.kind !== "system" || target.kind !== "system")
    ) {
      throw new Error("syncs_to must connect system to system");
    }

    if (input.type === "governs") {
      const existing = relationshipId
        ? this.db
            .prepare(
              "SELECT id FROM relationships WHERE target_entity_id = ? AND type = 'governs' AND id <> ? LIMIT 1",
            )
            .get(input.targetEntityId, relationshipId)
        : this.db
            .prepare(
              "SELECT id FROM relationships WHERE target_entity_id = ? AND type = 'governs' LIMIT 1",
            )
            .get(input.targetEntityId);
      if (existing) {
        throw new Error("organization may only have one governs relationship");
      }
    }

    return {
      sourceEntityId: input.sourceEntityId,
      targetEntityId: input.targetEntityId,
      type: input.type,
      note: normalizeString(input.note),
      properties: input.properties ?? {},
    };
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
