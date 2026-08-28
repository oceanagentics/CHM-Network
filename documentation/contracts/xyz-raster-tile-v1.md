# XYZ Raster Tile Contract v1

## Use

Use this contract for directly renderable XYZ raster tile basemap or context routes.

MVP route:

- `ryu-openstreetmap-standard-raster-basemap`

## Route Requirements

Route fields:

```json
{
  "connectorRef": "connector:xyz-raster-tile",
  "connectorTarget": "https://tile.example.org/{z}/{x}/{y}.png",
  "deliveryFormats": ["raster_tile"],
  "auth": {
    "required": false
  }
}
```

`connectorTarget` or `properties.delivery.urlTemplate` must be directly renderable with `L.tileLayer(...)`.

## Connector Behavior

### `health`

Ready when the URL template is present and route policy does not block normal interactive rendering.

### `search_layers`

Return one normalized basemap layer record with source, attribution, delivery, and caveats.

### `get_layer_asset`

Return raster tile delivery instructions:

```json
{
  "asset": {
    "type": "raster_tile",
    "urlTemplate": "https://tile.example.org/{z}/{x}/{y}.png",
    "tileSize": 256,
    "attribution": "Map provider"
  }
}
```

## Deeptime Rendering

Leaflet rendering:

```js
L.tileLayer(urlTemplate, {
  tileSize,
  attribution
}).addTo(map)
```

## Caveats

- Preserve provider attribution in the map UI and provenance.
- Preserve provider usage-policy caveats.
- Do not use raster tile routes as a proxy for vector basemap routes.
