import type {
  GraphBootstrapPayload,
  GraphEdge,
  GraphNode,
  RyuRoute,
  SavedView,
  Source,
} from "../../../../shared/domain";

export interface IndexedGraph extends GraphBootstrapPayload {
  nodeById: Record<string, GraphNode>;
  edgeById: Record<string, GraphEdge>;
  sourceById: Record<string, Source>;
  ryuRoutesByNodeId: Record<string, RyuRoute[]>;
  outgoingByNodeId: Record<string, string[]>;
  incomingByNodeId: Record<string, string[]>;
  savedViewById: Record<string, SavedView>;
}

export function indexGraph(payload: GraphBootstrapPayload): IndexedGraph {
  const nodeById = Object.fromEntries(payload.nodes.map((node) => [node.id, node]));
  const edgeById = Object.fromEntries(
    payload.edges.map((edge) => [edge.id, edge]),
  );
  const sourceById = Object.fromEntries(payload.sources.map((source) => [source.id, source]));

  const ryuRoutesByNodeId: Record<string, RyuRoute[]> = {};
  for (const route of payload.ryuRoutes) {
    ryuRoutesByNodeId[route.nodeId] ??= [];
    ryuRoutesByNodeId[route.nodeId].push(route);
  }

  const outgoingByNodeId: Record<string, string[]> = {};
  const incomingByNodeId: Record<string, string[]> = {};
  for (const edge of payload.edges) {
    outgoingByNodeId[edge.sourceNodeId] ??= [];
    outgoingByNodeId[edge.sourceNodeId].push(edge.id);
    incomingByNodeId[edge.targetNodeId] ??= [];
    incomingByNodeId[edge.targetNodeId].push(edge.id);
  }

  const savedViewById = Object.fromEntries(
    payload.savedViews.map((savedView) => [savedView.id, savedView]),
  );

  return {
    ...payload,
    nodeById,
    edgeById,
    sourceById,
    ryuRoutesByNodeId,
    outgoingByNodeId,
    incomingByNodeId,
    savedViewById,
  };
}
