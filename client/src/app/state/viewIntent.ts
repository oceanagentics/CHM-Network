/**
 * View-intent helpers normalize focus rules without owning any store state.
 */
import type { ViewMode } from "../../../../shared/domain";
import type { IndexedGraph } from "../graph/indexGraph";

export function getDefaultFocusEntityId(
  graph: IndexedGraph | null,
  viewMode: ViewMode,
): string | null {
  if (viewMode === "technical") {
    return (
      graph?.entities.find((entity) => entity.kind === "system")?.id ??
      "system-bismal"
    );
  }

  return (
    graph?.entities.find((entity) => entity.kind === "country")?.id ??
    "country-jpn"
  );
}

export function isFocusAllowedForView(
  graph: IndexedGraph | null,
  viewMode: ViewMode,
  focusEntityId: string | null,
): boolean {
  if (focusEntityId == null) {
    return true;
  }

  const entity = graph?.entityById[focusEntityId];
  if (!entity) {
    return false;
  }

  if (viewMode === "technical") {
    return entity.kind === "system";
  }

  if (viewMode === "country") {
    return entity.kind === "country";
  }

  return true;
}

export function normalizeFocusForView(
  graph: IndexedGraph | null,
  viewMode: ViewMode,
  focusEntityId: string | null,
): string | null {
  const preferredFocusEntityId =
    focusEntityId ?? getDefaultFocusEntityId(graph, viewMode);
  return isFocusAllowedForView(graph, viewMode, preferredFocusEntityId)
    ? preferredFocusEntityId
    : getDefaultFocusEntityId(graph, viewMode);
}
