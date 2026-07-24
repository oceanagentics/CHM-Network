/**
 * Scope selection decides which node ids belong in each high-level view.
 */
import type { IndexedGraph } from "./indexGraph";

export function expandNeighborhood(
  graph: IndexedGraph,
  seedIds: Set<string>,
  depth: number,
): Set<string> {
  const ids = new Set(seedIds);
  let frontier = new Set(seedIds);

  for (let step = 0; step < depth; step += 1) {
    const next = new Set<string>();
    for (const nodeId of frontier) {
      const edgeIds = [
        ...(graph.outgoingByNodeId[nodeId] ?? []),
        ...(graph.incomingByNodeId[nodeId] ?? []),
      ];

      for (const edgeId of edgeIds) {
        const edge = graph.edgeById[edgeId];
        if (!ids.has(edge.sourceNodeId)) {
          ids.add(edge.sourceNodeId);
          next.add(edge.sourceNodeId);
        }
        if (!ids.has(edge.targetNodeId)) {
          ids.add(edge.targetNodeId);
          next.add(edge.targetNodeId);
        }
      }
    }

    frontier = next;
  }

  return ids;
}

export function getGovernanceIds(graph: IndexedGraph): Set<string> {
  return new Set(graph.nodes.map((node) => node.id));
}

export function getCountryIds(graph: IndexedGraph, focusNodeId: string): Set<string> {
  const focusNode = graph.nodeById[focusNodeId];
  const seedIds = new Set<string>(
    graph.nodes
      .filter(
        (node) =>
          node.id === focusNodeId ||
          (focusNode?.countryCode && node.countryCode === focusNode.countryCode),
      )
      .map((node) => node.id),
  );

  return expandNeighborhood(graph, seedIds, 3);
}

export function getTechnicalIds(graph: IndexedGraph, focusNodeId: string): Set<string> {
  return expandNeighborhood(graph, new Set<string>([focusNodeId]), 3);
}
