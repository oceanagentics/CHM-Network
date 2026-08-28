# OSU MVP Ryu Source Plan

## Purpose

Build the first Oregon-focused Ryu source set for map context, whale ecology, fisheries, and operational access routes. The graph should stay lean: each source system gets a full node only when it represents a distinct dataset, service, catalog, or operational provider that Ryu may query, snapshot, cite, or display independently.

Use `Ryu` terminology in new notes, source records, route labels, and review language.

## Modeling Rules

- Treat separate NOAA services or datasets as separate `system` nodes when they have distinct access patterns, update cycles, citations, caveats, or user-facing layer behavior.
- Treat NOAA itself, NOAA Fisheries, NOAA Office of Coast Survey, NOAA NGS, and Marine Cadastre partners as organizations only when that ownership helps source attribution or routing.
- Keep `ryu_routes` for machine access only: APIs, WMS/WMTS, ArcGIS REST, PMTiles, downloadable GIS packages, CSV endpoints, or snapshot pipelines.
- Keep descriptive human context, caveats, citation notes, and gallery material in node details.
- Use `planned` route status until the route is implemented and validated in Ryu.
- Avoid creating nodes for deprecated or purely fallback sources unless they need to be blocklisted or intentionally documented.

## Priority Order

### MVP-0: Base Map And Oregon Context

1. Protomaps Basemap
   - Role: default land, coast, roads, and labels basemap.
   - Ryu action: host an Oregon/PNW PMTiles cutout or configure a hosted development fallback.
   - Why first: every later map layer needs geographic context.

2. GEBCO Web Map Service
   - Role: ocean relief and bathymetry visual context.
   - Ryu action: register as a raster WMS underlay.
   - Why first: Oregon marine layers need bathymetry context before ecology or fisheries overlays are useful.

3. Oregon DLCD / OCMP Coastal GIS
   - Role: Oregon coastal zone, shoreline, territorial sea, rocky habitat, and planning boundaries.
   - Ryu action: snapshot relevant boundary layers to GeoJSON and retain the ArcGIS REST route for refresh.
   - Why first: gives Oregon-specific management context for all later layers.

### MVP-1: Core Oregon Whale And Fisheries Evidence

1. NOAA Biologically Important Areas
   - Role: core whale ecology polygons.
   - Ryu action: download, snapshot, clip to Oregon, simplify.
   - Caveat: evidence and planning layer, not real-time whale presence.

2. NOAA ESI Outer Coast WA/OR Marine Mammal Polygons
   - Role: Oregon/Washington whale and marine mammal distribution context.
   - Ryu action: download file geodatabase, extract whale-relevant layers, clip to Oregon.
   - Caveat: older ESI planning data.

3. Ecotrust Oregon Marine Fisheries Uses and Values Project
   - Role: fishery-use and value layers, especially Dungeness crab.
   - Ryu action: discover downloadable or service endpoints and snapshot chosen layers.
   - Caveat: older 2009-2010 participatory mapping data.

4. ODFW Commercial Landing Statistics
   - Role: port-level pounds and value context.
   - Ryu action: normalize selected year/species/port tables to CSV or GeoJSON points.
   - Caveat: landings economics, not offshore effort geometry.

### MVP-2: Regulatory And Management Context

1. NOAA West Coast Critical Habitat GIS Data
   - Role: humpback and Southern Resident killer whale critical habitat context.
   - Ryu action: download relevant GIS layers and clip to Oregon.
   - Caveat: legal/regulatory context, separate from ecology observations.

2. NOAA Species and Habitat App
   - Role: ESA ranges, critical habitat, and EFH context.
   - Ryu action: discover backing services or use linked GIS data pages.
   - Caveat: intended for visual interpretation, not legal definitions.

3. NOAA ESI Outer Coast WA/OR Resource Management Polygons/Points
   - Role: commercial/recreational fishing and managed-resource context.
   - Ryu action: download file geodatabase and extract fisheries/resource-management layers.
   - Caveat: older ESI response-planning data.

4. NOAA West Coast Groundfish Conservation Areas
   - Role: trawl RCA and groundfish management areas.
   - Ryu action: download and normalize Oregon-relevant features.
   - Caveat: GIS representation is approximate; legal rules govern.

5. NOAA Yelloweye Rockfish Conservation Areas
   - Role: Oregon groundfish conservation context.
   - Ryu action: download and normalize Oregon-relevant features.
   - Caveat: GIS representation is approximate; legal rules govern.

### Later: Dynamic Or Higher-Complexity Data

1. NOAA WhaleWatch
   - Role: monthly blue whale likelihood/density model layer.
   - Ryu action: register CSV endpoint and build grid-to-GeoJSON or raster transform.
   - Caveat: model estimates, not sightings; dynamic updates add complexity.

2. NOAA Pacific Fishing Effort Mapping Project
   - Role: higher-resolution West Coast fishing effort, catch, landings, and economics.
   - Ryu action: investigate service endpoints, terms, and export options.
   - Caveat: confidentiality suppression and dashboard-only access may limit reuse.

3. Global Fishing Watch Apparent Fishing Effort
   - Role: AIS-derived fishing effort heatmap.
   - Ryu action: add authenticated provider after static MVP.
   - Caveat: AIS bias and account/API terms.

4. Marine Cadastre AIS Vessel Transit Counts
   - Role: vessel traffic context.
   - Ryu action: register ArcGIS REST or GeoPackage source and clip to Oregon.
   - Caveat: all-vessel traffic, not fishing-specific.

5. OBIS API And Selected OBIS Datasets
   - Role: marine mammal occurrence points and broader biodiversity.
   - Ryu action: add API-backed occurrence provider with license capture.
   - Caveat: occurrence data is effort-biased; dataset licenses vary.

6. NOAA ENC Direct to GIS, nowCOAST, BlueTopo, and NGS Coastal Imagery
   - Role: optional nautical, coastal conditions, bathymetry, and imagery context.
   - Ryu action: register selected non-navigation context layers only after the static MVP is stable.
   - Caveat: operational services and chart-derived layers need careful terms and non-navigation labeling.

### Partnership, Exclude, And Fallback

1. OSU GEMM Lab
   - Track as a future partner/contact source-of-record, not an automated ingest source yet.

2. NOAA Raster Nautical Chart Tile Service
   - Blocklist as deprecated; do not build against it.

3. Esri Ocean Basemap
   - Keep only as an optional demo fallback if self-hosted/open basemap work is delayed.
   - Do not hide it under a PMTiles route; if used, register a separate raster basemap route with Esri-specific provenance and caveats.

## MVP-0 Research Pass

### Protomaps Basemap

- Provider: Protomaps, using OpenStreetMap-derived data.
- Official docs: https://docs.protomaps.com/basemaps/downloads
- Access pattern: PMTiles archive, hosted tiles, or regional PMTiles extract.
- Ryu use: default land/coast/label basemap.
- Proposed route: planned self-hosted Oregon/PNW vector PMTiles cutout.
- Caveats: OSM attribution is required; the basemap is not marine-specific and needs ocean styling.

### OpenStreetMap Standard Raster Tiles

- Provider: OpenStreetMap Foundation / OpenStreetMap contributors.
- Official tile policy: https://operations.osmfoundation.org/policies/tiles/
- Access pattern: XYZ raster tile URL template.
- Ryu use: directly renderable raster basemap option for MVP browser maps.
- Route: active external XYZ raster tile route.
- Caveats: OSM attribution is required; tile.openstreetmap.org is best-effort with no SLA and is not for bulk download or offline use.

### GEBCO Web Map Service

- Provider: GEBCO / British Oceanographic Data Centre.
- Official docs: https://www.gebco.net/data-products/gebco-web-services/web-map-service
- Service URL: https://wms.gebco.net/mapserv?
- Access pattern: OGC WMS raster map images.
- Ryu use: ocean relief and bathymetry underlay.
- Proposed route: planned external WMS underlay.
- Caveats: visual context only, not for navigation or safety at sea; service availability and WMS performance should be tested.

### Oregon DLCD / OCMP Coastal GIS

- Provider: Oregon Department of Land Conservation and Development / Oregon Coastal Management Program.
- Official docs: https://www.oregon.gov/lcd/about/pages/maps-data-tools.aspx
- Territorial Sea Plan service: https://gis.lcd.state.or.us/server/rest/services/Framework/AdminBounds_TerritorialSeaPlan/MapServer
- Access pattern: data downloads, web services, ArcGIS REST MapServer with JSON, GeoJSON, and PBF query output.
- Ryu use: Oregon coastal zone, shoreline, territorial sea, rocky habitat, and planning boundary context.
- Proposed routes: planned GeoJSON snapshot route plus planned ArcGIS REST refresh route.
- Caveats: verify authoritative metadata per layer and treat as Oregon management/context boundaries.

## Proposed MVP-0 Graph Additions

### Organizations

- `protomaps`
- `gebco`
- `oregon-dlcd`

### Systems

- `protomaps-basemap`
- `gebco-web-services`
- `oregon-dlcd-coastal-gis`

### Sources

- `src-protomaps-basemap-downloads`
- `src-protomaps-docs`
- `src-gebco-wms`
- `src-dlcd-maps-data-tools`
- `src-dlcd-territorial-sea-mapserver`

### Edges

- `protomaps` operates `protomaps-basemap`
- `gebco` operates `gebco-web-services`
- `oregon-dlcd` operates `oregon-dlcd-coastal-gis`

### Ryu Routes

- `ryu-protomaps-oregon-pnw-vector-pmtiles`
  - Status: `planned`
  - Mode: `self_hosted_snapshot`
  - Format: `pmtiles`
  - Capability: vector basemap, basemap tiles, land context, label context

- `ryu-openstreetmap-standard-raster-basemap`
  - Status: `active`
  - Mode: `external_xyz_raster_tile`
  - Format: `raster_tile`
  - Capability: raster basemap, basemap tiles, land context, label context

- `ryu-gebco-wms-underlay`
  - Status: `planned`
  - Mode: `external_wms`
  - Format: `wms`
  - Capability: bathymetry underlay, ocean relief

- `ryu-oregon-dlcd-coastal-boundaries-snapshot`
  - Status: `planned`
  - Mode: `self_hosted_snapshot`
  - Format: `geojson`
  - Capability: coastal boundary context, Oregon management context

- `ryu-oregon-territorial-sea-plan-arcgis`
  - Status: `planned`
  - Mode: `external_arcgis_rest`
  - Format: `arcgis_rest`
  - Capability: territorial sea, rocky habitat, planning areas
