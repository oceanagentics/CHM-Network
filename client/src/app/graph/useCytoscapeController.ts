import { useEffect, useMemo, useRef } from "react";
import cytoscape, { type Core, type ElementDefinition, type LayoutOptions } from "cytoscape";
import dagre from "cytoscape-dagre";
import elk from "cytoscape-elk";
import fcose from "cytoscape-fcose";

import { cytoscapeStyles } from "./cytoscapeStyles";
import { useGraphStore } from "../state/graphStore";

cytoscape.use(dagre);
cytoscape.use(fcose);
cytoscape.use(elk);

interface UseCytoscapeControllerOptions {
  container: HTMLDivElement | null;
  elements: ElementDefinition[];
  layout: LayoutOptions;
  structuralKey: string;
  selectedEntityId: string | null;
  connectedNodeIds: string[];
  connectedEdgeIds: string[];
}

export function useCytoscapeController({
  container,
  elements,
  layout,
  structuralKey,
  selectedEntityId,
  connectedNodeIds,
  connectedEdgeIds,
}: UseCytoscapeControllerOptions): Core | null {
  const cyRef = useRef<Core | null>(null);
  const lastStructuralKeyRef = useRef<string | null>(null);
  const pendingInitialFitRef = useRef(false);
  const preservedViewportRef = useRef<{
    zoom: number;
    pan: { x: number; y: number };
  } | null>(null);

  useEffect(() => {
    if (!container || cyRef.current) {
      return;
    }

    const cy = cytoscape({
      container,
      elements: [],
      style: cytoscapeStyles,
    });

    cy.on("tap", "node", (event) => {
      const nodeId = event.target.id();
      preservedViewportRef.current = {
        zoom: cy.zoom(),
        pan: cy.pan(),
      };
      const state = useGraphStore.getState();
      state.setSelectedEntityId(nodeId);
      state.setFocusEntityId(nodeId);
    });

    cy.on("tap", "edge", (event) => {
      if (event.target.data("isDerivedHierarchy")) {
        return;
      }
      useGraphStore.getState().setSelectedRelationshipId(event.target.id());
    });

    cy.on("tap", (event) => {
      if (event.target === cy) {
        useGraphStore.getState().resetSelection();
      }
    });

    cyRef.current = cy;

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            cy.resize();
            if (
              pendingInitialFitRef.current &&
              container.clientWidth > 0 &&
              container.clientHeight > 0 &&
              cy.elements().length > 0
            ) {
              cy.fit(cy.elements(), 48);
              pendingInitialFitRef.current = false;
            }
          });

    resizeObserver?.observe(container);

    return () => {
      resizeObserver?.disconnect();
      cy.destroy();
      cyRef.current = null;
    };
  }, [container]);

  const stableElements = useMemo(() => elements, [elements]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !container) {
      return;
    }

    cy.batch(() => {
      cy.elements().remove();
      cy.add(stableElements);
    });

    const didStructureChange = lastStructuralKeyRef.current !== structuralKey;
    lastStructuralKeyRef.current = structuralKey;
    const shouldPreserveViewport =
      didStructureChange && preservedViewportRef.current !== null;
    pendingInitialFitRef.current = didStructureChange && !shouldPreserveViewport;

    const nextLayout = {
      ...layout,
      fit: false,
    } as LayoutOptions & {
      fit?: boolean;
      padding?: number;
    };
    if (didStructureChange && nextLayout.padding == null) {
      nextLayout.padding = 48;
    }

    const layoutRunner = cy.layout(nextLayout);
    if (didStructureChange) {
      layoutRunner.on("layoutstop", () => {
        cy.resize();
        if (
          shouldPreserveViewport &&
          preservedViewportRef.current &&
          cy.container()?.clientWidth &&
          cy.container()?.clientHeight
        ) {
          cy.zoom(preservedViewportRef.current.zoom);
          cy.pan(preservedViewportRef.current.pan);
          preservedViewportRef.current = null;
          pendingInitialFitRef.current = false;
          return;
        }

        if (cy.container()?.clientWidth && cy.container()?.clientHeight) {
          cy.fit(cy.elements(), nextLayout.padding ?? 48);
          pendingInitialFitRef.current = false;
        }
      });
    }

    requestAnimationFrame(() => {
      cy.resize();
      layoutRunner.run();
    });
  }, [container, layout, stableElements, structuralKey]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) {
      return;
    }

    cy.batch(() => {
      cy.nodes().removeClass("is-selected is-neighbor");
      cy.edges().removeClass("is-connected");

      if (!selectedEntityId) {
        return;
      }

      cy.$id(selectedEntityId).addClass("is-selected");
      for (const nodeId of connectedNodeIds) {
        cy.$id(nodeId).addClass("is-neighbor");
      }
      for (const edgeId of connectedEdgeIds) {
        cy.$id(edgeId).addClass("is-connected");
      }
    });
  }, [connectedEdgeIds, connectedNodeIds, selectedEntityId]);

  return cyRef.current;
}
