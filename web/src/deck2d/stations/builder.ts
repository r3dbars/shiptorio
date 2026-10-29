import type { StopState } from "../contract";
import type { Color } from "./palette";
import type { Px } from "./px";
import { BRASS, COPPER, IRON, ball, bezel, box3q, bracket, cylH, cylV, drop, rivet, smoke, strap, streak, tone, type Ramp } from "./shade";
import { shift } from "./px";
import type { StationDef } from "./types";

// Builder: a boxy riveted iron machine. Brass-strapped body with a top face, a brass chimney on a riveted collar,
// a ball-knob lever, a 3x3 window, a big steel gear in a brass bezel, a copper tank down the right side, an iron
// intake pipe with a brass flange on the left. Working: the gear turns and a thin wisp leaves the chimney.
// Jammed: red window and knob, gear stuck, grey smoke. Auto: green.

const GLASS: Record<StopState, readonly Color[]> = {
  idle: ["iron-0", "steel-1", "steel-2", "steel-3", "haze-3"],
  working: ["energy-0", "energy-1", "energy-2", "energy-3", "white"],
  jammed: ["jam-0", "jam-1", "jam-2", "jam-2", "haze-3"],
  auto: ["ok-0", "ok-1", "ok-2", "ok-2", "white"],
};

const EMBER: Ramp = ["copper-0", "copper-1", "copper-2", "sun-2", "sun-3", "sun-4", "sun-5"];

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

    // --- the body in 3/4: a lit top face, the right side face receding, the dark front framed in brass
    box3q(g, 8, 20, 27, 34, 8, 0.34, { rust: 0.06, grime: 4, seed: 11 });
    strap(g, 8, 21, 2, 32, BRASS);
    strap(g, 31, 21, 2, 32, BRASS);
    for (const x of [36, 40]) for (let y = 18 - Math.round((x - 34) * 0.75); y < 50 - Math.round((x - 34) * 0.75); y += 6) rivet(g, x, y, "iron-4", "soot"); // rivets down the side
    for (const [x, y, n] of [[12, 21, 4], [27, 21, 3], [9, 33, 6], [38, 20, 5], [33, 30, 4]] as const) streak(g, x, y, n); // rust run off the bands
    bracket(g, 8, 20, 0, 0); bracket(g, 34, 20, 1, 0); bracket(g, 8, 53, 0, 1); bracket(g, 34, 53, 1, 1);

    // vent panel + latch (upper left)
    drop(g, 11, 22, 7, 11);
    g.rect(11, 22, 7, 11, "iron-2"); g.box(11, 22, 7, 11, "brass-1"); g.hline(11, 22, 7, "brass-2"); g.vline(17, 22, 11, "brass-0"); g.set(17, 22, "brass-3");
    g.rect(12, 24, 5, 7, "soot");
    for (let y = 24; y < 31; y++) for (const x of [12, 13, 15, 16]) tone(g, x, y, EMBER, (s === "working" ? 0.55 : 0.35) + (y - 24) * 0.07 + (x === 13 || x === 16 ? 0.12 : 0)); // two slots, hotter low down
    g.vline(14, 24, 7, "iron-1"); g.hline(12, 24, 5, "iron-0");
    g.glowDisc(14.5, 28, 5, "sun-4", 0.25, [12, 24, 5, 7]); // the furnace's light on the panel around it
    

    // the window: 3 x 2 cells behind a brass frame
    const gl = GLASS[s];
    strap(g, 21, 23, 11, 8, BRASS);
    g.rect(22, 24, 9, 6, "soot");
    for (const cy of [24, 27]) for (const cx of [22, 25, 28]) {
      tone(g, cx, cy, gl, 0.75); tone(g, cx + 1, cy, gl, 1); tone(g, cx, cy + 1, gl, 0.5); tone(g, cx + 1, cy + 1, gl, 0.75);
    }
    if (s !== "idle") { // lamp glow on the iron around the window (light layer)
      const c = s === "working" ? "energy-2" : s === "jammed" ? "jam-2" : "ok-2";
      g.glowDisc(26.5, 27, 8.5, c, 0.25, [21, 23, 11, 8]);
      g.glow(21, 22, 11, 1, c, 0.5); g.glow(20, 23, 1, 8, c, 0.25); g.glow(32, 23, 1, 8, c, 0.5); g.glow(21, 31, 11, 1, c, 0.25);
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

    // --- copper tank standing against the side face, its elbow into the top, a brass cap out the side
    for (const [y, h] of [[20, 13], [35, 11], [48, 3]] as const) { // stacked segments, each its own cylinder
      cylV(g, 43, y, 7, h, COPPER, { amb: 0.09, gloss: 1.0 });
      for (let x = 43; x < 50; x++) { tone(g, x, y, COPPER, 0.55 + (x - 43) * 0.05); g.set(x, y + h - 1, x < 46 ? "soot" : "copper-0"); } // lit lip, dark foot
    }
    for (const y of [18, 33, 46]) { cylV(g, 42, y, 9, 2, BRASS, { amb: 0.2, gloss: 0.9 }); g.set(49, y, "brass-5"); } // brass rings, a glint where the sun hits
    for (let x = 43; x < 50; x++) g.set(x, 20, x < 46 ? "soot" : "brass-0"); // shadow under the top ring
    cylH(g, 37, 12, 8, 4, COPPER, { amb: 0.18 });
    cylV(g, 44, 12, 5, 6, COPPER, { amb: 0.18 });

    // --- feet
    for (const fx of [8, 27]) { strap(g, fx, 49, 8, 3, BRASS, 3); cylH(g, fx, 52, 8, 2, BRASS, { amb: 0.15 }); }

    // --- chimney on a riveted collar, standing in the middle of the top face
    drop(g, 21, 15, 12, 3, "soot");
    cylH(g, 21, 15, 12, 3, BRASS, { amb: 0.16, gloss: 0.6 });
    for (let x = 22; x < 33; x += 3) rivet(g, x, 16);
    cylV(g, 23, 7, 8, 9, IRON, { amb: 0.1, gloss: 0.8 }); // iron stack
    cylV(g, 23, 11, 8, 1, BRASS, { amb: 0.3 }); // a brass band round it
    cylV(g, 22, 4, 10, 3, BRASS, { amb: 0.3, gloss: 1.1 }); // lip
    g.hline(24, 4, 6, "soot"); g.hline(25, 5, 4, "iron-0"); g.set(30, 4, "brass-5"); // the dark opening, a glint on the rim

    // --- the lever on the top face: brass rod on a plate, ball knob on top
    strap(g, 11, 17, 6, 2, BRASS);
    g.vline(13, 11, 6, "brass-1"); g.vline(14, 11, 6, "brass-3");
    const plain = s === "idle" || s === "working";
    ball(g, 14, 9.5, 2.8, plain ? IRON : s === "jammed" ? JAM_BALL : OK_BALL, { amb: plain ? 0.25 : 0.35 });

    raw.outline();

    // --- life: smoke leaves the chimney (after the outline: smoke has no hard edge)
    if (s === "working") smoke(g, 26, 2, f / 8);
    if (s === "jammed") smoke(g, 26, 2, f / 8, true);
  },
};

const JAM_BALL = ["jam-0", "jam-0", "jam-1", "jam-2", "jam-2", "white"] as const;
const OK_BALL = ["ok-0", "ok-0", "ok-1", "ok-2", "ok-2", "white"] as const;
