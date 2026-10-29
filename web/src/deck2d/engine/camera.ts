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

export function settleCamera(value: number, target: number, dt: number, tolerance: number) {
  if (Math.abs(target - value) < tolerance) return target;
  return value + (target - value) * (1 - Math.exp(-4.5 * dt));
}
