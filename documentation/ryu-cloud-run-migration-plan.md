# CHM And Explorer Cloud Run Launch Plan

Date: 2026-08-20
Updated: 2026-08-31

## Purpose

Launch Explorer, the networking graph application formerly codenamed Ryu, as a CHM app on Google Cloud.

CHM is the official entry app, IAP-protected portal, application switcher, and shared loader. Explorer is the graph application mounted under CHM with a public read-only view at `/explorer` and an IAP-protected admin view at `/explorer/admin`.

Use one shared domain with path routing:

```text
https://chm.oceanagentics.org/
https://chm.oceanagentics.org/login
https://chm.oceanagentics.org/explorer
https://chm.oceanagentics.org/explorer/admin
https://chm.oceanagentics.org/otherapp1
https://chm.oceanagentics.org/otherapp2
```

Use Identity-Aware Proxy (IAP) as the shared Google login boundary for CHM and future CHM apps. Cloud SQL PostgreSQL is canonical from launch. The initial Explorer graph uses the SQLite-derived bootstrap data, but production does not run SQLite infrastructure.

## GCP Project Decision

Use the existing Google Cloud project `chm-network` for CHM, Explorer, the shared load balancer, IAP, Cloud SQL, Artifact Registry, Secret Manager, Cloud Run services, and related deployment resources.

- Google Cloud organization: `oceanagentics.com`
- Organization number: `1005053827373`
- Operator account: `danny@oceanagentics.com`
- Primary region: `us-east4`
- Load balancer IP: `34.110.145.254`

## Live Status

As of 2026-08-31, the core launch infrastructure is deployed and matches Terraform state.

CHM:

- Cloud Run service: `chm`
- Ready revision: `chm-00010-65w`
- Image: `us-east4-docker.pkg.dev/chm-network/chm-apps/chm@sha256:5456cece6520be75630a47a0aa913d9485593ef9a8da6ff040efe29a313e04c1`
- CHM root and `/login` route through the shared HTTPS load balancer and IAP.
- CHM has `EXPLORER_API_URL`, `EXPLORER_API_AUDIENCE`, and `CHM_SERVICE_ACCOUNT_EMAIL` set.
- CHM uses Direct VPC egress through the default `us-east4` subnet with
  `all-traffic` egress so it can call the internal-only Explorer API.
- The default `us-east4` subnet is imported into Terraform with
  Private Google Access enabled and `deletion_policy = "ABANDON"`.

Explorer:

- Public browser-facing Cloud Run service: `explorer`
- Ready revision: `explorer-00013-6c6`
- IAP-protected admin Cloud Run service: `explorer-admin`
- Ready revision: `explorer-admin-00003-n7c`
- Private API Cloud Run service: `explorer-api`
- Ready revision: `explorer-api-00012-v62`
- Source commit: `4fac03e`
- Public image: `us-east4-docker.pkg.dev/chm-network/chm-apps/explorer-public@sha256:01b8723c4532b5798bc87ebae4361ae70e17057d3f20b5055ca76de9b3cb842a`
- Admin image: `us-east4-docker.pkg.dev/chm-network/chm-apps/explorer-admin@sha256:5426e7dba0a8124e81e53ddeebb2ce3d3620ce0a3249c693982ba73188b56fed`
- Final production image is Postgres-only for the default runtime path:
  - `better-sqlite3` is removed from server package dependencies and lockfile.
  - Dockerfile no longer installs native build tooling for SQLite.
  - Dockerfile no longer copies `data/`.
  - Cloud Build upload excludes `data/ryu.sqlite`.

Cloud SQL:

- Instance: `chm`
- Review-state schema normalization completed on 2026-08-31. Existing
  `unreviewed` rows were converted to `agent_researched`; existing
  `needs_human_review` rows were converted to `needs_revision`; the live
  constraint now allows only `agent_researched`, `human_reviewed`, and
  `needs_revision`.
- Deployed API smoke verified `fishbase` accepted `human_reviewed` and rejected
  removed state `needs_human_review` with `400 invalid reviewState`.
- Database: `explorer`
- Version: PostgreSQL 16
- Connectivity: private IP only through private service access
- Platform deletion protection: enabled
- App database users: `explorer_read`, `explorer_write`, `explorer_schema_admin`
- Secret Manager secrets:
  - `explorer-db-read-password`
  - `explorer-db-write-password`
  - `explorer-db-schema-admin-password`

Routing and IAP:

- URL map `chm-url-map` routes `/` and `/login` to `chm-web-backend`.
- URL map `chm-url-map` routes `/explorer` and `/explorer/*` to public
  `explorer-web-backend`.
- URL map `chm-url-map` routes `/explorer/admin` and `/explorer/admin/*` to
  IAP-protected `explorer-admin-web-backend`.
- URL map `chm-url-map` routes `/api/explorer` and `/api/explorer/*` to
  `chm-web-backend` for the CHM review proxy.
- `explorer-web-backend` has IAP explicitly disabled.
- `explorer-admin-web-backend` has IAP enabled with backend ID
  `5570063593656309274`.
- Explorer admin has app-level IAP JWT validation enabled with
  `IAP_JWT_AUDIENCE=/projects/288836337031/global/backendServices/5570063593656309274`.
- Private `explorer-api` remains internal-only; direct external `run.app`
  requests return a Google platform `404`.
- Unauthenticated `https://chm.oceanagentics.org/` returns an IAP-generated `302`.
- Unauthenticated `https://chm.oceanagentics.org/explorer` returns a normal
  `301` to `/explorer/`; `/explorer/` returns public Explorer HTML.
- Unauthenticated `https://chm.oceanagentics.org/explorer/admin` returns an
  IAP-generated `302`.
- Unauthenticated `PATCH https://chm.oceanagentics.org/api/explorer/nodes/fishbase/review`
  returns an IAP-generated `401`.
- Direct public Explorer writes to
  `PATCH https://chm.oceanagentics.org/explorer/api/nodes/fishbase/review`
  return `403 writes_disabled`.
- Public Explorer bootstrap returns real graph data with reviewer metadata, raw
  review JSON, route targets, and source local paths redacted.

Database setup, seed, and verification:

- Postgres schema setup completed successfully:
  - Cloud Run job: `explorer-migrate`
  - Execution: `explorer-migrate-b6rhr`
  - Log: `Applied 001_create_explorer_schema.sql`
- Seeded initial Explorer graph data from deployed `client/dist/bootstrap.public.json`:
  - Cloud Run job: `explorer-migrate`
  - Execution: `explorer-migrate-kwmlx`
  - Sources: `102`
  - Nodes: `117`
  - Edges: `139`
  - Ryu routes: `10`
  - Saved views: `2`
- Read-only Cloud SQL verification completed successfully:
  - Cloud Run job: `explorer-db-check`
  - Execution: `explorer-db-check-7gpt7`
  - Tables present: `edges`, `nodes`, `ryu_routes`, `saved_views`, `sources`
  - Verified counts: `102` sources, `117` nodes, `139` edges, `10` ryu routes, `2` saved views.
- Clean database privilege probe completed successfully:
  - Read role execution: `explorer-priv-probe-read-20260828-jhtqw`
  - Write role execution: `explorer-priv-probe-write-20260828-rtbrx`
  - Schema-admin role execution verified schema creation in a rolled-back transaction.
  - `explorer_read` can select `117` nodes but cannot insert or create tables.
  - `explorer_write` can insert inside a rolled-back transaction but cannot create tables.
  - `explorer_schema_admin` can create tables inside a rolled-back transaction.
- Private review API probe completed successfully on 2026-08-31:
  - A VPC-shaped request from a temporary Cloud Run job running as `chm-sa`
    reached `explorer-api` and returned an app JSON `404` for a missing node.
  - The production `fishbase` node was updated through the narrow review path
    as `danny@oceanagentics.com` on the clean committed Explorer image.
  - `explorer-api` returned the expected denial statuses for extra fields
    (`400`), missing user context (`401`), wrong caller header (`403`), and the
    absent general node write route (`404`).

Cloud Run jobs:

- Standing jobs currently present: none.
- Manual setup/check jobs `explorer-migrate` and `explorer-db-check` were deleted after launch setup and verification.
- Temporary privilege-probe and review-probe jobs were deleted after successful
  verification.
- Future database schema changes should get a deliberate change-runner design when needed rather than preserving launch-era jobs.

Terraform:

- Terraform installed locally: `v1.15.8`
- `terraform fmt`: passed
- `terraform validate`: passed
- Current Terraform plan with live state and deployed image digests: `No changes`

## CHM Owns

CHM owns the shared entry and platform layer:

- `chm.oceanagentics.org` and `chm.oceanagentics.com`
- Global external HTTPS Application Load Balancer
- Google-managed certificates
- URL map and path routing
- IAP policy on protected backend services
- CHM Cloud Run service
- Application switcher and loader
- CHM-side app registry
- CHM-side `PATCH /api/explorer/nodes/:id/review` proxy path
- Shared Artifact Registry repository `chm-apps`
- Shared Cloud SQL instance `chm`
- Shared Secret Manager usage pattern
- Shared service-account patterns for app services, build jobs, and explicit schema/setup work
- Terraform ownership of shared infrastructure and app slices

CHM should create one database per app inside the shared Cloud SQL instance where reuse is appropriate, for example:

```text
chm Cloud SQL instance
  explorer database
  otherapp1 database
  otherapp2 database
```

Each app should still get separate service accounts, secrets, and database users.

## Explorer Owns

Explorer owns the graph application layer:

- Browser-facing graph UI under `/explorer`
- Express API behavior and validation
- Postgres-backed repository implementation
- Postgres schema reference and graph data model
- App-level read and browser-review behavior
- Write validation and audit logging
- Runtime split between:
  - `RYU_MODE=public` for browser-facing read-only service
  - `RYU_MODE=api` for the private browser-review service
- Container source and application code in the Explorer/Ryu repo

Explorer should not own login UX, domain policy, broad user access, or shared CHM app switching.

## Access Model

Public browser read path:

```text
Browser
  -> chm.oceanagentics.org
  -> HTTPS load balancer
  -> /explorer
  -> Cloud Run explorer
  -> Cloud SQL explorer database using explorer_read
```

Authenticated browser admin read path:

```text
Browser
  -> chm.oceanagentics.org
  -> HTTPS load balancer
  -> IAP
  -> /explorer/admin
  -> Cloud Run explorer-admin
  -> Cloud SQL explorer database using explorer_read
```

Browser review path:

```text
Browser
  -> /explorer/admin behind IAP
  -> CHM validates IAP identity
  -> CHM PATCH /api/explorer/nodes/:id/review
  -> CHM calls private explorer-api as chm-sa
  -> explorer-api validates trusted caller and forwarded user context
  -> Cloud SQL explorer database using explorer_write
```

Database access:

- Public/browser-facing Explorer service uses `explorer_read`.
- Admin/browser-facing Explorer service uses `explorer_read`.
- Private Explorer API service uses `explorer_write` only for the narrow node review update.
- Explicit schema/setup work uses `explorer_schema_admin` only when a deliberate database change is being applied.
- Do not put write or schema-admin credentials in the browser-facing service.
- Do not grant schema-admin password access to CHM or normal app runtime services.

## Done

- Confirmed active GCP account and project:
  - `danny@oceanagentics.com`
  - `chm-network`
- Installed Terraform.
- Initialized, formatted, validated, planned, and applied CHM Terraform.
- Enabled required APIs, including:
  - Cloud Run
  - Cloud Build
  - Artifact Registry
  - Compute
  - IAP
  - Secret Manager
  - SQL Admin
  - Service Networking
- Created private service access for Cloud SQL.
- Created Cloud SQL PostgreSQL instance `chm`.
- Created `explorer` database and app-specific DB users.
- Created Explorer runtime service accounts:
  - `explorer-sa`
  - `explorer-api-sa`
  - `explorer-schema-admin-sa`
  - `explorer-build-sa`
- Created Explorer DB password secrets and IAM access.
- Built and pushed final Explorer public and admin images.
- Deployed public browser-facing `explorer` service.
- Deployed IAP-protected `explorer-admin` service.
- Deployed private `explorer-api` service.
- Deployed CHM image with the narrow Explorer review API proxy configuration.
- Added CHM Direct VPC egress and enabled Private Google Access on the default
  `us-east4` subnet so CHM can reach internal-only `explorer-api`.
- Created `/explorer`, `/explorer/admin`, and `/api/explorer` load-balancer routing.
- Enabled Explorer admin app-level IAP JWT validation.
- Removed obsolete failed Cloud Run jobs:
  - `explorer-import`
  - `explorer-api-probe`
  - `explorer-api-probe2`
- Applied the Postgres schema setup.
- Seeded the initial Explorer graph from the deployed bootstrap JSON.
- Verified read-only Cloud SQL access, launch schema, and seeded row counts.
- Verified Explorer read/write/schema-admin database privilege separation with a clean probe.
- Moved Explorer `public` schema ownership and all Explorer table ownership to
  `explorer_schema_admin`.
- Removed the old schema-setup SQL user, password secret, service account, IAM
  bindings, and generated password state from Terraform-managed infrastructure.
- Invalidated the temporary `postgres` admin password used for the handoff and
  deleted the temporary Secret Manager secret, local password files, and Cloud
  Run job.
- Verified public IAP redirects on `/` and `/explorer/admin`.
- Verified unauthenticated public `/explorer/` loads real graph data with
  server-side redaction.
- Verified authenticated browser loading of real Explorer graph data.
- Deleted unmanaged setup/check Cloud Run jobs `explorer-migrate` and `explorer-db-check`.
- Removed local ignored SQLite database files and the obsolete VM/static publish script.
- Enabled and verified Cloud SQL platform deletion protection for instance `chm`.
- Verified the private Explorer review API write path and denial cases.
- Verified Terraform drift with current deployed image digests: no pending changes.

## Left To Finish

The launch path is operational for public read access, authenticated admin read
access, and the private backend review API path. Remaining work is the human
browser click-through for the signed-in review form:

1. Verify CHM-to-Explorer review path after authenticated browser login at
   `/explorer/admin`:
   - Exercise a real `PATCH /api/explorer/nodes/:id/review` action.
   - Confirm `explorer-api` receives the call.
   - Confirm write audit logging includes CHM service account and user identity.
   - Confirm `reviewState`, `reviewerNote`, `reviewer`, and `lastReviewed` land in Cloud SQL through `explorer_write`.
   - Use only the current review states: `agent_researched`,
     `human_reviewed`, and `needs_revision`.

2. Keep likely unused API disablement accepted as low-risk cleanup, not launch work:
   - Current CHM/Explorer code and Terraform do not need Analytics Hub, the BigQuery family, Dataform, Dataplex, Datastore, Pub/Sub, Cloud Trace, Container Registry, Network Management, or OS Login.
   - No resources were found behind those services, and no-force disablement is blocked by a Google baseline dependency.
   - Revisit only if the project scope changes or a later audit finds active resources.

## Public Explorer Strategy

Implemented on 2026-08-31. The safe public model is to make public Explorer
read-only and keep review writes behind CHM/IAP:

- Serve public Explorer on `chm.oceanagentics.org/explorer`.
- Keep CHM portal/login and the review proxy protected by IAP.
- Serve authenticated review UI on `/explorer/admin`.
- Use a public Explorer build with review controls disabled
  (`VITE_APP_MODE=public` or `VITE_CAN_REVIEW_NODES=false`).
- Use an admin Explorer build with `APP_BASE_PATH=/explorer/admin` and author
  review controls enabled.
- Keep the public Explorer Cloud Run service in `RYU_MODE=public`, using only
  `explorer_read` database credentials.
- Keep `explorer-api` internal-only, using `explorer_write`, and invokable only
  by `chm-sa`.
- Keep Cloud Run ingress restricted to internal-and-load-balancer traffic so
  raw `run.app` URLs cannot bypass the load balancer. Public `explorer` uses
  Cloud Run `invoker_iam_disabled=true`; protected `explorer-admin` remains
  invokable only by the IAP service agent.

## Current Blockers

No Terraform, build, Cloud SQL, Cloud Run deployment, IAP JWT validation,
authenticated read, private API network, database privilege-separation, or
backend review-write blocker remains.

The only remaining Phase 0 verification gap is an authenticated browser
application action through CHM/IAP. CLI checks can prove IAP redirects, service
readiness, routing, image digests, Cloud SQL access, role privileges, direct
URL denial, and private API review writes. The in-app browser is still waiting
at Google sign-in, so the UI form click-through needs a signed-in session.

## Working Tree Reconciliation

CHM repo:

- Documentation changes reconcile the security audit, deploy guide, and server migration notes with live Explorer launch state.
- `infra/cloud-sql.tf` contains the applied Cloud SQL platform deletion-protection setting: `deletion_protection_enabled = true`.
- `infra/network.tf` imports the existing default `us-east4` subnet, enables
  Private Google Access, and abandons rather than deletes the subnet if the
  resource is ever removed from Terraform.
- `infra/cloud-run.tf` gives CHM Direct VPC egress with `ALL_TRAFFIC` for the
  internal-only Explorer API call path.
- Keep that Terraform change separate from docs if committing in small reviewable units.

Explorer/Ryu repo:

- Current Ryu changes are intentional launch work: Cloud Run packaging, Postgres runtime, runtime modes, Postgres schema reference, IAP/review-path handling, seed/bootstrap data, route contracts, map assets, and gallery asset relocation.
- The local Explorer server contract and Postgres repository now expose only the node review mutation for writes: `reviewState` and `reviewerNote` in the request, with `reviewer` and `lastReviewed` set by the server.
- The local Explorer details UI now shows record depth and review state, and in authenticated/author mode lets users update review state and reviewer note through the CHM review API path.
- Production dependency posture is Postgres-only: `better-sqlite3` is removed from production package dependencies and lockfile, the deployed image does not copy `data/`, and local ignored SQLite database files have been deleted.
- Obsolete VM/static publishing infrastructure has been removed.
- Current validation passed: Explorer server typecheck, Explorer server tests, CHM tests, Terraform formatting, and Terraform validation.

## Non-Goals

- Do not migrate from a VM as part of this launch.
- Do not run SQLite infrastructure as part of this launch.
- Do not expose direct database access to browsers.
- Do not let MCP or any private API become a side door around CHM/IAP validation.
- Do not enable public write access.

## Reusable CHM Services

The following services should be reusable for future CHM apps:

- Google Cloud project `chm-network`
- Domain and HTTPS load balancer
- IAP access boundary
- Artifact Registry repository `chm-apps`
- Cloud Build source/build pattern
- Cloud SQL instance `chm`
- Secret Manager
- Service Networking private access
- Terraform module/pattern for:
  - app Cloud Run service
  - app private API service
  - app database
  - app read/write/schema users
  - app secrets
  - app URL path route
  - app IAP binding

Reuse should not mean shared credentials. Each app gets separate databases or schemas, users, service accounts, and secrets.

## Operational Commands

Final deployed image references:

```text
CHM:
us-east4-docker.pkg.dev/chm-network/chm-apps/chm@sha256:5456cece6520be75630a47a0aa913d9485593ef9a8da6ff040efe29a313e04c1

Explorer public:
us-east4-docker.pkg.dev/chm-network/chm-apps/explorer-public@sha256:01b8723c4532b5798bc87ebae4361ae70e17057d3f20b5055ca76de9b3cb842a

Explorer admin:
us-east4-docker.pkg.dev/chm-network/chm-apps/explorer-admin@sha256:5426e7dba0a8124e81e53ddeebb2ce3d3620ce0a3249c693982ba73188b56fed
```

Terraform drift check:

```bash
terraform plan \
  -var=chm_image=us-east4-docker.pkg.dev/chm-network/chm-apps/chm@sha256:5456cece6520be75630a47a0aa913d9485593ef9a8da6ff040efe29a313e04c1 \
  -var=enable_explorer=true \
  -var=explorer_image=us-east4-docker.pkg.dev/chm-network/chm-apps/explorer-public@sha256:01b8723c4532b5798bc87ebae4361ae70e17057d3f20b5055ca76de9b3cb842a \
  -var=explorer_admin_image=us-east4-docker.pkg.dev/chm-network/chm-apps/explorer-admin@sha256:5426e7dba0a8124e81e53ddeebb2ce3d3620ce0a3249c693982ba73188b56fed \
  -var=explorer_admin_iap_backend_service_id=5570063593656309274
```

There are no standing Explorer Cloud Run jobs. Future schema changes should get
a fresh, explicit change-runner design when they are needed.
