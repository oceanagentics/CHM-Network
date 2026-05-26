# CHM Network Plan

## Purpose
Build an internal graph that shows how national institutions, technical systems, and governance structures relate to broader biodiversity and BBNJ information ecosystems, including the future Clearing-House Mechanism (CHM).

## Core Question
How does a country's institutional superstructure connect to the technical pathways that may eventually feed or support the CHM?

## What The Graph Must Show
- Country, ministry, institute, unit, and network context
- Technical systems, interfaces, standards, identifiers, and platforms
- Current, planned, and speculative pathways
- Provenance and confidence for every important claim

## Model Shape
- Governance layer: country, organization, network, legal instrument, document
- Technical layer: system, interface, platform, standard, identifier, artifact, workflow
- Both layers live in one graph so a user can move from institutional context into technical detail without changing models

## Design Principles
- Separate facts from views
- Keep durable hierarchy distinct from non-hierarchical relationships
- Treat interfaces as first-class entities
- Preserve uncertainty explicitly
- Keep v1 small and evidence-backed

## Chosen Stack
- SQLite is the canonical store
- SQL seed files provide the initial dataset
- The app loads a neutral domain graph from SQLite
- Cytoscape.js renders filtered views of that graph

## Canonical Entity Kinds
- `country`
- `organization`
- `network`
- `legal_instrument`
- `document`
- `system`
- `interface`
- `platform`
- `standard`
- `identifier`
- `artifact`
- `workflow`

## Canonical Relationship Types
- `operated_by`
- `governed_by`
- `member_of`
- `implements`
- `administered_by`
- `reports_to`
- `publishes_to`
- `uses_standard`
- `emits_artifact`
- `supports`
- `links_to`
- `aligned_with`
- `depends_on`
- `potential_connection_to`

## Modeling Rules
- Use `parent_entity_id` for durable containment
- Use relationship rows for non-hierarchical claims
- Keep governance and technical edges in the same graph
- Attach sources and confidence to important entity and relationship claims
- Use `active`, `planned`, `speculative`, and `deprecated` for status
- Use `interface_entity_id` when a relationship passes through a specific interface

## Entity Mapping Rules
- Use `organization` for ministries, institutes, commissions, tribunals, secretariats, agencies, and internal units
- Use `network` for coordination groups and grouped organizational structures
- Use `legal_instrument` for treaties, agreements, and convention-level regimes
- Use `document` for reports, resolutions, and workplans
- Use `system` for operational technical systems and repositories
- Use `platform` for destination ecosystems and multi-system information environments
- Use `identifier` for identifier regimes such as `SBI` and `DOI`
- Use `interface` for APIs, toolkits, submission channels, and exchange surfaces

## Direction Rules
- Point governance edges upward toward the governing or administering body
- Point technical exchange edges outward toward the downstream destination
- Keep containment in the hierarchy, not duplicated as a default relationship

Examples:
- `system-bismal operated_by org-jamstec-godac`
- `org-jamstec governed_by org-mext`
- `org-mext implements agreement-unclos`
- `system-bismal publishes_to platform-obis`
- `platform-obis potential_connection_to platform-bbnj-chm`

## Views
- Global overview
- Country context
- System pathway

## Japan Example
Japan -> MEXT -> JAMSTEC -> GODAC -> BISMaL -> IPT -> OBIS -> CHM

This path matters because it connects a national governance context to a concrete interoperability route.

## Non-Goals
- Not a public-facing product
- Not a complete global treaty encyclopedia
- Not a graph-database evaluation exercise
- Not a full implementation plan for every future CHM workflow

## Current Schema
- `entities`
- `relationships`
- `sources`
- `entity_sources`
- `relationship_sources`
- `tags`
- `entity_tags`
- `relationship_tags`
- `saved_views`

The current schema lives in `sql/chm_schema.sql` and should stay aligned to the canonical vocabulary above.

## Near-Term Scope
- Seed Japan as the first country case
- Add one contrast country early
- Capture both governance and technical relationships
- Support internal exploration of country, system, and pathway questions

## Success For V1
- Load the seed database
- Traverse from country governance context into technical pathway detail
- Distinguish active and planned CHM-facing relationships
- Save useful internal graph views

## Immediate Next Steps
- Align schema and seed data to the canonical vocabulary
- Add explicit governance edges such as `org-jamstec governed_by org-mext`
- Add the minimum top-level governance entities needed for context
- Add one contrast country
- Build the first explorer around country and system views
