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
//   rocks   rock chunks drift up out of the clouds and fuse underneath
//   rails   back rail drops down, front rail rises
//   glow    the new seams glow gold, then cool
//   done    one dust puff as it locks in (the story caption says what changed)
import type { ArtLoader, CreateLayer, DeckBus, DeckLayer, DeckView, LayerSlot } from "../contract";

export type DeckSize = "small" | "medium" | "large";
export type GrowPhase = "beams" | "plates" | "rocks" | "rails" | "glow" | "done";
const SIZES: DeckSize[] = ["small", "medium", "large"];

// ---------- the three decks ----------
// All numbers but s/dy are sprite pixels: cap = where the right end cap starts, floor = back edge .. front rail
// of the floor, skirt = bottom of the front iron skirt.
// s scales each one to fit its stations (small ~1000 wide holds builder, medium ~1500 holds review, large = the
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
  medium: geo(2068, 596, 1500, 1700, [128, 278], 375),
  large: geo(2077, 517, 2039, 1690, [105, 248], 322),
};
const sprite = (z: DeckSize) => `deck-${z}`;
const capAt = (z: DeckSize) => DECKS[z].cap * DECKS[z].s; // world x where a size's end cap starts
const endAt = (z: DeckSize) => DECKS[z].w * DECKS[z].s; // world x where it ends
const capW = (z: DeckSize) => endAt(z) - capAt(z);
const TILE = 80; // one new floor column, world px

// ---------- timeline, seconds from the start of a grow ----------
const T: Record<Exclude<GrowPhase, "done">, readonly [number, number]> = {
  beams: [0, 0.9], plates: [0.7, 2.5], rocks: [1.2, 3.2], rails: [2.4, 3.4], glow: [3.3, 4.3],
};
export const GROW_SECONDS = T.glow[1] + 0.1;
const SWAP = 0.25; // the old deck fades into the new size's art at the start
const FINISH: readonly [number, number] = [3.8, 4.3]; // stage art settles into the finished deck
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
  let puffs: Puff[] = [];
  let time = 0;
  const queue: DeckSize[] = [];
  for (const n of [...SIZES.map(sprite), ...STAGE_ART, "grow-crane"]) art.get(n); // start loading now

  const now = () => size ?? "large";
  // where the old deck's floor stops and the new section starts: the new cap first sits where the old deck ended
  const seamX = (gr: Growth) => endAt(gr.from) - capW(gr.to);
  // the new deck's end cap, world x: it rolls out from the seam during beams
  const capX = () => (g ? seamX(g) + (capAt(g.to) - seamX(g)) * easeBack(span(g.t, T.beams)) : capAt(now()));
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
    time += dt;
    if (!g && queue.length) g = { from: now(), to: queue.shift()!, t: 0, fired: new Set() };
    if (g) {
      g.t += dt;
      for (const p of PHASES) if (!g.fired.has(p) && g.t >= T[p][0]) { g.fired.add(p); bus.emit({ type: "deck-grow", size: g.to, phase: p }); }
      if (g.t >= GROW_SECONDS) {
        if (fx) puff(seamX(g), capAt(g.to), wy(DECKS[g.to], DECKS[g.to].skirt));
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
    if (size === null) size = target;
    else want(target);
    tick(dt);
  }

  // ---------- drawing ----------
  const wy = (G: Geo, y: number) => G.dy + y * G.s; // sprite y -> world y
  const bandOf = (G: Geo, b: Band): [number, number] =>
    b === "rail" ? [0, G.floor[0] + 8] : b === "floor" ? [G.floor[0], G.floor[1]] : b === "front" ? [G.floor[1] - 12, G.skirt] : [G.skirt - 10, G.h];

  /** Sprite columns from sx (sprite px) drawn at world x, w world px wide: one band (or all), offset and faded. */
  function blit(ctx: CanvasRenderingContext2D, im: HTMLImageElement, G: Geo, sx: number, x: number, w: number,
    band: Band | null, dy = 0, alpha = 1) {
    const [y0, y1] = band ? bandOf(G, band) : [0, G.h];
    ctx.globalAlpha = alpha;
    ctx.drawImage(im, sx, y0, w / G.s, y1 - y0, x, wy(G, y0) + dy, w, (y1 - y0) * G.s);
    ctx.globalAlpha = 1;
  }
  // the new size's own art at world x (its sprite already shows the finished deck)
  const srcAt = (G: Geo, x: number) => x / G.s;

  function drawWhole(ctx: CanvasRenderingContext2D, z: DeckSize, alpha = 1) {
    const im = art.get(sprite(z)), G = DECKS[z];
    if (im) blit(ctx, im, G, 0, 0, endAt(z), null, 0, alpha);
  }

  function drawDeck(ctx: CanvasRenderingContext2D) {
    if (!g) return drawWhole(ctx, now());
    const gr = g, G = DECKS[gr.to], im = art.get(sprite(gr.to));
    if (!im) return drawWhole(ctx, gr.from);
    const a = seamX(gr), cap = capX(), t = gr.t;
    blit(ctx, im, G, 0, 0, a, null); // the new art's left part, as far as the old deck reached
    if (STAGE_ART.every((n) => art.get(n))) drawStaged(ctx, gr, im, a, cap);
    else drawColumns(ctx, gr, im, a, cap);
    blit(ctx, im, G, G.cap, cap, capW(gr.to), null); // the end cap, wherever it is right now
    drawCrane(ctx, gr, cap);
    if (t < SWAP) drawWhole(ctx, gr.from, 1 - t / SWAP); // the old art fades into the new
  }

  // Justin's stage art: the new section as its own module (beams -> plates -> rails + lanterns -> glowing), the rock
  // underside fusing in four steps under it, a glowing seam beam along its front; then it settles into the deck art.
  function drawStaged(ctx: CanvasRenderingContext2D, gr: Growth, im: HTMLImageElement, a: number, cap: number) {
    const G = DECKS[gr.to], t = gr.t, end = capAt(gr.to), w = end - a, k = G.s * 0.95;
    const ys = wy(G, G.skirt), yf = wy(G, G.floor[1]);
    const settle = span(t, FINISH); // 0..1: stage art fades into the finished deck
    ctx.save();
    ctx.beginPath(); ctx.rect(a - 2, -400, cap - a + 4, 1600); ctx.clip(); // the frame only shows as far as the cap has rolled
    // rocks: rise from below and step through their four fusing frames
    const rk = span(t, T.rocks);
    if (rk > 0) {
      const f = art.get(`grow-rock-${Math.min(3, Math.floor(rk * 4))}`)!;
      const h = f.naturalHeight * k;
      ctx.globalAlpha = Math.min(1, rk * 3) * (1 - settle);
      ctx.drawImage(f, a, ys - 10 + (1 - easeOut(rk)) * 200, w, h);
    }
    // the section: which frame, with a short cross-fade into the next
    const st = t < T.plates[0] + 0.2 ? 0 : t < T.rails[0] ? 1 : t < T.glow[0] ? 2 : 3;
    const next = [T.plates[0] + 0.2, T.rails[0], T.glow[0], Infinity][st];
    const fade = clamp01((t - (next - 0.15)) / 0.15);
    const sec = (i: number, al: number) => {
      const f = art.get(`grow-section-${i}`)!;
      const h = f.naturalHeight * k;
      ctx.globalAlpha = al * (1 - settle);
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
    const G = DECKS[gr.to], n = cols(gr), t = gr.t;
    // rock chunks drifting up toward the new section, before they fuse
    for (let i = 0; i < n; i++) {
      const k = stag(t, T.rocks, i, n, 0.5);
      if (k > 0 && k < 1) {
        const e = easeOut(k), x = a + i * TILE;
        blit(ctx, im, G, srcAt(G, x), x, Math.min(TILE, capAt(gr.to) - x), "under", (1 - e) * 360 + Math.sin(time * 2 + i) * 6 * (1 - e), Math.min(1, k * 4));
      }
    }
    // beams: back + front girder, posts and a truss, out to wherever the cap is
    const yb = wy(G, G.floor[0]), yf = wy(G, G.floor[1]), ys = wy(G, G.skirt);
    if (span(t, T.beams) > 0 && span(t, T.rails) < 1) {
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
      const x = a + i * TILE, w = Math.min(TILE, capAt(gr.to) - x) + 1, sx = srcAt(G, x);
      if (w <= 1) continue;
      if (stag(t, T.rocks, i, n, 0.5) >= 1) blit(ctx, im, G, sx, x, w, "under"); // fused rock
      const pk = stag(t, T.plates, i, n); // plates drop in
      if (pk > 0) blit(ctx, im, G, sx, x, w, "floor", -(1 - easeOut(pk)) * 60, Math.min(1, pk * 3));
      const rk = stag(t, T.rails, i, n, 0.5); // back rail drops, front rail rises
      if (rk > 0) {
        const e = easeBack(rk), al = Math.min(1, rk * 3);
        blit(ctx, im, G, sx, x, w, "rail", -(1 - e) * 70, al);
        blit(ctx, im, G, sx, x, w, "front", (1 - e) * 50, al);
      }
    }
  }

  // the crane stands on the far end of the end cap, arm out over the sky (never over a station), and is gone
  // before the rails go on
  function drawCrane(ctx: CanvasRenderingContext2D, gr: Growth, cap: number) {
    const c = art.get("grow-crane");
    if (!c) return;
    const t = gr.t, inK = span(t, [0.1, 0.6]), outK = span(t, [T.plates[1] - 0.4, T.plates[1]]);
    if (inK <= 0 || outK >= 1) return;
    const G = DECKS[gr.to], h = c.naturalHeight * G.s, w = c.naturalWidth * G.s;
    const feet = wy(G, G.floor[0]) + (wy(G, G.floor[1]) - wy(G, G.floor[0])) * 0.35, x = cap + capW(gr.to) * 0.55;
    ctx.save();
    ctx.globalAlpha = Math.min(inK * 2, 1 - outK);
    ctx.drawImage(c, x - w * 0.12, feet - h - (1 - easeOut(inK)) * 60 - outK * 40, w, h);
    ctx.restore();
  }

  function drawFront(ctx: CanvasRenderingContext2D) {
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
      const deckEnd = g ? capX() + capW(g.to) : endAt(now());
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
