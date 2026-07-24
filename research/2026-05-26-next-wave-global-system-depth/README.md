# 2026-05-26 Next-Wave Global System Depth

This folder is the second-wave working research pack for deepening the global marine system inventory built on May 26, 2026.

## What Is Included

- `systems.csv`
- `system_links.csv`
- `sources.csv`
- `exclusions_and_notes.md`

## Research Focus

This next-wave depth pass is intended to cover:

- platform decomposition
- country-to-global publication pathways
- observing and ocean chemistry systems
- genomics sample and biobank depth
- reference and generalist repository tail systems

## How To Read The Files

- `systems.csv` uses the same column schema as the first-pass inventory.
- `system_links.csv` is for source-backed workflow and interoperability links.
- `sources.csv` is the provenance table for both systems and links.
- `exclusions_and_notes.md` carries forward deferred items, normalization choices, and research notes for this wave.

## Import Model

The live SQLite database in `data/ryu.sqlite` is the source of truth.

This folder is an incremental research job that can be imported directly into that database.

Rows in this pack may reference parent systems or workflow targets that were imported by earlier research jobs, including `research/2026-05-26-global-system-inventory`.

This pack is not a central merged inventory. It is one import batch in an incremental research-and-import workflow.
