# Japan Seed Diagrams

This file breaks the Japan seed into smaller views so it is easier to read than the single all-in-one chat diagram.

## 1. Japan Hierarchy

```mermaid
graph TD
  JPN["Japan"]
  MEXT["MEXT"]
  JAMSTEC["JAMSTEC"]
  GODAC["GODAC"]
  BISMAL["BISMaL"]
  IPT["JAMSTEC IPT interface"]
  JODC["Japan Oceanographic Data Center"]
  NIG["National Institute of Genetics"]
  DDBJ["DDBJ"]

  JPN --> JAMSTEC
  JPN --> JODC
  JPN --> MEXT
  JPN --> NIG
  JAMSTEC --> GODAC
  GODAC --> BISMAL
  BISMAL --> IPT
  NIG --> DDBJ
```

## 2. Biodiversity Publishing Path

```mermaid
graph LR
  JAMSTEC["JAMSTEC / GODAC"]
  BISMAL["BISMaL"]
  IPT["IPT interface"]
  DWC["Darwin Core"]
  DWCA["DwC-A"]
  OBIS["OBIS"]
  CHM["BBNJ CHM"]

  JAMSTEC --> BISMAL
  BISMAL --> IPT
  IPT -->|"uses_standard"| DWC
  IPT -->|"emits_artifact"| DWCA
  BISMAL -->|"publishes_to"| OBIS
  OBIS -. "planned" .-> CHM
```

## 3. Identifier And Sequence Path

```mermaid
graph LR
  CHM["BBNJ CHM"]
  SBI["SBI"]
  DOI["DOI"]
  INSDC["INSDC"]
  NIG["National Institute of Genetics"]
  DDBJ["DDBJ"]

  CHM -->|"generates"| SBI
  SBI -. "planned: aligned_with" .-> DOI
  SBI -. "planned: potential_connection_to" .-> INSDC
  NIG --> DDBJ
  DDBJ -->|"member_of"| INSDC
```

## 4. CHM Support Systems

```mermaid
graph LR
  ODIS["ODIS"]
  OTGA["OTGA"]
  OEX["OceanExpert"]
  ANRRC["ANRRC"]
  CHM["BBNJ CHM"]

  ODIS -. "planned: supports" .-> CHM
  OTGA -. "planned: supports" .-> CHM
  OEX -. "planned: supports" .-> CHM
  ANRRC -. "speculative: potential_connection_to" .-> CHM
```

## Notes

- `solid arrows` are active/current seed relationships
- `dotted arrows` are planned or speculative CHM-facing relationships
- `SBI` means `Standardized Batch Identifier`
