/**
 * Scope selection decides which entity ids belong in each high-level view.
 */
import { collectAncestors, collectDescendants, type IndexedGraph } from "./indexGraph";

export function expandNeighborhood(
  graph: IndexedGraph,
  seedIds: Set<string>,
  depth: number,
): Set<string> {
  const ids = new Set(seedIds);
  let frontier = new Set(seedIds);

  for (let step = 0; step < depth; step += 1) {
    const next = new Set<string>();
    for (const entityId of frontier) {
      const relationshipIds = [
        ...(graph.outgoingByEntityId[entityId] ?? []),
        ...(graph.incomingByEntityId[entityId] ?? []),
      ];

      for (const relationshipId of relationshipIds) {
        const relationship = graph.relationshipById[relationshipId];
        if (!ids.has(relationship.sourceEntityId)) {
          ids.add(relationship.sourceEntityId);
          next.add(relationship.sourceEntityId);
        }
        if (!ids.has(relationship.targetEntityId)) {
          ids.add(relationship.targetEntityId);
          next.add(relationship.targetEntityId);
        }
      }
    }

    frontier = next;
  }

  return ids;
}

export function getGovernanceIds(graph: IndexedGraph): Set<string> {
  return new Set(graph.entities.map((entity) => entity.id));
}

export function getCountryIds(graph: IndexedGraph, focusEntityId: string): Set<string> {
  const seedIds = collectDescendants(graph, focusEntityId);
  for (const ancestorId of collectAncestors(graph, focusEntityId)) {
    seedIds.add(ancestorId);
  }

  return expandNeighborhood(graph, seedIds, 3);
}

export function getTechnicalIds(graph: IndexedGraph, focusEntityId: string): Set<string> {
  const seedIds = new Set<string>([focusEntityId]);
  for (const ancestorId of collectAncestors(graph, focusEntityId)) {
    seedIds.add(ancestorId);
  }

  return expandNeighborhood(graph, seedIds, 3);
}

export function includeAncestorChains(
  graph: IndexedGraph,
  seedIds: Set<string>,
): Set<string> {
  const ids = new Set(seedIds);
  for (const entityId of seedIds) {
    for (const ancestorId of collectAncestors(graph, entityId)) {
      ids.add(ancestorId);
    }
  }

  return ids;
}
