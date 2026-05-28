/**
 * Graph display planning converts projected graph data into Cytoscape elements,
 * base layout instructions, and named post-layout transforms.
 */
import type cytoscape from "cytoscape";

import type { Entity, Relationship, ViewMode } from "../../../../shared/domain";
import type { GraphLayout } from "../state/graphStore";
import type {
  GovernanceBlock,
  GraphProjection,
  GraphProjectionEdgeType,
} from "./projection";

type GraphNodeData = {
  id: string;
  label: string;
  kind: Entity["kind"];
  status: Entity["status"];
  subtype?: string | null;
  countryCode?: string | null;
  governanceBlock?: GovernanceBlock;
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

const displayPolicy = {
  bandGapUnits: {
    "0-1": 1,
    "1-2": 0.4,
    "2-3": 1,
    "3-4": 0.4,
    "4-5": 1,
  },
  denseSystemSeparation: {
    bands: [2, 3],
    slope: 0.12,
    cap: 0.6,
    retainFraction: 0.25,
  },
  edgeWeightByView: {
    governance: {
      governs: 10,
      operates: 10,
      publishes_to: 3,
      syncs_to: 1,
      hierarchy: 12,
    },
    country: {
      governs: 10,
      operates: 10,
      publishes_to: 3,
      syncs_to: 1,
      hierarchy: 12,
    },
    technical: {
      governs: 4,
      operates: 4,
      publishes_to: 10,
      syncs_to: 10,
      hierarchy: 3,
    },
  },
  edgeMinLengthByView: {
    governance: {
      governs: 2,
      operates: 2,
      publishes_to: 1,
      syncs_to: 1,
      hierarchy: 2,
    },
    country: {
      governs: 2,
      operates: 2,
      publishes_to: 1,
      syncs_to: 1,
      hierarchy: 2,
    },
    technical: {
      governs: 1,
      operates: 1,
      publishes_to: 2,
      syncs_to: 2,
      hierarchy: 1,
    },
  },
  directionByView: {
    governance: "TB",
    country: "TB",
    technical: "LR",
  } satisfies Record<ViewMode, "TB" | "LR">,
};

type DisplayPolicy = typeof displayPolicy;

export const postLayoutTransformNames = ["softBanding", "intBlockAnchor"] as const;
export type PostLayoutTransformName = (typeof postLayoutTransformNames)[number];
export type EnabledPostLayoutTransforms = Record<PostLayoutTransformName, boolean>;

export interface PostLayoutTransform {
  name: PostLayoutTransformName;
  apply: (cy: cytoscape.Core) => void;
}

interface CytoscapeProjectionBase {
  elements: cytoscape.ElementDefinition[];
  postLayoutTransforms: PostLayoutTransform[];
}

export interface SingleCytoscapeProjectionOutput extends CytoscapeProjectionBase {
  mode: "single";
  layout: cytoscape.LayoutOptions;
}

export interface GovernanceTwoPhaseProjectionOutput extends CytoscapeProjectionBase {
  mode: "governance-two-phase";
  phaseLayout: cytoscape.LayoutOptions;
  nationalNodeIds: string[];
  internationalNodeIds: string[];
  nationalEdgeIds: string[];
  internationalEdgeIds: string[];
  crossBlockEdgeIds: string[];
}

export type CytoscapeProjectionOutput =
  | SingleCytoscapeProjectionOutput
  | GovernanceTwoPhaseProjectionOutput;

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle] ?? 0;
}

function getBandGapUnits(
  policy: DisplayPolicy,
  lowerBand: number,
  upperBand: number,
): number {
  return policy.bandGapUnits[`${lowerBand}-${upperBand}` as keyof typeof policy.bandGapUnits] ?? 1;
}

function getBandOffsetUnits(
  policy: DisplayPolicy,
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

function createSoftBandingTransform(policy: DisplayPolicy): PostLayoutTransform {
  return {
    name: "softBanding",
    apply: (cy) => {
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
              policy.denseSystemSeparation.bands.includes(band)
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
    },
  };
}

function createIntBlockAnchorTransform(
  nationalNodeIds: string[],
  internationalNodeIds: string[],
  crossBlockEdgeIds: string[],
): PostLayoutTransform {
  return {
    name: "intBlockAnchor",
    apply: (cy) => {
      const nationalNodeIdSet = new Set(nationalNodeIds);
      const internationalNodeIdSet = new Set(internationalNodeIds);
      const blockNodesByCode = new Map<string, cytoscape.NodeCollection>();

      cy.nodes().forEach((node) => {
        if (!nationalNodeIdSet.has(node.id())) {
          return;
        }

        const countryCode = node.data("countryCode");
        if (typeof countryCode !== "string" || countryCode.length === 0) {
          return;
        }

        const existing = blockNodesByCode.get(countryCode);
        blockNodesByCode.set(
          countryCode,
          existing ? existing.union(node) : cy.collection().union(node),
        );
      });

      if (blockNodesByCode.size === 0) {
        return;
      }

      const blockCenterByCode = new Map<string, number>();
      let nationalLeft = Number.POSITIVE_INFINITY;
      let nationalRight = Number.NEGATIVE_INFINITY;

      for (const [countryCode, nodes] of blockNodesByCode.entries()) {
        const box = nodes.boundingBox({
          includeLabels: true,
          includeOverlays: false,
        });
        blockCenterByCode.set(countryCode, (box.x1 + box.x2) / 2);
        nationalLeft = Math.min(nationalLeft, box.x1);
        nationalRight = Math.max(nationalRight, box.x2);
      }

      const touchedCountryCodes = new Set<string>();
      for (const edgeId of crossBlockEdgeIds) {
        const edge = cy.$id(edgeId);
        if (edge.empty()) {
          continue;
        }

        const source = edge.source();
        const target = edge.target();
        if (nationalNodeIdSet.has(source.id())) {
          const countryCode = source.data("countryCode");
          if (typeof countryCode === "string" && countryCode.length > 0) {
            touchedCountryCodes.add(countryCode);
          }
        }
        if (nationalNodeIdSet.has(target.id())) {
          const countryCode = target.data("countryCode");
          if (typeof countryCode === "string" && countryCode.length > 0) {
            touchedCountryCodes.add(countryCode);
          }
        }
      }

      const touchedCenters = [...touchedCountryCodes]
        .map((countryCode) => blockCenterByCode.get(countryCode))
        .filter((center): center is number => center != null);
      const targetCenter =
        touchedCenters.length > 0
          ? median(touchedCenters)
          : Number.isFinite(nationalLeft) && Number.isFinite(nationalRight)
            ? (nationalLeft + nationalRight) / 2
            : null;

      if (targetCenter == null) {
        return;
      }

      const internationalNodes = cy
        .nodes()
        .filter((node: cytoscape.NodeSingular) => internationalNodeIdSet.has(node.id()));
      if (internationalNodes.empty()) {
        return;
      }

      const internationalLeafNodes = internationalNodes.filter(
        (node: cytoscape.NodeSingular) => !node.isParent(),
      );
      const box = internationalNodes.boundingBox({
        includeLabels: true,
        includeOverlays: false,
      });
      const deltaX = targetCenter - (box.x1 + box.x2) / 2;
      if (!Number.isFinite(deltaX) || Math.abs(deltaX) < 1) {
        return;
      }

      cy.batch(() => {
        internationalLeafNodes.forEach((node) => {
          node.position({
            x: node.position("x") + deltaX,
            y: node.position("y"),
          });
        });
      });
    },
  };
}

function dagreEdgeWeight(
  policy: DisplayPolicy,
  viewMode: ViewMode,
  edge: cytoscape.EdgeSingular,
): number {
  const type = edge.data("type") as GraphProjectionEdgeType;
  return policy.edgeWeightByView[viewMode][type];
}

function dagreMinLen(
  policy: DisplayPolicy,
  viewMode: ViewMode,
  edge: cytoscape.EdgeSingular,
): number {
  const type = edge.data("type") as GraphProjectionEdgeType;
  return policy.edgeMinLengthByView[viewMode][type];
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

function usesHierarchicalGovernanceLayout(
  layoutMode: GraphLayout,
  viewMode: ViewMode,
): boolean {
  return (
    viewMode === "governance" &&
    (layoutMode === "dagre" ||
      layoutMode === "breadthfirst" ||
      layoutMode === "elk-layered" ||
      layoutMode === "elk-mrtree")
  );
}

function usesSoftBanding(layoutMode: GraphLayout): boolean {
  return (
    layoutMode === "dagre" ||
    layoutMode === "breadthfirst" ||
    layoutMode === "elk-layered" ||
    layoutMode === "elk-mrtree"
  );
}

export function getAvailablePostLayoutTransformNames(
  layoutMode: GraphLayout,
  viewMode: ViewMode,
): PostLayoutTransformName[] {
  const transformNames: PostLayoutTransformName[] = [];

  if (usesSoftBanding(layoutMode)) {
    transformNames.push("softBanding");
  }

  if (usesHierarchicalGovernanceLayout(layoutMode, viewMode)) {
    transformNames.push("intBlockAnchor");
  }

  return transformNames;
}

function getPostLayoutTransforms(
  policy: DisplayPolicy,
  layoutMode: GraphLayout,
): PostLayoutTransform[] {
  return usesSoftBanding(layoutMode) ? [createSoftBandingTransform(policy)] : [];
}

export function projectCytoscapeGraph(
  projection: GraphProjection,
  layoutMode: GraphLayout,
  viewMode: ViewMode,
  policy: DisplayPolicy = displayPolicy,
): CytoscapeProjectionOutput {
  const suppressDerivedHierarchyEdges = layoutMode.startsWith("elk-");
  const visibleEdges = projection.edges.filter(
    (edge) => !suppressDerivedHierarchyEdges || !edge.isDerivedHierarchy,
  );
  const nodeElements: cytoscape.ElementDefinition[] = projection.nodes.map((node) => ({
    data: {
      id: node.id,
      label: node.label,
      kind: node.kind,
      status: node.status,
      subtype: node.subtype,
      countryCode: node.countryCode,
      governanceBlock: node.governanceBlock,
      layoutBand: node.layoutBand,
      width: node.width,
      height: node.height,
      textMaxWidth: node.textMaxWidth,
      parent: node.parentId,
    } satisfies GraphNodeData,
  }));

  const edgeElements: cytoscape.ElementDefinition[] = visibleEdges.map((edge) => ({
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

  const phaseLayout = getCytoscapeLayout(
    policy,
    layoutMode,
    viewMode,
    projection.effectiveFocusEntityId,
  );
  const postLayoutTransforms = getPostLayoutTransforms(policy, layoutMode);

  if (!usesHierarchicalGovernanceLayout(layoutMode, viewMode)) {
    return {
      mode: "single",
      elements: [...nodeElements, ...edgeElements],
      layout: phaseLayout,
      postLayoutTransforms,
    };
  }

  const nationalNodeIds = projection.nodes
    .filter((node) => node.governanceBlock === "national")
    .map((node) => node.id);
  const internationalNodeIds = projection.nodes
    .filter((node) => node.governanceBlock === "international")
    .map((node) => node.id);

  if (nationalNodeIds.length === 0 || internationalNodeIds.length === 0) {
    return {
      mode: "single",
      elements: [...nodeElements, ...edgeElements],
      layout: phaseLayout,
      postLayoutTransforms,
    };
  }

  const nodeBlockById = Object.fromEntries(
    projection.nodes.map((node) => [node.id, node.governanceBlock]),
  ) as Record<string, GovernanceBlock>;

  const nationalEdgeIds: string[] = [];
  const internationalEdgeIds: string[] = [];
  const crossBlockEdgeIds: string[] = [];

  for (const edge of visibleEdges) {
    const sourceBlock = nodeBlockById[edge.source];
    const targetBlock = nodeBlockById[edge.target];

    if (sourceBlock === "national" && targetBlock === "national") {
      nationalEdgeIds.push(edge.id);
      continue;
    }

    if (sourceBlock === "international" && targetBlock === "international") {
      internationalEdgeIds.push(edge.id);
      continue;
    }

    if (sourceBlock != null && targetBlock != null && sourceBlock !== targetBlock) {
      crossBlockEdgeIds.push(edge.id);
    }
  }

  return {
    mode: "governance-two-phase",
    elements: [...nodeElements, ...edgeElements],
    phaseLayout,
    nationalNodeIds,
    internationalNodeIds,
    nationalEdgeIds,
    internationalEdgeIds,
    crossBlockEdgeIds,
    postLayoutTransforms: [
      createIntBlockAnchorTransform(
        nationalNodeIds,
        internationalNodeIds,
        crossBlockEdgeIds,
      ),
      ...postLayoutTransforms,
    ],
  };
}
