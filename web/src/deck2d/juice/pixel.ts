// Pixel-mode juice (?px=1, contract "the pixel canvas"): the deck's few big-moment effects drawn straight into the
// engine's art buffer as whole art pixels in PALETTE colors, instead of DOM overlays. Steam and dust sit on the light
// layer (25/50/75%). Few frames at EFFECT_FPS, motion in whole art px, no arcs, no rotation, no scaling.
//
// Calm (same rules as the DOM juice): effects only at the focal moments.
//   station-built  dust kicks out from its feet + a green check pops over it
//   automated      the AUTOMATED plate stamps on over the stop, with a green check
//   launch         smoke billows off the pad, then a column of steam climbs
// Everything else is the sprites' job.
//
// Mount with createJuiceLayer(art, bus) next to the engine's other layers; it draws in the "front" slot.

import { ART_PX, BELT_Y, LAUNCH, LOOK, PALETTE, STOP_X, snap, type CreateLayer, type DeckEvent, type LayerSlot, type StopId } from "../contract";

export const EFFECT_FPS = 8;
const P = ART_PX;

/** One art pixel at art coords (ax, ay) relative to a world origin already snapped to the grid. */
type Px = (ax: number, ay: number, color: string) => void;

// ---- shapes ------------------------------------------------------------------------------------------------

/**
 * A puff of steam or dust, radius r art px: banded shading lit from the upper right (highlight, light, mid, shadow
 * from the ramp), dithered in a checker where two bands meet, and a lacy dithered rim that eats inward as `thin`
 * goes 0 -> 1. No arcs: every px is tested on the grid.
 */
export function puff(px: Px, r: number, ramp: readonly string[], thin = 0, seed = 0) {
  const [shadow, mid, light, high] = ramp;
  const BANDS = [0.3, 0.5, 0.7]; // shadow | mid | light | high
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++) {
      const d = Math.sqrt(x * x + y * y) / (r + 0.5);
      if (d > 1) continue;
      const checker = ((x + y + seed) & 1) === 0;
      // thinning: the rim goes first, then holes open in a checker toward the core
      if (d > 1 - thin * 0.9 && checker) continue;
      if (thin > 0.6 && d > 0.95 - thin) continue;
      const lit = 0.55 * (1 - d) + 0.45 * ((x - y) / (2 * r + 1) + 0.5);
      let band = BANDS.findIndex((t) => lit < t);
      if (band < 0) band = 3;
      // dither the seam: just under a threshold, every other px takes the next band up
      const t = BANDS[band];
      if (t !== undefined && t - lit < 0.05 && checker) band++;
      px(x, y, [shadow, mid, light, high][Math.min(3, band)]);
    }
}

// 10 x 8 check mark, a 2 px stroke so it has room for a bevel. h = lit top/right face, m = body, d = shadow
// (bottom/left), g = white glint, o = soot outline.
const CHECK = [
  "0000000oo0",
  "000000ohgo",
  "00000ohmdo",
  "oo00ohmdo0",
  "ohoohmdo00",
  "odmhmdo000",
  "0odmdo0000",
  "00ooo00000",
];
export function check(px: Px) {
  const C: Record<string, string> = { h: PALETTE.ok[2], m: PALETTE.ok[1], d: PALETTE.ok[0], g: PALETTE.white[0], o: PALETTE.soot[0] };
  CHECK.forEach((row, y) => [...row].forEach((c, x) => { if (C[c]) px(x - 5, y - 4, C[c]); }));
}

// 3 x 5 pixel letters, just what AUTOMATED needs
const FONT: Record<string, string[]> = {
  A: ["010", "101", "111", "101", "101"],
  U: ["101", "101", "101", "101", "111"],
  T: ["111", "010", "010", "010", "010"],
  O: ["010", "101", "101", "101", "010"],
  M: ["101", "111", "111", "101", "101"],
  E: ["111", "100", "110", "100", "111"],
  D: ["110", "101", "101", "101", "110"],
};
/** Width in art px of the stamp plate for a word. */
export const plateWidth = (word: string) => word.length * 4 - 1 + 6;

/** The green AUTOMATED plate: soot outline, dark-green face, bright green border and letters. Centered on (0,0). */
export function plate(px: Px, word = "AUTOMATED") {
  const w = plateWidth(word), h = 11, x0 = -Math.floor(w / 2), y0 = -Math.floor(h / 2);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      const ring = x === 1 || y === 1 || x === w - 2 || y === h - 2;
      px(x0 + x, y0 + y, edge ? PALETTE.soot[0] : ring ? (x >= w - 2 || y <= 1 ? PALETTE.ok[2] : PALETTE.ok[1]) : PALETTE.ok[0]);
    }
  px(x0 + w - 3, y0 + 2, PALETTE.white[0]); // glint where the light hits the bevel
  // letters: a 1 px soot shadow down-left first, then the bright face, so they read as stamped in relief
  const letters = (dx: number, dy: number, color: string) => [...word].forEach((ch, i) => (FONT[ch] ?? []).forEach((row, y) => [...row].forEach((c, x) => {
    if (c === "1") px(x0 + 3 + i * 4 + x + dx, y0 + 3 + y + dy, color);
  })));
  letters(-1, 1, PALETTE.soot[0]);
  letters(0, 0, PALETTE.ok[2]);
}

// ---- effects -----------------------------------------------------------------------------------------------

/** A running effect: world origin (snapped), age in frames, light-layer alpha per frame. Returns false when done. */
export interface Fx {
  x: number;
  y: number;
  t: number; // seconds since it started
  frames: number; // how many frames it lasts
  draw(px: Px, f: number, alpha: (a: 0.25 | 0.5 | 0.75 | 1) => void): void;
}

const fade = (f: number, n: number): 0.25 | 0.5 | 0.75 => (f < n * 0.4 ? 0.75 : f < n * 0.75 ? 0.5 : 0.25);

const STEAM = [PALETTE.haze[1], PALETTE.haze[2], PALETTE.haze[3], PALETTE.white[0]] as const;
const DUST = [PALETTE.plate[2], PALETTE.plate[4], PALETTE.haze[2], PALETTE.haze[3]] as const;

/** A steam puff: rises 1 art px a frame and grows, then thins out from the rim in. */
export function steamFx(x: number, y: number, size = 2, drift = 0): Fx {
  const frames = 8;
  const seed = Math.round(x / P + y / P) & 1;
  return { x, y, t: 0, frames, draw(px, f, alpha) {
    alpha(fade(f, frames));
    const r = Math.min(size + 2, size + (f >> 1));
    const ox = Math.round((drift * f) / 3);
    puff((ax, ay, c) => px(ax + ox, ay - f, c), r, STEAM, f / (frames - 1), seed + f);
  } };
}

/** Dust kicked out sideways along the floor: dir -1 left, 1 right. Rolls out, settles, thins. */
export function dustFx(x: number, y: number, dir: -1 | 1): Fx {
  const frames = 6;
  return { x, y, t: 0, frames, draw(px, f, alpha) {
    alpha(fade(f, frames));
    const r = 1 + (f >> 1);
    puff((ax, ay, c) => px(ax + dir * (2 + f * 2), ay - (f >> 1), c), r, DUST, f / (frames - 1), f);
  } };
}

/** A green check that pops up 2 art px, holds, then is gone. */
export function checkFx(x: number, y: number, holdFrames = 10): Fx {
  return { x, y, t: 0, frames: 2 + holdFrames, draw(px, f, alpha) {
    const lift = f === 0 ? 0 : f === 1 ? -3 : -2; // overshoot one px, settle
    // a contact shadow on whatever it hovers over, on the light layer
    alpha(0.5);
    for (let x = -4; x <= 3; x++) px(x, 5, PALETTE.iron[0]);
    alpha(1);
    check((ax, ay, c) => px(ax, ay + lift, c));
  } };
}

/** The AUTOMATED plate stamping on: drops 2 px onto its spot, holds, gone. */
export function stampFx(x: number, y: number, holdFrames = 14): Fx {
  const w = plateWidth("AUTOMATED");
  return { x, y, t: 0, frames: 2 + holdFrames, draw(px, f, alpha) {
    const drop = f === 0 ? -2 : 0;
    // cast shadow down-left onto the station, light layer
    alpha(0.5);
    for (let ax = 0; ax < w; ax++) px(-Math.floor(w / 2) + ax - 1, 6, PALETTE.iron[0]);
    alpha(1);
    plate((ax, ay, c) => px(ax, ay + drop, c));
  } };
}

/** Where a stop's machine stands (feet) and its top, in world units. */
export function stopFeet(stop: StopId) {
  return { x: STOP_X[stop], y: BELT_Y + LOOK[stop].drop };
}
export function stopTop(stop: StopId) {
  return { x: STOP_X[stop], y: BELT_Y + LOOK[stop].drop - LOOK[stop].h };
}

/** What a focal event spawns. Pure, so it can be tested without a canvas. */
export function effectsFor(e: DeckEvent): Fx[] {
  switch (e.type) {
    case "station-built": {
      const f = stopFeet(e.stop), top = stopTop(e.stop);
      return [dustFx(f.x - 20 * P, f.y, -1), dustFx(f.x + 20 * P, f.y, 1), checkFx(top.x, top.y - 6 * P)];
    }
    case "automated": {
      const top = stopTop(e.stop);
      return [stampFx(top.x, top.y - 10 * P), checkFx(top.x + (plateWidth("AUTOMATED") / 2 + 5) * P, top.y - 10 * P, 14)];
    }
    case "launch": {
      const out: Fx[] = [];
      // pad billow: puffs rolling out both ways, then a column climbing
      for (let i = 0; i < 4; i++) {
        const a = steamFx(LAUNCH.x - (6 + i * 5) * P, LAUNCH.y, 2 + (i & 1), -1);
        const b = steamFx(LAUNCH.x + (6 + i * 5) * P, LAUNCH.y, 2 + (i & 1), 1);
        a.t = b.t = -i * 0.08;
        out.push(a, b);
      }
      for (let i = 0; i < 6; i++) {
        const c = steamFx(LAUNCH.x + ((i % 3) - 1) * P, LAUNCH.y - i * 6 * P, 2, 0);
        c.t = -0.35 - i * 0.12;
        out.push(c);
      }
      return out;
    }
    default:
      return [];
  }
}

// ---- the layer ---------------------------------------------------------------------------------------------

export const createJuiceLayer: CreateLayer = (_art, bus) => {
  let live: Fx[] = [];
  bus.on((e) => { live.push(...effectsFor(e)); });
  return {
    update(dt) {
      for (const fx of live) fx.t += dt;
      live = live.filter((fx) => fx.t * EFFECT_FPS < fx.frames);
    },
    draw(cx: CanvasRenderingContext2D, slot: LayerSlot) {
      if (slot !== "front" || !live.length) return;
      cx.save();
      for (const fx of live) {
        if (fx.t < 0) continue;
        const f = Math.floor(fx.t * EFFECT_FPS);
        const ox = snap(fx.x), oy = snap(fx.y);
        cx.globalAlpha = 1;
        fx.draw(
          (ax, ay, c) => { cx.fillStyle = c; cx.fillRect(ox + ax * P, oy + ay * P, P, P); },
          f,
          (a) => { cx.globalAlpha = a; },
        );
      }
      cx.restore();
    },
  };
};
