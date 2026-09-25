import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_MAX_NODES,
  applyMetrics,
  capNodes,
  dropIsolated,
  emptySnapshot,
  entityId,
  mergeExtraction,
  normaliseLabel,
  shortenRelation,
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

  assert.equal(snapshot.edges.length, 0, "unknown endpoint and self-edge both dropped");
  // And with no edge left, NASA has nothing to be connected to either.
  assert.equal(snapshot.nodes.length, 0);
});

test("the first summary and firstSeenAt win over later windows", () => {
  // Every entity here carries a relation, because one without is dropped.
  const window = (summary: string) =>
    extraction({
      entities: [
        { label: "NASA", type: "organisation", summary },
        { label: "Titan", type: "place", summary: "A moon." },
      ],
      relations: [{ source: "NASA", target: "Titan", label: "explores" }],
    });

  const first = mergeExtraction(emptySnapshot("s"), window("First."), AT);
  const second = mergeExtraction(first, window("Second."), LATER);

  assert.equal(second.nodes[0]!.summary, "First.");
  assert.equal(second.nodes[0]!.firstSeenAt, AT);
  assert.equal(second.generatedAt, LATER, "generatedAt does move");
});

test("an empty summary is replaced rather than kept", () => {
  const window = (summary: string) =>
    extraction({
      entities: [
        { label: "NASA", type: "organisation", summary },
        { label: "Titan", type: "place", summary: "A moon." },
      ],
      relations: [{ source: "NASA", target: "Titan", label: "explores" }],
    });

  const first = mergeExtraction(emptySnapshot("s"), window(""), AT);
  const second = mergeExtraction(first, window("Grounded."), LATER);

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
  // Chained, so none of them is isolated and the cap is what does the work.
  const relations = entities.slice(1).map((e, i) => ({
    source: entities[i]!.label,
    target: e.label,
    label: "knows",
  }));

  const snapshot = mergeExtraction(
    emptySnapshot("s"),
    extraction({ entities, relations }),
    AT,
  );
  assert.equal(snapshot.nodes.length, DEFAULT_MAX_NODES);
});

test("an all-isolates graph gets community 0 rather than throwing", () => {
  // Louvain needs at least one edge. `mergeExtraction` no longer keeps an
  // isolated node long enough to show this, so it is checked on the metrics
  // pass directly - which is the function that has to survive the case.
  const node = (id: string): GraphNode => ({
    id,
    type: "person",
    label: id,
    summary: "",
    degree: 0,
    community: 7,
    firstSeenAt: AT,
  });

  assert.deepEqual(
    applyMetrics([node("a"), node("b")], []).map((n) => n.community),
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

test("shortenRelation strips stacked auxiliaries", () => {
  assert.equal(shortenRelation("is being assembled at"), "assembled at");
  assert.equal(shortenRelation("has launched"), "launched");
  assert.equal(shortenRelation("will  explore "), "explore");
  // Nothing to strip is left exactly as it came.
  assert.equal(shortenRelation("leads"), "leads");
  assert.equal(shortenRelation("wished good luck to"), "wished good luck to");
});

test("shortenRelation swaps long connectors for short ones", () => {
  assert.equal(shortenRelation("in collaboration with"), "with");
  assert.equal(shortenRelation("is headquartered in"), "based in");
  assert.equal(shortenRelation("is a member of"), "member of");
});

test("shortenRelation reports an empty label as empty", () => {
  assert.equal(shortenRelation("   "), "");
  assert.equal(shortenRelation("the"), "");
});

test("an unlabelled relation is dropped rather than drawn blank", () => {
  const snapshot = mergeExtraction(
    emptySnapshot("s"),
    extraction({
      entities: [
        { label: "NASA", type: "organisation", summary: "Runs it." },
        { label: "Titan", type: "place", summary: "A moon." },
        { label: "Dragonfly", type: "event", summary: "A mission." },
      ],
      relations: [
        { source: "NASA", target: "Titan", label: "   " },
        { source: "Dragonfly", target: "Titan", label: "will explore" },
      ],
    }),
    AT,
  );

  assert.equal(snapshot.edges.length, 1);
  assert.equal(snapshot.edges[0]!.label, "explore");
});

test("an entity with no relation never reaches the snapshot", () => {
  const snapshot = mergeExtraction(
    emptySnapshot("s"),
    extraction({
      entities: [
        { label: "NASA", type: "organisation", summary: "Runs it." },
        { label: "Titan", type: "place", summary: "A moon." },
        { label: "Mauritius", type: "place", summary: "Named in passing." },
      ],
      relations: [{ source: "NASA", target: "Titan", label: "explores" }],
    }),
    AT,
  );

  assert.deepEqual(
    snapshot.nodes.map((n) => n.id).sort(),
    ["organisation:nasa", "place:titan"],
  );
});

test("an isolated node already stored is dropped on the next merge", () => {
  // Guards the order of operations: metrics, then isolation, then the cap.
  const stale = {
    ...emptySnapshot("s"),
    nodes: [
      {
        id: "place:serbia",
        type: "place" as const,
        label: "Serbia",
        summary: "Named once.",
        degree: 0,
        community: 0,
        firstSeenAt: AT,
      },
    ],
  };

  const snapshot = mergeExtraction(
    stale,
    extraction({
      entities: [
        { label: "NASA", type: "organisation", summary: "Runs it." },
        { label: "Titan", type: "place", summary: "A moon." },
      ],
      relations: [{ source: "NASA", target: "Titan", label: "explores" }],
    }),
    LATER,
  );

  assert.equal(
    snapshot.nodes.some((n) => n.id === "place:serbia"),
    false,
  );
});

test("dropIsolated keeps both ends of every edge", () => {
  const nodes: GraphNode[] = [
    { id: "a", type: "person", label: "A", summary: "", degree: 1, community: 0, firstSeenAt: AT },
    { id: "b", type: "person", label: "B", summary: "", degree: 1, community: 0, firstSeenAt: AT },
    { id: "c", type: "person", label: "C", summary: "", degree: 0, community: 0, firstSeenAt: AT },
  ];
  const kept = dropIsolated(nodes, [
    { id: "a|b", source: "a", target: "b", label: "knows", firstSeenAt: AT },
  ]);
  assert.deepEqual(kept.map((n) => n.id), ["a", "b"]);
});

test("a relation in the reverse direction does not add a second edge", () => {
  const snapshot = mergeExtraction(
    emptySnapshot("s"),
    extraction({
      entities: [
        { label: "A", type: "person", summary: "a" },
        { label: "B", type: "person", summary: "b" },
      ],
      relations: [
        { source: "A", target: "B", label: "knows" },
        { source: "B", target: "A", label: "knows" },
      ],
    }),
    AT,
  );

  assert.deepEqual(
    snapshot.edges.map((e) => e.id),
    ["person:a|person:b"],
  );
});

test("communities are the same on every run of the same input", () => {
  // Big enough that a random traversal order would find different partitions.
  const labels = Array.from({ length: 30 }, (_, i) => `P${i}`);
  const input = extraction({
    entities: labels.map((label) => ({ label, type: "person" as const, summary: "s" })),
    relations: labels.flatMap((label, i) =>
      [1, 2, 7].map((step) => ({ source: label, target: labels[(i + step) % 30]!, label: "knows" })),
    ),
  });

  const first = mergeExtraction(emptySnapshot("s"), input, AT);
  for (let run = 0; run < 20; run += 1) {
    assert.deepEqual(mergeExtraction(emptySnapshot("s"), input, AT), first);
  }
});

test("an unparseable seenAt is rejected", () => {
  const input = extraction({
    entities: [
      { label: "A", type: "person", summary: "a" },
      { label: "B", type: "person", summary: "b" },
    ],
    relations: [{ source: "A", target: "B", label: "knows" }],
  });

  assert.throws(() => mergeExtraction(emptySnapshot("s"), input, "yesterday"));
});

test("capNodes returns the input untouched when under the limit", () => {
  const nodes: GraphNode[] = [
    { id: "a", type: "person", label: "A", summary: "", degree: 0, community: 0, firstSeenAt: AT },
  ];
  const capped = capNodes(nodes, [], 5);
  assert.equal(capped.nodes, nodes);
});

test("normaliseLabel strips only one leading honorific", () => {
  assert.equal(normaliseLabel("Prof. Dr. Ada Lovelace"), "Dr. Ada Lovelace");
  assert.equal(normaliseLabel("Ada Lovelace, PhD"), "Ada Lovelace, PhD");
});

test("an object is typed and identified apart from its operator", () => {
  // A rocket and the agency that flies it were both typed `organisation`,
  // so a shared name put them on one id.
  assert.notEqual(
    entityId("object", "Thor Delta"),
    entityId("organisation", "Thor Delta"),
  );

  const snapshot = mergeExtraction(
    emptySnapshot("s"),
    extraction({
      entities: [
        { label: "Thor Delta", type: "object", summary: "The launch vehicle." },
        { label: "NASA", type: "organisation", summary: "Flew it." },
      ],
      relations: [{ source: "NASA", target: "Thor Delta", label: "launched" }],
    }),
    AT,
  );

  const rocket = snapshot.nodes.find((n) => n.id === "object:thor-delta");
  assert.equal(rocket?.type, "object");
});
