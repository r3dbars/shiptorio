import { LAUNCH, type ArtLoader, type CreateLayer, type DeckBus, type DeckLayer, type DeckView, type LayerSlot } from "../contract";
import { mountPreview, type Preview } from "./preview";
import {
  LAUNCH_BUILD_SECONDS, clamp01, crossed, easeBack, easeInOut, easeOut, phaseAt, span, through,
} from "./timeline";

// launch/: you earn the rocket. The island rises out of the clouds, a bridge is laid out to it from the deck, a
// tower goes up, and a crane lowers the first rocket onto the ring. Driven by view.deck.island + islandProgress
// (timeline.ts maps progress to the picture); emits launch-stage events for juice/. Owns the island outright
// (replaces "island"); once the build is done the engine's own rocket takes over at the same spot.
// Dev: /deck.html?launch=preview adds a play button + scrubber (preview.ts).
//
// Art: placeholders cut from pad.webp by slice-art.py (launch-island/-bridge/-tower + dark copies) until Justin's
// rising-island / bridge / tower stage sheets land.

const PAD = { x: 1905, y: -50, s: 0.72 }; // where the engine drew pad.webp; the pieces keep its pixel grid
const wx = (px: number) => PAD.x + px * PAD.s;
const wy = (py: number) => PAD.y + py * PAD.s;
const PIECE = { island: { x: 900, y: 179 }, bridge: { x: 0, y: 285 }, tower: { x: 1018, y: 0 } }; // crop offsets (pad px)
const BAYS = [0, 140, 345, 525, 735, 935, 1022]; // bridge girder bays, pad px from the deck end
const CLOUD_Y = 640; // the island comes up through here; nothing below it is drawn
const RING = { x: wx(1265), y: wy(330), rx: 108, ry: 32 };
const LAMPS_BRIDGE = [[75, 330], [35, 420], [35, 575]].map(([x, y]) => ({ x: wx(x), y: wy(y) }));
const LAMPS_ISLAND = [[1025, 265], [1060, 405], [1452, 260], [1490, 410], [1402, 615]].map(([x, y]) => ({ x: wx(x), y: wy(y) }));
const ROCKET_H = 220; // same size and spot as the engine's rocket, so the hand-off is invisible
const CRANE = { h: 300, jib: 200, bridgeY: 270, parkX: 2990, parkY: 200 };
const C = { line: "#0c0a0b", iron: "#3a302b", ironHi: "#5a4a3e", brass: "#c98a32", brassHi: "#ffc35a", hot: "255,170,60" };

interface Bit { x: number; y: number; vx: number; vy: number; t: number; life: number; r: number; kind: "rock" | "dust" | "spark" }

export const createLayer: CreateLayer = (art: ArtLoader, bus: DeckBus): DeckLayer => {
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const preview: Preview | null = new URLSearchParams(location.search).get("launch") === "preview" ? mountPreview() : null;
  let p = -1, t = 0, landedBays = 0, landedLifts = 0, seatedFlash = 0, upFlash = 0;
  const bits: Bit[] = [];
  let cx!: CanvasRenderingContext2D;

  const img = (n: string) => art.get(n);
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const spawn = (n: number, f: () => Omit<Bit, "t">) => { if (reduced) n = Math.ceil(n / 4); for (let i = 0; i < n && bits.length < 360; i++) bits.push({ ...f(), t: 0 }); };
  const sparks = (x: number, y: number, n = 14) => spawn(n, () => ({ x, y, vx: rnd(-220, 220), vy: rnd(-260, -40), life: rnd(0.3, 0.6), r: rnd(2, 4), kind: "spark" }));
  const dust = (x0: number, x1: number, y: number, n = 10) => spawn(n, () => ({ x: rnd(x0, x1), y, vx: rnd(-60, 60), vy: rnd(-40, -5), life: rnd(0.8, 1.4), r: rnd(12, 26), kind: "dust" }));

  // ---------- where things are at progress p ----------
  function riseOffset(u: number) {
    if (u < 0.3) return 820 - 390 * easeOut(u / 0.3); // the tip breaks the clouds
    if (u < 0.65) return 430 - 260 * easeInOut(span(u, 0.3, 0.65)); // half up, shedding rocks
    return 170 * (1 - easeBack(span(u, 0.65, 0.86))); // all the way up, clunks into place
  }
  const bayLand = (i: number) => 0.16 + (i - 1) * 0.136 + 0.136 * 0.55; // bridge-u when bay i (1..5) lands
  const liftLand = (k: number) => (k + 0.75) / 3; // tower-u when lift k (0..2) tops out

  /** The crane: where it stands, which way its jib points (-1..1, foreshortened slew), hook height, what it carries. */
  function craneAt(): { x: number; y: number; dir: number; hookY: number; alpha: number; load: "bay" | "rocket" | null; bay?: number; bayDy?: number; sway?: number } | null {
    const b = through(p, "bridge"), r = through(p, "rocket");
    if (b <= 0.06 || p >= 1) return null;
    const top = (y: number) => y - CRANE.h;
    if (b < 0.16) { // rolls on from the deck to the end of the stub
      const k = easeOut(span(b, 0.06, 0.16)), x = 1780 + (wx(BAYS[1]) - 50 - 1780) * k;
      return { x, y: CRANE.bridgeY, dir: 0.4, hookY: top(CRANE.bridgeY) + 40, alpha: Math.min(1, k * 3), load: null };
    }
    if (b < 0.84) { // lays bays 1..5: lower the girder, it clunks in, roll forward onto it
      const i = Math.min(5, 1 + Math.floor((b - 0.16) / 0.136)), l = span(b, 0.16 + (i - 1) * 0.136, 0.16 + i * 0.136);
      const roll = easeInOut(span(l, 0.55, 1)), x = wx(BAYS[i] + (BAYS[i + 1] - BAYS[i]) * roll) - 50;
      const hookX = wx((BAYS[i] + BAYS[i + 1]) / 2), dir = (hookX - x) / CRANE.jib;
      const drop = l < 0.55 ? -150 * (1 - easeBack(l / 0.55)) : 0;
      const bayTop = wy(PIECE.bridge.y) + drop;
      return l < 0.55
        ? { x, y: CRANE.bridgeY, dir, hookY: bayTop, alpha: 1, load: "bay", bay: i, bayDy: drop }
        : { x, y: CRANE.bridgeY, dir: dir * (1 - roll) + 0.4 * roll, hookY: top(CRANE.bridgeY) + 40 + 80 * (1 - roll), alpha: 1, load: null };
    }
    if (r <= 0) { // bridge done: roll across the island to the far edge, then wait there through the tower
      const k = easeInOut(span(b, 0.84, 1));
      const x = wx(BAYS[5]) - 50 + (CRANE.parkX - wx(BAYS[5]) + 50) * k, y = CRANE.bridgeY + (CRANE.parkY - CRANE.bridgeY) * easeInOut(span(k, 0.35, 0.7));
      return { x, y, dir: 0.4 - 0.15 * k, hookY: top(y) + 40, alpha: 1, load: null };
    }
    // rocket: slew out over the edge, drop the hook through the clouds, haul the rocket up, swing it in, lower it
    const x = CRANE.parkX, y = CRANE.parkY, jibY = top(y) + 8, over = (LAUNCH.x - x) / CRANE.jib;
    const seatY = LAUNCH.y + 20 - ROCKET_H; // rocket top when seated
    if (r < 0.1) return { x, y, dir: 0.25 + 0.75 * easeInOut(r / 0.1), hookY: jibY + 40, alpha: 1, load: null };
    if (r < 0.22) return { x, y, dir: 1, hookY: jibY + 40 + (CLOUD_Y + 60 - jibY - 40) * easeInOut(span(r, 0.1, 0.22)), alpha: 1, load: null };
    if (r < 0.45) return { x, y, dir: 1, hookY: CLOUD_Y + 60 - (CLOUD_Y + 60 - jibY - 30) * easeInOut(span(r, 0.22, 0.45)), alpha: 1, load: "rocket" };
    if (r < 0.66) { const l = span(r, 0.45, 0.66); return { x, y, dir: 1 + (over - 1) * easeInOut(l), hookY: jibY + 30, alpha: 1, load: "rocket", sway: Math.sin(l * Math.PI * 3) * (1 - l) * 0.14 }; }
    if (r < 0.86) { const l = span(r, 0.66, 0.86); return { x, y, dir: over, hookY: jibY + 30 + (seatY - jibY - 30) * (l < 0.85 ? easeInOut(l / 0.85) : 1), alpha: 1, load: "rocket", sway: Math.sin(l * 9) * (1 - l) * 0.03 }; }
    const l = span(r, 0.86, 1); // unhook, swing back, sink away behind the island
    return { x, y: y + 260 * easeInOut(span(l, 0.45, 1)), dir: over + (0.25 - over) * easeInOut(span(l, 0, 0.5)), hookY: seatY - 60 * easeOut(span(l, 0, 0.4)), alpha: 1 - span(l, 0.6, 1), load: null };
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
    else p = Math.min(target, p + dt / 12); // a big jump forward still plays, just quicker
    if (was >= 0 && p > was) cues(was, p);
    for (const b of bits) { b.t += dt; b.x += b.vx * dt; b.y += b.vy * dt; if (b.kind !== "dust") b.vy += (b.kind === "rock" ? 900 : 600) * dt; else b.vx *= 0.98; }
    for (let i = bits.length - 1; i >= 0; i--) if (bits[i].t >= bits[i].life) bits.splice(i, 1);
    seatedFlash = Math.max(0, seatedFlash - dt); upFlash = Math.max(0, upFlash - dt);

    const { phase, u } = phaseAt(p);
    if (phase === "rise" && u < 0.86 && Math.random() < dt * 40) { // rocks fall off the bottom, cloud churns at the waterline
      const off = riseOffset(u), x0 = wx(PIECE.island.x + 60), x1 = wx(1500);
      spawn(1, () => ({ x: rnd(x0, x1), y: Math.min(CLOUD_Y - 10, wy(700) + off), vx: rnd(-30, 30), vy: rnd(0, 80), life: 1.2, r: rnd(3, 8), kind: "rock" }));
      if (Math.random() < 0.5) dust(x0, x1, CLOUD_Y - 30, 1);
    }
    if (phase === "tower") { const l = (u * 3) % 1; if (l < 0.75 && Math.random() < dt * 30) sparks(rnd(wx(1040), wx(1430)), towerFront(u), 2); }
  }
  function cues(a: number, b: number) {
    for (const c of crossed(a, b)) {
      bus.emit({ type: "launch-stage", stage: c.stage });
      if (c.stage === "island-up") { upFlash = 1.2; dust(wx(950), wx(1520), wy(560), 24); }
      if (c.stage === "rocket-seated") { seatedFlash = 1; dust(LAUNCH.x - 90, LAUNCH.x + 90, LAUNCH.y, 16); sparks(LAUNCH.x, LAUNCH.y - 6, 20); }
    }
    const bu = through(b, "bridge"), bays = [1, 2, 3, 4, 5].filter((i) => bu >= bayLand(i)).length;
    for (; landedBays < bays; landedBays++) { const i = landedBays + 1; sparks(wx(BAYS[i]), wy(420), 18); dust(wx(BAYS[i]), wx(BAYS[i + 1]), wy(470), 6); }
    landedBays = Math.min(landedBays, bays);
    const tu = through(b, "tower"), lifts = [0, 1, 2].filter((k) => tu >= liftLand(k)).length;
    for (; landedLifts < lifts; landedLifts++) dust(wx(1030), wx(1440), towerFront(liftLand(landedLifts)), 8);
    landedLifts = Math.min(landedLifts, lifts);
  }
  /** World y of the top of the built part of the tower at tower-u. */
  function towerFront(u: number) {
    const k = Math.min(2, Math.floor(u * 3)), h = (k + easeOut(span((u * 3) % 1 || (u >= 1 ? 1 : 0), 0, 0.75))) / 3;
    const tw = img("launch-tower"), th = (tw?.naturalHeight ?? 222) * PAD.s, bottom = wy(PIECE.tower.y) + th;
    return bottom - th * (u >= 1 ? 1 : h);
  }

  // ---------- drawing ----------
  function piece(name: "island" | "bridge" | "tower", dy = 0, alpha = 1) {
    const im = img(`launch-${name}`); if (!im || alpha <= 0) return;
    cx.globalAlpha = alpha;
    cx.drawImage(im, wx(PIECE[name].x), wy(PIECE[name].y) + dy, im.naturalWidth * PAD.s, im.naturalHeight * PAD.s);
    cx.globalAlpha = 1;
  }
  /** Dark copy underneath, lit copy faded in on top: "built but not switched on yet" -> on. */
  function litPiece(name: "island" | "bridge", lit: number, dy = 0) {
    if (lit < 1) { const d = img(`launch-${name}-dark`); if (d) cx.drawImage(d, wx(PIECE[name].x), wy(PIECE[name].y) + dy, d.naturalWidth * PAD.s, d.naturalHeight * PAD.s); }
    piece(name, dy, lit);
  }
  function glow(x: number, y: number, r: number, rgb: string, a: number, sy = 1) {
    if (a <= 0) return;
    cx.save(); cx.translate(x, y); cx.scale(1, sy);
    const g = cx.createRadialGradient(0, 0, 1, 0, 0, r);
    g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
    cx.globalCompositeOperation = "lighter"; cx.fillStyle = g; cx.fillRect(-r, -r, r * 2, r * 2);
    cx.restore();
  }
  const box = (x: number, y: number, w: number, h: number, fill: string) => { cx.fillStyle = C.line; cx.fillRect(Math.round(x) - 2, Math.round(y) - 2, Math.round(w) + 4, Math.round(h) + 4); cx.fillStyle = fill; cx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };

  function drawIsland() {
    const { phase, u } = phaseAt(p);
    if (phase === "none") return;
    if (phase !== "rise") { litPiece("island", 1); return; }
    const off = riseOffset(u), shake = reduced || u > 0.86 ? 0 : Math.sin(t * 61) * 3 * (1 - u);
    cx.save(); cx.beginPath(); cx.rect(PAD.x - 200, -2000, 2000, CLOUD_Y + 2000); cx.clip();
    cx.translate(shake, 0);
    litPiece("island", span(u, 0.86, 1), off);
    cx.restore();
  }
  function drawBridge() {
    const b = through(p, "bridge"); if (b <= 0) return;
    const dark = img("launch-bridge-dark"), lit = img("launch-bridge"); if (!dark || !lit) return;
    // how far it's laid: the stub slides out of the deck, then each bay once it's landed
    const stub = easeOut(span(b, 0, 0.1)) * BAYS[1];
    let reach = stub;
    for (let i = 1; i <= 5; i++) if (b >= bayLand(i)) reach = BAYS[i + 1];
    if (b >= 0.84) reach = BAYS[6];
    const glowOn = span(b, 0.86, 0.97); // lanterns, deck end first
    const y0 = wy(PIECE.bridge.y), h = dark.naturalHeight * PAD.s;
    const cut = (im: HTMLImageElement, sx: number, sw: number, dy = 0) => { if (sw > 0) cx.drawImage(im, sx, 0, sw, im.naturalHeight, wx(sx), y0 + dy, sw * PAD.s, h); };
    cut(dark, 0, reach);
    if (glowOn > 0) { cx.globalAlpha = glowOn; cut(lit, 0, reach); cx.globalAlpha = 1; }
    const cr = craneAt();
    if (cr?.load === "bay" && cr.bay) cut(dark, BAYS[cr.bay], BAYS[cr.bay + 1] - BAYS[cr.bay], cr.bayDy);
    LAMPS_BRIDGE.forEach((l, i) => { const on = span(glowOn, i * 0.25, i * 0.25 + 0.3); glow(l.x, l.y, 46, C.hot, on * (0.55 + 0.45 * Math.sin(Math.min(1, on) * Math.PI))); });
  }
  function drawTower() {
    const u = through(p, "tower"); if (u <= 0) return;
    const tw = img("launch-tower"); if (!tw) return;
    const x = wx(PIECE.tower.x), w = tw.naturalWidth * PAD.s, th = tw.naturalHeight * PAD.s, bottom = wy(PIECE.tower.y) + th;
    const front = towerFront(u), scaffold = span(u, 0, 0.06) * (1 - span(u, 0.94, 1));
    if (scaffold > 0) { // poles and planks around both pillar groups, full height, before the iron fills them
      cx.globalAlpha = scaffold * 0.85; cx.strokeStyle = C.brass; cx.lineWidth = 3;
      for (const [a, z] of [[1030, 1170], [1300, 1440]]) {
        const ax = wx(a), zx = wx(z);
        cx.beginPath();
        for (const px of [ax, (ax + zx) / 2, zx]) { cx.moveTo(px, bottom); cx.lineTo(px, bottom - th - 10); }
        for (let yy = bottom; yy > bottom - th - 10; yy -= 36) { cx.moveTo(ax - 6, yy); cx.lineTo(zx + 6, yy); }
        cx.stroke();
      }
      cx.globalAlpha = 1;
    }
    cx.save(); cx.beginPath(); cx.rect(x - 10, front, w + 20, bottom - front + 4); cx.clip();
    cx.drawImage(tw, x, bottom - th, w, th);
    cx.restore();
    if (u < 1 && (u * 3) % 1 < 0.75) { cx.fillStyle = `rgba(${C.hot},0.9)`; cx.fillRect(x, front - 2, w, 3); glow(x + w / 2, front, w / 2, C.hot, 0.35, 0.2); }
  }
  function drawRing() {
    const { phase, u } = phaseAt(p);
    const on = phase === "rise" ? span(u, 0.86, 1) : phase === "none" ? 0 : 1;
    if (on <= 0 || p >= 1) return;
    const pulse = 0.18 + 0.1 * Math.sin(t * 3);
    glow(RING.x, RING.y, RING.rx * 1.3, C.hot, on * pulse + upFlash * 0.5 + seatedFlash * 0.6, RING.ry / RING.rx);
    if (phase === "rise") LAMPS_ISLAND.forEach((l, i) => glow(l.x, l.y, 50, C.hot, span(u, 0.86 + i * 0.02, 0.92 + i * 0.02) * 0.7 * (1 + upFlash)));
  }
  function drawCrane() {
    const c = craneAt(); if (!c) return;
    const { x, y, dir, hookY } = c, top = y - CRANE.h, tip = x + CRANE.jib * dir, jibY = top + 8;
    cx.globalAlpha = c.alpha;
    // the load hangs under the hook (bays are drawn with the bridge so they sit in its layer)
    if (c.load === "rocket") rocket(tip, hookY, c.sway ?? 0);
    cx.strokeStyle = C.line; cx.lineWidth = 3; cx.beginPath(); cx.moveTo(tip, jibY + 6); cx.lineTo(tip, hookY); cx.stroke();
    box(tip - 7, hookY - 6, 14, 10, C.brass);
    // mast: two rails, cross braces
    box(x - 14, top, 6, CRANE.h - 20, C.iron); box(x + 8, top, 6, CRANE.h - 20, C.iron);
    cx.strokeStyle = C.ironHi; cx.lineWidth = 3; cx.beginPath();
    for (let yy = top + 10; yy < y - 30; yy += 34) { cx.moveTo(x - 8, yy); cx.lineTo(x + 8, yy + 17); cx.lineTo(x - 8, yy + 34); }
    cx.stroke();
    // base on wheels
    box(x - 36, y - 26, 72, 16, C.iron); box(x - 36, y - 26, 72, 4, C.brass);
    for (const wx0 of [x - 24, x + 24]) { cx.fillStyle = C.line; cx.beginPath(); cx.arc(wx0, y - 6, 9, 0, Math.PI * 2); cx.fill(); cx.fillStyle = C.brass; cx.beginPath(); cx.arc(wx0, y - 6, 4, 0, Math.PI * 2); cx.fill(); }
    // jib (foreshortened as it slews), counterweight the other way, cab on top
    const back = x - 60 * Math.sign(dir || 1) * Math.max(0.3, Math.abs(dir));
    box(Math.min(back, tip), jibY, Math.abs(tip - back), 8, C.iron);
    cx.strokeStyle = C.brass; cx.lineWidth = 2; cx.beginPath();
    const n = Math.max(1, Math.round(Math.abs(tip - x) / 26));
    for (let i = 0; i < n; i++) { const a = x + ((tip - x) * i) / n, b = x + ((tip - x) * (i + 1)) / n; cx.moveTo(a, jibY + 8); cx.lineTo((a + b) / 2, jibY); cx.lineTo(b, jibY + 8); }
    cx.stroke();
    box(back - 12, jibY + 6, 24, 20, C.ironHi);
    box(x - 18, top - 18, 36, 24, C.ironHi); box(x - 10, top - 13, 12, 10, C.brassHi);
    cx.globalAlpha = 1;
  }
  /** The rocket by its top-centre, tipped by a small sway. Same art and size as the engine's. */
  function rocket(x: number, topY: number, sway: number) {
    const rk = img("rocket"); if (!rk) return;
    const w = rk.naturalWidth * ROCKET_H / rk.naturalHeight;
    cx.save(); cx.translate(x, topY); cx.rotate(sway);
    cx.drawImage(rk, -w / 2, 0, w, ROCKET_H);
    cx.strokeStyle = C.line; cx.lineWidth = 3; cx.beginPath(); cx.moveTo(-w * 0.3, 8); cx.lineTo(0, -6); cx.lineTo(w * 0.3, 8); cx.stroke(); // sling
    cx.restore();
  }
  function drawSeatedRocket() { // between seating and the engine taking over at p = 1
    const r = through(p, "rocket"); if (r < 0.86 || p >= 1) return;
    rocket(LAUNCH.x, LAUNCH.y + 20 - ROCKET_H + (r < 0.9 ? Math.sin(span(r, 0.86, 0.9) * Math.PI) * 4 : 0), 0);
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
      if (p >= 1 && !bits.length) { if (slot === "deck") { litPiece("bridge", 1); litPiece("island", 1); piece("tower"); } return; }
      if (slot === "deck") { drawBridge(); drawIsland(); drawTower(); drawRing(); }
      else if (slot === "line") { drawSeatedRocket(); drawCrane(); }
      else if (slot === "front") drawBits();
    },
  };
};
