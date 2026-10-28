import type { StopState } from "../contract";
import type { Color } from "./palette";
import { shift, type Px } from "./px";
import { BRASS, IRON, blotch, bracket, cylH, cylV, drop, noise, rivet, side, strap, tone, type Ramp } from "./shade";
import type { StationDef } from "./types";

// Planner: a brass-trimmed wooden drafting desk. A plan board pinned up at the back (three steps, three lamps along
// its top), a desk lamp on a jointed arm, a stack of books, papers spread out, a lantern on the right corner and a
// blue banner hanging off the front. Shippy visits; nobody sits here (no robot at the desk).
// Working: a highlight steps across the plan. Jammed: the middle step is a red X. Auto: a green check.

const WOOD: Ramp = ["soot", "plate-0", "plate-1", "plate-2", "plate-3", "plate-4"];
const PAPER: Ramp = ["plate-2", "plate-3", "plate-4", "sun-6", "haze-3", "white"];
const CLOTH: Ramp = ["steel-0", "steel-1", "steel-2", "steel-3"];
const LIT: Record<StopState, Ramp> = {
  idle: ["soot", "iron-1", "iron-2", "iron-3", "iron-4"],
  working: ["sun-1", "sun-3", "sun-4", "sun-5", "sun-6", "white"],
  jammed: ["jam-0", "jam-1", "jam-1", "jam-2", "jam-2", "haze-3"],
  auto: ["ok-0", "ok-1", "ok-1", "ok-2", "ok-2", "white"],
};
const DIM: Ramp = ["soot", "plate-0", "plate-1", "plate-2", "plate-3"]; // unlit glass still shows a little colour
const GLOW: Record<StopState, Color | null> = { idle: null, working: "sun-5", jammed: "jam-2", auto: "ok-2" };

function lampBall(g: Px, cx: number, cy: number, r: number, ramp: Ramp) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
    if (d <= r) tone(g, x, y, ramp, 0.55 + 0.35 * (dx - dy) / r - d * 0.08);
  }
}

/** Board icons, 5x5, drawn in the plan's blue ink: a gear, a little factory, a crate. */
function icon(g: Px, x: number, y: number, k: number) {
  const rows = [
    ["#.#.#", ".###.", "##.##", ".###.", "#.#.#"], // gear
    ["#....", "#.#..", "#.#.#", "#...#", "#####"], // factory
    ["..#..", ".#.#.", ".#.#.", ".###.", "#...#"], // rocket
  ][k];
  g.box(x - 1, y - 1, 7, 7, "plate-3"); g.hline(x - 1, y + 5, 7, "plate-2"); g.vline(x - 1, y - 1, 7, "plate-2"); // each step sits in its own little frame, like the mockup's tiles
  rows.forEach((r, j) => [...r].forEach((c, i) => c === "#" && g.set(x + i, y + j, "steel-1")));
}

export const planner: StationDef = {
  w: 48, h: 56,
  anim: (s) => (s === "working" ? { n: 6, fps: 2 } : { n: 1, fps: 0 }),
  draw(raw, s, f) {
    // traced from Justin's planner art at 44 tall (without the little robot), 46 wide; +1px outline, a little headroom
    const g = shift(raw, 1, 11);
    const lit = LIT[s], glow = GLOW[s];

    g.glow(3, 43, 40, 2, "iron-0", 0.5, true); // contact shadow

    // --- the plan board, leaning back on two posts
    for (const px of [16, 35]) for (let y = 20; y < 27; y++) { tone(g, px, y, WOOD, 0.3); tone(g, px + 1, y, WOOD, 0.55); }
    drop(g, 13, 7, 27, 15);
    for (let y = 7; y < 22; y++) for (let x = 13; x < 40; x++) tone(g, x, y, WOOD, 0.45 + 0.15 * ((x - 13) / 27) + (blotch(x, y, 3, 8) - 0.5) * 0.2);
    strap(g, 13, 7, 27, 2, BRASS, 6, false); strap(g, 13, 20, 27, 2, BRASS, 6, false);
    for (let y = 9; y < 20; y++) { tone(g, 13, y, BRASS, 0.35); tone(g, 39, y, BRASS, 0.7); }
    // parchment, pinned at the corners, curling a little at the right
    for (let y = 9; y < 20; y++) for (let x = 15; x < 38; x++) tone(g, x, y, PAPER, 0.5 + 0.25 * ((x - 15) / 23) - (y - 9) * 0.015 + (noise(x, y, 4) - 0.5) * 0.12);
    for (let y = 9; y < 20; y++) tone(g, 15, y, PAPER, 0.25);
    for (const [x, y] of [[16, 10], [36, 10], [16, 18], [36, 18]]) g.set(x, y, "brass-3");
    for (let k = 0; k < 3; k++) {
      const ix = 18 + k * 6, iy = 12;
      if (k === 1 && (s === "jammed" || s === "auto")) {
        const ramp = s === "jammed" ? LIT.jammed : LIT.auto;
        for (let y = iy - 1; y < iy + 6; y++) for (let x = ix - 1; x < ix + 6; x++) tone(g, x, y, ramp, 0.15);
        if (s === "jammed") for (let i = 0; i < 5; i++) { g.set(ix + i, iy + i, "jam-2"); g.set(ix + 4 - i, iy + i, "jam-2"); }
        else for (const [x, y] of [[0, 2], [1, 3], [2, 4], [3, 3], [4, 2], [4, 1]]) g.set(ix + x, iy + y, "ok-2");
      } else {
        if (s === "working" && k === f % 3) { g.box(ix - 1, iy - 1, 7, 7, "sun-4"); g.glow(ix - 2, iy - 2, 9, 9, "sun-5", 0.25); }
        icon(g, ix, iy, k);
      }
      if (k < 2) { g.set(ix + 6, iy + 2, "steel-1"); g.set(ix + 5, iy + 1, "steel-2"); g.set(ix + 5, iy + 3, "steel-2"); }
    }
    // three lamps along the top of the board
    for (let k = 0; k < 3; k++) {
      const lx = 19.5 + k * 7;
      cylH(g, Math.round(lx) - 2, 5, 4, 2, BRASS, { amb: 0.25 });
      lampBall(g, lx, 3.5, 1.9, s === "idle" ? DIM : lit);
      if (glow) g.glowDisc(lx, 3.5, 3.5, glow, 0.25);
    }

    // --- desk lamp on a jointed arm (left), aimed down at the papers
    for (let y = 6; y < 25; y++) { tone(g, 8, y, BRASS, 0.35); tone(g, 9, y, BRASS, 0.75); }
    for (let i = 0; i < 6; i++) { tone(g, 9 + i, 5 - Math.round(i / 2), BRASS, 0.8); tone(g, 9 + i, 6 - Math.round(i / 2), BRASS, 0.35); }
    rivet(g, 8, 5);
    cylH(g, 13, 1, 6, 3, BRASS, { amb: 0.2, gloss: 0.9 });
    for (let x = 12; x < 20; x++) tone(g, x, 4, BRASS, 0.3 + (x - 12) * 0.06);
    g.hline(13, 5, 6, s === "idle" ? "iron-1" : "sun-6");
    if (s !== "idle") g.glow(14, 6, 10, 15, "sun-6", 0.25); // its pool of light on the board and papers

    // --- a stack of books (left), standing on the desk
    const books: [number, number, Color, Color][] = [[3, 15, "copper-1", "copper-2"], [6, 17, "steel-1", "steel-2"], [9, 14, "plate-2", "plate-3"]];
    for (const [bx, by, a, b] of books) { g.rect(bx, by, 3, 25 - by, a); g.vline(bx + 2, by, 25 - by, b); g.hline(bx, by + 2, 3, "brass-3"); }

    // --- desk top, papers spread out
    for (let k = 0; k < 3; k++) for (let x = 2 + (3 - k); x <= 45; x++) tone(g, x, 24 + k, WOOD, 0.62 + 0.15 * ((x - 2) / 43) - k * 0.05 + (blotch(x, 24 + k, 3, 3) - 0.5) * 0.15);
    strap(g, 2, 27, 40, 2, BRASS, 5);
    for (let y = 22; y < 27; y++) for (let x = 17; x < 31; x++) if (!(y === 22 && x > 27)) tone(g, x, y, PAPER, 0.62 + (x - 17) * 0.015 - (y - 22) * 0.04);
    g.hline(19, 24, 7, "plate-3"); g.hline(19, 25, 5, "plate-3");
    // a pen pot on the left of the desk, and a little brass-cornered box of parts on the right
    cylV(g, 12, 21, 4, 3, IRON, { amb: 0.15, gloss: 0.8 }); g.hline(12, 21, 4, "iron-0");
    for (const [x, h, c] of [[12, 3, "steel-2"], [13, 4, "copper-1"], [15, 2, "plate-3"]] as const) { g.vline(x, 21 - h, h, c); g.set(x, 21 - h, c === "copper-1" ? "copper-2" : "brass-3"); }
    drop(g, 35, 21, 5, 3); for (let y = 21; y < 24; y++) for (let x = 35; x < 40; x++) tone(g, x, y, WOOD, 0.55 + (x - 35) * 0.06 - (y - 21) * 0.08);
    g.set(35, 21, "brass-3"); g.set(39, 21, "brass-4"); g.hline(36, 22, 3, "plate-1");
    // inkpot + quill
    cylV(g, 32, 22, 3, 3, IRON, { amb: 0.2 }); g.set(34, 20, "haze-3"); g.set(34, 21, "haze-2"); g.set(33, 21, "haze-3");

    // --- desk body: drawers left and right, a dark kneehole, brass pulls
    side(g, 42, 30, 12, 4, WOOD, 0.5, 6); // the desk's right end, seen in 3/4
    for (let y = 29; y < 41; y++) for (let x = 2; x < 42; x++) tone(g, x, y, WOOD, 0.4 + 0.1 * ((x - 2) / 40) - (y - 29) * 0.008 + (blotch(x, y, 4, 6) - 0.5) * 0.15);
    for (const [x0, w] of [[4, 11], [30, 10]]) for (let r = 0; r < 2; r++) {
      const y0 = 30 + r * 5;
      drop(g, x0, y0, w, 4, "plate-0");
      for (let y = y0; y < y0 + 4; y++) for (let x = x0; x < x0 + w; x++) tone(g, x, y, WOOD, 0.5 + (y === y0 ? 0.2 : y === y0 + 3 ? -0.2 : 0) + (x - x0) * 0.01);
      cylH(g, x0 + Math.floor(w / 2) - 1, y0 + 1, 3, 2, BRASS, { amb: 0.4, gloss: 1 });
    }
    for (let y = 30; y < 41; y++) for (let x = 17; x < 29; x++) g.set(x, y, y < 32 ? "plate-0" : "soot");
    // a tool crate pushed into the kneehole: planks, a brass rim, handles sticking out
    for (const [x, c] of [[20, "steel-2"], [22, "copper-1"], [24, "iron-3"], [26, "plate-3"]] as const) { g.vline(x, 32, 4, c); g.set(x, 32, x === 22 ? "copper-2" : "brass-3"); }
    drop(g, 18, 35, 10, 6);
    for (let y = 35; y < 41; y++) for (let x = 18; x < 28; x++) tone(g, x, y, WOOD, 0.42 + 0.15 * ((x - 18) / 10) + ((y - 35) % 3 === 2 ? -0.18 : 0) + (noise(x, y, 5) - 0.5) * 0.1);
    strap(g, 18, 35, 10, 1, BRASS, 0, false); g.set(19, 37, "brass-3"); g.set(26, 37, "brass-3");
    strap(g, 2, 29, 2, 12, BRASS, 0, false); strap(g, 40, 29, 2, 12, BRASS, 0, false); bracket(g, 2, 29, 0, 0, 3); bracket(g, 41, 29, 1, 0, 3);
    for (const fx of [2, 36]) { cylH(g, fx, 41, 6, 2, BRASS, { amb: 0.15 }); }
    cylH(g, 41, 38, 4, 2, BRASS, { amb: 0.12 }); // the back foot, under the side
    g.hline(8, 41, 28, "plate-0");

    // --- lantern on the right corner of the desk
    cylH(g, 40, 22, 5, 2, BRASS, { amb: 0.2 });
    cylV(g, 40, 14, 5, 8, BRASS, { amb: 0.15, gloss: 0.7 });
    for (let y = 15; y < 21; y++) for (let x = 41; x < 44; x++) tone(g, x, y, lit, (s === "idle" ? 0.45 : 0.65) + (x - 41) * 0.1 - Math.abs(y - 17.5) * 0.05);
    cylV(g, 40, 13, 5, 1, BRASS, { amb: 0.35, gloss: 0.9 }); g.set(42, 12, "brass-3"); g.set(42, 11, "brass-4");
    if (glow) g.glowDisc(42.5, 18, 4.5, glow, 0.25, [41, 15, 3, 6]);

    // --- the blue banner with a brass gear badge
    drop(g, 34, 29, 6, 13);
    for (let y = 29; y < 42; y++) for (let x = 34; x < 40; x++) tone(g, x, y, CLOTH, 0.4 + (x - 34) * 0.1 - (y > 39 && (x === 36 || x === 37) ? 0.5 : 0));
    g.set(36, 41, "soot"); g.set(37, 41, "soot"); g.set(36, 40, "steel-0"); g.set(37, 40, "steel-0");
    for (let y = 32; y < 37; y++) for (let x = 35; x < 39; x++) { const d = Math.hypot(x + 0.5 - 37, y + 0.5 - 34.5); if (d < 2.2) tone(g, x, y, BRASS, d < 0.9 ? 0.2 : 0.55 + (x - 35) * 0.08); }
    strap(g, 33, 29, 8, 1, BRASS, 0, false);

    raw.outline();
  },
};
