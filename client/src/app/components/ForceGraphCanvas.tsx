import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type WheelEvent as ReactWheelEvent,
} from "react";
import ForceGraph3D, {
  type ForceGraphMethods,
  type GraphData,
  type LinkObject,
  type NodeObject,
} from "react-force-graph-3d";
import * as THREE from "three";

import {
  createNodeMap3dGlobe,
  disposeNodeMap3dObject,
  updateNodeMap3dGlobe,
} from "./nodeMap3dGlobeScene";
import {
  getNodeMap3dTargets,
  nodeMap3dGlobeRadius,
  nodeMap3dStageRadius,
  type NodeMap3dArrangement,
  type NodeMap3dPosition,
} from "../graph/nodeMap3dLayout";
import {
  projectGraph,
  type GraphProjection,
  type GraphProjectionEdgeType,
  type GraphProjectionNode,
} from "../graph/projection";
import { resolveGraphSearch } from "../search";
import { useGraphStore } from "../state/graphStore";

type ForceGraphNode = {
  id: string;
  label: string;
  kind: GraphProjectionNode["kind"];
  governanceBlock: GraphProjectionNode["governanceBlock"];
  layoutBand: number;
  degree: number;
  priority: number;
  val: number;
};

type ForceGraphLink = {
  id: string;
  source: string;
  target: string;
  type: GraphProjectionEdgeType;
  label: string;
  isDerivedHierarchy: boolean;
};

type RenderNode = NodeObject<ForceGraphNode>;
type RenderLink = LinkObject<ForceGraphNode, ForceGraphLink>;
type ForceGraphData = GraphData<ForceGraphNode, ForceGraphLink>;
type ForceGraphHandle = ForceGraphMethods<ForceGraphNode, ForceGraphLink>;

type LabelPlacement = {
  id: string;
  label: string;
  opacity: number;
  x: number;
  y: number;
  width: number;
  selected: boolean;
  focused: boolean;
  neighbor: boolean;
  kind: ForceGraphNode["kind"];
};

type Rect = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

type Size = {
  height: number;
  width: number;
};

type D3ForceLink = {
  distance: (value: number | ((link: RenderLink) => number)) => D3ForceLink;
  strength: (value: number | ((link: RenderLink) => number)) => D3ForceLink;
};

type D3ForceManyBody = {
  strength: (value: number | ((node: RenderNode) => number)) => D3ForceManyBody;
};

type D3ForceCenter = {
  strength?: (value: number) => D3ForceCenter;
  x: (value: number) => D3ForceCenter;
  y: (value: number) => D3ForceCenter;
  z?: (value: number) => D3ForceCenter;
};

type CameraControls = {
  addEventListener?: (
    type: "start" | "end" | "change",
    listener: (event?: unknown) => void,
  ) => void;
  autoRotate?: boolean;
  autoRotateSpeed?: number;
  dampingFactor?: number;
  enableDamping?: boolean;
  enablePan?: boolean;
  enableRotate?: boolean;
  mouseButtons?: {
    LEFT?: number;
    MIDDLE?: number;
    RIGHT?: number;
  };
  noRotate?: boolean;
  panSpeed?: number;
  removeEventListener?: (
    type: "start" | "end" | "change",
    listener: (event?: unknown) => void,
  ) => void;
  target?: THREE.Vector3;
  update?: () => void;
};

type Coords = {
  x: number;
  y: number;
  z: number;
};

interface ForceGraphCanvasProps {
  arrangement?: NodeMap3dArrangement;
}

const nodeColorByKind = {
  country: "#f7d470",
  organization: "#9ad29d",
  system: "#8fc7ff",
} satisfies Record<ForceGraphNode["kind"], string>;
const selectedOrange = "#ff4f2f";
const connectedOrange = "#ff785e";

const linkColorByType = {
  governs: "#c8dfff",
  operates: "#9fe3d0",
  part_of: "#8fb3db",
  publishes_to: "#ff6b78",
  syncs_to: "#c99cff",
} satisfies Record<GraphProjectionEdgeType, string>;

const nodeTransitionDurationMs = 900;
const nodeMap3dStageCameraFov = 50;
const nodeMap3dStageCameraDistance = nodeMap3dStageRadius * 3.2;
const nodeMap3dStageCameraPosition = {
  x: 0,
  y: 0,
  z: nodeMap3dStageCameraDistance,
};
const nodeMap3dStageOffAxisCameraPosition = {
  x: nodeMap3dStageRadius * 0.38,
  y: nodeMap3dStageRadius * 0.22,
  z: nodeMap3dStageCameraDistance * 0.98,
};
const nodeMap3dStageLookAt = { x: 0, y: 0, z: 0 };
const nodeMap3dAutoRotateSpeed = 0.18;
const nodeMap3dGlobeAutoRotateSpeed = 0.22;
const globeOverlayFadeDurationMs = 520;
const globeLinkSegments = 44;
const labelCollisionInset = 4;
const labelFarDepthOpacity = 0.34;
const labelDepthPriorityBoost = 140;

function getNodeValue(kind: ForceGraphNode["kind"]): number {
  if (kind === "country") {
    return 8;
  }
  if (kind === "organization") {
    return 5.5;
  }
  return 3.6;
}

function getNodePriority(
  node: GraphProjectionNode,
  degree: number,
): number {
  const kindPriority =
    node.kind === "country" ? 300 : node.kind === "organization" ? 200 : 100;
  const blockPriority = node.governanceBlock === "international" ? 80 : 0;

  return kindPriority + blockPriority + degree * 8;
}

function buildForceGraphData(projection: GraphProjection): ForceGraphData {
  const degreeByNodeId = new Map<string, number>();
  for (const edge of projection.edges) {
    degreeByNodeId.set(edge.source, (degreeByNodeId.get(edge.source) ?? 0) + 1);
    degreeByNodeId.set(edge.target, (degreeByNodeId.get(edge.target) ?? 0) + 1);
  }

  return {
    nodes: projection.nodes.map((node) => {
      const degree = degreeByNodeId.get(node.id) ?? 0;
      return {
        id: node.id,
        label: node.simpleLabel,
        kind: node.kind,
        governanceBlock: node.governanceBlock,
        layoutBand: node.layoutBand,
        degree,
        priority: getNodePriority(node, degree),
        val: getNodeValue(node.kind),
      };
    }),
    links: projection.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.type,
      label: edge.label,
      isDerivedHierarchy: edge.isDerivedHierarchy,
    })),
  };
}

function getEndpointId(endpoint: unknown): string {
  if (typeof endpoint === "object" && endpoint != null && "id" in endpoint) {
    return String((endpoint as { id?: string | number }).id);
  }

  return String(endpoint ?? "");
}

function getHighlightedGraphState(
  links: RenderLink[],
  selectedEntityId: string | null,
  selectedRelationshipId: string | null,
) {
  const nodeIds = new Set<string>();
  const linkIds = new Set<string>();

  if (selectedEntityId) {
    nodeIds.add(selectedEntityId);
    for (const link of links) {
      const source = getEndpointId(link.source);
      const target = getEndpointId(link.target);
      if (source !== selectedEntityId && target !== selectedEntityId) {
        continue;
      }
      linkIds.add(link.id);
      nodeIds.add(source);
      nodeIds.add(target);
    }
  }

  if (selectedRelationshipId) {
    const selectedLink = links.find((link) => link.id === selectedRelationshipId);
    if (selectedLink) {
      linkIds.add(selectedLink.id);
      nodeIds.add(getEndpointId(selectedLink.source));
      nodeIds.add(getEndpointId(selectedLink.target));
    }
  }

  return { linkIds, nodeIds };
}

function estimateLabelWidth(label: string, selected: boolean): number {
  return Math.min(selected ? 280 : 220, Math.max(56, label.length * 7.1 + 18));
}

function getCameraDepth(camera: THREE.Camera, coords: Coords): number {
  const cameraPoint = new THREE.Vector3(coords.x, coords.y, coords.z)
    .applyMatrix4(camera.matrixWorldInverse);
  const depth = -cameraPoint.z;

  return Number.isFinite(depth) ? depth : nodeMap3dStageCameraDistance;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function rectsOverlap(left: Rect, right: Rect): boolean {
  return !(
    left.right < right.left ||
    left.left > right.right ||
    left.bottom < right.top ||
    left.top > right.bottom
  );
}

function hasCollision(rect: Rect, acceptedRects: Rect[]): boolean {
  return acceptedRects.some((acceptedRect) => rectsOverlap(rect, acceptedRect));
}

function easeInOutCubic(progress: number): number {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - (-2 * progress + 2) ** 3 / 2;
}

function getRenderNodeId(node: RenderNode): string | null {
  return node.id == null ? null : String(node.id);
}

function getRenderNodePosition(node: RenderNode): NodeMap3dPosition | null {
  if (
    typeof node.x !== "number" ||
    typeof node.y !== "number" ||
    typeof node.z !== "number"
  ) {
    return null;
  }

  return { x: node.x, y: node.y, z: node.z };
}

function snapshotNodePositions(nodes: RenderNode[]): Map<string, NodeMap3dPosition> {
  const positions = new Map<string, NodeMap3dPosition>();
  for (const node of nodes) {
    const nodeId = getRenderNodeId(node);
    const position = getRenderNodePosition(node);
    if (nodeId && position) {
      positions.set(nodeId, position);
    }
  }
  return positions;
}

const flattenedZThreshold = 0.001;
const currentLayoutDepthNudge = 12;

function has3dDepth(positions: Map<string, NodeMap3dPosition>): boolean {
  for (const position of positions.values()) {
    if (Math.abs(position.z) > flattenedZThreshold) {
      return true;
    }
  }
  return false;
}

function hasFixedPosition(node: RenderNode): boolean {
  return (
    typeof node.fx === "number" ||
    typeof node.fy === "number" ||
    typeof node.fz === "number"
  );
}

function canUseCurrentSnapshot(
  nodes: RenderNode[],
  positions: Map<string, NodeMap3dPosition>,
): boolean {
  return (
    positions.size === nodes.length &&
    has3dDepth(positions) &&
    !nodes.some(hasFixedPosition)
  );
}

function applyNodePosition(
  node: RenderNode,
  position: NodeMap3dPosition,
  fixed: boolean,
): void {
  node.x = position.x;
  node.y = position.y;
  node.z = position.z;
  node.vx = 0;
  node.vy = 0;
  node.vz = 0;

  if (fixed) {
    node.fx = position.x;
    node.fy = position.y;
    node.fz = position.z;
  }
}

function releaseNodePosition(node: RenderNode): void {
  node.fx = undefined;
  node.fy = undefined;
  node.fz = undefined;
}

function getDepthNudge(nodeId: string): number {
  const lastCodePoint = nodeId.codePointAt(nodeId.length - 1) ?? 0;
  return lastCodePoint % 2 === 0 ? currentLayoutDepthNudge : -currentLayoutDepthNudge;
}

function releaseNodeToCurrentLayout(node: RenderNode): void {
  releaseNodePosition(node);

  if (typeof node.z === "number" && Math.abs(node.z) > flattenedZThreshold) {
    return;
  }

  const nodeId = getRenderNodeId(node);
  if (!nodeId) {
    return;
  }

  const z = getDepthNudge(nodeId);
  node.z = z;
  node.vz = z / currentLayoutDepthNudge;
}

function getNodeMap3dCameraPosition(arrangement: NodeMap3dArrangement): Coords {
  return arrangement === "flat"
    ? nodeMap3dStageCameraPosition
    : nodeMap3dStageOffAxisCameraPosition;
}

function roundDebugValue(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function vectorToDebugObject(vector: THREE.Vector3 | Coords) {
  return {
    x: roundDebugValue(vector.x),
    y: roundDebugValue(vector.y),
    z: roundDebugValue(vector.z),
  };
}

function getScreenAxisDebug(forceGraph: ForceGraphHandle) {
  const origin = forceGraph.graph2ScreenCoords(0, 0, 0);
  const xAxis = forceGraph.graph2ScreenCoords(100, 0, 0);
  const yAxis = forceGraph.graph2ScreenCoords(0, 100, 0);

  function axisDelta(point: { x: number; y: number }) {
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    return {
      angleDegrees: roundDebugValue((Math.atan2(dy, dx) * 180) / Math.PI),
      dx: roundDebugValue(dx),
      dy: roundDebugValue(dy),
    };
  }

  return {
    origin: {
      x: roundDebugValue(origin.x),
      y: roundDebugValue(origin.y),
    },
    xAxis: axisDelta(xAxis),
    yAxis: axisDelta(yAxis),
  };
}

function getNodeZDebug(nodes: RenderNode[]) {
  const zValues = nodes
    .map((node) => (typeof node.z === "number" ? node.z : null))
    .filter((value): value is number => value != null);
  const fzValues = nodes
    .map((node) => (typeof node.fz === "number" ? node.fz : null))
    .filter((value): value is number => value != null);

  return {
    fixedZCount: fzValues.length,
    maxAbsZ: roundDebugValue(Math.max(0, ...zValues.map((value) => Math.abs(value)))),
    maxZ: roundDebugValue(Math.max(0, ...zValues)),
    minZ: roundDebugValue(Math.min(0, ...zValues)),
    nonZeroZCount: zValues.filter((value) => Math.abs(value) > 0.001).length,
    sample: nodes.slice(0, 12).map((node) => ({
      id: node.id == null ? null : String(node.id),
      x: typeof node.x === "number" ? roundDebugValue(node.x) : null,
      y: typeof node.y === "number" ? roundDebugValue(node.y) : null,
      z: typeof node.z === "number" ? roundDebugValue(node.z) : null,
      fz: typeof node.fz === "number" ? roundDebugValue(node.fz) : null,
    })),
  };
}

function getNodeMap3dCameraUp(): THREE.Vector3 {
  return new THREE.Vector3(0, 1, 0);
}

function applyFlatCameraPlane(
  forceGraph: ForceGraphHandle,
  distance = nodeMap3dStageCameraDistance,
): void {
  const camera = forceGraph.camera();
  const controls = forceGraph.controls() as CameraControls;
  const targetX = controls.target?.x ?? nodeMap3dStageLookAt.x;
  const targetY = controls.target?.y ?? nodeMap3dStageLookAt.y;
  const targetZ = nodeMap3dStageLookAt.z;
  const nextDistance = Math.max(1, distance);

  controls.target?.set(targetX, targetY, targetZ);
  camera.position.set(targetX, targetY, targetZ + nextDistance);
  camera.up.copy(getNodeMap3dCameraUp());
  camera.lookAt(targetX, targetY, targetZ);
  camera.updateMatrixWorld();
  controls.update?.();
}

function makeGlobeLinkObject(color: string): THREE.Line {
  const line = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color,
      depthWrite: false,
      opacity: 0.62,
      transparent: true,
    }),
  );
  line.userData.nodeMap3dGlobeLink = true;
  return line;
}

function isGlobeLinkObject(object: THREE.Object3D): object is THREE.Line {
  return object.userData.nodeMap3dGlobeLink === true && "geometry" in object;
}

function slerpDirections(
  startDirection: THREE.Vector3,
  endDirection: THREE.Vector3,
  progress: number,
): THREE.Vector3 {
  const dot = clamp(startDirection.dot(endDirection), -0.9999, 0.9999);
  const omega = Math.acos(dot);
  const sinOmega = Math.sin(omega);

  if (sinOmega < 0.0001) {
    return startDirection.clone().lerp(endDirection, progress).normalize();
  }

  return startDirection
    .clone()
    .multiplyScalar(Math.sin((1 - progress) * omega) / sinOmega)
    .addScaledVector(endDirection, Math.sin(progress * omega) / sinOmega)
    .normalize();
}

function getSphericalArcPoints(start: Coords, end: Coords): THREE.Vector3[] {
  const startVector = new THREE.Vector3(start.x, start.y, start.z);
  const endVector = new THREE.Vector3(end.x, end.y, end.z);
  const startRadius = startVector.length();
  const endRadius = endVector.length();

  if (startRadius < 1 || endRadius < 1) {
    return [startVector, endVector];
  }

  const startDirection = startVector.clone().normalize();
  const endDirection = endVector.clone().normalize();
  const distance = startVector.distanceTo(endVector);
  const lift = clamp(distance * 0.16, 18, nodeMap3dGlobeRadius * 0.3);
  const points: THREE.Vector3[] = [];

  for (let index = 0; index <= globeLinkSegments; index += 1) {
    const progress = index / globeLinkSegments;
    const radius =
      startRadius +
      (endRadius - startRadius) * progress +
      Math.sin(Math.PI * progress) * lift;
    points.push(slerpDirections(startDirection, endDirection, progress).multiplyScalar(radius));
  }

  return points;
}

function getLinkCoordsKey(coords: { start: Coords; end: Coords }): string {
  return [
    coords.start.x,
    coords.start.y,
    coords.start.z,
    coords.end.x,
    coords.end.y,
    coords.end.z,
  ]
    .map((value) => value.toFixed(2))
    .join(":");
}

function updateGlobeLinkObject(
  object: THREE.Object3D,
  coords: { start: Coords; end: Coords },
  color: string,
): boolean {
  if (!isGlobeLinkObject(object)) {
    return false;
  }

  const material = object.material as THREE.LineBasicMaterial;
  material.color.set(color);
  const coordsKey = getLinkCoordsKey(coords);
  if (object.userData.nodeMap3dGlobeLinkCoordsKey === coordsKey) {
    return true;
  }

  object.geometry.dispose();
  object.geometry = new THREE.BufferGeometry().setFromPoints(
    getSphericalArcPoints(coords.start, coords.end),
  );
  object.userData.nodeMap3dGlobeLinkCoordsKey = coordsKey;
  return true;
}

function getCurrentLayoutTargets(
  nodes: RenderNode[],
  cachedPositions: Map<string, NodeMap3dPosition>,
): Map<string, NodeMap3dPosition> {
  const targets = new Map<string, NodeMap3dPosition>();
  for (const node of nodes) {
    const nodeId = getRenderNodeId(node);
    if (!nodeId) {
      continue;
    }

    const target = cachedPositions.get(nodeId);
    if (target) {
      targets.set(nodeId, target);
    }
  }
  return targets;
}

function getTransitionStartPositions(
  nodes: RenderNode[],
  targetById: Map<string, NodeMap3dPosition>,
): Map<string, NodeMap3dPosition> {
  const starts = new Map<string, NodeMap3dPosition>();
  for (const node of nodes) {
    const nodeId = getRenderNodeId(node);
    if (!nodeId) {
      continue;
    }

    const start = getRenderNodePosition(node) ?? targetById.get(nodeId);
    if (start) {
      starts.set(nodeId, start);
    }
  }
  return starts;
}

function animateNodePositions({
  durationMs,
  fixedAfter,
  lockZToTarget,
  nodes,
  onComplete,
  refresh,
  targetById,
}: {
  durationMs: number;
  fixedAfter: boolean;
  lockZToTarget?: boolean;
  nodes: RenderNode[];
  onComplete: () => void;
  refresh: () => void;
  targetById: Map<string, NodeMap3dPosition>;
}): () => void {
  const startById = getTransitionStartPositions(nodes, targetById);
  const startedAt = performance.now();
  let animationFrame = 0;
  let cancelled = false;

  function tick(now: number) {
    if (cancelled) {
      return;
    }

    const progress = clamp((now - startedAt) / durationMs, 0, 1);
    const eased = easeInOutCubic(progress);

    for (const node of nodes) {
      const nodeId = getRenderNodeId(node);
      const target = nodeId ? targetById.get(nodeId) : undefined;
      if (!nodeId || !target) {
        continue;
      }

      const start = startById.get(nodeId) ?? target;
      applyNodePosition(
        node,
        {
          x: start.x + (target.x - start.x) * eased,
          y: start.y + (target.y - start.y) * eased,
          z: lockZToTarget ? target.z : start.z + (target.z - start.z) * eased,
        },
        true,
      );
    }

    refresh();

    if (progress < 1) {
      animationFrame = window.requestAnimationFrame(tick);
      return;
    }

    for (const node of nodes) {
      const nodeId = getRenderNodeId(node);
      const target = nodeId ? targetById.get(nodeId) : undefined;
      if (!target) {
        continue;
      }

      applyNodePosition(node, target, fixedAfter);
      if (!fixedAfter) {
        releaseNodePosition(node);
      }
    }

    refresh();
    onComplete();
  }

  animationFrame = window.requestAnimationFrame(tick);

  return () => {
    cancelled = true;
    window.cancelAnimationFrame(animationFrame);
  };
}

function areLabelPlacementsEqual(
  left: LabelPlacement[],
  right: LabelPlacement[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((leftPlacement, index) => {
    const rightPlacement = right[index];
    return (
      leftPlacement.id === rightPlacement.id &&
      leftPlacement.opacity === rightPlacement.opacity &&
      leftPlacement.x === rightPlacement.x &&
      leftPlacement.y === rightPlacement.y &&
      leftPlacement.width === rightPlacement.width &&
      leftPlacement.selected === rightPlacement.selected &&
      leftPlacement.focused === rightPlacement.focused &&
      leftPlacement.neighbor === rightPlacement.neighbor
    );
  });
}

function buildLabelPlacements(
  graph: ForceGraphHandle,
  nodes: RenderNode[],
  size: Size,
  selectedEntityId: string | null,
  focusedEntityId: string | null,
  connectedNodeIds: Set<string>,
): LabelPlacement[] {
  const camera = graph.camera();
  camera.updateMatrixWorld();

  const candidates = nodes
    .filter(
      (node): node is RenderNode & Required<Pick<RenderNode, "x" | "y" | "z">> =>
        typeof node.x === "number" &&
        typeof node.y === "number" &&
        typeof node.z === "number" &&
        node.id != null,
    )
    .map((node) => {
      const nodeId = String(node.id);
      const selected = selectedEntityId === nodeId;
      const focused = focusedEntityId === nodeId;
      const neighbor = connectedNodeIds.has(nodeId) && !selected;
      const screenPosition = graph.graph2ScreenCoords(node.x, node.y, node.z);
      const cameraDepth = getCameraDepth(camera, node);
      const width = estimateLabelWidth(node.label, selected);
      const height = selected || focused ? 24 : 21;
      const offset = selected || focused ? 14 : 10;
      const placeRight = screenPosition.x < size.width * 0.68;
      const rawX = placeRight
        ? screenPosition.x + offset
        : screenPosition.x - width - offset;
      const rawY = screenPosition.y - height / 2;
      const rawRect = {
        bottom: rawY + height + 4,
        left: rawX - 4,
        right: rawX + width + 4,
        top: rawY - 4,
      };
      const x = Math.round(
        clamp(
          rawX,
          6,
          Math.max(6, size.width - width - 6),
        ),
      );
      const y = Math.round(
        clamp(
          rawY,
          6,
          Math.max(6, size.height - height - 6),
        ),
      );
      const required = selected || focused;
      const visible =
        rawRect.right >= 0 &&
        rawRect.left <= size.width &&
        rawRect.bottom >= 0 &&
        rawRect.top <= size.height;

      return {
        focused,
        height,
        id: nodeId,
        kind: node.kind,
        label: node.label,
        neighbor,
        cameraDepth,
        priority:
          node.priority +
          (selected ? 10000 : 0) +
          (focused ? 8000 : 0) +
          (neighbor ? 1200 : 0),
        rect: {
          bottom: y + height - labelCollisionInset,
          left: x + labelCollisionInset,
          right: x + width - labelCollisionInset,
          top: y + labelCollisionInset,
        },
        required,
        selected,
        visible,
        width: Math.round(width),
        x,
        y,
      };
    })
    .filter((candidate) => candidate.required || candidate.visible);

  const nearDepth = Math.min(...candidates.map((candidate) => candidate.cameraDepth));
  const farDepth = Math.max(...candidates.map((candidate) => candidate.cameraDepth));
  const depthRange = Math.max(1, farDepth - nearDepth);
  const visibleCandidates = candidates
    .map((candidate) => {
      const depthRatio = clamp(
        (candidate.cameraDepth - nearDepth) / depthRange,
        0,
        1,
      );
      const depthOpacity = 1 - depthRatio * (1 - labelFarDepthOpacity);
      const opacity = candidate.required
        ? 1
        : candidate.neighbor
          ? Math.max(depthOpacity, 0.74)
          : depthOpacity;

      return {
        ...candidate,
        opacity: Math.round(opacity * 100) / 100,
        priority:
          candidate.priority +
          (1 - depthRatio) * labelDepthPriorityBoost,
      };
    })
    .sort((left, right) => right.priority - left.priority);

  const acceptedRects: Rect[] = [];
  const placements: LabelPlacement[] = [];

  for (const candidate of visibleCandidates) {
    const collided =
      !candidate.required && hasCollision(candidate.rect, acceptedRects);

    if (!collided) {
      acceptedRects.push(candidate.rect);
    }

    placements.push({
      focused: candidate.focused,
      id: candidate.id,
      kind: candidate.kind,
      label: candidate.label,
      neighbor: candidate.neighbor,
      opacity: collided ? 0 : candidate.opacity,
      selected: candidate.selected,
      width: candidate.width,
      x: candidate.x,
      y: candidate.y,
    });
  }

  return placements;
}

export function ForceGraphCanvas({ arrangement = "current" }: ForceGraphCanvasProps) {
  const graph = useGraphStore((state) => state.graph);
  const viewMode = useGraphStore((state) => state.viewMode);
  const countryDisplayMode = useGraphStore((state) => state.countryDisplayMode);
  const focusEntityId = useGraphStore((state) => state.focusEntityId);
  const locale = useGraphStore((state) => state.locale);
  const searchQuery = useGraphStore((state) => state.searchQuery);
  const searchAllLanguages = useGraphStore((state) => state.searchAllLanguages);
  const searchFilters = useGraphStore((state) => state.searchFilters);
  const selectedEntityId = useGraphStore((state) => state.selectedEntityId);
  const selectedRelationshipId = useGraphStore((state) => state.selectedRelationshipId);
  const setSelectedEntityId = useGraphStore((state) => state.setSelectedEntityId);
  const setSelectedRelationshipId = useGraphStore((state) => state.setSelectedRelationshipId);
  const resetSelection = useGraphStore((state) => state.resetSelection);
  const graphRef = useRef<ForceGraphHandle | undefined>(undefined);
  const arrangementRef = useRef<NodeMap3dArrangement>(arrangement);
  const globeOverlayFadeOutUntilRef = useRef(0);
  const hasAppliedArrangementRef = useRef(false);
  const currentPositionByIdRef = useRef<Map<string, NodeMap3dPosition>>(new Map());
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState<Size>({ height: 1, width: 1 });
  const [labelPlacements, setLabelPlacements] = useState<LabelPlacement[]>([]);

  const resolvedSearch = useMemo(
    () => (graph
      ? resolveGraphSearch(
          graph,
          { query: searchQuery, filters: searchFilters, searchAllLanguages },
          locale,
        )
      : null),
    [graph, locale, searchAllLanguages, searchFilters, searchQuery],
  );

  const projection = useMemo(() => {
    if (!graph) {
      return null;
    }

    return projectGraph({
      graph,
      viewMode,
      countryDisplayMode,
      focusEntityId: viewMode === "governance" ? null : focusEntityId,
      locale,
      searchEntityIds: resolvedSearch?.active
        ? resolvedSearch.matchingEntityIds
        : null,
    });
  }, [countryDisplayMode, focusEntityId, graph, locale, resolvedSearch, viewMode]);

  const graphData = useMemo<ForceGraphData>(
    () => (projection ? buildForceGraphData(projection) : { nodes: [], links: [] }),
    [projection],
  );

  const highlighted = useMemo(
    () =>
      getHighlightedGraphState(
        graphData.links,
        selectedEntityId,
        selectedRelationshipId,
      ),
    [graphData.links, selectedEntityId, selectedRelationshipId],
  );

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    const debugElement =
      document.getElementById("chm-3d-debug-state") ??
      document.createElement("script");
    debugElement.id = "chm-3d-debug-state";
    debugElement.setAttribute("type", "application/json");
    if (!debugElement.parentElement) {
      document.body.appendChild(debugElement);
    }

    function getDebugSnapshot(): Record<string, unknown> {
      const forceGraph = graphRef.current;
      if (!forceGraph) {
        return {
          arrangement,
          error: "Force graph is not mounted",
        };
      }

      const camera = forceGraph.camera();
      const controls = forceGraph.controls() as CameraControls;
      const rotation = camera.rotation;
      const quaternion = camera.quaternion;

      return {
        arrangement,
        camera: {
          far:
            camera instanceof THREE.PerspectiveCamera
              ? roundDebugValue(camera.far)
              : null,
          fov:
            camera instanceof THREE.PerspectiveCamera
              ? roundDebugValue(camera.fov)
              : null,
          isPerspective: camera instanceof THREE.PerspectiveCamera,
          position: vectorToDebugObject(camera.position),
          quaternion: {
            w: roundDebugValue(quaternion.w),
            x: roundDebugValue(quaternion.x),
            y: roundDebugValue(quaternion.y),
            z: roundDebugValue(quaternion.z),
          },
          rotation: {
            order: rotation.order,
            x: roundDebugValue(rotation.x),
            y: roundDebugValue(rotation.y),
            z: roundDebugValue(rotation.z),
          },
          up: vectorToDebugObject(camera.up),
        },
        controls: {
          autoRotate: controls.autoRotate ?? null,
          autoRotateSpeed: controls.autoRotateSpeed ?? null,
          enableDamping: controls.enableDamping ?? null,
          enablePan: controls.enablePan ?? null,
          enableRotate: controls.enableRotate ?? null,
          mouseButtons: controls.mouseButtons ?? null,
          noRotate: controls.noRotate ?? null,
          target: controls.target ? vectorToDebugObject(controls.target) : null,
        },
        nodes: getNodeZDebug(graphData.nodes),
        screenAxes: getScreenAxisDebug(forceGraph),
        size,
        timestamp: Math.round(performance.now()),
      };
    }

    function updateDebugElement() {
      debugElement.textContent = JSON.stringify(getDebugSnapshot());
    }

    updateDebugElement();
    const intervalId = window.setInterval(updateDebugElement, 100);

    return () => {
      window.clearInterval(intervalId);
      debugElement.remove();
    };
  }, [arrangement, graphData.nodes, size]);

  useEffect(() => {
    if (!container) {
      return;
    }

    function updateSize() {
      setSize({
        height: Math.max(container?.clientHeight ?? 1, 1),
        width: Math.max(container?.clientWidth ?? 1, 1),
      });
    }

    updateSize();
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateSize);
    resizeObserver?.observe(container);

    return () => resizeObserver?.disconnect();
  }, [container]);

  useEffect(() => {
    const forceGraph = graphRef.current;
    if (!forceGraph) {
      return;
    }

    const linkForce = forceGraph.d3Force("link") as D3ForceLink | undefined;
    linkForce
      ?.distance((link) => {
        if (link.type === "part_of") {
          return 46;
        }
        if (link.type === "publishes_to" || link.type === "syncs_to") {
          return 72;
        }
        return 58;
      })
      .strength((link) => (link.isDerivedHierarchy ? 0.32 : 0.56));

    const chargeForce = forceGraph.d3Force("charge") as D3ForceManyBody | undefined;
    chargeForce?.strength((node) => (node.kind === "country" ? -150 : -85));

    const centerForce = forceGraph.d3Force("center") as D3ForceCenter | undefined;
    centerForce?.x(0).y(0).z?.(0).strength?.(1);
  }, [graphData]);

  useEffect(() => {
    const forceGraph = graphRef.current;
    if (!forceGraph || arrangement !== "globe") {
      return;
    }

    const globeObject = createNodeMap3dGlobe();
    forceGraph.scene().add(globeObject);
    forceGraph.refresh();

    let animationFrame = 0;
    const fadeInStartedAt = performance.now();
    const animateGlobe = (now: number) => {
      const visibility = clamp(
        (now - fadeInStartedAt) / globeOverlayFadeDurationMs,
        0,
        1,
      );
      updateNodeMap3dGlobe(globeObject, now / 1000, visibility);
      animationFrame = window.requestAnimationFrame(animateGlobe);
    };
    animationFrame = window.requestAnimationFrame(animateGlobe);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      const fadeOutStartedAt = performance.now();
      globeOverlayFadeOutUntilRef.current =
        fadeOutStartedAt + globeOverlayFadeDurationMs;
      const animateRemoval = (now: number) => {
        const visibility =
          1 -
          clamp((now - fadeOutStartedAt) / globeOverlayFadeDurationMs, 0, 1);
        updateNodeMap3dGlobe(globeObject, now / 1000, visibility);

        if (visibility > 0) {
          animationFrame = window.requestAnimationFrame(animateRemoval);
          return;
        }

        forceGraph.scene().remove(globeObject);
        disposeNodeMap3dObject(globeObject);
        forceGraph.refresh();
      };
      animationFrame = window.requestAnimationFrame(animateRemoval);
    };
  }, [arrangement]);

  useEffect(() => {
    const forceGraph = graphRef.current;
    if (!forceGraph || graphData.nodes.length === 0) {
      return;
    }

    const applyCameraSetup = () => {
      const camera = forceGraph.camera();
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = nodeMap3dStageCameraFov;
        camera.far = Math.max(camera.far, nodeMap3dStageCameraDistance * 3);
        camera.up.set(0, 1, 0);
        camera.updateProjectionMatrix();
      }

      const controls = forceGraph.controls() as CameraControls;
      controls.mouseButtons = {
        ...controls.mouseButtons,
        LEFT: arrangement === "flat" ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
      controls.noRotate = arrangement === "flat";
      controls.enableRotate = arrangement !== "flat";
      controls.enablePan = true;
      controls.panSpeed = 1;
      controls.target?.set(
        nodeMap3dStageLookAt.x,
        nodeMap3dStageLookAt.y,
        nodeMap3dStageLookAt.z,
      );
      if (arrangement === "flat") {
        controls.target?.set(
          nodeMap3dStageLookAt.x,
          nodeMap3dStageLookAt.y,
          nodeMap3dStageLookAt.z,
        );
        applyFlatCameraPlane(forceGraph);
      } else {
        forceGraph.cameraPosition(
          getNodeMap3dCameraPosition(arrangement),
          nodeMap3dStageLookAt,
          0,
        );
      }
      controls.update?.();
    };

    const cameraSetupDelayMs =
      arrangement === "globe" || arrangement === "flat"
        ? 0
        : Math.max(0, globeOverlayFadeOutUntilRef.current - performance.now());
    if (cameraSetupDelayMs > 0) {
      const timeoutId = window.setTimeout(applyCameraSetup, cameraSetupDelayMs);
      return () => window.clearTimeout(timeoutId);
    }

    if (arrangement === "flat") {
      globeOverlayFadeOutUntilRef.current = 0;
    }

    applyCameraSetup();
  }, [
    arrangement,
    graphData.nodes.length,
    size.height,
    size.width,
  ]);

  useEffect(() => {
    const forceGraph = graphRef.current;
    if (!forceGraph || graphData.nodes.length === 0) {
      return;
    }

    const shouldAutoRotate = arrangement === "current" || arrangement === "globe";
    const controls = forceGraph.controls() as CameraControls;
    controls.autoRotate = shouldAutoRotate;
    controls.autoRotateSpeed = shouldAutoRotate
      ? arrangement === "globe"
        ? nodeMap3dGlobeAutoRotateSpeed
        : nodeMap3dAutoRotateSpeed
      : 0;
    controls.enableDamping = arrangement !== "flat";
    controls.dampingFactor = arrangement === "globe" ? 0.08 : 0.045;
    controls.update?.();
  }, [
    arrangement,
    graphData.nodes.length,
  ]);

  useEffect(() => {
    const forceGraph = graphRef.current;
    if (!forceGraph || arrangement !== "flat" || graphData.nodes.length === 0) {
      return;
    }

    const controls = forceGraph.controls() as CameraControls;
    let applyingFlatPlane = false;

    const enforceFlatPlane = () => {
      if (applyingFlatPlane) {
        return;
      }

      applyingFlatPlane = true;
      const camera = forceGraph.camera();
      const target = controls.target ?? new THREE.Vector3(
        nodeMap3dStageLookAt.x,
        nodeMap3dStageLookAt.y,
        nodeMap3dStageLookAt.z,
      );
      applyFlatCameraPlane(forceGraph, camera.position.distanceTo(target));
      applyingFlatPlane = false;
    };

    enforceFlatPlane();
    controls.addEventListener?.("change", enforceFlatPlane);

    return () => {
      controls.removeEventListener?.("change", enforceFlatPlane);
    };
  }, [arrangement, graphData.nodes.length]);

  useEffect(() => {
    if (!projection || graphData.nodes.length === 0) {
      return;
    }

    const forceGraph = graphRef.current;
    const previousArrangement = arrangementRef.current;
    const hasAppliedArrangement = hasAppliedArrangementRef.current;
    hasAppliedArrangementRef.current = true;

    if (previousArrangement === "current" && arrangement !== "current") {
      const currentPositions = snapshotNodePositions(graphData.nodes);
      if (canUseCurrentSnapshot(graphData.nodes, currentPositions)) {
        currentPositionByIdRef.current = currentPositions;
      }
    }

    arrangementRef.current = arrangement;

    if (arrangement === "current") {
      if (!hasAppliedArrangement || previousArrangement === "current") {
        graphData.nodes.forEach(releaseNodePosition);
        return;
      }

      const targetById = getCurrentLayoutTargets(
        graphData.nodes,
        currentPositionByIdRef.current,
      );

      if (
        targetById.size !== graphData.nodes.length ||
        !has3dDepth(targetById)
      ) {
        graphData.nodes.forEach(releaseNodeToCurrentLayout);
        forceGraph?.d3ReheatSimulation();
        forceGraph?.refresh();
        return;
      }

      graphData.nodes.forEach(releaseNodePosition);
      return animateNodePositions({
        durationMs: nodeTransitionDurationMs,
        fixedAfter: false,
        nodes: graphData.nodes,
        onComplete: () => {
          forceGraph?.d3ReheatSimulation();
        },
        refresh: () => {
          forceGraph?.refresh();
        },
        targetById,
      });
    }

    let cancelled = false;
    let stopTransition: (() => void) | undefined;

    void getNodeMap3dTargets(projection, arrangement)
      .then((targetById) => {
        if (cancelled || targetById.size === 0) {
          return;
        }

        stopTransition = animateNodePositions({
          durationMs: nodeTransitionDurationMs,
          fixedAfter: true,
          lockZToTarget: arrangement === "flat",
          nodes: graphData.nodes,
          onComplete: () => undefined,
          refresh: () => {
            graphRef.current?.refresh();
          },
          targetById,
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error("Failed to compute 3D node map targets", error);
        }
      });

    return () => {
      cancelled = true;
      stopTransition?.();
    };
  }, [arrangement, graphData.nodes, projection]);

  useEffect(() => {
    if (!container || graphData.nodes.length === 0) {
      setLabelPlacements([]);
      return;
    }

    let animationFrame = 0;
    let cancelled = false;
    let frame = 0;

    function updateLabels() {
      if (cancelled) {
        return;
      }

      frame += 1;
      if (frame % 2 === 0 && graphRef.current) {
        const nextLabels = buildLabelPlacements(
          graphRef.current,
          graphData.nodes,
          size,
          selectedEntityId,
          focusEntityId,
          highlighted.nodeIds,
        );
        setLabelPlacements((previousLabels) =>
          areLabelPlacementsEqual(previousLabels, nextLabels)
            ? previousLabels
            : nextLabels,
        );
      }

      animationFrame = window.requestAnimationFrame(updateLabels);
    }

    animationFrame = window.requestAnimationFrame(updateLabels);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
    };
  }, [
    container,
    focusEntityId,
    graphData.nodes,
    highlighted.nodeIds,
    selectedEntityId,
    size,
  ]);

  const nodeColor = useCallback(
    (node: RenderNode) => {
      const nodeId = String(node.id);
      if (nodeId === selectedEntityId || nodeId === focusEntityId) {
        return selectedOrange;
      }
      if (highlighted.nodeIds.has(nodeId)) {
        return connectedOrange;
      }
      return nodeColorByKind[node.kind];
    },
    [focusEntityId, highlighted.nodeIds, selectedEntityId],
  );

  const nodeValue = useCallback(
    (node: RenderNode) => {
      const nodeId = String(node.id);
      if (nodeId === selectedEntityId || nodeId === focusEntityId) {
        return node.val * 2.2;
      }
      if (highlighted.nodeIds.has(nodeId)) {
        return node.val * 1.45;
      }
      return node.val;
    },
    [focusEntityId, highlighted.nodeIds, selectedEntityId],
  );

  const linkColor = useCallback(
    (link: RenderLink) => {
      if (link.id === selectedRelationshipId) {
        return selectedOrange;
      }
      if (highlighted.linkIds.has(link.id)) {
        return connectedOrange;
      }
      return linkColorByType[link.type];
    },
    [highlighted.linkIds, selectedRelationshipId],
  );

  const linkWidth = useCallback(
    (link: RenderLink) => {
      if (link.id === selectedRelationshipId) {
        return 2.8;
      }
      if (highlighted.linkIds.has(link.id)) {
        return 1.9;
      }
      return link.type === "publishes_to" || link.type === "syncs_to" ? 1.15 : 0.72;
    },
    [highlighted.linkIds, selectedRelationshipId],
  );

  const linkParticles = useCallback(
    (link: RenderLink) => {
      if (link.id === selectedRelationshipId) {
        return 3;
      }
      return highlighted.linkIds.has(link.id) ? 1 : 0;
    },
    [highlighted.linkIds, selectedRelationshipId],
  );

  const linkThreeObject = useCallback(
    (link: LinkObject<ForceGraphNode, ForceGraphLink>) =>
      makeGlobeLinkObject(linkColor(link as RenderLink)),
    [linkColor],
  );

  const linkPositionUpdate = useCallback(
    (
      object: THREE.Object3D,
      coords: { start: Coords; end: Coords },
      link: LinkObject,
    ) =>
      arrangement === "globe"
        ? updateGlobeLinkObject(object, coords, linkColor(link as RenderLink))
        : false,
    [arrangement, linkColor],
  );

  const forwardLabelWheel = useCallback(
    (event: ReactWheelEvent<HTMLButtonElement>) => {
      const canvas = container?.querySelector("canvas");
      if (!canvas) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const nativeEvent = event.nativeEvent;
      canvas.dispatchEvent(
        new window.WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          clientX: nativeEvent.clientX,
          clientY: nativeEvent.clientY,
          ctrlKey: nativeEvent.ctrlKey,
          deltaMode: nativeEvent.deltaMode,
          deltaX: nativeEvent.deltaX,
          deltaY: nativeEvent.deltaY,
          deltaZ: nativeEvent.deltaZ,
          metaKey: nativeEvent.metaKey,
          screenX: nativeEvent.screenX,
          screenY: nativeEvent.screenY,
          shiftKey: nativeEvent.shiftKey,
          view: window,
        }),
      );
    },
    [container],
  );

  if (!projection) {
    return <div className="force-graph-canvas" ref={setContainer} />;
  }

  return (
    <div className="force-graph-canvas" ref={setContainer}>
      <ForceGraph3D<ForceGraphNode, ForceGraphLink>
        ref={graphRef}
        backgroundColor="#142338"
        controlType="orbit"
        cooldownTicks={180}
        cooldownTime={6200}
        d3AlphaDecay={0.026}
        d3VelocityDecay={0.34}
        enableNodeDrag={arrangement === "current"}
        forceEngine="d3"
        graphData={graphData}
        height={size.height}
        linkColor={linkColor}
        linkDirectionalArrowColor={linkColor}
        linkDirectionalArrowLength={(link) =>
          arrangement === "globe" || link.isDerivedHierarchy || link.type === "part_of"
            ? 0
            : 2.4
        }
        linkDirectionalArrowRelPos={0.92}
        linkDirectionalParticles={(link) =>
          arrangement === "globe" ? 0 : linkParticles(link)
        }
        linkDirectionalParticleSpeed={0.006}
        linkDirectionalParticleWidth={1.4}
        linkHoverPrecision={6}
        linkLabel={(link) => link.label}
        linkOpacity={0.38}
        linkPositionUpdate={arrangement === "globe" ? linkPositionUpdate : undefined}
        linkThreeObject={arrangement === "globe" ? linkThreeObject : undefined}
        linkWidth={linkWidth}
        nodeColor={nodeColor}
        nodeLabel={(node) => node.label}
        nodeRelSize={3.2}
        nodeResolution={16}
        nodeVal={nodeValue}
        numDimensions={3}
        onBackgroundClick={resetSelection}
        onLinkClick={(link) => {
          if (link.isDerivedHierarchy) {
            return;
          }
          setSelectedRelationshipId(link.id);
        }}
        onNodeClick={(node) => {
          if (node.id != null) {
            setSelectedEntityId(String(node.id));
          }
        }}
        showNavInfo={false}
        warmupTicks={48}
        width={size.width}
      />
      <div className="force-graph-label-layer">
        {labelPlacements.map((label) => (
          <button
            className={[
              "force-graph-label",
              `is-${label.kind}`,
              label.selected ? "is-selected" : "",
              label.focused ? "is-focused" : "",
              label.neighbor ? "is-neighbor" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            key={label.id}
            style={{
              opacity: label.opacity,
              pointerEvents: label.opacity > 0.05 ? "auto" : "none",
              transform: `translate3d(${label.x}px, ${label.y}px, 0)`,
              width: label.width,
            }}
            aria-hidden={label.opacity <= 0.05}
            onClick={() => setSelectedEntityId(label.id)}
            onWheel={forwardLabelWheel}
            tabIndex={label.opacity > 0.05 ? 0 : -1}
            type="button"
          >
            {label.label}
          </button>
        ))}
      </div>
    </div>
  );
}
