import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_MAX_NODES,
  capNodes,
  emptySnapshot,
  entityId,
  mergeExtraction,
  normaliseLabel,
  type ExtractionResult,
  type GraphNode,
} from "../dist/index.js";

const AT = "2026-09-19T10:00:00.000Z";
const LATER = "2026-09-19T10:00:20.000Z";

const extraction = (over: Partial<ExtractionResult> = {}): ExtractionResult => ({
  entities: [],
  relations: [],
  ...over,
});

test("normaliseLabel strips honorifics and collapses whitespace", () => {
  assert.equal(normaliseLabel("Dr.  Jane   Doe"), "Jane Doe");
  assert.equal(normaliseLabel("President Bloggs"), "Bloggs");
  assert.equal(normaliseLabel("  NASA "), "NASA");
  // Not an honorific, so it must survive.
  assert.equal(normaliseLabel("Drew Barrymore"), "Drew Barrymore");
});

test("entityId is stable across casing, punctuation and honorifics", () => {
  assert.equal(entityId("person", "Dr. Jane Doe"), "person:jane-doe");
  assert.equal(entityId("person", "jane doe"), "person:jane-doe");
  assert.equal(entityId("organisation", "Goddard Space Flight Center"), 
    "organisation:goddard-space-flight-center");
  // Type is part of the id, so a place and a person never collide.
  assert.notEqual(entityId("place", "Mercury"), entityId("person", "Mercury"));
});

test("entityId keeps non-latin scripts instead of emptying them", () => {
  assert.equal(entityId("place", "東京"), "place:東京");
});

test("a relation resolves to entities named differently in the same window", () => {
  const snapshot = mergeExtraction(
    emptySnapshot("s"),
    extraction({
      entities: [
        { label: "Dr. Jane Doe", type: "person", summary: "Leads it." },
        { label: "NASA", type: "organisation", summary: "Runs it." },
      ],
      relations: [{ source: "jane doe", target: "NASA", label: "leads" }],
    }),
    AT,
  );

  assert.equal(snapshot.edges.length, 1);
  assert.equal(snapshot.edges[0]!.source, "person:jane-doe");
  assert.equal(snapshot.edges[0]!.target, "organisation:nasa");
});

test("relations naming unknown entities are dropped, never invented", () => {
  const snapshot = mergeExtraction(
    emptySnapshot("s"),
    extraction({
      entities: [{ label: "NASA", type: "organisation", summary: "Runs it." }],
      relations: [
        { source: "Nobody At All", target: "NASA", label: "works at" },
        { source: "NASA", target: "NASA", label: "is itself" },
      ],
    }),
    AT,
  );

  assert.equal(snapshot.nodes.length, 1);
  assert.equal(snapshot.edges.length, 0, "unknown endpoint and self-edge both dropped");
});

test("the first summary and firstSeenAt win over later windows", () => {
  const first = mergeExtraction(
    emptySnapshot("s"),
    extraction({ entities: [{ label: "NASA", type: "organisation", summary: "First." }] }),
    AT,
  );
  const second = mergeExtraction(
    first,
    extraction({ entities: [{ label: "NASA", type: "organisation", summary: "Second." }] }),
    LATER,
  );

  assert.equal(second.nodes[0]!.summary, "First.");
  assert.equal(second.nodes[0]!.firstSeenAt, AT);
  assert.equal(second.generatedAt, LATER, "generatedAt does move");
});

test("an empty summary is replaced rather than kept", () => {
  const first = mergeExtraction(
    emptySnapshot("s"),
    extraction({ entities: [{ label: "NASA", type: "organisation", summary: "" }] }),
    AT,
  );
  const second = mergeExtraction(
    first,
    extraction({ entities: [{ label: "NASA", type: "organisation", summary: "Grounded." }] }),
    LATER,
  );

  assert.equal(second.nodes[0]!.summary, "Grounded.");
});

test("degree is recomputed across the whole snapshot, not incrementally", () => {
  let snapshot = mergeExtraction(
    emptySnapshot("s"),
    extraction({
      entities: [
        { label: "A", type: "person", summary: "a" },
        { label: "B", type: "person", summary: "b" },
      ],
      relations: [{ source: "A", target: "B", label: "knows" }],
    }),
    AT,
  );
  assert.deepEqual(
    snapshot.nodes.map((n) => n.degree),
    [1, 1],
  );

  snapshot = mergeExtraction(
    snapshot,
    extraction({
      entities: [{ label: "C", type: "person", summary: "c" }],
      relations: [{ source: "A", target: "C", label: "knows" }],
    }),
    LATER,
  );

  const byId = new Map(snapshot.nodes.map((n) => [n.id, n.degree]));
  assert.equal(byId.get("person:a"), 2, "A gained an edge");
  assert.equal(byId.get("person:b"), 1, "B is unchanged");
  assert.equal(byId.get("person:c"), 1);
});

test("duplicate edges are stored once", () => {
  const relations = [{ source: "A", target: "B", label: "knows" }];
  const entities = [
    { label: "A", type: "person" as const, summary: "a" },
    { label: "B", type: "person" as const, summary: "b" },
  ];

  let snapshot = mergeExtraction(emptySnapshot("s"), extraction({ entities, relations }), AT);
  snapshot = mergeExtraction(snapshot, extraction({ entities, relations }), LATER);

  assert.equal(snapshot.edges.length, 1);
});

test("merging is idempotent", () => {
  const input = extraction({
    entities: [
      { label: "A", type: "person", summary: "a" },
      { label: "B", type: "person", summary: "b" },
    ],
    relations: [{ source: "A", target: "B", label: "knows" }],
  });

  const once = mergeExtraction(emptySnapshot("s"), input, AT);
  const twice = mergeExtraction(once, input, AT);

  assert.deepEqual(twice, once);
});

test("merging an empty extraction leaves the graph alone", () => {
  const before = mergeExtraction(
    emptySnapshot("s"),
    extraction({ entities: [{ label: "NASA", type: "organisation", summary: "n" }] }),
    AT,
  );
  const after = mergeExtraction(before, extraction(), LATER);

  assert.deepEqual(after.nodes, before.nodes);
  assert.deepEqual(after.edges, before.edges);
});

test("capNodes keeps the best connected and drops dangling edges", () => {
  const node = (id: string, degree: number, firstSeenAt: string): GraphNode => ({
    id,
    type: "person",
    label: id,
    summary: "",
    degree,
    community: 0,
    firstSeenAt,
  });

  const nodes = [node("a", 5, AT), node("b", 1, AT), node("c", 3, AT)];
  const edges = [
    { id: "a|c", source: "a", target: "c", label: "", firstSeenAt: AT },
    { id: "a|b", source: "a", target: "b", label: "", firstSeenAt: AT },
  ];

  const capped = capNodes(nodes, edges, 2);
  assert.deepEqual(
    capped.nodes.map((n) => n.id),
    ["a", "c"],
  );
  assert.deepEqual(
    capped.edges.map((e) => e.id),
    ["a|c"],
    "the edge to the dropped node goes with it",
  );
});

test("capNodes breaks degree ties by age, oldest first", () => {
  const same = (id: string, firstSeenAt: string): GraphNode => ({
    id,
    type: "person",
    label: id,
    summary: "",
    degree: 1,
    community: 0,
    firstSeenAt,
  });

  const capped = capNodes([same("new", LATER), same("old", AT)], [], 1);
  assert.deepEqual(
    capped.nodes.map((n) => n.id),
    ["old"],
  );
});

test("the snapshot is capped at DEFAULT_MAX_NODES when no limit is given", () => {
  const entities = Array.from({ length: DEFAULT_MAX_NODES + 15 }, (_, i) => ({
    label: `Person ${i}`,
    type: "person" as const,
    summary: "s",
  }));

  const snapshot = mergeExtraction(emptySnapshot("s"), extraction({ entities }), AT);
  assert.equal(snapshot.nodes.length, DEFAULT_MAX_NODES);
});

test("an all-isolates graph gets community 0 rather than throwing", () => {
  const snapshot = mergeExtraction(
    emptySnapshot("s"),
    extraction({
      entities: [
        { label: "A", type: "person", summary: "a" },
        { label: "B", type: "person", summary: "b" },
      ],
    }),
    AT,
  );

  assert.deepEqual(
    snapshot.nodes.map((n) => n.community),
    [0, 0],
  );
});

test("two disconnected clusters land in different communities", () => {
  const snapshot = mergeExtraction(
    emptySnapshot("s"),
    extraction({
      entities: ["A", "B", "C", "D"].map((label) => ({
        label,
        type: "person" as const,
        summary: label,
      })),
      relations: [
        { source: "A", target: "B", label: "knows" },
        { source: "C", target: "D", label: "knows" },
      ],
    }),
    AT,
  );

  const by = new Map(snapshot.nodes.map((n) => [n.id, n.community]));
  assert.equal(by.get("person:a"), by.get("person:b"));
  assert.equal(by.get("person:c"), by.get("person:d"));
  assert.notEqual(by.get("person:a"), by.get("person:c"));
});

test("entities with a blank label are skipped", () => {
  const snapshot = mergeExtraction(
    emptySnapshot("s"),
    extraction({ entities: [{ label: "   ", type: "person", summary: "nothing" }] }),
    AT,
  );

  assert.equal(snapshot.nodes.length, 0);
});
