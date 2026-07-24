import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs/lib/elk-api";

import { projectGlobeGraph } from "./globeProjection";
import type { GraphProjection, GraphProjectionEdge } from "./projection";

export type NodeMap3dArrangement = "current" | "flat" | "globe";

export type NodeMap3dPosition = {
  x: number;
  y: number;
  z: number;
};

const flatTreeComponentSpacing = 50;
const flatTreeDepthScale = 2;
const flatTreeSiblingSpacing = 12;
export const nodeMap3dGlobeRadius = 520;
export const nodeMap3dStageRadius = nodeMap3dGlobeRadius * 1.4;

const elk = new ELK();

function toGlobePosition(
  lat: number,
  lng: number,
  altitude: number,
): NodeMap3dPosition {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  const radius = nodeMap3dGlobeRadius * (1 + altitude);

  return {
    x: -radius * Math.sin(phi) * Math.cos(theta),
    y: radius * Math.cos(phi),
    z: radius * Math.sin(phi) * Math.sin(theta),
  };
}

function getFlatNodeSize(kind: GraphProjection["nodes"][number]["kind"]) {
  if (kind === "country") {
    return { height: 42, width: 86 };
  }
  if (kind === "organization") {
    return { height: 36, width: 76 };
  }
  return { height: 30, width: 64 };
}

function shouldUseEdgeForFlatTree(edge: GraphProjectionEdge): boolean {
  return (
    edge.type === "governs" ||
    edge.type === "operates" ||
    edge.type === "part_of"
  );
}

function getFlatTreeEndpoints(edge: GraphProjectionEdge): [string, string] {
  if (edge.type === "part_of") {
    return [edge.target, edge.source];
  }

  return [edge.source, edge.target];
}

function makeFlatTreeGraph(projection: GraphProjection): ElkNode {
  const edgeKeys = new Set<string>();
  const edges = projection.edges
    .filter(shouldUseEdgeForFlatTree)
    .flatMap((edge) => {
      const [source, target] = getFlatTreeEndpoints(edge);
      const edgeKey = `${source}:${target}`;
      if (source === target || edgeKeys.has(edgeKey)) {
        return [];
      }

      edgeKeys.add(edgeKey);
      return [{ id: `flat-tree-${edge.id}`, sources: [source], targets: [target] }];
    });

  return {
    id: "flat-tree-root",
    children: projection.nodes.map((node) => ({
      id: node.id,
      ...getFlatNodeSize(node.kind),
    })),
    edges,
    layoutOptions: {
      "org.eclipse.elk.algorithm": "org.eclipse.elk.mrtree",
      "org.eclipse.elk.direction": "RIGHT",
      "org.eclipse.elk.spacing.componentComponent": String(flatTreeComponentSpacing),
      "org.eclipse.elk.spacing.edgeNode": "18",
      "org.eclipse.elk.spacing.nodeNode": String(flatTreeSiblingSpacing),
      "org.eclipse.elk.mrtree.edgeRoutingMode": "AVOID_OVERLAP",
      "org.eclipse.elk.mrtree.searchOrder": "DFS",
    },
  };
}

async function getFlatTargets(projection: GraphProjection): Promise<Map<string, NodeMap3dPosition>> {
  const layout = await elk.layout(makeFlatTreeGraph(projection));
  const targets = new Map<string, NodeMap3dPosition>();
  const centerX = (layout.width ?? 0) / 2;
  const centerY = (layout.height ?? 0) / 2;

  for (const node of layout.children ?? []) {
    if (node.x == null || node.y == null) {
      continue;
    }

    targets.set(node.id, {
      x:
        (node.x + (node.width ?? 0) / 2 - centerX) *
        flatTreeDepthScale,
      y: -(node.y + (node.height ?? 0) / 2 - centerY),
      z: 0,
    });
  }
  return targets;
}

function getGlobeTargets(projection: GraphProjection): Map<string, NodeMap3dPosition> {
  const globeProjection = projectGlobeGraph(projection);
  const targets = new Map<string, NodeMap3dPosition>();
  for (const node of globeProjection.nodes) {
    targets.set(node.id, toGlobePosition(node.lat, node.lng, node.altitude));
  }
  return targets;
}

export async function getNodeMap3dTargets(
  projection: GraphProjection,
  arrangement: Exclude<NodeMap3dArrangement, "current">,
): Promise<Map<string, NodeMap3dPosition>> {
  return arrangement === "flat"
    ? await getFlatTargets(projection)
    : getGlobeTargets(projection);
}
