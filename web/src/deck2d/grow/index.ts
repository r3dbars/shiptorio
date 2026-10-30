// grow/ (thread "Animate the platform growing"): the floating platform starts SMALL (repo, planner, builder),
// bolts on a section to become MEDIUM (+ checks, review), then LARGE (+ gate, where the bridge to the rocket
// island meets it). launch/ owns the bridge, island and rocket; this layer owns the deck itself.
//
// Art: Justin's three decks, deck-small / deck-medium / deck-large.webp (no pipes / one steam pipe / two). Each
// sprite is a left part, a straight run of floor, and a right end cap. Growing into a size draws THAT size's art:
// its left part up to where the old deck ended, its end cap rolling out to the new edge, and the new floor built
// between from its straight middle, in stages (each one a DeckEvent for juice/):
//   beams   bare girders span the gap while the end cap rolls out
//   plates  floor plates drop in
//   rocks   the rock underside fuses on just under the new section
//   rails   back rail drops down, front rail rises
//   glow    the new seams glow gold, then cool
//   done    one dust puff as it locks in (the story caption says what changed)
import { ART_PX, PALETTE, snap, type ArtLoader, type CreateLayer, type DeckBus, type DeckLayer, type DeckView, type LayerSlot, HULL } from "../contract";
import { pixelOn } from "../../flags";
import { hullCols } from "../props/width";

export type DeckSize = "small" | "medium" | "large";
export type GrowPhase = "beams" | "plates" | "rocks" | "rails" | "glow" | "done";
const SIZES: DeckSize[] = ["small", "medium", "large"];

// ---------- the three decks ----------
// All numbers but s/dy are sprite pixels: cap = where the right end cap starts, floor = back edge .. front rail
// of the floor, skirt = bottom of the front iron skirt.
// s scales each one to fit its stations (small ~1000 wide holds builder, medium ~1700 holds review, large = the
// old 2039 so the bridge meets it at x 1905); dy puts every front rail at world y 318 so the belt (y 236) and
// the stations' feet stay put as it grows.
interface Geo { s: number; dy: number; w: number; h: number; cap: number; floor: [number, number]; skirt: number }
const FRONT_Y = 318;
const geo = (w: number, h: number, width: number, cap: number, floor: [number, number], skirt: number): Geo => {
  const s = width / w;
  return { s, dy: FRONT_Y - floor[1] * s, w, h, cap, floor, skirt };
};
export const DECKS: Record<DeckSize, Geo> = {
  small: geo(1413, 642, 1000, 1120, [112, 285], 400),
  medium: geo(2068, 596, 1700, 1700, [128, 278], 375),
  large: geo(2077, 517, 2039, 1690, [105, 248], 322),
};
const TILE = 80; // one new floor column, world px

// ---------- timeline, seconds from the start of a grow ----------
const T: Record<Exclude<GrowPhase, "done">, readonly [number, number]> = {
  beams: [0, 0.5], plates: [0.4, 1.3], rocks: [0.15, 0.9], rails: [1.2, 1.8], glow: [1.8, 2.3], // ~2.5s: the first run is serial
};
export const GROW_SECONDS = T.glow[1] + 0.1;
const SWAP = 0.2; // the old deck fades into the new size's art at the start
const FINISH: readonly [number, number] = [2.0, 2.4]; // stage art settles into the finished deck
const STAGE_ART = [0, 1, 2, 3].flatMap((i) => [`grow-section-${i}`, `grow-rock-${i}`, `grow-seam-${i}`]);
const PHASES = Object.keys(T) as Exclude<GrowPhase, "done">[];

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeBack = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
const span = (t: number, [a, b]: readonly [number, number]) => clamp01((t - a) / (b - a));
/** Item i of n inside window w, each item taking `len` of the window, left to right. */
const stag = (t: number, w: readonly [number, number], i: number, n: number, len = 0.35) =>
  clamp01((span(t, w) - (n <= 1 ? 0 : (i / (n - 1)) * (1 - len))) / len);

interface Puff { x: number; y: number; vx: number; vy: number; t: number; life: number; r: number }
interface Growth { from: DeckSize; to: DeckSize; t: number; fired: Set<string> }
type Band = "rail" | "floor" | "front" | "under";

export interface GrowLayer extends DeckLayer {
  readonly size: DeckSize;
  /** The size being grown into right now, or null. */
  readonly growing: DeckSize | null;
  /** Screenshots: jump to t seconds into a grow (no dust). */
  seek(from: DeckSize, to: DeckSize, t: number): void;
}

export function createGrow(art: ArtLoader, bus: DeckBus): GrowLayer {
  let size: DeckSize | null = null; // null until the first view says where we start (no grow on page load)
  let g: Growth | null = null;
  let growK = 0; // view.deck.growing: pixel mode grows the hull a column at a time (props/)
  let puffs: Puff[] = [];
  const queue: DeckSize[] = [];
  // Pixel mode (?px=1, contract "the pixel canvas"): the hulls are deck-<size>-px.webp, the same art downscaled to
  // 1 px = 1 art px and snapped to the 48 colors (scripts/pixel/pixelize.py). The growth is drawn in code on the
  // art grid: whole art px, palette colors, no fades.
  const PX = pixelOn();
  // props/ draws the hull itself in code in pixel mode; then this layer only keeps the camera bounds and the dust.
  const CODE_HULL = PX && Object.keys(import.meta.glob("../props/index.ts")).length > 0;
  const sprite = (z: DeckSize) => (PX ? `deck-${z}-px` : `deck-${z}`);
  const pxGeo: Partial<Record<DeckSize, Geo>> = {};
  /** The geometry for a size: in pixel mode, measured off the pixel hull once it has loaded. */
  function geoOf(z: DeckSize): Geo {
    const D = DECKS[z];
    if (!PX) return D;
    const done = pxGeo[z];
    if (done) return done;
    const im = art.get(sprite(z));
    if (!im) return D;
    const r = im.naturalWidth / D.w, q = (n: number) => Math.round(n * r);
    const floor: [number, number] = [q(D.floor[0]), q(D.floor[1])];
    return (pxGeo[z] = { s: 5, w: im.naturalWidth, h: im.naturalHeight, cap: q(D.cap), floor, skirt: q(D.skirt), dy: snap(FRONT_Y - floor[1] * 5) });
  }
  const capAt = (z: DeckSize) => geoOf(z).cap * geoOf(z).s; // world x where a size's end cap starts
  const endAt = (z: DeckSize) => geoOf(z).w * geoOf(z).s; // world x where it ends
  const capW = (z: DeckSize) => endAt(z) - capAt(z);
  for (const n of [...SIZES.map(sprite), ...(PX ? [] : [...STAGE_ART, "grow-crane"])]) art.get(n); // start loading now

  const now = () => size ?? "large";
  // where the old deck's floor stops and the new section starts: the new cap first sits where the old deck ended
  const seamX = (gr: Growth) => endAt(gr.from) - capW(gr.to);
  // the new deck's end cap, world x: it rolls out from the seam during beams
  const capX = () => {
    const x = g ? seamX(g) + (capAt(g.to) - seamX(g)) * easeBack(span(g.t, T.beams)) : capAt(now());
    return PX ? snap(x) : x;
  };
  const cols = (gr: Growth) => Math.max(1, Math.ceil((capAt(gr.to) - seamX(gr)) / TILE));

  // one soft dust puff along the new section when it locks in
  function puff(x0: number, x1: number, y: number) {
    for (let i = 0; i < 14; i++) {
      const x = x0 + ((i + Math.random()) / 14) * (x1 - x0);
      puffs.push({ x, y, vx: (Math.random() - 0.5) * 40, vy: -8 - Math.random() * 18, t: 0, life: 1 + Math.random() * 0.4, r: 14 + Math.random() * 12 });
    }
  }

  function want(target: DeckSize) {
    const head = queue.at(-1) ?? g?.to ?? now();
    if (target === head) return;
    if (SIZES.indexOf(target) < SIZES.indexOf(head)) { g = null; queue.length = 0; size = target; return; } // shrinking just snaps
    // one size at a time, so small -> large still gets the medium moment
    for (let i = SIZES.indexOf(head) + 1; i <= SIZES.indexOf(target); i++) queue.push(SIZES[i]);
  }

  function tick(dt: number, fx = true) {
    if (!g && queue.length) g = { from: now(), to: queue.shift()!, t: 0, fired: new Set() };
    if (g) {
      g.t += dt;
      for (const p of PHASES) if (!g.fired.has(p) && g.t >= T[p][0]) { g.fired.add(p); bus.emit({ type: "deck-grow", size: g.to, phase: p }); }
      if (g.t >= GROW_SECONDS) {
        if (fx) puff(seamX(g), capAt(g.to), wy(geoOf(g.to), geoOf(g.to).skirt));
        size = g.to; g = null;
        bus.emit({ type: "deck-grow", size, phase: "done" });
      }
    }
    for (const p of puffs) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    puffs = puffs.filter((p) => p.t < p.life);
  }

  function update(dt: number, v: DeckView) {
    const d = v.deck;
    const target: DeckSize = d?.size ?? "large";
    growK = d?.growing ?? 0;
    if (size === null) size = target;
    else want(target);
    tick(dt);
  }

  // ---------- drawing ----------
  const wy = (G: Geo, y: number) => G.dy + y * G.s; // sprite y -> world y
  const bandOf = (G: Geo, b: Band): [number, number] => {
    const u = G.s >= 5 ? 0.2 : 1; // the overlaps are in big-sprite px; a pixel hull needs about a fifth
    const o = (n: number) => Math.round(n * u);
    return b === "rail" ? [0, G.floor[0] + o(8)] : b === "floor" ? [G.floor[0], G.floor[1]] : b === "front" ? [G.floor[1] - o(12), G.skirt] : [G.skirt - o(10), G.h];
  };

  /** Sprite columns from sx (sprite px) drawn at world x, w world px wide: one band (or all), offset and faded. */
  function blit(ctx: CanvasRenderingContext2D, im: HTMLImageElement, G: Geo, sx: number, x: number, w: number,
    band: Band | null, dy = 0, alpha = 1) {
    const [y0, y1] = band ? bandOf(G, band) : [0, G.h];
    ctx.globalAlpha = alpha;
    ctx.drawImage(im, sx, y0, w / G.s, y1 - y0, x, wy(G, y0) + dy, w, (y1 - y0) * G.s);
    ctx.globalAlpha = 1;
  }
  const hash = (n: number) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  // the new size's own art at world x (its sprite already shows the finished deck)
  const srcAt = (G: Geo, x: number) => x / G.s;

  function drawWhole(ctx: CanvasRenderingContext2D, z: DeckSize, alpha = 1) {
    const im = art.get(sprite(z)), G = geoOf(z);
    if (im) blit(ctx, im, G, 0, 0, endAt(z), null, 0, alpha);
  }

  function drawDeck(ctx: CanvasRenderingContext2D) {
    if (CODE_HULL) return;
    if (!g) return drawWhole(ctx, now());
    const gr = g, G = geoOf(gr.to), im = art.get(sprite(gr.to));
    if (!im) return drawWhole(ctx, gr.from);
    const a = PX ? snap(seamX(gr)) : seamX(gr), cap = capX(), t = gr.t;
    blit(ctx, im, G, 0, 0, a, null); // the new art's left part, as far as the old deck reached
    if (!PX && STAGE_ART.every((n) => art.get(n))) drawStaged(ctx, gr, im, a, cap);
    else drawColumns(ctx, gr, im, a, cap);
    blit(ctx, im, G, G.cap, cap, capW(gr.to), null); // the end cap, wherever it is right now
    if (PX) return; // pixel mode: no crane picture, and the new hull swaps in whole (no fades on the art grid)
    drawCrane(ctx, gr, cap);
    if (t < SWAP) drawWhole(ctx, gr.from, 1 - t / SWAP); // the old art fades into the new
  }

  // Justin's stage art: the new section as its own module (beams -> plates -> rails + lanterns -> glowing), the rock
  // underside fusing in four steps under it, a glowing seam beam along its front; then it settles into the deck art.
  function drawStaged(ctx: CanvasRenderingContext2D, gr: Growth, im: HTMLImageElement, a: number, cap: number) {
    const G = DECKS[gr.to], t = gr.t, end = capAt(gr.to), w = end - a, k = G.s * 0.95;
    const ys = wy(G, G.skirt), yf = wy(G, G.floor[1]);
    const settle = span(t, FINISH); // 0..1: stage art fades into the finished deck
    const keep = 1 - settle * settle; // the stage art stays mostly solid while the deck fades in over it, so no sky shows through
    ctx.save();
    ctx.beginPath(); ctx.rect(a - 2, -400, cap - a + 4, 1600); ctx.clip(); // the frame only shows as far as the cap has rolled
    // rocks: rise from below and step through their four fusing frames
    const rk = span(t, T.rocks);
    if (rk > 0) {
      const f = art.get(`grow-rock-${Math.min(3, Math.floor(rk * 4))}`)!;
      const h = f.naturalHeight * k;
      ctx.globalAlpha = Math.min(1, rk * 5) * keep;
      ctx.drawImage(f, a, ys - 10 + (1 - easeOut(rk)) * 40, w, h); // close under the deck, never a ghost in the clouds
    }
    // the section: which frame, with a short cross-fade into the next
    const st = t < T.plates[0] + 0.1 ? 0 : t < T.rails[0] ? 1 : t < T.glow[0] ? 2 : 3;
    const next = [T.plates[0] + 0.1, T.rails[0], T.glow[0], Infinity][st];
    const fade = clamp01((t - (next - 0.15)) / 0.15);
    const sec = (i: number, al: number) => {
      const f = art.get(`grow-section-${i}`)!;
      const h = f.naturalHeight * k;
      ctx.globalAlpha = al * keep;
      ctx.drawImage(f, a - 6, ys + 8 - h, w + 12, h);
    };
    sec(st, 1);
    if (fade > 0 && st < 3) sec(st + 1, fade);
    // the seam beam along the front glows through its four frames
    const gk = span(t, T.glow);
    if (gk > 0 && gk < 1) {
      const f = art.get(`grow-seam-${Math.min(3, Math.floor(gk * 4))}`)!;
      ctx.globalAlpha = Math.sin(gk * Math.PI);
      const h = (ys - yf) * 1.15;
      ctx.drawImage(f, a, yf - 4, w, h);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    if (settle > 0) blit(ctx, im, G, srcAt(G, a), a, w, null, 0, settle); // the finished deck, exactly as its sprite
  }

  // No stage art yet: build the new floor from the finished deck's own columns.
  function drawColumns(ctx: CanvasRenderingContext2D, gr: Growth, im: HTMLImageElement, a: number, cap: number) {
    const G = geoOf(gr.to), n = cols(gr), t = gr.t;
    const off = (d: number) => (PX ? snap(d) : d), fade = (k: number) => (PX ? 1 : k); // whole art px, no fades on the grid
    // rock chunks drifting up toward the new section, before they fuse
    for (let i = 0; i < n; i++) {
      const k = stag(t, T.rocks, i, n, 0.5);
      if (k > 0 && k < 1) {
        const e = easeOut(k), x = a + i * TILE;
        blit(ctx, im, G, srcAt(G, x), x, Math.min(TILE, capAt(gr.to) - x), "under", off((1 - e) * 40), fade(Math.min(1, k * 5)));
      }
    }
    // beams: back + front girder, posts and a truss, out to wherever the cap is
    const yb = wy(G, G.floor[0]), yf = wy(G, G.floor[1]), ys = wy(G, G.skirt);
    if (PX && span(t, T.beams) > 0 && span(t, T.rails) < 1) drawBeamsPx(ctx, a, cap, yb, yf, ys);
    else if (span(t, T.beams) > 0 && span(t, T.rails) < 1) {
      const w = cap - a + 6;
      ctx.globalAlpha = 1 - span(t, T.rails);
      ctx.fillStyle = "#2a1d14"; ctx.fillRect(a, yb - 8, w, 10); ctx.fillRect(a, yf - 8, w, ys - yf);
      for (let x = a; x < cap; x += TILE) ctx.fillRect(x, yf, 12, ys - yf + 40); // posts down to where the rock will fuse
      ctx.fillStyle = "#4a3422"; ctx.fillRect(a, yb - 6, w, 3); ctx.fillRect(a, yf - 5, w, 4); ctx.fillRect(a, ys - 12, w, 3);
      ctx.strokeStyle = "#2a1d14"; ctx.lineWidth = 7;
      ctx.beginPath();
      for (let x = a; x < cap; x += TILE) { const x2 = Math.min(cap, x + TILE); ctx.moveTo(x, yb); ctx.lineTo(x2, yf - 8); ctx.moveTo(x2, yb); ctx.lineTo(x, yf - 8); }
      ctx.stroke();
      ctx.fillStyle = "#c79a4a"; // rivets
      for (let x = a; x < cap; x += TILE / 2) { ctx.fillRect(x, yb - 5, 3, 3); ctx.fillRect(x, yf - 2, 3, 3); ctx.fillRect(x, ys - 20, 3, 3); }
      ctx.globalAlpha = 1;
    }
    for (let i = 0; i < n; i++) {
      const x = a + i * TILE, w = Math.min(TILE, capAt(gr.to) - x) + (PX ? 0 : 1), sx = srcAt(G, x);
      if (w <= (PX ? 0 : 1)) continue;
      const ro = stag(t, T.rocks, i, n, 0.5); // fused rock
      if (PX && ro > 0 && ro < 1) { // one art px column at a time, so the leading edge is ragged rock, not a cut
        for (let c = 0; c * 5 < w; c++) if (ro >= 0.2 + 0.8 * hash(x / 5 + c)) blit(ctx, im, G, srcAt(G, x + c * 5), x + c * 5, 5, "under");
      } else if (ro >= 1) blit(ctx, im, G, sx, x, w, "under");
      const pk = stag(t, T.plates, i, n); // plates drop in
      if (pk > 0) blit(ctx, im, G, sx, x, w, "floor", off(-(1 - easeOut(pk)) * 60), fade(Math.min(1, pk * 3)));
      const rk = stag(t, T.rails, i, n, 0.5); // back rail drops, front rail rises
      if (rk > 0) {
        const e = PX ? easeOut(rk) : easeBack(rk), al = fade(Math.min(1, rk * 3));
        blit(ctx, im, G, sx, x, w, "rail", off(-(1 - e) * 70), al);
        blit(ctx, im, G, sx, x, w, "front", off((1 - e) * 50), al);
      }
    }
  }

  // pixel mode beams: dark cool steel, lit from the upper right, brass only as rivets (Justin's art direction).
  // Each girder shows a top face and a bevelled front face with panel seams, rivets (light px over dark px) with a
  // rust streak under every other one, and grime dithered along the bottom; posts are banded dark -> light left to
  // right, with X braces between them down to where the rock fuses
  function drawBeamsPx(ctx: CanvasRenderingContext2D, a: number, cap: number, yb: number, yf: number, ys: number) {
    const P = 5, St = PALETTE.steel, Ru = PALETTE.copper[0], Br = PALETTE.brass[4], S = PALETTE.soot[0], Gr = PALETTE.iron[0];
    const px = (x: number, y: number, c: string, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(x, y, w * P, h * P); };
    const cols = Math.round((cap - a) / P);
    const girder = (y: number, h: number) => { // h art px tall: 1 top-face row + front face
      px(a, y - P, S, cols, h + 2);
      px(a, y, St[3], cols); // top face, sunlit
      px(a, y + P, St[2], cols); // bevel: light inner top edge
      if (h > 3) px(a, y + 2 * P, St[1], cols, h - 3);
      for (let c = 0; c < cols; c++) px(a + c * P, y + (h - 1) * P, (c & 1) ? Gr : St[0]); // grime checker
      for (let c = 15; c < cols; c += 16) { px(a + c * P, y + P, St[0], 1, h - 2); px(a + (c + 1) * P, y + P, St[2], 1, h - 2); } // seams
      const ry = y + Math.max(1, (h >> 1) - 1) * P;
      for (let c = 3, k = 0; c < cols; c += 6, k++) {
        px(a + c * P, ry, Br); px(a + c * P, ry + P, St[0]); // rivet
        if (k & 1 && ry + 2 * P < y + (h - 1) * P) px(a + c * P, ry + 2 * P, Ru); // rust streak
      }
    };
    const [g0, g1, g2] = [snap(yb) - 2 * P, snap(yf) - 2 * P, snap(ys) - P], h1 = 5, top = g1 + (h1 + 1) * P;
    const posts: number[] = [];
    for (let x = a; x < cap - 4 * P; x += TILE) posts.push(x);
    // X braces first, so posts and girders sit on top of them
    for (let k = 0; k + 1 < posts.length; k++) {
      const x0 = posts[k] + 4 * P, x1 = posts[k + 1], n = Math.round((x1 - x0) / P), rows = Math.round((g2 - top) / P);
      for (let c = 0; c < n; c++) {
        const r = Math.round((c / Math.max(1, n - 1)) * (rows - 1));
        px(x0 + c * P, top + r * P, St[1]); px(x0 + c * P, top + (r + 1) * P, S);
        px(x0 + c * P, top + (rows - 1 - r) * P, St[2]); px(x0 + c * P, top + (rows - r) * P, S);
      }
    }
    for (const x of posts) {
      const rows = Math.round((g2 + 3 * P - g1) / P);
      px(x - P, g1, S, 6, rows + 1);
      St.forEach((c, k) => px(x + k * P, g1, c, 1, rows));
      px(x, g1 + rows * P - P, St[0], 4); // dark foot, it sinks into the rock
      for (let r = h1 + 3; r < rows - 2; r += 6) { px(x + 2 * P, g1 + r * P, Br); px(x + 2 * P, g1 + (r + 1) * P, St[0]); }
    }
    girder(g0, 3);
    girder(g1, h1);
  }

  // the crane stands on the far end of the end cap, arm out over the sky (never over a station), and is gone
  // before the rails go on
  function drawCrane(ctx: CanvasRenderingContext2D, gr: Growth, cap: number) {
    const c = art.get("grow-crane");
    if (!c) return;
    const t = gr.t, inK = span(t, [0.05, 0.35]), outK = span(t, [T.plates[1] - 0.25, T.plates[1]]);
    if (inK <= 0 || outK >= 1) return;
    const G = DECKS[gr.to], h = c.naturalHeight * G.s, w = c.naturalWidth * G.s;
    const feet = wy(G, G.floor[0]) + (wy(G, G.floor[1]) - wy(G, G.floor[0])) * 0.35, x = cap + capW(gr.to) * 0.55;
    ctx.save();
    ctx.globalAlpha = Math.min(inK * 2, 1 - outK);
    ctx.drawImage(c, x - w * 0.12, feet - h - (1 - easeOut(inK)) * 60 - outK * 40, w, h);
    ctx.restore();
  }

  function drawFront(ctx: CanvasRenderingContext2D) {
    if (PX) { // whole art px, solid haze, gone before it would need to fade
      ctx.fillStyle = PALETTE.haze[3];
      for (const p of puffs) if (p.t < p.life * 0.6) { const r = snap(p.r * (1 + p.t)); ctx.fillRect(snap(p.x - r / 2), snap(p.y - r / 2), r, r); }
      return;
    }
    for (const p of puffs) {
      const k = p.t / p.life, r = p.r * (1 + k * 1.5);
      ctx.fillStyle = `rgba(225,210,195,${0.5 * (1 - k)})`;
      ctx.fillRect(Math.round(p.x - r / 2), Math.round(p.y - r / 2), Math.round(r), Math.round(r));
    }
  }

  return {
    replaces: ["deck"],
    get size() { return now(); },
    get growing() { return g?.to ?? null; },
    update,
    draw(ctx: CanvasRenderingContext2D, slot: LayerSlot) {
      if (slot === "deck") drawDeck(ctx);
      else if (slot === "front") drawFront(ctx);
    },
    bounds() {
      // pixel mode's wide layout (contract DECK_DX): the full deck runs to HULL.x1, drawn by props/
      // pixel mode: props/ draws the hull a column at a time while view.deck.growing runs; the belt ends where it does
      if (PX) return { x0: -20, x1: hullCols(g ? g.to : now(), growK) * ART_PX + 20 };
      const deckEnd = g ? capX() + capW(g.to) : now() === "large" ? Math.max(endAt("large"), HULL.x1) : endAt(now());
      return { x0: -20, x1: deckEnd + 20 }; // just the deck; the engine frames the island itself once it's up
    },
    seek(from: DeckSize, to: DeckSize, t: number) {
      size = from; queue.length = 0; g = null; puffs = [];
      want(to);
      for (let s = 0; s + 1 / 60 <= t; s += 1 / 60) tick(1 / 60, false);
    },
  };
}

export const createLayer: CreateLayer = createGrow;
