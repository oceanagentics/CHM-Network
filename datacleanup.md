# Ryu SQL-To-UI Cleanup Tracker

Use this file to track review-facing cleanup where data exists in Postgres, is available in the app object model, but is hidden, renamed unclearly, or only partly rendered in the UI.

Terminology rule: name each item from the Postgres table, column, and JSON path first. UI labels are listed only as the place a reviewer should look.

## Completed

### `nodes.record_depth` And `nodes.review_state`

- Status: done
- UI location: selected node -> `User view` -> `Profile`
- UI labels:
  - `Record depth`
  - `Review state`
- SQL storage:
  - `nodes.record_depth`
  - `nodes.review_state`
- App object:
  - `GraphNode.recordDepth`
  - `GraphNode.reviewState`
- Current UI rendering:
  - These render as status pills in the Profile section.

### `sources` Rows Behind Existing `Source:` Links

- Status: done
- UI location: any existing `Source:` link with info icon
- SQL storage:
  - `sources.id`
  - `sources.title`
  - `sources.source_type`
  - `sources.url`
  - `sources.local_path`
  - `sources.publisher`
  - `sources.published_at`
  - `sources.accessed_at`
  - `sources.note`
- App object:
  - `Source`
  - `graph.sourceById[source.id]`
- Current UI rendering:
  - Existing source links still show the source title.
  - The info icon tooltip resolves the full `sources` row.
- Limitation:
  - This only applies where the UI already renders a `Source:` link. Some `sourceRefs` are still hidden in other JSON fields.

## Remaining Items

### 1. `nodes.details_json -> $.data.descriptors[]`

- Status: next
- UI location: selected system -> `User view` -> `Data`
- UI labels:
  - `Data types`
  - `Formats`
  - `Standards`
  - `Records`
  - `Database size`
- SQL storage:
  - table: `nodes`
  - column: `details_json`
  - JSON path: `$.data.descriptors[]`
- App object:
  - `GraphNode.details.data.descriptors[]`
- Stored JSON entry example:

```json
{
  "id": "system-oregon-dlcd-coastal-gis-format-geojson-pbf",
  "category": "format",
  "label": "GeoJSON and PBF query output",
  "description": "Territorial Sea Plan MapServer lists JSON, GeoJSON, and PBF as supported query formats.",
  "source": {
    "id": "src-dlcd-territorial-sea-mapserver",
    "title": "Oregon Territorial Sea Plan ArcGIS MapServer",
    "url": "https://gis.lcd.state.or.us/server/rest/services/Framework/AdminBounds_TerritorialSeaPlan/MapServer"
  }
}
```

- How SQL maps to current UI:
  - `category = "type"` renders under UI label `Data types`.
  - `category = "format"` renders under UI label `Formats`.
  - `category = "standard"` renders under UI label `Standards`.
  - `label` renders as the visible pill text.
- Current UI example:
  - `Formats`: `GeoJSON And PBF Query Output`
- Stored data currently hidden in UI:
  - `id`
  - `description`
  - `source.id`
  - the resolved `sources` row for `source.id`
- Review problem:
  - A reviewer can see the claim as a pill, but not the stored explanation or the `sources` row supporting it.
- Proposed cleanup:
  - Keep the compact pills.
  - Add an info icon tooltip on each pill.
  - Tooltip should show `id`, `category`, `label`, `description`, and the resolved `sources` record for `source.id`.
- Acceptance:
  - A reviewer looking at `User view` -> `Data` can verify every visible `Data types`, `Formats`, or `Standards` pill against the underlying `nodes.details_json -> $.data.descriptors[]` entry.

### 2. `ryu_routes.properties_json -> $.sourceRefs[]`

- Status: pending
- UI location: selected system -> `User view` -> `Ryu`
- UI labels:
  - route ID
  - route status pill, such as `Planned`
  - route mode pill, such as `External Arcgis Rest`
  - `Priority`
  - capability pills
  - `Target`
  - `Upstream`
  - `Format`
  - `Contract`
  - caveat text
- SQL storage:
  - table: `ryu_routes`
  - columns:
    - `status`
    - `mode`
    - `priority`
    - `capabilities_json`
    - `target`
    - `upstream`
    - `format`
    - `contract_ref`
    - `caveat`
    - `properties_json`
  - JSON path: `properties_json -> $.sourceRefs[]`
- App object:
  - `RyuRoute`
  - `RyuRoute.properties.sourceRefs`
- Current SQL example:
  - `id`: `ryu-oregon-territorial-sea-plan-arcgis`
  - `target`: `https://gis.lcd.state.or.us/server/rest/services/Framework/AdminBounds_TerritorialSeaPlan/MapServer`
  - `properties_json.sourceRefs`: `["src-dlcd-territorial-sea-mapserver"]`
- Stored data currently hidden in UI:
  - `properties_json.sourceRefs`
  - resolved `sources` rows for those IDs
- Review problem:
  - A reviewer can see that a Ryu route exists, but not the source record that supports the route target, mode, or caveat.
- Proposed cleanup:
  - Add a `Sources` line to each route in `User view` -> `Ryu`.
  - Resolve each ID in `RyuRoute.properties.sourceRefs` through `graph.sourceById`.
- Acceptance:
  - A reviewer can open the source tooltip for every route-level source ref without switching to `Raw fields`.

### 3. `edges.note` And `edges.properties_json -> $.sourceRefs[]`

- Status: pending
- UI location: selected node -> `User view` -> `Connections`
- UI labels:
  - connected node name
  - relationship kind and direction, such as `Operates (outgoing)`
- SQL storage:
  - table: `edges`
  - columns:
    - `note`
    - `properties_json`
  - JSON path: `properties_json -> $.sourceRefs[]`
- App object:
  - `GraphEdge.note`
  - `GraphEdge.properties.sourceRefs`
- Current SQL example:
  - `id`: `rel-protomaps-operates-protomaps-basemap`
  - `kind`: `operates`
  - `note`: `Protomaps publishes the OpenStreetMap-derived Protomaps Basemap and PMTiles documentation.`
  - `properties_json.sourceRefs`: `["src-protomaps-docs", "src-protomaps-basemap-downloads"]`
- Current UI example:
  - `Protomaps Basemap`
  - `Operates (outgoing)`
- Stored data currently hidden in UI:
  - `edges.note`
  - `edges.properties_json.sourceRefs`
  - resolved `sources` rows for those IDs
- Review problem:
  - A reviewer can see that a graph relationship exists, but not why it exists or which source records support it.
- Proposed cleanup:
  - Show `edges.note` under each connection when present.
  - Show resolved source refs beneath the note.
- Acceptance:
  - A reviewer can validate graph relationships from `User view` -> `Connections` without switching to `Raw fields`.

### 4. Non-System Rows In `nodes`

- Status: pending
- UI location: selected organization or country -> `User view` -> `Profile`
- UI labels:
  - `Entity type`
  - `Record depth`
  - `Review state`
  - `Country`
  - `Subtype`
  - `Connections`
- SQL storage:
  - table: `nodes`
  - columns:
    - `url`
    - `summary`
    - `description`
    - `properties_json`
    - `created_at`
    - `updated_at`
  - JSON path: `properties_json -> $.sourceRefs[]`
- App object:
  - `GraphNode.url`
  - `GraphNode.summary`
  - `GraphNode.description`
  - `GraphNode.properties.sourceRefs`
  - `GraphNode.createdAt`
  - `GraphNode.updatedAt`
- Current SQL example for `org-protomaps`:
  - `url`: `https://docs.protomaps.com/`
  - `summary`: `Open source web mapping and PMTiles provider used for an OpenStreetMap-derived basemap.`
  - `properties_json.sourceRefs`: `["src-protomaps-docs", "src-protomaps-basemap-downloads"]`
- Stored data currently hidden in UI:
  - `nodes.url`
  - `nodes.summary`
  - `nodes.description`
  - `nodes.properties_json.sourceRefs`
  - `nodes.created_at`
  - `nodes.updated_at`
- Review problem:
  - Organization and country nodes are difficult to review because their stored `nodes` row is mostly hidden in `User view`.
- Proposed cleanup:
  - Add a small intro block for non-system nodes that shows URL, summary, description, and resolved source refs.
  - Keep system-only fields out of this block.
- Acceptance:
  - A reviewer can validate organization and country rows from `User view` without opening `Raw fields`.

### 5. `nodes.review_json`, `nodes.created_at`, And `nodes.updated_at`

- Status: pending
- UI location: selected node -> `User view` -> `Profile`
- UI labels:
  - `Record depth`
  - `Review state`
- SQL storage:
  - table: `nodes`
  - columns:
    - `record_depth`
    - `review_state`
    - `review_json`
    - `created_at`
    - `updated_at`
- App object:
  - `GraphNode.recordDepth`
  - `GraphNode.reviewState`
  - `GraphNode.review`
  - `GraphNode.createdAt`
  - `GraphNode.updatedAt`
- Current SQL example:

```json
{
  "agentResearch": [
    {
      "by": "Codex",
      "at": "2026-07-24",
      "scope": "OSU MVP-0 source research pass"
    }
  ],
  "humanReview": []
}
```

- Current UI rendering:
  - `Record depth`: `Thin`
  - `Review state`: `Agent Researched`
- Stored data currently hidden in UI:
  - `review_json.agentResearch`
  - `review_json.humanReview`
  - `created_at`
  - `updated_at`
- Review problem:
  - A reviewer can see the current status values but not the review trail or timestamps behind them.
- Proposed cleanup:
  - Add a compact `Review` section with latest agent research, latest human review, created date, and updated date.
- Acceptance:
  - A reviewer can tell whether a node was only agent-researched or has human review history.

### 6. Filters For `nodes.record_depth` And `nodes.review_state`

- Status: pending
- UI location: `Systems` -> `Filters`
- Current UI filter labels:
  - `Role`
  - `Operator country`
  - `Discipline`
  - `Access types`
  - `Access methods`
  - `Identifiers`
- SQL storage:
  - table: `nodes`
  - columns:
    - `record_depth`
    - `review_state`
- App object:
  - `GraphNode.recordDepth`
  - `GraphNode.reviewState`
- Current database counts:
  - `stub / unreviewed`: 49
  - `thin / unreviewed`: 50
  - `thin / agent_researched`: 6
  - `rich / agent_researched`: 2
- Stored data currently not filterable in UI:
  - `nodes.record_depth`
  - `nodes.review_state`
- Review problem:
  - A reviewer cannot quickly find nodes by review readiness, such as all thin agent-researched records.
- Proposed cleanup:
  - Add `Record depth` and `Review state` filters to the Systems filter panel.
- Acceptance:
  - A reviewer can filter the Systems directory by `nodes.record_depth` and `nodes.review_state`.
