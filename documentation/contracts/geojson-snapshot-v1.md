# GeoJSON Snapshot Contract v1

## Use

Use this contract for Ryu-controlled or partner-hosted static GeoJSON layers produced from an upstream source.

MVP route:

- `ryu-oregon-dlcd-coastal-boundaries-snapshot`

Potential MVP routes:

- whale-shape snapshots
- fishery boundary or fishery-use snapshots

## Route Requirements

Route fields:

```json
{
  "connectorRef": "connector:geojson",
  "connectorTarget": "ryu-map-assets",
  "deliveryFormats": ["geojson"],
  "auth": {
    "required": false
  }
}
```

`connectorTarget` may be an asset bucket, local asset registry, or static base URL.

## Manifest

The connector should read a manifest for the route or target:

```json
{
  "layers": [
    {
      "connectorLayerId": "oregon-coastal-zone",
      "title": "Oregon Coastal Zone",
      "family": "boundary_context",
      "semantics": "management_area",
      "geography": "Oregon coast",
      "url": "https://example.org/oregon-coastal-zone.geojson",
      "ryuSourceId": "src-dlcd-maps-data-tools"
    }
  ]
}
```

## Connector Behavior

### `health`

Ready when the manifest loads and at least one referenced GeoJSON asset is reachable.

### `search_layers`

Filter manifest layers by query, family, semantics, geography, species, and delivery format.

### `get_layer`

Return the manifest layer as a normalized connector layer record.

### `get_layer_asset`

Return either:

```json
{
  "asset": {
    "type": "geojson",
    "url": "https://example.org/oregon-coastal-zone.geojson",
    "headers": {},
    "expiresAt": null
  }
}
```

or inline GeoJSON for small local assets:

```json
{
  "asset": {
    "type": "geojson",
    "data": {}
  }
}
```

## Snapshot Metadata

Every layer should preserve:

- upstream source URL
- snapshot generation date
- clipping/simplification notes
- license and attribution when known
- caveats

## Caveats

- A snapshot may lag the upstream source.
- A simplified layer may not preserve legal-grade geometry.
- Snapshots should not be silently refreshed without updating retrieval metadata.
