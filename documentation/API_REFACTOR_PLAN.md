# Explorer API Refactor Plan

## Purpose

Define a simple, agent-friendly API for CHM Explorer records that supports
smart reads, targeted writes, full localization writes, full record writes,
record removal, and bulk import validation without exposing arbitrary database
table mutation.

This is a planning document. It describes the intended API shape and migration
work; it does not describe the currently deployed write surface except where
noted.

## Design Decisions

- Use `records` as the public API concept. Internally, a record is backed by a
  `nodes` row plus localization rows, edges, sources, and `ryu_routes`.
- Keep API paths the same across public, admin, and private Explorer. Access
  should be gated by deployment mode, IAP, service identity, and DB role, not by
  different endpoint syntax.
- Enforce write authorization inside Explorer itself. CHM proxy allowlisting and
  Cloud Run IAM are required outer controls, but they are not sufficient
  authorization for Explorer record mutations.
- Fail closed for admin-only operations when production admin allowlists are
  missing or empty. Authenticated editor writes must fail closed when IAP user
  context is missing or invalid.
- Start with `GET` for search/list reads. `POST` is not inherently a write, but
  it is commonly read as "do something", so reserve it for bulk validation and
  future complex read searches only if query strings become too limited.
- Treat localization coverage as a general record search/list filter, not as a
  separate special-purpose `/api/nodes/localization-coverage` endpoint.
- Keep write operations record-oriented. Agents should be able to patch one
  record section, write one full localization, write all localizations, or write
  a full record through the same record API family.
- Define strict request contracts before implementing writes. Do not accept raw
  table names, arbitrary JSON Patch paths, or untyped nested JSON merges.
- Return explicit public, admin, and private response DTOs. Do not serialize raw
  repository/database rows and rely on later redaction.
- Implement record list/search with SQL-backed filtering and cursor pagination
  from day one. Do not extend the current bootstrap-loaded in-memory filtering
  pattern for this endpoint.
- Use deterministic caller-supplied IDs for record writes. Do not add
  idempotency tables; standard transactional upserts are enough when
  repeated requests carry the same explicit IDs.
- Keep MCP optional. MCP tools should call these APIs rather than writing
  directly to Postgres or reimplementing validation.

## Current State

Explorer currently exposes broad read routes and one narrow write route.

Implemented read routes include:

- `GET /api/graph/bootstrap`
- `GET /api/ryu/systems`
- `GET /api/ryu/systems/:id`
- `GET /api/saved-views`
- `GET /api/sources/:id`

The only implemented write route is:

- `PATCH /api/nodes/:id/localizations/:locale/review`

That review route accepts only `reviewState` and `reviewerNote`. The server sets
`reviewer` and `lastReviewed` from CHM/IAP context.

The browser client still contains broader node, edge, source, and saved-view
helpers, but the server does not expose matching general mutation routes. Treat
those helpers as stale or future-facing until this refactor wires them to real
server APIs.

Relevant current files:

- `server/src/server.ts`
- `server/src/graphRepository.ts`
- `server/src/postgresGraphRepository.ts`
- `shared/domain.ts`
- `shared/localization.ts`
- `client/src/app/api.ts`
- `client/src/app/search.ts`
- `client/src/app/components/SystemDirectoryView.tsx`
- `client/src/app/components/EntityDetailsPanel.tsx`
- `client/src/app/components/EditorPanel.tsx`

CHM currently proxies only the review mutation path to the private Explorer API.
Unsupported Explorer API proxy routes are rejected.

Relevant CHM files:

- `src/server.js`
- `test/server.test.js`
- `docs/deploy.md`
- `docs/security-audit.md`

## Target API Surface

### Implementation Checklist

Use this checklist for the implementation pass.

- [x] Define shared TypeScript contracts:
  `RecordSummaryDto`, `RecordDetailDto`, `RecordAggregateContentInput`,
  `LocalizationContentInput`, `RecordPatchInput`, and `RecordReviewInput`.
- [x] Add runtime validators that reject unknown fields at every level and reject
  review/audit fields from content writes.
- [x] Add response mappers for public, admin, and private DTOs. These should
  allowlist fields instead of copying repository rows and deleting sensitive
  properties afterward.
- [x] Add Explorer-side auth helpers for authenticated OA editor access and
  admin-only destructive actions.
- [x] Add per-route JSON body limits for review, patch, full record upsert, and
  bulk validation.
- [x] Implement SQL-backed `GET /api/records` with the full filter set: `q`,
  `kind`, `geography`, `dataType`, `recordDepth`, `reviewState`, `locale`,
  `localeMode`, `localeAvailability`, `reviewLocale`, `routeStatus`,
  `routeCapability`, `accessType`, `accessMethod`, `include`, `limit`, and
  `cursor`.
- [x] Implement `GET /api/records/:id` using the same DTO rules and public/admin
  redaction behavior.
- [x] Add `PATCH /api/records/:id/review` as the record-oriented review endpoint,
  while preserving or aliasing the existing node-localization review path during
  migration.
- [x] Add private `PATCH /api/records/:id` for targeted content, edge, route, and
  source upserts/deletes according to the section-aware patch rules.
- [x] Add `PUT /api/records/:id` as a deterministic-ID content upsert, not a
  delete-by-omission replacement.
- [x] Add tests for public redaction, admin/private DTO shape, auth denial,
  authenticated review changes, admin-only destructive actions, unknown field
  rejection, content-write review-field rejection, transaction rollback, and SQL
  query filters.
- [ ] CHM proxy widening is not applied. Browser review remains on the existing
  approved `PATCH /api/explorer/nodes/:id/localizations/:locale/review` path;
  exposing `PUT`, `PATCH`, `DELETE`, or bulk record routes through
  `/api/explorer` needs explicit approval after reviewing the browser-facing
  destructive write risk.
- [x] Defer only applied bulk imports. Bulk validation and delete are part of this
  plan.

### Read Records

Use one general list/search endpoint:

```http
GET /api/records
```

Use one record detail endpoint:

```http
GET /api/records/:id
```

The list endpoint should support structured filters through query parameters:

```text
q
kind
geography
dataType
recordDepth
reviewState
locale
localeMode
localeAvailability
reviewLocale
routeStatus
routeCapability
accessType
accessMethod
include
limit
cursor
```

The first implementation should execute these filters in Postgres through
repository methods built for record search. Avoid implementing this route by
calling `getBootstrap()` and filtering in memory. Required query behavior:

- Default and maximum `limit` values should be explicit.
- Cursors should be opaque and based on a stable sort tuple, not offset-only
  pagination.
- Filters involving locale coverage, review state, routes, access paths, and
  descriptors should be pushed into SQL joins, JSONB predicates, or bounded
  subqueries.
- `q` can start with simple SQL-backed text matching over typed fields; full-text
  indexes can be added when volume or ranking quality requires them.

Supported `localeMode` values:

- `locale_only`: search only the requested locale.
- `locale_with_fallbacks`: search the requested locale and configured
  fallbacks.
- `display_locale`: search the localization the UI would display.
- `all_locales`: search every localization and return matched locales.

Supported localization coverage filters:

- `localeAvailability=available`
- `localeAvailability=missing`
- `localeAvailability=partial`
- `localeAvailability=complete`

Recommended review-state interpretation:

- `reviewLocale=requested`: filter by the requested locale row.
- `reviewLocale=displayed`: filter by the resolved display/fallback row.
- `reviewLocale=any`: filter if any localization has the review state.

Example equivalent to the earlier localization coverage requirement:

```http
GET /api/records?locale=fr&localeAvailability=missing&reviewState=agent_researched&reviewLocale=displayed&include=localizationSummary
```

That means: records missing French whose displayed fallback localization is
`agent_researched`.

Example public summary response shape:

```json
{
  "records": [
    {
      "id": "fishbase",
      "kind": "system",
      "recordDepth": "rich",
      "availableLocales": ["en", "es"],
      "missingLocales": ["ar", "zh", "fr", "ru"],
      "reviewStatesByLocale": {
        "en": "agent_researched",
        "es": "needs_revision"
      },
      "requestedLocale": "fr",
      "displayLocale": "en",
      "isLocaleFallback": true
    }
  ],
  "nextCursor": null
}
```

`include` should be additive and explicit. Suggested values:

- `localizationSummary`
- `localizations`
- `edges`
- `sources`
- `routes`
- `matchReasons`

Response redaction should be expressed as separate DTOs:

- Public DTOs: no reviewer notes, reviewer identity, last-reviewed timestamp,
  local source paths, private route targets, route upstreams, raw route
  properties, or other non-public operational details. Public reads may filter by
  public-safe route metadata without returning internal route fields. Current
  route status and capability values are not treated as sensitive; revisit this
  only if routes later encode private partners, credentials, security posture, or
  unreleased commercial plans.
- Admin DTOs: may include reviewer metadata and authoring status, but should
  still omit local filesystem paths and secrets. Route fields should be
  allowlisted, not copied wholesale from `ryu_routes.properties_json`.
- Private DTOs: may include full record aggregates needed for trusted service
  workflows, still excluding secrets unless a later contract explicitly needs
  them.

All DTOs should be built by allowlisting fields. Public redaction must not depend
on deleting sensitive fields after serializing a private object.

### Upsert One Full Record

Use `PUT` for a deterministic-ID full record content upsert:

```http
PUT /api/records/:id
```

The request body should contain the complete record aggregate, with supporting
source upserts:

```json
{
  "id": "fishbase",
  "record": {
    "kind": "system",
    "countryCode": null,
    "subtype": null,
    "url": "https://www.fishbase.org",
    "recordDepth": "rich",
    "properties": {}
  },
  "localizations": {
    "en": {},
    "fr": {},
    "es": {},
    "ar": {},
    "zh": {},
    "ru": {}
  },
  "edges": [],
  "sources": {
    "upsert": []
  },
  "routes": []
}
```

The `RecordAggregate` write contract should be typed in shared TypeScript and
validated at runtime. Path `:id` is authoritative; if the body contains `id`, it
must match the path. The example above abbreviates localization internals; actual
localization values must satisfy the full typed contract.

Content input rules:

- `RecordAggregate` localizations must use a content-only input type, not the
  full read DTO. Allowed localization content fields are `title`, `summary`,
  `description`, `details`, `sourceExcerpt`, and `translatedFromLocale`.
- Content writes must reject review and audit fields, including `reviewState`,
  `reviewerNote`, `reviewer`, `lastReviewed`, `contentUpdatedAt`, `createdAt`,
  and `updatedAt`.
- New localization rows created by content writes should default to
  `reviewState='agent_researched'`, with reviewer metadata unset. Review state
  changes go through the dedicated review endpoint.

Upsert semantics:

- `record` replaces the neutral node fields for that record.
- `localizations` is authoritative for the localization rows supplied by a full
  record write. `rich` records require all six supported locales unless the body
  explicitly marks the record incomplete.
- `edges` upserts only the supplied incident edges. Every edge must have
  `sourceNodeId` or `targetNodeId` equal to `:id`; omitted incident edges are
  unchanged.
- `routes` upserts only supplied `ryu_routes` rows whose `node_id` is `:id`;
  omitted routes are unchanged.
- `sources.upsert` is upsert-only in full record writes. Source rows are shared
  provenance records, so omission from one record aggregate must not delete a
  source row.
- Relationship and route removals should use explicit `PATCH` delete operations
  by id. Do not implement delete-by-omission for `PUT`.
- This is intentionally not strict REST-style full replacement semantics. Missing
  related rows do not mean "delete these rows".

Validation rules:

- `rich` and other full-record writes should require all six supported
  localizations unless the request explicitly marks the record as incomplete.
- `stub` writes may include only minimal metadata and one localization.
- Unknown fields should be rejected.
- Writes should run in one transaction.
- Request bodies should support `validateOnly=true` for dry runs.
- Full writes should require an `If-Match`/ETag or equivalent `updatedAt`
  precondition once concurrent editing is possible.

### Patch One Record

Use `PATCH` for targeted changes:

```http
PATCH /api/records/:id
```

This route should support updates to one or more named sections without forcing
the caller to rewrite the full record.

Patch semantics:

- `PATCH /api/records/:id` is not RFC 6902 JSON Patch and is not a free-form
  deep merge. It accepts only named record sections.
- Omitted top-level sections are unchanged.
- Scalar fields are replaced when present. Explicit `null` clears only fields
  that are nullable in the typed contract.
- Unknown fields are rejected at every level.
- JSON object columns are replace-only unless a later named operation defines a
  narrower merge. For this implementation, use explicit replacement fields such as
  `propertiesReplace` and `detailsReplace`; reject ambiguous partial nested JSON.
- Localization patch entries must declare `mode: "patch"` or `mode: "replace"`.
  `patch` changes only supplied scalar fields and explicit replacement objects;
  `replace` requires a complete localization content object.
- Edge and route deletes are by id only, never by broad filters or omission.
- Source rows cannot be deleted through record patch. Source deletion is a
  separate admin cleanup operation after an orphan/impact check.

Patch neutral record fields:

```json
{
  "record": {
    "recordDepth": "rich",
    "url": "https://www.fishbase.org"
  }
}
```

Patch one full localization:

```json
{
  "localizations": {
    "fr": {
      "mode": "replace",
      "title": "FishBase",
      "summary": "...",
      "description": "...",
      "detailsReplace": {}
    }
  }
}
```

Patch multiple localization rows:

```json
{
  "localizations": {
    "en": {
      "mode": "patch",
      "summary": "..."
    },
    "es": {
      "mode": "patch",
      "summary": "..."
    }
  }
}
```

Patch related rows:

```json
{
  "edges": {
    "upsert": [],
    "delete": []
  },
  "sources": {
    "upsert": []
  },
  "routes": {
    "upsert": [],
    "delete": []
  }
}
```

The route should be section-aware rather than table-arbitrary. For example,
agents can update `localizations.fr.summary`, but they should not send a raw SQL
table name or unrestricted JSON patch against any table.

Additional relationship rules:

- `edges.upsert` and `edges.delete` may only affect edges where `sourceNodeId` or
  `targetNodeId` is `:id`.
- `routes.upsert` and `routes.delete` may only affect routes where `nodeId` is
  `:id`.
- `sources.upsert` may create or update cited source rows by id, but must not
  remove or rewrite source rows that are still referenced by other records.

### Review State

Keep review state intentionally separate from content writes at first:

```http
PATCH /api/records/:id/review
```

Suggested body:

```json
{
  "locale": "fr",
  "reviewState": "human_reviewed",
  "reviewerNote": "Looks good."
}
```

The existing implementation uses
`PATCH /api/nodes/:id/localizations/:locale/review`. During migration, keep that
path as a compatibility alias or update the browser and CHM proxy together.

Any authenticated OA editor may set `human_reviewed`, `agent_researched`, or
`needs_revision`. Content writes still cannot set review fields; review changes
go through this endpoint so Explorer can set reviewer metadata server-side.

### Delete One Record

Use:

```http
DELETE /api/records/:id
```

Deletion should support a dry run:

```http
DELETE /api/records/:id?validateOnly=true
```

The dry-run response should report the impact before applying the delete:

- node row
- localization rows
- inbound and outbound edges
- `ryu_routes`
- affected saved views, if any
- orphaned source candidates, if any

Applying a delete should require admin access, not just authenticated editor
access. For the current small-org model, that can be a short admin allowlist
rather than a complex authorization scope system. The apply request should
include a fresh dry-run impact hash or equivalent confirmation token so
accidental stale deletes are rejected.

### Bulk Validate Records

Use a collection operation to validate bulk import payloads:

```http
POST /api/records:bulk
```

Body:

```json
{
  "validateOnly": true,
  "records": []
}
```

Supported option:

- `validateOnly=true`

Bulk validation requires the admin role. Applying bulk changes is out of scope
for this plan; use individual deterministic `PUT`/`PATCH` requests for applied
changes.

Per-route JSON payload limits should be explicit rather than relying on global
Express defaults. Suggested starting caps:

- review patch: 8 KB
- record patch: 256 KB
- full record put: 1 MB
- bulk validate: 2 MB, aligned with the current CHM proxy body limit

Large applied imports require a separate future plan. Do not add an idempotency
or audit table for this implementation.

## Deployment And Access

Keep the same API path format everywhere:

```text
/api/records
/api/records/:id
/api/records:bulk
```

Deployment controls what works:

- Public Explorer allows read routes only, uses read DB credentials, and
  returns redacted data.
- Admin Explorer allows read routes and can call private write routes through
  CHM, still using the same request shapes.
- Private Explorer API allows read and write routes, uses write DB credentials,
  and requires CHM/private service identity plus user context.

This keeps usage simple for agents and the browser. The caller changes base URL
and credentials, not endpoint syntax.

## Authorization Model

Do not start with a large scope system. The organization is small, and domain
IAP is acceptable for app access.

Roles and boundaries that exist today:

- Public internet user: can read the public Explorer deployment at `/explorer`;
  not an authenticated app role.
- IAP-authenticated Ocean Agentics user: can reach CHM and Explorer admin read
  surfaces; currently based on the `oceanagentics.com` domain.
- CHM admin hint email: controls the public-to-admin redirect hint cookie only;
  it is not an authorization role.
- CHM service account: the only intended caller of the private Explorer API; this
  is a service boundary, not an end-user role.
- `explorer_read`: database role for public/admin read services.
- `explorer_write`: database role for the private API service.
- `explorer_schema_admin`: database role for deliberate schema work only.

Target Explorer app access levels:

- authenticated OA editor: any IAP-authenticated `@oceanagentics.com` user. Can
  use admin/private reads, create and update record content, update reviewer
  notes, and set review state to any valid review state including
  `human_reviewed`.
- admin: a configured allowlist for destructive or operationally sensitive
  actions only. Admin can delete records, validate bulk imports, and perform
  source cleanup. Admin also has authenticated OA editor permissions.

Initial gates:

- IAP authenticated Ocean Agentics user for admin/browser entry.
- Private Explorer API reachable only through CHM or approved service identity.
- Trusted caller service account check on the private API.
- Required user context on all write requests.
- Simple admin allowlist in environment variables for destructive actions.
- Explorer-side role checks on every write route. Do not rely on the CHM proxy
  allowlist as the only authorization layer.
- CHM-forwarded user headers are trusted only after Cloud Run IAM/service
  identity validation. Treat the caller header as defense in depth, not the
  primary boundary.

Suggested minimal allowlists:

```text
EXPLORER_ADMIN_USERS=dan@oceanagentics.com,...
```

Minimal permission rule:

- Authenticated OA users are readers, writers, and reviewers. Admin is separate
  only because destructive actions need an extra gate.

This can later move to Google Groups if the team grows.

## Audit And Safety Requirements

Every write route should record:

- request id
- actor email and subject
- caller service account
- operation
- target record id
- affected section and locale, when relevant
- validation result
- before and after hash or compact diff summary
- timestamp

Every write route should support strict schema validation. Delete apply requests
should require a successful `validateOnly=true` dry run before a separate apply
request. Bulk import validation is validate-only in this plan.

Use structured application logs for audit. Do not add an audit or idempotency
table unless a later requirement needs queryable audit history or
non-deterministic side-effect tracking.

Patch writes should use optimistic concurrency once multiple humans or agents
are editing records regularly. A simple `updatedAt` or ETag precondition is
enough.

Schema migrations, role changes, and table creation should stay outside this API
and continue through deliberate deployment/migration work.

## MCP Position

MCP is useful as a client interface for agents, but it should not become an
independent write path.

Recommended MCP tools after this API exists:

- `search_records`
- `get_record`
- `validate_record`
- `upsert_record`
- `patch_record`
- `delete_record`
- `validate_records_bulk`

Each MCP tool should call the Explorer API and rely on the API for
authorization, validation, transactions, and audit logging.

## Migration Work

Server:

- Add shared `RecordAggregate` write types and public/admin/private response DTO
  types.
- Add Explorer-side authenticated-editor and admin authorization middleware with
  fail-closed production admin allowlist behavior.
- Add SQL-backed repository methods for `GET /api/records`.
- Add `GET /api/records`.
- Add `GET /api/records/:id`.
- Add `PUT /api/records/:id`.
- Add `PATCH /api/records/:id`.
- Add `PATCH /api/records/:id/review` or alias the current review route.
- Add `DELETE /api/records/:id`.
- Add `POST /api/records:bulk` for validation only.
- Add repository methods for validated record aggregate reads and writes.
- Add audit logging for all record mutations.

Client:

- Replace stale broad CRUD helpers in `client/src/app/api.ts` with the record
  API helpers.
- Decide whether `SystemDirectoryView` continues using client-side bootstrap
  search or switches to `GET /api/records` for server-backed search.
- Keep `EntityDetailsPanel` review behavior, but update the endpoint if the
  review path moves.
- Rewire or hide `EditorPanel` until it uses the new record API.

CHM:

- Keep the `/api/explorer` browser proxy on the existing localization review
  path until broader record writes are explicitly approved for browser-facing
  proxy exposure.
- Keep method/path allowlisting explicit. Do not proxy all Explorer API paths.
- If broader proxy exposure is later approved, add tests for each allowed record
  method/path and rejected unsupported routes before deployment.

Docs:

- Update `documentation/cloud-run-migration.md` after implementation so
  `RYU_MODE=api` no longer says review-only.
- Update `documentation/RICH_RESEARCH_RECORDS.md` so routine backfills use the
  record API instead of direct Postgres edits.
- Update `documentation/SEARCH_SYSTEM_PLAN.md` to describe server-backed record
  search and localization filters.
- Update `documentation/language-migration-plan.md` with localization coverage
  filter semantics.
- Update CHM `docs/deploy.md` and `docs/security-audit.md` once the proxy
  allowlist and write surface change.

## Suggested Implementation Order

1. Define record contracts, response DTOs, and authorization access levels.
2. Add read-only SQL-backed `GET /api/records` and `GET /api/records/:id` with
   localization and review filters.
3. Switch the browser search/directory to the read API where useful, while
   preserving bootstrap search for small local graphs if desired.
4. Add private `PATCH /api/records/:id` for targeted updates.
5. Add `PUT /api/records/:id` for full record writes.
6. Add delete with admin-only, mandatory dry-run behavior.
7. Add `POST /api/records:bulk` for validation only if still useful.
8. Add MCP tools as thin wrappers over the finished API.
