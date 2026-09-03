# Language Migration Plan

Draft date: 2026-08-31

## Purpose

Prepare Explorer/Ryu records for United Nations CHM multilingual requirements without overbuilding the data model.

The plan is to make record content localizable and reviewable per language, while keeping operational data in its existing tables.

This is a pre-launch data-model correction, not a compatibility migration for a live public product. Do not keep awkward bridges to the current record shape. The implementation should remove obsolete node-level text and review fields in the same coordinated change that introduces localization rows.

## Implementation Tracker

Use this checklist to track the one-go implementation.

- [x] Confirm current repo schema and representative bootstrap JSON shapes.
- [x] Confirm production Cloud SQL schema immediately before the migration job runs.
- [x] Add a checked-in migration runner for this change.
- [x] Add hardened `supported_locales` and `node_localizations` DDL.
- [x] Backfill one source localization per node.
- [x] Remove node-level `name`, `summary`, `description`, `details_json`, `review_state`, and `review_json`.
- [x] Move all user-facing record text and review fields to `node_localizations`.
- [x] Remove identifiers from the record model, UI, search, and reviewer docs.
- [x] Normalize access types to `read`, `submit`, and `partner_sync`.
- [x] Split Access presentation into read and write/contribution groups.
- [x] Replace the long-term `GraphNode` API/client contract with language-neutral nodes plus resolved localizations.
- [x] Add localization-aware review writes from the start.
- [x] Implement locale-aware search over resolved display localizations, with optional all-language search.
- [x] Regenerate the public bootstrap from the migrated local export artifact.
- [x] Build and test locally.
- [x] Run the Cloud Run migration job, deploy, and smoke test production.

Implementation status on 2026-09-01:

- Main branch commit `226fc2c` contains the local schema, API, client, search, bootstrap, CHM proxy, and documentation changes.
- The checked-in migration command is `npm --workspace server run migrate:language`.
- Cloud SQL backup `1788227781465` was created before the destructive migration.
- Cloud Run job execution `explorer-lang-migration-226fc2c-klgm5` completed successfully and backfilled `117` localization rows.
- Terraform rolled `explorer`, `explorer-admin`, `explorer-api`, and CHM to the language-migration images, and a final Terraform plan reported no changes.
- Public smoke checks passed for `https://chm.oceanagentics.org/explorer/`, `https://chm.oceanagentics.com/explorer/`, and both public bootstrap API hostnames. The public bootstrap returned `117` nodes, `139` edges, `102` sources, `0` redacted routes, no obsolete node text fields, no reviewer metadata, and only `read`, `submit`, and `partner_sync` access types.
- Internal private-API smoke execution `explorer-api-smoke-226fc2c-ncg2h` reached the new localization review endpoint as `chm-sa` and received the expected `401 missing_chm_user_context` guard response. The temporary migration and smoke jobs were deleted after verification.

## Language Policy

The six official UN languages should be first-class supported languages:

| Locale | Language | Direction |
| --- | --- | --- |
| `ar` | Arabic | RTL |
| `zh` | Chinese | LTR |
| `en` | English | LTR |
| `fr` | French | LTR |
| `ru` | Russian | LTR |
| `es` | Spanish | LTR |

Use BCP 47 language tags everywhere. Use `zh` as the application locale key for Chinese to match CBD-facing Clearing-House routes and APIs. If a browser or metadata layer needs script-specific output later, handle that separately without changing the stored locale key.

Policy decisions:

- The canonical node is not English. It is the stable, language-neutral record identity.
- English is one localization among others.
- Original source text should be preserved as a localization row.
- Official six-language content should be stored, reviewed, searchable, and auditable.
- On-demand machine translation can be available for reading convenience, but it is unofficial and not stored by default.
- Arabic RTL readiness should be part of early UI planning.

Reference context:

- UN official languages: https://www.un.org/en/our-work/official-languages
- UN multilingualism web standards: https://www.un.org/en/multilingualism-web-standards
- UNTERM: https://unterm.un.org/
- W3C language tags: https://www.w3.org/International/articles/language-tags/index.en
- CBD developer hub: https://developer.cbd.int/

## Current Known Shape

The local migration notes and Ryu schema list these deployed tables:

```text
nodes
edges
ryu_routes
saved_views
sources
```

The current review path appears to update node-level review fields:

```text
reviewState
reviewerNote
reviewer
lastReviewed
```

The current Ryu schema stores user-facing record content directly on `nodes`:

```text
nodes.name
nodes.url
nodes.summary
nodes.description
nodes.review_state
nodes.review_json
nodes.details_json
nodes.properties_json
```

`details_json` currently contains rich record sections such as:

```text
aliases
role
disciplineFamily
geographicScope
gallery
data
access
identifiers
usage
```

Before implementation, confirm the production schema and representative `details_json` values from Cloud SQL. Treat the Ryu repo schema as the reference, but verify production before applying a database migration.

## Architecture Boundary

This work belongs primarily in the Ryu repo.

Ryu owns:

- Cloud SQL/Postgres schema for Explorer/Ryu data.
- `nodes`, `edges`, `sources`, `ryu_routes`, and `saved_views`.
- `node_localizations` migration and backfill.
- Details-panel rendering.
- Systems search/filter behavior.
- Public bootstrap export.
- Ryu API response shape.

CHM owns:

- Public entry path and IAP.
- Proxying the narrow review write path to private Explorer/Ryu.
- Any proxy update needed for localization-level review, such as:

```text
PATCH /api/explorer/nodes/:id/localizations/:locale/review
```

Do not make production data edits by hand from CHM unless they are part of a deliberate Ryu migration runbook.

## Localization Coverage API

Localization coverage is now part of SQL-backed record search, not a separate
coverage endpoint. Use `GET /api/records` with:

- `localeAvailability=available`: the requested `locale` row exists.
- `localeAvailability=missing`: the requested `locale` row does not exist.
- `localeAvailability=partial`: at least one supported locale is missing.
- `localeAvailability=complete`: all supported locales exist.

Use `reviewLocale=requested`, `reviewLocale=displayed`, or `reviewLocale=any`
with `reviewState` to decide which localization row is checked. Example:

```text
GET /api/records?locale=fr&localeAvailability=missing&reviewState=agent_researched&reviewLocale=displayed&include=localizationSummary
```

## Target Model

Keep the model to two record-content tables:

```text
nodes
node_localizations
```

Add one small reference table for supported locale validation:

```text
supported_locales
```

`supported_locales` is configuration data, not record content. It constrains the BCP 47 tags the application officially supports.

Other existing tables stay in place:

```text
edges
ryu_routes
saved_views
sources
```

Do not add a generic `facts_json` table or column. If data already has a home, it stays there.

Do not add a separate `reviews` table for this migration. Review moves from the node level to the localization level.

Do not add an alias/name table. The localized record name is `node_localizations.title`.

## Execution Strategy

Do this as a Ryu-owned migration, not as ad hoc JSON cleanup.

Implementation unit:

- One Ryu branch.
- One schema migration for `supported_locales` and `node_localizations`.
- One data backfill/cleanup migration.
- One app/API contract update that stops exposing node-level record text.
- One localization-aware review-write update.
- One public-bootstrap export update.
- One CHM proxy update for the localization-level review endpoint.

This is one coordinated cutover. Do not implement dual-read compatibility, keep node text fields as fallbacks, or retain deprecated node columns for a later cleanup. If the public/admin app is briefly unavailable during the cutover, that is acceptable before launch and cleaner than carrying obsolete contracts forward.

Recommended production execution:

1. Build and test the Ryu change locally against a disposable Postgres database or a production snapshot.
2. Run the migration against staging or a copied database first.
3. Build an immutable Explorer image containing the migration code.
4. Run a short-lived Cloud Run migration job from that image.
5. Configure the job with the same Cloud SQL and VPC shape as the working Explorer services.
6. Run preflight counts, the migration transaction, and postflight counts in the same job.
7. Drop obsolete node-level text and review columns in the same migration transaction after successful backfill.
8. Export the public bootstrap after the database is updated.
9. Deploy the app version that reads from `node_localizations`.
10. Smoke test the browser UI, Ryu API, and CHM proxy review path.
11. Delete the temporary migration job after success.

The Cloud Run job must match the deployed service network posture:

```text
Cloud SQL instance: chm-network:us-east4:chm
PGHOST: /cloudsql/chm-network:us-east4:chm
PGDATABASE: explorer
VPC network/subnetwork: same as explorer / explorer-api
VPC egress: same as explorer / explorer-api
Service account: migration-capable service account
```

Use roles deliberately:

```text
explorer_schema_admin -> schema changes only
explorer_write        -> data cleanup / backfill only
explorer_read         -> verification reads only
```

The earlier one-off cleanup attempt did not modify the database because the job could not connect to Cloud SQL before running SQL. Future migration jobs should be created from a checked-in runbook or migration command and should explicitly copy the known-working Cloud Run VPC configuration.

## Database Cleanup In This Migration

The first localization migration should also clean up record JSON that we have already decided not to carry forward.

Cleanup items:

- Remove `details_json.identifiers`.
- Remove the `Identifiers` UI section.
- Remove identifier-specific search fields and filters.
- Remove identifier-specific documentation guidance after the data migration is complete.
- Normalize `details_json.access[].type` while moving access mechanics to `nodes.properties_json.access`.
- Split Access presentation into read and write/contribution groups.

Do not modify these tables in the first localization migration unless a verified bug requires it:

```text
edges
ryu_routes
saved_views
sources
```

Identifier cleanup rule:

```sql
details_json = details_json - 'identifiers'
```

Access cleanup rule:

```text
read         -> read
submit       -> submit
partner_sync -> partner_sync
service      -> read
documentation -> read
download     -> read
none         -> delete
```

Preserve the specific access mechanism in `method` or `label`; do not encode it in `type`.

Examples:

```text
type = read
method = documentation

type = read
method = download

type = read
method = web_service
```

Preflight checks:

```sql
SELECT count(*) FROM nodes WHERE details_json ? 'identifiers';
SELECT access_path->>'type' AS type, count(*)
FROM nodes,
LATERAL jsonb_array_elements(details_json->'access') AS access_path
WHERE jsonb_typeof(details_json->'access') = 'array'
GROUP BY access_path->>'type'
ORDER BY count(*) DESC, type;
```

Postflight checks:

```sql
SELECT count(*) FROM node_localizations WHERE details_json ? 'identifiers';
SELECT access_path->>'type' AS type, count(*)
FROM nodes,
LATERAL jsonb_array_elements(properties_json->'access') AS access_path
WHERE jsonb_typeof(properties_json->'access') = 'array'
GROUP BY access_path->>'type'
ORDER BY count(*) DESC, type;
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'nodes'
  AND column_name IN ('name', 'summary', 'description', 'details_json', 'review_state', 'review_json');
```

The expected postflight access types are:

```text
read
submit
partner_sync
```

The expected obsolete-column query result is zero rows.

## Proposed Table Shape

### `supported_locales`

Use a constrained supported-locale table so stored locale values are canonical and cannot drift into case variants or unsupported tags.

```sql
CREATE TABLE supported_locales (
  locale TEXT PRIMARY KEY
    CHECK (locale IN ('ar', 'zh', 'en', 'fr', 'ru', 'es')),
  language_name TEXT NOT NULL CHECK (btrim(language_name) <> ''),
  direction TEXT NOT NULL CHECK (direction IN ('ltr', 'rtl')),
  sort_order INTEGER NOT NULL UNIQUE CHECK (sort_order > 0)
);

INSERT INTO supported_locales (locale, language_name, direction, sort_order)
VALUES
  ('ar', 'Arabic', 'rtl', 10),
  ('zh', 'Chinese', 'ltr', 20),
  ('en', 'English', 'ltr', 30),
  ('fr', 'French', 'ltr', 40),
  ('ru', 'Russian', 'ltr', 50),
  ('es', 'Spanish', 'ltr', 60);
```

Application writes should use exactly these canonical tags.

### `nodes`

`nodes` should become the stable language-neutral record table.

Keep:

```text
id
kind
country_code
subtype
url
record_depth, unless we later decide depth is localization-specific
properties_json
created_at / updated_at, if already present
```

Move out of `nodes`:

```text
name / label / title
summary
description
details_json
review_state
review_json
```

After this migration, do not retain those moved fields as nullable legacy columns. They are obsolete. The app should fail schema checks if new code casually reaches for `nodes.name`, `nodes.summary`, `nodes.description`, `nodes.details_json`, or `nodes.review_state`.

Do not add:

```text
facts_json
source_locale
translation_method
terminology_source
translated_from_hash
```

Long-term `GraphNode` contract:

```text
id
kind
countryCode
subtype
url
recordDepth
properties
createdAt
updatedAt
localizations
availableLocales
requestedLocale
displayLocale
isLocaleFallback
```

The UI must resolve the active localization before rendering display text. It should not treat node identity as a display name. If no localization can be resolved, use the node id only as a last-resort label.

Obsolete node column removal:

```sql
DROP INDEX IF EXISTS idx_nodes_review_state;

ALTER TABLE nodes
  DROP COLUMN name,
  DROP COLUMN summary,
  DROP COLUMN description,
  DROP COLUMN review_state,
  DROP COLUMN review_json,
  DROP COLUMN details_json;
```

After this migration, queries that need display ordering should order by the resolved localization title and then `nodes.id`.

### `node_localizations`

Proposed lean structure:

```text
node_id
locale
title
summary
description
details_json
source_excerpt
translated_from_locale
content_updated_at
review_state
reviewer_note
reviewer
last_reviewed
created_at
updated_at
PRIMARY KEY (node_id, locale)
```

Draft SQL shape:

```sql
CREATE TABLE node_localizations (
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  locale TEXT NOT NULL REFERENCES supported_locales(locale),
  title TEXT NOT NULL CHECK (btrim(title) <> ''),
  summary TEXT,
  description TEXT,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_excerpt TEXT,
  translated_from_locale TEXT REFERENCES supported_locales(locale)
    CHECK (translated_from_locale IS NULL OR translated_from_locale <> locale),
  content_updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  review_state TEXT NOT NULL DEFAULT 'agent_researched'
    CHECK (review_state IN ('agent_researched', 'human_reviewed', 'needs_revision')),
  reviewer_note TEXT,
  reviewer TEXT,
  last_reviewed TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (node_id, locale)
);

CREATE INDEX idx_node_localizations_locale
  ON node_localizations (locale);

CREATE INDEX idx_node_localizations_review_state
  ON node_localizations (review_state);

CREATE INDEX idx_node_localizations_locale_review_state
  ON node_localizations (locale, review_state);

CREATE OR REPLACE FUNCTION set_node_localization_content_updated_at()
RETURNS trigger AS $$
BEGIN
  IF NEW.title IS DISTINCT FROM OLD.title
    OR NEW.summary IS DISTINCT FROM OLD.summary
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.details_json IS DISTINCT FROM OLD.details_json
    OR NEW.source_excerpt IS DISTINCT FROM OLD.source_excerpt
    OR NEW.translated_from_locale IS DISTINCT FROM OLD.translated_from_locale THEN
    NEW.content_updated_at = CURRENT_TIMESTAMP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_node_localizations_content_updated_at ON node_localizations;
CREATE TRIGGER trg_node_localizations_content_updated_at
BEFORE UPDATE ON node_localizations
FOR EACH ROW
EXECUTE FUNCTION set_node_localization_content_updated_at();

DROP TRIGGER IF EXISTS trg_node_localizations_updated_at ON node_localizations;
CREATE TRIGGER trg_node_localizations_updated_at
BEFORE UPDATE ON node_localizations
FOR EACH ROW
WHEN (NEW.updated_at = OLD.updated_at)
EXECUTE FUNCTION set_updated_at_timestamp();

GRANT SELECT ON supported_locales, node_localizations TO explorer_read;
GRANT SELECT ON supported_locales TO explorer_write;
GRANT SELECT, INSERT, UPDATE, DELETE ON node_localizations TO explorer_write;
GRANT ALL PRIVILEGES ON supported_locales, node_localizations TO explorer_schema_admin;
```

Use the project's existing naming conventions when implementing. If the current database uses camelCase column names, adapt the proposed snake_case names to match the local pattern.

The migration runner must confirm the prerequisite `set_updated_at_timestamp()` trigger function exists before applying this DDL, or create it with the same definition used by the current schema. Do not leave this as an implicit assumption inside a destructive migration.

## Meaning of `translated_from_locale`

`translated_from_locale` means the language this localization was translated from.

Examples:

```text
node_id   locale    translated_from_locale
fishbase  en        null
fishbase  fr        en
fishbase  es        en
fishbase  ar        en
fishbase  ru        en
fishbase  zh        en
```

No separate source-locale field is needed on `nodes`.

If a localization is original source text, `translated_from_locale` can be null.

Each localization row has language-scoped timestamps. Use `node_localizations.content_updated_at` for translation freshness and `node_localizations.updated_at` only as row-level audit time.

If a target localization has `translated_from_locale = 'en'` and the English localization's `content_updated_at` is later than the target localization's `content_updated_at`, the target localization should be treated as potentially stale and surfaced for review.

Review-only writes should update review fields, `last_reviewed`, and row-level `updated_at`, but they should not update `content_updated_at`. A reviewer changing a note must not make translated content appear current.

Do not add a separate translated-from date or source hash in this migration.

## Details JSON Migration

Do not assume all of `details_json` should be localized.

`details_json` is currently a mixed legacy container. Some values are localized prose, and some values are operational facts. This migration must classify the current keys and move each value to its correct long-term home.

Do not preserve `nodes.details_json` as a fallback and do not copy the entire object into English as a permanent shape. During the backfill, delete obsolete identifier data, keep localized prose in `node_localizations.details_json`, and move language-neutral operational facts into `nodes.properties_json` unless they already have a better existing table.

This migration should not split `details_json` into newly invented storage buckets unless the classification shows a clear existing home, such as `edges`, `ryu_routes`, `saved_views`, `sources`, or `nodes.properties_json`.

Current user-facing sections likely include:

```text
Aliases
Access
Ryu
Usage
Connections
```

Target rule:

- If the value is translated prose, it belongs in `node_localizations.details_json`.
- If the value already belongs in `edges`, `ryu_routes`, `saved_views`, or `sources`, leave it there.
- If the value is an operational route, source, saved-view, or connection fact, do not duplicate it across languages unless it currently only exists as prose inside `details_json`.
- Delete identifier-specific data during this migration.

Recommended field split:

| Current `details_json` key | Recommended home | Notes |
| --- | --- | --- |
| `aliases` | `node_localizations.details_json.aliases` | Localize aliases by default. Acronyms and stable names are not always language-neutral. |
| `operator` | `edges.kind = 'operates'` plus organization `node_localizations.title` | The relationship is language-neutral graph structure; the displayed organization name is localized record text. Do not store or read `nodes.properties_json.operator.name`. |
| `role` | `nodes.properties_json.role` | Stable classification/facet. |
| `disciplineFamily` | `nodes.properties_json.disciplineFamily` | Stable classification/facet. |
| `geographicScope` | `nodes.properties_json.geographicScope` or structured node fields | Location/scope is an operational fact; UI labels can be localized separately. |
| `gallery` | Asset refs in `nodes.properties_json.gallery`; captions/alt text in `node_localizations.details_json.gallery` | URLs, asset ids, source refs, and ordering are operational. Captions and alt text are localized. |
| `data` | Structured descriptors in `nodes.properties_json.data`; descriptions/caveats in `node_localizations.details_json.data` | Formats, standards, categories, and source refs are operational. Prose is localized. |
| `access` | Type/method/url/auth/source refs in `nodes.properties_json.access`; instructions/caveats in `node_localizations.details_json.access` | Access mechanics are operational. User guidance is localized. |
| `identifiers` | Remove during this migration | Do not carry into the localized record surface or preserve as alternate data descriptors in this migration. |
| `usage` | Metrics/status in `nodes.properties_json.usage`; guidance/narrative in `node_localizations.details_json.usage` | Counts and status are operational. Explanation and guidance are localized. |

Before writing the transform, define the exact TypeScript shape expected inside `nodes.properties_json` for the neutral subsets this migration owns:

```text
operator
role
disciplineFamily
geographicScope
gallery
data
access
usage
```

Do not replace the old `node.details.*` contract with scattered untyped `node.properties.*` reads. Shared domain types or narrow accessors should describe this neutral shape before UI, search, and portal code consume it.

## Where Existing Sections Live

### Aliases

Localize aliases and keep them in `node_localizations.details_json.aliases`.

Do not assume acronyms, abbreviations, or stable names are language-neutral. If an alias is intentionally shared across languages, repeat it in each localization that should display it.

### Access

Move access mechanics from node-level `details_json` into `nodes.properties_json.access`.

Move localized Access prose from node-level `details_json` into `node_localizations.details_json.access`, linked by access row id where a neutral mechanics row exists.

As part of the localization migration, split the current Access presentation into:

```text
Read access
Write / contribution access
```

The access structure can stay array-based. The split is a storage, rendering, and content-cleanup rule:

```text
type = read          -> Read access
type = submit        -> Write / contribution access
type = partner_sync  -> Write / contribution access
type = none          -> Delete during migration
```

Access postflight validation should check:

- Neutral access rows in `nodes.properties_json.access[]` have unique ids per node.
- Localized access rows in `node_localizations.details_json.access[]` reference an existing neutral access id when an id is present.
- Neutral access rows carry mechanics such as type, method, url, auth, and source refs, not localized labels or instructions.
- Localized access rows carry labels, instructions, caveats, and other prose, not mechanics.
- No `none`, `service`, `documentation`, or `download` access type remains after normalization.

The shared TypeScript domain currently defines `SystemAccessType` as:

```text
read
submit
partner_sync
none
```

After the migration, remove `none` from the TypeScript access type.

The exported bootstrap should be audited for older access type values before migration. Any legacy values such as `service`, `documentation`, or `download` should be normalized into `read`, with the more specific detail preserved in `method` or `label`.

Examples of localized Access prose:

```text
access overview
access instructions
access caveats
```

### Ryu

Keep route records in `ryu_routes`.

Move only localized Ryu prose from node-level `details_json` into `node_localizations.details_json`.

Do not change `ryu_routes` in the first node-localization migration unless schema inspection shows it contains user-facing translated prose.

### Usage

Keep usage data wherever it already lives.

Move localized usage guidance, caveats, or narrative descriptions into `node_localizations.details_json`.

### Connections

Keep graph relationships in `edges`.

Move localized connection summaries or explanations into `node_localizations.details_json`.

### Sources

Keep source records in `sources`.

Localized source excerpts for a node can live in `node_localizations.source_excerpt`.

## Review Model

Review should move to the localization level.

Instead of reviewing the node as a whole:

```text
nodes.review_state
nodes.review_json
```

Review each language version:

```text
node_localizations.review_state
node_localizations.reviewer_note
node_localizations.reviewer
node_localizations.last_reviewed
```

`review_state` sits on `node_localizations`, not on the language-neutral `nodes` row. API responses can expose it as `reviewState` to match the existing camelCase contract.

If current review metadata is stored inside `nodes.review_json`, split the existing note, reviewer, and timestamp values into `node_localizations.reviewer_note`, `node_localizations.reviewer`, and `node_localizations.last_reviewed` during backfill. Keep the API names `reviewState`, `reviewerNote`, `reviewer`, and `lastReviewed` as JSON field names for localization objects, not as node-level fields.

The review write endpoint should be localization-aware from the start:

```text
PATCH /api/records/:id/review
```

The request body contains `locale`, `reviewState`, and `reviewerNote`.
Explorer sets `reviewer` from direct IAP identity or token owner and sets
`lastReviewed` server-side. Do not keep the old node-level review endpoint as a
long-term path.

Use the current review-state values:

```text
agent_researched
human_reviewed
needs_revision
```

At the database layer, type this as constrained text unless the project already has a reusable database enum pattern. At the TypeScript/API layer, use the existing review-state type or an equivalent literal union:

```ts
type ReviewState = "agent_researched" | "human_reviewed" | "needs_revision";
```

Meaning:

- `agent_researched`: content exists but has not completed human review.
- `human_reviewed`: content has completed human review.
- `needs_revision`: content is known to need correction or follow-up.

Do not introduce `approved`, `published`, or `needs_review` unless the current application contract changes.

Public Explorer reads are not gated by review state. There is no publish/draft concept in this migration. Review state is a quality, readiness, and audit signal, not a visibility switch.

A localization is UN-ready when its `review_state` is `human_reviewed`.

A node is complete for the six official UN languages when these localization rows are present and `human_reviewed`:

```text
ar
zh
en
fr
ru
es
```

## API Shape

The internal database should use normalized rows.

The API should expose language-neutral nodes plus localization records. It should not expose `node.name`, `node.summary`, `node.description`, or node-level `reviewState` in the long-term `GraphNode` contract.

Example node response shape:

```json
{
  "id": "fishbase",
  "kind": "system",
  "countryCode": null,
  "subtype": "source_database",
  "url": "https://fishbase.se/",
  "recordDepth": "rich",
  "properties": {},
  "requestedLocale": "fr",
  "displayLocale": "en",
  "isLocaleFallback": true,
  "availableLocales": ["en", "fr"],
  "localizations": {
    "en": {
      "title": "FishBase",
      "summary": "...",
      "description": "...",
      "details": {},
      "sourceExcerpt": null,
      "translatedFromLocale": null,
      "contentUpdatedAt": "2026-08-31T19:45:32.457Z",
      "reviewState": "human_reviewed",
      "reviewerNote": null,
      "reviewer": null,
      "lastReviewed": null
    },
    "fr": {
      "title": "FishBase",
      "summary": "...",
      "description": "...",
      "details": {},
      "sourceExcerpt": null,
      "reviewState": "agent_researched",
      "translatedFromLocale": "en"
    }
  }
}
```

Recommended localization resolution behavior:

1. Try requested UI locale.
2. Fall back to English if available.
3. Fall back to the first available localization.
4. Fall back to node id as the last-resort label.

The UI should clearly show which language is being displayed if a fallback is used. Showing English under a French locale has review implications and must be visible rather than silent. Because public reads return available data regardless of review state, the UI should not imply that non-`human_reviewed` content is hidden.

Public redaction still applies. Public payloads may expose `reviewState`, but reviewer notes, reviewer identity, and last-reviewed timestamps should be redacted unless the request is authenticated for author/reviewer use.

## Search Migration

Treat search as a localization-aware index over localization rows plus language-neutral facets.

Ground-up search model:

- Search documents are keyed by `(node_id, locale)`.
- Localized text comes only from `node_localizations`.
- Language-neutral filters and facets come from `nodes`, `edges`, `ryu_routes`, and `nodes.properties_json`.
- Browse/list views resolve the displayed localization for each node with the same fallback chain used by details and graph labels.
- Query matching in default mode searches the resolved display localization for each node, not only rows whose locale equals the requested UI locale.
- If the UI is in French and a node only has English, default search may match that English localization because English is the visible fallback for that node.
- Default search should not silently match a non-displayed localization. It searches one displayed document per node; all-language mode is the explicit path for searching additional stored localizations.
- Optional "search all languages" mode may search every stored localization and must report which locale matched.
- Search results must carry both `displayLocale` and `matchedLocale`.

For the first release, keep the current bootstrap/client-side search model if record count remains small, but rebuild it around explicit localization search documents:

- Language-neutral fields from `nodes` and other operational tables: `id`, `kind`, `subtype`, `country_code`, `record_depth`, route status, access types, and stable facet codes.
- Localized fields from `node_localizations`: `title`, `summary`, `description`, localized details prose, `locale`, and `review_state`.
- Display metadata: requested locale, displayed locale, matched locale, fallback state, and available locales.

Example projection:

```json
{
  "nodeId": "fishbase",
  "requestedLocale": "fr",
  "locale": "en",
  "title": "English fallback title",
  "searchText": "...",
  "matchedLocale": "en",
  "displayLocale": "en",
  "isLocaleFallback": true,
  "facets": {
    "kind": "source_database",
    "countryCode": null,
    "accessTypes": ["read"],
    "reviewState": "agent_researched"
  }
}
```

Search behavior:

1. Resolve one display localization per node by requested locale, English, first available localization, then node id.
2. Search those resolved display localization documents by default.
3. For non-empty queries, match only the displayed localization document for each node in default mode, including English or another fallback when that is what the UI displays.
4. For empty-query browsing, display every node with the same resolved fallback localization.
5. In all-language mode, search all stored localization documents and show the matched locale on every result.
6. Keep filters language-neutral wherever possible.

Tokenizer behavior:

- Use Unicode-aware normalization and tokenization, not ASCII-only token rules.
- Preserve Arabic, Chinese, Cyrillic, accented Latin, and mixed-script names.
- Use locale-aware case folding where available.
- Use `Intl.Segmenter` when running client-side search. For Chinese, segment by word when possible and fall back to short character n-grams if segmentation is unavailable.
- Keep exact node-id matching as a separate language-neutral affordance for reviewer workflows, but do not let id matching stand in for translated record text.

Good first-pass filters:

```text
kind
record_depth
country_code
access.type
review_state
missing locale
route status
```

Avoid localized filter values unless they are message-catalog labels over stable codes.

Remove identifier-specific search with the identifier cleanup. Do not carry `identifiers.scheme` or `identifiers.detail` forward as first-class search fields.

Defer Postgres-backed search until the dataset is too large for the public bootstrap or multi-user API search needs server-side ranking. If needed later, add a view or materialized view over `node_localizations`, keyed by `(node_id, locale)`, with per-locale search vectors or trigram indexes. Do not use one English text-search configuration for all languages.

## Browser Translation

On-demand machine translation can be provided as a reading aid.

Rules:

- Do not store browser translation results by default.
- Do not mark browser translation as reviewed or official.
- Do not index browser translation as official record content.
- Label it clearly as unofficial machine translation.
- Preserve an obvious way to return to the stored reviewed localization.

If using a paid translation API, do not expose provider secrets directly in browser code. Route through a controlled backend endpoint or use browser-native translation where available.

## UI Localization

Record localization is separate from interface localization.

Store interface strings in repo-managed message catalogs, not in `node_localizations`.

Proposed shape:

```text
i18n/
  locales.ts
  messages/
    ar.json
    zh.json
    en.json
    fr.json
    ru.json
    es.json
```

UI localization should cover:

- navigation
- buttons
- filters
- empty states
- validation messages
- review workflow labels
- language switcher
- accessibility labels
- date and number formatting

## Ryu Routes Review Item

`ryu_routes` should be reviewed separately before any language migration touches it.

Questions to answer:

- What columns exist in `ryu_routes` today?
- Which fields are operational facts?
- Which fields are user-facing prose?
- Are route caveats, descriptions, or labels embedded in the route table?
- Are route records shown directly to users, API clients, or both?
- Does route review exist separately from node review?

Expected outcome:

- Route status, mode, priority, target, upstream, formats, contract refs, auth, source refs, and supported tools stay in `ryu_routes`.
- If route-specific display prose needs localization later, add a focused `ryu_route_localizations` table then.
- Do not add route localization until actual route prose requires it.

## Saved Views Review Item

`saved_views` should also be reviewed separately.

Questions to answer:

- What columns exist in `saved_views` today?
- Are saved views system-owned, user-owned, or both?
- Do saved views store user-facing titles or descriptions?
- Do saved views store locale-specific search terms?
- Are saved views part of public CHM content or only internal reviewer workflow?

Expected outcome:

- If saved views only store filters, layout, graph state, or search state, no localization migration is needed.
- If saved views have public titles or descriptions, localize only those fields later.
- Do not block node localization on saved-view localization.

## Cutover Sequence

Do the migration in one coordinated implementation pass.

### Step 1: Confirm Schema And Data

Inspect the real database schema for:

```text
nodes
edges
ryu_routes
saved_views
sources
```

Export representative `details_json` examples and classify fields as:

```text
localized prose
language-neutral operational data
delete
```

Also capture preflight counts for:

```text
nodes with details_json.identifiers
access type values in nodes.details_json.access[]
nodes by review_state
nodes by record_depth
saved_views count
ryu_routes count
```

### Step 2: Implement A Checked-In Migration Runner

Add a Ryu migration path that can be run repeatably and audited.

Because this migration deliberately drops old columns, the runner must have explicit preconditions and an applied-migration guard. Either add a small `schema_migrations` ledger or make the runner fail clearly unless it sees the expected pre-migration shape and no existing partial localization migration.

The migration runner should:

- Print preflight counts.
- Print or record the backup/snapshot identifier that protects the destructive column drop.
- Confirm required trigger functions and roles exist before applying DDL.
- Create `supported_locales`.
- Create `node_localizations`.
- Backfill one source localization row per node.
- Move `name`, `summary`, `description`, `details_json`, and review fields into that localization row.
- Remove `details_json.identifiers` during the backfill.
- Normalize access type values during the backfill.
- Move language-neutral `role`, `disciplineFamily`, `geographicScope`, gallery asset refs, data descriptors, access mechanics, and usage metrics into `nodes.properties_json` unless they already have a better existing table. Model operator relationships with `operates` edges.
- Drop obsolete `nodes.name`, `nodes.summary`, `nodes.description`, `nodes.details_json`, `nodes.review_state`, and `nodes.review_json`.
- Leave `edges`, `ryu_routes`, `saved_views`, and `sources` unchanged unless a preflight-verified bug requires a fix.
- Print postflight counts.
- Fail nonzero if identifiers remain in any migrated localization JSON.
- Fail nonzero if unexpected access types remain.
- Fail nonzero if localized access rows and neutral access rows are inconsistent.
- Leave enough logs to audit which nodes were changed.

The data transform should be written in the Ryu codebase, preferably using the existing Node/Postgres stack, so JSON cleanup rules are visible in code review.

### Step 3: Replace Shared Types And API Contracts

Update shared TypeScript types so `GraphNode` is language-neutral.

Add explicit localization types:

```text
SupportedLocale
NodeLocalization
NodeLocalizationMap
ResolvedNodeLocalization
```

Repository responses should return nodes with `localizations`, `availableLocales`, `requestedLocale`, `displayLocale`, and `isLocaleFallback`. Remove all code paths that read `node.name`, `node.summary`, `node.description`, or `node.reviewState`.

Update portal-facing contracts at the same time. `RyuSystemRecord` and any portal response shape should either become locale-aware or expose resolved localization fields explicitly; do not keep a parallel portal contract that still depends on `name`, `summary`, `description`, or node-level `reviewState`.

Public redaction should operate on localization fields. Public reads can expose localization `reviewState`, but should redact `reviewerNote`, `reviewer`, and `lastReviewed`.

Add tests or fixture checks proving public bootstrap/API responses redact reviewer note, reviewer, and last-reviewed metadata for every localization row, not just the old node-level fields.

### Step 4: Resolve Localizations In The UI

Add a single UI helper for resolving display localization:

```text
requested locale -> English -> first available localization -> node id
```

Every user-facing title, summary, description, details panel field, graph label, directory row, relationship label, and raw record display should use that resolved localization helper. The UI should expose fallback metadata so later copy can say when a record is showing English under a non-English active locale.

Add locale state, a language switcher, date/number formatting hooks, and Arabic RTL smoke coverage in this same implementation pass. Interface message catalogs may start with English-only strings as long as the locale plumbing and direction handling exist.

### Step 5: Move Review Writes To Localizations

Replace node-level review writes with:

```text
PATCH /api/explorer/nodes/:id/localizations/:locale/review
```

Keep request validation restricted to the current review states: `agent_researched`, `human_reviewed`, and `needs_revision`.

Update the CHM proxy path in the same release window. Do not keep the old node-level endpoint as a supported path after the cutover.

### Step 6: Implement Locale-Aware Search

Build search records from `(node_id, locale)` localization documents plus language-neutral facets.

The projection should:

- Use localized `title`, `summary`, `description`, and localized details prose from the resolved display localization for each node.
- Use language-neutral operational fields for filters and facets.
- Search only resolved display localization documents in default query mode.
- Support optional all-language search that reports `matchedLocale`.
- Expose fallback/displayed-locale metadata for result labels.
- Remove identifier-specific search fields.
- Keep current English search behavior equivalent when the active locale is `en`.

### Step 7: Remove Identifier And Split Access UI

Remove the primary user-facing identifier surface:

```text
Details panel -> Identifiers section
Systems filter -> Identifiers
Search fields -> identifiers.scheme and identifiers.detail
Reviewer docs -> guidance requiring details_json.identifiers
```

Render access rows in two groups:

```text
Read access
Write / contribution access
```

Mapping:

```text
read -> Read access
submit -> Write / contribution access
partner_sync -> Write / contribution access
```

Do not preserve or show `none` rows.

### Step 8: Add Official-Language Review Filters

Add reviewer filters for:

```text
missing Arabic
missing Chinese
missing English
missing French
missing Russian
missing Spanish
needs review by locale
human reviewed in all six UN languages
has non-English original localization
```

### Step 9: Export, Deploy, And Smoke Test

Run the checked-in migration through a short-lived Cloud Run job with the known-working Explorer Cloud SQL and VPC configuration.

After success:

- Regenerate/export the public bootstrap.
- Deploy the app version that reads localization rows.
- Smoke test the Details panel, graph labels, Systems search projection, all-language search, Ryu routes, saved views loading, public redaction, Arabic RTL layout, and localization-aware review writes.
- Delete the temporary migration job.

## Identifier Removal Item

Remove `Identifiers` fully from the primary record model during this cleanup.

Current storage:

```text
nodes.details_json.identifiers
```

Current UI:

```text
selected system -> User view -> Identifiers
```

Rationale:

- The section is hard to understand for reviewers.
- Many entries describe external record-key schemes rather than CHM record content.
- Keeping it creates extra translation burden without clear Phase 1 value.

Recommended migration treatment:

- Do not add `identifiers` to the required `node_localizations.details_json` shape.
- Stop rendering the `Identifiers` section in the primary user view.
- Remove `details_json.identifiers` from migrated localized record JSON.
- Remove identifier-specific search fields and filters from the primary Systems search experience.
- Remove identifier-specific references from reviewer-facing documentation after the data migration is complete.

## Access Read/Write Split Item

Split Access into reader-facing and contributor-facing sections.

Current storage:

```text
nodes.details_json.access[]
```

Target storage:

```text
nodes.properties_json.access[] -> id, type, method, url, auth, source refs, other operational mechanics
node_localizations.details_json.access[] -> id, label, instructions, caveats, and other localized prose
```

Recommended UI:

```text
Read access
Write / contribution access
```

This should not require a new table. The existing `type` field is enough for the first pass:

```text
read -> Read access
submit -> Write / contribution access
partner_sync -> Write / contribution access
none -> delete during migration
```

Observed exported data includes these current access type values:

```text
read
submit
partner_sync
none
service
documentation
download
```

The intended post-cleanup values are:

```text
read
submit
partner_sync
```

Migration rule:

```text
read -> read
submit -> submit
partner_sync -> partner_sync
none -> delete
service -> read
documentation -> read
download -> read
```

The specific access mechanism should live in `method`, not `type`. For example:

```text
type = read
method = documentation

type = read
method = download

type = read
method = web_service
```

If the array becomes difficult to manage later, consider reshaping localized details JSON to:

```json
{
  "access": {
    "read": [],
    "write": []
  }
}
```

Do not make that JSON shape change part of this localization migration unless implementation proves it is simpler than preserving the array-based shape.

## Acceptance Criteria

Minimum acceptance:

- Existing records render the same English content after migration.
- `nodes` no longer has `name`, `summary`, `description`, `details_json`, `review_state`, or `review_json`.
- The long-term `GraphNode` contract is language-neutral and does not expose `name`, `summary`, `description`, or node-level `reviewState`.
- A node can have multiple localization rows.
- A localization can be reviewed independently.
- Node-level review no longer exists.
- Existing `edges`, `ryu_routes`, `saved_views`, and `sources` remain unchanged unless a preflight-verified bug requires a fix.
- Localized prose is stored in `node_localizations.details_json`.
- Language-neutral operational facts are stored outside localization rows.
- The UI can show which locale is being viewed.
- The UI can fall back when a requested locale is missing.
- Reviewers can identify missing official UN language rows.
- Public reads are not gated by review state.
- Public read redaction applies to every localization row.
- Default search uses localized text for the resolved display localization per node, including fallback localizations when the requested locale is missing.
- All-language search reports which locale matched.
- Search result fallbacks clearly show the displayed locale and matched locale.
- Search filters use language-neutral operational fields wherever possible.
- Existing English search behavior remains equivalent after the migration.
- `Identifiers` is removed from the localized record surface.
- Identifier-specific filters and search fields are removed from the primary Systems search experience.
- Access can be presented as separate read and write/contribution sections.
- Access type values are normalized to `read`, `submit`, and `partner_sync`; `none` rows are deleted.

UN-readiness acceptance:

- Official supported locales are `ar`, `zh`, `en`, `fr`, `ru`, and `es`.
- Arabic RTL rendering has been smoke-tested.
- Official six-language localizations can be reviewed independently.
- A node is UN-ready when all six official localization rows are `human_reviewed`.
- Machine translation, if present, is clearly marked unofficial and not stored by default.

## Open Questions

- What is the exact current `nodes` DDL?
- What are the exact current keys and shapes inside `details_json`?
- Which current `details_json` values are localized prose, and which are language-neutral operational facts?
- Are current records all authored in English, or are some original records already non-English?
- Does `ryu_routes` contain user-facing prose that will need localization later?
- Does `saved_views` contain public titles or descriptions?
- Should `review_state` be implemented as check-constrained text or as a database enum if the project already has an enum pattern?
- Should write access be labeled `Write access`, `Contribution access`, or `Submit / contribute` in the UI?
