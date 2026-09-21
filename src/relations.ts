// Relation labels get drawn on an edge, on a television, at half the size of an
// entity name. A model asked for "1-4 words" still returns "is being assembled
// at", and on screen that is wider than the edge it sits on.
//
// Shortening happens here rather than in a renderer so every consumer sees the
// same label, and so it is testable without a device. It is deliberately
// conservative: only transforms that cannot change what the relation means.
// Anything still too long is the renderer's problem, which is where wrapping
// and ellipsis belong.

// Leading auxiliaries carry no meaning on an edge - the edge itself is the
// verb's tense. "is being assembled at" -> "assembled at".
const AUXILIARY =
  /^(is|are|was|were|be|been|being|has|have|had|will|would|can|does|did|to)(\s+|$)/i;

// Articles, same reasoning, and only ever leading.
const ARTICLE = /^(the|a|an)(\s+|$)/i;

// Multi-word connectors the model reaches for, and the short form that says
// the same thing. Whole-label matches only, so "in partnership with NASA"
// (which is not a label this ever sees) could never be mangled.
const SYNONYMS: [RegExp, string][] = [
  [/^in (partnership|collaboration|cooperation) with$/i, "with"],
  [/^together with$/i, "with"],
  [/^along with$/i, "with"],
  [/^on behalf of$/i, "for"],
  [/^as part of$/i, "part of"],
  [/^a member of$/i, "member of"],
  [/^responsible for$/i, "leads"],
  [/^located (in|at)$/i, "in"],
  [/^headquartered (in|at)$/i, "based in"],
  [/^(a )?subsidiary of$/i, "owned by"],
  [/^in charge of$/i, "leads"],
  [/^participating in$/i, "in"],
  [/^scheduled (to launch|for launch) (from|at)$/i, "launches from"],
];

/**
 * The label an edge should carry. Collapses whitespace, strips leading
 * auxiliaries and articles, then applies the synonym table.
 *
 * Returns `""` for a label that is empty once trimmed, which is the caller's
 * signal to drop the relation - an unlabelled edge tells a viewer nothing.
 */
export const shortenRelation = (label: string): string => {
  let out = label.replace(/\s+/g, " ").trim();

  // Repeat, because auxiliaries stack: "is being assembled at".
  for (let i = 0; i < 3; i += 1) {
    const next = out.replace(AUXILIARY, "").replace(ARTICLE, "").trim();
    if (next === out) break;
    out = next;
  }

  for (const [pattern, replacement] of SYNONYMS) {
    if (pattern.test(out)) return replacement;
  }

  return out;
};
