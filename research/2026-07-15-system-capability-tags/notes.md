# System Capability Tags Research Batch

Date: 2026-07-15

Scope: all current `system` entities in `data/chm-network.sqlite`.

Destination tables:

- `tags`: controlled vocabulary values for `data_format`, `read_method`, `write_method`, and `data_type`.
- `entity_tags`: system-to-tag assignments.

Research method:

1. Seeded assignments from existing source-backed system inventory fields in `entities.properties_json`: `formatsOrStandards`, `apiOrDownloadModes`, `dataTypes`, `submissionSupported`, and `researcherInteraction`.
2. Used relationship metadata for known transfer paths, especially BISMaL -> OBIS, BCO-DMO -> NCEI, EMODnet Biology -> SeaDataNet CDI, and INSDC member exchange.
3. Added supplemental official-source research for sparse platform/system records: OBIS, BISMaL, and the planned BBNJ CHM.
4. Kept source ids and notes in `system_capability_tags.csv` for traceability.

Assignment counts:

- data_format: 98
- data_type: 133
- read_method: 139
- write_method: 84

Caveats:

- `api_write` assignments are conservative when inferred from repository submission support plus API-style access. Verify before using them as operational integration paths.
- `mcp` and `email` are included in the controlled vocabulary for future use, but no current system received those tags as a primary method.
- The BBNJ CHM is tagged as planned/federated policy infrastructure, not as an active production data endpoint.
