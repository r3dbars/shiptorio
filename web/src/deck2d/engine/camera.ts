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

export interface Screen { w: number; h: number; dpr: number; artPx: number; pixel: boolean }

/** Snap a scale to whole device px per art px (pixel mode); `down` never zooms past the requested scale. */
export function wholeScale(s: number, v: Screen, down = false): number {
  if (!v.pixel) return s;
  const k = s * v.artPx * v.dpr;
  return Math.max(1, down ? Math.floor(k + 1e-6) : Math.round(k)) / (v.artPx * v.dpr);
}

/** Frame a subject `width` world units wide at a whole-number zoom, with it sitting in the upper part of the screen
 * (the card lives at the bottom). Wide screens show at least `width * 1.25` of height, so a desktop isn't blown up
 * far closer than a phone. */
export function frameShot(subject: { x: number; y: number; width: number }, v: Screen) {
  const s = wholeScale(Math.min(v.w / subject.width, v.h / (subject.width * 1.25)), v);
  return { x: subject.x, y: subject.y + (v.h / s) * 0.1, s };
}
