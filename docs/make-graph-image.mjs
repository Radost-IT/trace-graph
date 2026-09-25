// Draws docs/graph.svg from a snapshot this package built, so the README
// picture follows the merge rules.
// Nothing here ships: `files` in package.json is dist, README and LICENSE.
//
// Layout is out of scope for the package, so it lives here: a plain spring
// embedder with fixed iterations and no randomness. Enough for ten nodes, and
// the SVG is byte-identical between runs.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { emptySnapshot, mergeExtraction } from "../dist/index.js";

const WINDOWS = [
  {
    entities: [
      { label: "Thor Delta", type: "object", summary: "The three-stage launch vehicle." },
      { label: "Cape Canaveral", type: "place", summary: "The Florida launch site." },
      { label: "NASA", type: "organisation", summary: "Runs the programme." },
    ],
    relations: [
      { source: "Thor Delta", target: "Cape Canaveral", label: "launches from" },
      { source: "NASA", target: "Thor Delta", label: "flies" },
    ],
  },
  {
    entities: [
      { label: "Tiros II", type: "object", summary: "The weather satellite it carried." },
      { label: "Second Launch", type: "event", summary: "The November flight." },
      { label: "Dr. Jane Doe", type: "person", summary: "Leads the mission team." },
      { label: "Goddard Space Flight Center", type: "organisation", summary: "Built the satellite." },
    ],
    relations: [
      { source: "Thor Delta", target: "Tiros II", label: "carried" },
      { source: "Second Launch", target: "Thor Delta", label: "used" },
      { source: "Jane Doe", target: "Second Launch", label: "leads" },
      { source: "Goddard Space Flight Center", target: "Tiros II", label: "built" },
      { source: "Jane Doe", target: "Goddard Space Flight Center", label: "works at" },
    ],
  },
  {
    entities: [
      { label: "Fort Monmouth", type: "place", summary: "The New Jersey receiving station." },
      { label: "Infrared Scanner", type: "object", summary: "One of the two cameras aboard." },
      { label: "Weather Bureau", type: "organisation", summary: "Reads the pictures." },
    ],
    relations: [
      { source: "Tiros II", target: "Fort Monmouth", label: "transmits to" },
      { source: "Infrared Scanner", target: "Tiros II", label: "carried by" },
      { source: "Weather Bureau", target: "Fort Monmouth", label: "receives at" },
      { source: "Weather Bureau", target: "NASA", label: "works with" },
    ],
  },
];

let snapshot = emptySnapshot("readme");
WINDOWS.forEach((window, i) => {
  const at = new Date(Date.UTC(2026, 8, 19, 10, 0, i * 20)).toISOString();
  snapshot = mergeExtraction(snapshot, window, at, { maxNodes: 60 });
});

/* Layout ------------------------------------------------------------------ */

const WIDTH = 1200;
const HEIGHT = 720;
const PASSES = 1400;

const place = (nodes, edges) => {
  // Seeded on a circle by index, so two runs give the same picture.
  const points = nodes.map((node, i) => {
    const angle = (i / nodes.length) * Math.PI * 2;
    return { id: node.id, x: Math.cos(angle) * 240, y: Math.sin(angle) * 240 };
  });
  const byId = new Map(points.map((p) => [p.id, p]));
  const links = edges.map((e) => [byId.get(e.source), byId.get(e.target)]);

  for (let pass = 0; pass < PASSES; pass++) {
    const cooling = 1 - pass / PASSES;

    for (const a of points) {
      for (const b of points) {
        if (a === b) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distance = Math.hypot(dx, dy) || 0.01;
        const push = 62000 / (distance * distance);
        a.x += (dx / distance) * push * cooling * 0.05;
        a.y += (dy / distance) * push * cooling * 0.05;
      }
    }

    for (const [a, b] of links) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy) || 0.01;
      const pull = (distance - 215) * 0.012 * cooling;
      a.x += (dx / distance) * pull;
      a.y += (dy / distance) * pull;
      b.x -= (dx / distance) * pull;
      b.y -= (dy / distance) * pull;
    }

    for (const p of points) {
      p.x -= p.x * 0.004 * cooling;
      p.y -= p.y * 0.004 * cooling;
    }
  }
  return byId;
};

const fit = (byId) => {
  const points = [...byId.values()];
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const pad = 108;
  const scale = Math.min(
    (WIDTH - pad * 2) / (Math.max(...xs) - Math.min(...xs)),
    (HEIGHT - pad * 2) / (Math.max(...ys) - Math.min(...ys)),
  );
  const midX = (Math.max(...xs) + Math.min(...xs)) / 2;
  const midY = (Math.max(...ys) + Math.min(...ys)) / 2;
  for (const p of points) {
    p.x = WIDTH / 2 + (p.x - midX) * scale;
    p.y = HEIGHT / 2 + (p.y - midY) * scale;
  }
};

/* Paint ------------------------------------------------------------------- */

// Trace's own palette. Colour is the entity type, radius is degree centrality.
const BACKGROUND = "#05070E";
const TYPE_COLOURS = {
  person: "#F5B740",
  organisation: "#5AA9FF",
  event: "#3ADFA6",
  place: "#FF8A5B",
  object: "#B266FF",
};

const hex = (value) => {
  const n = parseInt(value.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const pad2 = (n) => n.toString(16).padStart(2, "0");
const mix = (a, b, t) => {
  const [ar, ag, ab] = hex(a);
  const [br, bg, bb] = hex(b);
  return `#${pad2(Math.round(ar + (br - ar) * t))}${pad2(Math.round(ag + (bg - ag) * t))}${pad2(Math.round(ab + (bb - ab) * t))}`;
};

const radius = (node) => Math.min(44, 22 + Math.sqrt(node.degree) * 9);

const nameWidth = (node) => Math.max(64, escape(node.label).length * 8.2 + 18);

const LABEL_FRACTIONS = [0.38, 0.62, 0.5, 0.28, 0.72];

const labelSpot = (a, b, width) => {
  let fallback = null;
  for (const t of LABEL_FRACTIONS) {
    const midX = a.x + (b.x - a.x) * t;
    const midY = a.y + (b.y - a.y) * t;
    fallback ??= { midX, midY };
    const clear = [...byId.entries()].every(([id, p]) => {
      const node = byDegree.get(id);
      // The disc plus the name plate hanging under it, as one box.
      const half = Math.max(radius(node), nameWidth(node) / 2) + 10;
      const top = p.y - radius(node) - 10;
      const bottom = p.y + radius(node) + 44;
      const dx = Math.max(Math.abs(p.x - midX) - width / 2 - half, 0);
      const dy = Math.max(midY - 11 - bottom, top - midY - 11, 0);
      return dx > 0 || dy > 0;
    });
    if (clear) return { midX, midY };
  }
  return fallback;
};
const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const byId = place(snapshot.nodes, snapshot.edges);
fit(byId);
const typeOf = new Map(snapshot.nodes.map((n) => [n.id, n.type]));
const byDegree = new Map(snapshot.nodes.map((n) => [n.id, n]));

const defs = Object.entries(TYPE_COLOURS)
  .map(
    ([type, colour]) => `
    <radialGradient id="disc-${type}" cx="50%" cy="26%" r="82%">
      <stop offset="0%" stop-color="${mix(BACKGROUND, colour, 0.42)}"/>
      <stop offset="100%" stop-color="${mix(BACKGROUND, colour, 0.11)}"/>
    </radialGradient>
    <radialGradient id="glow-${type}" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${colour}" stop-opacity="0.3"/>
      <stop offset="55%" stop-color="${colour}" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="${colour}" stop-opacity="0"/>
    </radialGradient>`,
  )
  .join("");

const edges = snapshot.edges
  .map((edge) => {
    const a = byId.get(edge.source);
    const b = byId.get(edge.target);
    const colour = mix(TYPE_COLOURS[typeOf.get(edge.source)], TYPE_COLOURS[typeOf.get(edge.target)], 0.5);
    // Labels sit off-centre so edges that cross near their midpoints don't
    // stack. The first fraction that clears every node wins.
    const width = Math.max(52, escape(edge.label).length * 7.4);
    const { midX, midY } = labelSpot(a, b, width);
    return {
      line: `
    <line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${colour}" stroke-opacity="0.34" stroke-width="2"/>`,
      label: `
    <rect x="${(midX - width / 2).toFixed(1)}" y="${(midY - 11).toFixed(1)}" width="${width}" height="22" rx="7" fill="#060B15" fill-opacity="0.9"/>
    <text x="${midX.toFixed(1)}" y="${(midY + 4).toFixed(1)}" text-anchor="middle" font-size="12" fill="#93A6C2">${escape(edge.label)}</text>`,
    };
  });

const nodes = snapshot.nodes
  .map((node) => {
    const p = byId.get(node.id);
    const r = radius(node);
    const colour = TYPE_COLOURS[node.type];
    const width = Math.max(64, escape(node.label).length * 8.2 + 18);
    return `
    <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${(r * 2.4).toFixed(1)}" fill="url(#glow-${node.type})"/>
    <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r.toFixed(1)}" fill="url(#disc-${node.type})" stroke="${colour}" stroke-opacity="0.9" stroke-width="2"/>
    <rect x="${(p.x - width / 2).toFixed(1)}" y="${(p.y + r + 8).toFixed(1)}" width="${width}" height="26" rx="8" fill="#060B15" fill-opacity="0.86"/>
    <text x="${p.x.toFixed(1)}" y="${(p.y + r + 26).toFixed(1)}" text-anchor="middle" font-size="15" fill="#F4F8FD">${escape(node.label)}</text>`;
  })
  .join("");

const legend = Object.entries(TYPE_COLOURS)
  .map(([type, colour], i) => {
    const x = 34 + i * 138;
    return `
    <circle cx="${x}" cy="${HEIGHT - 30}" r="8" fill="${mix(BACKGROUND, colour, 0.42)}" stroke="${colour}" stroke-width="2"/>
    <text x="${x + 16}" y="${HEIGHT - 25}" font-size="14" fill="#93A6C2">${type}</text>`;
  })
  .join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif">
  <defs>${defs}</defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${BACKGROUND}"/>
  <g>${edges.map((e) => e.line).join("")}</g>
  <g>${nodes}</g>
  <g>${edges.map((e) => e.label).join("")}</g>
  <g>${legend}</g>
  <text x="${WIDTH - 34}" y="${HEIGHT - 25}" text-anchor="end" font-size="13" fill="#5D7192">${snapshot.nodes.length} nodes, ${snapshot.edges.length} edges, after 3 merges</text>
</svg>
`;

const out = join(dirname(fileURLToPath(import.meta.url)), "graph.svg");
writeFileSync(out, svg);
console.log(`${out}: ${snapshot.nodes.length} nodes, ${snapshot.edges.length} edges`);
