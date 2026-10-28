import { LAUNCH, type ArtLoader, type CreateLayer, type DeckBus, type DeckLayer, type DeckView, type LayerSlot } from "../contract";
import { pixelOn } from "../../flags";
import type { Preview } from "./preview";
import { createPixelLaunch } from "./px";
import { LAUNCH_BUILD_SECONDS, clamp01, crossed, easeBack, easeInOut, easeOut, phaseAt, span, through } from "./timeline";

// launch/: you earn the rocket. The island rises out of the clouds, a bridge is laid out to it from the deck, a
// launch tower goes up on its ring, and the first rocket is lowered in on the tower's hook. Driven by
// view.deck.island + islandProgress (timeline.ts maps progress to the picture); emits launch-stage events for juice/.
// Owns the island outright (replaces "island"); once the build is done the engine's own rocket takes over at the
// same spot. Dev: /launch.html plays it alone on a quiet deck with a play button + scrubber (page.ts, preview.ts);
// /deck.html?launch=preview sends you there.
//
// Art: Justin's stage sheets, cut by slice-art.py into launch-<island|bridge|tower>-<0..3>.webp. Frames in a set
// share one height and stay registered, so stepping through them is the animation; this file adds the motion
// between frames (rise, drop-ins, crossfades), the dust/sparks/rocks, and the rocket on its cable.

// Where each set sits in the world (frame px -> world: x + px * s). Tuned against the engine's belt
// (bridge deck at BRIDGE_Y 353) and launch spot (rocket feet at LAUNCH.y + 20).
const RING = { x: LAUNCH.x, y: LAUNCH.y + 14 }; // middle of the landing ring on the island top
const ISLAND = { s: 1, ringX: 265, ringY: 118 }; // island-3's ring centre, frame px
const BRIDGE = { x: 1958, s: 1.04, deckY: 205 }; // left end meets the deck; deckY = where its floor is, frame px
const BRIDGE_Y = 353;
const TOWER = { s: 0.66, padY: 535 }; // tower frames' pad centre, frame px (x = frame centre)
const ROCKET_H = 220; // same size and spot as the engine's rocket, so the hand-off is invisible
const CLOUD_Y = 640; // the island comes up through here; nothing below it is drawn
const HOT = "255,170,60";

interface Bit { x: number; y: number; vx: number; vy: number; t: number; life: number; r: number; kind: "rock" | "dust" | "spark" }
type Place = (im: HTMLImageElement) => [number, number, number];

export const createLayer: CreateLayer = (art, bus) => {
  if (new URLSearchParams(location.search).get("launch") === "preview") location.replace(`/launch.html${location.search}`);
  return pixelOn() ? createPixelLaunch(art, bus, null) : createLaunchLayer(art, bus, null); // ?px=1: the pixel deck (px.ts)
};

/** The layer itself; preview (launch.html) drives progress directly instead of reading it from the view. */
export function createLaunchLayer(art: ArtLoader, bus: DeckBus, preview: Preview | null): DeckLayer {
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let p = -1, t = 0, seatedFlash = 0, upFlash = 0;
  const bits: Bit[] = [];
  let cx!: CanvasRenderingContext2D;

  const img = (n: string) => art.get(n);
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const spawn = (n: number, f: () => Omit<Bit, "t">) => { if (reduced) n = Math.ceil(n / 4); for (let i = 0; i < n && bits.length < 360; i++) bits.push({ ...f(), t: 0 }); };
  const sparks = (x: number, y: number, n = 14) => spawn(n, () => ({ x, y, vx: rnd(-220, 220), vy: rnd(-260, -40), life: rnd(0.3, 0.6), r: rnd(2, 4), kind: "spark" }));
  const dust = (x0: number, x1: number, y: number, n = 10) => spawn(n, () => ({ x: rnd(x0, x1), y, vx: rnd(-60, 60), vy: rnd(-40, -5), life: rnd(0.8, 1.4), r: rnd(12, 26), kind: "dust" }));

  // ---------- frames ----------
  /** Which frame of a set shows at u, given where each frame takes over; blend = 0..1 into the next. */
  function frameAt(u: number, starts: number[], fade = 0.06): { k: number; blend: number } {
    let k = 0;
    for (let i = 1; i < starts.length; i++) if (u >= starts[i]) k = i;
    const next = starts[k + 1];
    return { k, blend: next === undefined ? 0 : span(u, next - fade, next) };
  }
  const ISLAND_AT = [0, 0.3, 0.6, 0.86], BRIDGE_AT = [0, 0.25, 0.55, 0.8], TOWER_AT = [0, 1 / 3, 2 / 3];

  /** Frame k, with frame k+1 fading in on top by blend. */
  function drawSet(name: string, k: number, blend: number, place: Place) {
    const base = cx.globalAlpha;
    for (const [i, a] of [[k, 1], [k + 1, blend]] as const) {
      const im = img(`launch-${name}-${i}`); if (!im || a <= 0) continue;
      const [x, y, s] = place(im);
      cx.globalAlpha = base * a;
      cx.drawImage(im, x, y, im.naturalWidth * s, im.naturalHeight * s);
    }
    cx.globalAlpha = base;
  }
  const islandPlace = (dy: number): Place => (im) =>
    [RING.x - (ISLAND.ringX - 251 + im.naturalWidth / 2) * ISLAND.s, RING.y - ISLAND.ringY * ISLAND.s + dy, ISLAND.s];
  const bridgePlace: Place = () => [BRIDGE.x, BRIDGE_Y - BRIDGE.deckY * BRIDGE.s, BRIDGE.s];
  const towerPlace = (dy: number): Place => (im) => [RING.x - (im.naturalWidth / 2) * TOWER.s, RING.y - TOWER.padY * TOWER.s + dy, TOWER.s];
  /** World x of the right end of a bridge frame (where the next piece lands). */
  const bridgeEnd = (k: number) => BRIDGE.x + (img(`launch-bridge-${k}`)?.naturalWidth ?? 600) * BRIDGE.s;
  /** The gantry hook (tower-2's hanging lamp), world. */
  const hook = () => { const w = img("launch-tower-2")?.naturalWidth ?? 450; return { x: RING.x - (w / 2 - 228) * TOWER.s, y: RING.y - (TOWER.padY - 232) * TOWER.s }; };

  function riseOffset(u: number) { // on top of the frames' own rise: keep it moving between steps, then clunk
    if (u < 0.86) return 120 * (1 - easeOut(u / 0.86));
    return -10 * Math.sin(span(u, 0.86, 0.95) * Math.PI);
  }

  // ---------- update ----------
  function update(dt: number, view: DeckView) {
    t += dt;
    let target: number;
    if (preview) {
      target = preview.step(dt / LAUNCH_BUILD_SECONDS);
      // dev only: tell the engine the same thing, so its belt and rocket wait for the build like a real story would
      view.deck = { ...(view.deck ?? { size: "large" }), island: target >= 1 ? "built" : target > 0 ? "building" : "none", islandProgress: target };
    } else {
      const d = view.deck;
      target = !d || d.island === "built" ? 1 : d.island === "building" ? clamp01(d.islandProgress ?? 0) : 0;
    }
    const was = p;
    if (p < 0 || target < p || preview) p = target; // first frame, a reset or a scrub: jump
    else p = Math.min(target, p + dt / 6); // a big jump forward still plays, just quicker
    if (was >= 0 && p > was) cues(was, p);
    for (const b of bits) { b.t += dt; b.x += b.vx * dt; b.y += b.vy * dt; if (b.kind !== "dust") b.vy += (b.kind === "rock" ? 900 : 600) * dt; else b.vx *= 0.98; }
    for (let i = bits.length - 1; i >= 0; i--) if (bits[i].t >= bits[i].life) bits.splice(i, 1);
    seatedFlash = Math.max(0, seatedFlash - dt); upFlash = Math.max(0, upFlash - dt);

    const { phase, u } = phaseAt(p);
    if (phase === "rise" && u < 0.86 && Math.random() < dt * 40) { // rocks fall off the bottom, cloud churns at the waterline
      spawn(1, () => ({ x: rnd(RING.x - 200, RING.x + 200), y: Math.min(CLOUD_Y - 10, RING.y + 220 + riseOffset(u)), vx: rnd(-30, 30), vy: rnd(0, 80), life: 1.2, r: rnd(3, 8), kind: "rock" }));
      if (Math.random() < 0.5) dust(RING.x - 260, RING.x + 260, CLOUD_Y - 60, 1);
    }
  }
  function cues(a: number, b: number) {
    for (const c of crossed(a, b)) {
      bus.emit({ type: "launch-stage", stage: c.stage });
      if (c.stage === "island-up") { upFlash = 1.2; dust(RING.x - 250, RING.x + 250, RING.y + 120, 24); }
      if (c.stage === "rocket-seated") { seatedFlash = 1; dust(LAUNCH.x - 90, LAUNCH.x + 90, LAUNCH.y + 10, 16); sparks(LAUNCH.x, LAUNCH.y, 10); }
      if (c.stage === "tower") dust(RING.x - 150, RING.x + 150, RING.y + 30, 10);
    }
    // each new bridge frame lands with a burst at its far end
    const ba = through(a, "bridge"), bb = through(b, "bridge");
    for (let k = 1; k < 4; k++) if (ba < BRIDGE_AT[k] && bb >= BRIDGE_AT[k]) { const x = bridgeEnd(k); sparks(x - 30, BRIDGE_Y - 20, 8); dust(x - 160, x, BRIDGE_Y + 20, 5); }
  }

  // ---------- drawing ----------
  function glow(x: number, y: number, r: number, a: number, sy = 1) {
    if (a <= 0) return;
    cx.save(); cx.translate(x, y); cx.scale(1, sy);
    const g = cx.createRadialGradient(0, 0, 1, 0, 0, r);
    g.addColorStop(0, `rgba(${HOT},${a})`); g.addColorStop(1, `rgba(${HOT},0)`);
    cx.globalCompositeOperation = "lighter"; cx.fillStyle = g; cx.fillRect(-r, -r, r * 2, r * 2);
    cx.restore();
  }
  function drawIsland() {
    const { phase, u } = phaseAt(p);
    if (phase === "none") return;
    if (phase !== "rise") { drawSet("island", 3, 0, islandPlace(0)); return; }
    const { k, blend } = frameAt(u, ISLAND_AT);
    const shake = reduced || u > 0.86 ? 0 : Math.sin(t * 61) * 3 * (1 - u);
    cx.save(); cx.beginPath(); cx.rect(RING.x - 600, -2000, 1200, CLOUD_Y + 2000); cx.clip();
    cx.translate(shake, 0);
    if (k === 0) cx.globalAlpha = span(u, 0, 0.08); // the tip fades up out of the cloud
    drawSet("island", k, blend, islandPlace(riseOffset(u)));
    cx.globalAlpha = 1;
    cx.restore();
    glow(RING.x, RING.y, 160, span(u, 0.86, 0.92) * 0.6 + upFlash * 0.4, 0.3);
  }
  function drawBridge() {
    const b = through(p, "bridge"); if (b <= 0) return;
    const { k, blend } = frameAt(b, BRIDGE_AT);
    if (k > 0) { drawSet("bridge", k, blend, bridgePlace); return; }
    const im = img("launch-bridge-0"); if (!im) return; // the stub slides out of the deck edge
    const w = im.naturalWidth * BRIDGE.s * easeOut(span(b, 0, 0.12));
    cx.save(); cx.beginPath(); cx.rect(BRIDGE.x - 20, -1000, w + 20, 3000); cx.clip();
    drawSet("bridge", 0, blend, bridgePlace);
    cx.restore();
  }
  function drawTower() {
    const u = through(p, "tower"); if (u <= 0) return;
    const { k } = frameAt(u, TOWER_AT, 0);
    const l = span(u, TOWER_AT[k], TOWER_AT[k + 1] ?? 1);
    if (k === 0) { // the pad drops onto the ring and clunks
      cx.globalAlpha = span(l, 0, 0.15);
      drawSet("tower", 0, 0, towerPlace(-260 * (1 - easeBack(span(l, 0, 0.5)))));
      cx.globalAlpha = 1;
      return;
    }
    // pillars, then the gantry, rise out of the pad: the new frame is revealed bottom-up over the old one
    drawSet("tower", k - 1, 0, towerPlace(0));
    const im = img(`launch-tower-${k}`); if (!im) return;
    const [x, y, s] = towerPlace(0)(im), w = im.naturalWidth * s, h = im.naturalHeight * s, padTop = RING.y - 30;
    const front = padTop - (padTop - y) * easeOut(span(l, 0, 0.7));
    cx.save(); cx.beginPath(); cx.rect(x - 10, front, w + 20, y + h - front); cx.clip();
    cx.drawImage(im, x, y, w, h);
    cx.restore();
    if (l < 0.7) glow(RING.x, front, 150, 0.4, 0.15);
  }
  function drawRing() {
    const { phase } = phaseAt(p);
    if (phase === "none" || phase === "rise" || p >= 1) return;
    glow(RING.x, RING.y, 150, 0.15 + 0.08 * Math.sin(t * 3) + seatedFlash * 0.6, 0.3);
  }
  /** The rocket, hanging off the gantry hook, lowered onto the pad. Same art and size as the engine's. */
  function drawRocket() {
    const r = through(p, "rocket"); if (r <= 0 || p >= 1) return;
    const rk = img("rocket"); if (!rk) return;
    const h = hook(), seated = LAUNCH.y + 20 - ROCKET_H, hang = Math.min(h.y + 16, seated);
    let top: number, sway = 0;
    if (r < 0.6) { const l = span(r, 0, 0.6); top = -900 + (hang + 900) * easeOut(l); sway = reduced ? 0 : Math.sin(l * Math.PI * 4) * (1 - l) * 0.1; }
    else if (r < 0.66) top = hang;
    else if (r < 0.86) top = hang + (seated - hang) * easeInOut(span(r, 0.66, 0.86));
    else top = seated + (r < 0.9 ? Math.sin(span(r, 0.86, 0.9) * Math.PI) * 4 : 0);
    const w = rk.naturalWidth * ROCKET_H / rk.naturalHeight;
    if (r < 0.9) { cx.strokeStyle = "#0c0a0b"; cx.lineWidth = 3; cx.beginPath(); cx.moveTo(h.x, h.y); cx.lineTo(LAUNCH.x, top); cx.stroke(); }
    cx.save(); cx.translate(LAUNCH.x, top); cx.rotate(sway);
    cx.drawImage(rk, -w / 2, 0, w, ROCKET_H);
    cx.restore();
  }
  function drawBits() {
    for (const b of bits) {
      const k = b.t / b.life;
      if (b.kind === "rock") { cx.fillStyle = "#2a1e18"; cx.fillRect(b.x - b.r / 2, b.y - b.r / 2, b.r, b.r); }
      else if (b.kind === "spark") { cx.fillStyle = `rgba(255,${200 - 120 * k | 0},80,${1 - k})`; cx.fillRect(b.x - b.r / 2, b.y - b.r / 2, b.r, b.r); }
      else { cx.fillStyle = `rgba(225,205,185,${0.5 * (1 - k)})`; cx.beginPath(); cx.arc(b.x, b.y, b.r * (1 + k), 0, Math.PI * 2); cx.fill(); }
    }
  }

  return {
    replaces: ["island"],
    update,
    draw(ctx: CanvasRenderingContext2D, slot: LayerSlot) {
      cx = ctx;
      if (p < 0) return;
      if (slot === "deck") { drawBridge(); drawIsland(); drawTower(); drawRing(); }
      else if (slot === "line") drawRocket();
      else if (slot === "front") drawBits();
    },
  };
}
