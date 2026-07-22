import type {
  Entity,
  EntityTag,
  GraphBootstrapPayload,
  Relationship,
  RelationshipTag,
  SavedView,
  Source,
  SystemNode,
  Tag,
} from "../../../../shared/domain";

export interface IndexedGraph extends GraphBootstrapPayload {
  entityById: Record<string, Entity>;
  relationshipById: Record<string, Relationship>;
  sourceById: Record<string, Source>;
  tagById: Record<string, Tag>;
  systemNodeById: Record<string, SystemNode>;
  childrenByParentId: Record<string, string[]>;
  outgoingByEntityId: Record<string, string[]>;
  incomingByEntityId: Record<string, string[]>;
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
  const systemNodeById = Object.fromEntries(
    payload.systemNodes.map((systemNode) => [systemNode.id, systemNode]),
  );

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
    systemNodeById,
    childrenByParentId,
    outgoingByEntityId,
    incomingByEntityId,
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
