import {
  ART_PX, BELT_Y, DECK_DX, DECK_END, HULL, snap, FLOOR_Y, LAUNCH_Y, LOOK, PALETTE, PALETTE_48, STOPS, STOP_X,
  type ArtLoader, type DeckBus, type DeckLayer, type DeckView, type Item, type LayerSlot, type ShippyModule, type StopId,
} from "../contract";
import { pixelOn } from "../../flags";
import { createPixelCanvas } from "./pixel";
import * as pd from "./pxdraw";
import { FLIGHT } from "../launch/flight";
import { BOILER_H, BOILER_W, boilerFrame } from "../../bakeoff/boiler2d";

// stations/ (its own thread) draws each machine in pixel code; until it lands, pixel mode shows the snapped webp.
type DrawStation = (cx: CanvasRenderingContext2D, id: StopId, state: string, t: number, x: number, feetY: number) => void;
const drawStation = (Object.values(import.meta.glob("../stations/index.ts", { eager: true }))[0] as { drawStation?: DrawStation } | undefined)?.drawStation;

// The deck renderer: sky, clouds, deck, bridge + rocket island, belt, stations, crates, rocket, camera.
// It draws whatever DeckView it's handed and animates the in-between (crates sliding stop to stop by item id,
// stations dropping in, the rocket going up), and emits DeckEvents for juice/ by diffing views.

const PAD = { x: 1905 + DECK_DX, y: -50, s: 0.72 }; // bridge + rocket island sprite; its bridge meets the deck's right edge
const BRIDGE_Y = PAD.y + PAD.s * 560;
const ORB = HULL.orb;
/** The twin boiler: in pixel mode it is drawn in code at full art size (bakeoff/boiler2d.ts), standing on the back
 * edge of the floor behind Repo and Planner; ?px=0 keeps the small boiler-on picture. */
const BOILER = { x: DECK_DX ? 280 : 240, base: 182 };
const BOUNDS = { x0: -20, x1: PAD.x + 1533 * PAD.s + 20, y0: -30, y1: DECK_DX ? 800 : 670 }; // pixel mode: the whole underside, lanterns and all
const SPEED = 170, GAP = 50, CRATE = 42;
// pixel mode: the lever stands on the floor in front of Review (Shippy pulls it from review + 150, facing left)
const LEVER = DECK_DX ? { x: STOP_X.review + 92, base: 330, h: 78 } : { x: STOP_X.review + 92, base: FLOOR_Y + 48, h: 78 };

// The belt: along the deck, down onto the bridge, out to the launch circle.
const PATH: [number, number][] = [[STOP_X.repo + 60, BELT_Y], [1915 + DECK_DX, BELT_Y], [1995 + DECK_DX, BRIDGE_Y], [STOP_X.launch - 130, BRIDGE_Y], [STOP_X.launch - 34, LAUNCH_Y]];
const SEGS: { ax: number; ay: number; bx: number; by: number; len: number; at: number; a: number }[] = [];
let PATH_LEN = 0;
for (let i = 1; i < PATH.length; i++) {
  const [ax, ay] = PATH[i - 1], [bx, by] = PATH[i], len = Math.hypot(bx - ax, by - ay);
  SEGS.push({ ax, ay, bx, by, len, at: PATH_LEN, a: Math.atan2(by - ay, bx - ax) });
  PATH_LEN += len;
}
const at = (d: number): [number, number] => {
  for (const g of SEGS) if (d <= g.at + g.len) { const t = (d - g.at) / g.len; return [g.ax + (g.bx - g.ax) * t, g.ay + (g.by - g.ay) * t]; }
  const g = SEGS[SEGS.length - 1]; return [g.bx, g.by];
};
const stopD = (s: StopId) => (s === "launch" ? PATH_LEN : STOP_X[s] - PATH[0][0]);

interface Crate { id: string; d: number; look: string; stop: StopId; fade: number }
interface Puff { x: number; y: number; vx: number; vy: number; t: number; life: number; r: number }

export interface Engine {
  frame(view: DeckView, dt: number): void;
  where(stop: StopId): { x: number; y: number }; // CSS pixels on screen
  focus(stop: StopId | null): void; // fly the camera there (null: back to automatic)
  seeAll(on: boolean): void;
  readonly portrait: boolean;
}

export function createEngine(cv: HTMLCanvasElement, art: ArtLoader, bus: DeckBus, shippy: ShippyModule, layers: DeckLayer[] = []): Engine {
  const owned = new Set(layers.flatMap((l) => l.replaces ?? []));
  const slot = (s: LayerSlot) => { for (const l of layers) l.draw(cx, s); };
  const screen = cv.getContext("2d")!;
  let cx = screen; // in pixel mode, the art-resolution buffer while the world draws
  // Pixel mode (contract: the pixel canvas): draw into a buffer at art resolution, blit at a whole-number scale,
  // snap every pixel to the 48 colors (?pq=0 skips the snap, for speed checks).
  const px = pixelOn() ? createPixelCanvas(cv, ART_PX, new URLSearchParams(location.search).get("pq") === "0" ? undefined : PALETTE_48) : null;
  const rehearsingShippy = new URLSearchParams(location.search).get("source") === "shippy-demo";
  const rehearsingMachines = new URLSearchParams(location.search).get("source") === "machine-demo";
  let W = 0, H = 0, DPR = 1, t = 0;
  const resize = () => { DPR = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); };
  addEventListener("resize", resize); resize();

  const crates = new Map<string, Crate>();
  const drop: Record<StopId, number> = Object.fromEntries(STOPS.map((s) => [s, 0])) as never;
  const puffs: Puff[] = [];
  const rocket = { y: 0, v: 0, mode: "ready" as "ready" | "count" | "up" | "away" | "down", t: 0 };
  let pendingLaunches = 0;
  let prev: DeckView | null = null, lever = 0;

  let deckW = DECK_END, islandUp = true, islandIn = true; // how much platform is built (deck.size / deck.island)

  // ---------- camera ----------
  const cam = { x: 1400, y: 300, s: 0.3, manual: 0, all: false, pin: null as StopId | null };
  const portrait = () => W / H <= 1.2;
  const grow = layers.find((l) => l.bounds);
  const builder = layers.find((l) => l.build)?.build;
  const deckEnd = () => grow?.bounds?.().x1 ?? deckW + 40;
  const right = () => islandUp ? Math.max(BOUNDS.x1, deckEnd()) : islandIn ? Math.max(BOUNDS.x1 + 170, deckEnd()) : deckEnd(); // the camera frames only what's been built (plus the crane while the island builds)
  const fitAll = () => {
    const bw = right() - BOUNDS.x0, bh = BOUNDS.y1 - BOUNDS.y0;
    return { x: (BOUNDS.x0 + right()) / 2, y: (BOUNDS.y0 + BOUNDS.y1) / 2 + 30, s: Math.min(W / bw, (H * 0.9) / bh, 1.1) };
  };
  // A tall phone would show the whole line tiny, so the camera parks on whatever matters (plan pick: left to right,
  // park on the bottleneck, one tap to see it all).
  function focusX(v: DeckView) {
    const pin = cam.pin ?? v.card?.stop ?? v.jam;
    if (pin) return STOP_X[pin] + (pin === "launch" ? -200 : 60);
    if (v.shippy.at !== "corner") return STOP_X[v.shippy.at] + 120;
    if (rocket.mode === "count" || rocket.mode === "up") return STOP_X.launch - 200;
    const fresh = STOPS.find((s) => s !== "launch" && drop[s] > 0 && drop[s] < 1);
    if (fresh) return STOP_X[fresh];
    let lead = 0; crates.forEach((c) => { lead = Math.max(lead, c.d); });
    return PATH[0][0] + lead;
  }
  function target(v: DeckView) {
    const all = fitAll();
    if (cam.all) return all;
    if (rehearsingMachines) {
      return { x: focusX(v), y: 225, s: Math.max(all.s, W / 1000) };
    }
    if (rehearsingShippy) {
      const actor = shippy as ShippyModule & { readonly state?: { x: number } };
      return { x: (actor.state?.x ?? focusX(v)) + 80, y: 225, s: Math.max(all.s, W / 1150) };
    }
    if (px && rocket.mode !== "ready") {
      return { x: STOP_X.launch - 70, y: 100, s: Math.max(all.s, W / 1100) };
    }
    // Desktop fits everything, except it leans in on a station while it's being built (construction reads small otherwise).
    const site = !portrait() && !v.card ? v.stops.find((x) => x.id !== "launch" && (x.building !== undefined || (x.built && layers.some((l) => l.owns?.(x))))) : undefined;
    if (!portrait() && !site) {
      // Pixel mode snaps the zoom to whole art px, so on a desktop the wide layout can come out wider than the screen.
      // Then frame the deck itself (the left end, the boiler bay, every stop), and slide right to the island only while
      // it's building or a rocket is going up.
      if (!px) return all;
      const k = Math.max(1, Math.round(all.s * ART_PX * DPR)), vw = W / (k / (ART_PX * DPR));
      if (vw >= right() - BOUNDS.x0) return all;
      const toIsland = (islandIn && !islandUp) || rocket.mode !== "ready";
      return { ...all, x: toIsland ? right() - vw / 2 : BOUNDS.x0 - 40 + vw / 2 };
    }
    const s = Math.max(all.s, W / (site ? 1300 : 1050)), half = W / 2 / s;
    if (site) return { x: Math.max(BOUNDS.x0 + half, Math.min(right() - half, STOP_X[site.id])), y: 230, s };
    return { x: Math.max(BOUNDS.x0 + half, Math.min(right() - half, focusX(v))), y: 250, s };
  }
  { const f = fitAll(); Object.assign(cam, f); }
  let first = true;

  // drag to pan, pinch or wheel to zoom
  const ptrs = new Map<number, [number, number]>(); let pinch = 0, moved = 0;
  cv.addEventListener("pointerdown", (e) => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; });
  cv.addEventListener("pointermove", (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    moved += Math.abs(e.clientX - p[0]) + Math.abs(e.clientY - p[1]);
    if (moved < 6) return;
    cam.manual = Infinity;
    if (ptrs.size === 1) { cam.x -= (e.clientX - p[0]) / cam.s; cam.y -= (e.clientY - p[1]) / cam.s; }
    else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / pinch);
      pinch = d;
    }
  });
  const up = (e: PointerEvent) => {
    ptrs.delete(e.pointerId); pinch = 0;
    if (moved < 6 && e.clientX < 110 && e.clientY < 110) { cam.manual = 0; cam.pin = null; } // tap Shippy: fly to what he's looking at
  };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", (e) => {
    e.preventDefault();
    cam.manual = Infinity;
    // Chromium exposes macOS trackpad pinches as small ctrl+wheel deltas.
    const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? H : 1);
    zoomAt(e.clientX, e.clientY, Math.exp(-delta * (e.ctrlKey ? 0.012 : 0.004)));
  }, { passive: false });
  // Safari/WKWebView use gesture events instead of ctrl+wheel for a trackpad pinch.
  let gestureScale = 1;
  cv.addEventListener("gesturestart", (e) => { e.preventDefault(); gestureScale = 1; cam.manual = Infinity; }, { passive: false });
  cv.addEventListener("gesturechange", (e) => {
    e.preventDefault();
    const gesture = e as Event & { scale: number; clientX?: number; clientY?: number };
    if (!(gesture.scale > 0)) return;
    zoomAt(gesture.clientX ?? W / 2, gesture.clientY ?? H / 2, gesture.scale / gestureScale);
    gestureScale = gesture.scale;
  }, { passive: false });
  cv.addEventListener("gestureend", (e) => { e.preventDefault(); gestureScale = 1; }, { passive: false });
  cv.addEventListener("dblclick", () => { cam.manual = 0; cam.pin = null; });
  function zoomAt(px: number, py: number, f: number) {
    const visibleScale = () => pixelOn() ? Math.max(1, Math.round(cam.s * ART_PX * DPR)) / (ART_PX * DPR) : cam.s;
    const before = visibleScale();
    const wx = cam.x + (px - W / 2) / before, wy = cam.y + (py - H / 2) / before;
    cam.s = Math.max(fitAll().s * 0.8, Math.min(1.6, cam.s * f));
    const after = visibleScale();
    cam.x = wx - (px - W / 2) / after; cam.y = wy - (py - H / 2) / after;
  }

  // ---------- views -> motion + events ----------
  function take(v: DeckView, dt: number) {
    const p = prev;
    for (const s of v.stops) {
      const was = p?.stops.find((x) => x.id === s.id);
      if (s.built && !was?.built) { if (p) bus.emit({ type: "station-built", stop: s.id }); else drop[s.id] = 1; }
      if (p && was && was.state !== s.state) bus.emit({ type: "station-state", stop: s.id, state: s.state });
      if (p && s.automated && !was?.automated) bus.emit({ type: "automated", stop: s.id });
      if (s.built && drop[s.id] < 1) {
        drop[s.id] = Math.min(1, drop[s.id] + dt * 2.2);
        if (drop[s.id] === 1 && s.id !== "launch") for (let i = 0; i < 10; i++) puffs.push({ x: STOP_X[s.id] + (Math.random() - 0.5) * 130, y: FLOOR_Y - 6, vx: (Math.random() - 0.5) * 90, vy: -10 - Math.random() * 30, t: 0, life: 0.9, r: 12 + Math.random() * 10 });
      }
    }
    if (p && v.jam && v.jam !== p.jam) bus.emit({ type: "jam", stop: v.jam });
    if (p && v.shippy.pose !== p.shippy.pose) bus.emit({ type: "shippy", pose: v.shippy.pose });
    if (px && owned.has("rocket")) {
      if (p && v.shipped > p.shipped) pendingLaunches += v.shipped - p.shipped;
      if (islandUp && pendingLaunches > 0 && rocket.mode === "ready") { pendingLaunches--; rocket.mode = "count"; rocket.t = 0; }
    } else if (p && islandUp && v.shipped > p.shipped && (rocket.mode === "ready" || rocket.mode === "down")) { rocket.mode = "count"; rocket.t = 0; }

    // crates: every item has a spot (its stop, minus its place in the queue); crates only ever slide forward
    const seen = new Set<string>();
    for (const s of v.stops) s.items.forEach((it, k) => {
      seen.add(it.id);
      let c = crates.get(it.id);
      if (!c) { c = { id: it.id, d: 0, look: it.look, stop: s.id, fade: 1 }; crates.set(it.id, c); }
      if (c.stop !== s.id) { c.stop = s.id; }
      c.look = it.look;
      const want = stopD(s.id) - k * GAP;
      const before = c.d;
      if (c.d < want) c.d = Math.min(want, c.d + SPEED * dt);
      if (before < want - 0.5 && c.d >= want - 0.5 && k === 0) bus.emit({ type: "crate-arrive", stop: s.id, id: it.id });
    });
    crates.forEach((c, id) => {
      if (seen.has(id)) return;
      if (c.stop === "launch" || c.d >= PATH_LEN - 60) { crates.delete(id); return; } // it went up with the rocket
      c.fade -= dt * 3; if (c.fade <= 0) crates.delete(id);
    });
    prev = v;
  }

  function rocketStep(dt: number) {
    rocket.t += dt;
    if (rocket.mode === "count" && rocket.t > 0.6) { rocket.mode = "up"; rocket.t = 0; rocket.v = 0; bus.emit({ type: "launch" }); }
    else if (px && owned.has("rocket")) {
      // Keep camera/event ownership in sync with the pixel layer's full return flight.
      if (rocket.mode === "up" && rocket.t >= FLIGHT.ignition + FLIGHT.ascent) { rocket.mode = "away"; rocket.t = 0; }
      else if (rocket.mode === "away" && rocket.t >= FLIGHT.coast) { rocket.mode = "down"; rocket.t = 0; }
      else if (rocket.mode === "down" && rocket.t >= FLIGHT.landing + FLIGHT.settle) { rocket.mode = "ready"; rocket.t = 0; }
    }
    else if (rocket.mode === "up") {
      rocket.v += 820 * dt; rocket.y -= rocket.v * dt;
      if (rocket.y > -400) for (let i = 0; i < 2; i++) puffs.push({ x: STOP_X.launch + (Math.random() - 0.5) * 60, y: LAUNCH_Y - 4, vx: (Math.random() - 0.5) * 140, vy: -10 - Math.random() * 20, t: 0, life: 1.3, r: 14 + Math.random() * 14 });
      if (rocket.y < -1500) { rocket.mode = "away"; rocket.t = 0; }
    } else if (rocket.mode === "away" && rocket.t > 0.7) { rocket.mode = "down"; rocket.y = -600; }
    else if (rocket.mode === "down") { rocket.y += -rocket.y * Math.min(1, dt * 5); if (Math.abs(rocket.y) < 1) { rocket.y = 0; rocket.mode = "ready"; } }
  }

  // ---------- drawing ----------
  const img = (n: string) => art.get(n);
  function put(name: string, x: number, base: number, h: number) {
    const im = img(name); if (!im) return 0;
    const w = im.naturalWidth * h / im.naturalHeight;
    cx.drawImage(im, x - w / 2, base - h, w, h);
    return w;
  }
  function glow(x: number, y: number, r: number, rgb: string, a: number, add = false) {
    const g = cx.createRadialGradient(x, y, 2, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
    if (add) cx.globalCompositeOperation = "lighter";
    cx.fillStyle = g; cx.fillRect(x - r, y - r, r * 2, r * 2);
    cx.globalCompositeOperation = "source-over";
  }
  // The sky picture has its cloud sea painted in from ~45% down (islands hang to ~57%), right where the deck hangs. In pixel mode we cut it
  // there and drop the sea below the deck (`floor` = screen y the sea must start under), with sunset haze in the gap,
  // so the deck floats in open air instead of sitting on the cloud tops.
  const SEA = 0.47, FADE = 0.05;
  let skyCut: { top: HTMLCanvasElement; sea: HTMLCanvasElement; haze: string } | null = null;
  function cutSky(sk: HTMLImageElement) {
    const nw = sk.naturalWidth, nh = sk.naturalHeight, cut = Math.round(nh * SEA), f = Math.round(nh * FADE);
    const part = (y0: number, y1: number, fadeTop: boolean) => {
      const c = document.createElement("canvas"); c.width = nw; c.height = y1 - y0;
      const g = c.getContext("2d")!; g.drawImage(sk, 0, y0, nw, y1 - y0, 0, 0, nw, y1 - y0);
      const m = g.createLinearGradient(0, fadeTop ? 0 : c.height - f, 0, fadeTop ? f * 2 : c.height);
      m.addColorStop(0, fadeTop ? "rgba(0,0,0,0)" : "#000"); m.addColorStop(1, fadeTop ? "#000" : "rgba(0,0,0,0)");
      g.globalCompositeOperation = "destination-in"; g.fillStyle = m; g.fillRect(0, 0, nw, c.height);
      return c;
    };
    return { top: part(0, cut + f, false), sea: part(cut - f, nh, true), haze: "#e0703a" };
  }
  // the haze between deck and sea: flat palette bands (bright glow up top, deeper orange toward the clouds) with a
  // checker dither between, plus a few long thin streaks of distant cloud. Exact palette colors so the quantizer
  // leaves it alone; cached per size since it never moves.
  let haze: HTMLCanvasElement | null = null;
  function hazeBand(W: number, H: number) {
    if (haze && haze.width === W && haze.height === H) return haze;
    haze = document.createElement("canvas"); haze.width = W; haze.height = H;
    const g = haze.getContext("2d")!, band = [PALETTE.sun[4], PALETTE.sun[3], PALETTE.sun[2], PALETTE.copper[2]];
    const bh = H / band.length;
    band.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, Math.round(i * bh), W, Math.ceil(bh) + 1); });
    for (let i = 1; i < band.length; i++) {
      const y = Math.round(i * bh); g.fillStyle = band[i - 1];
      for (let x = 0; x < W; x += 2) { g.fillRect(x, y, 1, 1); g.fillRect(x + 1, y + 1, 1, 1); }
    }
    let r = 7;
    const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 6; i++) { // a wisp: lit top row, wider body, shadowed belly
      const y = Math.round(bh * 0.8 + rnd() * (H - bh * 1.8)), x = Math.round(rnd() * W), w = Math.round(W * (0.03 + rnd() * 0.05));
      g.fillStyle = PALETTE.sun[5]; g.fillRect(x + 3, y, w - 6, 1);
      g.fillStyle = PALETTE.sun[4]; g.fillRect(x, y + 1, w, 2);
      g.fillStyle = PALETTE.copper[3]; g.fillRect(x + 2, y + 3, w - 4, 1);
    }
    return haze;
  }
  function sky(W: number, H: number, camS: number, floor?: number) {
    const sk = img("sky"); if (!sk) return;
    const s = Math.max(W / sk.naturalWidth, H / sk.naturalHeight) * 1.1, w = sk.naturalWidth * s, h = sk.naturalHeight * s;
    const ox = Math.max(-(w - W) / 2, Math.min((w - W) / 2, -(cam.x - 1400) * 0.04 * camS));
    const x = Math.round((W - w) / 2 + ox), y = Math.round((H - h) / 2);
    const drop = floor === undefined ? 0 : Math.round(Math.max(0, floor - (y + h * SEA)));
    if (!drop) { cx.drawImage(sk, x, y, Math.round(w), Math.round(h)); return; }
    skyCut ??= cutSky(sk);
    const cut = y + h * SEA, fh = h * FADE;
    const hy = Math.floor(cut - fh), hh = Math.ceil(drop + fh * 2) + 1;
    cx.drawImage(hazeBand(W, hh), 0, hy);
    cx.drawImage(skyCut.top, x, y, Math.round(w), Math.round(h * (SEA + FADE)));
    cx.drawImage(skyCut.sea, x, Math.round(cut - fh + drop), Math.round(w), Math.round(h * (1 - SEA + FADE)));
    if (y + drop + h < H) { cx.fillStyle = PALETTE.copper[1]; cx.fillRect(0, Math.floor(y + drop + h), W, H); }
  }
  function clouds(y: number, scale: number, speed: number, alpha: number) {
    const c = img("clouds"); if (!c) return;
    const w = c.naturalWidth * scale, h = c.naturalHeight * scale, off = ((t * speed) % (2 * w) + 2 * w) % (2 * w);
    cx.globalAlpha = alpha;
    let i = 0;
    for (let x = BOUNDS.x0 - 2 * w - off; x < BOUNDS.x1 + w * 2; x += w - 1, i++) {
      if (i % 2) { cx.save(); cx.translate(x + w, y); cx.scale(-1, 1); cx.drawImage(c, 0, 0, w, h); cx.restore(); } // mirror every other tile so seams meet
      else cx.drawImage(c, x, y, w, h);
    }
    cx.globalAlpha = 1;
  }
  // Pixel mode's cloud strips, in buffer px (screen space): sized to the frame, not the world, so a zoom doesn't
  // scale them with the deck; `par` is how much of the camera's pan they follow (far = small).
  const SEA_AT = 0.72;
  function farClouds(W: number, H: number, y: number, h: number, speed: number, par: number, alpha: number) {
    const c = img("clouds"); if (!c) return;
    const w = Math.round(c.naturalWidth * h / c.naturalHeight); h = Math.round(h);
    const off = (((t * speed + cam.x * par) / ART_PX) % (2 * w) + 2 * w) % (2 * w);
    cx.globalAlpha = alpha;
    let i = 0;
    for (let x = -off; x < W + w; x += w - 1, i++) {
      if (i % 2) { cx.save(); cx.translate(Math.round(x) + w, y); cx.scale(-1, 1); cx.drawImage(c, 0, 0, w, h); cx.restore(); }
      else cx.drawImage(c, Math.round(x), y, w, h);
    }
    cx.globalAlpha = 1;
  }
  function belt(v: DeckView) {
    const segs = islandUp ? SEGS : SEGS.slice(0, 1);
    if (px) {
      const blocked = v.stops.filter((s) => s.built && (s.state === "jammed" || s.id === v.jam)).map((s) => {
        const i = STOPS.indexOf(s.id), x = STOP_X[s.id];
        const left = i > 0 ? (STOP_X[STOPS[i - 1]] + x) / 2 : x - 200;
        const right = i < STOPS.length - 1 ? (x + STOP_X[STOPS[i + 1]]) / 2 : x + 200;
        return { left: Math.min(left, x - s.items.length * GAP - 60), right };
      });
      const blockedAt = (x: number) => blocked.some((zone) => x >= zone.left && x <= zone.right);
      for (const g of segs) pd.beltRun(cx, g.ax, g.ay, g.bx, g.by, islandUp ? g.len : Math.min(g.len, deckEnd() - 100 - g.ax), t, SPEED * 0.35, blockedAt);
      return;
    }
    const b = img("belt"); if (!b) return;
    const bh = 34, bw = b.naturalWidth * bh / b.naturalHeight, step = bw / 5; // the strip holds 5 chevron panels
    const off = (t * SPEED * 0.35) % step;
    for (const g of segs) {
      const len = islandUp ? g.len : Math.min(g.len, deckEnd() - 100 - g.ax);
      cx.save(); cx.translate(g.ax, g.ay); cx.rotate(g.a);
      cx.beginPath(); cx.rect(0, -bh / 2, len, bh); cx.clip();
      for (let x = off - step - bw; x < g.len; x += bw - 1) cx.drawImage(b, x, -bh / 2, bw, bh);
      cx.restore();
    }
  }
  function crate(c: Crate) {
    const [x, y] = at(c.d);
    if (px) { if (c.fade > 0.5) pd.crate(cx, x, y, c.look as Item["look"]); return; } // pixel art: no half-faded sprites
    if (c.look === "wait") glow(x, y - 18, 46, "255,70,50", 0.3);
    cx.globalAlpha = c.fade;
    put("crate-" + c.look, x, y + 12, CRATE);
    cx.globalAlpha = 1;
  }
  function station(v: DeckView, id: StopId) {
    const s = v.stops.find((x) => x.id === id)!;
    if (!s.built || id === "launch") return;
    if (layers.some((l) => l.owns?.(s))) return;
    const e = 1 - drop[id], fall = -420 * e * e; // drops in from the sky
    const bob = 0; // calm: working stations don't jitter; the belt and crates show the work
    const L = LOOK[id];
    cx.globalAlpha = Math.min(1, drop[id] * 3);
    if (px && drawStation) drawStation(cx, id, s.state, t, STOP_X[id], BELT_Y + L.drop + fall);
    else put(`${id}-${s.state}`, STOP_X[id], BELT_Y + L.drop + fall + bob, L.h);
    cx.globalAlpha = 1;
    if (s.state === "jammed") {
      // the one marker on the deck: a steady beacon with a slow breath, not a strobe
      const x = STOP_X[id], top = BELT_Y + L.drop - L.h;
      if (px) pd.beacon(cx, x, top, t);
      else { glow(x, top, 130, "255,60,40", 0.22 + 0.08 * Math.sin(t * 2.4)); put("beacon", x, top + 18, 54); }
      if (s.waiting && put("plate", x - 6, BELT_Y + 106, 52)) {
        cx.fillStyle = "#2b1a0a"; cx.textAlign = "center"; cx.textBaseline = "middle"; cx.font = "15px Silkscreen, monospace";
        const [a, b] = s.waiting.split(" ");
        cx.fillText(a, x - 6, BELT_Y + 71); if (b) cx.fillText(b, x - 6, BELT_Y + 88);
      }
    }
  }
  function leverDraw(v: DeckView) {
    const rv = v.stops.find((x) => x.id === "review")!;
    if (!rv.built) return;
    const e = 1 - drop.review, fall = -420 * e * e;
    if (prev && v.shippy.pose === "lever") lever = 0.4;
    const mode = lever > 0 ? "down" : rv.state === "jammed" ? "glow" : "up";
    if (px) pd.lever(cx, LEVER.x, LEVER.base + fall, mode);
    else put("lever-" + mode, LEVER.x, LEVER.base + fall, LEVER.h);
  }
  function rocketDraw() {
    const rk = img("rocket"), fl = img("flame");
    if (!rk || rocket.mode === "away" || !islandUp || owned.has("rocket")) return;
    const h = 220, w = rk.naturalWidth * h / rk.naturalHeight, y = LAUNCH_Y - h + 20 + rocket.y;
    if ((rocket.mode === "up" || rocket.mode === "count") && fl) {
      const fh = (rocket.mode === "count" ? 56 : 150) * (0.85 + Math.random() * 0.3), fw = fl.naturalWidth * 150 / fl.naturalHeight;
      cx.drawImage(fl, STOP_X.launch - fw / 2, y + h - 24, fw, fh);
    }
    cx.drawImage(rk, STOP_X.launch - w / 2 + (rocket.mode === "count" ? (Math.random() - 0.5) * 3 : 0), y, w, h);
  }
  function puffsDraw(dt: number) {
    for (const p of puffs) {
      p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt;
      const k = p.t / p.life, r = p.r * (1 + k * 1.5);
      cx.fillStyle = `rgba(225,210,195,${0.6 * Math.max(0, 1 - k)})`;
      cx.fillRect(Math.round(p.x - r / 2), Math.round(p.y - r / 2), Math.round(r), Math.round(r));
    }
    for (let i = puffs.length - 1; i >= 0; i--) if (puffs[i].t >= puffs[i].life) puffs.splice(i, 1);
  }

  function frame(v: DeckView, dt: number) {
    t += dt; lever = Math.max(0, lever - dt);
    take(v, dt); rocketStep(dt);
    if (performance.now() >= cam.manual) {
      const tg = target(v), k = first ? 1 : Math.min(1, dt * 1.8); first = false;
      cam.x += (tg.x - cam.x) * k; cam.y += (tg.y - cam.y) * k; cam.s += (tg.s - cam.s) * k;
    }
    for (const l of layers) l.update(dt, v);
    const act = builder?.shippyAct?.(); // a running build calls Shippy over to weld
    shippy.update(dt, act ? { pose: act.pose, at: act.at } : v.shippy);
    const quake = builder?.shake?.() ?? 0;

    const qx = (Math.random() - 0.5) * quake, qy = (Math.random() - 0.5) * quake;
    if (px) {
      cx = px.begin({ x: cam.x + qx, y: cam.y + qy, s: cam.s });
      const bw = cx.canvas.width, bh = cx.canvas.height, world = cx.getTransform();
      cx.setTransform(1, 0, 0, 1, 0, 0);
      cx.fillStyle = "#291b17"; cx.fillRect(0, 0, bw, bh);
      // The cloud sea is far away, so it lives in screen space: it starts at a fixed height (under the deck at the
      // usual framing) and only drifts with a slow parallax, so zooming or panning moves the deck over it, never with it.
      const floor = Math.round(bh * (portrait() ? SEA_AT + 0.04 : SEA_AT));
      sky(bw, bh, 1 / ART_PX, floor);
      farClouds(bw, bh, floor - Math.round(bh * 0.05), bh * 0.2, 5, 0.12, 0.85);
      farClouds(bw, bh, Math.round(bh * 0.86), bh * 0.3, 12, 0.3, 0.95);
      cx.setTransform(world);
    } else {
      cx.setTransform(DPR, 0, 0, DPR, 0, 0);
      cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = "high";
      cx.fillStyle = "#2a1410"; cx.fillRect(0, 0, W, H);
      sky(W, H, cam.s);
      cx.setTransform(DPR * cam.s, 0, 0, DPR * cam.s, DPR * (W / 2 - (cam.x + qx) * cam.s), DPR * (H / 2 - (cam.y + qy) * cam.s));
    }
    slot("sky-far");
    // pixel mode: the deck floats in open air (Justin: the clouds looked attached to it), so the cloud sea sits well
    // below the rocks and the orb; the near layer only fills the bottom of the frame
    if (!px) clouds(470, 1.1, 5, 0.85);
    // The platform grows (placeholder until Justin's small/medium deck art lands: the big deck, clipped).
    const dk = v.deck ?? { size: "large", island: "built" };
    const reach = { small: 0.42, medium: 0.7, large: 1 }[dk.size];
    deckW += ((reach + (dk.growing ?? 0) * 0.28) * DECK_END - deckW) * Math.min(1, dt * 3);
    const deck = img("deck");
    if (deck && !owned.has("deck")) { cx.save(); cx.beginPath(); cx.rect(-50, -100, deckW + 50, 900); cx.clip(); cx.drawImage(deck, 0, 0); cx.restore(); }
    const island = dk.island === "built" ? 1 : dk.island === "building" ? dk.islandProgress ?? 0 : 0;
    const pad = img("pad");
    if (pad && island > 0 && !owned.has("island")) {
      cx.globalAlpha = Math.min(1, island * 2);
      cx.drawImage(pad, PAD.x, PAD.y + (1 - island) * 260, pad.naturalWidth * PAD.s, pad.naturalHeight * PAD.s); // rises up out of the clouds
      cx.globalAlpha = 1;
    }
    islandUp = island >= 1; islandIn = island > 0;
    slot("deck");
    if (owned.has("boiler")) { /* props/ draws it */ }
    else if (px) cx.drawImage(boilerFrame(t), snap(BOILER.x - (BOILER_W * ART_PX) / 2), snap(BOILER.base - BOILER_H * ART_PX), BOILER_W * ART_PX, BOILER_H * ART_PX);
    else put("boiler-on", 112, 182, 168);
    if (!owned.has("orb")) glow(ORB.x, ORB.y, 100, "120,240,255", 0.32, true); // steady; nothing ambient pulses
    belt(v);
    slot("line");
    rocketDraw();
    crates.forEach(crate);
    for (const id of STOPS) station(v, id);
    slot("stations");
    leverDraw(v);
    shippy.drawWorld(cx);
    puffsDraw(dt);
    if (!px) clouds(600, 1.6, 12, 0.95); // pixel mode keeps every cloud behind the deck, so nothing ever touches it
    slot("front");
    if (px) { px.end(); cx = screen; cx.imageSmoothingEnabled = false; }
    cx.setTransform(DPR, 0, 0, DPR, 0, 0);
    shippy.drawCorner(cx, 14, 14, 76);
  }

  return {
    frame,
    where(stop) { return { x: W / 2 + (STOP_X[stop] - cam.x) * cam.s, y: H / 2 + ((stop === "launch" ? LAUNCH_Y : FLOOR_Y - 80) - cam.y) * cam.s }; },
    focus(stop) { cam.pin = stop; cam.manual = 0; },
    seeAll(on) { cam.all = on; cam.manual = 0; },
    get portrait() { return portrait(); },
  };
}
