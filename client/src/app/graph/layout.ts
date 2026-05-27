/**
 * Layout translation converts projected graph data into Cytoscape elements, engine options, and optional post-passes.
 */
import type cytoscape from "cytoscape";

import type { Entity, Relationship, ViewMode } from "../../../../shared/domain";
import type { GraphLayout } from "../state/graphStore";
import { layoutPolicy, type LayoutPolicy } from "./layoutPolicy";
import type {
  GraphProjection,
  GraphProjectionEdgeType,
} from "./projection";

type GraphNodeData = {
  id: string;
  label: string;
  kind: Entity["kind"];
  status: Entity["status"];
  subtype?: string | null;
  layoutBand: number;
  width: number;
  height: number;
  textMaxWidth: number;
  parent?: string;
};

type GraphEdgeData = {
  id: string;
  source: string;
  target: string;
  type: GraphProjectionEdgeType;
  status: Relationship["status"];
  label: string;
  isDerivedHierarchy?: boolean;
};

export type GraphPostPass = (cy: cytoscape.Core) => void;

export interface CytoscapeProjectionOutput {
  elements: cytoscape.ElementDefinition[];
  layout: cytoscape.LayoutOptions;
  postPass?: GraphPostPass;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle] ?? 0;
}

function getBandGapUnits(
  policy: LayoutPolicy,
  lowerBand: number,
  upperBand: number,
): number {
  return policy.bandGapUnits[`${lowerBand}-${upperBand}` as keyof typeof policy.bandGapUnits] ?? 1;
}

function getBandOffsetUnits(
  policy: LayoutPolicy,
  startBand: number,
  endBand: number,
): number {
  if (startBand === endBand) {
    return 0;
  }

  let units = 0;
  const direction = startBand < endBand ? 1 : -1;

  for (let band = startBand; band !== endBand; band += direction) {
    const nextBand = band + direction;
    units +=
      direction > 0
        ? getBandGapUnits(policy, band, nextBand)
        : getBandGapUnits(policy, nextBand, band);
  }

  return units;
}

function getVisibleConnectionCount(node: cytoscape.NodeSingular): number {
  return node
    .connectedEdges()
    .filter((edge) => !edge.data("isDerivedHierarchy"))
    .length;
}

function createSoftBandingPostPass(policy: LayoutPolicy): GraphPostPass {
  return (cy) => {
    const leafNodes = cy.nodes().filter((node) => !node.isParent());
    if (leafNodes.length < 2) {
      return;
    }

    const nodesByBand = new Map<number, cytoscape.NodeSingular[]>();
    for (const node of leafNodes) {
      const layoutBand = Number(node.data("layoutBand"));
      if (Number.isNaN(layoutBand)) {
        continue;
      }
      const bandNodes = nodesByBand.get(layoutBand) ?? [];
      bandNodes.push(node);
      nodesByBand.set(layoutBand, bandNodes);
    }

    const bands = [...nodesByBand.keys()].sort((left, right) => left - right);
    if (bands.length < 2) {
      return;
    }

    const firstBand = bands[0];
    const lastBand = bands[bands.length - 1];
    const allY = [...leafNodes].map((node) => node.position("y"));
    const minY = Math.min(...allY);
    const maxY = Math.max(...allY);
    if (!Number.isFinite(minY) || !Number.isFinite(maxY) || Math.abs(maxY - minY) < 1) {
      return;
    }

    const bandCenters = new Map<number, number>();
    for (const band of bands) {
      const bandNodes = nodesByBand.get(band) ?? [];
      bandCenters.set(
        band,
        median(bandNodes.map((node) => node.position("y"))),
      );
    }

    const naturalBandSpan = Math.max(lastBand - firstBand, 1);
    const baseSpacing = (maxY - minY) / naturalBandSpan;

    cy.batch(() => {
      bands.forEach((band) => {
        const sourceCenter = bandCenters.get(band);
        if (sourceCenter == null) {
          return;
        }
        const targetCenter =
          minY + baseSpacing * getBandOffsetUnits(policy, firstBand, band);
        for (const node of nodesByBand.get(band) ?? []) {
          const currentY = node.position("y");
          const connectionOffset =
            band === policy.denseSystemSeparation.band
              ? baseSpacing *
                Math.min(
                  Math.max(getVisibleConnectionCount(node) - 1, 0) *
                    policy.denseSystemSeparation.slope,
                  policy.denseSystemSeparation.cap,
                )
              : 0;
          node.position({
            x: node.position("x"),
            y:
              targetCenter +
              connectionOffset +
              (currentY - sourceCenter) * policy.denseSystemSeparation.retainFraction,
          });
        }
      });
    });
  };
}

function dagreEdgeWeight(
  policy: LayoutPolicy,
  viewMode: ViewMode,
  edge: cytoscape.EdgeSingular,
): number {
  const type = edge.data("type") as GraphProjectionEdgeType;
  return policy.edgeWeightByView[viewMode][type];
}

function dagreMinLen(
  policy: LayoutPolicy,
  viewMode: ViewMode,
  edge: cytoscape.EdgeSingular,
): number {
  const type = edge.data("type") as GraphProjectionEdgeType;
  return policy.edgeMinLengthByView[viewMode][type];
}

function getCytoscapeLayout(
  policy: LayoutPolicy,
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
      rankSep: 80,
      nodeSep: 32,
      edgeSep: 18,
      edgeWeight: (edge: cytoscape.EdgeSingular) => dagreEdgeWeight(policy, viewMode, edge),
      minLen: (edge: cytoscape.EdgeSingular) => dagreMinLen(policy, viewMode, edge),
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
        "elk.hierarchyHandling": "INCLUDE_CHILDREN",
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
        "elk.hierarchyHandling": "INCLUDE_CHILDREN",
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
        "elk.hierarchyHandling": "INCLUDE_CHILDREN",
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
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
    },
  } as cytoscape.LayoutOptions;
}

function getPostPass(
  policy: LayoutPolicy,
  layoutMode: GraphLayout,
): GraphPostPass | undefined {
  if (
    layoutMode === "dagre" ||
    layoutMode === "breadthfirst" ||
    layoutMode === "elk-layered" ||
    layoutMode === "elk-mrtree"
  ) {
    return createSoftBandingPostPass(policy);
  }

  return undefined;
}

export function projectCytoscapeGraph(
  projection: GraphProjection,
  layoutMode: GraphLayout,
  viewMode: ViewMode,
  policy: LayoutPolicy = layoutPolicy,
): CytoscapeProjectionOutput {
  const suppressDerivedHierarchyEdges = layoutMode.startsWith("elk-");
  const nodeElements: cytoscape.ElementDefinition[] = projection.nodes.map((node) => ({
    data: {
      id: node.id,
      label: node.label,
      kind: node.kind,
      status: node.status,
      subtype: node.subtype,
      layoutBand: node.layoutBand,
      width: node.width,
      height: node.height,
      textMaxWidth: node.textMaxWidth,
      parent: node.parentId,
    } satisfies GraphNodeData,
    classes: node.isFocus ? "is-focus" : "",
  }));

  const edgeElements: cytoscape.ElementDefinition[] = projection.edges
    .filter((edge) => !suppressDerivedHierarchyEdges || !edge.isDerivedHierarchy)
    .map((edge) => ({
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: edge.type,
        status: edge.status,
        label: edge.label,
        isDerivedHierarchy: edge.isDerivedHierarchy,
      } satisfies GraphEdgeData,
    }));

  return {
    elements: [...nodeElements, ...edgeElements],
    layout: getCytoscapeLayout(
      policy,
      layoutMode,
      viewMode,
      projection.effectiveFocusEntityId,
    ),
    postPass: getPostPass(policy, layoutMode),
  };
}
