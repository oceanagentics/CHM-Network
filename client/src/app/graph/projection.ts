/**
 * Structural projection turns scoped graph data into visible nodes, edges, and containers.
 */
import type { Entity, Relationship, ViewMode } from "../../../../shared/domain";
import type { CountryDisplayMode } from "../state/graphStore";
import { buildLabel, getLayoutBand, getNodeDimensions, type NodeGeometry } from "./geometry";
import { collectDescendants, type IndexedGraph } from "./indexGraph";
import {
  getCountryIds,
  getGovernanceIds,
  getTechnicalIds,
  includeAncestorChains,
} from "./scope";

export interface ProjectionInput {
  graph: IndexedGraph;
  viewMode: ViewMode;
  countryDisplayMode: CountryDisplayMode;
  focusEntityId: string | null;
}

export type GovernanceBlock = "national" | "international" | null;

export interface GraphProjectionNode extends NodeGeometry {
  id: string;
  label: string;
  kind: Entity["kind"];
  status: Entity["status"];
  subtype: string | null;
  countryCode: string | null;
  governanceBlock: GovernanceBlock;
  layoutBand: number;
  parentId?: string;
}

export type GraphProjectionEdgeType = Relationship["type"] | "hierarchy";

export interface GraphProjectionEdge {
  id: string;
  source: string;
  target: string;
  type: GraphProjectionEdgeType;
  status: Relationship["status"];
  label: string;
  isDerivedHierarchy: boolean;
}

export interface GraphProjection {
  nodes: GraphProjectionNode[];
  edges: GraphProjectionEdge[];
  effectiveFocusEntityId: string | null;
}

const governanceInternationalBandByKind = {
  country: 5,
  organization: 4,
  system: 3,
} satisfies Record<Entity["kind"], number>;

function getProjectionLayoutBand(
  entity: Entity,
  viewMode: ViewMode,
  governanceInternationalIds: Set<string>,
): number {
  if (viewMode === "governance" && governanceInternationalIds.has(entity.id)) {
    return governanceInternationalBandByKind[entity.kind];
  }

  return getLayoutBand(entity.kind);
}

function getGovernanceBlock(
  entityId: string,
  viewMode: ViewMode,
  governanceInternationalIds: Set<string>,
): GovernanceBlock {
  if (viewMode !== "governance") {
    return null;
  }

  return governanceInternationalIds.has(entityId) ? "international" : "national";
}

function buildProjectionNode(
  entity: Entity,
  governanceBlock: GovernanceBlock,
  layoutBand: number,
): GraphProjectionNode {
  const label = buildLabel(entity);

  return {
    id: entity.id,
    label,
    kind: entity.kind,
    status: entity.status,
    subtype: entity.subtype,
    countryCode: entity.countryCode,
    governanceBlock,
    layoutBand,
    ...getNodeDimensions(entity.kind, label),
  };
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

function canUseHierarchyParentAsVisualContainer(
  entity: Entity,
  parent: Entity,
  viewMode: ViewMode,
  countryDisplayMode: CountryDisplayMode,
): boolean {
  if (viewMode === "technical" || countryDisplayMode !== "engulf") {
    return true;
  }

  if (!entity.countryCode || !parent.countryCode) {
    return true;
  }

  return entity.countryCode === parent.countryCode;
}

function getNodeParentId(
  graph: IndexedGraph,
  entity: Entity,
  visibleIds: Set<string>,
  countryContainerByCode: Record<string, string>,
  viewMode: ViewMode,
  countryDisplayMode: CountryDisplayMode,
): string | undefined {
  if (entity.parentEntityId && visibleIds.has(entity.parentEntityId)) {
    const parent = graph.entityById[entity.parentEntityId];
    if (
      parent &&
      canUseHierarchyParentAsVisualContainer(entity, parent, viewMode, countryDisplayMode)
    ) {
      return entity.parentEntityId;
    }
  }

  if (
    entity.countryCode &&
    entity.kind !== "country" &&
    countryContainerByCode[entity.countryCode] &&
    entity.id !== countryContainerByCode[entity.countryCode]
  ) {
    return countryContainerByCode[entity.countryCode];
  }

  return undefined;
}

function edgeLabel(type: GraphProjectionEdgeType): string {
  switch (type) {
    case "governs":
      return "governs";
    case "operates":
      return "operates";
    case "publishes_to":
      return "publishes to";
    case "syncs_to":
      return "syncs to";
    case "hierarchy":
      return "part of";
  }
}

function shouldHideEdgeInEngulfMode(
  relationship: Relationship,
  nodeParentIdById: Record<string, string | undefined>,
  viewMode: ViewMode,
  countryDisplayMode: CountryDisplayMode,
): boolean {
  if (viewMode === "technical" || countryDisplayMode !== "engulf") {
    return false;
  }

  if (relationship.type !== "governs") {
    return false;
  }

  return nodeParentIdById[relationship.targetEntityId] === relationship.sourceEntityId;
}

export function projectGraph(input: ProjectionInput): GraphProjection {
  const { graph, viewMode, countryDisplayMode, focusEntityId } = input;

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

  includedIds = includeAncestorChains(graph, includedIds);

  const includedEntities = graph.entities.filter((entity) => includedIds.has(entity.id));
  const visibleIds = new Set(includedEntities.map((entity) => entity.id));
  const governanceInternationalIds = new Set<string>();

  if (viewMode === "governance") {
    for (const entity of includedEntities) {
      if (entity.countryCode === "INT") {
        governanceInternationalIds.add(entity.id);
      }
    }

    if (graph.entityById["country-int"]) {
      for (const entityId of collectDescendants(graph, "country-int")) {
        if (visibleIds.has(entityId)) {
          governanceInternationalIds.add(entityId);
        }
      }
    }
  }

  const nodes = includedEntities.map((entity) => {
    const parentId = getNodeParentId(
      graph,
      entity,
      visibleIds,
      countryContainerByCode,
      viewMode,
      countryDisplayMode,
    );

    return {
      ...buildProjectionNode(
        entity,
        getGovernanceBlock(entity.id, viewMode, governanceInternationalIds),
        getProjectionLayoutBand(entity, viewMode, governanceInternationalIds),
      ),
      parentId,
    };
  });

  const nodeParentIdById = Object.fromEntries(
    nodes.map((node) => [node.id, node.parentId]),
  ) as Record<string, string | undefined>;

  const edges: GraphProjectionEdge[] = graph.relationships
    .filter(
      (relationship) =>
        !shouldHideEdgeInEngulfMode(
          relationship,
          nodeParentIdById,
          viewMode,
          countryDisplayMode,
        ) &&
        visibleIds.has(relationship.sourceEntityId) &&
        visibleIds.has(relationship.targetEntityId),
    )
    .map((relationship) => ({
      id: relationship.id,
      source: relationship.sourceEntityId,
      target: relationship.targetEntityId,
      type: relationship.type,
      status: relationship.status,
      label: edgeLabel(relationship.type),
      isDerivedHierarchy: false,
    }));

  edges.push(
    ...includedEntities
      .filter(
        (entity) =>
          entity.parentEntityId != null &&
          visibleIds.has(entity.parentEntityId),
      )
      .map((entity) => ({
        id: `derived-hierarchy-${entity.id}-${entity.parentEntityId as string}`,
        source: entity.id,
        target: entity.parentEntityId as string,
        type: "hierarchy" as const,
        status: entity.status,
        label: edgeLabel("hierarchy"),
        isDerivedHierarchy: true,
      })),
  );

  return {
    nodes,
    edges,
    effectiveFocusEntityId,
  };
}
