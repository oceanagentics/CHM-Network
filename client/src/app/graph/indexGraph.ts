import type {
  Entity,
  EntitySource,
  EntityTag,
  GraphBootstrapPayload,
  Relationship,
  RelationshipSource,
  RelationshipTag,
  SavedView,
  Source,
  Tag,
} from "../../../../shared/domain";

export interface IndexedGraph extends GraphBootstrapPayload {
  entityById: Record<string, Entity>;
  relationshipById: Record<string, Relationship>;
  sourceById: Record<string, Source>;
  tagById: Record<string, Tag>;
  childrenByParentId: Record<string, string[]>;
  outgoingByEntityId: Record<string, string[]>;
  incomingByEntityId: Record<string, string[]>;
  entitySourcesByEntityId: Record<string, EntitySource[]>;
  relationshipSourcesByRelationshipId: Record<string, RelationshipSource[]>;
  entityTagsByEntityId: Record<string, EntityTag[]>;
  relationshipTagsByRelationshipId: Record<string, RelationshipTag[]>;
  savedViewById: Record<string, SavedView>;
}

export function indexGraph(payload: GraphBootstrapPayload): IndexedGraph {
  const entityById = Object.fromEntries(payload.entities.map((entity) => [entity.id, entity]));
  const relationshipById = Object.fromEntries(
    payload.relationships.map((relationship) => [relationship.id, relationship]),
  );
  const sourceById = Object.fromEntries(payload.sources.map((source) => [source.id, source]));
  const tagById = Object.fromEntries(payload.tags.map((tag) => [tag.id, tag]));

  const childrenByParentId: Record<string, string[]> = {};
  for (const entity of payload.entities) {
    if (entity.parentEntityId) {
      childrenByParentId[entity.parentEntityId] ??= [];
      childrenByParentId[entity.parentEntityId].push(entity.id);
    }
  }

  const outgoingByEntityId: Record<string, string[]> = {};
  const incomingByEntityId: Record<string, string[]> = {};
  for (const relationship of payload.relationships) {
    outgoingByEntityId[relationship.sourceEntityId] ??= [];
    outgoingByEntityId[relationship.sourceEntityId].push(relationship.id);
    incomingByEntityId[relationship.targetEntityId] ??= [];
    incomingByEntityId[relationship.targetEntityId].push(relationship.id);
  }

  const entitySourcesByEntityId: Record<string, EntitySource[]> = {};
  for (const entitySource of payload.entitySources) {
    entitySourcesByEntityId[entitySource.entityId] ??= [];
    entitySourcesByEntityId[entitySource.entityId].push(entitySource);
  }

  const relationshipSourcesByRelationshipId: Record<string, RelationshipSource[]> =
    {};
  for (const relationshipSource of payload.relationshipSources) {
    relationshipSourcesByRelationshipId[relationshipSource.relationshipId] ??= [];
    relationshipSourcesByRelationshipId[relationshipSource.relationshipId].push(
      relationshipSource,
    );
  }

  const entityTagsByEntityId: Record<string, EntityTag[]> = {};
  for (const entityTag of payload.entityTags) {
    entityTagsByEntityId[entityTag.entityId] ??= [];
    entityTagsByEntityId[entityTag.entityId].push(entityTag);
  }

  const relationshipTagsByRelationshipId: Record<string, RelationshipTag[]> = {};
  for (const relationshipTag of payload.relationshipTags) {
    relationshipTagsByRelationshipId[relationshipTag.relationshipId] ??= [];
    relationshipTagsByRelationshipId[relationshipTag.relationshipId].push(
      relationshipTag,
    );
  }

  const savedViewById = Object.fromEntries(
    payload.savedViews.map((savedView) => [savedView.id, savedView]),
  );

  return {
    ...payload,
    entityById,
    relationshipById,
    sourceById,
    tagById,
    childrenByParentId,
    outgoingByEntityId,
    incomingByEntityId,
    entitySourcesByEntityId,
    relationshipSourcesByRelationshipId,
    entityTagsByEntityId,
    relationshipTagsByRelationshipId,
    savedViewById,
  };
}

export function collectDescendants(
  graph: IndexedGraph,
  entityId: string,
  visited = new Set<string>(),
): Set<string> {
  if (visited.has(entityId)) {
    return visited;
  }

  visited.add(entityId);
  const children = graph.childrenByParentId[entityId] ?? [];
  for (const childId of children) {
    collectDescendants(graph, childId, visited);
  }

  return visited;
}

export function collectAncestors(
  graph: IndexedGraph,
  entityId: string,
  visited = new Set<string>(),
): Set<string> {
  let current = graph.entityById[entityId];
  while (current?.parentEntityId) {
    if (visited.has(current.parentEntityId)) {
      break;
    }
    visited.add(current.parentEntityId);
    current = graph.entityById[current.parentEntityId];
  }

  return visited;
}

