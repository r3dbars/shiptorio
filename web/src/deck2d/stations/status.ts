import { PALETTE as C, type StopState } from "../contract";

export const machineSignal = (state: StopState, attention = false) => state === "jammed" ? C.jam : attention ? C.brass : state === "working" || state === "auto" ? C.ok : C.steel;

/** A steady shared status light, mounted in the same front-foot position on every machine. */
export function statusLamp(ctx: CanvasRenderingContext2D, state: StopState, x: number, feet: number, scale: number, attention = false) {
  const c = machineSignal(state, attention), left = Math.round(x / scale) - 5, top = Math.round(feet / scale) - 5;
  const rect = (dx: number, dy: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color; ctx.fillRect((left + dx) * scale, (top + dy) * scale, w * scale, h * scale);
  };
  rect(0, 0, 11, 5, C.soot[0]); rect(1, 1, 9, 3, C.steel[0]);
  const bright = attention ? C.brass[4] : state === "idle" ? c[1] : c[2];
  rect(1, 1, 3, 3, c[0]); rect(2, 1, 2, 2, attention ? C.brass[3] : c[1]); rect(3, 1, 1, 1, bright);
  rect(6, 2, 3, 1, bright);
}

/** Two-pixel exterior contour. Enclosed holes stay clear; the outline follows every outer pixel step. */
export function silhouetteOutline(w: number, h: number, opaque: (x: number, y: number) => boolean) {
  const pad = 2, width = w + pad * 2, height = h + pad * 2;
  const body = new Uint8Array(width * height), outside = new Uint8Array(width * height), pixels = new Uint8Array(width * height);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (opaque(x, y)) body[(y + pad) * width + x + pad] = 1;
  const queue = [0]; outside[0] = 1;
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i], x = p % width, y = Math.floor(p / width);
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      const n = ny * width + nx;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && !body[n] && !outside[n]) { outside[n] = 1; queue.push(n); }
    }
  }
  for (const p of queue) {
    const x = p % width, y = Math.floor(p / width);
    let nearest = 3;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height && body[(y + dy) * width + x + dx]) nearest = Math.min(nearest, Math.max(Math.abs(dx), Math.abs(dy)));
    }
    if (nearest <= 2) pixels[p] = nearest;
  }
  return { width, height, pad, pixels };
}
