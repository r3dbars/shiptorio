import type { StopState } from "../contract";
import type { Color } from "./palette";
import { shift, type Px } from "./px";
import { BRASS, IRON, blotch, cylH, drop, face, noise, rivet, smoke, strap, tone, type Ramp } from "./shade";
import type { StationDef } from "./types";

// Review: a low riveted inspection bench with a crate on hazard stripes, two jointed brass arms holding lamps over
// the crate, and warning bulbs on the front corners. Working: a scan line walks down the crate under the lamps.
// Jammed: red lamps, red bands on the crate, a wisp of smoke. Auto: green. (The lever beside it is the engine's.)

const WOOD: Ramp = ["soot", "plate-0", "plate-1", "plate-2", "plate-3", "plate-4"];
const LIT: Record<StopState, Ramp> = {
  idle: ["soot", "iron-1", "iron-2", "iron-3", "iron-4"],
  working: ["sun-1", "sun-3", "sun-4", "sun-5", "sun-6", "white"],
  jammed: ["jam-0", "jam-1", "jam-1", "jam-2", "jam-2", "haze-3"],
  auto: ["ok-0", "ok-1", "ok-1", "ok-2", "ok-2", "white"],
};
const GLOW: Record<StopState, Color | null> = { idle: null, working: "sun-6", jammed: "jam-2", auto: "ok-2" };

/** A 2px brass rod between two points, lit on its upper-right side. */
function rod(g: Px, x0: number, y0: number, x1: number, y1: number) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  const nx = -(y1 - y0), ny = x1 - x0, nl = Math.hypot(nx, ny) || 1, lit = (nx - ny) / nl > 0; // which side faces the light
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
    tone(g, x, y, BRASS, lit ? 0.75 : 0.4);
    tone(g, x + (Math.abs(y1 - y0) > Math.abs(x1 - x0) ? 1 : 0), y + (Math.abs(y1 - y0) > Math.abs(x1 - x0) ? 0 : 1), BRASS, lit ? 0.4 : 0.7);
  }
}
function joint(g: Px, x: number, y: number) {
  for (let yy = y - 2; yy <= y + 2; yy++) for (let xx = x - 2; xx <= x + 2; xx++) {
    const d = Math.hypot(xx + 0.5 - (x + 0.5), yy + 0.5 - (y + 0.5));
    if (d <= 1.9) tone(g, xx, yy, BRASS, 0.5 + 0.3 * ((xx - x) - (yy - y)) / 1.9);
  }
  g.set(x, y, "brass-0");
}

export const review: StationDef = {
  w: 46, h: 54,
  anim: (s) => (s === "working" ? { n: 4, fps: 3 } : s === "jammed" ? { n: 8, fps: 3 } : { n: 1, fps: 0 }),
  draw(raw, s, f) {
    // traced from Justin's review art at 40 tall, without the belt stubs either side: 44 x 40; +1px outline + headroom
    const g = shift(raw, 1, 13);
    const lit = LIT[s], glow = GLOW[s];

    g.glow(3, 39, 38, 2, "iron-0", 0.5, true); // contact shadow

    // --- the bench: top face, front, posts
    for (let k = 0; k < 3; k++) for (let x = 2 + (3 - k); x <= 42; x++) tone(g, x, 23 + k, IRON, 0.58 + 0.14 * ((x - 2) / 40) + (blotch(x, 23 + k, 3, 2) - 0.5) * 0.2);
    face(g, 2, 26, 40, 11, IRON, 0.32, { seed: 61, grime: 2, rust: 0.04 });
    strap(g, 2, 26, 40, 2, BRASS, 5);
    strap(g, 2, 35, 40, 2, BRASS, 5, false);
    for (const px of [8, 31]) { // the arm posts, standing proud of the bench
      drop(g, px, 21, 5, 16);
      face(g, px, 21, 5, 16, IRON, 0.42, { seed: px, grime: 2 });
      strap(g, px, 21, 5, 2, BRASS); tone(g, px + 4, 21, BRASS, 1);
      for (let y = 23; y < 37; y++) { tone(g, px, y, BRASS, 0.35); tone(g, px + 4, y, BRASS, 0.72); }
      rivet(g, px + 2, 25); rivet(g, px + 2, 32);
    }
    for (const fx of [3, 36]) cylH(g, fx, 37, 6, 2, BRASS, { amb: 0.15 });

    // hazard stripes under the crate
    for (let x = 14; x < 30; x++) for (let y = 23; y < 25; y++) g.set(x, y, ((x + y) >> 1) % 2 ? "soot" : "brass-3");

    // --- the crate
    const cx = 15, cy = 13, cw = 14, ch = 10;
    drop(g, cx, cy, cw, ch, "soot");
    for (let k = 0; k < 2; k++) for (let x = cx + (2 - k); x < cx + cw + (2 - k) - 1; x++) tone(g, x, cy - 2 + k, WOOD, 0.8 - k * 0.1);
    for (let y = cy; y < cy + ch; y++) for (let x = cx; x < cx + cw; x++) tone(g, x, y, WOOD, 0.5 + 0.12 * ((x - cx) / cw) + (noise(x, y, 7) - 0.5) * 0.1 + ((y - cy) % 3 === 2 ? -0.15 : 0));
    for (let y = cy; y < cy + ch; y++) { tone(g, cx, y, WOOD, 0.35); tone(g, cx + cw - 1, y, WOOD, 0.75); }
    for (let i = 0; i < ch - 2; i++) { // the X brace
      const a = cx + 1 + Math.round((i * (cw - 3)) / (ch - 3)), b = cx + cw - 2 - Math.round((i * (cw - 3)) / (ch - 3));
      tone(g, a, cy + 1 + i, WOOD, 0.75); tone(g, b, cy + 1 + i, WOOD, 0.3);
    }
    if (s === "jammed") for (const y of [cy + 2, cy + ch - 3]) for (let x = cx; x < cx + cw; x++) tone(g, x, y, LIT.jammed, x < cx + 3 ? 0.4 : 0.6);
    if (s === "working") for (let x = cx + 1; x < cx + cw - 1; x++) tone(g, x, cy + 1 + f * 2, lit, 0.9);
    if (glow) g.glow(cx, cy - 2, cw + 1, ch + 2, glow, 0.25); // the lamps' light on the crate

    // --- the two arms: post top -> elbow out -> shoulder up -> forearm in to the lamp head
    rod(g, 10, 21, 6, 14); joint(g, 6, 14);
    rod(g, 6, 14, 11, 4); joint(g, 11, 4);
    rod(g, 11, 4, 16, 8);
    rod(g, 33, 21, 37, 14); joint(g, 37, 14);
    rod(g, 37, 14, 32, 4); joint(g, 32, 4);
    rod(g, 32, 4, 27, 8);
    for (const [hx, dir] of [[16, 1], [26, -1]] as const) { // cone shades opening down toward the crate
      for (let j = 0; j < 4; j++) for (let i = -1 - Math.floor(j / 2); i <= 1 + Math.floor(j / 2) + 1; i++) {
        tone(g, hx + i, 7 + j, BRASS, j === 0 ? 0.75 : 0.3 + (dir * i + 2) * 0.1);
      }
      for (let i = -2; i <= 3; i++) tone(g, hx + i, 11, lit, s === "idle" ? 0.3 : 0.65 + (i + 2) * 0.06);
      if (glow) g.glowDisc(hx + 0.5, 11.5, 4, glow, 0.25, [hx - 2, 11, 6, 1]);
    }

    // --- warning bulbs on the front corners
    for (const bx of [3, 39]) {
      cylH(g, bx - 1, 24, 4, 2, BRASS, { amb: 0.2 });
      for (let y = 20; y < 24; y++) for (let x = bx - 1; x < bx + 2; x++) { const d = Math.hypot(x + 0.5 - (bx + 0.5), y + 0.5 - 22); if (d <= 1.8) tone(g, x, y, s === "idle" ? LIT.idle : lit, 0.5 + 0.3 * ((x - bx) - (y - 21.5)) / 1.8); }
      if (glow) g.glowDisc(bx + 0.5, 22, 3.5, glow, 0.25, [bx - 1, 20, 3, 4]);
    }

    raw.outline();
    if (s === "jammed") smoke(g, 22, 9, f / 8, true);
  },
};
