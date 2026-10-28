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

/** A soft pixel blob, radius r art px: a filled diamond-ish disc (no arcs), core lighter than the rim. */
export function blob(px: Px, r: number, rim: string, core: string) {
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++) {
      const d = x * x + y * y;
      if (d > r * r + r * 0.6) continue;
      px(x, y, d <= (r - 1) * (r - 1) && x >= -1 && y <= 0 ? core : rim); // light from the upper right
    }
}

// 7 x 6 check mark, 1 = ok green, 2 = soot outline
const CHECK = [
  "0000022",
  "0000212",
  "2202122",
  "2121220",
  "0211200",
  "0022000",
];
export function check(px: Px) {
  CHECK.forEach((row, y) => [...row].forEach((c, x) => {
    if (c === "1") px(x - 3, y - 3, x >= 4 ? PALETTE.ok[2] : PALETTE.ok[1]);
    else if (c === "2") px(x - 3, y - 3, PALETTE.soot[0]);
  }));
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
  [...word].forEach((ch, i) => (FONT[ch] ?? []).forEach((row, y) => [...row].forEach((c, x) => {
    if (c === "1") px(x0 + 3 + i * 4 + x, y0 + 3 + y, PALETTE.ok[2]);
  })));
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

/** A steam puff: rises 1 art px a frame and grows, then thins out. */
export function steamFx(x: number, y: number, size = 2, drift = 0): Fx {
  const frames = 8;
  return { x, y, t: 0, frames, draw(px, f, alpha) {
    alpha(fade(f, frames));
    const r = Math.min(size + 2, size + (f >> 1));
    const ox = Math.round((drift * f) / 3);
    blob((ax, ay, c) => px(ax + ox, ay - f, c), r, PALETTE.haze[2], PALETTE.white[0]);
  } };
}

/** Dust kicked out sideways along the floor: dir -1 left, 1 right. */
export function dustFx(x: number, y: number, dir: -1 | 1): Fx {
  const frames = 6;
  return { x, y, t: 0, frames, draw(px, f, alpha) {
    alpha(fade(f, frames));
    const r = 1 + (f >> 1);
    blob((ax, ay, c) => px(ax + dir * (2 + f * 2), ay - (f >> 1), c), r, PALETTE.plate[3], PALETTE.haze[3]);
  } };
}

/** A green check that pops up 2 art px, holds, then is gone. */
export function checkFx(x: number, y: number, holdFrames = 10): Fx {
  return { x, y, t: 0, frames: 2 + holdFrames, draw(px, f) {
    const lift = f === 0 ? 0 : f === 1 ? -3 : -2; // overshoot one px, settle
    check((ax, ay, c) => px(ax, ay + lift, c));
  } };
}

/** The AUTOMATED plate stamping on: drops 2 px onto its spot, holds, gone. */
export function stampFx(x: number, y: number, holdFrames = 14): Fx {
  return { x, y, t: 0, frames: 2 + holdFrames, draw(px, f) {
    const drop = f === 0 ? -2 : 0;
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
