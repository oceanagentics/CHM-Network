# Explorer Cloud Run Launch Notes

Explorer is the graph application formerly codenamed Ryu. CHM owns the shared
entry, IAP, load balancer, Cloud SQL instance, and path routing. This repo owns
Explorer runtime behavior, schema, seed data, validation, and the
container image. Production uses Cloud SQL/Postgres as the canonical graph
store. The tracked bootstrap JSON is repeatable seed/export material, not a
runtime database.

## Runtime Modes

- `RYU_MODE=local`: local development mode. Record read/write routes are
  available without production auth.
- `RYU_MODE=public`: browser-facing production mode. Read routes are available
  and the review endpoint returns `403 writes_disabled`.
- `RYU_MODE=api`: write-capable Explorer mode. With `IAP_JWT_AUDIENCE` set,
  human browser access is authenticated directly by Explorer/IAP. Without IAP,
  agent API access requires bearer-token auth. The API exposes
  record-oriented reads, deterministic record upserts, targeted record patches,
  review updates, and admin-gated delete dry-runs/applies. It does not expose
  raw table mutation, general node/edge/source/saved-view CRUD, bulk endpoints,
  or schema mutation routes.

Production Explorer services should set:

```sh
RYU_DATA_BACKEND=postgres
PGHOST=/cloudsql/chm-network:us-east4:chm
PGDATABASE=explorer
```

The launch human Explorer service should set `APP_BASE_PATH=/explorer`, use
`PGUSER=explorer_write`, set `RYU_MODE=api`, and validate IAP directly with
`IAP_JWT_AUDIENCE`. The private `explorer-api` service should use
`PGUSER=explorer_write`, set `RYU_MODE=api`, set `APP_BASE_PATH=/`, omit
`IAP_JWT_AUDIENCE`, and use `RYU_API_TOKENS_JSON` for agent bearer-token auth.
Postgres setup SQL removes Cloud SQL's default elevated role membership from
`explorer_read`, `explorer_write`, and `explorer_schema_admin`; only
`explorer_schema_admin` keeps schema `CREATE` rights.

## Review UI

This section describes the currently deployed Explorer review UI and private
review API.

The details panel shows record and localization review state for selected nodes:

- `recordDepth` is read-only and visible to all users.
- The resolved localization's `reviewState` is visible to all users.
- Valid `reviewState` values are `agent_researched`, `human_reviewed`, and
  `needs_revision`.
- Authenticated/author builds render `reviewState` as a dropdown.
- Authenticated/author builds show `reviewerNote`, `reviewer`, and
  `lastReviewed` in the embedded review form.
- The form sends `locale`, `reviewState`, and `reviewerNote`; Explorer sets
  `reviewer` from direct IAP identity and `lastReviewed` server-side.
- The public build checks the `chm_admin_hint` cookie before mounting React. If
  the cookie is present, `/explorer` redirects to `/explorer/admin` while
  preserving the current query string and hash. Without the cookie, anonymous
  users remain on the public read-only view.
- Unauthenticated public Explorer deployments should omit `IAP_JWT_AUDIENCE`;
  that makes Explorer redact reviewer notes, reviewer identity, last-reviewed
  timestamps, route targets, and local source paths from public
  APIs.

The browser review helper calls Explorer directly:

```text
/explorer/admin/api/records/:id/review
```

Set `VITE_CAN_REVIEW_NODES=false` for read-only/static builds that should
display review fields without edit controls.

## Record API

Explorer now has a record-oriented API surface. These routes are relative to
the service base path:

- `GET /api/records`
- `GET /api/records/:id`
- `PUT /api/records/:id`
- `PATCH /api/records/:id`
- `PATCH /api/records/:id/review`
- `DELETE /api/records/:id`

The list endpoint is SQL-backed and supports `q`, `kind`, `geography`,
`dataType`, `recordDepth`, `reviewState`, `locale`, `localeMode`,
`localeAvailability`, `reviewLocale`, `routeStatus`, `routeCapability`,
`accessType`, `accessMethod`, `include`, `limit`, and `cursor`.

Content writes reject review and audit fields. Full writes use deterministic
caller-supplied IDs and transactional upserts; repeated requests with the same
ID do not need a separate idempotency table. Applied writes require a
`recordUpdatedAt` precondition. Deletes require admin access, a fresh dry-run
`impactHash`, and the same `recordUpdatedAt` precondition.

## Current Deployment

Last verified on 2026-09-03:

- Source commit: `d6b6992`
- Public image: `us-east4-docker.pkg.dev/chm-network/chm-apps/explorer-public@sha256:25e761049522571b0f0fb0521830c54418b8d12dca5ee91a9842d200bfe40ab5`
- Admin image: `us-east4-docker.pkg.dev/chm-network/chm-apps/explorer-admin@sha256:09c40f273c50c00d13b9a30ec1109a16da224b3729a054b22b0ec01b5a56d07f`
- API image: `us-east4-docker.pkg.dev/chm-network/chm-apps/explorer-api@sha256:0f6c8ae7c27e8d97964c571d40b418d04722afdd5e0364757424956e747a6c6e`
- Public Cloud Run revision: `explorer-00018-7qw`
- Admin Cloud Run revision: `explorer-admin-00008-qz9`
- API Cloud Run revision: `explorer-api-00016-bpt`
- Admin IAP backend service ID: `5570063593656309274`
- Cloud SQL rows after language migration: `102` sources, `117` nodes, `117`
  node localizations, `139` edges, `10` routes, and `2` saved views
- Language migration backup: Cloud SQL backup `1788227781465`
- Language migration execution: `explorer-lang-migration-226fc2c-klgm5`,
  backfilled `117` localization rows
- Post-deploy routed smoke: `/explorer/`, `/explorer/admin/`, and
  `/explorer/api/graph/bootstrap` returned `200`; the public bootstrap reported
  `117` nodes, `139` edges, `102` sources, `117` localization rows, locale
  `en`, review states `116` `agent_researched` and `1` `needs_revision`, `0`
  public routes, and no obsolete node text/review fields.
- Live agent API smoke verified that `/api/records` reaches Explorer API rather
  than IAP/CHM: unauthenticated list returned JSON `401 missing_bearer_token`,
  invalid bearer returned `403 invalid_bearer_token`, writer-token list returned
  `200`, `validateOnly` patch returned `200`, and a throwaway record
  create/delete cycle returned `200` then `404` after cleanup.
- Three-state review schema normalization completed on 2026-08-31. Before:
  `99` `unreviewed`, `16` `agent_researched`, and `2`
  `needs_human_review`. After normalization and smoke probes, the public
  bootstrap currently reports `115` `agent_researched`, `1` `human_reviewed`,
  and `1` `needs_revision`.
- Private review write probe: `fishbase` updated to
  `reviewState=human_reviewed`, `reviewer=danny@oceanagentics.com`, and
  `lastReviewed=2026-08-31T19:45:32.457Z`; removed review state
  `needs_human_review` returned `400 invalid reviewState`.

## Build Image

Build Explorer images into the shared CHM Artifact Registry repo with cache
image substitutions so unchanged dependency layers are reused when
`package-lock.json` has not changed.

```sh
SHA=$(git rev-parse --short HEAD)

gcloud builds submit \
  --region us-east4 \
  --config cloudbuild.release.yaml \
  --substitutions _PUBLIC_IMAGE=us-east4-docker.pkg.dev/chm-network/chm-apps/explorer-public:${SHA},_PUBLIC_CACHE_IMAGE=us-east4-docker.pkg.dev/chm-network/chm-apps/explorer-public:latest,_ADMIN_IMAGE=us-east4-docker.pkg.dev/chm-network/chm-apps/explorer-admin:${SHA},_ADMIN_CACHE_IMAGE=us-east4-docker.pkg.dev/chm-network/chm-apps/explorer-admin:latest \
  .
```

A 2026-09-01 benchmark of this paired public/admin path built both warmed-cache
images in `49s`, down from `4m22s` for separate public/admin submissions using
the prior Dockerfile layout on the same default Cloud Build worker. The first
optimized production-style run took `4m14s` because it rebuilt and pushed cache
tags from the old Dockerfile layout. The Dockerfile keeps mode-specific Vite
build arguments after `npm ci` and the server build so public/admin variants
reuse dependency and server layers.

For API/server-only changes, build the API service image instead:

```sh
gcloud builds submit \
  --region us-east4 \
  --config cloudbuild.yaml \
  --substitutions _IMAGE=us-east4-docker.pkg.dev/chm-network/chm-apps/explorer-api:${SHA},_CACHE_IMAGE=us-east4-docker.pkg.dev/chm-network/chm-apps/explorer-api:latest,_APP_BASE_PATH=/,_VITE_APP_MODE=public,_VITE_CAN_REVIEW_NODES=false \
  .
```

Then deploy only the affected service:

```sh
gcloud run deploy explorer --project chm-network --region us-east4 --image us-east4-docker.pkg.dev/chm-network/chm-apps/explorer-public:${SHA} --quiet
gcloud run deploy explorer-admin --project chm-network --region us-east4 --image us-east4-docker.pkg.dev/chm-network/chm-apps/explorer-admin:${SHA} --quiet
gcloud run deploy explorer-api --project chm-network --region us-east4 --image us-east4-docker.pkg.dev/chm-network/chm-apps/explorer-api:${SHA} --quiet
```

The Docker build uses `APP_BASE_PATH` so Vite emits asset URLs under the matching
base path: `/explorer/assets/...` for public and `/explorer/admin/assets/...`
for admin.

## Supported Update Paths

Use these paths for Explorer/Ryu updates:

1. Commit-only update: use for source review, handoff, and release traceability.
   A Git commit does not publish Explorer unless an external build/deploy
   trigger is explicitly configured.
2. Routine fast deploy: use for UI, API, runtime, and other app-only changes.
   Commit the Ryu source, build the affected immutable image with Cloud Build,
   deploy it to the existing Cloud Run service with `gcloud run deploy --image`,
   and run the smoke checks below. Public UI maps to `explorer`, admin UI maps
   to `explorer-admin`, and API/server changes map to `explorer-api`.
3. Terraform change: use only when shared CHM infrastructure, routing, IAP,
   service accounts, secrets, Cloud SQL, runtime environment, or schema-change
   wiring needs to change. Do not run Terraform for image-only app deploys.

Do not use the removed VM/static publish flow. If a fast deploy causes Terraform
to report image drift later, do not roll the app image back just to satisfy
Terraform.

## Postgres Shape And Seed Data

The current Postgres shape is captured in
`server/schema/001_create_explorer_schema.sql`. It records the launch
tables, indexes, and role grants that were applied to Cloud SQL database
`explorer`.

The initial database setup and seed have already been applied in production.
There is no standing Cloud Run setup or check job. When a real schema change is
needed later, design that change runner deliberately instead of preserving the
launch setup job.

The initial seed came from `client/dist/bootstrap.public.json` in the launch
image. That JSON remains useful as an export/seed artifact, but Cloud SQL is now
canonical and production should not reseed from it as a routine deploy step.

The seeded core tables are:

- `sources`
- `nodes`
- `edges`
- `ryu_routes`
- `saved_views`

Current Cloud SQL seed counts on 2026-08-28:

- `sources`: 102
- `nodes`: 117
- `edges`: 139
- `ryu_routes`: 10
- `saved_views`: 2

## Smoke Checks

Local public-mode smoke test:

```sh
APP_BASE_PATH=/explorer RYU_MODE=public PORT=8788 npm --workspace server run start
curl -fsS http://127.0.0.1:8788/healthz
curl -fsS http://127.0.0.1:8788/explorer/api/graph/bootstrap
curl -sS -o /tmp/ryu-write-response.json -w '%{http_code}' \
  -X PATCH http://127.0.0.1:8788/explorer/api/records/test-node/review \
  -H 'Content-Type: application/json' \
  --data '{"locale":"en","reviewState":"human_reviewed"}'
```

Expected result for the write check is `403` with `{"error":"writes_disabled"}`.

Agent review path:

```text
PATCH /api/records/:id/review
```

Agent requests include `Authorization: Bearer $RYU_API_TOKEN`. Human browser
requests use direct Explorer/IAP auth instead of CHM-forwarded identity headers.

After CHM routes `/explorer` and `/explorer/admin` to Cloud Run, verify:

```sh
curl -I https://chm.oceanagentics.org/explorer
curl -I https://chm.oceanagentics.org/explorer/
curl -I https://chm.oceanagentics.org/explorer/admin
curl -sS https://chm.oceanagentics.org/explorer/api/graph/bootstrap
```

Unauthenticated `/explorer` should return public read-only Explorer. The public
bootstrap should return graph JSON with reviewer metadata, raw review JSON,
route targets, and source local paths redacted. Unauthenticated
`/explorer/admin` should redirect through IAP before reaching Explorer admin.

Agent API verification should use a bearer token against
`https://chm.oceanagentics.org/api/records`. The signed-in browser check should
exercise direct Explorer/IAP review at `/explorer/admin`.
