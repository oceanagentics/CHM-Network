# ODFW Commercial Landings System Contract v1

## Purpose

Provide Oregon port-level commercial landings context for fisheries.

This source is useful for economic and port context. It is not offshore fishing effort geometry and should not be used as a fishery boundary layer.

## Candidate Ryu System

```json
{
  "ryuSystemId": "odfw-commercial-landings",
  "name": "ODFW Commercial Landing Statistics",
  "domains": ["fisheries", "landings", "economics"],
  "geographies": ["Oregon coast"],
  "capabilities": ["port_landings", "tabular_data", "geojson_points"]
}
```

## Candidate Route

```json
{
  "routeId": "ryu-odfw-commercial-landings-snapshot",
  "status": "planned",
  "mode": "self_hosted_snapshot",
  "connectorRef": "connector:csv-geojson-snapshot",
  "contractRef": "documentation/contracts/downloadable-gis-snapshot-v1.md",
  "deliveryFormats": ["csv", "geojson"],
  "capabilities": ["port_landings", "fisheries_economics_context"],
  "auth": {
    "required": false
  }
}
```

## Known Upstream Access

ODFW commercial landing statistics page:

- `https://www.dfw.state.or.us/fish/commercial/statistics.asp`

The page lists annual commercial fish and shellfish landings by Oregon ports, including pounds and values by calendar year.

## MVP Layer Semantics

Use:

- `family`: `fisheries`
- `semantics`: `port_landings`
- `species`: species or species group from table when available
- `geography`: `Oregon coast`

Do not use:

- `fishery_boundary`
- `fishery_use_area`
- `management_area`

## Snapshot Mapping

The ingestion job should:

1. Download or scrape selected annual tables.
2. Normalize port names.
3. Join ports to stable point coordinates.
4. Export CSV and optional GeoJSON point layers.
5. Preserve year, species/category, pounds, value, and source URL.

## MVP Use

This is not required for the first visible whale/fishery map if Ecotrust or management-boundary layers are available. It can be added as a context layer or source detail later.

## Required Caveat

`Port landings economics, not offshore fishing effort geometry.`

## Open Questions

- Which year should Deeptime show first?
- Should the MVP include only Dungeness crab landings or all commercial fisheries?
