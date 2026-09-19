import type { EntityType } from "./schema.js";

// A stable id per entity so the same person mentioned in window 3 and window 40
// lands on the same node. Deliberately dumb: casing, punctuation and honorifics
// are normalised away, and anything subtler than that is coreference work that
// belongs to the model, not to a regex.
const HONORIFICS = /^(mr|mrs|ms|miss|dr|prof|professor|sir|dame|president|administrator)\.?\s+/i;

export const normaliseLabel = (label: string): string =>
  label.replace(HONORIFICS, "").replace(/\s+/g, " ").trim();

export const entityId = (type: EntityType, label: string): string =>
  `${type}:${normaliseLabel(label)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")}`;
