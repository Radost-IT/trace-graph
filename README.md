# @radost-it/trace-graph

Incremental knowledge-graph core. You hand it entities and relations described
by **label**; it assigns stable ids, merges them into a running snapshot,
recomputes degree centrality and Louvain communities, and caps the result to a
size you choose.

Pure JavaScript. No DOM, no Web APIs, no native modules — it runs in Node, in a
browser, and on Hermes (React Native / Fire TV Vega OS), which is why it exists
as its own package.

MIT licensed. Extracted from [Trace](https://github.com/Radost-IT/trace), which
builds a live graph from a broadcast's audio.

## Install

```bash
npm install @radost-it/trace-graph
```

Requires Node >= 22 if you run it server-side. `zod` v4 is a dependency, not a
peer — the exported schemas are real zod schemas you can compose with.

## The problem it solves

Building a graph from a stream of extractions is mostly bookkeeping, and the
bookkeeping is where it goes wrong:

- The same entity arrives as `"Dr. Jane Doe"`, `"Jane Doe"` and `"jane doe"`
  and has to land on one node.
- Relations arrive naming entities by label, not by id.
- Centrality and communities change for nodes nowhere near the new edge, so
  they cannot be updated incrementally — they have to be recomputed.
- The snapshot has to stay small enough to store and to draw.
- Re-running the same input must not produce a different graph.

## Usage

```ts
import { emptySnapshot, mergeExtraction } from "@radost-it/trace-graph";

let snapshot = emptySnapshot("session-1");

snapshot = mergeExtraction(
  snapshot,
  {
    entities: [
      { label: "Dr. Jane Doe", type: "person", summary: "Leads the mission team." },
      { label: "Goddard Space Flight Center", type: "organisation", summary: "Runs the programme." },
    ],
    relations: [{ source: "Jane Doe", target: "Goddard Space Flight Center", label: "leads" }],
  },
  new Date().toISOString(),
  { maxNodes: 60 },
);

snapshot.nodes[0];
// {
//   id: "person:jane-doe",       // honorific stripped, slugified
//   type: "person",
//   label: "Jane Doe",
//   summary: "Leads the mission team.",
//   degree: 1,                    // recomputed across the whole snapshot
//   community: 0,                 // Louvain
//   firstSeenAt: "2026-09-19T..." // set once, never overwritten
// }
```

Note the relation says `"Jane Doe"` while the entity said `"Dr. Jane Doe"`.
Both normalise to the same id, so the edge connects.

## API

| Export | What it does |
| --- | --- |
| `mergeExtraction(snapshot, extraction, seenAt, options?)` | Merges one extraction into a snapshot. Pure and deterministic. Returns a new, validated snapshot. |
| `emptySnapshot(sessionId)` | A snapshot with no nodes or edges. |
| `entityId(type, label)` | The stable id for an entity. `("person", "Dr. Jane Doe")` → `"person:jane-doe"`. |
| `normaliseLabel(label)` | Strips honorifics and collapses whitespace. |
| `applyMetrics(nodes, edges)` | Returns nodes with `degree` and `community` recomputed. |
| `capNodes(nodes, edges, maxNodes)` | Drops the least connected nodes and any edge left dangling. |
| `DEFAULT_MAX_NODES` | `60`. |
| `GraphNode`, `GraphEdge`, `GraphSnapshot`, `EntityType`, `ExtractionResult` | zod schemas, each with a matching inferred TypeScript type of the same name. |

### Merge rules

These are the decisions the package makes for you. They are deliberate, and
they are the reason it is not just a `Map`:

- **Ids are content-derived, not generated.** `entityId` lowercases, strips a
  leading honorific, and slugifies. The same label always yields the same id,
  so merging is idempotent across processes and across restarts.
- **First summary wins.** A later pass rarely knows more about an entity than
  the pass that introduced it, and a summary that rewrites itself under the
  reader is worse than one that holds still.
- **`firstSeenAt` is written once.** It is the tiebreaker when capping, so it
  has to be stable.
- **Unknown relation endpoints are dropped, never invented.** If a relation
  names something that is not an entity in this extraction or already on the
  graph, the edge is discarded. The graph never contains a node no producer
  asserted.
- **Self-edges and duplicate edges are dropped.** Edge id is `source|target`,
  so an undirected pair is stored once.
- **Metrics are recomputed over the whole snapshot on every merge.** One new
  edge can change degree and community for nodes far away from it.
- **Capping is by degree, then age.** The best-connected nodes survive, so the
  spine of the story stays while the periphery churns.

### What it does not do

- **Coreference.** Resolving "she" or "the administrator" to a person is a
  model's job, not a regex's. Do it before you call `mergeExtraction`.
- **Layout.** No coordinates, no force simulation. Feed the snapshot to
  `d3-force` or anything else.
- **Persistence.** Snapshots are plain JSON. Store them however you like.

## Development

```bash
npm install
npm run build      # tsc -> dist/
npm run typecheck  # tsc --noEmit
npm test           # builds, then runs test/*.test.ts
```

Node >= 22. No test framework and no bundler to install — the 17 tests run on
Node's own runner and the only build step is `tsc`. CI runs `typecheck` and
`test` on Node 22 and 24.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) first — it says what is in scope, what
is deliberately not, and which small-looking changes are breaking ones. The
short version: ids are derived from content, so touching `normaliseLabel` moves
every existing node onto a new id.

Released versions are listed in [CHANGELOG.md](CHANGELOG.md).

## Licence

MIT © Radost IT
