/**
 * GraphCanvas composes store state into a projection and hands the resulting scene to Cytoscape.
 */
import { useMemo, useState } from "react";

import { projectCytoscapeGraph } from "../graph/layout";
import { projectGraph } from "../graph/projection";
import { useCytoscapeController } from "../graph/useCytoscapeController";
import type { GraphDisplayMode } from "../graph/cytoscapeStyles";
import { useGraphStore } from "../state/graphStore";

interface GraphCanvasProps {
  displayMode?: GraphDisplayMode;
}

export function GraphCanvas({ displayMode = "diagram" }: GraphCanvasProps) {
  const graph = useGraphStore((state) => state.graph);
  const viewMode = useGraphStore((state) => state.viewMode);
  const layoutMode = useGraphStore((state) => state.layoutMode);
  const countryDisplayMode = useGraphStore((state) => state.countryDisplayMode);
  const focusEntityId = useGraphStore((state) => state.focusEntityId);
  const selectedEntityId = useGraphStore((state) => state.selectedEntityId);

  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const structuralFocusEntityId =
    viewMode === "governance" ? null : focusEntityId;

  const projection = useMemo(() => {
    if (!graph) {
      return null;
    }

    return projectGraph({
      graph,
      viewMode,
      countryDisplayMode,
      focusEntityId: structuralFocusEntityId,
    });
  }, [countryDisplayMode, graph, structuralFocusEntityId, viewMode]);

  const cytoscapeProjection = useMemo(() => {
    if (!projection) {
      return null;
    }

    return projectCytoscapeGraph(projection, layoutMode, viewMode, displayMode);
  }, [displayMode, layoutMode, projection, viewMode]);

  const controllerProjection =
    cytoscapeProjection ?? {
      elements: [] as ReturnType<typeof projectCytoscapeGraph>["elements"],
      layout: { name: "grid" },
    };

  const selectedNeighborhood = useMemo(() => {
    const connectedNodeIds = new Set<string>();
    const connectedEdgeIds = new Set<string>();

    if (!projection || !selectedEntityId) {
      return {
        connectedNodeIds: [] as string[],
        connectedEdgeIds: [] as string[],
      };
    }

    for (const edge of projection.edges) {
      if (edge.source !== selectedEntityId && edge.target !== selectedEntityId) {
        continue;
      }

      connectedEdgeIds.add(edge.id);
      if (edge.source !== selectedEntityId) {
        connectedNodeIds.add(edge.source);
      }
      if (edge.target !== selectedEntityId) {
        connectedNodeIds.add(edge.target);
      }
    }

    return {
      connectedNodeIds: [...connectedNodeIds],
      connectedEdgeIds: [...connectedEdgeIds],
    };
  }, [projection, selectedEntityId]);

  const structuralKey = useMemo(() => {
    return JSON.stringify({
      viewMode,
      displayMode,
      layoutMode,
      countryDisplayMode,
      nodes: projection?.nodes.map((node) => `${node.id}:${node.parentId ?? ""}`) ?? [],
      edges:
        projection?.edges.map((edge) => `${edge.id}:${edge.source}:${edge.target}`) ?? [],
    });
  }, [
    countryDisplayMode,
    displayMode,
    layoutMode,
    projection,
    viewMode,
  ]);

  useCytoscapeController({
    container,
    projection: controllerProjection,
    structuralKey,
    focusedEntityId: focusEntityId,
    selectedEntityId,
    connectedNodeIds: selectedNeighborhood.connectedNodeIds,
    connectedEdgeIds: selectedNeighborhood.connectedEdgeIds,
    displayMode,
  });

  if (!projection) {
    return <div className="graph-canvas" />;
  }

  return <div className="graph-canvas" ref={setContainer} />;
}
