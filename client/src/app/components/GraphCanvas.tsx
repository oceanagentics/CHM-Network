import { useMemo, useState } from "react";

import { projectCytoscapeGraph, projectGraph } from "../graph/projectGraph";
import { useCytoscapeController } from "../graph/useCytoscapeController";
import { useGraphStore } from "../state/graphStore";
import { ReactFlowCanvas } from "./ReactFlowCanvas";

export function GraphCanvas() {
  const graph = useGraphStore((state) => state.graph);
  const viewMode = useGraphStore((state) => state.viewMode);
  const layoutMode = useGraphStore((state) => state.layoutMode);
  const rendererMode = useGraphStore((state) => state.rendererMode);
  const countryDisplayMode = useGraphStore((state) => state.countryDisplayMode);
  const focusEntityId = useGraphStore((state) => state.focusEntityId);
  const selectedEntityId = useGraphStore((state) => state.selectedEntityId);

  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  const projectedCountryDisplayMode =
    rendererMode === "react-flow" && countryDisplayMode === "engulf"
      ? "node"
      : countryDisplayMode;

  const projection = useMemo(() => {
    if (!graph) {
      return null;
    }

    return projectGraph({
      graph,
      viewMode,
      countryDisplayMode: projectedCountryDisplayMode,
      focusEntityId,
    });
  }, [focusEntityId, graph, projectedCountryDisplayMode, viewMode]);

  const cytoscapeProjection = useMemo(() => {
    if (!projection) {
      return null;
    }

    return projectCytoscapeGraph(projection, layoutMode, viewMode);
  }, [layoutMode, projection, viewMode]);

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
      rendererMode,
      viewMode,
      layoutMode,
      countryDisplayMode,
      focusEntityId,
      entityCount: graph?.entities.length ?? 0,
      relationshipCount: graph?.relationships.length ?? 0,
    });
  }, [
    countryDisplayMode,
    focusEntityId,
    graph,
    layoutMode,
    rendererMode,
    viewMode,
  ]);

  useCytoscapeController({
    container: rendererMode === "cytoscape" ? container : null,
    elements: cytoscapeProjection?.elements ?? [],
    layout: cytoscapeProjection?.layout ?? { name: "grid" },
    structuralKey,
    selectedEntityId,
    connectedNodeIds: selectedNeighborhood.connectedNodeIds,
    connectedEdgeIds: selectedNeighborhood.connectedEdgeIds,
  });

  if (!projection) {
    return <div className="graph-canvas" />;
  }

  if (rendererMode === "react-flow") {
    return (
      <ReactFlowCanvas
        projection={projection}
        layoutMode={layoutMode}
        viewMode={viewMode}
        selectedEntityId={selectedEntityId}
        connectedNodeIds={selectedNeighborhood.connectedNodeIds}
        connectedEdgeIds={selectedNeighborhood.connectedEdgeIds}
      />
    );
  }

  return <div className="graph-canvas" ref={setContainer} />;
}
