import type { StopState } from "../contract";
import type { Color } from "./palette";
import type { Px } from "./px";
import { BRASS, COPPER, IRON, ball, bezel, blotch, cylH, cylV, drop, face, noise, rivet, smoke, strap, tone } from "./shade";
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
  // 8 square-ish teeth; turn is in tooth-steps (0..1 loops). Flat machined face: light on the upper-right half,
  // a bright rim on the lit edges, a dark rim on the shadow edges, a dark hub with a bolt.
  for (let y = Math.floor(cy - 8); y <= Math.ceil(cy + 8); y++) for (let x = Math.floor(cx - 8); x <= Math.ceil(cx + 8); x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx) - (turn / 8) * Math.PI * 2;
    const R = Math.cos(a * 8) > -0.15 ? 7 : 5.3;
    if (d > R) continue;
    const lit = dx - dy > 1.5;
    let c: Color = lit ? "haze-2" : "iron-4";
    if (d > R - 1) c = dx - dy > 2 ? "haze-3" : dx - dy < -1 ? "iron-3" : c;
    if (d < 3.3) c = d < 1.4 ? "soot" : lit ? "iron-3" : "iron-1";
    g.set(x, y, c);
  }
  g.set(cx + 0.5, cy - 2.5, "white"); // glint on the hub collar
}

export const builder: StationDef = {
  w: 66, h: 66,
  anim: (s) => (s === "working" ? { n: 8, fps: 4 } : s === "jammed" ? { n: 8, fps: 3 } : { n: 1, fps: 0 }),
  draw(raw, s, f) {
    // laid out on a 64 x 54 frame traced from Justin's builder art; the grid adds a 1px outline margin and
    // smoke headroom above the chimney
    const g = shift(raw, 1, 11);

    g.glow(5, 53, 44, 2, "iron-0", 0.5, true); // contact shadow on the deck, falling down-left

    // --- behind: left riser + intake pipe with its brass flange
    cylV(g, 6, 19, 5, 15, IRON, { amb: 0.22 });
    cylH(g, 6, 16, 9, 5, IRON, { amb: 0.22 });
    cylH(g, 2, 33, 10, 8, IRON, { amb: 0.2, gloss: 0.5 });
    cylV(g, 0, 31, 4, 12, BRASS, { amb: 0.2 });
    rivet(g, 1, 33); rivet(g, 1, 39);

    // --- top face, seen from above: dark iron between brass edge straps
    for (let k = 0; k < 7; k++) {
      const y = 13 + k, x0 = 15 - k, x1 = 49 - Math.round(k / 2);
      for (let x = x0; x <= x1; x++) tone(g, x, y, IRON, 0.6 + 0.16 * ((x - x0) / (x1 - x0)) + (blotch(x, y, 3, 5) - 0.5) * 0.25);
      tone(g, x0, y, BRASS, 0.5); tone(g, x0 + 1, y, BRASS, 0.35);
      tone(g, x1, y, BRASS, 0.72); tone(g, x1 - 1, y, BRASS, 0.5);
    }
    strap(g, 15, 13, 35, 2, BRASS, 5); // back edge
    for (const [cx, cy] of [[13, 15], [45, 15]]) strap(g, cx, cy, 4, 3, BRASS); // corner plates

    // --- right side face (lit)
    for (let y = 17; y < 53; y++) for (let x = 47; x < 50; x++) tone(g, x, y, IRON, 0.46 + (x - 47) * 0.06 - (y - 17) * 0.004 + (noise(x, y, 8) - 0.5) * 0.1);

    // --- front face: dark iron, rust and grime, framed in brass
    face(g, 8, 20, 40, 34, IRON, 0.38, { rust: 0.12, grime: 4, seed: 11 });
    strap(g, 8, 19, 40, 3, BRASS, 4);
    strap(g, 8, 22, 3, 31, BRASS, 5);
    strap(g, 45, 22, 3, 31, BRASS, 5);
    g.vline(42, 34, 15, "iron-0"); g.vline(43, 34, 15, "iron-2"); rivet(g, 40, 36, "iron-4", "soot"); rivet(g, 40, 45, "iron-4", "soot");

    // vent panel + latch (upper left)
    strap(g, 11, 22, 8, 12, BRASS);
    g.rect(13, 24, 4, 8, "iron-0");
    g.vline(13, 24, 8, "soot"); g.vline(15, 24, 8, "soot"); g.vline(14, 25, 7, "iron-2"); g.vline(16, 25, 7, "iron-2");
    strap(g, 20, 25, 6, 4, BRASS); g.hline(21, 26, 3, "iron-0");

    // the window: 3 x 2 cells behind a brass frame
    const gl = GLASS[s];
    strap(g, 30, 24, 12, 8, BRASS);
    g.rect(31, 25, 10, 6, "soot");
    for (const cy of [25, 28]) for (const cx of [32, 35, 38]) {
      tone(g, cx, cy, gl, 0.75); tone(g, cx + 1, cy, gl, 1); tone(g, cx, cy + 1, gl, 0.5); tone(g, cx + 1, cy + 1, gl, 0.75);
    }
    if (s !== "idle") { // lamp glow on the iron around the window (light layer)
      const c = s === "working" ? "sun-5" : s === "jammed" ? "jam-2" : "ok-2";
      g.glowDisc(36, 28, 9.5, c, 0.25, [30, 24, 12, 8]);
      g.glowDisc(36, 28, 6.5, c, 0.5, [30, 24, 12, 8]);
    }

    // --- the gear in its brass bezel
    const gx = 27.5, gy = 41.5;
    for (let y = Math.floor(gy - 12); y <= gy + 13; y++) for (let x = Math.floor(gx - 13); x <= gx + 12; x++) if (Math.hypot(x + 1.5 - gx, y - 0.5 - gy) <= 11.6 && g.has(x, y)) g.set(x, y, "iron-0"); // its shadow
    bezel(g, gx, gy, 8, 11.6, BRASS);
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 + 0.3; rivet(g, Math.round(gx + Math.cos(a) * 10 - 0.5), Math.round(gy + Math.sin(a) * 10 - 1)); }
    for (let y = Math.floor(gy - 8); y <= gy + 8; y++) for (let x = Math.floor(gx - 8); x <= gx + 8; x++) {
      const d = Math.hypot(x + 0.5 - gx, y + 0.5 - gy);
      if (d <= 8) g.set(x, y, d > 7.2 ? "soot" : "iron-0");
    }
    gear(g, gx, gy, s === "working" ? (f % 4) / 4 : 0);

    // --- copper tank on the right, its elbow into the top, a brass nub out the side
    cylV(g, 49, 18, 10, 32, COPPER, { amb: 0.12, gloss: 1.3 });
    for (let y = 21; y < 46; y += 3) if (y < 32 || y > 36) for (let x = 49; x < 59; x++) g.set(x, y, x < 52 ? "soot" : x < 56 ? "sun-0" : "copper-1"); // coil ribs
    for (const y of [18, 33, 46]) cylV(g, 48, y, 12, 3, BRASS, { amb: 0.18 });
    cylH(g, 44, 13, 11, 5, COPPER, { amb: 0.18 });
    cylV(g, 50, 13, 6, 6, COPPER, { amb: 0.18 });
    cylH(g, 59, 34, 3, 6, BRASS, { amb: 0.18 });
    cylV(g, 61, 32, 3, 10, BRASS, { amb: 0.18 });

    // --- feet
    for (const fx of [8, 40]) { strap(g, fx, 49, 8, 3, BRASS, 3); cylH(g, fx, 52, 8, 2, BRASS, { amb: 0.15 }); }

    // --- chimney on a riveted collar
    drop(g, 24, 10, 18, 5, "soot");
    cylH(g, 24, 10, 18, 5, BRASS, { amb: 0.16, gloss: 0.6 });
    for (let x = 25; x < 41; x += 3) rivet(g, x, 12);
    cylV(g, 27, 3, 11, 8, BRASS, { amb: 0.12 });
    cylV(g, 26, 0, 13, 3, BRASS, { amb: 0.3, gloss: 0.9 }); // lip
    g.hline(28, 1, 9, "soot"); g.hline(29, 0, 7, "iron-0"); // the dark opening

    // --- the lever: brass rod on a plate, ball knob on top
    strap(g, 17, 13, 6, 2, BRASS);
    g.vline(19, 8, 6, "brass-1"); g.vline(20, 8, 6, "brass-3");
    const plain = s === "idle" || s === "working";
    ball(g, 20, 6.5, 2.8, plain ? IRON : s === "jammed" ? JAM_BALL : OK_BALL, { amb: plain ? 0.25 : 0.35 });

    raw.outline();

    // --- life: smoke leaves the chimney (after the outline: smoke has no hard edge)
    if (s === "working") smoke(g, 31, -1, f / 8);
    if (s === "jammed") smoke(g, 31, -1, f / 8, true);
  },
};

const JAM_BALL = ["jam-0", "jam-0", "jam-1", "jam-2", "jam-2", "white"] as const;
const OK_BALL = ["ok-0", "ok-0", "ok-1", "ok-2", "ok-2", "white"] as const;
