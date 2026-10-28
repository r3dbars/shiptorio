import type { StopState } from "../contract";
import type { Color } from "./palette";
import { shift, type Px } from "./px";
import { BRASS, COPPER, IRON, ball, blotch, box3q, bracket, cylH, cylV, drop, face, noise, rivet, smoke, strap, streak, tone, type Ramp } from "./shade";
import type { StationDef } from "./types";

// Gate: a tall riveted iron cabinet the line runs through, a brass lantern on top, a slot window down its face and
// a chevron wing either side. Working: a bright notch slides down the slot. Jammed: red, smoke from the lantern.
// Auto: the slot splits open, green at both edges.

const LIT: Record<StopState, Ramp> = {
  idle: ["soot", "iron-1", "iron-2", "iron-3", "iron-4", "haze-2"],
  working: ["sun-0", "sun-1", "sun-3", "sun-4", "sun-5", "sun-6"],
  jammed: ["jam-0", "jam-0", "jam-1", "jam-1", "jam-2", "haze-3"],
  auto: ["ok-0", "ok-0", "ok-1", "ok-1", "ok-2", "white"],
};
const GLOW: Record<StopState, Color | null> = { idle: null, working: "sun-5", jammed: "jam-2", auto: "ok-2" };

function wing(g: Px, x: number, w: number) {
  const y = 26, h = 14;
  drop(g, x, y, w, h);
  for (let k = 0; k < 2; k++) for (let i = 0; i < w; i++) tone(g, x + i + (2 - k), y - 2 + k, IRON, 0.58 + 0.12 * (i / w)); // top face
  face(g, x, y, w, h, IRON, 0.3, { seed: x + 3, grime: 2 });
  strap(g, x, y, w, 2, BRASS, 4); strap(g, x, y + h - 2, w, 2, BRASS, 4, false);
  strap(g, x, y + 2, 2, h - 4, BRASS, 0, false); strap(g, x + w - 2, y + 2, 2, h - 4, BRASS, 0, false);
  bracket(g, x, y, 0, 0, 3); bracket(g, x + w - 1, y, 1, 0, 3); bracket(g, x, y + h - 1, 0, 1, 3); bracket(g, x + w - 1, y + h - 1, 1, 1, 3);
  // the chevron, painted brass with a dark edge under it
  const cx = x + Math.floor(w / 2) - 2, cy = y + 7;
  for (let i = 0; i < 4; i++) for (const sgn of [-1, 1]) {
    const yy = cy + sgn * (3 - i);
    tone(g, cx + i, yy, BRASS, 0.85); tone(g, cx + i + 1, yy, BRASS, 0.65); g.set(cx + i - 1, yy + 1, "iron-0");
  }
}

export const gate: StationDef = {
  w: 58, h: 62,
  anim: (s) => (s === "working" ? { n: 4, fps: 3 } : s === "jammed" ? { n: 8, fps: 3 } : { n: 1, fps: 0 }),
  draw(raw, s, f) {
    // traced from Justin's gate art at 48 tall, 56 wide (wings and all); +1px outline margin, smoke headroom
    const g = shift(raw, 1, 13);
    const lit = LIT[s], glow = GLOW[s];

    g.glow(3, 47, 50, 2, "iron-0", 0.5, true); // contact shadow

    wing(g, 0, 18);
    wing(g, 39, 17);

    // copper pipe rising from the left wing and bending into the cabinet
    cylV(g, 14, 16, 4, 10, COPPER, { amb: 0.1, gloss: 0.9 });
    for (let y = 11; y < 16; y++) for (let x = 14; x < 19; x++) { // the elbow: a quarter ring of tube turning into the cabinet
      const dx = x + 0.5 - 19, dy = y + 0.5 - 16, d = Math.hypot(dx, dy);
      if (d > 5 || d < 0.6) continue;
      const t = (d - 0.6) / 4.4, up = -dy / (d || 1);
      tone(g, x, y, COPPER, 0.15 + 0.45 * Math.sin(t * Math.PI) + 0.25 * up * t + (t > 0.55 && t < 0.8 && up > 0.5 ? 0.25 : 0));
    }
    cylH(g, 18, 11, 2, 5, COPPER, { amb: 0.1, gloss: 0.9 });
    cylV(g, 13, 20, 6, 2, BRASS, { amb: 0.25, gloss: 0.9 }); g.set(18, 20, "brass-5"); // a brass collar on the pipe

    // --- cabinet: top face, lit side with a little box, front
    box3q(g, 19, 14, 20, 30, 4, 0.34, { rust: 0.05, grime: 4, seed: 51 });
    drop(g, 41, 16, 6, 9);
    face(g, 41, 16, 6, 9, IRON, 0.45, { seed: 5, grime: 1 }); strap(g, 41, 16, 6, 2, BRASS); g.vline(46, 18, 7, "brass-2");
    for (const x of [42, 44]) { g.vline(x, 19, 4, "soot"); g.vline(x + 1, 19, 4, "iron-3"); } // a little grille
    strap(g, 19, 16, 3, 27, BRASS, 5);
    strap(g, 36, 16, 3, 27, BRASS, 5);
    strap(g, 19, 42, 20, 2, BRASS, 4, false);
    bracket(g, 19, 14, 0, 0); bracket(g, 38, 14, 1, 0); bracket(g, 19, 43, 0, 1); bracket(g, 38, 43, 1, 1);
    for (const [x, y, n] of [[22, 16, 4], [35, 16, 5], [23, 41, 2]] as const) streak(g, x, y, n);

    // the slot window
    drop(g, 24, 18, 10, 23);
    g.rect(24, 18, 10, 23, "iron-1"); strap(g, 24, 18, 10, 2, BRASS, 0, false); g.vline(33, 18, 23, "brass-2"); g.vline(24, 18, 23, "brass-0"); g.hline(24, 40, 10, "brass-0");
    g.rect(26, 20, 6, 19, "soot");
    for (const [x, y] of [[26, 20], [31, 20], [26, 38], [31, 38]]) g.set(x, y, "iron-1"); // rounded ends
    if (s === "idle") {
      for (const y0 of [21, 27, 33]) for (let y = y0; y < y0 + 5; y++) for (let x = 27; x < 31; x++) tone(g, x, y, LIT.idle, 0.55 + (x - 27) * 0.1 - (y - y0) * 0.04);
    } else if (s === "auto") { // split open
      for (let y = 20; y < 39; y++) { tone(g, 26, y, lit, 0.7); tone(g, 27, y, lit, 1); tone(g, 30, y, lit, 0.7); tone(g, 31, y, lit, 1); g.set(28, y, "iron-0"); g.set(29, y, "iron-0"); }
    } else {
      for (let y = 21; y < 38; y++) for (let x = 27; x < 31; x++) tone(g, x, y, lit, 0.55 + (x - 27) * 0.1);
      if (s === "working") for (let y = 21 + f * 4; y < 25 + f * 4; y++) for (let x = 27; x < 31; x++) tone(g, x, y, lit, 0.85 + (x - 27) * 0.05);
      else for (let y = 21; y < 38; y++) tone(g, 29, y, lit, 1);
    }
    if (glow) g.glowDisc(29, 29.5, 8, glow, 0.25, [26, 20, 6, 19]);

    // --- feet
    for (const fx of [19, 33]) { strap(g, fx, 44, 6, 2, BRASS, 3); cylH(g, fx, 46, 6, 2, BRASS, { amb: 0.15 }); }

    // --- the lantern on top: brass base, glass cage, cap and finial
    cylH(g, 25, 9, 9, 3, BRASS, { amb: 0.16, gloss: 0.7 });
    for (const x of [26, 29, 32]) rivet(g, x, 10);
    cylV(g, 26, 3, 7, 6, BRASS, { amb: 0.15, gloss: 0.7 });
    for (let y = 4; y < 9; y++) for (let x = 27; x < 32; x++) tone(g, x, y, lit, (s === "idle" ? 0.45 : 0.65) + (x - 27) * 0.08 - Math.abs(y - 6) * 0.05);
    g.vline(29, 4, 5, "brass-1"); // cage bar
    cylV(g, 25, 2, 9, 1, BRASS, { amb: 0.3, gloss: 0.9 });
    cylV(g, 28, 1, 3, 1, BRASS, { amb: 0.3 });
    ball(g, 29.5, -0.5, 1.8, IRON, { amb: 0.2 });
    if (glow) g.glowDisc(29.5, 6.5, 5, glow, 0.25, [27, 4, 5, 5]);

    raw.outline();
    if (s === "jammed") smoke(g, 30, -2, f / 8, true);
  },
};
