# Downloadable GIS Snapshot Contract v1

## Use

Use this contract for source systems that provide downloadable GIS packages rather than a stable query API.

MVP candidates:

- NOAA Biologically Important Areas whale shapes.
- NOAA ESI Outer Coast WA/OR marine mammal polygons.
- Ecotrust Oregon Marine Fisheries Uses and Values Project layers.
- NOAA or ODFW fishery management boundary packages.

## Route Requirements

Route fields:

```json
{
  "connectorRef": "connector:downloadable-gis-snapshot",
  "connectorTarget": "ryu-map-assets",
  "upstream": "provider:dataset-or-download-page",
  "deliveryFormats": ["geojson"],
  "auth": {
    "required": false
  }
}
```

The route target should point at Ryu-controlled generated assets or an internal snapshot job target, not just the upstream download page.

## Snapshot Pipeline

The connector or ingestion job should:

1. Download the upstream GIS package.
2. Record upstream URL, accessed date, package checksum, and source metadata.
3. Extract relevant layers.
4. Filter to the MVP geography when appropriate.
5. Normalize CRS to WGS84.
6. Simplify only when needed for browser rendering.
7. Write one GeoJSON asset per normalized layer.
8. Write a manifest consumed by the connector.

## Manifest

```json
{
  "generatedAt": "2026-07-24T00:00:00.000Z",
  "upstream": {
    "url": "https://example.org/download.zip",
    "accessedAt": "2026-07-24",
    "checksum": "sha256:..."
  },
  "layers": [
    {
      "connectorLayerId": "noaa-bia-humpback-whale-oregon",
      "title": "Humpback Whale Important Area",
      "family": "whale_ecology",
      "semantics": "important_area",
      "species": "humpback whale",
      "geography": "Oregon coast",
      "url": "https://example.org/noaa-bia-humpback-whale-oregon.geojson",
      "ryuSourceId": "src-noaa-bia",
      "caveats": ["Planning/evidence polygon, not a whale probability surface."]
    }
  ]
}
```

## Connector Behavior

### `health`

Ready when the manifest and all required MVP assets are reachable.

### `search_layers`

Filter manifest layers by query, family, semantics, geography, species, and delivery format.

### `get_layer`

Return the normalized layer record from the manifest.

### `get_layer_asset`

Return a GeoJSON asset URL or inline GeoJSON payload.

## Semantics Rules

Use source-accurate semantics:

- NOAA BIA: usually `important_area` or `habitat_area`.
- Critical habitat GIS: `critical_habitat`.
- ESI marine mammal polygons: `distribution_area` or `habitat_area`, depending on metadata.
- Fishery management boundaries: `fishery_boundary` or `management_area`.
- Participatory fishery-use polygons: `fishery_use_area`.
- Landing statistics: `port_landings`.

Do not use `probability` unless the source provides a probability, likelihood, or density model surface.

## Caveats

- Download packages may change without stable API semantics.
- Older planning datasets need clear date/version caveats.
- Browser-ready simplification may not be suitable for legal or scientific measurement.
- Snapshot provenance is part of the layer, not an implementation detail.
