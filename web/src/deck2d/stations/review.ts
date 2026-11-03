import type { StopState } from "../contract";
import type { Color } from "./palette";
import { shift, type Px } from "./px";
import { BAND, BRASS, IRON, blotch, bracket, cylH, drop, face, noise, rivet, side, smoke, strap, streak, tone, type Ramp } from "./shade";
import type { StationDef } from "./types";

// Review: a low riveted inspection bench with a crate on hazard stripes, two jointed brass arms holding lamps over
// the crate, and warning bulbs on the front corners. Working: a scan line walks down the crate under the lamps.
// Jammed: red lamps, red bands on the crate, a wisp of smoke. Auto: green. (The lever beside it is the engine's.)

const WOOD: Ramp = ["soot", "plate-0", "plate-1", "plate-2", "plate-3", "plate-4"];
const LIT: Record<StopState, Ramp> = {
  idle: ["soot", "iron-1", "iron-2", "iron-3", "iron-4"],
  working: ["energy-0", "energy-0", "energy-1", "energy-2", "energy-3", "white"],
  jammed: ["jam-0", "jam-1", "jam-1", "jam-2", "jam-2", "haze-3"],
  auto: ["ok-0", "ok-1", "ok-1", "ok-2", "ok-2", "white"],
};
const GLOW: Record<StopState, Color | null> = { idle: null, working: "energy-2", jammed: "jam-2", auto: "ok-2" };

/** A round brass rod (3px thick) between two points, banded across its thickness, lit on the upper-right side. */
function rod(g: Px, x0: number, y0: number, x1: number, y1: number) {
  const len = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / len, uy = (y1 - y0) / len, nx = -uy, ny = ux;
  const litSide = nx - ny > 0 ? 1 : -1; // the normal that faces up-right
  for (let y = Math.floor(Math.min(y0, y1) - 2); y <= Math.max(y0, y1) + 2; y++) for (let x = Math.floor(Math.min(x0, x1) - 2); x <= Math.max(x0, x1) + 2; x++) {
    const px = x + 0.5 - x0, py = y + 0.5 - y0, along = px * ux + py * uy, across = (px * nx + py * ny) * litSide;
    if (along < 0 || along > len || Math.abs(across) > 1.6) continue;
    tone(g, x, y, BRASS, 0.34 + 0.3 * (across / 1.6) + (across > 0.3 && across < 1 ? 0.15 : 0));
  }
}
function joint(g: Px, x: number, y: number) {
  for (let yy = y - 4; yy <= y + 4; yy++) for (let xx = x - 4; xx <= x + 4; xx++) {
    const d = Math.hypot(xx - x, yy - y);
    if (d <= 3.2) { if (d > 1.6) tone(g, xx, yy, BRASS, 0.4 + 0.35 * ((xx - x) - (yy - y)) / 3.2); else g.set(xx, yy, "iron-0"); } // brass ring, dark hub
  }
  g.set(x, y, "brass-3"); g.set(x + 1, y - 2, "brass-5"); // the pin, and a glint on the ring
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
    side(g, 39, 26, 11, 4, IRON, 0.42, 61); // the bench's right end, seen in 3/4
    face(g, 2, 26, 37, 11, IRON, 0.32, { seed: 61, grime: 2, rust: 0.04 });
    strap(g, 2, 26, 37, 2, BRASS, 5);
    strap(g, 2, 35, 37, 2, BRASS, 5, false);
    for (const px of [8, 31]) { // the arm posts, standing proud of the bench
      drop(g, px, 21, 5, 16);
      face(g, px, 21, 5, 16, IRON, 0.42, { seed: px, grime: 2 });
      strap(g, px, 21, 5, 2, BRASS); tone(g, px + 4, 21, BRASS, 1);
      for (let y = 23; y < 37; y++) { tone(g, px, y, BRASS, 0.35); tone(g, px + 4, y, BRASS, 0.72); }
      rivet(g, px + 2, 25); rivet(g, px + 2, 32);
    }
    for (const fx of [3, 32]) cylH(g, fx, 37, 6, 2, BRASS, { amb: 0.15 });
    cylH(g, 39, 34, 4, 2, BRASS, { amb: 0.12 }); // the back foot
    bracket(g, 2, 26, 0, 0, 3); bracket(g, 38, 26, 1, 0, 3); bracket(g, 2, 36, 0, 1, 3); bracket(g, 38, 36, 1, 1, 3);
    for (const [x, y, n] of [[6, 28, 4], [20, 28, 3], [27, 28, 5], [40, 26, 4]] as const) streak(g, x, y, n);

    // hazard stripes under the crate
    for (let x = 13; x < 31; x++) for (let y = 23; y < 26; y++) g.set(x, y, ((x + y) >> 1) % 2 ? "soot" : y === 23 ? "brass-4" : "brass-3"); // a hazard-striped pad under the crate

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
    for (const [x, y] of [[cx, cy], [cx + cw - 1, cy], [cx, cy + ch - 1], [cx + cw - 1, cy + ch - 1]]) g.set(x, y, x > cx ? "brass-3" : "brass-1"); // brass corner caps
    if (s === "jammed") for (const y of [cy + 2, cy + ch - 3]) for (let x = cx; x < cx + cw; x++) tone(g, x, y, LIT.jammed, x < cx + 3 ? 0.4 : 0.6);
    if (s === "working") for (let x = cx + 1; x < cx + cw - 1; x++) tone(g, x, cy + 1 + f * 2, lit, 0.9);
    if (glow) g.glow(cx, cy - 2, cw + 1, 6, glow, 0.25); // the lamps' light on the crate top

    // --- the two arms: post top -> elbow out -> shoulder up -> forearm in to the lamp head
    rod(g, 10.5, 21, 6, 13); rod(g, 6, 13, 11, 2); rod(g, 11, 2, 16.5, 3.5);
    joint(g, 10, 21); joint(g, 6, 13); joint(g, 11, 2);
    rod(g, 33.5, 21, 38, 13); rod(g, 38, 13, 33, 2); rod(g, 33, 2, 27.5, 3.5);
    joint(g, 33, 21); joint(g, 38, 13); joint(g, 33, 2);
    for (const hx of [17, 27]) { // bell shades opening down toward the crate
      cylH(g, hx - 1, 2, 3, 1, BRASS, { amb: 0.3 }); // the socket the arm holds
      for (let j = 0; j < 6; j++) {
        const half = 0.8 + j * 0.55;
        for (let x = Math.floor(hx - half); x <= Math.ceil(hx + half); x++) {
          const u = (x + 0.5 - hx) / (half + 0.5);
          if (j === 5) tone(g, x, 3 + j, BRASS, 0.45 + 0.4 * (u + 1) / 2 + (u > 0.4 && u < 0.7 ? 0.2 : 0)); // a bright rolled brass lip
          else tone(g, x, 3 + j, IRON, 0.25 + 0.5 * (u + 1) / 2 + (u > 0.25 && u < 0.6 ? 0.3 : 0) - j * 0.02); // dark iron bell, a sun stripe on its right
        }
      }
      for (let x = hx - 3; x <= hx + 3; x++) tone(g, x, 9, lit, s === "idle" ? 0.3 : 0.6 + (x - hx + 3) * 0.06);
      if (glow) g.glowDisc(hx + 0.5, 10, 4.5, glow, 0.25, [hx - 3, 9, 7, 1]);
    }

    // --- warning bulbs on the front corners
    for (const bx of [3, 35]) { // the right bulb stays clear of the engine's lever at +18
      cylH(g, bx - 1, 24, 4, 2, BRASS, { amb: 0.2 });
      for (let y = 20; y < 24; y++) for (let x = bx - 1; x < bx + 2; x++) { const d = Math.hypot(x + 0.5 - (bx + 0.5), y + 0.5 - 22); if (d <= 1.8) tone(g, x, y, s === "idle" ? LIT.idle : lit, 0.5 + 0.3 * ((x - bx) - (y - 21.5)) / 1.8); }
      if (glow) g.glowDisc(bx + 0.5, 22, 3.5, glow, 0.25, [bx - 1, 20, 3, 4]);
    }

    raw.outline();
    if (s === "jammed") smoke(g, 22, 9, f / 8, true);
  },
};
