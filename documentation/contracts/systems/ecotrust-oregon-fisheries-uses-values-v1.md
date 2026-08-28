# Ecotrust Oregon Fisheries Uses And Values System Contract v1

## Purpose

Provide fishery-use and value context layers for Oregon coast fisheries, especially Dungeness crab and statewide commercial-use layers.

These layers are participatory mapping outputs from the Marine Fisheries Uses and Values Project. They should be presented as fishery-use context, not regulatory boundaries or live fishing effort.

## Candidate Ryu System

```json
{
  "ryuSystemId": "ecotrust-oregon-fisheries-uses-values",
  "name": "Ecotrust Oregon Marine Fisheries Uses and Values Project",
  "domains": ["fisheries", "human_use", "ocean_planning"],
  "geographies": ["Oregon coast"],
  "capabilities": ["map_layers", "fishery_use_areas", "dungeness_crab_context"]
}
```

## Candidate Route

```json
{
  "routeId": "ryu-ecotrust-oregon-fisheries-uses-values-snapshot",
  "status": "planned",
  "mode": "self_hosted_snapshot",
  "connectorRef": "connector:downloadable-gis-snapshot",
  "contractRef": "documentation/contracts/downloadable-gis-snapshot-v1.md",
  "deliveryFormats": ["geojson"],
  "capabilities": ["fishery_use_areas", "dungeness_crab_context", "ocean_planning_context"],
  "auth": {
    "required": false
  }
}
```

## Known Upstream Access

West Coast Ocean Data Portal / OROWindMap data catalog:

- `https://offshorewind.westcoastoceans.org/orowindmap-data-catalog/fishing-ecotrust-uses-and-values-project/`

Known layer families include:

- Statewide commercial Dungeness crab fishery uses and values grid.
- Statewide all commercial fishery sectors fisheries uses and values grid.
- Port-specific commercial Dungeness crab fishery uses and values grids.
- Greatest importance and percent volume polygons.
- Stated importance percent volume contours.

## MVP Layer Semantics

Use:

- `family`: `fisheries`
- `semantics`: `fishery_use_area`
- `species`: `Dungeness crab` for Dungeness-specific layers; null for all-sector layers
- `geography`: `Oregon coast`

Do not use:

- `fishery_boundary` unless the layer is truly a boundary.
- `management_area` unless the layer is a management or regulatory area.
- `probability`

## Snapshot Mapping

The ingestion job should:

1. Identify the downloadable or service endpoint behind the OROWindMap catalog item.
2. Snapshot selected statewide layers first.
3. Normalize CRS to WGS84.
4. Export GeoJSON with value/use attributes preserved.
5. Preserve project year, methodology notes, and caveats.

## Required Caveats

- `Participatory mapping data from 2009-2010, not live fishing effort.`
- `Fishery-use/value layer, not a regulatory boundary.`
- `Interpret with project methodology and aggregation limits.`

## Open Questions

- Which statewide Dungeness crab layer should be first: grid, greatest-importance polygon, or percent-volume contour?
- Can the current OROWindMap layer endpoint be queried directly, or do we need a manual snapshot first?
