# Connector Contract v1

## Purpose

This is the shared contract for system-specific APIs or MCP connectors that Deeptime calls after Ryu identifies a relevant system route.

Ryu portal tools return systems and routes. System connectors return layers, assets, source details, and health information.

## Common Tools

Connectors should expose:

- `health`
- `search_layers`
- `get_layer`
- `get_source`
- `get_layer_asset`

## `health`

Input:

```json
{
  "ryuSystemId": "oregon-dlcd-coastal-gis",
  "ryuRouteId": "ryu-oregon-territorial-sea-plan-arcgis"
}
```

Output:

```json
{
  "status": "ready",
  "checkedAt": "2026-07-24T00:00:00.000Z",
  "message": null
}
```

Allowed statuses:

- `ready`
- `degraded`
- `blocked`
- `unimplemented`

## `search_layers`

Input:

```json
{
  "ryuSystemId": "oregon-dlcd-coastal-gis",
  "ryuRouteId": "ryu-oregon-territorial-sea-plan-arcgis",
  "query": "territorial sea planning boundaries",
  "families": ["boundary_context"],
  "semantics": ["management_area"],
  "geographies": ["Oregon coast"],
  "species": [],
  "deliveryFormats": ["geojson"]
}
```

Output:

```json
{
  "layers": [
    {
      "connectorLayerId": "oregon-territorial-sea",
      "ryuSystemId": "oregon-dlcd-coastal-gis",
      "ryuRouteId": "ryu-oregon-territorial-sea-plan-arcgis",
      "ryuSourceId": "src-dlcd-territorial-sea-mapserver",
      "title": "Oregon Territorial Sea",
      "family": "boundary_context",
      "semantics": "management_area",
      "species": null,
      "geography": "Oregon coast",
      "delivery": {
        "type": "geojson",
        "url": null
      },
      "source": {
        "provider": "Oregon Department of Land Conservation and Development / Oregon Coastal Management Program",
        "originalUrl": "https://example.org/source",
        "citation": null,
        "license": null,
        "updateCadence": null,
        "caveats": []
      },
      "retrieval": {
        "status": "ready",
        "generatedAt": null
      }
    }
  ]
}
```

## `get_layer`

Input:

```json
{
  "connectorLayerId": "oregon-territorial-sea",
  "ryuSystemId": "oregon-dlcd-coastal-gis",
  "ryuRouteId": "ryu-oregon-territorial-sea-plan-arcgis"
}
```

Output:

```json
{
  "layer": {}
}
```

`layer` must be the same normalized layer record shape returned by `search_layers`.

## `get_source`

Input:

```json
{
  "ryuSourceId": "src-dlcd-territorial-sea-mapserver"
}
```

Output:

```json
{
  "source": {
    "ryuSourceId": "src-dlcd-territorial-sea-mapserver",
    "title": "Oregon Territorial Sea Plan ArcGIS MapServer",
    "provider": "Oregon Department of Land Conservation and Development / Oregon Coastal Management Program",
    "originalUrl": "https://example.org/source",
    "citation": null,
    "license": null,
    "updateCadence": null,
    "caveats": []
  }
}
```

## `get_layer_asset`

Input:

```json
{
  "connectorLayerId": "oregon-territorial-sea",
  "deliveryType": "geojson"
}
```

Output:

```json
{
  "asset": {
    "type": "geojson",
    "url": "https://example.org/layer.geojson",
    "headers": {},
    "expiresAt": null
  }
}
```

For direct payloads, connectors may return:

```json
{
  "asset": {
    "type": "geojson",
    "data": {}
  }
}
```

## Semantics

Connectors must label returned layers according to what the source actually provides. Whale shapes are not probability surfaces unless the source publishes a probability or likelihood model.

Allowed MVP semantics:

- `basemap`
- `coastline`
- `bathymetry_context`
- `habitat_area`
- `important_area`
- `critical_habitat`
- `distribution_area`
- `fishery_boundary`
- `fishery_use_area`
- `management_area`
- `port_landings`
- `probability`

## Provenance

Every layer must include:

- `ryuSystemId`
- `ryuRouteId`
- `ryuSourceId`
- provider
- original source URL
- citation when known
- license when known
- caveats
- retrieval status

Deeptime must copy these fields into map-view provenance.
