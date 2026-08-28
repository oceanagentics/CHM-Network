# ArcGIS REST MapServer Contract v1

## Use

Use this contract for public ArcGIS REST MapServer or FeatureServer routes that expose inspectable map layers and feature query endpoints.

MVP route:

- `ryu-oregon-territorial-sea-plan-arcgis`

## Route Requirements

Route fields:

```json
{
  "connectorRef": "connector:arcgis-rest",
  "connectorTarget": "https://example.org/arcgis/rest/services/Foo/MapServer",
  "deliveryFormats": ["arcgis_rest", "geojson"],
  "auth": {
    "required": false
  }
}
```

## Connector Behavior

### `health`

Fetch:

```text
{connectorTarget}?f=json
```

Ready when the service returns JSON with a `layers` array or a recognizable ArcGIS REST service response.

### `search_layers`

Fetch service metadata:

```text
{connectorTarget}?f=json
```

For each ArcGIS service layer, return a normalized layer record. The connector should infer:

- `connectorLayerId`: stable slug from route id plus ArcGIS layer id or name.
- `title`: ArcGIS layer name.
- `delivery.type`: `geojson` when query output supports GeoJSON; otherwise `arcgis_rest`.
- `delivery.url`: null until `get_layer_asset`, unless a stable query URL is safe to expose.
- `source.originalUrl`: route `connectorTarget` or source URL from Ryu.

Layer family and semantics should come from route capabilities, layer name, and source-specific mapping rules. Do not guess whale probability from habitat or planning layer names.

### `get_layer`

Fetch layer metadata:

```text
{connectorTarget}/{arcgisLayerId}?f=json
```

Return the normalized layer record plus native ArcGIS metadata under an optional `native` field if useful.

### `get_layer_asset`

Preferred GeoJSON query:

```text
{connectorTarget}/{arcgisLayerId}/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson
```

If the service requires pagination, the connector should page with `resultOffset` and `resultRecordCount` or return a clear `degraded` retrieval status.

For map image layers that cannot return features, provide an ArcGIS REST delivery instruction instead of pretending it is GeoJSON.

## Deeptime Rendering

For GeoJSON assets:

```js
L.geoJSON(data, { style }).addTo(map)
```

For ArcGIS REST-only assets, Deeptime should defer until an ArcGIS tiled/dynamic map layer adapter exists.

## Caveats

- Preserve source caveats and route caveats in every layer.
- ArcGIS service layers may be visual representations, not legal definitions.
- Check service metadata for max record count and geometry type.
- Do not treat public service availability as a source license.
