import { ART_PX, DECK_DX, LAUNCH, PALETTE, type ArtLoader, type DeckBus, type DeckLayer, type DeckView, type LayerSlot } from "../contract";
import type { Preview } from "./preview";
import { LAUNCH_BUILD_SECONDS, clamp01, crossed, easeInOut, easeOut, phaseAt, span, through } from "./timeline";
import { flightPose, FLIGHT_SECONDS } from "./flight";

// launch/ on the pixel deck (?px=1, contract "the pixel canvas"). Same timeline and events as index.ts, drawn at
// whole art px in the 48 colors:
//   island  Justin's island, baked to art size (bake-px.py), rises out of the clouds a whole px at a time, dark,
//           then its ring lights (a frame swap, no fades)
//   bridge  drawn in code: plank sections bolt on one at a time from the deck edge to the island
//   tower   Justin's three tower frames, baked; each new one is revealed upward a row at a time
//   rocket  drawn in code (16 x 38) with a 3-frame flame; lowered in on a line, then owns the launch climb too
// Everything here moves in whole art px, few frames, one thing at a time. Coordinates below are art px.

const P = PALETTE;
const A = (n: number) => Math.round(n / ART_PX); // world -> art px
const RING = { x: A(LAUNCH.x), y: A(LAUNCH.y + 14) };
const SEAT = A(LAUNCH.y + 20); // rocket feet
const ISLAND = { x: RING.x - 53, y: RING.y - 24 }; // island-3 top-left; its ring centre sits on RING
const TOWER_PAD = 71; // tower frames: rows from the top to the pad centre
const BRIDGE = { x0: A(1958 + DECK_DX), x1: RING.x - 47, floor: A(353) - 4 }; // deck edge -> island rim; floor = top of the planks
const PLANK = 8;
const CLOUD = 128; // art y of the cloud tops the island comes up through
const FPS = 10; // stepped motion: positions update at this rate

/** Pixel art made of rows of palette keys; built once into a tiny canvas. */
function bitmap(rows: string[], key: Record<string, string>): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = rows[0].length; c.height = rows.length;
  const g = c.getContext("2d")!;
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (key[ch]) { g.fillStyle = key[ch]; g.fillRect(x, y, 1, 1); } }));
  return c;
}

// ---------- the rocket, drawn in code ----------
// 22 x 38, light from the upper right. It's a body of revolution, so every row is shaded by where the px sits across
// the curve (banded, not a gradient): highlight band near the right, darkest band just before the left edge, one
// bounce px at the very left edge, a warm rim px on the right. Copper nose, white body with a brass-ringed porthole
// and a riveted seam, brass bands with glints, copper fins (left one in shadow), striped iron nozzle, soot outline.
const RW = 22, RH = 38, RC = RW / 2; // centre line sits between px 9 and 10
const ROCKET_FOOT = 36; // last row of the rocket (nozzle rim)
type Ramp = readonly string[]; // dark -> light, 5 steps: core, shadow, mid, light, highlight
const HULL: Ramp = [P.haze[0], P.haze[1], P.haze[2], P.haze[3], P.white[0]];
const NOSE: Ramp = P.copper;
const BAND: Ramp = [P.brass[1], P.brass[2], P.brass[3], P.brass[4], P.brass[5]];
const NOZZLE: Ramp = [P.iron[0], P.iron[1], P.iron[2], P.iron[3], P.iron[4]];
/** Half-width of the round body at row y (0 = above the nose). */
function radius(y: number): number {
  if (y < 12) return [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5, 5.5, 5.5][y]; // ogive nose
  if (y < 30) return 6;
  return [5.5, 5, 4.5][y - 30] ?? 0; // boat tail into the nozzle
}
/** Ramp step (0..4) for a px at column x across a round body of half-width r. */
function band(x: number, r: number): number {
  const n = (x + 0.5 - RC) / r; // -1 left edge .. 1 right edge
  if (n < -0.86) return 1; // bounce light
  if (n < -0.42) return 0; // core shadow
  if (n < 0) return 1;
  if (n < 0.35) return 2;
  if (n < 0.72) return 3;
  return 4;
}
function drawRocketArt(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = RW; c.height = RH;
  const g = c.getContext("2d")!;
  const px = (x: number, y: number, col: string) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  const fill = new Map<number, string>();
  const put = (x: number, y: number, col: string) => fill.set(y * RW + x, col);
  // body of revolution: nose 0-11, band 12, hull 13-28 (seam 21), band 29, tail 30-32
  for (let y = 0; y <= 32; y++) {
    const r = radius(y), x0 = Math.round(RC - r), x1 = Math.round(RC + r) - 1;
    const ramp = y < 12 ? NOSE : y === 12 || y === 29 ? BAND : HULL;
    for (let x = x0; x <= x1; x++) {
      let k = band(x, r);
      if (y < 12 && y < 3) k = Math.min(4, k + 1); // nose tip catches the sun
      if (y === 13 || y === 30) k = Math.max(0, k - 1); // shadow under each band's lip
      put(x, y, ramp[k]);
    }
    if (x1 > x0 + 1) put(x1, y, y < 12 || y === 12 || y === 29 ? P.brass[4] : HULL[3]); // warm rim on the right edge
  }
  // brass glints on the bands, one px on the light side
  put(RC + 3, 12, P.white[0]); put(RC + 3, 29, P.white[0]);
  // nose cap: a soot tip and a darker band where the copper meets the cap
  put(RC - 1, 0, NOSE[1]); put(RC, 0, NOSE[3]);
  // riveted seam across the hull: a dark seam line, rivets as 1 light over 1 dark every 3 px
  for (let x = Math.round(RC - 6) + 1; x < Math.round(RC + 6) - 1; x++) {
    const k = band(x, 6);
    put(x, 22, HULL[Math.max(0, k - 2)]);
    if ((x - 1) % 3 === 0) { put(x, 23, HULL[Math.min(4, k + 1)]); put(x, 24, HULL[Math.max(0, k - 2)]); }
  }
  // grime in the lower-left corner of the hull (checker of the two darkest)
  for (let y = 25; y <= 28; y++) for (let i = 1; i <= 3; i++) if ((i + y) % 2 === 0 && y - 25 >= i - 1) put(RC - 6 + i, y, HULL[0]);
  // porthole: brass ring (lit top-right, dark bottom-left) around blue-steel glass with a white glint
  const PX = RC, PY = 17;
  for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
    const d = Math.hypot(x + 0.5 - 0.5, y), X = Math.floor(PX + x), Y = PY + y;
    if (d > 3.2) continue;
    const lit = x - y; // up-right is lit
    if (d > 2.2) put(X, Y, lit > 1 ? BAND[4] : lit > -1 ? BAND[2] : BAND[0]);
    else put(X, Y, lit > 1 ? P.steel[3] : lit > -2 ? P.steel[2] : P.steel[1]);
  }
  put(PX + 1, PY - 1, P.white[0]); put(PX, PY - 1, P.steel[3]); put(PX - 2, PY + 1, P.steel[0]); put(PX - 1, PY + 2, P.steel[0]);
  // fins: flat plates out to the sides, rows 20-35; left in shadow, right lit, bevelled top edge, brass rim on the right
  for (let y = 20; y <= 35; y++) {
    const out = Math.min(4, Math.floor((y - 20) / 2.2)), r = Math.max(radius(y), 4);
    const lx1 = Math.round(RC - r) - 1, rx0 = Math.round(RC + r);
    for (let i = 0; i <= out; i++) {
      const top = i === out && out < 4 || y === 20 + Math.ceil(i * 2.2); // the sloped leading edge
      const low = y >= 34; // trailing edge, a darker lip
      put(lx1 - i, y, top ? NOSE[2] : low || i === out ? NOSE[0] : NOSE[1]);
      put(rx0 + i, y, top ? NOSE[4] : i === out ? P.brass[4] : low ? NOSE[2] : NOSE[3]);
    }
    if (out >= 2 && y < 34) { put(lx1 - 1, y, (y & 1) ? NOSE[1] : NOSE[0]); } // grime on the shaded fin
  }
  // nozzle: a short iron bell, rows 33-36, brass stripe at 34, dark throat on the bottom row
  for (let y = 33; y <= 36; y++) {
    const r = y < 35 ? 2.5 : 3.5, x0 = Math.round(RC - r), x1 = Math.round(RC + r) - 1;
    for (let x = x0; x <= x1; x++) put(x, y, y === 34 ? BAND[band(x, r)] : y === 36 && x > x0 && x < x1 ? P.soot[0] : NOZZLE[band(x, r)]);
  }
  // Inspection panels, cooling ribs, fasteners and the cold-gas nozzle ports.
  for (const y of [14, 26, 28]) { put(RC - 3, y, P.haze[0]); put(RC - 2, y, P.haze[3]); }
  for (const y of [24, 26, 28]) put(RC + 4, y, P.brass[2]);
  for (const x of [RC - 6, RC + 5]) { put(x, 13, P.steel[0]); put(x, 14, P.steel[3]); }
  for (const y of [31, 33, 35]) { put(RC - 2, y, P.steel[3]); put(RC + 2, y, P.iron[0]); }
  // 1 px soot outline around the whole silhouette
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < RW && y < RH && fill.has(y * RW + x);
  for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
    if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) px(x, y, P.soot[0]);
  }
  for (const [i, col] of fill) px(i % RW, Math.floor(i / RW), col);
  return c;
}
export const ROCKET = drawRocketArt();

// ---------- the flame: 4 frames, a teardrop that breathes a px or two, sun ramp from the white core out ----------
const FW = 9;
function drawFlame(len: number, wide: number, jag: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = FW; c.height = len;
  const g = c.getContext("2d")!;
  for (let y = 0; y < len; y++) {
    const v = y / len, r = wide * (v < 0.25 ? 0.75 + v : Math.max(0.4, 1.0 - (v - 0.25) * 1.25)) - (y % 3 === jag ? 0.5 : 0);
    for (let x = 0; x < FW; x++) {
      const n = Math.abs(x + 0.5 - FW / 2) / r; if (n > 1) continue;
      const heat = (1 - n) * (1 - v * 0.85); // hot near the axis and the nozzle
      g.fillStyle = heat > 0.62 ? P.white[0] : heat > 0.48 ? P.sun[6] : heat > 0.34 ? P.sun[5] : heat > 0.2 ? P.sun[4] : heat > 0.1 ? P.sun[3] : P.sun[1];
      g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}
export const FLAME = [drawFlame(7, 2.6, 1), drawFlame(12, 3.4, 0), drawFlame(14, 3.6, 2), drawFlame(11, 3.3, 1)];

export function createPixelLaunch(_art: ArtLoader, bus: DeckBus, preview: Preview | null): DeckLayer {
  const imgs = new Map<string, HTMLImageElement>();
  const pic = (name: string) => {
    let im = imgs.get(name);
    if (!im) { im = new Image(); im.src = `/deck/px/launch/${name}.png`; imgs.set(name, im); }
    return im.complete && im.naturalWidth ? im : null;
  };
  ["island-2", "island-3", "tower-0", "tower-1", "tower-2"].forEach(pic);

  let p = -1, t = 0, cx!: CanvasRenderingContext2D;
  // the launch the engine starts (it still emits { type: "launch" }; this layer draws it)
  const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const fly = { active: false, t: 0, queued: 0, touched: false };
  let nextVent = 3.5;
  const puffs: { x: number; y: number; t: number; vx: number; vy: number; life: number; size: number }[] = [];
  const jets: { x: number; y: number; side: number; age: number }[] = [];
  bus.on((e) => {
    if (e.type !== "launch" || p < 1) return;
    if (fly.active) { fly.queued = Math.min(8, fly.queued + 1); return; }
    fly.active = true; fly.t = 0; fly.touched = false;
  });

  const step = (time: number) => Math.floor(time * FPS) / FPS; // stepped clock
  const rect = (x: number, y: number, w: number, h: number, c: string) => { cx.fillStyle = c; cx.fillRect(x * ART_PX, y * ART_PX, w * ART_PX, h * ART_PX); };
  const blit = (im: CanvasImageSource & { width: number; height: number }, x: number, y: number) => cx.drawImage(im, x * ART_PX, y * ART_PX, im.width * ART_PX, im.height * ART_PX);
  let islandLights: { x: number; y: number; cyan: boolean; phase: number }[] | null = null;
  function islandLife(im: HTMLImageElement, x: number, y: number) {
    if (!islandLights) {
      const mask = document.createElement("canvas"); mask.width = im.width; mask.height = im.height;
      const g = mask.getContext("2d")!; g.drawImage(im, 0, 0);
      const rgba = g.getImageData(0, 0, im.width, im.height).data;
      islandLights = [];
      for (let j = 0; j < im.height; j++) for (let i = 0; i < im.width; i++) {
        const n = (j * im.width + i) * 4, [r, green, b, a] = rgba.slice(n, n + 4);
        const cyan = j > 30 && green > r * 1.3 && b > r * 1.3 && green > 70;
        const ember = j < 50 && Math.abs(i - im.width / 2) > 22 && r > 175 && green > 55 && b < green * 0.8;
        if (a && (cyan || ember)) islandLights.push({ x: i, y: j, cyan, phase: (i * 3 + j * 7) % 8 });
      }
    }
    for (const light of islandLights) {
      const wave = reduced ? 1 : Math.floor((Math.sin(t * (light.cyan ? 1.2 : 2) + light.phase) + 1) * 1.49);
      rect(x + light.x, y + light.y, 1, 1, light.cyan ? P.energy[wave + 1] : P.sun[wave + 3]);
    }
    if (reduced) return;
    for (let i = 0; i < 7; i++) {
      const side = i % 2 ? 1 : -1, drift = Math.round(Math.sin(t * 0.45 + i * 1.7) * 2);
      const bx = Math.round(RING.x + side * (38 + (i * 7) % 18) + Math.sin(t * 0.3 + i) * 2);
      const by = Math.round(RING.y + 21 + i * 6 + drift);
      rect(bx, by, 3, 2, P.iron[0]); rect(bx + 1, by - 1, 2, 1, P.iron[3]);
      if (i % 3 === 0) rect(bx + 1, by, 1, 1, P.energy[1]);
    }
  }

  // ---------- update ----------
  function update(dt: number, view: DeckView) {
    t += dt;
    let target: number;
    if (preview) {
      target = preview.step(dt / LAUNCH_BUILD_SECONDS);
      view.deck = { ...(view.deck ?? { size: "large" }), island: target >= 1 ? "built" : target > 0 ? "building" : "none", islandProgress: target };
    } else {
      const d = view.deck;
      target = !d || d.island === "built" ? 1 : d.island === "building" ? clamp01(d.islandProgress ?? 0) : 0;
    }
    const was = p;
    if (p < 0 || target < p || preview) p = target;
    else p = Math.min(target, p + dt / 6);
    if (was >= 0 && p > was) for (const c of crossed(was, p)) {
      bus.emit({ type: "launch-stage", stage: c.stage });
      if (c.stage === "rocket-seated" || c.stage === "island-up") puff(c.stage === "island-up" ? RING.x : RING.x, c.stage === "island-up" ? ISLAND.y + 60 : SEAT, 4);
    }
    if (fly.active) {
      fly.t += dt;
      const f = flightPose(fly.t);
      if ((f.stage === "ignition" || (f.stage === "ascent" && f.u < 0.35) || (f.stage === "landing" && f.u > 0.7)) && step(t) !== step(t - dt)) {
        for (const side of [-1, 1]) cloud(RING.x + side * 4, SEAT + 2, side * (12 + (f.stage === "ignition" ? f.u : 1) * 17), -3, 2.3, 4);
      }
      if (f.stage === "landing" && f.u < 0.75 && Math.floor(t * 3) !== Math.floor((t - dt) * 3)) {
        const side = f.lean > 0 ? 1 : -1;
        if (!reduced) jets.push({ x: RING.x + f.x + side * 7, y: SEAT - ROCKET_FOOT + f.y + 14, side, age: 0 });
      }
      if (f.stage === "settle" && !fly.touched) { fly.touched = true; puff(RING.x, SEAT + 1, 10); }
      if (fly.t >= FLIGHT_SECONDS) {
        fly.active = fly.queued > 0; fly.queued = Math.max(0, fly.queued - 1); fly.t = 0; fly.touched = false;
      }
    }
    // Infrequent tower pressure release, separate from the launch exhaust.
    if (!reduced && p >= 1 && t >= nextVent) {
      nextVent = t + 3.5 + Math.random() * 4;
      const side = Math.random() < 0.5 ? 1 : -1;
      for (let i = 0; i < 3; i++) cloud(RING.x + side * 24, RING.y - 45, side * (5 + i), -4, 1.5, 2);
    }
    for (const q of puffs) { q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= Math.exp(-dt * 0.5); }
    for (let i = puffs.length - 1; i >= 0; i--) if (puffs[i].t > puffs[i].life) puffs.splice(i, 1);
    for (const jet of jets) jet.age += dt;
    for (let i = jets.length - 1; i >= 0; i--) if (jets[i].age >= 0.14) jets.splice(i, 1);
  }
  function cloud(x: number, y: number, vx: number, vy: number, life: number, size: number) {
    if (puffs.length < (reduced ? 16 : 100)) puffs.push({ x, y, vx, vy, t: 0, life, size });
  }
  function puff(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) cloud(x - 8 + i * 2, y, (i - n / 2) * 5, -4, 2, 3);
  }

  // ---------- drawing ----------
  function drawIsland() {
    const { phase, u } = phaseAt(p);
    if (phase === "none") return;
    const lit = phase !== "rise" || u >= 0.86;
    const im = pic(lit ? "island-3" : "island-2"); if (!im) return;
    // rise: from below the clouds to its spot, a whole px per step, slowing at the top; then one px clunk
    const k = phase === "rise" ? Math.min(1, step(u * LAUNCH_BUILD_SECONDS * 0.22) / (0.86 * LAUNCH_BUILD_SECONDS * 0.22)) : 1;
    const off = phase === "rise" && u < 0.86 ? Math.round((CLOUD - ISLAND.y + 4) * (1 - easeOut(k))) : 0;
    const x = ISLAND.x - (im.width - 100 >> 1), y = ISLAND.y + off;
    cx.save(); cx.beginPath(); cx.rect(0, -1e5, 1e6, (CLOUD + 1e5 / ART_PX) * ART_PX); cx.clip();
    blit(im, x, y);
    if (lit) islandLife(im, x, y);
    cx.restore();
  }
  function drawBridge() {
    const b = through(p, "bridge"); if (b <= 0) return;
    const span_ = BRIDGE.x1 - BRIDGE.x0, n = Math.ceil(span_ / PLANK);
    const laid = b * 0.86 * n, whole = Math.floor(laid), part = laid - whole; // sections in place, and the next one coming
    const lit = b >= 0.86;
    const y0 = BRIDGE.floor;
    for (let i = 0; i < Math.min(n, whole + 1); i++) {
      const drop = i < whole ? 0 : Math.max(0, 3 - Math.floor(part * 4)); // the newest section drops in, 3 px -> 0
      if (i === whole && part < 0.25) continue;
      section(BRIDGE.x0 + i * PLANK, Math.min(PLANK, span_ - i * PLANK), y0 - drop, i, lit);
    }
    if (whole >= n || b >= 0.86) { // ends: outline caps
      rect(BRIDGE.x0 - 1, y0 - 3, 1, 15, P.soot[0]);
    }
  }
  /** One bridge section, 3/4 view, cool dark steel with brass only as rivets: back rail, a plank top face, a riveted iron front face, a truss brace below and
   *  a cast shadow down-left; a brass post + lantern every other one. Light from the upper right. */
  function section(x: number, w: number, y: number, i: number, lit: boolean) {
    const half = (f: () => void) => { cx.save(); cx.globalAlpha = 0.5; f(); cx.restore(); };
    half(() => rect(x - 2, y + 11, w, 2, P.iron[0])); // cast shadow, down-left, 50%
    // back rail: a round dark-steel pipe (lit top, dark under), glint every other section
    rect(x, y - 5, w, 1, P.soot[0]);
    rect(x, y - 4, w, 1, P.steel[3]); rect(x, y - 3, w, 1, P.steel[2]); rect(x, y - 2, w, 1, P.steel[1]);
    if (i % 2 === 1) rect(x + 5, y - 4, 1, 1, P.white[0]);
    rect(x, y - 1, w, 1, P.soot[0]);
    // plank top face: lit front lip, mid, darker toward the back, grime checker along the back edge
    rect(x, y, w, 1, P.plate[2]); rect(x, y + 1, w, 2, P.plate[3]); rect(x, y + 3, w, 1, P.plate[4]);
    for (let k = i & 1; k < w; k += 2) rect(x + k, y, 1, 1, P.plate[1]);
    for (let k = 0; k < w; k += 4) { rect(x + k, y, 1, 4, P.plate[1]); rect(x + k + 1, y, 1, 1, P.plate[4]); } // plank seams, bevel lit on the near side
    // front face: cool steel girder, bevel (light top, dark bottom), brass rivets (1 light over 1 dark), rust under them
    rect(x, y + 4, w, 1, P.soot[0]);
    rect(x, y + 5, w, 1, P.steel[3]); rect(x, y + 6, w, 2, P.steel[2]); rect(x, y + 8, w, 1, P.steel[1]); rect(x, y + 9, w, 1, P.steel[0]);
    for (const rx of [2, 6]) { rect(x + rx, y + 6, 1, 1, P.brass[4]); rect(x + rx, y + 7, 1, 1, P.soot[0]); if ((i + rx) % 3 === 0) rect(x + rx, y + 8, 1, 2, P.copper[0]); }
    rect(x + w - 1, y + 5, 1, 5, P.steel[0]); // panel seam
    if (i % 3 === 1) { rect(x + 3, y + 9, 1, 1, P.iron[2]); rect(x + 4, y + 8, 1, 1, P.iron[2]); } // grime
    rect(x, y + 10, w, 1, P.soot[0]);
    // truss below: a diagonal brace per section, lit edge on top
    for (let k = 0; k < 4; k++) { rect(x + 1 + k, y + 11 + k, 2, 1, P.steel[1]); rect(x + 1 + k, y + 12 + k, 1, 1, P.soot[0]); }
    rect(x + 1, y + 11, 1, 1, P.steel[2]);
    if (i % 2 === 0) { // dark steel post (banded: dark left, lit right, warm rim) + lantern
      rect(x - 1, y - 8, 5, 8, P.soot[0]);
      rect(x, y - 7, 1, 7, P.steel[0]); rect(x + 1, y - 7, 1, 7, P.steel[2]); rect(x + 2, y - 7, 1, 7, P.steel[3]);
      rect(x + 2, y - 6, 1, 1, P.sun[5]); // warm rim glint
      rect(x + 1, y - 2, 1, 1, P.brass[3]); // collar rivet
      if (lit) half(() => rect(x - 3, y - 14, 9, 8, P.sun[4])); // lamp halo on the light layer
      rect(x - 1, y - 12, 5, 4, P.soot[0]); // lantern cage
      rect(x, y - 11, 3, 2, lit ? P.sun[5] : P.steel[1]); rect(x + 1, y - 11, 1, 1, lit ? P.sun[6] : P.steel[2]);
      rect(x, y - 13, 3, 1, P.soot[0]); rect(x + 1, y - 14, 1, 1, P.soot[0]);
    }
  }
  function drawTower() {
    const u = through(p, "tower"); if (u <= 0) return;
    const k = Math.min(2, Math.floor(u * 3)), l = u * 3 - k;
    const place = (im: HTMLImageElement) => ({ x: RING.x - (im.width >> 1), y: RING.y - TOWER_PAD });
    if (k === 0) { // the pad drops onto the ring in a few whole-px steps
      const im = pic("tower-0"); if (!im) return;
      const { x, y } = place(im), drop = Math.max(0, Math.round(24 * (1 - easeInOut(Math.min(1, step(l) / 0.5)))));
      blit(im, x, y - drop);
      return;
    }
    const prev = pic(`tower-${k - 1}`), im = pic(`tower-${k}`); if (!prev || !im) return;
    blit(prev, place(prev).x, place(prev).y);
    // the new frame is revealed upward from the pad, a few rows per step
    const { x, y } = place(im), padTop = RING.y - 8, rows = Math.round((padTop - y) * Math.min(1, step(l) / 0.7));
    cx.save(); cx.beginPath(); cx.rect(x * ART_PX, (padTop - rows) * ART_PX, im.width * ART_PX, (im.height - (padTop - rows - y)) * ART_PX); cx.clip();
    blit(im, x, y);
    cx.restore();
  }
  function drawRocket() {
    const r = through(p, "rocket");
    if (r <= 0) return;
    const top = SEAT - ROCKET_FOOT; // rocket top when seated
    let y = top, line = false;
    if (p < 1) { // lowered in from the sky on a line, stepping down, slowing
      const l = Math.min(1, step(r * LAUNCH_BUILD_SECONDS * 0.26) / (0.86 * LAUNCH_BUILD_SECONDS * 0.26));
      y = top - Math.round(120 * (1 - easeOut(l)));
      line = l < 1;
    } else if (fly.active) {
      const flight = flightPose(fly.t);
      y = top + flight.y;
      if (flight.stage === "coast") return;
    }
    if (line) rect(RING.x, y - 200, 1, 200, P.soot[0]);
    const flight = fly.active ? flightPose(fly.t) : null;
    const x = RING.x - RC + (flight?.x ?? 0), seated = y === top;
    if (seated) { // contact shadow on the pad, cast down-left
      cx.save(); cx.globalAlpha = 0.5; rect(x + 4, SEAT + 1, 10, 1, P.iron[0]); rect(x + 2, SEAT + 2, 9, 1, P.iron[0]); cx.restore();
    }
    if (flight && ["ignition", "ascent", "landing"].includes(flight.stage)) {
      const f = FLAME[flight.stage === "ignition" && flight.u < 0.3 ? 0 : 1 + (Math.floor(fly.t * 8) % 3)];
      glow(flight.stage === "landing" ? flight.u : Math.max(0, 1 + flight.y / 75));
      blit(f, x + RC - (FW >> 1), y + ROCKET_FOOT + 1);
      if (flight.stage === "ascent") {
        // Shock diamonds and a tapering hot exhaust tail, all whole art pixels.
        const len = 12 + Math.round(flight.u * 15);
        for (let j = 0; j < len; j++) {
          const half = Math.max(0, 3 - Math.floor(j / 5));
          rect(x + RC - half, y + ROCKET_FOOT + 8 + j, half * 2 + 1, 1, j % 5 === 0 ? P.sun[6] : j < 12 ? P.sun[4] : P.copper[2]);
        }
      }
    }
    const lean = reduced ? 0 : flight?.lean ?? 0;
    // Stepped row offsets suggest attitude correction without rotating/blurring pixels.
    for (let row = 0; row < RH; row++) {
      const dx = Math.round(lean * (1 - row / RH));
      cx.drawImage(ROCKET, 0, row, RW, 1, (x + dx) * ART_PX, (y + row) * ART_PX, RW * ART_PX, ART_PX);
    }
    if (flight && flight.legs > 0) {
      const spread = Math.round(6 * flight.legs);
      for (const side of [-1, 1]) for (let j = 0; j <= spread; j++) {
        rect(x + RC + side * (4 + j), y + 29 + j, 2, 1, P.steel[3]);
        rect(x + RC + side * (4 + j), y + 30 + j, 2, 1, P.steel[0]);
      }
    }
  }
  /** The flame's warm light on the pad: a soft oval laid over it at low alpha, which the palette snap turns into a
   *  few warmer steps of the pad's own colors. Fades as the rocket climbs away. */
  function glow(a: number) {
    if (a <= 0) return;
    cx.save(); cx.globalAlpha = 0.28 * a; cx.fillStyle = P.sun[5];
    for (let r = 3; r >= 1; r--) {
      const w = 6 + r * 6, h = 1 + r;
      cx.fillRect((RING.x - w) * ART_PX, (SEAT - h + 1) * ART_PX, w * 2 * ART_PX, h * 2 * ART_PX);
    }
    cx.restore();
  }
  function drawPuffs() {
    for (const jet of jets) {
      // A sharp pressure jet: one or two pixels thick, fast travel, no expanding cloud.
      const travel = Math.floor(jet.age * 80), length = Math.max(2, 10 - Math.floor(jet.age * 45));
      const start = Math.round(jet.x) + jet.side * travel, y = Math.round(jet.y);
      for (let i = 0; i < length; i++) {
        rect(start + jet.side * i, y, 1, 1, i < length / 2 ? P.white[0] : P.haze[3]);
        if (i > 2 && i < length - 2) rect(start + jet.side * i, y + 1, 1, 1, P.haze[2]);
      }
    }
    for (const q of puffs) {
      const age = q.t / q.life, radius = q.size + Math.floor(q.t * 5);
      const x = Math.round(q.x), y = Math.round(q.y);
      // Overlapping shaded lobes roll outward, then fray instead of alpha-fading.
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
        const d = (dx * dx + dy * dy) / (radius * radius);
        if (d > 1 || (age > 0.65 && d > 1.3 - age && ((x + dx + y + dy) & 1))) continue;
        if (age > 0.88 && ((dx + dy) & 1)) continue;
        rect(x + dx, y + dy, 1, 1, dy < -radius / 3 ? P.haze[3] : d < 0.45 ? P.iron[4] : P.haze[2]);
      }
    }
  }

  return {
    replaces: ["island", "rocket"],
    update,
    draw(ctx: CanvasRenderingContext2D, slot: LayerSlot) {
      cx = ctx;
      if (p < 0) return;
      if (slot === "deck") { drawBridge(); drawIsland(); drawTower(); }
      else if (slot === "line") drawRocket();
      else if (slot === "front") drawPuffs();
    },
  };
}
