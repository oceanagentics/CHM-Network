/**
 * GraphCanvas composes store state into a projection and hands the resulting scene to Cytoscape.
 */
import { useMemo, useState } from "react";

import { projectCytoscapeGraph, projectGraph } from "../graph/projectGraph";
import { useCytoscapeController } from "../graph/useCytoscapeController";
import { useGraphStore } from "../state/graphStore";

export function GraphCanvas() {
  const graph = useGraphStore((state) => state.graph);
  const viewMode = useGraphStore((state) => state.viewMode);
  const layoutMode = useGraphStore((state) => state.layoutMode);
  const countryDisplayMode = useGraphStore((state) => state.countryDisplayMode);
  const focusEntityId = useGraphStore((state) => state.focusEntityId);
  const selectedEntityId = useGraphStore((state) => state.selectedEntityId);

  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  const projection = useMemo(() => {
    if (!graph) {
      return null;
    }

    return projectGraph({
      graph,
      viewMode,
      countryDisplayMode,
      focusEntityId,
    });
  }, [countryDisplayMode, focusEntityId, graph, viewMode]);

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
      viewMode,
      layoutMode,
      countryDisplayMode,
      focusEntityId,
      entityCount: graph?.entities.length ?? 0,
      relationshipCount: graph?.relationships.length ?? 0,
    });
  }, [countryDisplayMode, focusEntityId, graph, layoutMode, viewMode]);

  useCytoscapeController({
    container,
    elements: cytoscapeProjection?.elements ?? [],
    layout: cytoscapeProjection?.layout ?? { name: "grid" },
    postPass: cytoscapeProjection?.postPass,
    structuralKey,
    selectedEntityId,
    connectedNodeIds: selectedNeighborhood.connectedNodeIds,
    connectedEdgeIds: selectedNeighborhood.connectedEdgeIds,
  });

  if (!projection) {
    return <div className="graph-canvas" />;
  }

  return <div className="graph-canvas" ref={setContainer} />;
}
