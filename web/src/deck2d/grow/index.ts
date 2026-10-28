// grow/ (thread "Animate the platform growing"): the floating platform starts SMALL (repo, planner, builder),
// bolts on a section to become MEDIUM (+ checks, review), then LARGE (+ gate, where the bridge to the rocket
// island meets it). launch/ owns the bridge, island and rocket; this layer owns the deck itself.
//
// Placeholder art: all cut from deck.webp. Its middle (300..CAP_X) is a straight run of floor tiles, so a shorter
// deck = the left part up to `cut`, then the right end cap (CAP_X..2039) bolted on at `cut`. Growing slides the
// end cap out and builds the new floor between, in stages (each one a DeckEvent for juice/):
//   beams   bare girders span the gap while the end cap rolls out
//   plates  floor plates drop in tile by tile, sparks where each lands
//   rocks   rock chunks drift up out of the clouds and fuse underneath
//   rails   back rail drops down, front rail rises, lanterns light
//   glow    the new seams glow gold, then cool
//   done    "Platform upgraded" plaque pops
// When Justin's sheets land (small/medium/large decks, stage frames, rock underside, plaque), swap the cuts for
// real frames; the timeline and events stay the same.
import type { ArtLoader, CreateLayer, DeckBus, DeckLayer, DeckView, LayerSlot } from "../contract";
import { DECK } from "../contract";

export type DeckSize = "small" | "medium" | "large";
export type GrowPhase = "beams" | "plates" | "rocks" | "rails" | "glow" | "done";
const SIZES: DeckSize[] = ["small", "medium", "large"];

// ---------- layout, in deck-sprite pixels ----------
const CAP_X = 1700; // the deck's right end cap starts here; 300..1700 is straight floor that tiles
const CAP_W = DECK.w - CAP_X;
const TILE = 92; // one floor plate column
const BAND = { rail: [0, 98], floor: [98, 330], front: [300, 420], under: [410, 657] } as const;
/** Where the left part of the deck is cut for each size; large = the whole sprite. */
// (each cut sits the same distance past a floor seam as CAP_X does, so the plate grid runs on into the cap)
export const CUT: Record<DeckSize, number> = { small: 685, medium: 1211, large: CAP_X };
/** The bridge + rocket island sprite (launch/ draws it; the camera still has to fit it). */
const ISLAND_X1 = 1905 + 1533 * 0.72;

// ---------- timeline, seconds from the start of a grow ----------
const T: Record<Exclude<GrowPhase, "done">, readonly [number, number]> = {
  beams: [0, 0.9], plates: [0.7, 2.5], rocks: [1.2, 3.2], rails: [2.4, 3.4], glow: [3.3, 4.3],
};
export const GROW_SECONDS = T.glow[1] + 0.1;
const PLAQUE_SECONDS = 3;
const PHASES = Object.keys(T) as Exclude<GrowPhase, "done">[];

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeBack = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
const span = (t: number, [a, b]: readonly [number, number]) => clamp01((t - a) / (b - a));
/** Item i of n inside window w, each item taking `len` of the window, left to right. */
const stag = (t: number, w: readonly [number, number], i: number, n: number, len = 0.35) =>
  clamp01((span(t, w) - (n <= 1 ? 0 : (i / (n - 1)) * (1 - len))) / len);
/** Which column of deck.webp a world x on a grown floor copies from (tiles the straight middle). */
const srcX = (x: number) => (x < CAP_X ? x : 300 + ((x - 300) % (CAP_X - 300 - TILE)));

interface Spark { x: number; y: number; vx: number; vy: number; t: number; life: number; c: string }
interface Growth { from: DeckSize; to: DeckSize; t: number; fired: Set<string> }

export interface GrowLayer extends DeckLayer {
  readonly size: DeckSize;
  /** The size being grown into right now, or null. */
  readonly growing: DeckSize | null;
  /** Screenshots: jump to t seconds into a grow (no sparks). */
  seek(from: DeckSize, to: DeckSize, t: number): void;
}

export function createGrow(art: ArtLoader, bus: DeckBus): GrowLayer {
  let size: DeckSize | null = null; // null until the first view says where we start (no grow on page load)
  let g: Growth | null = null;
  let sparks: Spark[] = [];
  let plaque = { t: -1, size: "small" as DeckSize };
  let time = 0, island = 0; // island: 0..1 how much of the bridge + rocket island is up (for the camera)
  const queue: DeckSize[] = [];

  const cut = (s: DeckSize) => CUT[s];
  const now = () => size ?? "large";
  // the end cap's x right now: it rolls out during beams
  const capX = () => (g ? cut(g.from) + (cut(g.to) - cut(g.from)) * easeBack(span(g.t, T.beams)) : cut(now()));
  const cols = (gr: Growth) => Math.ceil((cut(gr.to) - cut(gr.from)) / TILE);

  function burst(x: number, y: number, n: number, gold = false) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, v = 120 + Math.random() * 260;
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.35 + Math.random() * 0.4,
        c: gold ? (Math.random() < 0.5 ? "#ffd36a" : "#fff3c4") : Math.random() < 0.6 ? "#ffb347" : "#fff6d8" });
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
      const t0 = g.t, n = cols(g), a = cut(g.from);
      g.t += dt;
      for (const p of PHASES) if (!g.fired.has(p) && g.t >= T[p][0]) { g.fired.add(p); bus.emit({ type: "deck-grow", size: g.to, phase: p }); }
      const hit = (w: readonly [number, number], i: number, at: number) => stag(t0, w, i, n) < at && stag(g!.t, w, i, n) >= at;
      if (fx) for (let i = 0; i < n; i++) {
        const x = a + i * TILE + TILE / 2;
        if (hit(T.plates, i, 1)) burst(x, 215, 10);
        if (hit(T.rocks, i, 1)) burst(x, 430, 6);
        if (hit(T.glow, i, 0.5)) burst(x, 110 + Math.random() * 200, 3, true);
      }
      if (g.t >= GROW_SECONDS) {
        size = g.to; g = null;
        bus.emit({ type: "deck-grow", size, phase: "done" });
        plaque = { t: 0, size };
      }
    }
    if (plaque.t >= 0 && (plaque.t += dt) > PLAQUE_SECONDS) plaque.t = -1;
    for (const s of sparks) { s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 900 * dt; }
    sparks = sparks.filter((s) => s.t < s.life);
  }

  function update(dt: number, v: DeckView) {
    const d = v.deck;
    const target: DeckSize = d?.size ?? "large";
    if (size === null) size = target;
    else want(target);
    const isl = !d || d.island === "built" ? 1 : d.island === "building" ? d.islandProgress ?? 0 : 0;
    island = isl; // the engine (or launch/) already eases the island up; the camera follows it
    tick(dt);
  }

  // ---------- drawing ----------
  function blit(ctx: CanvasRenderingContext2D, im: HTMLImageElement, sx: number, x: number, w: number,
    band: readonly [number, number], dy: number, alpha: number) {
    const [y0, y1] = band;
    ctx.globalAlpha = alpha;
    ctx.drawImage(im, sx, y0, w, y1 - y0, x, y0 + dy, w, y1 - y0);
    ctx.globalAlpha = 1;
  }
  function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, a: number) {
    const gr = ctx.createRadialGradient(x, y, 2, x, y, r);
    gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
  }

  function drawDeck(ctx: CanvasRenderingContext2D) {
    const deck = art.get("deck");
    if (!deck) return;
    const cap = capX(), done = g ? cut(g.from) : cut(now()), h = deck.naturalHeight;
    if (g) drawRising(ctx, deck);
    ctx.drawImage(deck, 0, 0, done, h, 0, 0, done, h); // the part that's already built
    if (g) drawSection(ctx, deck, done, cap);
    ctx.drawImage(deck, CAP_X, 0, CAP_W, h, cap, 0, CAP_W, h); // the end cap, wherever it is right now
  }

  // rock chunks drifting up toward the new section before they fuse
  function drawRising(ctx: CanvasRenderingContext2D, deck: HTMLImageElement) {
    const gr = g!, n = cols(gr), a = cut(gr.from);
    for (let i = 0; i < n; i++) {
      const k = stag(gr.t, T.rocks, i, n, 0.5);
      if (k <= 0 || k >= 1) continue;
      const e = easeOut(k), x = a + i * TILE, w = Math.min(TILE, cut(gr.to) - x);
      blit(ctx, deck, srcX(x), x, w, BAND.under, (1 - e) * 360 + Math.sin(time * 2 + i) * 6 * (1 - e), Math.min(1, k * 4));
    }
  }

  function drawSection(ctx: CanvasRenderingContext2D, deck: HTMLImageElement, a: number, cap: number) {
    const gr = g!, t = gr.t, n = cols(gr), end = cut(gr.to);
    // beams: back + front girder and a truss, out to wherever the cap is
    if (span(t, T.beams) > 0 && span(t, T.rails) < 1) {
      const w = cap - a + 6;
      ctx.globalAlpha = 1 - span(t, T.rails);
      ctx.fillStyle = "#2a1d14"; ctx.fillRect(a, 92, w, 10); ctx.fillRect(a, 300, w, 46); // back girder, front skirt girder
      for (let x = a; x < cap; x += TILE) ctx.fillRect(x, 300, 12, 110); // posts down to where the rock will fuse
      ctx.fillStyle = "#4a3422"; ctx.fillRect(a, 94, w, 3); ctx.fillRect(a, 303, w, 4); ctx.fillRect(a, 338, w, 3);
      ctx.strokeStyle = "#2a1d14"; ctx.lineWidth = 7;
      ctx.beginPath();
      for (let x = a; x < cap; x += TILE) { ctx.moveTo(x, 102); ctx.lineTo(Math.min(cap, x + TILE), 300); ctx.moveTo(Math.min(cap, x + TILE), 102); ctx.lineTo(x, 300); }
      ctx.stroke();
      ctx.fillStyle = "#c79a4a"; // rivets
      for (let x = a; x < cap; x += TILE / 2) { ctx.fillRect(x, 95, 3, 3); ctx.fillRect(x, 306, 3, 3); ctx.fillRect(x, 324, 3, 3); }
      ctx.globalAlpha = 1;
    }
    for (let i = 0; i < n; i++) {
      const x = a + i * TILE, w = Math.min(TILE, end - x), sx = srcX(x);
      if (stag(t, T.rocks, i, n, 0.5) >= 1) blit(ctx, deck, sx, x, w, BAND.under, 0, 1); // fused rock
      const pk = stag(t, T.plates, i, n); // plates drop in
      if (pk > 0) blit(ctx, deck, sx, x, w, BAND.floor, -(1 - easeOut(pk)) * 60, Math.min(1, pk * 3));
      const rk = stag(t, T.rails, i, n, 0.5); // back rail drops, front rail rises
      if (rk > 0) {
        const e = easeBack(rk), al = Math.min(1, rk * 3);
        blit(ctx, deck, sx, x, w, BAND.rail, -(1 - e) * 70, al);
        blit(ctx, deck, sx, x, w, BAND.front, (1 - e) * 50, al);
        if (rk > 0.6 && rk < 1) glow(ctx, x + w / 2, 60, 50, "255,180,80", (1 - rk) * 2); // lantern flicks on
      }
    }
    const gk = span(t, T.glow); // gold seams light up, then cool
    if (gk > 0 && gk < 1) {
      const al = Math.sin(gk * Math.PI);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = `rgba(255,205,90,${0.85 * al})`; ctx.lineWidth = 4;
      ctx.shadowColor = "rgba(255,200,80,0.9)"; ctx.shadowBlur = 18;
      ctx.beginPath();
      for (const x of [a, cap]) { ctx.moveTo(x, 100); ctx.lineTo(x, 320); } // where old meets new, and new meets the cap
      for (let x = a + TILE; x < cap; x += TILE) { ctx.moveTo(x, 110); ctx.lineTo(x, 315); }
      for (const y of [150, 205, 260]) { ctx.moveTo(a, y); ctx.lineTo(cap, y); }
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawFront(ctx: CanvasRenderingContext2D) {
    for (const s of sparks) {
      ctx.globalAlpha = 1 - s.t / s.life;
      ctx.fillStyle = s.c;
      ctx.fillRect(Math.round(s.x - 2), Math.round(s.y - 2), 5, 5);
    }
    ctx.globalAlpha = 1;
    if (plaque.t >= 0) drawPlaque(ctx);
  }

  // "Platform upgraded", in screen pixels at the top centre
  function drawPlaque(ctx: CanvasRenderingContext2D) {
    const t = plaque.t, cv = ctx.canvas, w = cv.clientWidth || cv.width, h = cv.clientHeight || cv.height, dpr = cv.width / w;
    const pop = t < 0.35 ? easeBack(t / 0.35) : 1, out = clamp01((PLAQUE_SECONDS - t) / 0.4);
    const pw = Math.min(340, w - 32), ph = 76;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = out;
    ctx.translate(w / 2, Math.max(64, h * 0.14));
    ctx.scale(pop, pop);
    const plate = art.get("plate");
    if (plate) ctx.drawImage(plate, -pw / 2, -ph / 2, pw, ph);
    else { ctx.fillStyle = "#c99a4c"; ctx.fillRect(-pw / 2, -ph / 2, pw, ph); }
    const sx = -pw / 2 - 60 + clamp01(t / 0.9) * (pw + 120); // one gold shine sweeps across
    const gr = ctx.createLinearGradient(sx - 40, 0, sx + 40, 0);
    gr.addColorStop(0, "rgba(255,240,180,0)"); gr.addColorStop(0.5, "rgba(255,240,180,0.6)"); gr.addColorStop(1, "rgba(255,240,180,0)");
    ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = gr; ctx.fillRect(-pw / 2 + 8, -ph / 2 + 8, pw - 16, ph - 16);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#2b1a0a"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "16px Silkscreen, monospace"; ctx.fillText("PLATFORM UPGRADED", 0, -9);
    ctx.font = "11px Silkscreen, monospace"; ctx.fillText(`${plaque.size.toUpperCase()} DECK`, 0, 14);
    ctx.restore();
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
      const deckEnd = capX() + CAP_W;
      return { x0: -20, x1: deckEnd + 20 + island * Math.max(0, ISLAND_X1 - deckEnd) };
    },
    seek(from: DeckSize, to: DeckSize, t: number) {
      size = from; queue.length = 0; g = null; sparks = []; plaque.t = -1;
      want(to);
      for (let s = 0; s + 1 / 60 <= t; s += 1 / 60) tick(1 / 60, false);
    },
  };
}

export const createLayer: CreateLayer = createGrow;
