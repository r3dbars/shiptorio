// The pixel canvas: the world is drawn into a small offscreen buffer at art resolution (one buffer pixel = one art
// pixel), then blown up onto the screen at a whole-number scale with smoothing off. That buffer is what makes code
// shapes and snapped pictures read as one piece of pixel art. Optional last step snaps every pixel to the palette.

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
  let k = 2, ox = 0, oy = 0, wu = 1; // wu = world units per buffer px after snapping
  const rgb = palette?.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  const near = new Map<number, number>();

  function quantize() {
    if (!rgb) return;
    const img = cx.getImageData(0, 0, buf.width, buf.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      let j = near.get(key);
      if (j === undefined) {
        let best = Infinity; j = 0;
        rgb.forEach(([r, g, b], n) => { const e = (r - d[i]) ** 2 + (g - d[i + 1]) ** 2 + (b - d[i + 2]) ** 2; if (e < best) { best = e; j = n; } });
        near.set(key, j);
      }
      [d[i], d[i + 1], d[i + 2]] = rgb[j]; d[i + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
  }

  return {
    get k() { return k; },
    begin(cam) {
      // whole device px per art px; the camera zoom snaps to the nearest one
      k = Math.max(1, Math.round(cam.s * artPx * (screen.width / screen.clientWidth || 1)));
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
