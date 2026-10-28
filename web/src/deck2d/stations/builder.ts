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
  w: 52, h: 66,
  anim: (s) => (s === "working" ? { n: 8, fps: 4 } : s === "jammed" ? { n: 8, fps: 3 } : { n: 1, fps: 0 }),
  draw(raw, s, f) {
    // Traced from Justin's builder art and narrowed to fit its slot on the line (stops are ~50 art px apart):
    // 48 x 54 of machine, plus a 1px outline margin and smoke headroom above the chimney.
    const g = shift(raw, -1, 11);

    g.glow(4, 53, 38, 2, "iron-0", 0.5, true); // contact shadow on the deck, falling down-left

    // --- behind: left riser + intake stub
    cylV(g, 4, 19, 5, 15, IRON, { amb: 0.22 });
    cylH(g, 4, 16, 9, 5, IRON, { amb: 0.22 });
    cylH(g, 3, 33, 6, 8, IRON, { amb: 0.2, gloss: 0.5 });
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
    face(g, 8, 20, 32, 34, IRON, 0.38, { rust: 0.12, grime: 4, seed: 11 });
    strap(g, 8, 19, 32, 3, BRASS, 4);
    strap(g, 8, 22, 3, 31, BRASS, 5);
    strap(g, 37, 22, 3, 31, BRASS, 5);
    g.vline(35, 35, 13, "iron-0"); rivet(g, 34, 37, "iron-4", "soot"); rivet(g, 34, 45, "iron-4", "soot");

    // vent panel + latch (upper left)
    strap(g, 11, 22, 7, 11, BRASS);
    g.rect(13, 24, 3, 7, "iron-0");
    g.vline(13, 24, 7, "soot"); g.vline(15, 24, 7, "soot"); g.vline(14, 25, 6, "iron-2");
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
      g.glowDisc(30.5, 27, 9, c, 0.25, [25, 23, 11, 8]);
      g.glowDisc(30.5, 27, 6.5, c, 0.5, [25, 23, 11, 8]);
    }

    // --- the gear in its brass bezel
    const gx = 21.5, gy = 42.5;
    for (let y = Math.floor(gy - 12); y <= gy + 13; y++) for (let x = Math.floor(gx - 13); x <= gx + 12; x++) if (Math.hypot(x + 1.5 - gx, y - 0.5 - gy) <= 11 && g.has(x, y)) g.set(x, y, "iron-0"); // its shadow
    bezel(g, gx, gy, 7.6, 11, BRASS);
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 + 0.3; rivet(g, Math.round(gx + Math.cos(a) * 9.4 - 0.5), Math.round(gy + Math.sin(a) * 9.4 - 1)); }
    for (let y = Math.floor(gy - 8); y <= gy + 8; y++) for (let x = Math.floor(gx - 8); x <= gx + 8; x++) {
      const d = Math.hypot(x + 0.5 - gx, y + 0.5 - gy);
      if (d <= 7.6) g.set(x, y, d > 6.9 ? "soot" : "iron-0");
    }
    gear(g, gx, gy, s === "working" ? (f % 4) / 4 : 0);

    // --- copper tank on the right, its elbow into the top, a brass cap out the side
    cylV(g, 40, 18, 9, 32, COPPER, { amb: 0.12, gloss: 1.3 });
    for (let y = 21; y < 46; y += 3) if (y < 32 || y > 36) for (let x = 40; x < 49; x++) g.set(x, y, x < 43 ? "soot" : x < 47 ? "sun-0" : "copper-1"); // coil ribs
    for (const y of [18, 33, 46]) cylV(g, 39, y, 11, 3, BRASS, { amb: 0.18 });
    cylH(g, 35, 13, 10, 5, COPPER, { amb: 0.18 });
    cylV(g, 41, 13, 6, 6, COPPER, { amb: 0.18 });
    cylV(g, 49, 34, 2, 6, BRASS, { amb: 0.3 });

    // --- feet
    for (const fx of [8, 32]) { strap(g, fx, 49, 8, 3, BRASS, 3); cylH(g, fx, 52, 8, 2, BRASS, { amb: 0.15 }); }

    // --- chimney on a riveted collar
    drop(g, 17, 10, 18, 5, "soot");
    cylH(g, 17, 10, 18, 5, BRASS, { amb: 0.16, gloss: 0.6 });
    for (let x = 18; x < 34; x += 3) rivet(g, x, 12);
    cylV(g, 20, 3, 11, 8, BRASS, { amb: 0.12 });
    cylV(g, 19, 0, 13, 3, BRASS, { amb: 0.3, gloss: 0.9 }); // lip
    g.hline(21, 1, 9, "soot"); g.hline(22, 0, 7, "iron-0"); // the dark opening

    // --- the lever: brass rod on a plate, ball knob on top
    strap(g, 10, 13, 6, 2, BRASS);
    g.vline(12, 8, 6, "brass-1"); g.vline(13, 8, 6, "brass-3");
    const plain = s === "idle" || s === "working";
    ball(g, 13, 6.5, 2.8, plain ? IRON : s === "jammed" ? JAM_BALL : OK_BALL, { amb: plain ? 0.25 : 0.35 });

    raw.outline();

    // --- life: smoke leaves the chimney (after the outline: smoke has no hard edge)
    if (s === "working") smoke(g, 24, -1, f / 8);
    if (s === "jammed") smoke(g, 24, -1, f / 8, true);
  },
};

const JAM_BALL = ["jam-0", "jam-0", "jam-1", "jam-2", "jam-2", "white"] as const;
const OK_BALL = ["ok-0", "ok-0", "ok-1", "ok-2", "ok-2", "white"] as const;
