# Ryu MVP: System Discovery Portal For Deeptime

## Goal

Ryu should act as the system discovery and routing portal for Deeptime. Deeptime asks Ryu which source systems are relevant and how to query them. Deeptime then calls system-specific APIs or connectors to retrieve layers, assets, records, or other data.

Ryu should not become one giant marine-data API. It should expose stable discovery tools over a maintained registry of systems, sources, capabilities, and operational routes.

## MVP User Story

A Deeptime user asks:

> Show me a map of whale and fishery interaction on the Oregon coast.

Deeptime should:

1. Parse the request into a structured map intent.
2. Ask Ryu which systems can provide Oregon coast whale, fisheries, basemap, and context data.
3. Use Ryu's returned system and route metadata to choose connector targets.
4. Query the selected system connectors for layers.
5. Build and render a Deeptime map view.
6. Preserve provenance back to Ryu systems, Ryu routes, connector layers, and original source records.

## Architectural Boundary

Ryu owns:

- system discovery
- source/system metadata
- capability metadata
- operational route metadata
- connector references
- source provenance and caveats
- enough route information for Deeptime to decide what to query and how

System connectors own:

- source-specific tools
- source-specific auth handling where needed
- native API calls
- data retrieval
- data transforms into connector contracts
- layer assets and feature/query payloads

Deeptime owns:

- user intent parsing
- system and route selection
- calling selected connectors
- map-view creation
- rendering
- workspace/user credentials when needed
- user-facing provenance display

## Ryu Record API

The MVP API should expose one record family:

- `GET /api/records?kind=system`
- `GET /api/records/:id`

These endpoints return system records and route instructions through the same
record DTO used by agent reads and writes. They do not need to return final
geospatial layer payloads.

### `list_systems`

Browse known systems with optional filters:

```json
{
  "domains": ["whale_ecology", "fisheries", "basemap", "boundary_context"],
  "geographies": ["Oregon coast"],
  "capabilities": ["map_layers"],
  "routeStatus": ["live", "planned"]
}
```

### `search_systems`

Find systems from natural-language or structured search:

```json
{
  "query": "Oregon coast whale habitat and fisheries map layers",
  "domains": ["whale_ecology", "fisheries"],
  "geographies": ["Oregon coast"],
  "capabilities": ["map_layers", "habitat_shapes", "management_boundaries"],
  "deliveryFormats": ["geojson", "pmtiles", "wms", "arcgis_rest", "raster_tile"]
}
```

### `get_system`

Return the full registry record for one system:

```json
{
  "ryuSystemId": "oregon-dlcd-coastal-gis",
  "includeRoutes": true,
  "includeSources": true
}
```

## Ryu System Record

Minimum response shape:

```json
{
  "ryuSystemId": "oregon-dlcd-coastal-gis",
  "name": "Oregon DLCD Coastal GIS",
  "operator": {
    "id": "oregon-dlcd",
    "name": "Oregon Department of Land Conservation and Development"
  },
  "summary": "Oregon coastal boundary and planning GIS resources.",
  "domains": ["boundary_context", "coastal_management"],
  "geographies": ["Oregon coast"],
  "capabilities": ["map_layers", "management_boundaries"],
  "routes": [
    {
      "routeId": "ryu-oregon-territorial-sea-plan-arcgis",
      "status": "live",
      "mode": "external_arcgis_rest",
      "priority": 1,
      "connectorRef": "connector:arcgis-rest",
      "connectorTarget": "https://gis.lcd.state.or.us/server/rest/services/Framework/AdminBounds_TerritorialSeaPlan/MapServer",
      "supportedTools": ["search_layers", "get_layer", "get_layer_asset"],
      "deliveryFormats": ["arcgis_rest", "geojson"],
      "auth": {
        "required": false
      },
      "contractRef": "contracts/arcgis-rest-mapserver-v1",
      "caveats": ["Verify authoritative metadata per layer before publishing or analysis."]
    }
  ],
  "sources": [
    {
      "ryuSourceId": "src-dlcd-territorial-sea-mapserver",
      "title": "Oregon Territorial Sea Plan ArcGIS MapServer",
      "provider": "Oregon Department of Land Conservation and Development / Oregon Coastal Management Program",
      "originalUrl": "https://gis.lcd.state.or.us/server/rest/services/Framework/AdminBounds_TerritorialSeaPlan/MapServer",
      "citation": null,
      "license": null,
      "updateCadence": null,
      "caveats": []
    }
  ],
  "caveats": []
}
```

## Connector Contract

System APIs or connectors should expose their own operations. The common starting set is:

- `search_layers`
- `get_layer`
- `get_source`
- `get_layer_asset`
- `health`

Connectors may add source-specific operations later, but Deeptime should be able to retrieve map-ready layer records through the common layer operations for the MVP.

Connector contracts live in `documentation/contracts/`:

- `connector-v1.md`
- `arcgis-rest-mapserver-v1.md`
- `geojson-snapshot-v1.md`
- `ogc-wms-raster-v1.md`
- `pmtiles-basemap-v1.md`
- `downloadable-gis-snapshot-v1.md`

MVP source-system contracts live under `documentation/contracts/systems/`:

- `noaa-bia-cetaceans-v1.md`
- `noaa-esi-wa-or-marine-mammals-v1.md`
- `ecotrust-oregon-fisheries-uses-values-v1.md`
- `odfw-commercial-landings-v1.md`

## Connector Layer Record

Connectors should normalize returned layer records into a shared shape:

```json
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
    "url": "https://example.org/layers/oregon-territorial-sea.geojson"
  },
  "source": {
    "provider": "Oregon Department of Land Conservation and Development / Oregon Coastal Management Program",
    "originalUrl": "https://gis.lcd.state.or.us/server/rest/services/Framework/AdminBounds_TerritorialSeaPlan/MapServer",
    "citation": null,
    "license": null,
    "updateCadence": null,
    "caveats": ["Verify authoritative metadata per layer before publishing or analysis."]
  },
  "retrieval": {
    "status": "ready",
    "generatedAt": null
  }
}
```

## Semantics Rules

Ryu and connectors must label layers according to what the source actually provides.

Allowed starting semantics:

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

For the first whale MVP, whale shapes are acceptable. They should not be labeled as probability maps unless the source is actually a probability or likelihood model.

Example whale-shape caveat:

```json
{
  "family": "whale_ecology",
  "semantics": "habitat_area",
  "species": "humpback whale",
  "caveats": ["Planning/evidence polygon, not a whale probability surface."]
}
```

Probability maps can be added later as separate layers with `semantics: "probability"`.

## MVP System Set

Start with a small Oregon-focused system set:

1. `protomaps-basemap`
   - Role: land, coast, roads, labels
   - Capability: `basemap_tiles`
   - Connector type: PMTiles or hosted tile fallback

2. `gebco-web-services`
   - Role: bathymetry and ocean relief context
   - Capability: `bathymetry_underlay`
   - Connector type: WMS

3. `oregon-dlcd-coastal-gis`
   - Role: Oregon coastal zone, territorial sea, rocky habitat, planning boundaries
   - Capability: `management_boundaries`, `coastal_boundary_context`
   - Connector type: ArcGIS REST and/or GeoJSON snapshot

4. NOAA whale-shape source
   - Role: whale habitat, important areas, distribution, or planning polygons
   - Capability: `whale_habitat_shapes`
   - Connector type: downloadable GIS snapshot or ArcGIS REST, depending on source
   - Required caveat: not a probability map unless source semantics support it

5. Fishery boundary or fishery-use source
   - Role: fisheries interaction context
   - Capability: `fishery_boundaries`, `fishery_use_areas`, or `management_areas`
   - Connector type: downloadable GIS snapshot, ArcGIS REST, or source-specific API

## Implementation Phases

### Phase 1: Lock Contracts

- Define TypeScript types for `RyuSystemRecord`, `RyuRouteRecord`, source summaries, and connector references.
- Map existing `nodes`, `sources`, and `ryu_routes` into those response shapes.
- Keep the database model minimal; prefer derived portal responses before adding new tables.

### Phase 2: Add Record Endpoints

- Add `GET /api/records?kind=system`.
- Add `GET /api/records/:id`.
- Use Cloud SQL/Postgres data as the authority.
- Include planned routes only when requested; default runtime results should prefer live routes.

### Phase 3: Build One Connector Path

Implement one connector end to end, preferably Oregon DLCD:

- Ryu returns Oregon DLCD as a relevant system.
- Deeptime receives route metadata.
- Deeptime calls the selected DLCD connector.
- The connector returns normalized layer records.
- Deeptime renders at least one Oregon management or boundary layer.

### Phase 4: Add Whale Shapes

- Register the whale-shape source system in Ryu.
- Add route metadata for the connector.
- Return layers as `habitat_area`, `important_area`, `critical_habitat`, or `distribution_area`.
- Include caveats that these are not probability maps.

### Phase 5: Add Fisheries Context

- Register the chosen fishery boundary or fishery-use source system in Ryu.
- Add route metadata for the connector.
- Return layers as `fishery_boundary`, `fishery_use_area`, or `management_area`.

### Phase 6: Deeptime End-To-End Test

For the prompt:

> show me a map of whale and fishery interaction on the Oregon coast

The flow should:

1. Deeptime asks Ryu `search_systems`.
2. Ryu returns candidate systems and routes.
3. Deeptime selects basemap, context, whale-shape, and fisheries systems.
4. Deeptime calls the relevant connectors.
5. Connectors return normalized layer records.
6. Deeptime creates a map view.
7. Deeptime records original prompt, Ryu system ids, Ryu route ids, connector layer ids, and source ids.

## MVP Acceptance Criteria

- Ryu exposes `list_systems`, `search_systems`, and `get_system`.
- Ryu returns enough route metadata for Deeptime to decide what to query and how.
- Ryu search can identify Oregon coast systems for basemap, boundary context, whale ecology, and fisheries.
- Route records include connector references, supported tools, delivery formats, auth requirements, caveats, and source links.
- Deeptime can use at least one returned route to query a system connector.
- Connector layer records preserve Ryu system id, Ryu route id, source id, delivery details, source attribution, license, caveats, and retrieval status.
- Whale shapes are labeled as shape/context semantics, not probability.
- Generated Deeptime map provenance includes original prompt, Ryu system ids, Ryu route ids, connector layer ids, and source ids.

## Out Of Scope

- Ryu-hosted universal data retrieval for every source.
- Overlap scoring or scientific analysis.
- Live source refresh scheduling.
- Large connector marketplace UI.
- Full auth delegation across user workspaces.
- Probability whale maps until a real probability source is registered.
