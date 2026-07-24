/**
 * Graph display planning converts projected graph data into Cytoscape elements
 * and base layout instructions.
 */
import type cytoscape from "cytoscape";

import type { GraphNode, ViewMode } from "../../../../shared/domain";
import type { GraphLayout } from "../state/graphStore";
import type { GraphDisplayMode } from "./cytoscapeStyles";
import type { GovernanceBlock, GraphProjection, GraphProjectionEdgeType } from "./projection";

type GraphNodeData = {
  id: string;
  label: string;
  simpleLabel: string;
  kind: GraphNode["kind"];
  subtype?: string | null;
  countryCode?: string | null;
  governanceBlock?: GovernanceBlock;
  layoutBand: number;
  width: number;
  height: number;
  textMaxWidth: number;
};

type GraphEdgeData = {
  id: string;
  source: string;
  target: string;
  type: GraphProjectionEdgeType;
  label: string;
  isDerivedHierarchy?: boolean;
};

const displayPolicy = {
  directionByView: {
    governance: "TB",
    country: "TB",
    technical: "LR",
  } satisfies Record<ViewMode, "TB" | "LR">,
};

type DisplayPolicy = typeof displayPolicy;

export interface CytoscapeProjectionOutput {
  elements: cytoscape.ElementDefinition[];
  layout: cytoscape.LayoutOptions;
}

function getCytoscapeLayout(
  policy: DisplayPolicy,
  layoutMode: GraphLayout,
  viewMode: ViewMode,
  focusEntityId: string | null,
): cytoscape.LayoutOptions {
  if (layoutMode === "grid") {
    return {
      name: "grid",
      padding: 48,
      avoidOverlap: true,
      fit: false,
      animate: false,
    };
  }

  if (layoutMode === "circle") {
    return {
      name: "circle",
      padding: 48,
      avoidOverlap: true,
      fit: false,
      animate: false,
    };
  }

  if (layoutMode === "concentric") {
    return {
      name: "concentric",
      padding: 48,
      avoidOverlap: true,
      equidistant: true,
      minNodeSpacing: 24,
      concentric: (node: cytoscape.NodeSingular) => 3 - Number(node.data("layoutBand")),
      levelWidth: () => 1,
      fit: false,
      animate: false,
    } as cytoscape.LayoutOptions;
  }

  if (layoutMode === "breadthfirst") {
    return {
      name: "breadthfirst",
      directed: true,
      roots: focusEntityId ? [`#${focusEntityId}`] : undefined,
      padding: 48,
      spacingFactor: 1.2,
      fit: false,
      animate: false,
    };
  }

  if (layoutMode === "cose") {
    return {
      name: "cose",
      padding: 48,
      fit: false,
      animate: false,
    };
  }

  if (layoutMode === "dagre") {
    return {
      name: "dagre",
      rankDir: policy.directionByView[viewMode],
      padding: 48,
      fit: false,
      animate: false,
    } as cytoscape.LayoutOptions;
  }

  if (layoutMode === "fcose") {
    return {
      name: "fcose",
      quality: "default",
      randomize: false,
      padding: 48,
      fit: false,
      animate: false,
    } as cytoscape.LayoutOptions;
  }

  if (layoutMode === "elk-layered") {
    return {
      name: "elk",
      padding: 48,
      fit: false,
      animate: false,
      elk: {
        algorithm: "layered",
        "elk.direction": policy.directionByView[viewMode] === "LR" ? "RIGHT" : "DOWN",
      },
    } as cytoscape.LayoutOptions;
  }

  if (layoutMode === "elk-mrtree") {
    return {
      name: "elk",
      padding: 48,
      fit: false,
      animate: false,
      elk: {
        algorithm: "mrtree",
      },
    } as cytoscape.LayoutOptions;
  }

  if (layoutMode === "elk-stress") {
    return {
      name: "elk",
      padding: 48,
      fit: false,
      animate: false,
      elk: {
        algorithm: "stress",
      },
    } as cytoscape.LayoutOptions;
  }

  return {
    name: "elk",
    padding: 48,
    fit: false,
    animate: false,
    elk: {
      algorithm: "force",
    },
  } as cytoscape.LayoutOptions;
}

export function projectCytoscapeGraph(
  projection: GraphProjection,
  layoutMode: GraphLayout,
  viewMode: ViewMode,
  displayMode: GraphDisplayMode = "diagram",
  policy: DisplayPolicy = displayPolicy,
): CytoscapeProjectionOutput {
  const nodeElements: cytoscape.ElementDefinition[] = projection.nodes.map((node) => ({
    data: {
      id: node.id,
      label: node.label,
      simpleLabel: node.simpleLabel,
      kind: node.kind,
      subtype: node.subtype,
      countryCode: node.countryCode,
      governanceBlock: node.governanceBlock,
      layoutBand: node.layoutBand,
      width: node.width,
      height: node.height,
      textMaxWidth: node.textMaxWidth,
    } satisfies GraphNodeData,
  }));

  const edgeElements: cytoscape.ElementDefinition[] = projection.edges.map((edge) => ({
    data: {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.type,
      label: edge.label,
      isDerivedHierarchy: edge.isDerivedHierarchy,
    } satisfies GraphEdgeData,
  }));

  const phaseLayout = getCytoscapeLayout(
    policy,
    layoutMode,
    viewMode,
    projection.effectiveFocusEntityId,
  );

  return {
    elements: [...nodeElements, ...edgeElements],
    layout: phaseLayout,
  };
}
