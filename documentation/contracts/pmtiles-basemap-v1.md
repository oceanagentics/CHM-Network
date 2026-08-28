# PMTiles Basemap Contract v1

## Use

Use this contract for PMTiles basemap or vector-tile context layers.

MVP route:

- `ryu-protomaps-oregon-pnw-vector-pmtiles`

## Route Requirements

Route fields:

```json
{
  "connectorRef": "connector:pmtiles",
  "connectorTarget": "ryu-map-assets",
  "deliveryFormats": ["pmtiles", "vector_tile"],
  "auth": {
    "required": false
  }
}
```

`connectorTarget` may refer to an internal asset registry, bucket, or stable PMTiles URL.

## Connector Behavior

### `health`

Ready when the PMTiles asset or manifest is reachable and reports valid metadata.

### `search_layers`

Return one or more basemap layer records:

```json
{
  "connectorLayerId": "protomaps-oregon-pnw-basemap",
  "family": "basemap",
  "semantics": "basemap",
  "geography": "Oregon coast",
  "delivery": {
    "type": "pmtiles",
    "url": "https://example.org/protomaps-oregon-pnw.pmtiles"
  }
}
```

### `get_layer_asset`

Return PMTiles delivery instructions:

```json
{
  "asset": {
    "type": "pmtiles",
    "url": "https://example.org/protomaps-oregon-pnw.pmtiles",
    "styleUrl": "https://example.org/protomaps-style.json",
    "attribution": "OpenStreetMap contributors, Protomaps"
  }
}
```

## Deeptime Rendering

Deeptime needs a PMTiles/vector-tile Leaflet adapter before it can render this natively. Raster basemaps must be represented as separate raster tile or WMS routes, not as PMTiles route fallbacks.

## Caveats

- OSM attribution is required.
- Basemap styling must not obscure whale, fisheries, or boundary overlays.
- Regional extracts may exclude surrounding context if clipped too tightly.
