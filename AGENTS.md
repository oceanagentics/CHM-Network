# CHM Network Agent Notes

## Canonical Graph Data
- Treat `data/chm-network.sqlite` as the canonical graph during active editing.
- Treat the live app DB as the only graph source of truth; do not keep alternate bootstrap or seed graph sources in the repo.
- Treat `research/*` CSV folders as incremental research/import batches, not as a separate central source of truth.

## Research Import Workflow
- Each research job may live in its own dated folder under `research/`.
- A research job should include `systems.csv`, `system_links.csv`, `sources.csv`, and optional notes.
- Import research jobs directly into `data/chm-network.sqlite` with `npm --workspace server run import:inventory -- <research-folder>`.
- Research jobs may reference parent systems or workflow targets that were already imported by earlier jobs.
- Do not create or maintain a separate merged central CSV registry.

## Write Surfaces
### In-app editor
- Start the API: `npm --workspace server run start`
- Start the client: `npm --workspace client run dev -- --host 127.0.0.1 --port 5173`
- Open `http://127.0.0.1:5173`
- Use the left-rail `Editor` panel.
- Modes:
  - `Nodes`
  - `Edges`
  - `Sources`
- Selecting a node opens that node.
- Selecting an edge opens that edge.
- Saving or deleting refetches `/api/graph/bootstrap` and redraws the graph.

### API write endpoints
- `POST /api/nodes`
- `PUT /api/nodes/:id`
- `DELETE /api/nodes/:id`
- `POST /api/edges`
- `PUT /api/edges/:id`
- `DELETE /api/edges/:id`
- `POST /api/sources`
- `PUT /api/sources/:id`
- `DELETE /api/sources/:id`

## Current Minimal Model
### Node kinds
- `country`
- `organization`
- `system`

### Edge kinds
- `governs`
- `operates`
- `part_of`
- `publishes_to`
- `syncs_to`

## Validation Rules
### Nodes
- `country`, `organization`, and `system` are flat node types.
- Do not add hidden hierarchy fields. Use explicit edges for graph relationships.

### Edges
- `governs`: `country -> organization`
- `operates`: `organization -> system`
- `part_of`: `system -> system`
- `publishes_to`: `organization -> system`
- `syncs_to`: `system -> system`

## Provenance and Metadata
- Store source rows in `sources`.
- Store rich, human-facing system details in `nodes.details_json`, with embedded source refs on the relevant detail items.
- Edge metadata such as `transferMethod`, `format`, `standard`, and `artifact` belongs in `edges.properties_json`.
- Keep node/edge edits minimal in the editor; rich research backfills should update the JSON record deliberately.

## Ryu Access Routes
- Treat `ryu_routes` as the first-class operational route index for agents.
- Keep `nodes.details_json.access` descriptive and evidence-facing; use `ryu_routes` to decide how an agent should actually retrieve data.
- Use `ryu_routes` only for machine access routes; human lookup, web UI, manual request, researcher-library, and raw-source context stays in `nodes.details_json.access`.
- For node/system research and rich record backfills, follow `RICH_RESEARCH_RECORDS.md` for the full `ryu` shape and research rules.
- Keep `ryu_routes` compact: route id, status, mode, priority, capabilities, target, upstream, format, contract_ref, and caveat.
- Do not store MCP/API tool contracts inline; `contract_ref` points to the relevant MCP, API, or service contract.
- Treat `status='planned'` as non-live; do not use that route for runtime access unless the requested work is planning or implementation.
- Prefer the lowest-priority route that matches the needed capability. No `ryu_routes` rows means no approved operational route is recorded yet.

## Rich Record Screenshots
- For rich record gallery screenshots, use the Codex in-app Browser as the preferred capture path before standalone headless browser tools.
- If the in-app Browser or all available capture paths are blocked by login, CAPTCHA, Cloudflare verification, browser-security pages, or other non-content screens, do not add gallery images for that record just to fill the slot.
- When capture is blocked, report the blocker and target URL back to the human so they can provide access, clear the session, or supply screenshots.

## Startup Behavior
- On startup, the server opens `data/chm-network.sqlite` and validates that the required app tables exist.
- If the DB file is missing or invalid, the server fails fast instead of creating or reseeding an alternate graph.

## GCP Environment
- Organization: `oceanagentics.com`
- Project: `chm-network` (`288836337031`)
- VM: `chm-network-vm`
- Zone: `us-west1-b`
- Machine type: `e2-micro`
- Public URL: `http://34.169.201.150`
- The VM currently serves the public read-only build with `nginx` from `/var/www/chm-network`.
- Port `80` and `443` are open via firewall rule `chm-network-allow-web`.
- The VM's external IP is currently ephemeral. If the instance is stopped and started, the IP may change until a static IP is attached.

## Public Publishing
- Use the dedicated Compute Engine key at `~/.ssh/CHM-Network` for CHM Network VM access.
- Publish the public site with `npm run publish:prod`.
- The public build uses `client/.env.public` and reads from `/bootstrap.public.json` instead of the live API.
- The export step writes the sanitized bootstrap file to `client/public/bootstrap.public.json`.
- `npm run publish:prod` builds the public bundle, uploads a release archive over SSH, installs it under `/var/www/chm-network-releases/<timestamp>-<sha>`, repoints `/var/www/chm-network`, reloads `nginx`, and verifies `/` plus `/bootstrap.public.json`.
- The script uses direct SSH/SCP with `~/.ssh/CHM-Network`; do not rely on `gcloud compute scp/ssh` for routine publishing.
- GCS static hosting is not the active publish path. Public bucket access was blocked by the org's domain-restricted sharing policy.

## Graph View Layers
- Keep graph view code split into two top-level phases: graph build and graph display.
- Graph build decides what Cytoscape elements exist:
  - `state/viewIntent.ts` and `state/graphStore.ts`: view intent and normalized user state
  - `graph/scope.ts`: scope selection
  - `graph/projection.ts`: structural projection
  - `graph/geometry.ts`: intrinsic node geometry and stable layout hints
- Graph display decides how those elements are positioned and shown:
  - `graph/layout.ts`: base Cytoscape layout planning and named post-layout transform definitions
  - `graph/useCytoscapeController.ts`: Cytoscape execution, enabled transform execution, events, and viewport policy
  - `components/GraphCanvas.tsx`: composition root only
  - `graph/cytoscapeStyles.ts`: presentation only

## Graph View Code Rules
- Put new logic in the highest layer that actually owns that concern.
- Express graph layout intent as graph structure or layout constraints before the layout solve whenever possible. Avoid moving nodes after the solve; post-solve position overrides make the app responsible for collisions, spacing, crossings, and edge routing side effects.
- `scope.ts` should decide which ids belong in a view. It should return ids only, not parent containers, sizes, or layout options.
- `projection.ts` should assemble the drawable graph structure: visible nodes, visible edges, view-specific grouping, and classification such as governance block membership.
- `geometry.ts` should define intrinsic node facts only: label text, box width and height, text width, and stable hints like `layoutBand`.
- `layout.ts` should translate projected graph data into Cytoscape elements, base layout behavior, and named post-layout transforms. Put Dagre, ELK, concentric, breadthfirst, multi-phase layout plans, and transform definitions here.
- `useCytoscapeController.ts` should execute the supplied display plan, run only enabled post-layout transforms after `layoutstop`, wire interactions, and manage fit vs preserve viewport behavior. Do not invent graph semantics here.
- `GraphCanvas.tsx` should orchestrate the pipeline and pass view intent plus display plans through to the controller. Do not delete fields from display plans, cache coordinates, or add view-specific layout hacks here.
- `cytoscapeStyles.ts` should stay visual only. Keep colors, borders, labels, arrows, and selection styling here. Do not put semantic geometry or layout behavior here.
- Post-layout transforms are position-only developer controls. They must not add or remove elements, change labels, change parents, or alter edge inclusion.

## Graph View Change Guide
- If the change is about which nodes or edges appear in a view, start in `graph/scope.ts`.
- If the change is about explicit graph grouping or edge projection, start in `graph/projection.ts`.
- If the change is about box size, label wrapping, or band assignment, start in `graph/geometry.ts`.
- If the change is about how a specific layout algorithm behaves, start in `graph/layout.ts`.
- If the change is about a named post-layout position transform, start in `graph/layout.ts` and expose it through the existing transform toggle model.
- If the change is about camera behavior, fit, preserve zoom, or interaction wiring, start in `graph/useCytoscapeController.ts`.
- Prefer changing one layer cleanly over adding a workaround in a lower layer.
