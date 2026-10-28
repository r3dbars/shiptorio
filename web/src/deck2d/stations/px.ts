import { IDX, NAMES, RGB, type Color } from "./palette";

// Edge light: the rim of a shape that faces the sun (up or right, open to the sky) is one step lighter along its
// material's ramp, the rim facing away one step darker. It is what makes a flat sprite read as a lit solid.
const CHAINS: Color[][] = [
  ["soot", "iron-0", "steel-0", "iron-1", "steel-1", "iron-2", "steel-2", "iron-3", "iron-4", "haze-2"],
  ["brass-0", "brass-1", "brass-2", "brass-3", "brass-4", "brass-5"],
  ["copper-0", "copper-1", "copper-2", "copper-3"],
  ["plate-0", "plate-1", "plate-2", "plate-3", "plate-4"],
  ["sun-0", "sun-1", "sun-2", "sun-3", "sun-4", "sun-5", "sun-6"],
  ["haze-0", "haze-1", "haze-2", "haze-3"],
];
const UP = new Uint8Array(NAMES.length).map((_, i) => i), DOWN = new Uint8Array(NAMES.length).map((_, i) => i);
for (const ch of CHAINS) ch.forEach((c, i) => {
  const step = ch.length > 8 ? 2 : 1; // the interleaved iron chain moves two places to make one visible step
  UP[IDX[c]] = IDX[ch[Math.min(ch.length - 1, i + step)]];
  DOWN[IDX[c]] = IDX[ch[Math.max(0, i - step)]];
});

// A tiny indexed pixel grid. Stations draw into it with whole art pixels and palette colors only, then it bakes
// to a canvas the engine blits at integer scale. No arcs, no anti-aliasing; light-layer glows are the one exception
// (palette colors at 25/50/75%), baked into the same canvas.

const EMPTY = 255;
interface Glow { x: number; y: number; w: number; h: number; c: Color; a: number; spill: boolean; hole?: [number, number, number, number] }

export class Px {
  readonly d: Uint8Array;
  readonly glows: Glow[] = [];
  constructor(readonly w: number, readonly h: number) {
    this.d = new Uint8Array(w * h).fill(EMPTY);
  }
  set(x: number, y: number, c: Color) {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = IDX[c];
  }
  has(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && this.d[y * this.w + x] !== EMPTY;
  }
  rect(x: number, y: number, w: number, h: number, c: Color) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  hline(x: number, y: number, w: number, c: Color) { this.rect(x, y, w, 1, c); }
  vline(x: number, y: number, h: number, c: Color) { this.rect(x, y, 1, h, c); }
  /** A 1px line between two points (Bresenham). */
  line(x0: number, y0: number, x1: number, y1: number, c: Color) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }
  /** 1px border of a rect. */
  box(x: number, y: number, w: number, h: number, c: Color) {
    this.hline(x, y, w, c); this.hline(x, y + h - 1, w, c); this.vline(x, y, h, c); this.vline(x + w - 1, y, h, c);
  }
  /** Filled pixel circle centred on (cx, cy); use .5 centres for even sizes. */
  disc(cx: number, cy: number, r: number, c: Color) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) this.set(x, y, c);
  }
  ring(cx: number, cy: number, r: number, c: Color) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const d = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
        if (d <= r * r && d > (r - 1) * (r - 1)) this.set(x, y, c);
      }
  }
  /** Light layer: a palette color at 25/50/75% over the machine's own pixels (spill: also over empty ones, for
   * contact shadows on the deck right under the machine). */
  glow(x: number, y: number, w: number, h: number, c: Color, a: 0.25 | 0.5 | 0.75, spill = false) {
    this.glows.push({ x, y, w, h, c, a, spill });
  }
  /** Light layer, round: a disc of glow (approximated with rows of rects). */
  glowDisc(cx: number, cy: number, r: number, c: Color, a: 0.25 | 0.5 | 0.75, hole?: [number, number, number, number]) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      const dy = y + 0.5 - cy, half = Math.sqrt(Math.max(0, r * r - dy * dy));
      if (half < 0.5) continue;
      const x0 = Math.round(cx - half), x1 = Math.round(cx + half);
      this.glows.push({ x: x0, y, w: x1 - x0, h: 1, c, a, spill: false, hole });
    }
  }
  /** 1px soot outline around the outside of everything drawn so far (selective outlining: inner lines are the
   * station's own dark ramp colors). Leave a 1px margin when drawing so it fits. */
  outline(c: Color = "soot") {
    const { w, h, d } = this, out: number[] = [];
    const lit: number[] = [], shade: number[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (d[y * w + x] === EMPTY) continue;
      if (!this.has(x + 1, y) || !this.has(x, y - 1)) lit.push(y * w + x);
      else if (!this.has(x - 1, y) || !this.has(x, y + 1)) shade.push(y * w + x);
    }
    for (const i of lit) d[i] = UP[d[i]];
    for (const i of shade) d[i] = DOWN[d[i]];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (d[y * w + x] !== EMPTY) continue;
      if (this.has(x - 1, y) || this.has(x + 1, y) || this.has(x, y - 1) || this.has(x, y + 1)) out.push(y * w + x);
    }
    for (const i of out) d[i] = IDX[c];
  }
  /** Bake to a canvas exactly w x h: palette pixels opaque, glows blended on top of them. */
  bake(): HTMLCanvasElement {
    const cv = document.createElement("canvas");
    cv.width = this.w; cv.height = this.h;
    const cx = cv.getContext("2d")!, im = cx.createImageData(this.w, this.h), p = im.data;
    for (let i = 0; i < this.d.length; i++) {
      const k = this.d[i];
      if (k === EMPTY) continue;
      const [r, g, b] = RGB[k];
      p[i * 4] = r; p[i * 4 + 1] = g; p[i * 4 + 2] = b; p[i * 4 + 3] = 255;
    }
    for (const gl of this.glows) {
      const [r, g, b] = RGB[IDX[gl.c]];
      for (let y = gl.y; y < gl.y + gl.h; y++) for (let x = gl.x; x < gl.x + gl.w; x++) {
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
        const o = (y * this.w + x) * 4;
        if (gl.hole && x >= gl.hole[0] && y >= gl.hole[1] && x < gl.hole[0] + gl.hole[2] && y < gl.hole[1] + gl.hole[3]) continue; // the lamp itself stays crisp
        if (p[o + 3] === 0) {
          if (!gl.spill) continue; // glows stay on the machine; only shadows reach the deck
          p[o] = r; p[o + 1] = g; p[o + 2] = b; p[o + 3] = Math.round(gl.a * 255);
          continue;
        }
        if (p[o + 3] < 255) continue;
        p[o] = r * gl.a + p[o] * (1 - gl.a);
        p[o + 1] = g * gl.a + p[o + 1] * (1 - gl.a);
        p[o + 2] = b * gl.a + p[o + 2] * (1 - gl.a);
      }
    }
    cx.putImageData(im, 0, 0);
    return cv;
  }
}

/** A view of a grid with its origin moved, so a station can be laid out in the coordinates it was traced in. */
export function shift(g: Px, ox: number, oy: number): Px {
  const v = Object.create(g) as Px;
  v.set = (x, y, c) => g.set(x + ox, y + oy, c);
  v.has = (x, y) => g.has(x + ox, y + oy);
  v.glow = (x, y, w, h, c, a, spill) => g.glow(x + ox, y + oy, w, h, c, a, spill);
  v.glowDisc = (x, y, r, c, a, hole) => g.glowDisc(x + ox, y + oy, r, c, a, hole && [hole[0] + ox, hole[1] + oy, hole[2], hole[3]]);
  return v;
}
