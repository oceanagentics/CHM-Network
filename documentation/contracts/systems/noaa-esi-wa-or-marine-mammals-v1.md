# NOAA ESI WA/OR Marine Mammals System Contract v1

## Purpose

Provide Oregon/Washington marine mammal distribution, concentration, migration, haul-out, and rookery polygons for whale and marine mammal context.

This is an oil-spill planning dataset and should not be treated as a whale probability or complete species distribution model.

## Candidate Ryu System

```json
{
  "ryuSystemId": "noaa-esi-wa-or-marine-mammals",
  "name": "NOAA ESI Outer Coast WA/OR Marine Mammal Polygons",
  "domains": ["whale_ecology", "marine_mammals", "response_planning"],
  "geographies": ["Oregon coast", "Washington coast"],
  "capabilities": ["map_layers", "marine_mammal_shapes", "distribution_areas"]
}
```

## Candidate Route

```json
{
  "routeId": "ryu-noaa-esi-wa-or-marine-mammals-snapshot",
  "status": "planned",
  "mode": "self_hosted_snapshot",
  "connectorRef": "connector:downloadable-gis-snapshot",
  "contractRef": "documentation/contracts/downloadable-gis-snapshot-v1.md",
  "deliveryFormats": ["geojson"],
  "capabilities": ["marine_mammal_shapes", "distribution_areas", "response_planning_context"],
  "auth": {
    "required": false
  }
}
```

## Known Upstream Access

NOAA InPort item:

- `https://www.fisheries.noaa.gov/inport/item/55730`

NOAA ESI download page:

- `https://response.restoration.noaa.gov/oil-and-chemical-spills/oil-spills/download-esi-maps-and-gis-data`

Known package:

- `Washington_Oregon_2014_GDB.zip`

Known feature class:

- `M_MAMMAL`

## MVP Layer Semantics

Use:

- `family`: `whale_ecology`
- `semantics`: `distribution_area`, `habitat_area`, or `important_area`
- `species`: joined from ESI biological tables when possible
- `geography`: `Oregon coast`

Do not use:

- `probability`

## Snapshot Mapping

The ingestion job should:

1. Download the geodatabase package.
2. Extract `M_MAMMAL`.
3. Join associated biological/source tables needed for species, seasonality, status, and source attribution.
4. Filter whale/cetacean records first for the MVP.
5. Clip or filter to Oregon coast waters.
6. Export browser-ready GeoJSON layers.
7. Preserve source package date and NOAA caveats.

## Required Caveats

- `Oil-spill response planning dataset, not a real-time observation layer.`
- `Known concentration areas or occurrences may not represent complete species range.`
- `Not for navigation or legal boundary use.`

## Open Questions

- Is BIA enough for MVP whale shapes, or should ESI be added as the second whale context layer?
- Which ESI fields should define the first species grouping in Deeptime?
