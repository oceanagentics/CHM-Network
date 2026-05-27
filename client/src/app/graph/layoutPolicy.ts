/**
 * Engine-agnostic layout policy holds universal spacing and relationship semantics.
 */
import type { Entity, ViewMode } from "../../../../shared/domain";

export const layoutPolicy = {
  bandByKind: {
    country: 0,
    organization: 1,
    system: 2,
  } satisfies Record<Entity["kind"], number>,
  bandGapUnits: {
    "0-1": 1,
    "1-2": 0.4,
  },
  denseSystemSeparation: {
    band: 2,
    slope: 0.12,
    cap: 0.6,
    retainFraction: 0.25,
  },
  edgeWeightByView: {
    governance: {
      governs: 10,
      operates: 10,
      publishes_to: 3,
      syncs_to: 1,
      hierarchy: 12,
    },
    country: {
      governs: 10,
      operates: 10,
      publishes_to: 3,
      syncs_to: 1,
      hierarchy: 12,
    },
    technical: {
      governs: 4,
      operates: 4,
      publishes_to: 10,
      syncs_to: 10,
      hierarchy: 3,
    },
  },
  edgeMinLengthByView: {
    governance: {
      governs: 2,
      operates: 2,
      publishes_to: 1,
      syncs_to: 1,
      hierarchy: 2,
    },
    country: {
      governs: 2,
      operates: 2,
      publishes_to: 1,
      syncs_to: 1,
      hierarchy: 2,
    },
    technical: {
      governs: 1,
      operates: 1,
      publishes_to: 2,
      syncs_to: 2,
      hierarchy: 1,
    },
  },
  directionByView: {
    governance: "TB",
    country: "TB",
    technical: "LR",
  } satisfies Record<ViewMode, "TB" | "LR">,
};

export type LayoutPolicy = typeof layoutPolicy;
