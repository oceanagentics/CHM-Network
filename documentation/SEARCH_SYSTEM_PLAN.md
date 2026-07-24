# Search And Filter System Plan

## Goal

Build one extensible search and filter system that drives both the Systems pane and graph visibility. The system should support the current directory workflow, richer future node detail pages, and later natural-language query assistance without coupling search behavior to a single UI component.

## Design Principles

- Keep search intent shared across panes.
- Keep graph filtering in the graph scope/projection pipeline.
- Prefer structured field extractors over one large text blob.
- Return ranked results with match reasons.
- Treat source text as supporting context, not equal to node identity.
- Let future node detail modules contribute searchable field definitions without rewriting the search UI.
- Let an embedded agent produce structured search intent, but keep deterministic app code responsible for executing it.
- Keep canonical graph data as the only source of truth. Search should not introduce stored per-node search documents.

## Core Model

The search system should have three layers:

1. Search field definitions
   - Definitions live by node kind or feature area.
   - Each definition reads directly from canonical indexed graph data.
   - Definitions cover typed fields such as name, aliases, kind, country, operator, data descriptors, access paths, relationships, sources, and future rich-page sections.
   - Each definition declares whether the field is searchable, filterable, visible as a match reason, and how strongly it should affect ranking.
   - Field weights are app behavior and should live in these definitions, not be copied onto each node.

2. Search intent
   - Shared app state that represents the current query and filters.
   - Used by both Systems and graph panes.
   - Example shape:

```ts
{
  text: "edna",
  facets: {
    countryCode: ["JPN"],
    kind: ["system"],
    relationshipType: ["publishes_to"]
  },
  mode: "strict"
}
```

3. Query resolver
   - Applies field definitions to the indexed graph at query time, or through an in-memory memoized runtime projection.
   - Converts search intent into ranked entity ids.
   - Returns match reasons for UI display and future agent explanations.
   - Keeps ranking deterministic and testable.
   - Does not create or maintain a second persisted search data model.

## MVP

The MVP should stay client-side and reuse the existing bootstrap graph data.

### MVP Scope

- Add shared search state to the graph store:
  - query text
  - existing system filters
  - clear/reset actions
- Extract the current Systems pane record/search logic into a reusable search module.
- Define per-kind search field extractors for systems, organizations, and countries.
- Replace loose subsequence fuzzy matching with field-aware matching:
  - high weight: name, aliases, country code, kind, subtype
  - medium weight: descriptions, role, discipline, data descriptor labels, access labels
  - low weight: source titles, source notes, relationship notes, connected node names
- Return ranked system records and matching entity ids from the same resolver.
- Have the Systems pane render the shared filtered/ranked system result set.
- Have graph projection receive matching entity ids and filter visible nodes.
- Preserve required ancestors/containers so filtered graph views remain readable.
- Show only edges where both endpoints are visible.
- Add basic match reasons for system cards/table rows.

### MVP Acceptance Criteria

- Typing once filters both Systems and graph panes.
- Searching `USA` shows USA-related nodes and matching USA systems.
- Searching for a term that is only weakly present in provenance does not flood the top results.
- Clearing the search restores the current graph view.
- Existing view modes still work.
- Existing selection behavior still works when the selected node remains visible.
- No server or database schema changes are required.

## Phase 1: Shared Search State

- Move query and filters out of `SystemDirectoryView` local state.
- Store them in `useGraphStore`.
- Keep UI controls in the Systems pane for now.
- Add selectors/helpers so other panes can read the resolved search intent.
- Include search/filter fields in saved views once the behavior is stable.

## Phase 2: Field-Aware Search Extractors

- Create a search module with per-kind field definitions.
- Each definition has a getter that reads from the indexed graph:

```ts
{
  field: "data.descriptors.label",
  label: "Data type",
  weight: 70,
  filterable: true,
  getValues: (entity, graph) =>
    graph.systemNodeById[entity.id]?.data.descriptors.map((descriptor) => descriptor.label) ?? []
}
```

- Avoid a single concatenated `searchText`.
- Avoid persisted per-node search documents.
- Keep field definitions close to the domain data they describe.
- Let the resolver derive match candidates from canonical graph data at query time.
- Memoize derived runtime fields only as an implementation optimization, invalidated when the graph bootstrap changes.
- Start with systems, countries, and organizations using current bootstrap fields.

## Phase 3: Graph Filtering

- Pass resolved matching ids into `projectGraph`.
- Apply the filter at the scope/projection boundary.
- Preserve ancestor chains and visual containers where needed.
- Keep graph display components unaware of search semantics.
- Consider a user-facing mode toggle later:
  - `Matches only`
  - `Matches + one-hop context`

## Phase 4: Better UI Feedback

- Show why a result matched.
- Surface active filters as removable chips.
- Add count labels for visible graph nodes and matching systems.
- Make empty states specific:
  - no text match
  - no match after filters
  - match exists outside current view mode
- Add optional field filters for kind, country, data type, and relationship type.

## Phase 5: Rich Node Page Extensions

- Let rich node detail sections register search field definitions through the shared search module.
- Add new field families as data grows:
  - data holdings
  - publication/access pathways
  - identifiers
  - APIs and access methods
  - governance roles
  - standards
  - source-backed claims
  - geographic/taxonomic/sample scope
- Keep field weights explicit so richer pages do not drown out identity fields.
- Use narrow per-node boosts only for exceptional cases, such as a canonical/preferred node, not for ordinary field weighting.

## Phase 6: Embedded Agent Query Assistant

- Give the agent a schema of supported facets and relationship concepts.
- Let the agent translate natural language into structured search intent.
- Do not let the agent directly mutate graph internals.
- Execute the agent-produced intent through the same deterministic resolver.
- Return result ids and match reasons so the agent can explain outcomes.

Example:

User asks:

> where do japanese researchers publish edna data?

Agent-produced intent:

```ts
{
  text: "edna",
  facets: {
    countryCode: ["JPN"],
    relationshipType: ["publishes_to"]
  },
  targetKind: ["system"],
  includeRelatedKinds: ["organization"]
}
```

The app resolver then determines the visible systems, organizations, and graph edges.

## Deferred Until Needed

- SQLite FTS tables.
- Server-side search endpoint.
- Cross-session search analytics.
- Vector embeddings.
- Agent-only ranking.

These can be added later if the graph becomes large enough or if natural-language discovery requires semantic matching beyond structured fields.
