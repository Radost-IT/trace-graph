import { GraphSnapshot, type ExtractionResult } from "./schema.js";
import { entityId, normaliseLabel } from "./ids.js";
import { applyMetrics, capNodes } from "./metrics.js";

// Matches the TV renderer's comfortable ceiling. Callers that store snapshots
// under a size limit should pass their own.
export const DEFAULT_MAX_NODES = 60;

export interface MergeOptions {
  maxNodes?: number;
}

export const emptySnapshot = (sessionId: string): GraphSnapshot => ({
  sessionId,
  generatedAt: new Date().toISOString(),
  nodes: [],
  edges: [],
});

// Merge one window's extraction into the running snapshot. Pure and
// deterministic: the same snapshot plus the same extraction always produces the
// same result, which is what makes re-ingesting a clip idempotent.
export function mergeExtraction(
  snapshot: GraphSnapshot,
  extraction: ExtractionResult,
  seenAt: string,
  options: MergeOptions = {},
): GraphSnapshot {
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  const nodes = new Map(snapshot.nodes.map((n) => [n.id, n]));
  const edges = new Map(snapshot.edges.map((e) => [e.id, e]));
  const idByLabel = new Map(snapshot.nodes.map((n) => [n.label.toLowerCase(), n.id]));

  for (const entity of extraction.entities) {
    const label = normaliseLabel(entity.label);
    if (!label) continue;
    const id = entityId(entity.type, label);
    idByLabel.set(label.toLowerCase(), id);

    const existing = nodes.get(id);
    nodes.set(id, {
      id,
      type: entity.type,
      label,
      // First grounded summary wins. A later window rarely knows more about an
      // entity than the window that introduced it, and a summary that rewrites
      // itself under the viewer is worse than one that holds still.
      summary: existing?.summary || entity.summary,
      degree: existing?.degree ?? 0,
      community: existing?.community ?? 0,
      firstSeenAt: existing?.firstSeenAt ?? seenAt,
    });
  }

  const resolve = (label: string): string | undefined =>
    idByLabel.get(normaliseLabel(label).toLowerCase());

  for (const relation of extraction.relations) {
    const source = resolve(relation.source);
    const target = resolve(relation.target);
    // The producer was told both ends must be known entities. When it ignores
    // that we drop the edge rather than invent a node for it.
    if (!source || !target || source === target) continue;

    const id = `${source}|${target}`;
    if (edges.has(id)) continue;
    edges.set(id, { id, source, target, label: relation.label, firstSeenAt: seenAt });
  }

  const withMetrics = applyMetrics([...nodes.values()], [...edges.values()]);
  const capped = capNodes(withMetrics, [...edges.values()], maxNodes);

  return GraphSnapshot.parse({
    sessionId: snapshot.sessionId,
    generatedAt: seenAt,
    nodes: capped.nodes,
    edges: capped.edges,
  });
}
