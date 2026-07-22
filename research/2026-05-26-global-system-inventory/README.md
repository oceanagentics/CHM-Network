# 2026-05-26 Global Marine System Inventory

This folder is the first comprehensive inventory pass for marine-science data systems that researchers publish to, pull from, or depend on as reference backbones.

## What Is Included

- `systems.csv`
- `system_links.csv`
- `sources.csv`
- `exclusions_and_notes.md`

## Current Coverage

This first tranche covers:

- biodiversity and ecology
- genetics and marine genetic resources
- oceanography and biogeochemistry
- fisheries and aquaculture
- federation and discovery layers
- reference backbones

It includes global, regional, and cross-domain systems that materially recur in marine workflows.

## How To Read The Files

- `systems.csv` records the systems in this research batch.
- `system_links.csv` contains source-backed workflow relationships.
- `sources.csv` is the provenance table for both systems and links.
- `exclusions_and_notes.md` records deferred systems and normalization decisions.

## Import Model

The live SQLite database in `data/chm-network.sqlite` is the source of truth.

This folder is the first research import batch, not a permanent central CSV registry. Later research jobs can import separately into the same database.

## Current Limits

This is a strong first pass, not the terminal inventory. It intentionally prioritizes:

- official sources over secondary descriptions
- systems that recur across real marine workflows
- conservative link claims

The next wave should deepen:

- national and country-specific marine data systems
- finer-grained fisheries portals
- additional ocean observing infrastructures
- more explicit workflow links between biodiversity and genetics systems
