# OBIS Support Review

## Source

- Title: `A Digital Foundation for the BBNJ Agreement - Potential contributions of OBIS to the implementation of the High Seas Treaty`
- Publisher: OBIS
- Date: `2025-11-13`
- URL: `https://obis.org/2025/11/13/obis-support-to-bbnj/`
- Local copies:
  - `../raw/obis-support-to-bbnj.html`
  - `../raw/obis-support-to-bbnj.txt`

## Why It Matters

This article is not the treaty architecture itself, but it is a strong signal about how a mature global marine biodiversity platform sees its role in the CHM ecosystem. It is especially useful for identifying candidate external systems, operational capabilities, and interoperability expectations that the CHM may build on instead of recreating.

## Main Takeaways

- OBIS positions itself as an existing global platform the CHM can build on to avoid duplication.
- OBIS frames the CHM as a broad operational layer that needs data, records, maps, assessments, capacity-building offers, and requests.
- For the MGR pillar, OBIS explicitly connects itself to SBI-style identifier workflows and argues that a DOI-based approach could support persistent, traceable identifiers.
- OBIS describes itself as part of a local-to-global data pipeline rather than only a destination database.
- For ABMT and EIA use cases, OBIS emphasizes georeferenced occurrence data, distribution products, long-term series, and biodiversity hotspot context.
- For capacity-building, OBIS points to its node network, multilingual training activity, and work with OceanTeacher.

## Entities And Interfaces Suggested By This Source

The article gives us concrete objects to represent in the catalog:

- `OBIS` as a platform
- `OBIS national nodes`
- `OBIS thematic nodes`
- `ODIS` as a related IOC interoperability layer
- `OceanTeacher Global Academy` as a capacity-building platform
- `DOI` as an identifier mechanism relevant to SBI
- `PacMAN` and `UNESCO eDNA Expeditions` as proof-of-capability examples for biomolecular pipelines
- `collection events`, `cruise tracks`, and `sampling protocols` as contextual artifacts that matter for traceability

## Implications For The Diagram

- The diagram should not treat CHM as a single endpoint. It should show pathways where existing systems continue to hold authoritative data while the CHM links, indexes, or references them.
- Identifier infrastructure belongs in the model. `SBI`, `DOI`, and later database accession numbers should be represented explicitly rather than buried in notes.
- Capacity-building systems are part of the operational network, not side documentation. Training systems, expert directories, and support hubs should appear alongside data systems.
- A country-level pathway may involve several layers: local institution, national node, global node, thematic platform, then CHM.

## Questions This Source Leaves Open

- Which parts of the OBIS proposition are descriptive of existing production infrastructure and which parts are advocacy for a future role?
- How would DOI-backed SBI workflows relate to INSDC accession numbers and national repository practices?
- In Japan specifically, how do BISMaL and J-OBIS map onto the broader OBIS node model in practice?
