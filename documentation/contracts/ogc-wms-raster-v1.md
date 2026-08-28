# OGC WMS Raster Contract v1

## Use

Use this contract for public WMS raster context layers.

MVP route:

- `ryu-gebco-wms-underlay`

## Route Requirements

Route fields:

```json
{
  "connectorRef": "connector:wms",
  "connectorTarget": "https://wms.example.org/mapserv?",
  "deliveryFormats": ["wms", "raster_tile"],
  "auth": {
    "required": false
  }
}
```

## Connector Behavior

### `health`

Fetch:

```text
{connectorTarget}service=WMS&request=GetCapabilities
```

Ready when capabilities XML returns with at least one named layer.

### `search_layers`

Parse `GetCapabilities` and return normalized layer records.

Recommended default fields:

- `family`: `basemap` or `boundary_context`, depending on the route.
- `semantics`: `bathymetry_context` for GEBCO-like underlays.
- `delivery.type`: `raster_wms`.

### `get_layer`

Return one normalized layer record with WMS layer name, supported CRS, supported formats, and source metadata.

### `get_layer_asset`

Return WMS delivery instructions rather than fetching a map image:

```json
{
  "asset": {
    "type": "raster_wms",
    "baseUrl": "https://wms.example.org/mapserv?",
    "layers": "gebco_latest",
    "format": "image/png",
    "transparent": true,
    "version": "1.3.0",
    "attribution": "GEBCO"
  }
}
```

## Deeptime Rendering

Leaflet rendering:

```js
L.tileLayer.wms(baseUrl, {
  layers,
  format,
  transparent,
  attribution
}).addTo(map)
```

## Caveats

- WMS layers are visual context unless the source explicitly says otherwise.
- WMS imagery is not equivalent to downloadable source data.
- Preserve non-navigation caveats for bathymetry or chart-derived layers.
