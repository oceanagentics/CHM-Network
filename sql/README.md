# CHM SQLite Prototype

This folder turns the planning notes into a concrete SQLite prototype.

## Files

- `chm_schema.sql`
- `chm_seed_japan.sql`

## Load Into SQLite

```sh
sqlite3 /tmp/chm-network.sqlite ".read /Users/danvallentyne/dev/oceanagentics/CHM-Network/sql/chm_schema.sql" ".read /Users/danvallentyne/dev/oceanagentics/CHM-Network/sql/chm_seed_japan.sql"
```

## Quick Checks

```sql
SELECT kind, COUNT(*) AS count
FROM entities
GROUP BY kind
ORDER BY kind;
```

```sql
SELECT
  r.id,
  s.name AS source_name,
  r.type,
  t.name AS target_name,
  i.name AS interface_name,
  r.status
FROM relationships r
JOIN entities s ON s.id = r.source_entity_id
JOIN entities t ON t.id = r.target_entity_id
LEFT JOIN entities i ON i.id = r.interface_entity_id
ORDER BY r.id;
```

```sql
SELECT
  e.name,
  src.title,
  es.claim_type
FROM entity_sources es
JOIN entities e ON e.id = es.entity_id
JOIN sources src ON src.id = es.source_id
ORDER BY e.name, src.title;
```

## Notes

- `entities.parent_entity_id` stores the durable containment hierarchy.
- `relationships` stores non-hierarchical connections and claims.
- `sources`, `entity_sources`, and `relationship_sources` keep provenance explicit.
- `access_modality`, `interoperability_mode`, and `integration_tier` are included because they emerged as key dimensions in the research pack.
