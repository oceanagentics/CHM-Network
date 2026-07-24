/**
 * Structural projection turns scoped graph data into visible nodes and edges.
 */
import type { GraphEdge, GraphNode, ViewMode } from "../../../../shared/domain";
import type { CountryDisplayMode } from "../state/graphStore";
import { buildLabel, getLayoutBand, getNodeDimensions, type NodeGeometry } from "./geometry";
import type { IndexedGraph } from "./indexGraph";
import {
  getCountryIds,
  getGovernanceIds,
  getTechnicalIds,
} from "./scope";

export interface ProjectionInput {
  graph: IndexedGraph;
  viewMode: ViewMode;
  countryDisplayMode: CountryDisplayMode;
  focusEntityId: string | null;
  searchEntityIds?: ReadonlySet<string> | null;
}

export type GovernanceBlock = "national" | "international" | null;

export interface GraphProjectionNode extends NodeGeometry {
  id: string;
  label: string;
  simpleLabel: string;
  kind: GraphNode["kind"];
  subtype: string | null;
  countryCode: string | null;
  governanceBlock: GovernanceBlock;
  layoutBand: number;
}

export type GraphProjectionEdgeType = GraphEdge["kind"];

export interface GraphProjectionEdge {
  id: string;
  source: string;
  target: string;
  type: GraphProjectionEdgeType;
  label: string;
  isDerivedHierarchy: boolean;
}

export interface GraphProjection {
  nodes: GraphProjectionNode[];
  edges: GraphProjectionEdge[];
  effectiveFocusEntityId: string | null;
}

const governanceInternationalBandByKind = {
  country: 5,
  organization: 4,
  system: 3,
} satisfies Record<GraphNode["kind"], number>;

function getProjectionLayoutBand(
  node: GraphNode,
  viewMode: ViewMode,
  governanceInternationalIds: Set<string>,
): number {
  if (viewMode === "governance" && governanceInternationalIds.has(node.id)) {
    return governanceInternationalBandByKind[node.kind];
  }

  return getLayoutBand(node.kind);
}

function getGovernanceBlock(
  nodeId: string,
  viewMode: ViewMode,
  governanceInternationalIds: Set<string>,
): GovernanceBlock {
  if (viewMode !== "governance") {
    return null;
  }

  return governanceInternationalIds.has(nodeId) ? "international" : "national";
}

function buildProjectionNode(
  node: GraphNode,
  governanceBlock: GovernanceBlock,
  layoutBand: number,
): GraphProjectionNode {
  const label = buildLabel(node);

  return {
    id: node.id,
    label,
    simpleLabel: node.name,
    kind: node.kind,
    subtype: node.subtype,
    countryCode: node.countryCode,
    governanceBlock,
    layoutBand,
    ...getNodeDimensions(node.kind, label),
  };
}

function edgeLabel(kind: GraphProjectionEdgeType): string {
  switch (kind) {
    case "governs":
      return "governs";
    case "operates":
      return "operates";
    case "part_of":
      return "part of";
    case "publishes_to":
      return "publishes to";
    case "syncs_to":
      return "syncs to";
  }
}

export function projectGraph(input: ProjectionInput): GraphProjection {
  const {
    graph,
    viewMode,
    focusEntityId,
    searchEntityIds = null,
  } = input;

  const defaultCountry = graph.nodes.find((node) => node.kind === "country")?.id ?? null;
  const defaultSystem = graph.nodes.find((node) => node.kind === "system")?.id ?? null;
  const effectiveFocusEntityId =
    focusEntityId ?? (viewMode === "technical" ? defaultSystem : defaultCountry);

  let includedIds = new Set<string>();
  if (searchEntityIds) {
    includedIds = new Set(searchEntityIds);
  } else if (viewMode === "governance") {
    includedIds = getGovernanceIds(graph);
  } else if (viewMode === "country" && effectiveFocusEntityId) {
    includedIds = getCountryIds(graph, effectiveFocusEntityId);
  } else if (viewMode === "technical" && effectiveFocusEntityId) {
    includedIds = getTechnicalIds(graph, effectiveFocusEntityId);
  }

  const includedNodes = graph.nodes.filter((node) => includedIds.has(node.id));
  const visibleIds = new Set(includedNodes.map((node) => node.id));
  const governanceInternationalIds = new Set<string>();

  if (viewMode === "governance") {
    for (const node of includedNodes) {
      if (node.countryCode === "INT") {
        governanceInternationalIds.add(node.id);
      }
    }
  }

  const nodes = includedNodes.map((node) =>
    buildProjectionNode(
      node,
      getGovernanceBlock(node.id, viewMode, governanceInternationalIds),
      getProjectionLayoutBand(node, viewMode, governanceInternationalIds),
    ),
  );

  const edges: GraphProjectionEdge[] = graph.edges
    .filter(
      (edge) =>
        visibleIds.has(edge.sourceNodeId) &&
        visibleIds.has(edge.targetNodeId),
    )
    .map((edge) => ({
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      type: edge.kind,
      label: edgeLabel(edge.kind),
      isDerivedHierarchy: false,
    }));

  return {
    nodes,
    edges,
    effectiveFocusEntityId,
  };
}
