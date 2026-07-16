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
  SystemAccessPath,
  SystemDataClaim,
  SystemIdentifierScheme,
  SystemProfile,
  SystemSubmissionPath,
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
  systemProfileBySystemId: Record<string, SystemProfile>;
  systemDataClaimsBySystemId: Record<string, SystemDataClaim[]>;
  systemAccessPathsBySystemId: Record<string, SystemAccessPath[]>;
  systemSubmissionPathsBySystemId: Record<string, SystemSubmissionPath[]>;
  systemIdentifierSchemesBySystemId: Record<string, SystemIdentifierScheme[]>;
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
  const systemProfileBySystemId = Object.fromEntries(
    payload.systemProfiles.map((profile) => [profile.systemId, profile]),
  );

  const systemDataClaimsBySystemId: Record<string, SystemDataClaim[]> = {};
  for (const claim of payload.systemDataClaims) {
    systemDataClaimsBySystemId[claim.systemId] ??= [];
    systemDataClaimsBySystemId[claim.systemId].push(claim);
  }

  const systemAccessPathsBySystemId: Record<string, SystemAccessPath[]> = {};
  for (const accessPath of payload.systemAccessPaths) {
    systemAccessPathsBySystemId[accessPath.systemId] ??= [];
    systemAccessPathsBySystemId[accessPath.systemId].push(accessPath);
  }

  const systemSubmissionPathsBySystemId: Record<string, SystemSubmissionPath[]> = {};
  for (const submissionPath of payload.systemSubmissionPaths) {
    systemSubmissionPathsBySystemId[submissionPath.systemId] ??= [];
    systemSubmissionPathsBySystemId[submissionPath.systemId].push(submissionPath);
  }

  const systemIdentifierSchemesBySystemId: Record<string, SystemIdentifierScheme[]> =
    {};
  for (const identifierScheme of payload.systemIdentifierSchemes) {
    systemIdentifierSchemesBySystemId[identifierScheme.systemId] ??= [];
    systemIdentifierSchemesBySystemId[identifierScheme.systemId].push(identifierScheme);
  }

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
    systemProfileBySystemId,
    systemDataClaimsBySystemId,
    systemAccessPathsBySystemId,
    systemSubmissionPathsBySystemId,
    systemIdentifierSchemesBySystemId,
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
