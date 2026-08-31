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
  /explorer/api/nodes/:id/review` requires CHM-forwarded user context and, when
  configured, a trusted caller service account header. No general node, edge,
  source, saved-view, or schema mutation routes are exposed.

Both production Explorer services should set:

```sh
APP_BASE_PATH=/explorer
RYU_DATA_BACKEND=postgres
PGHOST=/cloudsql/chm-network:us-east4:chm
PGDATABASE=explorer
```

The browser-facing `explorer` service should use `PGUSER=explorer_read`. The
browser-facing service should also set
`IAP_JWT_AUDIENCE=/projects/288836337031/global/backendServices/4582439918390522076`.
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

The details panel shows record and review state for selected nodes:

- `recordDepth` is read-only and visible to all users.
- `reviewState` is visible to all users.
- Authenticated/author builds render `reviewState` as a dropdown.
- Authenticated/author builds show `reviewerNote`, `reviewer`, and
  `lastReviewed` in the embedded review form.
- The form sends only `reviewState` and `reviewerNote`; Explorer sets
  `reviewer` from CHM/IAP identity and `lastReviewed` server-side.

The browser review helper calls the CHM proxy path by default:

```text
/api/explorer/nodes/:id/review
```

Set `VITE_REVIEW_API_BASE_PATH` only if the CHM proxy path changes. Set
`VITE_CAN_REVIEW_NODES=false` for read-only/static builds that should display
review fields without edit controls.

## Current Deployment

Last verified on 2026-08-31:

- Source commit: `6a03086`
- Image: `us-east4-docker.pkg.dev/chm-network/chm-apps/explorer@sha256:e2b744ed43b60f99e6740e5e2a156c8bffc39192a75ff7a2af6dac17e471f29e`
- Browser-facing Cloud Run revision: `explorer-00009-75l`
- Private API Cloud Run revision: `explorer-api-00008-mhc`
- IAP backend service ID: `4582439918390522076`
- Seeded Cloud SQL rows: `102` sources, `117` nodes, `139` edges, `10`
  routes, and `2` saved views
- Private review write probe: `fishbase` updated to
  `reviewState=needs_human_review`, `reviewer=danny@oceanagentics.com`, and
  `lastReviewed=2026-08-31T14:37:09.097Z`

## Build Image

Build the Explorer container image into the shared CHM Artifact Registry repo:

```sh
gcloud builds submit \
  --region us-east4 \
  --config cloudbuild.yaml \
  --substitutions _IMAGE=us-east4-docker.pkg.dev/chm-network/chm-apps/explorer:$(git rev-parse --short HEAD) \
  .
```

The Docker build sets `APP_BASE_PATH=/explorer` so Vite emits asset URLs under
`/explorer/assets/...`.

## Supported Update Paths

Use these paths for Explorer/Ryu updates:

1. Commit-only update: use for source review, handoff, and release traceability.
   A Git commit does not publish Explorer unless an external build/deploy
   trigger is explicitly configured.
2. Routine app publish: use for UI, API, runtime, and other app-only changes.
   Commit the Ryu source, build an immutable Explorer image with Cloud Build,
   deploy that image to both `explorer` and `explorer-api`, and run the smoke
   checks below.
3. Terraform image rollout: use when CHM Terraform should remain the deployment
   record. Build the immutable Explorer image first, then apply CHM Terraform
   with the new image digest for `explorer` and `explorer-api`.

Do not use the removed VM/static publish flow. Use a broader Terraform change
only when shared CHM infrastructure, routing, IAP, service accounts, secrets,
Cloud SQL, runtime environment, or schema-change wiring needs to change.

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
  -X PATCH http://127.0.0.1:8788/explorer/api/nodes/test-node/review \
  -H 'Content-Type: application/json' \
  --data '{"reviewState":"human_reviewed"}'
```

Expected result for the write check is `403` with `{"error":"writes_disabled"}`.

Private review path through CHM:

```text
PATCH /api/explorer/nodes/:id/review
```

The body may contain only `reviewState` and `reviewerNote`. CHM forwards the
IAP email to Explorer, and Explorer stores that email as `reviewer` plus a
server-side `lastReviewed` timestamp in `nodes.review_json`.

For the internal-only `explorer-api` service, CHM must call from Direct VPC
egress with `all-traffic` through a subnet that has Private Google Access
enabled. Without that network shape, calls to the `run.app` URI are treated as
external direct requests and receive a Google platform `404` before reaching
Explorer.

After CHM routes `/explorer` to Cloud Run, verify:

```sh
curl -I https://chm.oceanagentics.org/explorer
```

Unauthenticated browser requests should be redirected by IAP before reaching
Explorer. Fetching `/explorer/api/graph/bootstrap` on the public hostname
requires an authenticated IAP session; a plain unauthenticated `curl` should not
return graph JSON.

Private backend verification completed on 2026-08-31 with a temporary Cloud Run
job running as `chm-sa`. The job updated `fishbase` through
`PATCH /explorer/api/nodes/fishbase/review` and verified expected denials for
unsupported fields, missing user context, wrong caller headers, and the absent
general node write route. The temporary job was deleted afterward. The remaining
manual check is the signed-in browser form click-through through CHM/IAP.
