import * as graphology from "graphology";
import * as louvainModule from "graphology-communities-louvain";
import type { GraphEdge, GraphNode } from "./schema.js";

// Both packages are CommonJS and ship no "exports" map. Node hands the ESM default
// import the real class/function (module.exports), but TypeScript under NodeNext
// types that default as the module namespace, so both need a cast back to the shape
// the runtime actually provides.
const Graph = graphology.default as unknown as typeof graphology.UndirectedGraph;
type GraphInstance = InstanceType<typeof graphology.UndirectedGraph>;
const louvain = louvainModule.default as unknown as (
  graph: GraphInstance,
) => Record<string, number>;

// Degree centrality drives node size and Louvain drives node colour - both
// fields already exist in the wire format. Recomputed over the whole snapshot
// on every merge, because one new edge can change both for nodes far away.
export const applyMetrics = (nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] => {
  if (nodes.length === 0) return nodes;

  const graph = new Graph({ type: "undirected", multi: false });
  for (const node of nodes) graph.addNode(node.id);
  for (const edge of edges) {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue;
    if (!graph.hasEdge(edge.source, edge.target)) graph.addEdge(edge.source, edge.target);
  }

  // Louvain needs at least one edge; an all-isolates graph is community 0.
  const communities: Record<string, number> =
    graph.size > 0 ? louvain(graph) : Object.fromEntries(nodes.map((n) => [n.id, 0]));

  return nodes.map((node) => ({
    ...node,
    degree: graph.hasNode(node.id) ? graph.degree(node.id) : 0,
    community: communities[node.id] ?? 0,
  }));
};

// A snapshot has to stay small enough to store and to render. Least connected
// nodes go first, ties broken by age, so the spine of the story stays.
export const capNodes = (
  nodes: GraphNode[],
  edges: GraphEdge[],
  maxNodes: number,
): { nodes: GraphNode[]; edges: GraphEdge[] } => {
  if (nodes.length <= maxNodes) return { nodes, edges };

  const kept = [...nodes]
    .sort((a, b) => b.degree - a.degree || a.firstSeenAt.localeCompare(b.firstSeenAt))
    .slice(0, maxNodes);
  const keptIds = new Set(kept.map((n) => n.id));

  return {
    nodes: kept,
    edges: edges.filter((e) => keptIds.has(e.source) && keptIds.has(e.target)),
  };
};
