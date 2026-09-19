# Changelog

All notable changes to `@radost-it/trace-graph` are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Because ids are content-derived, **any change to `normaliseLabel` or `entityId`
is a breaking change**: it moves existing nodes onto different ids and breaks
merges against snapshots stored by an older version. Such a change will only
ever land in a major release, and it will always say so here.

## [Unreleased]

Nothing yet.

## [0.1.0] - 2026-09-19

First release. Extracted from [Trace](https://github.com/Radost-IT/trace),
where it had been living as an internal package.

### Added

- `mergeExtraction(snapshot, extraction, seenAt, options?)` — merges one
  extraction into a snapshot. Pure, deterministic and idempotent.
- `emptySnapshot(sessionId)`.
- `entityId(type, label)` and `normaliseLabel(label)` — content-derived,
  honorific-stripping entity ids.
- `applyMetrics(nodes, edges)` — degree centrality and Louvain communities,
  recomputed across the whole snapshot on every merge.
- `capNodes(nodes, edges, maxNodes)` — drops the least connected nodes by
  degree, then by age, and any edge left dangling.
- `DEFAULT_MAX_NODES` (`60`).
- zod v4 schemas `GraphNode`, `GraphEdge`, `GraphSnapshot`, `EntityType` and
  `ExtractionResult`, each with a matching inferred type of the same name.
- 17 tests covering merge rules, id stability, metric recomputation and
  capping, run on Node's built-in test runner.

[Unreleased]: https://github.com/Radost-IT/trace-graph/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Radost-IT/trace-graph/releases/tag/v0.1.0
