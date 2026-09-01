# Explorer Cloud Run Launch Notes

Explorer is the graph application formerly codenamed Ryu. CHM owns the shared
entry, IAP, load balancer, Cloud SQL instance, and path routing. This repo owns
Explorer runtime behavior, schema, seed data, validation, and the
container image. Production uses Cloud SQL/Postgres as the canonical graph
store. The tracked bootstrap JSON is repeatable seed/export material, not a
runtime database.

## Runtime Modes

- `RYU_MODE=local`: local development mode. The review endpoint is available
  when caller identity headers are supplied.
- `RYU_MODE=public`: browser-facing production mode. Read routes are available
  and the review endpoint returns `403 writes_disabled`.
- `RYU_MODE=api`: private browser-review API mode. `PATCH
  /explorer/api/nodes/:id/localizations/:locale/review` requires CHM-forwarded user context and, when
  configured, a trusted caller service account header. No general node, edge,
  source, saved-view, or schema mutation routes are exposed.

Production Explorer services should set:

```sh
RYU_DATA_BACKEND=postgres
PGHOST=/cloudsql/chm-network:us-east4:chm
PGDATABASE=explorer
```

The public browser-facing `explorer` service should set
`APP_BASE_PATH=/explorer`, use `PGUSER=explorer_read`, omit
`IAP_JWT_AUDIENCE`, and run with only read-only data exposure. The
IAP-protected `explorer-admin` service should set
`APP_BASE_PATH=/explorer/admin`, use `PGUSER=explorer_read`, and set
`IAP_JWT_AUDIENCE=/projects/288836337031/global/backendServices/5570063593656309274`.
The private `explorer-api` service should use `PGUSER=explorer_write`,
`RYU_TRUSTED_CALLER_SERVICE_ACCOUNTS=chm-sa@chm-network.iam.gserviceaccount.com`,
internal-only Cloud Run ingress, and Cloud Run IAM invoker access for CHM.
`explorer-api` is not itself an IAP backend.
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
- The form sends only `reviewState` and `reviewerNote`; Explorer sets
  `reviewer` from CHM/IAP identity and `lastReviewed` server-side.
- The public build checks the `chm_admin_hint` cookie before mounting React. If
  the cookie is present, `/explorer` redirects to `/explorer/admin` while
  preserving the current query string and hash. Without the cookie, anonymous
  users remain on the public read-only view.
- Unauthenticated public Explorer deployments should omit `IAP_JWT_AUDIENCE`;
  that makes Explorer redact reviewer notes, reviewer identity, last-reviewed
  timestamps, route targets, and local source paths from public
  APIs.

The browser review helper calls the CHM proxy path by default:

```text
/api/explorer/nodes/:id/localizations/:locale/review
```

Set `VITE_REVIEW_API_BASE_PATH` only if the CHM proxy path changes. Set
`VITE_CAN_REVIEW_NODES=false` for read-only/static builds that should display
review fields without edit controls.

## Current Deployment

Last verified on 2026-09-01:

- Source commit: `2a1584a`
- Public image: `us-east4-docker.pkg.dev/chm-network/chm-apps/explorer-public@sha256:c8bc35cb5afd4d98024922161ed3e7adce3d1cacff0a46915737abb1a58c8976`
- Admin image: `us-east4-docker.pkg.dev/chm-network/chm-apps/explorer-admin@sha256:ced7700839a2b3661ac9e4e9f397dc60479895dcf1306ed09730af42a291723e`
- Public Cloud Run revision: `explorer-00016-89g`
- Admin Cloud Run revision: `explorer-admin-00006-pt7`
- Private API Cloud Run revision: `explorer-api-00014-jb8`
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
- Internal private-API smoke execution `explorer-api-smoke-226fc2c-ncg2h`
  reached `PATCH /explorer/api/nodes/fishbase/localizations/en/review` as
  `chm-sa` and received the expected `401 missing_chm_user_context` guard
  response
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

Build Explorer images into the shared CHM Artifact Registry repo with the
service-specific `latest` tag as the Docker cache source. Unchanged dependency
layers are reused when `package-lock.json` has not changed.

```sh
SHA=$(git rev-parse --short HEAD)

gcloud builds submit \
  --region us-east4 \
  --config cloudbuild.yaml \
  --substitutions _IMAGE=us-east4-docker.pkg.dev/chm-network/chm-apps/explorer-public:${SHA},_CACHE_IMAGE=us-east4-docker.pkg.dev/chm-network/chm-apps/explorer-public:latest,_APP_BASE_PATH=/explorer,_VITE_APP_MODE=public,_VITE_CAN_REVIEW_NODES=false,_VITE_REVIEW_API_BASE_PATH=/api/explorer \
  .
gcloud builds submit \
  --region us-east4 \
  --config cloudbuild.yaml \
  --substitutions _IMAGE=us-east4-docker.pkg.dev/chm-network/chm-apps/explorer-admin:${SHA},_CACHE_IMAGE=us-east4-docker.pkg.dev/chm-network/chm-apps/explorer-admin:latest,_APP_BASE_PATH=/explorer/admin,_VITE_APP_MODE=author,_VITE_CAN_REVIEW_NODES=true,_VITE_REVIEW_API_BASE_PATH=/api/explorer \
  .
```

For API/server-only changes, build the API service image instead:

```sh
gcloud builds submit \
  --region us-east4 \
  --config cloudbuild.yaml \
  --substitutions _IMAGE=us-east4-docker.pkg.dev/chm-network/chm-apps/explorer-api:${SHA},_CACHE_IMAGE=us-east4-docker.pkg.dev/chm-network/chm-apps/explorer-api:latest,_APP_BASE_PATH=/explorer,_VITE_APP_MODE=public,_VITE_CAN_REVIEW_NODES=false,_VITE_REVIEW_API_BASE_PATH=/api/explorer \
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
  -X PATCH http://127.0.0.1:8788/explorer/api/nodes/test-node/localizations/en/review \
  -H 'Content-Type: application/json' \
  --data '{"reviewState":"human_reviewed"}'
```

Expected result for the write check is `403` with `{"error":"writes_disabled"}`.

Private review path through CHM:

```text
PATCH /api/explorer/nodes/:id/localizations/:locale/review
```

The body may contain only `reviewState` and `reviewerNote`. CHM forwards the
IAP email to Explorer, and Explorer stores that email as `reviewer` plus a
server-side `lastReviewed` timestamp in `node_localizations`.

For the internal-only `explorer-api` service, CHM must call from Direct VPC
egress with `all-traffic` through a subnet that has Private Google Access
enabled. Without that network shape, calls to the `run.app` URI are treated as
external direct requests and receive a Google platform `404` before reaching
Explorer.

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

Private backend verification completed on 2026-08-31 with a temporary Cloud Run
job running as `chm-sa`. The job updated `fishbase` through
`PATCH /explorer/api/nodes/fishbase/localizations/en/review` and verified expected denials for
unsupported fields, missing user context, wrong caller headers, and the absent
general node write route. The temporary job was deleted afterward. The remaining
manual check is the signed-in browser form click-through through CHM/IAP.
