import { create } from "zustand";

import type {
  GraphBootstrapPayload,
  SavedView,
  ViewMode,
} from "../../../../shared/domain";
import { indexGraph, type IndexedGraph } from "../graph/indexGraph";

export const graphLayouts = [
  "grid",
  "circle",
  "concentric",
  "breadthfirst",
  "cose",
  "dagre",
  "fcose",
  "elk-layered",
  "elk-mrtree",
  "elk-stress",
  "elk-force",
] as const;

export type GraphLayout = (typeof graphLayouts)[number];
export type CountryDisplayMode = "node" | "engulf";

interface ViewportSnapshot {
  zoom: number;
  panX: number;
  panY: number;
}

interface GraphState {
  graph: IndexedGraph | null;
  loading: boolean;
  error: string | null;
  viewMode: ViewMode;
  layoutMode: GraphLayout;
  countryDisplayMode: CountryDisplayMode;
  focusEntityId: string | null;
  selectedEntityId: string | null;
  selectedRelationshipId: string | null;
  savedViews: SavedView[];
  viewport: ViewportSnapshot | null;
  setBootstrap: (payload: GraphBootstrapPayload) => void;
  setSavedViews: (savedViews: SavedView[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setViewMode: (viewMode: ViewMode) => void;
  setLayoutMode: (layoutMode: GraphLayout) => void;
  setCountryDisplayMode: (countryDisplayMode: CountryDisplayMode) => void;
  setFocusEntityId: (focusEntityId: string | null) => void;
  setSelectedEntityId: (selectedEntityId: string | null) => void;
  setSelectedRelationshipId: (selectedRelationshipId: string | null) => void;
  setViewport: (viewport: ViewportSnapshot | null) => void;
  resetSelection: () => void;
}

export const useGraphStore = create<GraphState>((set) => ({
  graph: null,
  loading: true,
  error: null,
  viewMode: "governance",
  layoutMode: "dagre",
  countryDisplayMode: "engulf",
  focusEntityId: null,
  selectedEntityId: null,
  selectedRelationshipId: null,
  savedViews: [],
  viewport: null,
  setBootstrap: (payload) =>
    set({
      graph: indexGraph(payload),
      savedViews: payload.savedViews,
      loading: false,
      error: null,
    }),
  setSavedViews: (savedViews) => set({ savedViews }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
  setViewMode: (viewMode) =>
    set((state) => ({
      viewMode,
      focusEntityId:
        viewMode === "technical"
          ? state.focusEntityId ?? "system-bismal"
          : state.focusEntityId ?? "country-jpn",
      selectedEntityId: null,
      selectedRelationshipId: null,
    })),
  setLayoutMode: (layoutMode) => set({ layoutMode }),
  setCountryDisplayMode: (countryDisplayMode) => set({ countryDisplayMode }),
  setFocusEntityId: (focusEntityId) => set({ focusEntityId }),
  setSelectedEntityId: (selectedEntityId) =>
    set({ selectedEntityId, selectedRelationshipId: null }),
  setSelectedRelationshipId: (selectedRelationshipId) =>
    set({ selectedRelationshipId, selectedEntityId: null }),
  setViewport: (viewport) => set({ viewport }),
  resetSelection: () => set({ selectedEntityId: null, selectedRelationshipId: null }),
}));
