import type { Entity } from "../../../../shared/domain";
import type { GraphProjection, GraphProjectionEdge } from "./projection";

export interface GlobeNode {
  id: string;
  label: string;
  kind: Entity["kind"];
  status: Entity["status"];
  countryCode: string | null;
  lat: number;
  lng: number;
  altitude: number;
  color: string;
  radius: number;
}

export interface GlobeLink {
  id: string;
  source: string;
  target: string;
  type: GraphProjectionEdge["type"];
  status: GraphProjectionEdge["status"];
  color: string;
}

export interface GlobeProjection {
  nodes: GlobeNode[];
  links: GlobeLink[];
}

type Anchor = {
  lat: number;
  lng: number;
};

const countryAnchors: Record<string, Anchor> = {
  AUS: { lat: -25.3, lng: 133.8 },
  CAN: { lat: 56.1, lng: -106.3 },
  DEU: { lat: 51.2, lng: 10.4 },
  EUR: { lat: 50.8, lng: 10.9 },
  FRA: { lat: 46.2, lng: 2.2 },
  GBR: { lat: 55.4, lng: -3.4 },
  INT: { lat: -74, lng: 0 },
  JPN: { lat: 36.2, lng: 138.3 },
  USA: { lat: 39.8, lng: -98.6 },
};

const colorByKind = {
  country: "#f2c94c",
  organization: "#6aa6ff",
  system: "#65c4a4",
} satisfies Record<Entity["kind"], string>;

const colorByLinkType = {
  governs: "#c39b3a",
  hierarchy: "#8b99aa",
  operates: "#3b66b0",
  part_of: "#8b99aa",
  publishes_to: "#22a37a",
  syncs_to: "#7b5ad6",
} satisfies Record<GraphProjectionEdge["type"], string>;

const altitudeByKind = {
  country: 0.02,
  organization: 0.13,
  system: 0.24,
} satisfies Record<Entity["kind"], number>;

function getFallbackAnchor(index: number, total: number): Anchor {
  const goldenAngle = 137.508;
  const progress = total <= 1 ? 0.5 : index / (total - 1);
  return {
    lat: -52 + progress * 104,
    lng: ((index * goldenAngle + 540) % 360) - 180,
  };
}

function getClusterOffset(index: number, count: number): Anchor {
  if (count <= 1) {
    return { lat: 0, lng: 0 };
  }

  const ring = Math.ceil(Math.sqrt(index + 1));
  const angle = index * 2.399963229728653;
  const spread = Math.min(8, 1.8 + count * 0.12);

  return {
    lat: Math.sin(angle) * spread * ring * 0.28,
    lng: Math.cos(angle) * spread * ring * 0.42,
  };
}

function visibleLabel(label: string): string {
  return label
    .split("\n")[0]
    .replace(/[\u{1d400}-\u{1d7ff}]/gu, (character) => {
      const codePoint = character.codePointAt(0);
      if (codePoint == null) {
        return character;
      }

      if (codePoint >= 0x1d5d4 && codePoint <= 0x1d5ed) {
        return String.fromCodePoint(65 + codePoint - 0x1d5d4);
      }

      if (codePoint >= 0x1d5ee && codePoint <= 0x1d607) {
        return String.fromCodePoint(97 + codePoint - 0x1d5ee);
      }

      if (codePoint >= 0x1d7ec && codePoint <= 0x1d7f5) {
        return String.fromCodePoint(48 + codePoint - 0x1d7ec);
      }

      return "";
    })
    .trim();
}

export function projectGlobeGraph(projection: GraphProjection): GlobeProjection {
  const groups = new Map<string, typeof projection.nodes>();
  for (const node of projection.nodes) {
    const key = node.countryCode ?? "unknown";
    groups.set(key, [...(groups.get(key) ?? []), node]);
  }

  const groupCounts = Object.fromEntries(
    [...groups.entries()].map(([code, nodes]) => [code, nodes.length]),
  );
  const groupSeen: Record<string, number> = {};

  const nodes = projection.nodes.map((node, index) => {
    const code = node.countryCode ?? "unknown";
    const anchor = countryAnchors[code] ?? getFallbackAnchor(index, projection.nodes.length);
    const groupIndex = groupSeen[code] ?? 0;
    groupSeen[code] = groupIndex + 1;
    const offset = getClusterOffset(groupIndex, groupCounts[code] ?? 1);
    const isInternational = code === "INT";

    return {
      id: node.id,
      label: visibleLabel(node.label) || node.id,
      kind: node.kind,
      status: node.status,
      countryCode: node.countryCode,
      lat: Math.max(-82, Math.min(82, anchor.lat + offset.lat)),
      lng: ((anchor.lng + offset.lng + 540) % 360) - 180,
      altitude: altitudeByKind[node.kind] + (isInternational ? 0.16 : 0),
      color: colorByKind[node.kind],
      radius: node.kind === "country" ? 2.8 : node.kind === "organization" ? 2.1 : 1.8,
    };
  });

  return {
    nodes,
    links: projection.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.type,
      status: edge.status,
      color: colorByLinkType[edge.type],
    })),
  };
}
