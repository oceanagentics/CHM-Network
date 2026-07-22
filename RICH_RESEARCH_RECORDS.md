# Rich Research Records For Ryu / CHM Network

Use this guide when researching and backfilling rich database records for Ryu, the CHM Network graph. The goal is a record that helps a researcher quickly understand what a database is for, what data it contains, how large it is, how to access or contribute to it, who manages it, and who uses it.

## Source Of Truth

- Treat `data/chm-network.sqlite` as the canonical editable graph.
- Do not create a parallel registry, merged CSV, seed file, or alternate bootstrap as a new source of truth.
- After DB edits, regenerate the public bootstrap with `npm --workspace server run export:public`.
- If UI-facing data changed, verify with `npm run build:public`.
- `client/public/bootstrap.public.json` is generated output. Keep it in sync, but do not edit it by hand.

## Record Shape

A rich system record is assembled from these tables:

- `entities`: one row for the system and one row for each real operator organization.
- `relationships`: `operates` links the operator organization to the system; use other relationship types only when they match the validation rules.
- `sources`: every claim-bearing source used by profile, metrics, access paths, identifiers, descriptors, or gallery items.
- `system_profiles`: primary URL, short description, long description, aliases, role, discipline family, and geographic scope.
- `system_data_descriptors`: data types, formats, and standards.
- `system_access_paths`: read, submit, partner sync, or none access paths.
- `system_metrics`: sourced quantitative claims, including record count and storage size when available.
- `system_identifier_schemes`: database-specific IDs and naming schemes.
- `system_gallery_items`: local thumbnails and high-resolution local captures or, only when reliable, live embeds.
- `entities.properties_json.ryu`: compact operational route index projected as `systemNode.ryu`.

Do not reintroduce removed fields:

- No `slug`.
- No `status`.
- No `confidence`.
- No confidence values.
- No generic evidence-link layer.
- No duplicate IDs such as both `id` and `systemId` unless the table schema requires `system_id` as a foreign key.

## Research Standard

Prefer official and primary sources:

- Official database homepage and documentation.
- API or data portal docs.
- Download pages, repository pages, or object-storage listings.
- Citation, terms, licensing, and contact pages.
- Published impact, citation, or user-community studies when official usage numbers are not available.

For facts that may change, use current web research and record an `accessed_at` date in `sources`. Do not rely on memory for current counts, operator names, URLs, access rules, or pricing.

Every important claim should be traceable to a `sources` row. Use precise source notes so later reviewers know why the source was added.

## URL Validation

Access-path URLs must be live enough for a researcher to use. Do not add an access URL just because it appears in page text, search results, or an old import row.

Before finalizing a record:

- Run `npm --workspace server run validate:urls`. This command is also part of `npm run build:public`.
- Check every `system_access_paths.url` with `curl -I -L` or an equivalent browser check.
- Treat `200`, stable `3xx` redirects, and intentional document downloads as usable.
- Treat `403`, `404`, DNS failures, bot-challenge pages, login walls not described in the access notes, and iframe-only failures as problems to fix or explicitly explain.
- Prefer the canonical working host when mirrors differ, such as `fishbase.se` over a `www.fishbase.org` path that returns Cloudflare `403`.
- If a URL requires an account, application, API key, payment, or special browser/session behavior, say that in the access path `description`.
- Recheck generated or imported URLs even when they come from official-looking sources.

## Profile Writing

The system profile should read like a concise research brief.

`short_description`:

- One sentence.
- Say what the database is and what kind of data it provides.
- Avoid marketing language.

`long_description`:

- One substantial paragraph is usually enough.
- Cover scope, data categories, headline size, operator or manager, governance/consortium context, access model, contribution model, and important caveats.
- Use approximate language when the source is approximate, such as "more than", "about", or "minimum reported".
- Do not stuff raw source URLs into prose; use `sources` rows and sourced child records for provenance.

`aliases`:

- Comma-separated aliases only.
- Do not duplicate the title unless the alias is useful in search, citation, or common usage.

`role`, `discipline_family`, and `geographic_scope`:

- Use stable, lower_snake_case values.
- Prefer existing values when they fit, but do not force a bad category.

## Operators And Governance

Use `operates` for the organization that actually runs, hosts, manages, or maintains the database.

- If a consortium provides scientific guidance but does not operate the system, describe that in `long_description` rather than forcing it into `operates`.
- If the existing operator is wrong, add or update the organization and move the `operates` relationship.
- Keep organization rows minimal: name, country code or `INT`, subtype such as `system_operator`, and `{}` properties unless richer organization modeling is explicitly requested.

## Data Descriptors

Use `system_data_descriptors` for compact, source-backed descriptions of data content.

Categories:

- `type`: what data the database contains, such as taxonomy, occurrence records, traits, imagery, references, metrics, sequence records, or model outputs.
- `format`: how the data is exposed or stored, such as web pages, CSV, parquet, API JSON, Darwin Core Archive, RDF, or relational database tables.
- `standard`: identifiers, vocabularies, schemas, licenses, or protocols used by the database.

Each descriptor should have:

- A researcher-readable `label`.
- A useful `description`, not just a restatement of the label.
- `source_id` when a source supports the descriptor.

Keep descriptors broad enough to scan. Do not create one descriptor per table unless table-level detail is essential.

## Metrics

Use `system_metrics` for quantitative claims.

Required metrics when sourceable:

- `record_count`: number of database records, rows, observations, taxa, files, or other native records. Explain the native counting unit in `unit` and `description`.
- `storage_size_bytes`: total size in bytes. Explain exactly what was measured, such as full database dump, public parquet snapshot, compressed archive, API export, image archive, or object-storage prefix.

Useful usage metrics:

- `publication_count`: publications or references using/citing the database.
- `citation_count`: citation count from a named index or study.
- `view_count`: website views or visits.
- `download_count`: downloads.
- `registered_user_count`: registered users.
- `contributor_count`: collaborators, contributors, submitters, or providers.

Rules:

- Every metric must have a required `source_id`.
- Use `observed_at` for the date or version the number refers to.
- Use `description` to capture caveats, such as "compressed public snapshot, not live production DB".
- Store storage in bytes even if the source reports MB/GB/TB. Convert carefully and describe the original source measurement.
- If a metric cannot be found, do not invent it. Leave it absent and mention the gap in notes or final summary.

## Access Paths

Use `system_access_paths` for all user access and submission paths. Access and submission are intentionally merged here.

Every access path must have:

- `access_type`: `read`, `submit`, `partner_sync`, or `none`.
- `method`: lower_snake_case description of the access mechanism.
- `label`: short human-readable label.
- `url`: direct portal, docs, contact, download, API, or terms page.
- `description`: how access is handled, including account/API key, application, payment, free access, limitations, and whether data are static snapshots.
- `source_id`: required source row with a URL.

Use `none` only for negative or limiting access facts, such as "no public write API" or "commercial reuse requires contact".

Do not create separate submission tables. Put contribution, upload, contact, and partner-ingest workflows in `system_access_paths` with `access_type='submit'` or `partner_sync`.

## Ryu Routes

Use `ryu` only for approved machine access routes. `system_access_paths` says what human, researcher, source, submission, and technical access exists; `systemNode.ryu.routes` says how an agent or machine runtime should actually retrieve data for a task.

Store `ryu` under `entities.properties_json` on the system entity:

```json
{
  "ryu": {
    "routes": [
      {
        "id": "oa-fishbase-snapshot",
        "status": "planned",
        "mode": "self_hosted_snapshot",
        "priority": 1,
        "capabilities": ["species_profile", "occurrence_locations"],
        "target": "deeptime-fishbase",
        "upstream": "sourcecoop:cboettig/fishbase",
        "format": "parquet",
        "contractRef": "mcp://deeptime-fishbase",
        "caveat": "snapshot; no live FishBase API"
      }
    ]
  }
}
```

Route fields:

- `id`: stable lower-kebab-case route id.
- `status`: route readiness, usually `active`, `planned`, `deprecated`, or `blocked`.
- `mode`: machine access pattern, such as `live_api`, `self_hosted_snapshot`, `hosted_snapshot`, `oa_cache`, `mcp`, or `unavailable`.
- `priority`: lower number means preferred.
- `capabilities`: task-level affordances, such as `species_profile`, `occurrence_locations`, `dataset_search`, `metadata_lookup`, `file_download`, or `submission_status`.
- `target`: our runtime, service, MCP server, cache, or tool target.
- `upstream`: concise upstream locator, such as a domain, API base, bucket/prefix, repository, or source alias.
- `format`: main data/interface format, such as `json`, `geojson`, `parquet`, `csv`, `darwin_core_archive`, or `html`.
- `contractRef`: pointer to the real contract, docs, MCP server, OpenAPI spec, or service notes. Do not inline the contract in `ryu`.
- `caveat`: one short operational warning.

Research rules:

- Add a route only when the research establishes a concrete machine access path that an agent runtime should use.
- Use `status='planned'` when the route is intentional but not yet live. Planned routes are indexes for future implementation, not runtime access.
- Multiple routes are allowed; order them with `priority`.
- Prefer an OA-controlled runtime route when production use needs stable performance, joins, caching, credentials, or map-ready transforms.
- Use `contractRef` as an index pointer. Tool names, schemas, auth flows, rate limits, and endpoint contracts live outside the node.
- Do not add human lookup, browser UI, manual request, or researcher-client routes to `ryu`; keep those in `system_access_paths`.
- Do not add raw upstream storage as a separate `ryu` route when our runtime is a derived cache or MCP service. Mention the upstream on the machine route instead.
- Do not treat an SDK, package, notebook, or R/Python client as a `ryu` route unless it is the actual agent runtime contract.
- If there is no approved operational route, leave `routes` empty.
- Keep route claims grounded in sourced profile/access-path research; `ryu` itself stays compact and unsourced.

## Gallery Images

Gallery images should be local, stable, and useful. Avoid blocked iframes and decorative screenshots.

Storage convention:

- Store assets under `client/public/system-gallery/<system-id>/`.
- Use one high-resolution file and one thumbnail per gallery item.
- Recommended filenames:
  - `<capture-name>-high.png`
  - `<capture-name>-thumb.png`
- Recommended capture size for screenshots: `1440x900`.
- Recommended thumbnail size: `640x400`.

DB convention:

- `system_gallery_items.item_type = 'image'`.
- `url` points to the local high-resolution public path, such as `/system-gallery/system-fishbase/home-high.png`.
- `thumbnail_url` points to the local thumbnail public path.
- `source_id` points to the original page or data portal that the capture represents.
- `caption` should say what the image demonstrates.

Use `item_type='embed'` only when the target site works reliably in an iframe. If an embed renders as a grey or blank square, replace it with local image captures.

Choose images that show what kinds of data the database contains and how those data are structured. The gallery should visually answer what a researcher or ocean stakeholder can expect to find in the system, not merely how to use the website.

Prioritize screenshots in this order:

- Representative record pages that expose the native record shape, fields, identifiers, media, maps, citations, measurements, or linked sub-records.
- Dataset, sample, sequence, station, cruise, taxon, observation, model-product, or publication pages that show the system's core entity types.
- Data explorers, maps, dashboards, table browsers, schema pages, API docs, download listings, object-storage listings, or package docs when they reveal data categories, formats, products, variables, file sizes, or access constraints.
- Search or catalogue pages when they reveal how the database organizes its content, such as accepted identifiers, controlled vocabularies, query dimensions, taxonomic indexes, geography, time, parameters, or dataset facets.
- Homepage or portal overview screenshots only when they provide meaningful scope, data-volume, governance, or product-family context that is not better shown elsewhere.
- Sample media from the database only when the media itself is a primary data type and rights plus hotlink/download behavior are acceptable.

Avoid login, signup, contact, or API-key screens unless they explain a material constraint on who can access, submit, or reuse the data.

Do not keep weak gallery items just to fill space. Two good images are better than four poor ones.

## Identifiers

Use `system_identifier_schemes` for internal identifiers, accession schemes, dataset IDs, species IDs, record IDs, reference numbers, or globally recognized names used to join or cite records.

Each identifier should explain:

- The scheme name.
- What it applies to.
- How it is used in the database.
- Source, when sourceable.

## Updating The DB

Use a single SQLite transaction for each system backfill when practical.

Recommended order:

1. Upsert `sources`.
2. Upsert any new `entities` for operators.
3. Update `relationships` for operator/governance links.
4. Upsert `system_profiles`.
5. Replace system-specific descriptors, access paths, gallery rows, identifiers, and metrics.
6. Update `entities.properties_json.ryu` when the system has an approved operational route.
7. Regenerate `client/public/bootstrap.public.json`.
8. Run validation.

Use replacement carefully:

- It is fine to `DELETE FROM system_data_descriptors WHERE system_id=...` before inserting a rewritten descriptor set.
- It is fine to replace all gallery rows for a system when improving image choices.
- Do not delete unrelated rows for other systems.
- Do not change existing user or agent work outside the target system unless required by a proven correction.

## Validation Checklist

Run these checks before finishing:

```sh
sqlite3 data/chm-network.sqlite "PRAGMA foreign_key_check;"
npm --workspace server run export:public
npm run build:public
```

For the target system, also check:

```sh
sqlite3 -header -column data/chm-network.sqlite \
  "SELECT * FROM system_profiles WHERE system_id='<system-id>';"

sqlite3 -header -column data/chm-network.sqlite \
  "SELECT access_type, method, label, url, source_id FROM system_access_paths WHERE system_id='<system-id>' ORDER BY access_type, method;"

sqlite3 -header -column data/chm-network.sqlite \
  "SELECT metric_key, value_numeric, unit, observed_at, source_id FROM system_metrics WHERE system_id='<system-id>' ORDER BY metric_key;"

sqlite3 -header -column data/chm-network.sqlite \
  "SELECT item_type, url, thumbnail_url, title, source_id FROM system_gallery_items WHERE system_id='<system-id>' ORDER BY sort_order;"

sqlite3 -json data/chm-network.sqlite \
  "SELECT json_extract(properties_json, '$.ryu') AS ryu FROM entities WHERE id='<system-id>';"
```

For every URL returned by the access-path query, run an HTTP or browser reachability check and fix failures before handing off.

Confirm:

- Required access URLs, descriptions, and sources are present.
- Required metric sources are present.
- Gallery local files exist for every local `url` and `thumbnail_url`.
- The public bootstrap exports the same values you expect from SQLite.

## Final Summary For Users

When reporting a completed backfill, include:

- What system was updated.
- Main profile improvements.
- Counts of descriptors, access paths, gallery items, identifiers, and metrics.
- The most important sourced metrics.
- Any caveats, especially about approximate counts, snapshot-vs-live sizes, or missing usage data.
- Validation commands that passed.

Keep the summary factual and short. Do not paste the entire record unless requested.
