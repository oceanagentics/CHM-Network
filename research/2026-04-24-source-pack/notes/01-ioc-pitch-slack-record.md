# IOC Pitch Review

## Source

- Title: `Designing and implementing the BBNJ Clearing-House Mechanism (CHM): Contribution from the Intergovernmental Oceanographic Commission`
- Subtitle: `Technical Considerations and Operational Framework for the BBNJ Clearing-House Mechanism`
- Context: information for the Preparatory Commission third session
- Local copies:
  - `../raw/IOC Unesco Pitch for BBNJ CHM strategic briefing_final (2).docx`
  - `../raw/ioc-pitch.txt`

## Slack Location

- Channel: `#sbi-prototype-team`
- Message timestamp: `2026-04-08 19:07:25 EDT`
- Message text: Aaron described it as the IOC UNESCO pitch to build the CHM and noted that it mentions the approach, including SBI.
- File title: `IOC Unesco Pitch for BBNJ CHM strategic briefing_final (2).docx`
- File ID: `F0ARNA2MC5C`
- File size shown in Slack: `2.9 MB`
- Slack permalink: `https://oceanagentics.slack.com/files/U0AQY6J9SG7/F0ARNA2MC5C/ioc_unesco_pitch_for_bbnj_chm_strategic_briefing_final__2_.docx`

## Nearby Slack Context

Immediately after sharing the file, Aaron added context about the upcoming conversation with the Japanese delegation lead and listed the goals for that discussion:

- understand their workflow
- understand what systems they currently use
- understand how they track and what they track
- understand what they might want from the SBI in terms of quality-of-life functionality

Later the same evening, Aaron shared the interim Microsoft Form used to meet minimum SBI-related requirements after ratification and noted that it is useful for understanding the current minimum operational requirement.

## Main Takeaways

- The pitch frames the CHM as an information management system, not a giant replacement ocean database.
- It proposes a two-part architecture:
  - a `regulatory core` for treaty-specific workflows and SBI management
  - a `federated interoperable access service` that connects the CHM to existing systems
- It explicitly argues for reuse of existing infrastructure rather than replication.
- It positions IOC as a technical partner while keeping policy authority and standards authority with the BBNJ Secretariat and the COP.
- It presents IOC's institutional network itself as part of the implementation path, not just as background context.

## Important Technologies And Systems Named

- `OBIS`
- `ODIS`
- `INSDC`
- `ORCID`
- `OceanExpert`
- `GOOS`
- `OTGA`
- `IODE / NODCs`
- `DOI`
- `DataCite`
- `GBIF`
- `MSPglobal`

This is one of the strongest documents so far for turning the network map into a real multi-layer technical graph instead of a simple organization chart.

## Architecture Signals

- The pitch uses the phrase `system-of-systems` directly.
- It says the CHM should manage workflows, identifiers, roles, metadata, and provenance, while connecting out to authoritative external repositories.
- It proposes direct links to sequence repositories and expert rosters.
- It treats SBI as a near-term implementation problem and leans toward a DOI-based approach that interoperates with DataCite, INSDC, GBIF, and OBIS.
- It recommends a prototype or minimum viable product during the preparatory period, focused first on the regulatory core.

## Governance And Data Sovereignty Signals

- `BBNJ Secretariat`: policy, standards, and operational coordination
- `IOC`: technical development, hosting, and maintenance under a formal arrangement
- `Parties`: keep data sovereignty through national infrastructures and regional nodes
- `COP`: sets modalities and cooperation arrangements

This is important because it maps cleanly to the idea that the graph needs both governance relationships and technical-interface relationships.

## Why This Source Is Especially Useful For The Network Diagram

Annex B and Annex C make this document more than a position paper.

- Annex B lists IOC assets that already exist and what they could contribute to the CHM.
- Annex C lists IOC national and regional centres and institutions across many countries.

That means the document is not just arguing for a design. It is also offering a starter network.

## Japan-Specific Value

The annexed institution list already gives two concrete Japan entries:

- `Japan Oceanographic Data Center` as an `NODC`
- `JAMSTEC, Global Oceanographic Data Center (GODAC)` as an `OBIS node`

That matters because it gives us a stronger Japan pathway than `BISMaL -> IPT -> OBIS` alone. It suggests Japan may need to be modeled through at least:

- biodiversity publishing pathways
- oceanographic data center pathways
- IOC-linked institutional pathways
- national ministry and treaty workflow pathways

## Remaining Questions

- How does this IOC proposal compare with Party preferences expressed in PrepCom discussions?
- Which IOC-listed centres are realistic operational partners versus simply part of a broader IOC network?
- How do Japan's concrete institutions for MGR notifications, sequence submission, and biodiversity publishing line up against the IOC architecture described here?
