// The pixel canvas: the world is drawn into a small offscreen buffer at art resolution (one buffer pixel = one art
// pixel), then blown up onto the screen at a whole-number scale with smoothing off. That buffer is what makes code
// shapes and snapped pictures read as one piece of pixel art. Optional last step snaps every pixel to the palette.

import { pixelZoom } from "./camera";

export interface PixelCanvas {
  /** Start a frame. cam is in world units (x, y = what's centered, s = screen px per world unit). */
  begin(cam: { x: number; y: number; s: number }, fine?: boolean): CanvasRenderingContext2D;
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
  // fine: a camera move in flight (the tour's Ken Burns pull back over the city). The buffer is drawn at the whole k under
  // the true scale, then laid on the screen at the true scale and offset, smoothed, so the move glides instead of
  // stepping k and snapping a buffer px at a time. At rest the picture is the usual whole-k one.
  let fine = 0, dx = 0, dy = 0;
  const rgb = palette?.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  // Each palette color as one opaque RGBA word in this machine's byte order, so a snapped pixel is a single write.
  const word = new Uint32Array(rgb?.length ?? 0);
  rgb?.forEach(([r, g, b], n) => new Uint8Array(word.buffer, n * 4, 4).set([r, g, b, 255]));
  const near = new Map<number, number>();
  // A small direct-mapped table in front of near: a moving picture changes color most pixels, and a typed-array probe
  // is much cheaper than a Map lookup. Same answers (it only remembers what near says).
  const hitKey = new Int32Array(1 << 16).fill(-1), hitIdx = new Uint8Array(1 << 16);

  function quantize() {
    if (!rgb) return;
    const img = cx.getImageData(0, 0, buf.width, buf.height), d = img.data, out = new Uint32Array(d.buffer, d.byteOffset, d.length >> 2);
    // Neighbouring pixels are usually the same color, so the last answer is reused before asking the map. The test is
    // on the whole 32-bit pixel (one read, not four), so a run costs one compare a pixel; alpha only matters when 0.
    let lastRaw = -1, lastWord = 0;
    for (let p = 0; p < out.length; p++) {
      const raw = out[p];
      if (raw === lastRaw) { out[p] = lastWord; continue; }
      const i = p << 2;
      if (d[i + 3] === 0) continue;
      const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      const h = Math.imul(key, 0x9e3779b1) >>> 16;
      let j: number | undefined;
      if (hitKey[h] === key) j = hitIdx[h];
      else {
        j = near.get(key);
        if (j === undefined) {
          let best = Infinity; j = 0;
          for (let n = 0; n < rgb.length; n++) { const [r, g, b] = rgb[n], e = (r - d[i]) ** 2 + (g - d[i + 1]) ** 2 + (b - d[i + 2]) ** 2; if (e < best) { best = e; j = n; } }
          near.set(key, j);
        }
        hitKey[h] = key; hitIdx[h] = j;
      }
      lastRaw = raw; lastWord = word[j];
      out[p] = lastWord;
    }
    cx.putImageData(img, 0, 0);
  }

  return {
    get k() { return k; },
    begin(cam, smooth = false) {
      const dpr = screen.width / screen.clientWidth || 1, exact = cam.s * artPx * dpr;
      wu = artPx;
      if (smooth && exact > 0) {
        fine = exact; k = Math.max(1, Math.floor(exact)); initialized = true;
        const bw = Math.ceil(screen.width / k) + 2, bh = Math.ceil(screen.height / k) + 2;
        if (buf.width !== bw || buf.height !== bh) { buf.width = bw; buf.height = bh; }
        const c = cam.x / wu, r = cam.y / wu; // the screen's middle, in buffer px
        ox = Math.floor(c - screen.width / 2 / exact) - 1; oy = Math.floor(r - screen.height / 2 / exact) - 1;
        dx = (ox - c) * exact + screen.width / 2; dy = (oy - r) * exact + screen.height / 2;
      } else {
        fine = 0;
        // whole device px per art px; the camera zoom snaps to the nearest one
        k = pixelZoom(exact, initialized ? k : undefined);
        initialized = true;
        const bw = Math.ceil(screen.width / k), bh = Math.ceil(screen.height / k);
        if (buf.width !== bw || buf.height !== bh) { buf.width = bw; buf.height = bh; }
        // snap the camera to whole art px so edges don't shimmer
        ox = Math.round(cam.x / wu - bw / 2); oy = Math.round(cam.y / wu - bh / 2);
      }
      cx.setTransform(1, 0, 0, 1, 0, 0);
      cx.clearRect(0, 0, buf.width, buf.height);
      cx.imageSmoothingEnabled = false;
      cx.setTransform(1 / wu, 0, 0, 1 / wu, -ox, -oy);
      return cx;
    },
    end() {
      quantize();
      out.setTransform(1, 0, 0, 1, 0, 0);
      if (fine) { out.imageSmoothingEnabled = true; out.imageSmoothingQuality = "high"; out.drawImage(buf, dx, dy, buf.width * fine, buf.height * fine); return; }
      out.imageSmoothingEnabled = false;
      out.drawImage(buf, 0, 0, buf.width * k, buf.height * k);
    },
    toWorld(x, y) {
      const dpr = screen.width / screen.clientWidth || 1;
      if (fine) return [((x * dpr - dx) / fine + ox) * wu, ((y * dpr - dy) / fine + oy) * wu];
      return [((x * dpr) / k + ox) * wu, ((y * dpr) / k + oy) * wu];
    },
  };
}
