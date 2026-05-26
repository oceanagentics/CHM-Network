# CHM Network Agent Notes

## Canonical Graph Data
- Treat `data/chm-network.sqlite` as the canonical graph during active editing.
- Do not hand-edit `sql/chm_seed_japan.sql` for routine graph changes.
- `sql/chm_schema.sql` and `sql/chm_seed_japan.sql` are bootstrap/reset inputs only.

## Write Surfaces
### In-app editor
- Start the API: `npm --workspace server run start`
- Start the client: `npm --workspace client run dev -- --host 127.0.0.1 --port 5173`
- Open `http://127.0.0.1:5173`
- Use the left-rail `Editor` panel.
- Modes:
  - `Entities`
  - `Relationships`
  - `Sources`
- Selecting a node opens that entity.
- Selecting an edge opens that relationship.
- Saving or deleting refetches `/api/graph/bootstrap` and redraws the graph.

### API write endpoints
- `POST /api/entities`
- `PUT /api/entities/:id`
- `DELETE /api/entities/:id`
- `POST /api/relationships`
- `PUT /api/relationships/:id`
- `DELETE /api/relationships/:id`
- `POST /api/sources`
- `PUT /api/sources/:id`
- `DELETE /api/sources/:id`

## Current Minimal Model
### Entity kinds
- `country`
- `organization`
- `system`

### Relationship types
- `part_of`
- `operates`
- `publishes_to`
- `syncs_to`

## Validation Rules
### Entities
- `country` has no parent.
- `system` has no parent.
- `organization.parentEntityId` may target only `country` or `organization`.

### Relationships
- `part_of`: `organization -> organization|country`
- `operates`: `organization -> system`
- `publishes_to`: `organization -> system`
- `syncs_to`: `system -> system`

## Provenance and Metadata
- Link sources through `entity_sources` and `relationship_sources`.
- Relationship metadata such as `transferMethod`, `format`, `standard`, and `artifact` belongs in `relationships.properties_json`.
- The editor sends provenance links inline with entity and relationship saves and replaces those links transactionally.

## Reset Behavior
- On startup, the server checks the local DB for stale legacy graph rows.
- If legacy kinds or relationships are found, the server resets the local DB from the minimal schema and seed before serving requests.
- After that reset, the live DB is the source of truth.

## GCP Environment
- Organization: `oceanagentics.com`
- Project: `chm-network` (`288836337031`)
- VM: `chm-network-vm`
- Zone: `us-west1-b`
- Machine type: `e2-micro`
- Public URL: `http://34.169.201.150`
- The VM currently serves the public read-only build with `nginx` from `/var/www/chm-network`.
- Port `80` and `443` are open via firewall rule `chm-network-allow-web`.
- The VM's external IP is currently ephemeral. If the instance is stopped and started, the IP may change until a static IP is attached.

## Public Publishing
- Build the public static bundle with `npm run build:public`.
- The public build uses `client/.env.public` and reads from `/bootstrap.public.json` instead of the live API.
- The export step writes the sanitized bootstrap file to `client/public/bootstrap.public.json`.
- Upload the built site to the VM with `gcloud compute scp --recurse client/dist chm-network-vm:~/ --project chm-network --zone us-west1-b`.
- Publish it on the VM with:
  - `gcloud compute ssh chm-network-vm --project chm-network --zone us-west1-b`
  - `sudo mkdir -p /var/www/chm-network`
  - `sudo cp -r ~/dist/. /var/www/chm-network/`
  - `sudo chown -R www-data:www-data /var/www/chm-network`
  - `sudo nginx -t && sudo systemctl restart nginx`
- Verify with `curl -I http://34.169.201.150` and `curl http://34.169.201.150/bootstrap.public.json`.
- GCS static hosting is not the active publish path. Public bucket access was blocked by the org's domain-restricted sharing policy.
