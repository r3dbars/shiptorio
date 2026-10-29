// The pixel canvas: the world is drawn into a small offscreen buffer at art resolution (one buffer pixel = one art
// pixel), then blown up onto the screen at a whole-number scale with smoothing off. That buffer is what makes code
// shapes and snapped pictures read as one piece of pixel art. Optional last step snaps every pixel to the palette.

import { pixelZoom } from "./camera";

export interface PixelCanvas {
  /** Start a frame. cam is in world units (x, y = what's centered, s = screen px per world unit). */
  begin(cam: { x: number; y: number; s: number }): CanvasRenderingContext2D;
  /** Blit the buffer to the screen canvas. */
  end(): void;
  /** Device px per art px this frame (always a whole number). */
  readonly k: number;
  /** Screen (CSS px) -> world units, for taps. */
  toWorld(x: number, y: number): [number, number];
}

export function createPixelCanvas(screen: HTMLCanvasElement, artPx: number, palette?: readonly string[]): PixelCanvas {
  const out = screen.getContext("2d")!;
  const buf = document.createElement("canvas");
  const cx = buf.getContext("2d", { willReadFrequently: !!palette })!;
  screen.style.imageRendering = "pixelated";
  let k = 2, ox = 0, oy = 0, wu = 1, initialized = false; // wu = world units per buffer px after snapping
  const snap = palette ? createQuantizer(palette) : null;

  function quantize() {
    if (!snap) return;
    const img = cx.getImageData(0, 0, buf.width, buf.height);
    snap(img.data);
    cx.putImageData(img, 0, 0);
  }

  return {
    get k() { return k; },
    begin(cam) {
      // whole device px per art px; the camera zoom snaps to the nearest one
      k = pixelZoom(cam.s * artPx * (screen.width / screen.clientWidth || 1), initialized ? k : undefined);
      initialized = true;
      const bw = Math.ceil(screen.width / k), bh = Math.ceil(screen.height / k);
      if (buf.width !== bw || buf.height !== bh) { buf.width = bw; buf.height = bh; }
      wu = artPx;
      // snap the camera to whole art px so edges don't shimmer
      ox = Math.round(cam.x / wu - bw / 2); oy = Math.round(cam.y / wu - bh / 2);
      cx.setTransform(1, 0, 0, 1, 0, 0);
      cx.clearRect(0, 0, bw, bh);
      cx.imageSmoothingEnabled = false;
      cx.setTransform(1 / wu, 0, 0, 1 / wu, -ox, -oy);
      return cx;
    },
    end() {
      quantize();
      out.setTransform(1, 0, 0, 1, 0, 0);
      out.imageSmoothingEnabled = false;
      out.drawImage(buf, 0, 0, buf.width * k, buf.height * k);
    },
    toWorld(x, y) {
      const dpr = screen.width / screen.clientWidth || 1;
      return [((x * dpr) / k + ox) * wu, ((y * dpr) / k + oy) * wu];
    },
  };
}

const LITTLE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

/** Snaps RGBA pixels in place to their nearest palette color (first match wins on ties), alpha to opaque; fully
 *  transparent pixels stay as they are. Runs on every pixel-mode frame, so it reads whole pixels, reuses the last
 *  answer across runs of one color and caches the rest. */
export function createQuantizer(palette: readonly string[]): (d: Uint8ClampedArray) => void {
  const rgb = palette.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  const N = rgb.length, PR = new Int32Array(N), PG = new Int32Array(N), PB = new Int32Array(N);
  rgb.forEach(([r, g, b], n) => { PR[n] = r; PG[n] = g; PB[n] = b; });
  const nearest = (r: number, g: number, b: number) => {
    let best = Infinity, j = 0;
    for (let n = 0; n < N; n++) {
      const dr = PR[n] - r, dg = PG[n] - g, db = PB[n] - b, e = dr * dr + dg * dg + db * db;
      if (e < best) { best = e; j = n; }
    }
    return j;
  };
  if (!LITTLE) {
    const near = new Map<number, number>();
    return (d) => {
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue;
        const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
        let j = near.get(key);
        if (j === undefined) { j = nearest(d[i], d[i + 1], d[i + 2]); near.set(key, j); }
        d[i] = PR[j]; d[i + 1] = PG[j]; d[i + 2] = PB[j]; d[i + 3] = 255;
      }
    };
  }
  // little-endian: a pixel reads as 0xAABBGGRR
  const OUT = new Uint32Array(N).map((_, n) => (0xff000000 | (PB[n] << 16) | (PG[n] << 8) | PR[n]) >>> 0);
  const near = new Map<number, number>(); // 0xBBGGRR -> output pixel
  return (d) => {
    const u = new Uint32Array(d.buffer, d.byteOffset, d.length >> 2);
    let lastIn = -1, lastOut = 0;
    for (let i = 0; i < u.length; i++) {
      const p = u[i];
      if (p < 0x01000000) continue; // alpha 0
      const key = p & 0xffffff;
      if (key !== lastIn) {
        let o = near.get(key);
        if (o === undefined) { o = OUT[nearest(key & 255, (key >> 8) & 255, key >> 16)]; near.set(key, o); }
        lastIn = key; lastOut = o;
      }
      u[i] = lastOut;
    }
  };
}
