# Changelog

All notable changes to `@radost-it/trace-graph` are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Because ids are content-derived, **any change to `normaliseLabel` or `entityId`
is a breaking change**: it moves existing nodes onto different ids and breaks
merges against snapshots stored by an older version. Such a change will only
ever land in a major release, and it will always say so here.

## [Unreleased]

### Added

- `shortenRelation(label)`. Relation labels are drawn on an edge at half the
  size of an entity name, and a model asked for "1-4 words" still answers "is
  being assembled at". It collapses whitespace, strips leading auxiliaries and
  articles, and maps a small table of long connectors onto short ones
  (`"in collaboration with"` -> `"with"`). Conservative by design: only
  transforms that cannot change what the relation means. Anything still long
  is left for the renderer to wrap or ellipsise.
- `dropIsolated(nodes, edges)`. Returns only the nodes an edge reaches.

### Changed

- **`mergeExtraction` no longer keeps a node that has no edge.** A circle with
  no relation carries nothing a graph can say and nothing a viewer can act on.
  This is lossy on purpose: an entity named in one window with no relation is
  gone, and comes back only if a later window names it again alongside the
  relation that earns it a place. Producers that relied on isolated entities
  surviving need to keep their own list.
- **A relation whose label is empty once shortened is dropped**, rather than
  stored as a line with nothing written on it.
- Relation labels are stored already shortened, so every consumer reads the
  same string.

- Build runs on `prepack` instead of `prepare`. npm runs a `file:` dependency's
  `prepare` during the consumer's install but never installs that dependency's
  devDependencies, so a consumer linking this package from a sibling checkout
  hit `tsc: not found`. `prepack` still covers `npm publish` and `npm pack`,
  which is what the script was there for; `npm install` in a fresh clone of
  this repo no longer builds `dist/` on its own, so run `npm run build` (or
  `npm test`, which builds first).
- Dev dependency `typescript` moved to `^7.0.2`.

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
