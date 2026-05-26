import type cytoscape from "cytoscape";

import type { Entity, Relationship, ViewMode } from "../../../../shared/domain";
import type { CountryDisplayMode, GraphLayout } from "../state/graphStore";
import { collectAncestors, collectDescendants, type IndexedGraph } from "./indexGraph";

type GraphNodeData = {
  id: string;
  label: string;
  kind: Entity["kind"];
  status: Entity["status"];
  subtype?: string | null;
  parent?: string;
};

type GraphEdgeData = {
  id: string;
  source: string;
  target: string;
  type: Relationship["type"];
  status: Relationship["status"];
  label: string;
};

export interface ProjectionInput {
  graph: IndexedGraph;
  viewMode: ViewMode;
  layoutMode: GraphLayout;
  countryDisplayMode: CountryDisplayMode;
  focusEntityId: string | null;
}

export interface ProjectionOutput {
  elements: cytoscape.ElementDefinition[];
  layout: cytoscape.LayoutOptions;
}

function expandNeighborhood(
  graph: IndexedGraph,
  seedIds: Set<string>,
  depth: number,
): Set<string> {
  const ids = new Set(seedIds);
  let frontier = new Set(seedIds);

  for (let step = 0; step < depth; step += 1) {
    const next = new Set<string>();
    for (const entityId of frontier) {
      const relationshipIds = [
        ...(graph.outgoingByEntityId[entityId] ?? []),
        ...(graph.incomingByEntityId[entityId] ?? []),
      ];

      for (const relationshipId of relationshipIds) {
        const relationship = graph.relationshipById[relationshipId];
        if (!ids.has(relationship.sourceEntityId)) {
          ids.add(relationship.sourceEntityId);
          next.add(relationship.sourceEntityId);
        }
        if (!ids.has(relationship.targetEntityId)) {
          ids.add(relationship.targetEntityId);
          next.add(relationship.targetEntityId);
        }
      }
    }

    frontier = next;
  }

  return ids;
}

function getGovernanceIds(graph: IndexedGraph): Set<string> {
  return new Set(graph.entities.map((entity) => entity.id));
}

function getCountryIds(graph: IndexedGraph, focusEntityId: string): Set<string> {
  const seedIds = collectDescendants(graph, focusEntityId);
  for (const ancestorId of collectAncestors(graph, focusEntityId)) {
    seedIds.add(ancestorId);
  }

  return expandNeighborhood(graph, seedIds, 3);
}

function getTechnicalIds(graph: IndexedGraph, focusEntityId: string): Set<string> {
  const seedIds = new Set<string>([focusEntityId]);
  for (const ancestorId of collectAncestors(graph, focusEntityId)) {
    seedIds.add(ancestorId);
  }

  return expandNeighborhood(graph, seedIds, 3);
}

function stylizeCharacters(
  value: string,
  offsets: { upper: number; lower: number; digit?: number },
): string {
  return Array.from(value)
    .map((character) => {
      const codePoint = character.codePointAt(0);
      if (codePoint == null) {
        return character;
      }

      if (codePoint >= 65 && codePoint <= 90) {
        return String.fromCodePoint(offsets.upper + (codePoint - 65));
      }

      if (codePoint >= 97 && codePoint <= 122) {
        return String.fromCodePoint(offsets.lower + (codePoint - 97));
      }

      if (offsets.digit != null && codePoint >= 48 && codePoint <= 57) {
        return String.fromCodePoint(offsets.digit + (codePoint - 48));
      }

      return character;
    })
    .join("");
}

function boldSansDisplayText(value: string): string {
  return stylizeCharacters(value, {
    upper: 0x1d5d4,
    lower: 0x1d5ee,
    digit: 0x1d7ec,
  });
}

function italicSansDisplayText(value: string): string {
  return stylizeCharacters(value, {
    upper: 0x1d608,
    lower: 0x1d622,
  });
}

function buildLabel(entity: Entity): string {
  const typeLabel = entity.subtype ?? entity.kind;
  return `${boldSansDisplayText(entity.name)}\n${italicSansDisplayText(typeLabel)}`;
}

function getCountryContainerByCode(
  graph: IndexedGraph,
  viewMode: ViewMode,
  countryDisplayMode: CountryDisplayMode,
): Record<string, string> {
  if (viewMode === "technical" || countryDisplayMode !== "engulf") {
    return {};
  }

  return Object.fromEntries(
    graph.entities
      .filter((entity) => entity.kind === "country" && entity.countryCode)
      .map((entity) => [entity.countryCode as string, entity.id]),
  );
}

function edgeLabel(type: Relationship["type"]): string {
  switch (type) {
    case "part_of":
      return "part of";
    case "operates":
      return "operates";
    case "publishes_to":
      return "publishes to";
    case "syncs_to":
      return "syncs to";
  }
}

function shouldHideEdgeInEngulfMode(
  graph: IndexedGraph,
  relationship: Relationship,
  viewMode: ViewMode,
  countryDisplayMode: CountryDisplayMode,
): boolean {
  if (viewMode === "technical" || countryDisplayMode !== "engulf") {
    return false;
  }

  if (relationship.type !== "part_of") {
    return false;
  }

  return graph.entityById[relationship.targetEntityId]?.kind === "country";
}

function dagreEdgeWeight(
  viewMode: ViewMode,
  edge: cytoscape.EdgeSingular,
): number {
  const type = edge.data("type") as Relationship["type"];

  if (viewMode === "technical") {
    return type === "syncs_to" || type === "publishes_to" ? 10 : 4;
  }

  switch (type) {
    case "part_of":
      return 12;
    case "operates":
      return 10;
    case "publishes_to":
      return 3;
    case "syncs_to":
      return 1;
  }
}

function dagreMinLen(
  viewMode: ViewMode,
  edge: cytoscape.EdgeSingular,
): number {
  const type = edge.data("type") as Relationship["type"];

  if (viewMode === "technical") {
    return type === "syncs_to" || type === "publishes_to" ? 2 : 1;
  }

  switch (type) {
    case "part_of":
      return 2;
    case "operates":
      return 2;
    case "publishes_to":
      return 1;
    case "syncs_to":
      return 1;
  }
}

function getLayout(
  layoutMode: GraphLayout,
  viewMode: ViewMode,
  focusEntityId: string | null,
): cytoscape.LayoutOptions {
  if (layoutMode === "grid") {
    return {
      name: "grid",
      padding: 48,
      avoidOverlap: true,
      fit: false,
      animate: false,
    };
  }

  if (layoutMode === "circle") {
    return {
      name: "circle",
      padding: 48,
      avoidOverlap: true,
      fit: false,
      animate: false,
    };
  }

  if (layoutMode === "concentric") {
    return {
      name: "concentric",
      padding: 48,
      avoidOverlap: true,
      fit: false,
      animate: false,
    };
  }

  if (layoutMode === "breadthfirst") {
    return {
      name: "breadthfirst",
      directed: true,
      roots: focusEntityId ? [`#${focusEntityId}`] : undefined,
      padding: 48,
      spacingFactor: 1.2,
      fit: false,
      animate: false,
    };
  }

  if (layoutMode === "cose") {
    return {
      name: "cose",
      padding: 48,
      fit: false,
      animate: false,
    };
  }

  if (layoutMode === "dagre") {
    return {
      name: "dagre",
      rankDir: viewMode === "technical" ? "LR" : "TB",
      rankSep: 80,
      nodeSep: 32,
      edgeSep: 18,
      edgeWeight: (edge: cytoscape.EdgeSingular) => dagreEdgeWeight(viewMode, edge),
      minLen: (edge: cytoscape.EdgeSingular) => dagreMinLen(viewMode, edge),
      padding: 48,
      fit: false,
      animate: false,
    } as cytoscape.LayoutOptions;
  }

  if (layoutMode === "fcose") {
    return {
      name: "fcose",
      quality: "default",
      randomize: false,
      padding: 48,
      fit: false,
      animate: false,
    } as cytoscape.LayoutOptions;
  }

  if (layoutMode === "elk-layered") {
    return {
      name: "elk",
      padding: 48,
      fit: false,
      animate: false,
      elk: {
        algorithm: "layered",
        "elk.direction": viewMode === "technical" ? "RIGHT" : "DOWN",
      },
    } as cytoscape.LayoutOptions;
  }

  if (layoutMode === "elk-mrtree") {
    return {
      name: "elk",
      padding: 48,
      fit: false,
      animate: false,
      elk: {
        algorithm: "mrtree",
      },
    } as cytoscape.LayoutOptions;
  }

  if (layoutMode === "elk-stress") {
    return {
      name: "elk",
      padding: 48,
      fit: false,
      animate: false,
      elk: {
        algorithm: "stress",
      },
    } as cytoscape.LayoutOptions;
  }

  return {
    name: "elk",
    padding: 48,
    fit: false,
    animate: false,
    elk: {
      algorithm: "force",
    },
  } as cytoscape.LayoutOptions;
}

export function projectGraph(input: ProjectionInput): ProjectionOutput {
  const { graph, viewMode, layoutMode, countryDisplayMode, focusEntityId } = input;

  const defaultCountry = graph.entities.find((entity) => entity.kind === "country")?.id ?? null;
  const defaultSystem = graph.entities.find((entity) => entity.kind === "system")?.id ?? null;
  const effectiveFocusEntityId =
    focusEntityId ?? (viewMode === "technical" ? defaultSystem : defaultCountry);
  const countryContainerByCode = getCountryContainerByCode(
    graph,
    viewMode,
    countryDisplayMode,
  );

  let includedIds = new Set<string>();
  if (viewMode === "governance") {
    includedIds = getGovernanceIds(graph);
  } else if (viewMode === "country" && effectiveFocusEntityId) {
    includedIds = getCountryIds(graph, effectiveFocusEntityId);
  } else if (viewMode === "technical" && effectiveFocusEntityId) {
    includedIds = getTechnicalIds(graph, effectiveFocusEntityId);
  }

  const includedEntities = graph.entities.filter((entity) => includedIds.has(entity.id));
  const visibleIds = new Set(includedEntities.map((entity) => entity.id));

  const nodeElements: cytoscape.ElementDefinition[] = includedEntities.map((entity) => ({
    data: {
      id: entity.id,
      label: buildLabel(entity),
      kind: entity.kind,
      status: entity.status,
      subtype: entity.subtype,
      parent:
        entity.countryCode &&
        entity.kind !== "country" &&
        countryContainerByCode[entity.countryCode] &&
        entity.id !== countryContainerByCode[entity.countryCode]
          ? countryContainerByCode[entity.countryCode]
          : undefined,
    } satisfies GraphNodeData,
    classes: entity.id === effectiveFocusEntityId ? "is-focus" : "",
  }));

  const edgeElements: cytoscape.ElementDefinition[] = graph.relationships
    .filter(
      (relationship) =>
        !shouldHideEdgeInEngulfMode(graph, relationship, viewMode, countryDisplayMode) &&
        visibleIds.has(relationship.sourceEntityId) &&
        visibleIds.has(relationship.targetEntityId),
    )
    .map((relationship) => ({
      data: {
        id: relationship.id,
        source: relationship.sourceEntityId,
        target: relationship.targetEntityId,
        type: relationship.type,
        status: relationship.status,
        label: edgeLabel(relationship.type),
      } satisfies GraphEdgeData,
    }));

  return {
    elements: [...nodeElements, ...edgeElements],
    layout: getLayout(layoutMode, viewMode, effectiveFocusEntityId),
  };
}
