# Contributing to trace-graph

Thanks for looking. This is a small, deliberately narrow package, so the most
useful thing you can do before writing code is to check that what you want is
in scope.

## Scope

`trace-graph` turns a stream of extractions — entities and relations described
by **label** — into a running graph snapshot with stable ids, degree centrality
and Louvain communities, capped to a size you choose.

**In scope:** merge rules, id normalisation, metrics, capping, the wire-format
schemas, correctness and determinism, and keeping the package free of DOM and
native dependencies so it keeps running on Hermes.

**Out of scope**, and listed in the README for the same reason:

- **Coreference.** Resolving "she" or "the administrator" to a person is a
  model's job. Do it before you call `mergeExtraction`.
- **Layout.** No coordinates, no force simulation.
- **Persistence.** Snapshots are plain JSON; store them however you like.
- **Rendering.** There is no UI here and there will not be one.

A pull request that adds one of those will be declined however good it is, so
please open an issue first if you are unsure which side of the line you are on.

## Getting set up

```bash
git clone https://github.com/Radost-IT/trace-graph.git
cd trace-graph
npm install
npm test
```

Node >= 22 is required. There is no test framework and no bundler to install —
the tests run on Node's own runner and the only build step is `tsc`.

```bash
npm run build      # tsc -> dist/
npm run typecheck  # tsc --noEmit
npm test           # builds, then runs test/*.test.ts
```

The tests import from `../dist/index.js` rather than `../src/index.ts`. That is
deliberate twice over: Node's type stripping does not map a `.js` specifier to
a `.ts` file, and testing the built artifact is what actually ships.

## Making a change

1. **Write the test first.** Every merge rule in the README has a test named
   after it. A change to behaviour that no test notices is a change nobody can
   rely on.
2. **Keep it small.** Minimum code that solves the problem. No speculative
   options, no abstractions for a single call site.
3. **Don't reformat what you didn't change.** Match the surrounding style.
4. **Add a `## [Unreleased]` entry to [CHANGELOG.md](CHANGELOG.md)** describing
   the change from a user's point of view, not the diff's.

Before opening a pull request:

```bash
npm run typecheck && npm test
```

CI runs exactly that on Node 22 and 24.

## Things that are breaking changes even when they look small

Ids are derived from content, not generated. So:

- Any change to `normaliseLabel` — a new honorific, different punctuation
  handling, different casing — moves existing entities onto new ids.
- Any change to the `entityId` format.
- Any change to the edge id (`source|target`).

All three break merges against snapshots stored by an older version. They are
major-version changes, they need a CHANGELOG note saying so, and they need a
strong reason. New honorifics are the most likely legitimate case.

Changes to tie-breaking in `capNodes`, or to Louvain's inputs, change output
without breaking stored data. Those are minor, but still want a CHANGELOG entry
because they are visible to anyone drawing the graph.

## Reporting a bug

Open an issue with the smallest `mergeExtraction` call that reproduces it — the
extraction in, the snapshot you expected, the snapshot you got. Because merging
is pure and deterministic, a reproduction is always a handful of lines, and one
is worth more than a description.

## Security

Please do not open a public issue for a security problem. Email
security@radostit.com instead.

## Licence

By contributing you agree that your contribution is licensed under the MIT
licence, the same as the rest of the project.
