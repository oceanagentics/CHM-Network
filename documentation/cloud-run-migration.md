# Explorer Cloud Run Launch Notes

Explorer is the graph application formerly codenamed Ryu. CHM owns the shared
entry, IAP, load balancer, Cloud SQL instance, and path routing. This repo owns
Explorer runtime behavior, schema, migrations, seed data, validation, and the
container image. Production uses Cloud SQL/Postgres; SQLite-derived data may be
used as seed content, but SQLite infrastructure should not run in production.

## Runtime Modes

- `RYU_MODE=local`: local development mode. Write routes are open, matching the
  historical local editor workflow.
- `RYU_MODE=public`: browser-facing production mode. Read routes are available
  and all write routes return `403 writes_disabled`.
- `RYU_MODE=api`: private write/admin mode. Write routes require CHM-forwarded
  user context and, when configured, a trusted caller service account header.

Production services should also set:

```sh
APP_BASE_PATH=/explorer
RYU_DATA_BACKEND=postgres
PGHOST=/cloudsql/chm-network:us-east4:chm
PGDATABASE=explorer
```

The browser-facing `explorer` service should use `PGUSER=explorer_read`. The
private `explorer-api` service should use `PGUSER=explorer_write` and
`RYU_TRUSTED_CALLER_SERVICE_ACCOUNTS=chm-sa@chm-network.iam.gserviceaccount.com`.

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

## Apply Schema And Seed Data

Use the migration-capable database user after CHM Terraform has created Cloud
SQL, the `explorer` database, database users, and Secret Manager secrets.

```sh
npm --workspace server run migrate:postgres
```

The launch seed was loaded from the deployed `client/dist/bootstrap.public.json`
into Cloud SQL. Keep that seed path Postgres-native going forward; do not add
`better-sqlite3`, `data/ryu.sqlite`, or SQLite import tooling to the production
image.

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
  -X POST http://127.0.0.1:8788/explorer/api/nodes \
  -H 'Content-Type: application/json' \
  --data '{"kind":"system","name":"Denied"}'
```

Expected result for the write check is `403` with `{"error":"writes_disabled"}`.

After CHM routes `/explorer` to Cloud Run, verify:

```sh
curl -I https://chm.oceanagentics.org/explorer
curl -fsS https://chm.oceanagentics.org/explorer/api/graph/bootstrap
```

Unauthenticated browser requests should be redirected by IAP before reaching
Explorer.
