# Changelog

All notable changes to `@radost-it/trace-graph` are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Ids come from content, so **any change to `normaliseLabel` or `entityId` is
breaking**. It moves existing nodes onto new ids and breaks merges against
snapshots stored by an older version. Such changes only land in a major
release and are marked here.

## [Unreleased]

### Added

- **`EntityType` gains `object`.** A named made thing - a spacecraft, a ship,
  an aircraft, an instrument, a class of hardware. Producers were typing these
  `organisation`, which put a rocket in the same bucket as the agency that flew
  it. An older reader validating a newer snapshot will reject `object` nodes.
  Nothing already stored changes.
- `docs/make-graph-image.mjs`, which draws the README's picture from a snapshot
  the package builds. Not published: `files` is `dist`, README and LICENSE.
- `shortenRelation(label)`. Collapses whitespace, strips leading auxiliaries
  and articles, and maps a few long connectors onto short ones
  (`"in collaboration with"` -> `"with"`). It only makes changes that keep the
  meaning. Anything still long is left for the renderer.
- `dropIsolated(nodes, edges)`. Returns only the nodes an edge reaches.

### Changed

- **`mergeExtraction` drops nodes with no edge.** An entity named without a
  relation is gone until a later extraction links it. Producers that need
  isolated entities must keep their own list.
- **A relation whose label is empty after shortening is dropped.**
- Relation labels are stored already shortened.
- Build runs on `prepack` instead of `prepare`. npm runs `prepare` for a
  `file:` dependency without installing its devDependencies, so consumers got
  `tsc: not found`. After a fresh clone, run `npm run build` or `npm test`
  to build `dist/`.
- Dev dependency `typescript` moved to `^7.0.2`.
- CI uses `actions/checkout@v7` and `actions/setup-node@v7`, with a read-only
  token.

### Fixed

- **Louvain communities are now deterministic.** It ran with its default
  random walk, so the same input could give different `community` values on
  each run. It now runs with `randomWalk: false`. Community numbers for
  existing snapshots will change on the next merge.
- **A relation in the reverse direction no longer adds a second edge.** `B|A`
  was stored next to an existing `A|B`, which the README already said could
  not happen. Stored snapshots that hold both keep both.

## [0.1.0] - 2026-09-19

First release. Extracted from [Trace](https://github.com/Radost-IT/trace),
where it had been living as an internal package.

### Added

- `mergeExtraction(snapshot, extraction, seenAt, options?)` - merges one
  extraction into a snapshot. Pure, deterministic and idempotent.
- `emptySnapshot(sessionId)`.
- `entityId(type, label)` and `normaliseLabel(label)` - content-derived,
  honorific-stripping entity ids.
- `applyMetrics(nodes, edges)` - degree centrality and Louvain communities,
  recomputed across the whole snapshot on every merge.
- `capNodes(nodes, edges, maxNodes)` - drops the least connected nodes by
  degree, then by age, and any edge left dangling.
- `DEFAULT_MAX_NODES` (`60`).
- zod v4 schemas `GraphNode`, `GraphEdge`, `GraphSnapshot`, `EntityType` and
  `ExtractionResult`, each with a matching inferred type of the same name.
- 17 tests covering merge rules, id stability, metric recomputation and
  capping, run on Node's built-in test runner.

[Unreleased]: https://github.com/Radost-IT/trace-graph/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Radost-IT/trace-graph/releases/tag/v0.1.0
