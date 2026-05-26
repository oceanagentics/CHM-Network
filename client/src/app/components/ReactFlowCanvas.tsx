import { memo, startTransition, useEffect, useMemo, useState } from "react";
import {
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs/lib/elk-api";

import type {
  EntityKind,
  RelationshipType,
  Status,
  ViewMode,
} from "../../../../shared/domain";
import {
  getElkLayoutOptions,
  getReactFlowDirection,
  type GraphProjection,
} from "../graph/projectGraph";
import type { GraphLayout } from "../state/graphStore";
import { useGraphStore } from "../state/graphStore";

const elk = new ELK();

type EntityFlowNodeData = {
  kind: EntityKind;
  label: string;
  status: Status;
  isFocus: boolean;
  isSelected: boolean;
  isNeighbor: boolean;
  sourcePosition: Position;
  targetPosition: Position;
};

type EntityFlowNode = Node<EntityFlowNodeData, "entity">;
type GraphFlowEdgeData = {
  isDerivedHierarchy: boolean;
};

type GraphFlowEdge = Edge<GraphFlowEdgeData, "step">;

type NodePosition = {
  x: number;
  y: number;
};

function GraphNodeCard({ data }: NodeProps<EntityFlowNode>) {
  return (
    <>
      <Handle
        type="target"
        position={data.targetPosition}
        className="rf-node-handle"
        isConnectable={false}
      />
      <div
        className={[
          "rf-node-card",
          data.kind,
          data.status,
          data.isFocus ? "is-focus" : "",
          data.isSelected ? "is-selected" : "",
          data.isNeighbor ? "is-neighbor" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="rf-node-label">{data.label}</div>
      </div>
      <Handle
        type="source"
        position={data.sourcePosition}
        className="rf-node-handle"
        isConnectable={false}
      />
    </>
  );
}

const reactFlowNodeTypes = {
  entity: memo(GraphNodeCard),
};

function getHandlePositions(viewMode: ViewMode) {
  if (getReactFlowDirection(viewMode) === "LEFT") {
    return {
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
    };
  }

  return {
    targetPosition: Position.Top,
    sourcePosition: Position.Bottom,
  };
}

function getEdgeColor(type: RelationshipType): string {
  switch (type) {
    case "part_of":
      return "#7d8797";
    case "operates":
      return "#3f8d72";
    case "publishes_to":
      return "#2d6cc9";
    case "syncs_to":
      return "#8a59b7";
  }
}

function getEdgeStrokeWidth(
  type: RelationshipType,
  isSelected: boolean,
  isConnected: boolean,
): number {
  if (isSelected) {
    return 4;
  }

  if (isConnected) {
    return type === "part_of" ? 3.4 : 4.4;
  }

  if (type === "part_of") {
    return 1.8;
  }

  if (type === "publishes_to" || type === "syncs_to") {
    return 3;
  }

  return 2.2;
}

function getEdgeStrokeDasharray(
  type: RelationshipType,
  status: Status,
): string | undefined {
  if (status === "planned") {
    return "8 5";
  }

  if (status === "speculative") {
    return "2 5";
  }

  if (type === "part_of") {
    return "6 4";
  }

  return undefined;
}

function getEdgeOpacity(status: Status): number {
  if (status === "speculative") {
    return 0.7;
  }

  if (status === "deprecated") {
    return 0.55;
  }

  return 1;
}

function buildElkGraph(
  projection: GraphProjection,
  layoutMode: GraphLayout,
  viewMode: ViewMode,
): ElkNode {
  return {
    id: "root",
    layoutOptions: getElkLayoutOptions(layoutMode, viewMode),
    children: projection.nodes.map((node) => ({
      id: node.id,
      width: node.width,
      height: node.height,
    })),
    edges: projection.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };
}

interface ReactFlowCanvasProps {
  projection: GraphProjection;
  layoutMode: GraphLayout;
  viewMode: ViewMode;
  selectedEntityId: string | null;
  connectedNodeIds: string[];
  connectedEdgeIds: string[];
}

export function ReactFlowCanvas({
  projection,
  layoutMode,
  viewMode,
  selectedEntityId,
  connectedNodeIds,
  connectedEdgeIds,
}: ReactFlowCanvasProps) {
  const selectedRelationshipId = useGraphStore(
    (state) => state.selectedRelationshipId,
  );
  const setSelectedEntityId = useGraphStore((state) => state.setSelectedEntityId);
  const setSelectedRelationshipId = useGraphStore(
    (state) => state.setSelectedRelationshipId,
  );
  const setFocusEntityId = useGraphStore((state) => state.setFocusEntityId);
  const resetSelection = useGraphStore((state) => state.resetSelection);
  const [nodePositions, setNodePositions] = useState<Record<string, NodePosition>>({});
  const [reactFlowInstance, setReactFlowInstance] = useState<
    ReactFlowInstance<EntityFlowNode, GraphFlowEdge> | null
  >(null);

  useEffect(() => {
    let cancelled = false;

    void elk
      .layout(buildElkGraph(projection, layoutMode, viewMode))
      .then((layout) => {
        if (cancelled) {
          return;
        }

        const nextPositions = Object.fromEntries(
          (layout.children ?? []).map((child) => [
            child.id,
            {
              x: child.x ?? 0,
              y: child.y ?? 0,
            },
          ]),
        ) as Record<string, NodePosition>;

        startTransition(() => {
          setNodePositions(nextPositions);
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        console.error("ELK layout failed", error);
        startTransition(() => {
          setNodePositions({});
        });
      });

    return () => {
      cancelled = true;
    };
  }, [layoutMode, projection, viewMode]);

  const handlePositions = useMemo(() => getHandlePositions(viewMode), [viewMode]);

  const nodes = useMemo<EntityFlowNode[]>(() => {
    return projection.nodes.map((node) => ({
      id: node.id,
      type: "entity",
      position: nodePositions[node.id] ?? { x: 0, y: 0 },
      sourcePosition: handlePositions.sourcePosition,
      targetPosition: handlePositions.targetPosition,
      draggable: false,
      selectable: false,
      style: {
        width: node.width,
        height: node.height,
      },
      zIndex: node.isFocus ? 10 : 1,
      data: {
        kind: node.kind,
        label: node.label,
        status: node.status,
        isFocus: node.isFocus,
        isSelected: selectedEntityId === node.id,
        isNeighbor: connectedNodeIds.includes(node.id),
        sourcePosition: handlePositions.sourcePosition,
        targetPosition: handlePositions.targetPosition,
      },
    }));
  }, [
    connectedNodeIds,
    handlePositions,
    nodePositions,
    projection.nodes,
    selectedEntityId,
  ]);

  const edges = useMemo<GraphFlowEdge[]>(() => {
    return projection.edges.map((edge) => {
      const isSelected = selectedRelationshipId === edge.id;
      const isConnected = connectedEdgeIds.includes(edge.id);
      const stroke = isConnected ? "#ff7f50" : getEdgeColor(edge.type);

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "step",
        data: {
          isDerivedHierarchy: edge.isDerivedHierarchy,
        },
        label: edge.label,
        selectable: false,
        selected: isSelected,
        className: [
          isSelected ? "is-selected" : "",
          isConnected ? "is-connected" : "",
        ]
          .filter(Boolean)
          .join(" ") || undefined,
        interactionWidth: 20,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: stroke,
        },
        labelShowBg: true,
        labelBgPadding: [4, 2],
        labelBgBorderRadius: 4,
        labelBgStyle: {
          fill: "rgba(255, 255, 255, 0.88)",
        },
        labelStyle: {
          fill: "#2a3950",
          fontSize: 10,
          fontWeight: isSelected ? 700 : 600,
        },
        style: {
          stroke,
          strokeWidth: getEdgeStrokeWidth(edge.type, isSelected, isConnected),
          strokeDasharray: getEdgeStrokeDasharray(edge.type, edge.status),
          opacity: getEdgeOpacity(edge.status),
        },
      };
    });
  }, [connectedEdgeIds, projection.edges, selectedRelationshipId]);

  const hasLayout = projection.nodes.every((node) => nodePositions[node.id] != null);

  useEffect(() => {
    if (!reactFlowInstance || !hasLayout) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      void reactFlowInstance.fitView({
        padding: 0.16,
        duration: 200,
      });
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [hasLayout, reactFlowInstance]);

  return (
    <ReactFlow<EntityFlowNode, GraphFlowEdge>
      className="graph-canvas react-flow-canvas"
      nodes={nodes}
      edges={edges}
      nodeTypes={reactFlowNodeTypes}
      defaultEdgeOptions={{ type: "step" }}
      minZoom={0.2}
      maxZoom={2}
      nodesDraggable={false}
      nodesConnectable={false}
      nodesFocusable={false}
      edgesFocusable={false}
      elementsSelectable={false}
      onInit={(instance) => setReactFlowInstance(instance)}
      onNodeClick={(_, node) => {
        setSelectedEntityId(node.id);
        setFocusEntityId(node.id);
      }}
      onEdgeClick={(_, edge) => {
        if (edge.data?.isDerivedHierarchy) {
          return;
        }
        setSelectedRelationshipId(edge.id);
      }}
      onPaneClick={() => resetSelection()}
    >
      <Controls showInteractive={false} position="top-right" />
    </ReactFlow>
  );
}
