# CHM Network Agent Notes

## Canonical Graph Data
- Treat `data/chm-network.sqlite` as the canonical graph during active editing.
- Do not hand-edit `sql/chm_seed_japan.sql` for routine graph changes.
- `sql/chm_schema.sql` and `sql/chm_seed_japan.sql` are bootstrap/reset inputs only.

## Write Surfaces
### In-app editor
- Start the API: `npm --workspace server run start`
- Start the client: `npm --workspace client run dev -- --host 127.0.0.1 --port 5173`
- Open `http://127.0.0.1:5173`
- Use the left-rail `Editor` panel.
- Modes:
  - `Entities`
  - `Relationships`
  - `Sources`
- Selecting a node opens that entity.
- Selecting an edge opens that relationship.
- Saving or deleting refetches `/api/graph/bootstrap` and redraws the graph.

### API write endpoints
- `POST /api/entities`
- `PUT /api/entities/:id`
- `DELETE /api/entities/:id`
- `POST /api/relationships`
- `PUT /api/relationships/:id`
- `DELETE /api/relationships/:id`
- `POST /api/sources`
- `PUT /api/sources/:id`
- `DELETE /api/sources/:id`

## Current Minimal Model
### Entity kinds
- `country`
- `organization`
- `system`

### Relationship types
- `part_of`
- `operates`
- `publishes_to`
- `syncs_to`

## Validation Rules
### Entities
- `country` has no parent.
- `system` has no parent.
- `organization.parentEntityId` may target only `country` or `organization`.

### Relationships
- `part_of`: `organization -> organization|country`
- `operates`: `organization -> system`
- `publishes_to`: `organization -> system`
- `syncs_to`: `system -> system`

## Provenance and Metadata
- Link sources through `entity_sources` and `relationship_sources`.
- Relationship metadata such as `transferMethod`, `format`, `standard`, and `artifact` belongs in `relationships.properties_json`.
- The editor sends provenance links inline with entity and relationship saves and replaces those links transactionally.

## Reset Behavior
- On startup, the server checks the local DB for stale legacy graph rows.
- If legacy kinds or relationships are found, the server resets the local DB from the minimal schema and seed before serving requests.
- After that reset, the live DB is the source of truth.
