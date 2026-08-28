# NOAA Cetacean Biologically Important Areas System Contract v1

## Purpose

Provide whale ecology shape layers for the Oregon coast MVP.

This source should be used as whale habitat/important-area context, not as a probability surface.

## Candidate Ryu System

```json
{
  "ryuSystemId": "noaa-cetacean-bia",
  "name": "NOAA Cetacean Biologically Important Areas",
  "domains": ["whale_ecology", "habitat_context"],
  "geographies": ["US West Coast", "Oregon coast"],
  "capabilities": ["map_layers", "whale_habitat_shapes", "important_areas"]
}
```

## Candidate Routes

Primary route:

```json
{
  "routeId": "ryu-noaa-bia-cetaceans-arcgis",
  "status": "planned",
  "mode": "external_arcgis_rest",
  "connectorRef": "connector:arcgis-rest",
  "contractRef": "documentation/contracts/arcgis-rest-mapserver-v1.md",
  "deliveryFormats": ["arcgis_rest", "geojson"],
  "capabilities": ["whale_habitat_shapes", "important_areas"],
  "auth": {
    "required": false
  }
}
```

Fallback route:

```json
{
  "routeId": "ryu-noaa-bia-cetaceans-snapshot",
  "status": "planned",
  "mode": "self_hosted_snapshot",
  "connectorRef": "connector:downloadable-gis-snapshot",
  "contractRef": "documentation/contracts/downloadable-gis-snapshot-v1.md",
  "deliveryFormats": ["geojson"],
  "capabilities": ["whale_habitat_shapes", "important_areas"]
}
```

## Known Upstream Access

NOAA Coast/OceanReports exposes ArcGIS REST services for Cetacean Biologically Important Areas, including services by BIA type such as feeding, reproduction, migration, and small/resident populations.

NOAA InPort metadata:

- `https://www.fisheries.noaa.gov/inport/item/23643`

Example upstream services:

- `https://maps.coast.noaa.gov/arcgis/rest/services/OceanReports/CetaceanBiologicallyImportantAreas_Feeding/MapServer`
- `https://coast.noaa.gov/arcgis/rest/services/OceanReports/CetaceanBiologicallyImportantAreas_SmallResident/MapServer/0`

## MVP Layer Semantics

Use:

- `family`: `whale_ecology`
- `semantics`: `important_area` or `habitat_area`
- `species`: source `sci_name` or common-name mapped value when available
- `geography`: `Oregon coast` for filtered/clipped features

Do not use:

- `probability`

## Connector Mapping

For ArcGIS routes:

- Read service metadata from `{connectorTarget}?f=json`.
- Read layer metadata from `{connectorTarget}/0?f=json`.
- Query features with `f=geojson`.
- Filter or clip to Oregon coast in the connector or snapshot pipeline.

For snapshot routes:

- Convert selected BIA layers to GeoJSON.
- Preserve BIA type, species, seasonality, and source references.

## MVP Selection Rule

Prefer layers where:

- BIA geometry intersects Oregon coast waters.
- Species are whale/cetacean records relevant to the prompt.
- Source metadata is clear enough for Deeptime attribution.

## Required Caveat

`Planning/evidence polygon, not a whale probability surface.`

## Open Questions

- Which BIA types should be shown first: feeding, reproduction, migration, small/resident, or all?
- Should Deeptime group by BIA type, species, or both?
- Should Ryu snapshot and simplify these for reliable browser rendering before marking the route active?
