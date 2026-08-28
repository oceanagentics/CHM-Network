# Ryu Connector Contracts

Ryu portal routes point Deeptime to system-specific connectors. These contracts define the small shared surface a connector should expose and the source-specific conventions for common delivery patterns.

Ryu itself remains the discovery and routing portal. Connectors own data retrieval, source-specific API behavior, transformation, and layer delivery.

## MVP Contracts

- `connector-v1.md`: common connector tools and normalized records.
- `arcgis-rest-mapserver-v1.md`: ArcGIS REST MapServer/FeatureServer layer discovery and GeoJSON feature queries.
- `geojson-snapshot-v1.md`: static or self-hosted GeoJSON layer manifests and assets.
- `ogc-wms-raster-v1.md`: OGC WMS raster context layers.
- `pmtiles-basemap-v1.md`: PMTiles basemap assets.
- `xyz-raster-tile-v1.md`: directly renderable XYZ raster tile basemap/context routes.
- `downloadable-gis-snapshot-v1.md`: source downloads that must be converted into stable local layers, such as whale-shape and fishery-use GIS packages.

## MVP System Contracts

- `systems/noaa-bia-cetaceans-v1.md`: whale biologically important area shapes.
- `systems/noaa-esi-wa-or-marine-mammals-v1.md`: WA/OR ESI marine mammal polygons.
- `systems/ecotrust-oregon-fisheries-uses-values-v1.md`: Oregon fishery-use and value layers.
- `systems/odfw-commercial-landings-v1.md`: Oregon commercial landing statistics context.

## Route Usage

Each `ryu_routes.contract_ref` should point to one of these files, a specific connector package, or upstream API documentation. Prefer a local contract when Deeptime needs deterministic behavior beyond the upstream documentation.

Portal clients should read route fields this way:

- `connectorRef`: selects the connector implementation.
- `connectorTarget`: gives the base URL, asset key, MCP target, or runtime target.
- `contractRef`: tells the connector which behavior contract applies.
- `capabilities`: explains what the route can provide.
- `deliveryFormats`: lists concrete delivery forms Deeptime may receive.
- `caveats`: must be preserved in layer and map-view provenance.

## MVP Readiness

A route should remain `planned` until its connector can pass these checks:

- `health` returns a usable status.
- `search_layers` returns at least one source-linked normalized layer.
- `get_layer` returns complete layer metadata.
- `get_layer_asset` returns a renderable URL, payload, or delivery instruction.
- The route caveats, source IDs, and provider attribution survive into Deeptime map provenance.
