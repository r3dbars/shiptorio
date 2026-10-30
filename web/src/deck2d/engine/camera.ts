/** Integer zoom with a dead band to prevent trackpad chatter at a rounding boundary. */
export function pixelZoom(requested: number, current?: number): number {
  if (current === undefined) return Math.max(1, Math.round(requested));
  let next = current;
  while (requested > next + 0.6) next++;
  while (next > 1 && requested < next - 0.6) next--;
  return next;
}

/** Match the rendered buffer's ceil + integer-origin transform. */
export function anchoredCenter(world: number, screen: number, size: number, zoom: number, artPx: number) {
  return world - (screen / zoom - Math.ceil(size / zoom) / 2) * artPx;
}

export function settleCamera(value: number, target: number, dt: number, tolerance: number, rate = 4.5) {
  if (Math.abs(target - value) < tolerance) return target;
  return value + (target - value) * (1 - Math.exp(-rate * dt));
}

/** Story shots ease slower than the automatic camera, so each move reads as one calm move. */
export const SHOT_RATE = 2.4;
/** The line and city zooms glide x and y at this rate (about 95% of the way in 0.6 s, CITY_TIMING.move); the scale cuts. */
export const CITY_CAM_RATE = 5;

export interface Screen { w: number; h: number; dpr: number; artPx: number; pixel: boolean }

/** Snap a scale to whole device px per art px (pixel mode); `down` never zooms past the requested scale. */
export function wholeScale(s: number, v: Screen, down = false): number {
  if (!v.pixel) return s;
  const k = s * v.artPx * v.dpr;
  return Math.max(1, down ? Math.floor(k + 1e-6) : Math.round(k)) / (v.artPx * v.dpr);
}

/** How many art px tall a landscape (desktop) screen shows at least. Justin 2026-10-30: desktop was "way too zoomed in"
 * (6 screen px per art px on a 900 px tall window, the art looked blown up), so a desktop shot never goes past ~3.5. */
export const LANDSCAPE_ROWS = 260;

/** Frame a subject `width` world units wide at a whole-number zoom, with it sitting in the upper part of the screen
 * (the card lives at the bottom). Wide screens show at least `width * 1.25` of height, and a landscape screen at least
 * `rows` art px of height (LANDSCAPE_ROWS by default), so a desktop isn't blown up far closer than a phone. */
export function frameShot(subject: { x: number; y: number; width: number; rows?: number }, v: Screen) {
  let want = Math.min(v.w / subject.width, v.h / (subject.width * 1.25));
  if (v.w > v.h) want = Math.min(want, v.h / ((subject.rows ?? LANDSCAPE_ROWS) * v.artPx));
  const s = wholeScale(want, v, v.w > v.h);
  return { x: subject.x, y: subject.y + (v.h / s) * 0.1, s };
}
