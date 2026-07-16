import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D, {
  type ForceGraphMethods,
  type GraphData,
  type LinkObject,
  type NodeObject,
} from "react-force-graph-3d";

import {
  projectGraph,
  type GraphProjection,
  type GraphProjectionEdge,
  type GraphProjectionEdgeType,
  type GraphProjectionNode,
} from "../graph/projection";
import { useGraphStore } from "../state/graphStore";

type ForceGraphNode = {
  id: string;
  label: string;
  kind: GraphProjectionNode["kind"];
  status: GraphProjectionNode["status"];
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
  status: GraphProjectionEdge["status"];
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

const nodeColorByKind = {
  country: "#f7d470",
  organization: "#9ad29d",
  system: "#8fc7ff",
} satisfies Record<ForceGraphNode["kind"], string>;

const linkColorByType = {
  governs: "#c8dfff",
  hierarchy: "#8fb3db",
  operates: "#9fe3d0",
  part_of: "#8fb3db",
  publishes_to: "#ff6b78",
  syncs_to: "#c99cff",
} satisfies Record<GraphProjectionEdgeType, string>;

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
  const statusPenalty =
    node.status === "speculative" ? 60 : node.status === "deprecated" ? 120 : 0;

  return kindPriority + blockPriority + degree * 8 - statusPenalty;
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
        status: node.status,
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
      status: edge.status,
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
      const width = estimateLabelWidth(node.label, selected);
      const height = selected || focused ? 24 : 21;
      const offset = selected || focused ? 14 : 10;
      const placeRight = screenPosition.x < size.width * 0.68;
      const x = Math.round(
        clamp(
          placeRight ? screenPosition.x + offset : screenPosition.x - width - offset,
          6,
          Math.max(6, size.width - width - 6),
        ),
      );
      const y = Math.round(
        clamp(
          screenPosition.y - height / 2,
          6,
          Math.max(6, size.height - height - 6),
        ),
      );
      const required = selected || focused;

      return {
        focused,
        height,
        id: nodeId,
        kind: node.kind,
        label: node.label,
        neighbor,
        priority:
          node.priority +
          (selected ? 10000 : 0) +
          (focused ? 8000 : 0) +
          (neighbor ? 1200 : 0),
        rect: {
          bottom: y + height + 4,
          left: x - 4,
          right: x + width + 4,
          top: y - 4,
        },
        required,
        selected,
        width: Math.round(width),
        x,
        y,
      };
    })
    .filter(
      (candidate) =>
        candidate.required ||
        (candidate.rect.right >= 0 &&
          candidate.rect.left <= size.width &&
          candidate.rect.bottom >= 0 &&
          candidate.rect.top <= size.height),
    )
    .sort((left, right) => right.priority - left.priority);

  const acceptedRects: Rect[] = [];
  const placements: LabelPlacement[] = [];

  for (const candidate of candidates) {
    if (!candidate.required && hasCollision(candidate.rect, acceptedRects)) {
      continue;
    }

    acceptedRects.push(candidate.rect);
    placements.push({
      focused: candidate.focused,
      id: candidate.id,
      kind: candidate.kind,
      label: candidate.label,
      neighbor: candidate.neighbor,
      selected: candidate.selected,
      width: candidate.width,
      x: candidate.x,
      y: candidate.y,
    });
  }

  return placements;
}

export function ForceGraphCanvas() {
  const graph = useGraphStore((state) => state.graph);
  const viewMode = useGraphStore((state) => state.viewMode);
  const countryDisplayMode = useGraphStore((state) => state.countryDisplayMode);
  const focusEntityId = useGraphStore((state) => state.focusEntityId);
  const selectedEntityId = useGraphStore((state) => state.selectedEntityId);
  const selectedRelationshipId = useGraphStore((state) => state.selectedRelationshipId);
  const setSelectedEntityId = useGraphStore((state) => state.setSelectedEntityId);
  const setSelectedRelationshipId = useGraphStore((state) => state.setSelectedRelationshipId);
  const resetSelection = useGraphStore((state) => state.resetSelection);
  const graphRef = useRef<ForceGraphHandle | undefined>(undefined);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState<Size>({ height: 1, width: 1 });
  const [labelPlacements, setLabelPlacements] = useState<LabelPlacement[]>([]);

  const projection = useMemo(() => {
    if (!graph) {
      return null;
    }

    return projectGraph({
      graph,
      viewMode,
      countryDisplayMode,
      focusEntityId: viewMode === "governance" ? null : focusEntityId,
    });
  }, [countryDisplayMode, focusEntityId, graph, viewMode]);

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
        if (link.type === "hierarchy" || link.type === "part_of") {
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
    forceGraph.d3ReheatSimulation();
  }, [graphData]);

  useEffect(() => {
    if (!graphRef.current || graphData.nodes.length === 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      graphRef.current?.zoomToFit(850, 90);
    }, 420);

    return () => window.clearTimeout(timeoutId);
  }, [graphData, size.height, size.width]);

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
        return "#ff785e";
      }
      if (highlighted.nodeIds.has(nodeId)) {
        return "#ffbf66";
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
        return "#ff785e";
      }
      if (highlighted.linkIds.has(link.id)) {
        return "#ffbf66";
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

  if (!projection) {
    return <div className="force-graph-canvas" ref={setContainer} />;
  }

  return (
    <div className="force-graph-canvas" ref={setContainer}>
      <ForceGraph3D<ForceGraphNode, ForceGraphLink>
        ref={graphRef}
        backgroundColor="#142338"
        cooldownTicks={180}
        cooldownTime={6200}
        d3AlphaDecay={0.026}
        d3VelocityDecay={0.34}
        enableNodeDrag
        forceEngine="d3"
        graphData={graphData}
        height={size.height}
        linkColor={linkColor}
        linkDirectionalArrowColor={linkColor}
        linkDirectionalArrowLength={(link) =>
          link.isDerivedHierarchy || link.type === "part_of" ? 0 : 2.4
        }
        linkDirectionalArrowRelPos={0.92}
        linkDirectionalParticles={linkParticles}
        linkDirectionalParticleSpeed={0.006}
        linkDirectionalParticleWidth={1.4}
        linkHoverPrecision={6}
        linkLabel={(link) => link.label}
        linkOpacity={0.38}
        linkWidth={linkWidth}
        nodeColor={nodeColor}
        nodeLabel={(node) => node.label}
        nodeRelSize={2.7}
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
      <div className="force-graph-label-layer" aria-hidden="true">
        {labelPlacements.map((label) => (
          <div
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
              transform: `translate3d(${label.x}px, ${label.y}px, 0)`,
              width: label.width,
            }}
          >
            {label.label}
          </div>
        ))}
      </div>
    </div>
  );
}
