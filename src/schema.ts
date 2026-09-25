import { z } from "zod";

// `object` is a named made thing: a spacecraft, a ship, a class of engine.
// These were typed `organisation`, which put a rocket in the same colour as
// the agency that flew it.
export const EntityType = z.enum([
  "person",
  "organisation",
  "place",
  "event",
  "object",
]);
export type EntityType = z.infer<typeof EntityType>;

export const GraphNode = z.object({
  id: z.string(),
  type: EntityType,
  label: z.string(),
  summary: z.string(),
  degree: z.number().nonnegative(),
  community: z.number().int().nonnegative(),
  firstSeenAt: z.iso.datetime(),
});
export type GraphNode = z.infer<typeof GraphNode>;

export const GraphEdge = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  label: z.string(),
  firstSeenAt: z.iso.datetime(),
});
export type GraphEdge = z.infer<typeof GraphEdge>;

export const GraphSnapshot = z.object({
  sessionId: z.string(),
  generatedAt: z.iso.datetime(),
  nodes: z.array(GraphNode),
  edges: z.array(GraphEdge),
});
export type GraphSnapshot = z.infer<typeof GraphSnapshot>;

// What one pass of extraction hands the graph. Entities and relations are
// described by label, not by id - assigning ids is this package's job, so the
// producer never has to know how they are built.
export const ExtractionResult = z.object({
  entities: z.array(
    z.object({
      label: z.string(),
      type: EntityType,
      summary: z.string(),
    }),
  ),
  relations: z.array(
    z.object({
      source: z.string(),
      target: z.string(),
      label: z.string(),
    }),
  ),
});
export type ExtractionResult = z.infer<typeof ExtractionResult>;
