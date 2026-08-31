# Rich Research Records For Ryu

Use this guide when researching and backfilling rich database records for Ryu. The goal is a record that helps a researcher quickly understand what a database is for, what data it contains, how large it is, how to access or contribute to it, who manages it, and which machine routes Ryu can use.

## Source Of Truth

- Treat Cloud SQL/Postgres as the canonical editable graph.
- Do not create a parallel registry, merged CSV, or alternate bootstrap as a new source of truth.
- After DB edits, regenerate the public bootstrap with `npm --workspace server run export:public`.
- If UI-facing data changed, verify with `npm run build`.
- `client/public/bootstrap.public.json` is generated output. Keep it in sync, but do not edit it by hand.

## Record Shape

The lean graph schema uses:

- `nodes`: one row per country, organization, or system.
- `edges`: explicit graph relationships, including `governs`, `operates`, `part_of`, `publishes_to`, and `syncs_to`.
- `sources`: source records used by rich details.
- `ryu_routes`: compact operational route rows for machine access.
- `saved_views`: app state.

For system nodes:

- Use `nodes.url`, `nodes.summary`, and `nodes.description` for the primary public URL and prose profile.
- Use `nodes.record_depth` to track `stub`, `thin`, or `rich`.
- Use `nodes.review_state` for review queues, such as `unreviewed`, `agent_researched`, `needs_human_review`, `human_reviewed`, or `needs_revision`.
- Use `nodes.review_json` only for `reviewerNote`, `reviewer`, and `lastReviewed`.
- The details UI shows `recordDepth` and `reviewState` for all users. In authenticated/author mode, it lets users update only `reviewState` and `reviewerNote`; `reviewer` and `lastReviewed` are set by the server.
- Use `nodes.details_json` for human-facing rich details: aliases, operator summary, role, discipline family, geographic scope, descriptors, metrics, access paths, identifiers, usage, and gallery items.
- Use `nodes.properties_json` only for extra node properties that do not fit the common fields or `details_json`.
- Use `ryu_routes` only for approved machine access routes that agents or other apps should call.

Do not reintroduce removed tables or fields:

- No `system_profiles`, `system_data_descriptors`, `system_access_paths`, `system_gallery_items`, `system_metrics`, or `system_identifier_schemes`.
- No `node_claims` unless a new use case proves it is needed.
- No confidence fields, duplicate system IDs, or generic evidence-link layer.
- No hidden parent field. Use an explicit `part_of` edge.

## Research Standard

Prefer official and primary sources:

- Official database homepage and documentation.
- API or data portal docs.
- Download pages, repository pages, or object-storage listings.
- Citation, terms, licensing, and contact pages.
- Published impact, citation, or user-community studies when official usage numbers are not available.

For facts that may change, use current web research and record an `accessed_at` date in `sources`. Do not rely on memory for current counts, operator names, URLs, access rules, or pricing.

Every important claim should be traceable to a `sources` row. Put source references directly on the relevant `details_json` items by embedding a `source` object with `id`, `title`, and `url`.

## URL Validation

Access and gallery URLs must be live enough for a researcher to use. Do not add an access URL just because it appears in page text, search results, or an old import row.

Before finalizing a record:

- Run `npm --workspace server run validate:urls`. This command checks `sources.url`, `nodes.details_json.access[].url`, and gallery image URLs.
- Check `nodes.url` in a browser when you add or change it; many official homepages block command-line validators even when the page is valid.
- Treat `200`, stable `3xx` redirects, and intentional document downloads as usable.
- Treat `403`, `404`, DNS failures, bot-challenge pages, login walls not described in access notes, and iframe-only failures as problems to fix or explicitly explain.
- Prefer the canonical working host when mirrors differ, such as `fishbase.se` over a `www.fishbase.org` path that returns Cloudflare `403`.
- If a URL requires an account, application, API key, payment, or special browser/session behavior, say that in the access path `description`.

## Profile Writing

The system profile should read like a concise research brief.

Use these node fields:

- `url`: canonical homepage, portal, or primary record entry point.
- `summary`: one sentence saying what the database is and what kind of data it provides.
- `description`: one substantial paragraph covering scope, data categories, headline size, operator or manager, governance/consortium context, access model, contribution model, and important caveats.
- `record_depth`: `rich` only when the system has a full researched record, not merely imported identifiers or tags.
- `review_state`: set `agent_researched` after an agent completes a rich backfill; use `needs_human_review` when review is specifically requested.

Use `nodes.details_json` for:

- `aliases`: useful search/citation aliases.
- `operator`: `{ "id", "name", "countryCode" }` summary copied from the `operates` edge target for display.
- `role`, `disciplineFamily`, and `geographicScope`: stable lower_snake_case values.

Keep organization rows minimal: name, country code or `INT`, subtype such as `system_operator`, and `{}` properties unless richer organization modeling is explicitly requested.

## Data Descriptors

Use `nodes.details_json.data.descriptors` for compact, source-backed descriptions of data content.

Categories:

- `type`: what data the database contains, such as taxonomy, occurrence records, traits, imagery, references, metrics, sequence records, or model outputs.
- `format`: how the data is exposed or stored, such as web pages, CSV, parquet, API JSON, Darwin Core Archive, RDF, or relational database tables.
- `standard`: identifiers, vocabularies, schemas, licenses, or protocols used by the database.

Each descriptor should have `id`, `category`, `label`, `description`, and optional `source`.

Keep descriptors broad enough to scan. Do not create one descriptor per table unless table-level detail is essential.

## Metrics

Use these `details_json` fields for quantitative claims:

- `data.recordCount`: native record count.
- `data.storageSize`: total size in bytes.
- `usage`: publication counts, citation counts, downloads, registered users, contributors, and similar usage metrics.

Each metric should include `id`, `key`, `value`, `unit`, `description`, `observedAt`, and `source`.

Rules:

- Every metric must have a source object.
- Use `observedAt` for the date or version the number refers to.
- Use `description` to capture caveats, such as "compressed public snapshot, not live production DB".
- Store storage in bytes even if the source reports MB/GB/TB. Convert carefully and describe the original source measurement.
- If a metric cannot be found, do not invent it. Leave it absent and mention the gap in notes or final summary.

## Access Paths

Use `nodes.details_json.access` for all human/researcher access and submission paths. Access and submission are intentionally merged here.

Each access path should have:

- `id`: stable route-like id within the node.
- `type`: `read`, `submit`, or `partner_sync`.
- `method`: lower_snake_case access mechanism.
- `label`: short human-readable label.
- `url`: direct portal, docs, contact, download, API, or terms page.
- `description`: how access is handled, including account/API key, application, payment, free access, limitations, and whether data are static snapshots.
- `source`: source object with `id`, `title`, and `url`.

Do not add negative access rows for access that does not exist, such as "no public write API", "no direct write", or "commercial reuse requires contact". Leave absent access absent. If a limitation materially qualifies an actual access path, describe it in that access path's `description` or in the system profile.

Legacy `none` access values may exist in imported detail JSON. Treat them as deprecated and do not create new ones during rich record backfills.

## Ryu Routes

Use `ryu_routes` only for approved machine access routes. Human lookup, browser UI, manual request, researcher-library, and raw-source context belongs in `nodes.details_json.access`, not `ryu_routes`.

Route fields:

- `id`: stable lower-kebab-case route id.
- `node_id`: system node id.
- `status`: route readiness, usually `active`, `planned`, `deprecated`, or `blocked`.
- `mode`: machine access pattern, such as `live_api`, `self_hosted_snapshot`, `hosted_snapshot`, `oa_cache`, `mcp`, or `unavailable`.
- `priority`: lower number means preferred.
- `capabilities_json`: JSON array of task-level affordances, such as `species_profile`, `occurrence_locations`, `dataset_search`, `metadata_lookup`, `file_download`, or `submission_status`.
- `target`: our runtime, service, MCP server, cache, or tool target.
- `upstream`: concise upstream locator, such as a domain, API base, bucket/prefix, repository, or source alias.
- `format`: main data/interface format, such as `json`, `geojson`, `parquet`, `csv`, `darwin_core_archive`, or `html`.
- `contract_ref`: pointer to the real contract, docs, MCP server, OpenAPI spec, or service notes. Do not inline the contract in `ryu_routes`.
- `caveat`: one short operational warning.
- `properties_json`: only for route-specific extras that do not deserve columns.

Research rules:

- Add a route only when research establishes a concrete machine access path that an agent runtime should use.
- Use `status='planned'` when the route is intentional but not yet live. Planned routes are indexes for future implementation, not runtime access.
- Multiple routes are allowed; order them with `priority`.
- Prefer an OA-controlled runtime route when production use needs stable performance, joins, caching, credentials, or map-ready transforms.
- Do not add raw upstream storage as a separate route when our runtime is a derived cache or MCP service. Mention the upstream on the machine route instead.
- If there is no approved operational route, leave `ryu_routes` empty for that node.

## Gallery Images

Gallery images should be local, stable, and useful. Avoid blocked iframes and decorative screenshots.

Preferred capture path:

- Use the Codex in-app Browser first for screenshots, especially for public sites that may challenge headless browsers.
- If the in-app Browser reaches the real page, capture representative UI pages from that session.
- If access is blocked by login, CAPTCHA, Cloudflare verification, browser-security pages, or another non-content screen, do not add gallery items or substitute weak images just to fill the gallery.
- When capture is blocked, report the blocked URL and blocker back to the human so they can provide access, clear the session, or supply screenshots.

Storage convention:

- Store assets under `client/public/gallery/<node-id>/`.
- Use one high-resolution file and one thumbnail per gallery item.
- Recommended filenames: `<capture-name>-high.png` and `<capture-name>-thumb.png`.
- Recommended capture size for screenshots: `1440x900`.
- Recommended thumbnail size: `640x400`.

`details_json.gallery` items should have `id`, `type`, `url`, `thumbnailUrl`, `title`, `caption`, `source`, and `sortOrder`.

Use `type='embed'` only when the target site works reliably in an iframe. If an embed renders as a grey or blank square, replace it with local image captures.

Choose images that show what kinds of data the database contains and how those data are structured. The gallery should visually answer what a researcher or ocean stakeholder can expect to find in the system, not merely how to use the website.

## Identifiers

Use `nodes.details_json.identifiers` for internal identifiers, accession schemes, dataset IDs, species IDs, record IDs, reference numbers, or globally recognized names used to join or cite records.

Each identifier should explain:

- The scheme name.
- What it applies to.
- How it is used in the database.
- Source, when sourceable.

## Updating The DB

Use a single Postgres transaction for each system backfill when practical.

Recommended order:

1. Upsert `sources`.
2. Upsert any new `nodes` for operators.
3. Update `edges` for operator/governance/part-of links.
4. Update the system row in `nodes`, including `url`, `summary`, `description`, `record_depth`, `review_state`, and `details_json`.
5. Update `ryu_routes` when the system has an approved operational route.
6. Regenerate `client/public/bootstrap.public.json`.
7. Run validation.

Do not delete unrelated rows for other systems. Do not change existing user or agent work outside the target system unless required by a proven correction.

## Validation Checklist

Run these checks before finishing:

```sh
npm --workspace server run export:public
npm run build
```

For the target system, also check:

```sh
psql "$DATABASE_URL" -c \
  "SELECT id, url, summary, description, record_depth, review_state, details_json FROM nodes WHERE id='<node-id>';"

psql "$DATABASE_URL" -c \
  "SELECT kind, source_node_id, target_node_id, note FROM edges WHERE source_node_id='<node-id>' OR target_node_id='<node-id>' ORDER BY kind;"

psql "$DATABASE_URL" -c \
  "SELECT id, status, mode, priority, format, contract_ref FROM ryu_routes WHERE node_id='<node-id>' ORDER BY priority;"
```

Confirm:

- Required access URLs, descriptions, and sources are present.
- Required metric sources are present.
- Gallery local files exist for every local `url` and `thumbnailUrl`.
- The public bootstrap exports the same values you expect from Postgres.

## Final Summary For Users

When reporting a completed backfill, include:

- What system was updated.
- Main profile improvements.
- Counts of descriptors, access paths, gallery items, identifiers, and metrics.
- The most important sourced metrics.
- Any caveats, especially about approximate counts, snapshot-vs-live sizes, or missing usage data.
- Validation commands that passed.

Keep the summary factual and short. Do not paste the entire record unless requested.
