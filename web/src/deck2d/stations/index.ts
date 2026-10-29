import { ART_PX, BELT_Y, LOOK, PALETTE, STOP_X, snap, type StopId, type StopState } from "../contract";
import { builder } from "./builder";
import { checks } from "./checks";
import { gate } from "./gate";
import { planner } from "./planner";
import { Px } from "./px";
import { repo } from "./repo";
import { review } from "./review";
import type { StationDef } from "./types";
import { silhouetteOutline, statusLamp } from "./status";

// The six stations, drawn in code into art-px grids (Black Iron 48, 1px soot outline, light from the upper right).
// Calm: idle and auto hold still, working moves one small part, and only a jam pulses.
//
// The engine (and build/) draws one with drawStation(ctx, id, state, t, x, feetY) in the pixel buffer's world
// coords, or blits stationFrame(...) itself. Frames are baked once and cached. Sizes vary per station (the
// Builder is 66 x 66 art px with smoke headroom; feet are always the bottom row, centred).

export type StationId = Exclude<StopId, "launch">;
export const STATIONS: Record<StationId, StationDef> = { repo, planner, builder, checks, review, gate };
export const STATION_STATES: readonly StopState[] = ["idle", "working", "jammed", "auto"];

const cache = new Map<string, HTMLCanvasElement>();
const outlines = new Map<string, HTMLCanvasElement>();

function blockedOutline(id: StationId, attention = false) {
  const key = `${id}:${attention}`, colors = attention ? [PALETTE.brass[4], PALETTE.brass[2]] : [PALETTE.jam[2], PALETTE.jam[1]];
  let cv = outlines.get(key);
  if (!cv) {
    const def = STATIONS[id], shape = new Px(def.w, def.h);
    // Trace structural pixels, not the transient smoke or light-layer halos.
    def.draw(shape, "idle", 0);
    const ring = silhouetteOutline(def.w, def.h, (x, y) => shape.d[y * def.w + x] !== 255);
    cv = document.createElement("canvas"); cv.width = ring.width; cv.height = ring.height;
    const ctx = cv.getContext("2d")!;
    for (let y = 0; y < ring.height; y++) for (let x = 0; x < ring.width; x++) {
      const distance = ring.pixels[y * ring.width + x];
      if (distance) { ctx.fillStyle = colors[distance - 1]; ctx.fillRect(x, y, 1, 1); }
    }
    outlines.set(key, cv);
  }
  return cv;
}

/** Which frame of a state's loop is showing at time t (seconds). */
export function frameAt(id: StationId, s: StopState, t: number) {
  const { n, fps } = STATIONS[id].anim(s);
  return n > 1 ? Math.floor(t * fps) % n : 0;
}

/** The baked sprite for a station's state at time t: a w x h canvas in art px, feet on the bottom row. */
export function stationFrame(id: StationId, s: StopState, t = 0): HTMLCanvasElement {
  const f = frameAt(id, s, t), key = `${id}:${s}:${f}`;
  let cv = cache.get(key);
  if (!cv) {
    const def = STATIONS[id], g = new Px(def.w, def.h);
    def.draw(g, s, f);
    cv = g.bake();
    cache.set(key, cv);
  }
  return cv;
}

/**
 * Draw a station with its feet centred on (x, feetY). Defaults are the engine's: world units in the pixel buffer
 * (scale = ART_PX world units per art px), feet at (STOP_X[id], BELT_Y + LOOK[id].drop), positions snapped to the
 * art grid. Pass scale 1 to draw straight into an art-px context.
 */
export function drawStation(ctx: CanvasRenderingContext2D, id: StationId, s: StopState, t = 0, x = STOP_X[id], feetY = BELT_Y + LOOK[id].drop, scale = ART_PX, attention = false) {
  const cv = stationFrame(id, s, t), w = cv.width * scale, h = cv.height * scale;
  const at = (n: number) => (scale === ART_PX ? snap(n) : Math.round(n));
  const was = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  // Short stepped shadows cast down-left by the upper-right sun, plus a tight
  // contact seam. Opaque palette pixels keep the floor and machines on one grid.
  const footW = Math.round(cv.width * 0.6);
  for (let row = 9; row >= 0; row--) {
    ctx.fillStyle = row > 5 ? PALETTE.iron[1] : PALETTE.iron[0];
    ctx.fillRect(at(x - footW * scale / 2 - row * scale), at(feetY + row * scale), footW * scale, scale);
  }
  // A low mounting slab has a receding top and a vertical front face. The feet
  // meet its lit upper edge; the walkway remains visible beyond its shadow.
  for (let row = -5; row <= 3; row++) {
    ctx.fillStyle = row < 0 ? PALETTE.iron[2] : row === 0 ? PALETTE.iron[4] : PALETTE.iron[0];
    const recede = row < 0 ? -row : 0;
    ctx.fillRect(at(x - footW * scale / 2 + recede * scale), at(feetY + row * scale), footW * scale, scale);
  }
  ctx.fillStyle = PALETTE.soot[0];
  ctx.fillRect(at(x - footW * scale / 2), at(feetY), footW * scale, scale);
  if (s === "jammed" || attention) {
    const outline = blockedOutline(id, s !== "jammed" && attention);
    ctx.drawImage(outline, at(x - w / 2) - 2 * scale, at(feetY - h) - 2 * scale, outline.width * scale, outline.height * scale);
  }
  ctx.drawImage(cv, at(x - w / 2), at(feetY - h), w, h);
  statusLamp(ctx, s, x, feetY, scale, attention);
  ctx.imageSmoothingEnabled = was;
}

/** Size in art px (outline included), for layout. */
export const stationSize = (id: StationId) => ({ w: STATIONS[id].w, h: STATIONS[id].h });
