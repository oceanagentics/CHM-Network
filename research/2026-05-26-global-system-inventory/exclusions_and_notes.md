# Exclusions And Notes

## Normalization Choices

- `INSDC` is kept as an umbrella system.
- `GenBank`, `ENA`, and `DDBJ` are kept as child systems under `INSDC`.
- `EMODnet` is kept as an umbrella system.
- `EMODnet Biology` is kept as a child system because it is an actual researcher-facing access layer.
- `SeaDataNet` is kept as an umbrella system.
- `SeaDataNet CDI` is kept as a child system because it is the concrete discovery and access service.
- `Copernicus Marine` is kept as an umbrella service.
- `Copernicus Marine Data Store` is kept as the concrete delivery portal.

## Deliberately Deferred For Next Wave

These are likely in-scope but need additional source work before inclusion:

- `EurOBIS` as an explicit internal EMODnet Biology infrastructure node
- `DATRAS`, `InterCatch`, `RDBES`, and other named ICES sub-systems
- `OceanSITES`
- `GO-SHIP`
- `SOCAT`
- `GLODAP`
- `OceanOPS`
- `Argovis`
- `CIOOS`
- `Euro-Argo`
- `Bio-ORACLE`
- `AlgaeBase`
- `MolluscaBase`
- `Genomic Observatories MetaDatabase`
- `Dryad` and `Zenodo` as recurring generalist repositories

## Exclusion Rules Applied In This Pass

- Organization pages without a distinct data system were not added as systems.
- Standards and file formats were not added as systems.
- Training portals were only used as sources when they described the operational repository.
- News posts were not used as primary system-definition sources unless they pointed to concrete workflow claims.

## High-Value Next Additions

If the next pass is meant to deepen real researcher workflows rather than broaden scope, prioritize:

1. `ICES` child databases and fisheries-specific flows
2. `EurOBIS` and named EMODnet Biology internal components
3. more national oceanographic data centres
4. marine sample and biobank systems tied to genomics workflows
5. direct country-to-global publication pathways like `national system -> OBIS`, `national repository -> INSDC`, and `observing network -> regional archive`
