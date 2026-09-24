# Contributing to trace-graph

This is a small package with a narrow scope. Check that your change is in
scope before writing code.

## Scope

`trace-graph` turns a stream of extractions (entities and relations named by
**label**) into a graph snapshot with stable ids, degree centrality and Louvain
communities, capped to a size you choose.

**In scope:** merge rules, id normalisation, metrics, capping, the schemas,
correctness and determinism. The package must stay free of DOM and native
dependencies so it keeps running on Hermes.

**Out of scope:**

- **Coreference.** Resolving "she" or "the administrator" to a person belongs
  in the model, before `mergeExtraction` is called.
- **Layout.** No coordinates, no force simulation.
- **Persistence.** Snapshots are plain JSON.
- **Rendering.** No UI.

Pull requests that add any of these will be declined. Open an issue first if
you are unsure.

## Setup

```bash
git clone https://github.com/Radost-IT/trace-graph.git
cd trace-graph
npm install
npm test
```

Node >= 22. Tests use Node's built-in runner. The only build step is `tsc`.

```bash
npm run build      # tsc -> dist/
npm run typecheck  # tsc --noEmit
npm test           # builds, then runs test/*.test.ts
```

Tests import from `../dist/index.js`, not `../src/index.ts`. Node's type
stripping does not map a `.js` import to a `.ts` file, and testing the built
output tests what ships.

## Making a change

1. **Write the test first.** Each merge rule in the README has a test. A
   behaviour change that no test catches is not a change users can rely on.
2. **Keep it small.** No speculative options, no abstractions for one caller.
3. **Don't reformat code you didn't change.** Match the surrounding style.
4. **Add an entry under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md).**
   Describe the change as a user sees it.

Before opening a pull request:

```bash
npm run typecheck && npm test
```

CI runs the same on Node 22 and 24.

## Breaking changes that look small

Ids come from content. So each of these is breaking:

- Any change to `normaliseLabel`: a new honorific, different punctuation
  handling, different casing.
- Any change to the `entityId` format.
- Any change to the edge id (`source|target`).

Each moves existing data onto new ids and breaks merges against snapshots
stored by an older version. They need a major version, a CHANGELOG note and a
strong reason. New honorifics are the most likely valid case.

Changes to tie-breaking in `capNodes` or to the Louvain inputs change output
but not stored ids. Those are minor versions, and still need a CHANGELOG entry.

## Reporting a bug

Open an issue with the smallest `mergeExtraction` call that shows it: the
extraction you passed, the snapshot you expected, and the snapshot you got.

## Security

Do not open a public issue for a security problem. Email
security@radostit.com.

## Licence

Contributions are licensed under MIT, like the rest of the project.
