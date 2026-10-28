import type { StopState } from "../contract";
import type { Color } from "./palette";
import type { Px } from "./px";
import { BRASS, COPPER, IRON, ball, bezel, blotch, bracket, cylH, cylV, drop, face, noise, rivet, smoke, strap, streak, tone } from "./shade";
import { shift } from "./px";
import type { StationDef } from "./types";

// Builder: a boxy riveted iron machine. Brass-strapped body with a top face, a brass chimney on a riveted collar,
// a ball-knob lever, a 3x3 window, a big steel gear in a brass bezel, a copper tank down the right side, an iron
// intake pipe with a brass flange on the left. Working: the gear turns and a thin wisp leaves the chimney.
// Jammed: red window and knob, gear stuck, grey smoke. Auto: green.

const GLASS: Record<StopState, readonly Color[]> = {
  idle: ["iron-0", "steel-1", "steel-2", "steel-3", "haze-3"],
  working: ["sun-2", "sun-4", "sun-5", "sun-6", "white"],
  jammed: ["jam-0", "jam-1", "jam-2", "jam-2", "haze-3"],
  auto: ["ok-0", "ok-1", "ok-2", "ok-2", "white"],
};

function gear(g: Px, cx: number, cy: number, turn: number) {
  // 8 square teeth; turn is in tooth-steps (0..1 loops). Machined steel: lit half light grey, shadow half mid grey,
  // a bright rim along the lit edge, a dark hub with a bolt.
  for (let y = Math.floor(cy - 8); y <= Math.ceil(cy + 8); y++) for (let x = Math.floor(cx - 8); x <= Math.ceil(cx + 8); x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx) - (turn / 8) * Math.PI * 2;
    const R = Math.cos(a * 8) > 0.1 ? 7.4 : 5.4;
    if (d > R) continue;
    const k = (dx - dy) / (d || 1); // -1.4 shadow side .. 1.4 lit side
    let c: Color = "steel-3"; // a flat machined face, lit at the rim that faces the sun, shadowed opposite
    if (d > R - 1.2) c = k > 0.3 ? "haze-2" : k < -0.5 ? "steel-2" : "steel-3";
    if (d > 3.4 && d < 4.4) c = k < 0 ? "steel-2" : "iron-3"; // the web's inner lip
    if (d < 3.4) c = d < 1.2 ? "brass-3" : d < 2.2 ? "brass-1" : k > 0.3 ? "steel-1" : "iron-0";
    g.set(x, y, c);
  }
  g.set(cx + 1.5, cy - 2.5, "haze-3"); g.set(cx + 4.5, cy - 4.5, "haze-3"); // glints on the hub collar and the lit rim
}

export const builder: StationDef = {
  w: 52, h: 66,
  anim: (s) => (s === "working" ? { n: 8, fps: 4 } : s === "jammed" ? { n: 8, fps: 3 } : { n: 1, fps: 0 }),
  draw(raw, s, f) {
    // Traced from Justin's builder art and narrowed to fit its slot on the line (stops are ~50 art px apart):
    // 48 x 54 of machine, plus a 1px outline margin and smoke headroom above the chimney.
    const g = shift(raw, -1, 11);

    g.glow(4, 53, 38, 2, "iron-0", 0.5, true); // contact shadow on the deck, falling down-left

    // --- behind: left riser + intake stub
    cylV(g, 4, 19, 5, 15, IRON, { amb: 0.08, gloss: 0.4 });
    cylH(g, 4, 16, 9, 5, IRON, { amb: 0.08, gloss: 0.4 });
    cylH(g, 3, 33, 6, 8, IRON, { amb: 0.06, gloss: 0.5 });
    cylV(g, 2, 32, 2, 10, BRASS, { amb: 0.3 });

    // --- top face, seen from above: iron between brass edge straps
    for (let k = 0; k < 7; k++) {
      const y = 13 + k, x0 = 15 - k, x1 = 41 - Math.round(k / 2);
      for (let x = x0; x <= x1; x++) tone(g, x, y, IRON, 0.6 + 0.16 * ((x - x0) / (x1 - x0)) + (blotch(x, y, 3, 5) - 0.5) * 0.25);
      tone(g, x0, y, BRASS, 0.5); tone(g, x0 + 1, y, BRASS, 0.35);
      tone(g, x1, y, BRASS, 0.72); tone(g, x1 - 1, y, BRASS, 0.5);
    }
    strap(g, 15, 13, 27, 2, BRASS, 5); // back edge
    for (const cx of [12, 36]) strap(g, cx, 15, 4, 3, BRASS); // corner plates

    // --- right side face (lit)
    for (let y = 17; y < 53; y++) for (let x = 39; x < 42; x++) tone(g, x, y, IRON, 0.46 + (x - 39) * 0.06 - (y - 17) * 0.004 + (noise(x, y, 8) - 0.5) * 0.1);

    // --- front face: dark iron, rust and grime, framed in brass
    face(g, 8, 20, 32, 34, IRON, 0.36, { rust: 0.06, grime: 4, seed: 11 });
    strap(g, 8, 19, 32, 2, BRASS, 4);
    strap(g, 8, 22, 2, 31, BRASS);
    strap(g, 38, 22, 2, 31, BRASS);
    g.vline(35, 35, 13, "iron-0"); rivet(g, 34, 37, "iron-4", "soot"); rivet(g, 34, 45, "iron-4", "soot");
    for (const [x, y, n] of [[12, 21, 4], [27, 21, 3], [34, 39, 5], [9, 33, 6], [36, 21, 2]] as const) streak(g, x, y, n); // rust run off the bands
    bracket(g, 8, 19, 0, 0); bracket(g, 39, 19, 1, 0); bracket(g, 8, 53, 0, 1); bracket(g, 39, 53, 1, 1);

    // vent panel + latch (upper left)
    drop(g, 11, 22, 7, 11);
    g.rect(11, 22, 7, 11, "iron-2"); g.box(11, 22, 7, 11, "brass-1"); g.hline(11, 22, 7, "brass-2"); g.vline(17, 22, 11, "brass-0"); g.set(17, 22, "brass-3");
    g.rect(13, 24, 3, 7, "iron-0");
    g.vline(13, 24, 7, "soot"); g.vline(15, 24, 7, "soot"); g.vline(14, 25, 6, "iron-3");
    strap(g, 19, 25, 5, 4, BRASS); g.hline(20, 26, 3, "iron-0");

    // the window: 3 x 2 cells behind a brass frame
    const gl = GLASS[s];
    strap(g, 25, 23, 11, 8, BRASS);
    g.rect(26, 24, 9, 6, "soot");
    for (const cy of [24, 27]) for (const cx of [26, 29, 32]) {
      tone(g, cx, cy, gl, 0.75); tone(g, cx + 1, cy, gl, 1); tone(g, cx, cy + 1, gl, 0.5); tone(g, cx + 1, cy + 1, gl, 0.75);
    }
    if (s !== "idle") { // lamp glow on the iron around the window (light layer)
      const c = s === "working" ? "sun-5" : s === "jammed" ? "jam-2" : "ok-2";
      g.glowDisc(30.5, 27, 8.5, c, 0.25, [25, 23, 11, 8]);
      g.glow(25, 22, 11, 1, c, 0.5); g.glow(24, 23, 1, 8, c, 0.25); g.glow(36, 23, 1, 8, c, 0.5); g.glow(25, 31, 11, 1, c, 0.25);
    }

    // --- the gear in its brass bezel
    const gx = 21.5, gy = 42.5;
    for (let y = Math.floor(gy - 12); y <= gy + 13; y++) for (let x = Math.floor(gx - 13); x <= gx + 12; x++) if (Math.hypot(x + 1.5 - gx, y - 0.5 - gy) <= 10.6 && g.has(x, y)) g.set(x, y, "iron-0"); // its shadow
    bezel(g, gx, gy, 8, 10.6, BRASS);
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 + 0.3; rivet(g, Math.round(gx + Math.cos(a) * 9.3 - 0.5), Math.round(gy + Math.sin(a) * 9.3 - 1)); }
    for (let y = Math.floor(gy - 9); y <= gy + 9; y++) for (let x = Math.floor(gx - 9); x <= gx + 9; x++) {
      const d = Math.hypot(x + 0.5 - gx, y + 0.5 - gy);
      if (d <= 8) g.set(x, y, d > 7.4 ? "soot" : "iron-0");
    }
    gear(g, gx, gy, s === "working" ? (f % 4) / 4 : 0);

    // --- copper tank on the right, its elbow into the top, a brass cap out the side
    for (const [y, h, w] of [[20, 13, 9], [35, 11, 8], [48, 3, 9]] as const) { // stacked segments, each its own cylinder
      cylV(g, 40, y, w, h, COPPER, { amb: 0.09, gloss: 1.0 });
      for (let x = 40; x < 40 + w; x++) { tone(g, x, y, COPPER, 0.55 + (x - 40) * 0.05); g.set(x, y + h - 1, x < 44 ? "soot" : "copper-0"); } // lit lip, dark foot
    }
    for (const y of [18, 33, 46]) { cylV(g, 39, y, 11, 2, BRASS, { amb: 0.2, gloss: 0.9 }); g.set(48, y, "brass-5"); } // brass rings, a glint where the sun hits
    for (let x = 40; x < 49; x++) g.set(x, 20, x < 44 ? "soot" : "brass-0"); // shadow under the top ring
    cylH(g, 35, 13, 10, 5, COPPER, { amb: 0.18 });
    cylV(g, 41, 13, 6, 6, COPPER, { amb: 0.18 });
    cylV(g, 49, 34, 2, 6, BRASS, { amb: 0.3 });

    // --- feet
    for (const fx of [8, 32]) { strap(g, fx, 49, 8, 3, BRASS, 3); cylH(g, fx, 52, 8, 2, BRASS, { amb: 0.15 }); }

    // --- chimney on a riveted collar
    drop(g, 21, 12, 12, 3, "soot");
    cylH(g, 21, 12, 12, 3, BRASS, { amb: 0.16, gloss: 0.6 });
    for (let x = 22; x < 33; x += 3) rivet(g, x, 13);
    cylV(g, 23, 4, 8, 9, IRON, { amb: 0.1, gloss: 0.8 }); // iron stack
    cylV(g, 23, 8, 8, 1, BRASS, { amb: 0.3 }); // a brass band round it
    cylV(g, 22, 1, 10, 3, BRASS, { amb: 0.3, gloss: 1.1 }); // lip
    g.hline(24, 1, 6, "soot"); g.hline(25, 2, 4, "iron-0"); g.set(30, 1, "brass-5"); // the dark opening, a glint on the rim

    // --- the lever: brass rod on a plate, ball knob on top
    strap(g, 10, 13, 6, 2, BRASS);
    g.vline(12, 8, 6, "brass-1"); g.vline(13, 8, 6, "brass-3");
    const plain = s === "idle" || s === "working";
    ball(g, 13, 6.5, 2.8, plain ? IRON : s === "jammed" ? JAM_BALL : OK_BALL, { amb: plain ? 0.25 : 0.35 });

    raw.outline();

    // --- life: smoke leaves the chimney (after the outline: smoke has no hard edge)
    if (s === "working") smoke(g, 26, -1, f / 8);
    if (s === "jammed") smoke(g, 26, -1, f / 8, true);
  },
};

const JAM_BALL = ["jam-0", "jam-0", "jam-1", "jam-2", "jam-2", "white"] as const;
const OK_BALL = ["ok-0", "ok-0", "ok-1", "ok-2", "ok-2", "white"] as const;
