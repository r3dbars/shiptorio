import type { StopState } from "../contract";
import type { Color } from "./palette";
import { shift } from "./px";
import { BRASS, COPPER, IRON, STEEL, ball, bezel, blotch, box3q, bracket, cylH, cylV, drop, face, noise, rivet, smoke, strap, streak, tone, type Ramp } from "./shade";
import type { StationDef } from "./types";

// Checks: a domed iron cabinet with one big glass porthole in a riveted brass bezel, a dark tank with brass bands
// on the left, a lantern either side of the glass, a little indicator panel on the right and three bulbs under the
// glass. Working: the bulbs count across, one lit at a time. Jammed: red lamps and a wisp of smoke.

const LIT: Record<StopState, Ramp> = {
  idle: ["iron-0", "iron-1", "iron-2", "iron-3", "iron-4"],
  working: ["sun-1", "sun-3", "sun-4", "sun-5", "sun-6", "white"],
  jammed: ["jam-0", "jam-1", "jam-1", "jam-2", "jam-2", "haze-3"],
  auto: ["ok-0", "ok-1", "ok-1", "ok-2", "ok-2", "white"],
};
const GLOW: Record<StopState, Color | null> = { idle: null, working: "sun-5", jammed: "jam-2", auto: "ok-2" };
const GLASS: Ramp = ["soot", "steel-0", "steel-1", "steel-2", "energy-0", "energy-1", "energy-3", "white"];

export const checks: StationDef = {
  w: 50, h: 64,
  anim: (s) => (s === "working" ? { n: 6, fps: 3 } : s === "jammed" ? { n: 8, fps: 3 } : { n: 1, fps: 0 }),
  draw(raw, s, f) {
    // traced from Justin's checks art at ~50 tall, 48 wide; +1px outline margin, smoke headroom on top
    const g = shift(raw, 1, 13);
    const lit = LIT[s], glow = GLOW[s];

    g.glow(4, 49, 40, 2, "iron-0", 0.5, true); // contact shadow

    // --- left tank, dark iron with brass bands
    cylV(g, 1, 15, 9, 28, IRON, { amb: 0.12, gloss: 0.7 });
    for (let y = 10; y < 15; y++) for (let x = 1; x < 10; x++) { // its rounded top
      const dx = (x + 0.5 - 5.5) / 4.5, dy = (y + 0.5 - 15) / 5, d = dx * dx + dy * dy;
      if (d <= 1) tone(g, x, y, IRON, 0.15 + 0.5 * Math.max(0, dx * 0.6 - dy * 0.5 + Math.sqrt(1 - d) * 0.4));
    }
    for (const y of [15, 25, 34, 41]) cylV(g, 0, y, 11, 2, BRASS, { amb: 0.2 });
    cylV(g, 4, 8, 3, 3, BRASS, { amb: 0.25, gloss: 0.9 }); // valve on top
    cylH(g, 7, 8, 6, 3, COPPER, { amb: 0.1, gloss: 0.9 }); // a copper pipe from the valve into the dome

    // --- right side face and the indicator panel
    box3q(g, 11, 17, 26, 29, 5, 0.34, { rust: 0.05, grime: 4, seed: 41 }); // the body in 3/4, side face receding right
    cylH(g, 38, 21, 7, 3, COPPER, { amb: 0.1, gloss: 0.9 }); cylV(g, 43, 21, 3, 10, COPPER, { amb: 0.1, gloss: 1 }); // pipe down into the panel
    cylV(g, 42, 26, 5, 1, BRASS, { amb: 0.3 }); g.set(46, 26, "brass-5");
    drop(g, 40, 31, 7, 11);
    face(g, 40, 31, 7, 11, IRON, 0.36, { seed: 31, grime: 1 });
    strap(g, 40, 31, 7, 2, BRASS); strap(g, 40, 40, 7, 2, BRASS, 0, false); strap(g, 45, 33, 2, 7, BRASS, 0, false);
    for (const y of [34, 36, 38]) for (const x of [41, 43]) { tone(g, x, y, lit, s === "idle" ? 0.4 : 0.7); tone(g, x + 1, y, lit, s === "idle" ? 0.55 : 0.9); }

    // --- the body
    strap(g, 11, 19, 2, 26, BRASS, 5);
    strap(g, 34, 19, 2, 26, BRASS, 5);
    bracket(g, 11, 44, 0, 1); bracket(g, 36, 44, 1, 1);
    for (const [x, y, n] of [[12, 21, 4], [38, 24, 5], [15, 19, 3], [33, 19, 4]] as const) streak(g, x, y, n);

    // dome cap over the top, brass rim, iron crown, sitting on the body
    for (let y = 7; y < 18; y++) for (let x = 12; x < 40; x++) {
      const dx = (x + 0.5 - 25.5) / 14, dy = (y + 0.5 - 18) / 11, d = dx * dx + dy * dy;
      if (d > 1) continue;
      const nz = Math.sqrt(1 - d), band = y > 14 ? -0.18 : 0;
      tone(g, x, y, d > 0.8 ? BRASS : IRON, (d > 0.8 ? 0.2 : 0.3) + 0.35 * (dx * 0.6 - dy * 0.5 + nz * 0.4) + band + (blotch(x, y, 3, 12) - 0.5) * 0.15);
    }
    strap(g, 13, 15, 25, 2, BRASS, 4, false);
    // knob post + ball
    drop(g, 19, 6, 13, 2); cylH(g, 19, 6, 13, 2, BRASS, { amb: 0.2, gloss: 0.8 }); // a stepped brass crown
    cylV(g, 21, 3, 9, 3, IRON, { amb: 0.15, gloss: 0.8 });
    cylH(g, 22, 1, 7, 2, BRASS, { amb: 0.3, gloss: 0.9 }); g.set(30, 6, "brass-5");
    ball(g, 25.5, -1, 2.4, s === "idle" ? STEEL : lit, { amb: s === "idle" ? 0.3 : 0.4 });
    if (glow) g.glowDisc(25.5, -1, 4, glow, 0.25);

    // the porthole: brass bezel, riveted, convex glass with a hot glint
    const px = 24.5, py = 29;
    for (let y = py - 11; y <= py + 12; y++) for (let x = px - 12; x <= px + 11; x++) if (Math.hypot(x + 1.5 - px, y - 0.5 - py) <= 10.2 && g.has(x, y)) g.set(x, y, "iron-0");
    bezel(g, px, py, 7.5, 10.2, BRASS);
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 + 0.2; rivet(g, Math.round(px + Math.cos(a) * 8.9 - 0.5), Math.round(py + Math.sin(a) * 8.9 - 1)); }
    for (let y = Math.floor(py - 8); y <= py + 8; y++) for (let x = Math.floor(px - 8); x <= px + 8; x++) {
      const dx = (x + 0.5 - px) / 7.5, dy = (y + 0.5 - py) / 7.5, d = dx * dx + dy * dy;
      if (d > 1) continue;
      if (d > 0.82) { g.set(x, y, dx - dy > 0 ? "steel-0" : "soot"); continue; } // the deep edge of the glass
      const nz = Math.sqrt(1 - d);
      let v = 0.46 + 0.3 * (dx * 0.6 - dy * 0.6) + 0.2 * nz - d * 0.15;
      if (Math.hypot(dx - 0.35, dy + 0.38) < 0.22) v = 1; // hot glint, upper right
      else if (Math.hypot(dx + 0.4, dy - 0.45) < 0.16) v = 0.72; // second reflection, lower left
      tone(g, x, y, GLASS, v);
    }

    // lanterns either side of the glass
    for (const lx of [12, 34]) {
      drop(g, lx, 23, 3, 9);
      cylV(g, lx, 23, 3, 1, BRASS, { amb: 0.35 }); cylV(g, lx, 31, 3, 1, BRASS, { amb: 0.2 });
      for (let y = 24; y < 31; y++) for (let x = lx; x < lx + 3; x++) tone(g, x, y, lit, (s === "idle" ? 0.4 : 0.6) + (x - lx) * 0.15 - Math.abs(y - 27) * 0.05);
      if (glow) g.glowDisc(lx + 1.5, 27, 4, glow, 0.25, [lx, 24, 3, 7]);
    }

    // three bulbs under the glass
    drop(g, 17, 40, 16, 5);
    g.rect(17, 40, 16, 5, "iron-1"); g.box(17, 40, 16, 5, "brass-1"); g.hline(17, 40, 16, "brass-2");
    for (let i = 0; i < 3; i++) {
      const bx = 20 + i * 5, hot = s === "working" ? i === f % 3 : s !== "idle";
      for (let y = 41; y <= 43; y++) for (let x = bx; x <= bx + 2; x++) tone(g, x, y, s === "idle" || (s === "working" && !hot) ? LIT.idle : lit, 0.5 + (x - bx) * 0.12 - (y - 42) * 0.12 + (hot ? 0.15 : 0));
      if (hot && glow) g.glowDisc(bx + 1.5, 42.5, 3, glow, 0.25, [bx, 41, 3, 3]);
    }

    // --- feet
    for (const fx of [12, 31]) { strap(g, fx, 45, 7, 2, BRASS, 3); cylH(g, fx, 47, 7, 2, BRASS, { amb: 0.15 }); }

    raw.outline();
    if (s === "jammed") smoke(g, 33, 8, f / 8, true);
  },
};
