import type { StopState } from "../contract";
import type { Color } from "./palette";
import { shift, type Px } from "./px";
import { BRASS, COPPER, IRON, bezel, blotch, cylH, cylV, drop, face, noise, rivet, smoke, strap, tone } from "./shade";
import type { StationDef } from "./types";

// Repo: a tall riveted iron safe. A dark chimney with a brass seam, copper pipes looping over both shoulders (the
// right one drops into an outlet box), a brass tank and gear on the left, a three-bar readout with a lamp, and a
// brass-framed door with the branch mark. Working: one readout bar brightens at a time. Jammed: red, with smoke.

const LIT: Record<StopState, readonly Color[]> = {
  idle: ["iron-0", "iron-2", "iron-3", "iron-4", "haze-2"],
  working: ["sun-1", "sun-3", "sun-4", "sun-5", "sun-6"],
  jammed: ["jam-0", "jam-1", "jam-1", "jam-2", "haze-3"],
  auto: ["ok-0", "ok-1", "ok-1", "ok-2", "white"],
};
const GLOW: Record<StopState, Color | null> = { idle: null, working: "sun-5", jammed: "jam-2", auto: "ok-2" };

/** A pipe bend seen from the front: a quarter ring of tube, banded across its thickness like a straight run. */
function bend(g: Px, cx: number, cy: number, r0: number, r1: number, quad: "tl" | "tr") {
  for (let y = Math.floor(cy - r1); y <= cy; y++) for (let x = Math.floor(cx - r1); x <= Math.ceil(cx + r1); x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
    if (d < r0 || d > r1 || dy > 0) continue;
    if (quad === "tl" ? dx > 0 : dx < 0) continue;
    const t = ((d - r0) / (r1 - r0)) * 2 - 1; // across the tube: -1 inner .. 1 outer
    const up = -dy / (d || 1); // how much this bit of tube faces up (toward the light)
    tone(g, x, y, COPPER, 0.2 + 0.4 * (1 - t * t) + 0.25 * up * (t > 0 ? 1 : 0.4) + (t > 0.2 && t < 0.7 && up > 0.6 ? 0.25 : 0));
  }
}

export const repo: StationDef = {
  w: 52, h: 66,
  anim: (s) => (s === "working" ? { n: 8, fps: 4 } : s === "jammed" ? { n: 8, fps: 3 } : { n: 1, fps: 0 }),
  draw(raw, s, f) {
    // traced from Justin's repo art at 54 tall, pulled in to ~50 wide; +1px outline margin, smoke headroom on top
    const g = shift(raw, 1, 11);
    const lit = LIT[s], glow = GLOW[s];

    g.glow(4, 52, 40, 2, "iron-0", 0.5, true); // contact shadow

    // --- copper pipes behind: left shoulder loop into the chimney, right run over and down into the outlet box
    bend(g, 12, 15, 4, 8.5, "tl");
    cylV(g, 4, 15, 4, 6, COPPER, { amb: 0.14 });
    cylH(g, 12, 7, 11, 4, COPPER, { amb: 0.16, gloss: 0.8 });
    cylH(g, 31, 7, 9, 4, COPPER, { amb: 0.16, gloss: 0.8 });
    bend(g, 39, 15, 4, 8.5, "tr");
    cylV(g, 43, 15, 4, 14, COPPER, { amb: 0.14, gloss: 1 });
    for (const y of [12, 22]) cylV(g, 42, y, 6, 2, BRASS, { amb: 0.2 });

    // --- outlet box (right)
    drop(g, 40, 29, 10, 15);
    face(g, 40, 29, 10, 15, IRON, 0.36, { seed: 4, grime: 2 });
    strap(g, 40, 29, 10, 2, BRASS); strap(g, 40, 31, 2, 13, BRASS); strap(g, 48, 31, 2, 13, BRASS); strap(g, 40, 42, 10, 2, BRASS);
    g.rect(43, 33, 5, 8, "soot"); g.vline(47, 34, 7, "iron-1"); g.hline(43, 40, 5, "iron-1");

    // --- brass tank + gear (left)
    cylV(g, 1, 20, 8, 17, BRASS, { amb: 0.12, gloss: 0.9 });
    for (let y = 22; y < 35; y++) for (let x = 1; x < 3; x++) tone(g, x, y, IRON, 0.25 + (x - 1) * 0.08); // dark seam where it turns away
    for (const y of [20, 28, 35]) cylV(g, 0, y, 10, 2, BRASS, { amb: 0.22 });
    // --- body: top face, right side, front
    for (let k = 0; k < 3; k++) for (let x = 12 + (3 - k); x <= 40; x++) tone(g, x, 13 + k, IRON, 0.55 + 0.15 * ((x - 12) / 28) + (blotch(x, 13 + k, 3, 2) - 0.5) * 0.2);
    for (let y = 15; y < 50; y++) for (let x = 39; x < 41; x++) tone(g, x, y, IRON, 0.5 + (x - 39) * 0.08 + (noise(x, y, 6) - 0.5) * 0.08);
    face(g, 11, 16, 28, 34, IRON, 0.34, { rust: 0.05, grime: 4, seed: 21 });
    strap(g, 11, 16, 28, 2, BRASS, 4);
    strap(g, 11, 18, 2, 31, BRASS, 5);
    strap(g, 37, 18, 2, 31, BRASS, 5);
    tone(g, 38, 16, BRASS, 1); tone(g, 38, 17, BRASS, 0.85); // corner catching the sun

    // readout: three bars + a lamp in a dark slot
    drop(g, 15, 20, 21, 7);
    g.rect(15, 20, 21, 7, "iron-1"); g.box(15, 20, 21, 7, "brass-1"); g.hline(15, 20, 21, "brass-2"); g.vline(35, 20, 7, "brass-0");
    g.rect(17, 21, 17, 5, "soot");
    for (let i = 0; i < 3; i++) {
      const x = 19 + i * 3, hot = s === "working" ? i === f % 4 : s !== "idle";
      tone(g, x, 22, lit, hot ? 1 : 0.72); tone(g, x, 23, lit, hot ? 0.85 : 0.6); tone(g, x, 24, lit, hot ? 0.7 : 0.45);
      tone(g, x + 1, 22, lit, hot ? 0.85 : 0.6); tone(g, x + 1, 23, lit, 0.5); tone(g, x + 1, 24, lit, 0.35);
    }
    const lamp = s === "idle" ? (["iron-0", "iron-1", "iron-2", "iron-3", "iron-4"] as const) : lit;
    for (let y = 21; y <= 25; y++) for (let x = 29; x <= 33; x++) {
      const dx = x + 0.5 - 31.5, dy = y + 0.5 - 23.5, d = Math.hypot(dx, dy);
      if (d <= 2.3) tone(g, x, y, lamp, 0.55 + 0.3 * (dx - dy) / 2.3 - d * 0.05);
    }
    g.set(32, 22, s === "idle" ? "iron-4" : "white");
    if (glow) { g.glowDisc(26, 23.5, 9, glow, 0.25, [17, 21, 17, 5]); g.glow(16, 20, 19, 1, glow, 0.25); }

    // the door with the branch mark
    drop(g, 15, 28, 21, 20);
    g.rect(15, 28, 21, 20, "iron-1");
    for (let y = 30; y < 46; y++) for (let x = 17; x < 34; x++) tone(g, x, y, IRON, 0.3 + 0.08 * ((x - 17) / 17) + (blotch(x, y, 4, 9) - 0.5) * 0.2);
    strap(g, 15, 28, 21, 2, BRASS); strap(g, 15, 46, 21, 2, BRASS, 0, false);
    strap(g, 15, 30, 2, 16, BRASS, 0, false); strap(g, 34, 30, 2, 16, BRASS, 0, false);
    for (const [x, y] of [[16, 29], [34, 29], [16, 46], [34, 46]]) rivet(g, x, y);
    // the mark: two dots joined by a stem, a third dot branching off to the right
    const mark = (x: number, y: number, v: number) => tone(g, x, y, BRASS, v);
    for (let y = 33; y <= 42; y++) { mark(21, y, 0.55); mark(22, y, 0.75); g.set(20, y + 1, "soot"); }
    for (const [cx, cy] of [[22, 32], [22, 43], [29, 35]]) for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 3; x <= cx + 3; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d <= 2.1) mark(x, y, 0.55 + 0.25 * ((x + 0.5 - cx) - (y + 0.5 - cy)) / 2.1);
      else if (d <= 2.9 && x < cx && y >= cy) g.set(x, y, "soot");
    }
    for (let i = 0; i < 5; i++) { mark(27 - i, 37 + i, 0.75); mark(26 - i, 37 + i, 0.5); g.set(26 - i, 38 + i, "soot"); }

    // --- feet
    for (const [fx, w] of [[3, 8], [36, 8]]) { strap(g, fx, 48, w, 3, BRASS, 3); cylH(g, fx, 51, w, 2, BRASS, { amb: 0.15 }); }

    for (let y = 35; y <= 47; y++) for (let x = 2; x <= 14; x++) { // a brass cog low on the left
      const dx = x + 0.5 - 8, dy = y + 0.5 - 41, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const R = Math.cos(a * 7) > 0.1 ? 5.6 : 4.3;
      if (d > R) continue;
      const k = (dx - dy) / (d || 1);
      g.set(x, y, d < 1.4 ? "soot" : d < 2.4 ? "brass-1" : d > R - 1 ? (k > 0.5 ? "brass-4" : k < -0.5 ? "brass-0" : "brass-2") : k > 0.3 ? "brass-3" : "brass-2");
    }

    // --- chimney: dark iron stack with a brass seam, brass collar and lip
    drop(g, 20, 11, 13, 3, "soot");
    cylH(g, 20, 11, 13, 3, BRASS, { amb: 0.16, gloss: 0.7 });
    for (let x = 21; x < 32; x += 3) rivet(g, x, 12);
    cylV(g, 22, 2, 9, 9, IRON, { amb: 0.1, gloss: 0.7 });
    g.vline(28, 2, 9, "brass-2"); g.vline(29, 2, 9, "brass-3");
    cylV(g, 21, 0, 11, 2, BRASS, { amb: 0.3, gloss: 0.9 });
    g.hline(23, 0, 7, "soot");

    raw.outline();
    if (s === "jammed") smoke(g, 25, -2, f / 8, true);
  },
};
