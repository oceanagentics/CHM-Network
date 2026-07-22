# Synthesis And Next Research

## Short Answer

The real-world structure described by the sources maps well to the current SQLite plus Cytoscape plan, but it suggests a few important refinements:

- model the CHM as a hybrid system-of-systems
- treat access modality and interoperability mode as first-class properties
- represent support structures like nodes, helpdesks, training systems, and expert directories as part of the network
- separate authoritative records from linked context and derived products

## How The Sources Map To The Plan

### The plan is directionally right

The current plan already assumes:

- a zoomable hierarchy
- graph-style relationships
- explicit sources and source traceability
- current and potential pathways

That is strongly supported by the UN study, and the IOC pitch sharpens it further by explicitly describing the CHM as a `system-of-systems`.

### The plan needs a few sharper dimensions

The documents suggest adding these dimensions to either `entities`, `relationships`, or both:

- `access_modality`
  - `hosted`
  - `federated_query`
  - `metadata_link`
  - `derived_product`
- `interoperability_mode`
  - `link`
  - `harvest`
  - `api_federation`
- `integration_tier`
  - `tier_1`
  - `tier_2`
  - `tier_3`
- `confidentiality_class`
  - `public`
  - `restricted`
  - `confidential`
- `operational_role`
  - `secretariat`
  - `national_focal_point`
  - `node_operator`
  - `repository_operator`
  - `submitter`
  - `reviewer`
  - `capacity_provider`

## Candidate Seed Entities From These Sources

These are good early catalog entries because they recur across the documents and are structurally meaningful:

- `platform-bbnj-chm`
- `platform-obis`
- `platform-odis`
- `platform-ocean-infohub`
- `platform-ocean-expert`
- `platform-otga`
- `network-obis-nodes`
- `network-ggbn`
- `network-anrrc`
- `system-insdc`
- `repository-genbank`
- `repository-ena`
- `repository-ddbj`
- `identifier-sbi`
- `identifier-doi`

Japan-specific seed entities for the next pass:

- `country-jpn`
- `org-japan-oceanographic-data-center`
- `org-jamstec`
- `org-jamstec-godac`
- `system-bismal`
- `node-j-obis`
- `org-mext`
- `org-national-institute-of-genetics`
- `repository-ddbj`

## What The Sources Suggest About Japan

These sources do not yet fully answer the Japan question, but they sharpen it:

- Japan matters because it likely spans multiple relevant layers at once:
  - biodiversity occurrence publishing
  - sequence repositories
  - research institutions
  - ministry-level reporting or delegation workflows
- The IOC pitch Slack context shows that the immediate operational question is not abstract architecture. It is how Japanese actors actually work today and what an SBI or CHM workflow would feel like for them.
- The UN study names `DDBJ` and `ANRRC`, which immediately makes Japan more than a single BISMaL to OBIS pathway case.
- The IOC pitch annexes add `Japan Oceanographic Data Center` and `JAMSTEC/GODAC` as concrete IOC-linked institutions that should enter the seed graph early.

## Proposed Next Research

### 1. Ratification And Priority Country Landscape

Build a country table with:

- ratified
- signed but not ratified
- likely near-term ratifier
- likely support model
  - direct national integration
  - regional-node-supported
  - low-capacity assisted workflow

Use official UN treaty status first, then national statements and PrepCom interventions.

### 2. Japan Deep Dive

Create a Japan-only source pack centered on:

- `JAMSTEC`
- `GODAC`
- `BISMaL`
- `J-OBIS`
- `Japan Oceanographic Data Center`
- `DDBJ`
- `MEXT`
- Japanese universities and collections likely to hold marine samples or biodiversity data
- any SBI pilot institutions mentioned in Japan or PrepCom materials

Goal: map real systems, not just organizations.

### 3. Global System Inventory By Function

Split the inventory into functional layers:

- sample repositories and biobanks
- biodiversity occurrence systems
- sequence databases
- ocean data centre and ocean observation systems
- area-based management and EIA context systems
- capacity-building and expert-matching systems
- legal and treaty reporting systems

This becomes the first graph seed beyond Japan.

### 4. Interoperability Pattern Library

For each important external system, record:

- typical interface style
- metadata standard
- identifier regime
- auth pattern
- likely CHM integration mode
- source traceability

This will give the graph a real technical layer instead of only institution names.

### 5. Actor And Workflow Archetypes

Define reusable actor patterns such as:

- national focal point
- marine research institute
- sample repository
- sequence repository
- regional node operator
- treaty secretariat support actor
- researcher submitting notifications

This will make it easier to compare Japan with other countries later.

## Recommended Immediate Next Step

The highest-value next pass is a `Japan + one contrast country` study.

Japan should be one case because it touches OBIS, sequence infrastructure, ministries, and likely multiple research institutions. The contrast country should be chosen to stress a different integration pattern, ideally one more dependent on regional support or lower-connectivity workflows.
