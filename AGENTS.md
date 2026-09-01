# Ryu Agent Notes

## Canonical Graph Data
- Treat the Cloud SQL PostgreSQL `explorer` database on the CHM instance `chm` as the production canonical graph.
- Treat `client/public/bootstrap.public.json` as a launch seed/export artifact, not as a production runtime source of truth.
- The initial launch seed may include converted legacy data, but production must run on Cloud SQL/Postgres only.
- Treat `research/*` CSV folders as incremental research/import batches, not as a separate central source of truth.

## Documentation
- Follow `documentation/RICH_RESEARCH_RECORDS.md` for standing rich research and record-backfill instructions.
- Use `documentation/mvp.md` as the current Deeptime/Ryu MCP portal working plan.
- Use `documentation/osusources.md` as the current Oregon/OSU source plan.
- Use `documentation/cloud-run-migration.md` for Cloud Run, CHM routing, and Cloud SQL launch work.
- Treat `documentation/mvp.md` and `documentation/osusources.md` as active project plans for today's Deeptime/Ryu work, not permanent modeling policy.

## Research Import Workflow
- Each research job may live in its own dated folder under `research/`.
- A research job should include `systems.csv`, `system_links.csv`, `sources.csv`, and optional notes.
- Port research imports to a Postgres-native path before using them against production data.
- Research jobs may reference parent systems or workflow targets that were already imported by earlier jobs.
- Do not create or maintain a separate merged central CSV registry.

## Write Surfaces
### Browser Review API
- CHM is the public IAP-protected entry app.
- CHM proxies only `PATCH /api/explorer/nodes/:id/localizations/:locale/review` to the private Explorer API.
- Explorer handles that as `PATCH /explorer/api/nodes/:id/localizations/:locale/review`.
- The request body may contain only `reviewState` and `reviewerNote`.
- Explorer sets `reviewer` from the CHM-forwarded IAP email and sets `lastReviewed` when the review state or note is accepted.
- The browser client should call the CHM proxy path `/api/explorer/nodes/:id/localizations/:locale/review`, not the public Explorer `/explorer/api/...` path.
- The details UI shows `recordDepth` plus the resolved localization's `reviewState` for all users. Authenticated/author mode renders the review state dropdown and reviewer-note form for that localization.
- Do not expose general node, edge, source, saved-view, or schema mutation routes through the browser API.

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
- Node IDs are globally unique, kindless slugs. Do not encode kind with prefixes such as `system-`, `org-`, or `country-`; use the `kind` field for type.
- If a natural slug collides across node kinds, keep the most queried entity on the natural slug and add a meaning-bearing suffix such as `-operator` to the other entity.

### Edges
- `governs`: `country -> organization`
- `operates`: `organization -> system`
- `part_of`: `system -> system`
- `publishes_to`: `organization -> system`
- `syncs_to`: `system -> system`

## Provenance and Metadata
- Store source rows in `sources`.
- Store user-facing system prose in `node_localizations`, with embedded source refs on the relevant localized detail items.
- Store language-neutral operational facts in `nodes.properties_json`.
- Do not add or preserve identifier lists in the record model.
- Edge metadata such as `transferMethod`, `format`, `standard`, and `artifact` belongs in `edges.properties_json`.
- Keep node/edge edits minimal in the editor; rich research backfills should update the JSON record deliberately.

## Ryu Access Routes
- Treat `ryu_routes` as the first-class operational route index for agents.
- Keep `nodes.properties_json.access` as access mechanics and `node_localizations.details_json.access` as localized human guidance; use `ryu_routes` to decide how an agent should actually retrieve data.
- Use `ryu_routes` only for machine access routes; human lookup, web UI, manual request, researcher-library, and raw-source context stays in the localized access/details surface, not `ryu_routes`.
- For node/system research and rich record backfills, follow `documentation/RICH_RESEARCH_RECORDS.md` for the full `ryu` shape and research rules.
- Keep `ryu_routes` compact: route id, status, mode, priority, capabilities, target, upstream, format, contract_ref, and caveat.
- Do not store MCP/API tool contracts inline; `contract_ref` points to the relevant MCP, API, or service contract.
- Treat `status='planned'` as non-live; do not use that route for runtime access unless the requested work is planning or implementation.
- Prefer the lowest-priority route that matches the needed capability. No `ryu_routes` rows means no approved operational route is recorded yet.

## Ryu MCP Portal
- Ryu should act as a system discovery and routing portal, not one universal marine-data API.
- The portal surface should expose stable discovery tools such as `list_systems`, `search_systems`, and `get_system`.
- Portal responses should return enough system, source, capability, route, connector, auth, delivery-format, and caveat metadata for clients such as Deeptime to decide which systems to query and how.
- System-specific APIs or MCP connectors own source-specific tools for sending, receiving, retrieving, and transforming data.
- Keep connector references in route metadata or route properties; keep detailed connector/API contracts in referenced docs or connector packages.

## Rich Record Screenshots
- For rich record gallery screenshots, use the Codex in-app Browser as the preferred capture path before standalone headless browser tools.
- If the in-app Browser or all available capture paths are blocked by login, CAPTCHA, Cloudflare verification, browser-security pages, or other non-content screens, do not add gallery images for that record just to fill the slot.
- When capture is blocked, report the blocker and target URL back to the human so they can provide access, clear the session, or supply screenshots.

## Startup Behavior
- On startup, the server connects to the configured Postgres database.
- If required Postgres connection settings or schema objects are missing, the server should fail fast instead of creating or reseeding an alternate graph.

## GCP Environment
- Organization: `oceanagentics.com`
- Project: `chm-network` (`288836337031`)
- Region: `us-east4`
- Public entry: `https://chm.oceanagentics.org/explorer`
- CHM owns the domain, load balancer, IAP, and path routing.
- Explorer owns the app image, runtime behavior, Postgres schema, and graph data model.
- Browser-facing `explorer` uses read credentials; private `explorer-api` uses write credentials; schema/setup work uses the dedicated schema-capable credentials only when an explicit database change is being applied.

## Cloud Run Publishing
- Build the Explorer image with `cloudbuild.yaml` into Artifact Registry repository `chm-apps`.
- Use commit-only updates for review, handoff, and release traceability; commits do not publish by themselves unless an external trigger is explicitly configured.
- Use routine app publishes for UI, API, runtime, and other app-only changes: commit, build an immutable image, deploy it to both `explorer` and `explorer-api`, and smoke test.
- Prefer CHM Terraform image rollouts when Terraform should remain the deployment record: build the image first, then apply Terraform with the new Explorer image digest.
- Use broader Terraform changes only for shared CHM infrastructure, routing, IAP, service accounts, secrets, Cloud SQL, runtime environment, or schema-change wiring.
- Do not keep standing Cloud Run jobs for initial database setup or read checks.
- Handle future schema changes deliberately when they are needed; keep the current SQL as the reference for the production Postgres shape.

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
