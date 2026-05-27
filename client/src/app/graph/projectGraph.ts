/**
 * Compatibility facade that preserves the old graph API while delegating to layered modules.
 */
export {
  projectGraph,
  type GraphProjection,
  type GraphProjectionEdge,
  type GraphProjectionEdgeType,
  type GraphProjectionNode,
  type ProjectionInput,
} from "./projection";
export {
  projectCytoscapeGraph,
  type CytoscapeProjectionOutput,
  type GraphPostPass,
} from "./layout";
