/**
 * Zustand state for graph data, view intent, selection state, and saved view metadata.
 */
import { create } from "zustand";

import type {
  GraphBootstrapPayload,
  SavedView,
  ViewMode,
} from "../../../../shared/domain";
import { indexGraph, type IndexedGraph } from "../graph/indexGraph";
import { emptySearchFilters, type GraphSearchFilters } from "../search";
import {
  isFocusAllowedForView,
  normalizeFocusForView,
} from "./viewIntent";

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
export type GraphDisplayMode = "graph" | "globe";

function getInitialDisplayMode(): GraphDisplayMode {
  if (typeof window === "undefined") {
    return "graph";
  }

  return new URLSearchParams(window.location.search).get("display") === "globe"
    ? "globe"
    : "graph";
}

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
  displayMode: GraphDisplayMode;
  layoutMode: GraphLayout;
  countryDisplayMode: CountryDisplayMode;
  focusEntityId: string | null;
  selectedEntityId: string | null;
  selectedRelationshipId: string | null;
  savedViews: SavedView[];
  viewport: ViewportSnapshot | null;
  searchQuery: string;
  searchFilters: GraphSearchFilters;
  setBootstrap: (payload: GraphBootstrapPayload) => void;
  setSavedViews: (savedViews: SavedView[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setViewMode: (viewMode: ViewMode) => void;
  setDisplayMode: (displayMode: GraphDisplayMode) => void;
  setLayoutMode: (layoutMode: GraphLayout) => void;
  setCountryDisplayMode: (countryDisplayMode: CountryDisplayMode) => void;
  setFocusEntityId: (focusEntityId: string | null) => void;
  setSelectedEntityId: (selectedEntityId: string | null) => void;
  setSelectedRelationshipId: (selectedRelationshipId: string | null) => void;
  setViewport: (viewport: ViewportSnapshot | null) => void;
  setSearchQuery: (searchQuery: string) => void;
  setSearchFilters: (searchFilters: GraphSearchFilters) => void;
  resetSearchFilters: () => void;
  resetSearch: () => void;
  resetSelection: () => void;
}

export const useGraphStore = create<GraphState>((set) => ({
  graph: null,
  loading: true,
  error: null,
  viewMode: "governance",
  displayMode: getInitialDisplayMode(),
  layoutMode: "elk-mrtree",
  countryDisplayMode: "engulf",
  focusEntityId: null,
  selectedEntityId: null,
  selectedRelationshipId: null,
  savedViews: [],
  viewport: null,
  searchQuery: "",
  searchFilters: emptySearchFilters(),
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
  setDisplayMode: (displayMode) => set({ displayMode }),
  setViewMode: (viewMode) =>
    set((state) => ({
      viewMode,
      focusEntityId: normalizeFocusForView(state.graph, viewMode, state.focusEntityId),
      selectedEntityId: null,
      selectedRelationshipId: null,
    })),
  setLayoutMode: (layoutMode) => set({ layoutMode }),
  setCountryDisplayMode: (countryDisplayMode) =>
    set({ countryDisplayMode }),
  setFocusEntityId: (focusEntityId) =>
    set((state) =>
      isFocusAllowedForView(state.graph, state.viewMode, focusEntityId)
        ? { focusEntityId }
        : {},
    ),
  setSelectedEntityId: (selectedEntityId) =>
    set({ selectedEntityId, selectedRelationshipId: null }),
  setSelectedRelationshipId: (selectedRelationshipId) =>
    set({ selectedRelationshipId, selectedEntityId: null }),
  setViewport: (viewport) => set({ viewport }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSearchFilters: (searchFilters) => set({ searchFilters }),
  resetSearchFilters: () => set({ searchFilters: emptySearchFilters() }),
  resetSearch: () =>
    set({
      searchQuery: "",
      searchFilters: emptySearchFilters(),
    }),
  resetSelection: () => set({ selectedEntityId: null, selectedRelationshipId: null }),
}));
