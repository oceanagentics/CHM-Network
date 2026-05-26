# Exclusions And Notes

## Working Note

This folder is the second-wave working set derived from the May 26, 2026 first-pass inventory.

It carries forward the normalization choices from `research/2026-05-26-global-system-inventory` and now contains an active research batch across all five planned phases.

## Import Note

- The live SQLite database is the source of truth.
- This working set can import directly into that database as its own research job.
- Some rows reference parent systems and workflow targets that must already exist in the database from earlier imports, including systems first introduced in `research/2026-05-26-global-system-inventory`.

## Current Batch In This Pack

### Phase 1 Platform Decomposition

- `EurOBIS`
- `DATRAS`
- `InterCatch`
- `RDBES`

### Phase 2 Country To Global Pathways

- `CIOOS`
- `Euro-Argo`

### Phase 3 Observing And Ocean Chemistry

- `OceanSITES`
- `GO-SHIP`
- `SOCAT`
- `GLODAP`
- `OceanOPS`
- `Argovis`

### Phase 4 Genomics Sample And Biobank Depth

- `Genomic Observatories MetaDatabase`

### Phase 5 Reference And Generalist Tail

- `Bio-ORACLE`
- `AlgaeBase`
- `MolluscaBase`
- `Dryad`
- `Zenodo`

## Normalization Choices

- `INSDC` is kept as an umbrella system.
- `GenBank`, `ENA`, and `DDBJ` are kept as child systems under `INSDC`.
- `EMODnet` is kept as an umbrella system.
- `EMODnet Biology` is kept as a child system because it is an actual researcher-facing access layer.
- `SeaDataNet` is kept as an umbrella system.
- `SeaDataNet CDI` is kept as a child system because it is the concrete discovery and access service.
- `Copernicus Marine` is kept as an umbrella service.
- `Copernicus Marine Data Store` is kept as the concrete delivery portal.

## Remaining High-Value Backlog

This pack covers the previously deferred named systems above. The next high-value increment is no longer about adding those same top-level nodes again. It should focus on the thinner residual gaps that remain after this batch:

1. additional `ICES` workflow links and any still-missing named child systems beyond `DATRAS`, `InterCatch`, and `RDBES`
2. additional named `EMODnet Biology` internal components and clearer `EMODnet Biology -> EurOBIS -> OBIS` pathway coverage
3. more explicit `national -> global` publication routes such as `national system -> OBIS`, `national repository -> INSDC`, and `observing network -> regional archive`
4. additional marine sample and biobank systems that connect cleanly into `GEOME`, `GGBN`, and `INSDC` workflows
5. more operational observing and archive links around systems like `OceanSITES`, `GO-SHIP`, `SOCAT`, `GLODAP`, `OceanOPS`, `Euro-Argo`, and `Argovis`
