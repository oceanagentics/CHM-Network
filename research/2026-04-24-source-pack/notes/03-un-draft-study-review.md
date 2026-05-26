# UN Draft Study Review

## Source

- Title: `Consolidated draft study on the technical aspects of the operationalization of the Clearing-House Mechanism`
- Context: Preparatory Commission third session
- Date on document: `2026-03-09`
- URL: `https://www.un.org/bbnjagreement/sites/default/files/2026-03/20260309ConsolidatedDraftBBNJCHMStudy.pdf`
- Local copies:
  - `../raw/20260309ConsolidatedDraftBBNJCHMStudy.pdf`
  - `../raw/20260309ConsolidatedDraftBBNJCHMStudy.txt`

## Why It Matters

This is the most important architecture source in the pack so far. It does two things at once:

- inventories existing external systems relevant to the CHM
- lays out technical options for how the CHM could interact with them

That makes it directly relevant to the network diagram and to the SQLite plus Cytoscape plan.

## Core Architecture Signals

- The study explicitly distinguishes two CHM duties:
  - host and manage information generated under the Agreement
  - link to relevant global, regional, subregional, national, and sectoral systems that already exist elsewhere
- Because of that split, the study repeatedly points toward a hybrid model rather than a purely centralized one.
- The study describes four access modalities:
  - data hosted in the CHM
  - data accessed through federated queries or APIs
  - data referenced through metadata and external links
  - data represented through derived products or indicators
- The study describes three interoperability modes:
  - `link`
  - `harvest`
  - `API federation`
- The study recommends progressive, tiered integration of external systems rather than trying to deeply integrate everything at launch.

## Named System Families That Matter For The Catalog

### MGR And Sample Repositories

- `GGBN`
- `EMBRC`
- `ANRRC`
- `ISA Deep-Sea Biobank Initiative`

### Biodiversity, Occurrence, And Ocean Context Systems

- `OBIS`
- `GBIF`
- `MBON`
- `GOOS`
- `EMODnet`
- `PacMAN`
- `ODIS`
- `Ocean InfoHub`

### Sequence And Genomics Systems

- `INSDC`
- `GenBank`
- `European Nucleotide Archive`
- `DNA Data Bank of Japan`
- `China National GenBank`
- `National Genomics Data Center of China`

### Capacity-Building And Expert-Matching Systems

- `OceanTeacher Global Academy`
- `Ocean Capacity Development Hub`
- `Ocean Expert`
- `UN DOALOS capacity-building site`
- `InforMEA`
- `DaRT`
- `Ocean Matcher`
- `Ocean Connector`

## Important Statements For Mapping Work

- The study says the CHM should be approached as an ongoing service, not a one-time technical build.
- It treats low-connectivity use, offline continuity, multilingual support, confidentiality, and auditability as architectural requirements, not optional extras.
- It explicitly notes that regional or subregional nodes may provide localization, assisted workflows, offline continuity, queue-and-sync support, and user support, while the central system remains authoritative.
- It treats interoperability standards, stable identifiers, naming rules, and role definitions as Phase 1 discovery work.

## Option Signals Relevant To The Diagram

- `Option A`: central system first, deeper integration later
- `Option B`: central system plus regional or subregional nodes
- `Option C`: retrofit an existing clearing-house platform
- `Illustrative hybrid`: selective use of node-supported workflows while keeping central authority for core records

The study's indicative ranges are directionally important:

- Option A: about `9-12 months`, `USD 2-4M`
- Option B: about `15-24 months`, `USD 3-6M`
- Some retrofit cases: up to about `3 years`, `USD 5-6.3M`
- Illustrative hybrid: about `12-18 months`, `USD 2.5-5.5M`

## How This Maps To The Current Plan

The existing SQLite and Cytoscape plan is broadly aligned with this study. In particular:

- The plan's `entity`, `relationship`, and `source` logic matches the study's emphasis on source-backed claims and progressive integration.
- The plan's distinction between durable hierarchy and derived graph views matches the study's split between authoritative CHM workflows and linked external systems.
- The plan should explicitly add fields for:
  - `access_modality`
  - `interoperability_mode`
  - `integration_tier`
  - `confidentiality_class`
  - `operational_role`

## Questions This Source Leaves Open

- Which external systems should be Tier 1 for the first prototype versus later phases?
- Which countries are likely to rely on regional-node support versus direct national integration?
- Which existing systems are realistic partners for `link`, `harvest`, or `API federation` in practice, not just in theory?
