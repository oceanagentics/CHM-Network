# Explorer API Refactor Plan

## Purpose

Define a simple, agent-friendly API for CHM Explorer records that supports
smart reads, targeted writes, full localization writes, full record writes,
and record removal without exposing arbitrary database table mutation.

This is a planning document. It describes the intended API shape and migration
work; it does not describe the currently deployed write surface except where
noted.

## Design Decisions

- Use `records` as the public API concept. Internally, a record is backed by a
  `nodes` row plus localization rows, edges, sources, and `ryu_routes`.
- Use one canonical API family: `/api/records`. Do not add or preserve separate
  node, source, graph, or ryu CRUD APIs for launch.
- Keep API paths the same across human and token-authenticated Explorer API
  access. Humans authenticate with IAP directly at Explorer. Agents authenticate
  with bearer tokens directly at Explorer API.
- Enforce write authorization inside Explorer itself. Bearer tokens, IAP, Cloud
  Run settings, and DB roles are outer controls, but route handlers must still
  check operation-specific permissions.
- Fail closed for admin-only operations when production admin scopes are missing
  or empty. API writes must fail closed when bearer-token config is missing,
  malformed, invalid, expired, or lacks the required scope.
- Start with `GET` for search/list reads. Do not add bulk endpoints for launch;
  agents can validate and apply one record per request.
- Treat localization coverage as a general record search/list filter, not as a
  separate special-purpose `/api/nodes/localization-coverage` endpoint.
- Keep write operations record-oriented. Agents should be able to patch one
  record section, write one full localization, write all localizations, or write
  a full record through the same record API family.
- Define strict request contracts before implementing writes. Do not accept raw
  table names, arbitrary JSON Patch paths, or untyped nested JSON merges.
- Return explicit public, admin, and private response DTOs. Do not serialize raw
  repository/database rows and rely on post-serialization redaction.
- Implement record list/search with SQL-backed filtering and cursor pagination
  from day one. Do not extend the current bootstrap-loaded in-memory filtering
  pattern for this endpoint.
- Use deterministic caller-supplied IDs for record writes. Do not add
  idempotency tables; standard transactional upserts are enough when
  repeated requests carry the same explicit IDs.
- Do not ship direct database-backed MCP servers. Agents should target this
  API directly. MCP is not part of this refactor; any MCP client must be a thin
  API-backed client that does not write directly to Postgres or reimplement
  validation.
- Use normal API bearer tokens for agent writes. Local and prompt-driven agents
  need a stable HTTPS API token workflow without Cloud Run proxying, one-off
  jobs, or CHM-forwarded identity headers.
- Store only API token hashes in Secret Manager or environment config. Do not
  add token tables in this refactor.
- Keep `human_reviewed` as a human/reviewer action. Routine writer tokens may
  create and update agent-authored content, but they must not mark a
  localization as `human_reviewed`.
- Require optimistic concurrency for applied record writes using a simple
  `recordUpdatedAt` precondition. Agents must read a record version before
  applying updates so parallel agents cannot silently overwrite each other.
- Add a small, generous in-process token rate limit for `RYU_MODE=api` to stop
  runaway agent loops before they exhaust database connections.

## Current State

Before this refactor, Explorer exposed several pre-launch read/projection routes
alongside the record-oriented API.

Pre-launch read/projection routes include:

- `GET /api/graph/bootstrap`
- `GET /api/ryu/systems`
- `GET /api/ryu/systems/:id`
- `GET /api/saved-views`
- `GET /api/sources/:id`

The pre-launch browser-mediated write route is:

- `PATCH /api/nodes/:id/localizations/:locale/review`

That review route accepts only `reviewState` and `reviewerNote`. The server sets
`reviewer` and `lastReviewed` from CHM/IAP context.

The launch server keeps `GET /api/graph/bootstrap` as a UI bootstrap support
route for the current browser app. It is not an agent API surface.

Launch record API routes are:

- `GET /api/records`
- `GET /api/records/:id`
- `PUT /api/records/:id`
- `PATCH /api/records/:id`
- `PATCH /api/records/:id/review`
- `DELETE /api/records/:id`

The current deployed private API still uses the CHM/internal-service identity
model, which is a poor fit for local agents and browser writes. This plan
replaces that path with direct Explorer auth: IAP for humans and bearer tokens
for agents.

The browser client now uses record-oriented API helpers where write helpers are
present. Legacy broad node, edge, source, and saved-view mutation helpers are no
longer the planned write surface.

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

CHM should not proxy Explorer writes for launch. CHM may keep owning the root
domain and future app shell, but Explorer should own Explorer auth and writes.

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
- [x] Add per-route JSON body limits for review, patch, and full record upsert.
- [x] Implement SQL-backed `GET /api/records` with the full filter set: `q`,
  `kind`, `geography`, `dataType`, `recordDepth`, `reviewState`, `locale`,
  `localeMode`, `localeAvailability`, `reviewLocale`, `routeStatus`,
  `routeCapability`, `accessType`, `accessMethod`, `include`, `limit`, and
  `cursor`.
- [x] Implement `GET /api/records/:id` using the same DTO rules and public/admin
  redaction behavior.
- [x] Add `PATCH /api/records/:id/review` as the record-oriented review endpoint,
  and make it the only launch review write path.
- [x] Add private `PATCH /api/records/:id` for targeted content, edge, route, and
  source upserts/deletes according to the section-aware patch rules.
- [x] Add `PUT /api/records/:id` as a deterministic-ID content upsert, not a
  delete-by-omission replacement.
- [x] Add tests for public redaction, admin/private DTO shape, auth denial,
  authenticated review changes, admin-only destructive actions, unknown field
  rejection, content-write review-field rejection, transaction rollback, and SQL
  query filters.
- [x] Applied bulk imports are not part of this API. Bulk validation is also cut
  from launch; agents validate one record at a time.
- [x] Add API bearer-token auth for `RYU_MODE=api` so agents can call
  `explorer-api` directly over HTTPS.
- [x] Add `reader`, `writer`, `reviewer`, and `admin` token scopes. `writer`
  tokens must not set `human_reviewed`; `reviewer` and `admin` tokens may.
- [x] Remove CHM-header-only trust from the launch write path. Do not rely on
  `x-chm-*` forwarded identity headers for Explorer authorization.
- [ ] Configure `explorer-api` for normal API reachability only after token auth
  is enforced on every private read and write route.
- [x] Implement semantic `validateOnly=true` for record `PUT`, record `PATCH`,
  review changes, and delete dry-runs. Dry-runs must run the
  same request parsing and database validation as apply requests without
  mutating rows.
- [x] Require optimistic concurrency on applied record mutations with
  a simple `recordUpdatedAt` precondition.
- [x] Add structured audit logging for mutation action, request context, token
  identity, rate-limit bucket, affected sections, validation result, and current
  `recordUpdatedAt` without logging tokens or full payloads.
- [x] Add generous token-based rate limiting for `RYU_MODE=api`.
- [x] Document token issuance, installation, validation-first write workflow,
  optimistic-concurrency use, rotation, and revocation.

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
- `q` can start with simple SQL-backed text matching over typed fields. Do not
  add full-text indexes in this refactor unless simple matching fails acceptance
  tests.

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
  route status and capability values are treated as public-safe only when they do
  not encode private partners, credentials, security posture, or unreleased
  commercial plans.
- Admin DTOs: may include reviewer metadata and authoring status, but should
  still omit local filesystem paths and secrets. Route fields should be
  allowlisted, not copied wholesale from `ryu_routes.properties_json`.
- Private DTOs: may include full record aggregates needed for trusted service
  workflows. Generic record DTOs must not return secrets; secret delivery must
  use a separate route/tool contract.

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
- Applied writes against existing records must require a `recordUpdatedAt`
  precondition.
- Create-only full writes must provide an explicit create-only precondition so
  accidental overwrites fail.

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
- JSON object columns are replace-only. Use explicit replacement fields such as
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

Keep review state intentionally separate from content writes:

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

The pre-launch node-localization review route should be removed from the launch
surface. Human browser review and agent review both use this record-oriented
path.

Review-state permissions:

- `writer` tokens may set `agent_researched` or `needs_revision`.
- `writer` tokens must receive `403 review_scope_required` when they attempt to
  set `human_reviewed`.
- `reviewer` and `admin` tokens may set `human_reviewed`,
  `agent_researched`, or `needs_revision`.
- Content writes still cannot set review fields; review changes go through this
  endpoint so Explorer can set reviewer metadata server-side.

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
access. In the token model, that means an `admin` token scope rather than a
separate email allowlist. The apply request should include both a fresh dry-run
`impactHash` and the current `recordUpdatedAt` precondition so accidental stale
deletes are rejected.

### Cut From Launch

Do not ship these as agent API surfaces for launch:

- `POST /api/records:bulk`
- `/api/nodes/*` mutation routes
- `/api/sources/*` mutation routes
- `/api/ryu/*` agent API routes
- `/api/graph/*` agent API routes
- CHM `/api/explorer/*` write proxy routes

Per-route JSON payload limits should be explicit rather than relying on global
Express defaults. Suggested starting caps:

- review patch: 8 KB
- record patch: 256 KB
- full record put: 1 MB

Large applied imports are not part of this record API. Do not add an
idempotency or audit table in this implementation.

### Validation And Dry Runs

`validateOnly=true` is a first-class preflight, not a parse-only check. Dry-runs
must run the same authentication, scope checks, rate limiting, request parsing,
schema validation, semantic validation, and database lookups as apply requests,
but must not mutate rows.

Dry-run response shape should extend `RecordValidationResult` enough for an
agent to show a useful pre-apply summary:

```json
{
  "valid": true,
  "recordId": "fishbase",
  "issues": [],
  "warnings": [],
  "affectedSections": ["localizations.en", "routes"],
  "recordUpdatedAt": "2026-09-02T00:00:00.000Z"
}
```

Validation implementation belongs in shared TypeScript contracts and repository
runtime checks, not in markdown rule tables. Required behavior:

- full-write and patch payloads satisfy the strict typed contracts and reject
  unknown fields at every level
- path `:id` matches any body id, route `nodeId`, and all affected route rows
- rich records include all supported localizations unless `incomplete=true`
- localization source refs in `details`, node source refs in `properties`,
  edge source refs, and route source refs either already exist or are included in
  `sources.upsert`
- edge endpoint nodes exist, edge ids are deterministic, edges are incident to
  the target record, self-edges are rejected, and edge kinds follow the canonical
  graph rules
- route status is one of `active`, `planned`, `deprecated`, or `blocked`
- active routes include a non-empty `target`, non-empty `capabilities`, and a
  valid `contractRef` when the route depends on a documented contract
- local `contractRef` paths resolve under `documentation/contracts`
- source upserts have deterministic ids and usable title/type fields
- a provided `recordUpdatedAt` precondition still matches the current record
  version

Synchronous validation should not perform network liveness checks for external
route targets. Validate URL shape and local contract references in the request
path; operational liveness checks belong to route-validation tooling, not the
record write transaction.

### Optimistic Concurrency

All `GET /api/records/:id` detail responses and successful mutation responses
must include `recordUpdatedAt`.

`recordUpdatedAt` is the max `updated_at` timestamp across the record's node row,
localization rows, incident edge rows, and route rows. Source rows are not part
of the launch concurrency version because the current `sources` table has no
`updated_at`.

Applied mutations against an existing record must require an explicit
`recordUpdatedAt` precondition. Missing preconditions should return
`428 precondition_required`; stale preconditions should return
`412 precondition_failed`. Create-only writes must use an explicit create-only
precondition.

`validateOnly=true` may run without a precondition, but it should return the
current `recordUpdatedAt`. If a dry-run includes a precondition, validate it and
report stale state as a validation issue.

### Token Rate Limiting

Add a generous in-process fixed-window token limiter for `RYU_MODE=api` after
bearer-token authentication succeeds. The purpose is runaway-agent protection,
not traffic shaping. Start with one configurable per-token request limit and
return `429 rate_limited` with `Retry-After` when exceeded. Do not add gateway
rules, sliding windows, invalid-token IP fallback, or database-backed rate-limit
state in this refactor.

## Deployment And Access

Keep the same API path format everywhere:

```text
/api/records
/api/records/:id
```

Deployment controls what works:

- Human Explorer is IAP-protected, uses Explorer's own auth checks, and calls
  Explorer's `/api/records` routes directly.
- Explorer API allows private reads and writes, uses write DB credentials, and
  requires a valid API bearer token for every route except health checks.

This keeps usage simple for agents and the browser. The caller changes base URL
and credentials, not endpoint syntax.

Do not use CHM as an Explorer write proxy for launch. CHM may own the root
domain and future app shell, but it should not translate identity or forward
Explorer record writes.

## API Token Model

Use opaque bearer tokens:

```text
Authorization: Bearer ryu_live_<random>
```

Token scopes:

- `reader`: private record reads.
- `writer`: includes `reader`; allows `PUT /api/records/:id`,
  `PATCH /api/records/:id`, validate-only writes, and review changes to
  `agent_researched` or `needs_revision`.
- `reviewer`: includes `writer`; additionally allows review changes to
  `human_reviewed`.
- `admin`: includes `reviewer`; additionally allows `DELETE /api/records/:id`
  apply requests.

Do not add per-table scopes unless the organization grows into a real multi-team
permission model. These four scopes are enough for the current boundary.

Store token records as JSON in Secret Manager or an environment variable:

```json
[
  {
    "name": "codex-writer-danny",
    "scopes": ["writer"],
    "hash": "sha256:<hex>",
    "owner": "danny@oceanagentics.com",
    "createdAt": "2026-09-02T00:00:00.000Z",
    "expiresAt": null
  },
  {
    "name": "danny-human-review",
    "scopes": ["reviewer"],
    "hash": "sha256:<hex>",
    "owner": "danny@oceanagentics.com",
    "createdAt": "2026-09-02T00:00:00.000Z",
    "expiresAt": null
  }
]
```

Only the hash is stored. The plaintext token is generated once, shown once, and
delivered to the human or runtime through a password manager or deployment
secret. Explorer compares hashes with constant-time comparison and never logs
token values.

Token auth rules:

- missing token: `401`.
- malformed, unknown, expired, or wrong-scope token: `403`.
- token config missing in `RYU_MODE=api`: fail closed for every private read and
  write route.
- `writer` token attempting `human_reviewed`: `403 review_scope_required`.
- `admin` actions still require admin scope; do not preserve a separate
  email-based admin allowlist as the primary API-token gate.
- rate-limited token: `429 rate_limited` with `Retry-After`.
- logs should include token `name`, token `owner`, scopes, optional request id,
  target record id, affected section/locale, validation result, status, latency,
  and current `recordUpdatedAt`. Logs must not include token plaintext.

## Token Issuance And Revocation

Issuance is operator-mediated at first:

1. Operator generates a high-entropy token with a `ryu_live_` prefix.
2. Operator hashes it with SHA-256.
3. Operator adds the token record to the Secret Manager token config.
4. Operator deploys or restarts `explorer-api` so the new config is active.
5. Operator sends the plaintext token once through a password manager or other
   secure channel.

Revocation:

1. Remove the token record from the Secret Manager token config.
2. Deploy or restart `explorer-api`.
3. Confirm the old token receives `403`.

Rotation:

1. Issue a replacement token and add its hash alongside the old token.
2. Move the user/agent to the new token.
3. Remove the old token and redeploy/restart.

Emergency revocation can set the token config to an empty list and redeploy the
API. In `RYU_MODE=api`, an empty token config should deny all non-health access.

Do not add a token database in this refactor. Secret Manager or environment JSON
is the token store.

## Human And Agent Workflow

Human setup instructions:

1. Ask an operator for a `reader`, `writer`, or `reviewer` token. Use an
   `admin` token only when delete is actually needed.
2. Store the token outside the repo, for example in a password manager, shell
   secret, local ignored environment file, or Codex/agent secret store.
3. Tell the agent the API URL and which environment variable contains the token.
   Do not paste the token into a prompt unless there is no safer secret channel.

Suggested local environment:

```sh
export RYU_API_URL="https://chm.oceanagentics.org"
export RYU_API_TOKEN="ryu_live_..."
```

Agent rules:

- never print the token.
- never commit the token or payload files containing it.
- call public Explorer for public reads when private fields are not needed.
- call `explorer-api` with `Authorization: Bearer $RYU_API_TOKEN` for private
  reads and all writes.
- read the target record and capture `recordUpdatedAt` before applying a
  mutation.
- run `validateOnly=true` before applying every content write.
- show validation errors and the intended diff before applying.
- apply with the same payload only after explicit human confirmation unless the
  user has explicitly delegated that specific write.
- include the current `recordUpdatedAt` for existing-record mutations or an
  explicit create-only precondition for create-only writes.

Example validation and apply:

```sh
RYU_RECORD_UPDATED_AT="$(
  curl -sS \
    "$RYU_API_URL/api/records/fishbase?include=localizations,routes,sources,edges" \
    -H "Authorization: Bearer $RYU_API_TOKEN" \
    | jq -r '.recordUpdatedAt'
)"

curl -sS -X PATCH \
  "$RYU_API_URL/api/records/fishbase?validateOnly=true" \
  -H "Authorization: Bearer $RYU_API_TOKEN" \
  -H "content-type: application/json" \
  -H "x-ryu-record-updated-at: $RYU_RECORD_UPDATED_AT" \
  --data-binary @payload.json

curl -sS -X PATCH \
  "$RYU_API_URL/api/records/fishbase" \
  -H "Authorization: Bearer $RYU_API_TOKEN" \
  -H "content-type: application/json" \
  -H "x-ryu-record-updated-at: $RYU_RECORD_UPDATED_AT" \
  --data-binary @payload.json
```

Delete remains admin-only and two-step:

```sh
curl -sS -X DELETE \
  "$RYU_API_URL/api/records/fishbase?validateOnly=true" \
  -H "Authorization: Bearer $RYU_API_TOKEN"

curl -sS -X DELETE \
  "$RYU_API_URL/api/records/fishbase?impactHash=<dry-run-impact-hash>" \
  -H "Authorization: Bearer $RYU_API_TOKEN" \
  -H "x-ryu-record-updated-at: $RYU_RECORD_UPDATED_AT"
```

## Authorization Model

Do not start with a large scope system. The organization is small. Human
Explorer access should use IAP directly on Explorer, while agent API access
should use scoped bearer tokens.

Roles and boundaries that exist today:

- IAP-authenticated Ocean Agentics user: can reach Explorer's human browser app
  and use human write actions that Explorer permits.
- API token holder: can call `explorer-api` directly over HTTPS according to the
  token's scope.
- `explorer_read`: database role for read-only service variants, if kept.
- `explorer_write`: database role for the private API service.
- `explorer_schema_admin`: database role for deliberate schema work only.

Target Explorer app access levels:

- authenticated OA editor: browser-side concept for IAP-authenticated
  `@oceanagentics.com` users. Can use Explorer's direct record review/write
  actions.
- reader token: direct API concept for private agent reads without write access.
- writer token: direct API concept for agents. Can use private reads, create and
  update record content, update reviewer notes, and set review state to
  `agent_researched` or `needs_revision`.
- reviewer token: direct API concept for human-directed review work. Includes
  writer permissions and can set `human_reviewed`.
- admin token: direct API concept for destructive or operationally sensitive
  actions only. Admin can delete records and also has reviewer permissions.

Initial gates:

- IAP authenticated Ocean Agentics user for human browser entry.
- Private Explorer API requires bearer token authentication for all non-health
  routes.
- Required token scope on all private read and write requests.
- Explorer-side role checks on every write route.
- Do not use CHM-forwarded user headers as Explorer authorization.

Suggested minimal allowlists:

```text
RYU_API_TOKENS_JSON=[...hashed token records...]
```

Minimal permission rule:

- Authenticated OA users are browser readers/reviewers through direct Explorer
  IAP. Agents are API readers, writers, or reviewers through bearer tokens.
  Admin is separate only because destructive actions need an extra token scope.

## Audit And Safety Requirements

Every write route should record:

- request id
- token name, owner, scopes, and rate-limit bucket
- actor email and subject for IAP-authenticated human browser writes
- operation
- route and method
- target record id
- affected section, locale, edge ids, route ids, and source ids when relevant
- validation result
- current `recordUpdatedAt`
- response status and latency
- timestamp

Every write route should support strict schema validation.

Use structured application logs for audit. Do not log plaintext tokens, full
request bodies, full record payloads, or URLs containing credentials. Do not add
an audit or idempotency table in this refactor.

Patch writes, full writes, review writes, and delete applies must use optimistic
concurrency. The simple `recordUpdatedAt` precondition is enough.

Schema migrations, role changes, and table creation should stay outside this API
and continue through deliberate deployment/migration work.

## Agent Interface Position

Agents should target the Explorer API directly for record reads, validation, and
writes. The old direct database-backed MCP servers are sunset because they
bypassed the HTTP API's authorization, DTO redaction, validation, transaction,
and logging boundary.

This refactor does not ship MCP. Any MCP client for Explorer must be a thin
wrapper over the deployed Explorer API. It must not instantiate repositories
directly, use direct Postgres credentials, return richer DTOs than the selected
API surface, or create a parallel write path.

## Migration Work

Server:

- [x] Add shared `RecordAggregate` write types and public/admin/private response DTO
  types.
- [x] Add Explorer-side direct IAP human authorization and bearer-token agent
  authorization.
- [x] Add SQL-backed repository methods for `GET /api/records`.
- [x] Add `GET /api/records`.
- [x] Add `GET /api/records/:id`.
- [x] Add `PUT /api/records/:id`.
- [x] Add `PATCH /api/records/:id`.
- [x] Add `PATCH /api/records/:id/review`.
- [x] Add `DELETE /api/records/:id`.
- [x] Remove `POST /api/records:bulk` from the launch API.
- [x] Add repository methods for validated record aggregate reads and writes.
- [x] Add audit logging for all record mutations.
- [x] Remove legacy direct database-backed MCP server entrypoints.
- [x] Add token config parsing and constant-time token hash checks.
- [x] Add route middleware that maps token scopes to `reader`, `writer`,
  `reviewer`, and `admin` permissions.
- [x] Require either direct IAP human auth or bearer-token agent auth for all
  `RYU_MODE=api` private read and write routes, except health checks.
- [x] Enforce `writer` versus `reviewer` review-state permissions so only
  `reviewer` or `admin` requests can set `human_reviewed`.
- [x] Remove `x-chm-*` caller/user headers as app-level authorization controls.
- [x] Replace parse-only dry-runs with semantic `validateOnly=true` checks over
  current database state and return affected sections and current
  `recordUpdatedAt`.
- [x] Return `recordUpdatedAt` from record detail and mutation responses, and
  require it or create-only preconditions on applied mutations.
- [x] Add basic token-based rate limiting with `429`/`Retry-After` responses.
- [x] Upgrade structured write logs to include token identity, rate-limit bucket,
  affected ids, validation result, affected sections, and `recordUpdatedAt`.
- [x] Add tests for missing token, invalid token, expired token, wrong scope,
  writer success, writer denial for `human_reviewed`, reviewer success,
  admin-only denial, admin success, semantic dry-run failures,
  `recordUpdatedAt` missing/stale failures, and rate-limit responses.

Client:

- [x] Replace stale broad CRUD helpers in `client/src/app/api.ts` with the record
  API helpers.
- [ ] Switch `SystemDirectoryView` off bootstrap search where practical and onto
  `GET /api/records`.
- [x] Keep `EntityDetailsPanel` review behavior, but update the endpoint if the
  review path moves.
- [x] Rewire or hide `EditorPanel` until it uses the new record API.

CHM:

- [x] Remove CHM's Explorer write proxy from the launch path.
- [x] Keep CHM as root domain/future app shell only; do not proxy Explorer
  record writes through CHM.

Docs:

- [x] Update `documentation/cloud-run-migration.md` after implementation so
  `RYU_MODE=api` no longer says review-only.
- [x] Update `documentation/RICH_RESEARCH_RECORDS.md` so routine backfills use the
  record API instead of direct Postgres edits.
- [x] Update `documentation/SEARCH_SYSTEM_PLAN.md` to describe server-backed record
  search and localization filters.
- [x] Update `documentation/language-migration-plan.md` with localization coverage
  filter semantics.
- [x] Update `documentation/cloud-run-migration.md` after token auth ships so it
  describes direct Explorer IAP for humans and bearer-token API access for
  agents.
- [x] Update CHM `docs/deploy.md` and `docs/security-audit.md` after removing
  the Explorer write proxy from the launch path.

## Suggested Implementation Order

1. Define record contracts, response DTOs, and authorization access levels.
2. Add read-only SQL-backed `GET /api/records` and `GET /api/records/:id` with
   localization and review filters.
3. Switch the browser search/directory to the read API where practical.
4. Add private `PATCH /api/records/:id` for targeted updates.
5. Add `PUT /api/records/:id` for full record writes.
6. Add delete with admin-only, mandatory dry-run behavior.
7. Remove legacy direct database-backed MCP server entrypoints. Do not rebuild
   MCP in this refactor.
8. Add bearer-token auth in `RYU_MODE=api`, including token hash config, scopes,
   fail-closed behavior, and tests.
9. Enforce reviewer-only `human_reviewed`, semantic dry-runs, optimistic
   concurrency, structured audit logging, and token-based rate limiting.
10. Remove CHM write-proxy auth from the launch path.
11. Change `explorer-api` Cloud Run reachability for normal HTTPS API access
   only after bearer-token auth is deployed and verified.
12. Issue a writer token, document agent setup, and smoke test validate/apply
   from a local agent with no Cloud Run proxy, no temporary job, and no CHM
   headers.
