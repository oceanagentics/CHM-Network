import { useMemo, useState } from "react";

import { projectGraph } from "../graph/projectGraph";
import { useCytoscapeController } from "../graph/useCytoscapeController";
import { useGraphStore } from "../state/graphStore";

export function GraphCanvas() {
  const graph = useGraphStore((state) => state.graph);
  const viewMode = useGraphStore((state) => state.viewMode);
  const layoutMode = useGraphStore((state) => state.layoutMode);
  const countryDisplayMode = useGraphStore((state) => state.countryDisplayMode);
  const focusEntityId = useGraphStore((state) => state.focusEntityId);

  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  const projection = useMemo(() => {
    if (!graph) {
      return null;
    }

    return projectGraph({
      graph,
      viewMode,
      layoutMode,
      countryDisplayMode,
      focusEntityId,
    });
  }, [countryDisplayMode, focusEntityId, graph, layoutMode, viewMode]);

  const structuralKey = useMemo(() => {
    return JSON.stringify({
      viewMode,
      layoutMode,
      countryDisplayMode,
      focusEntityId,
      graphVersion: graph?.entities.length ?? 0,
    });
  }, [countryDisplayMode, focusEntityId, graph, layoutMode, viewMode]);

  useCytoscapeController({
    container,
    elements: projection?.elements ?? [],
    layout: projection?.layout ?? { name: "grid" },
    structuralKey,
  });

  return <div className="graph-canvas" ref={setContainer} />;
}
