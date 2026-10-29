import { ART_PX, STOP_X } from "../contract";
import { IDX } from "../stations/palette";
import { Px, shift } from "../stations/px";
import { GOLD, noise, tone, type Ramp } from "../stations/shade";
import { CU, tube } from "../../bakeoff/boiler2d";

// Back-floor dressing (hub ask, 2026-10-28): the deck behind the line is a working floor, not an empty plate. A copper
// main runs out of the boiler along the back rail and drops into every machine; one fat feed pipe goes from the boiler
// straight into Repo (the boiler powers the line); crates, barrels, a toolbox, a hose coil, gas bottles and a parts
// shelf fill the gaps between stations. Everything is static and kept dark and low-contrast, and nothing stands right
// behind a station, so the stations stay the heroes.
//
// Each prop is drawn on its own grid, gets its own 1px soot outline, then is stamped onto the hull: the hull's single
// outline pass only rings the outside of the whole deck.

/** Wood for crates: light tan so they read against the darker floor plates. */
const WOOD: Ramp = ["soot", "plate-0", "plate-1", "plate-2", "plate-3", "plate-4", "haze-2"];
/** Blue-steel and rust-red drums; copper for the toolbox and the pipe ends. */
const BLUE: Ramp = ["soot", "steel-0", "steel-1", "steel-2", "steel-3", "haze-2"];
const RED: Ramp = ["soot", "plate-0", "copper-0", "copper-1", "copper-2", "copper-3"];
const DIM_CU: Ramp = CU.slice(0, 7);

const SX = Object.values(STOP_X).map((x) => x / ART_PX);
const STATIONS = SX.slice(0, 6); // repo .. gate stand on the deck; launch is on the bridge
const BACK_Y = 13; // the copper main's centre line, just in front of the back rail
const BOILER_RIGHT = (STOP_X.repo / ART_PX) - 26; // the boiler's right flank, just left of Repo

type Draw = (g: Px) => void;

/** Draw one prop on its own grid, ring it with soot, and stamp it over what's there. Stamp props back to front: each
 * gets its own outline, so a front crate stays separate from the drum behind it instead of melting into one blob. */
function stamp(raw: Px, ox: number, oy: number, draw: Draw) {
  const tmp = new Px(raw.w, raw.h);
  let x0 = raw.w, y0 = raw.h, x1 = -1, y1 = -1;
  const g = shift(tmp, ox, oy), set = g.set.bind(g);
  g.set = (x, y, c) => { const X = Math.round(x) + ox, Y = Math.round(y) + oy; if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; set(x, y, c); };
  draw(g);
  if (x1 < 0) return;
  const out: number[] = [];
  for (let y = Math.max(0, y0 - 1); y <= Math.min(raw.h - 1, y1 + 1); y++) for (let x = Math.max(0, x0 - 1); x <= Math.min(raw.w - 1, x1 + 1); x++) {
    const i = y * raw.w + x;
    if (tmp.d[i] !== 255) raw.d[i] = tmp.d[i];
    else if (tmp.has(x - 1, y) || tmp.has(x + 1, y) || tmp.has(x, y - 1) || tmp.has(x, y + 1)) out.push(i);
  }
  for (const i of out) raw.d[i] = IDX.soot;
  raw.glows.push(...tmp.glows);
}

/** A contact shadow on the floor plates under a footprint, thrown down-left (light is upper right). */
function shadow(g: Px, x0: number, x1: number, y: number, depth = 2) {
  for (let j = 0; j < depth; j++) for (let x = x0 - 1 - j; x < x1 - j; x++) {
    if (!g.has(x, y + j)) continue;
    if (j === 0 || ((x + y + j) & 1)) g.set(x, y + j, j === 0 ? "iron-0" : "iron-1");
  }
}

const W = (i: number) => WOOD[Math.max(0, Math.min(WOOD.length - 1, i))];

/** A wooden crate in 3/4 (front w x h, receding d px up-right). The front has a lit plank frame, a planked panel and a
 * diagonal brace with its shadow; the top is the lightest face with boards running back; the right side is dark.
 * Nails sit in the frame corners. All steps are picked by hand, no gradients, so it stays crisp at any scale. */
function crate(g: Px, x: number, base: number, w: number, h: number, d: number, o: { brace?: boolean; seed?: number; stencil?: boolean } = {}) {
  const y = base - h, seed = o.seed ?? 1;
  // top face: row k (1..d) up, shifted k right
  for (let k = 1; k <= d; k++) for (let i = 0; i < w; i++) {
    const X = x + i + k, Y = y - k, board = (i % 4) === 3;
    g.set(X, Y, k === d ? W(5) : board ? W(4) : (noise(X, Y, seed) < 0.15 ? W(4) : W(5)));
  }
  for (let i = 0; i < w; i++) g.set(x + i + 1, y - 1, W(6)); // the lit front lip of the lid
  // right side: column k (1..d) right, shifted k up
  for (let k = 1; k <= d; k++) for (let j = 0; j < h; j++) {
    const X = x + w - 1 + k, Y = y + j - k;
    g.set(X, Y, k === d || j === 0 ? W(3) : j === h - 1 ? W(1) : W(2));
  }
  // front: frame, panel, brace
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const X = x + i, Y = y + j, top = j === 0, bot = j === h - 1, left = i === 0, right = i === w - 1;
    let c = W(3);
    if (top) c = W(5);
    else if (bot) c = W(2);
    else if (left) c = W(3);
    else if (right) c = W(4);
    else c = (j % 3 === 0) ? W(2) : (noise(X, Y, seed + 1) < 0.12 ? W(2) : W(3)); // planks with a seam every 3 rows
    g.set(X, Y, c);
  }
  if (o.brace !== false && w > 5 && h > 4) {
    const n = Math.max(w, h) * 2;
    for (let t = 0; t <= n; t++) {
      const X = Math.round(x + 1 + ((w - 3) * t) / n), Y = Math.round(base - 2 - ((h - 3) * t) / n);
      g.set(X, Y, W(5)); if (Y + 1 < base - 1 && X > x + 1) g.set(X - 1, Y + 1, W(1)); // lit board, shadow under it
    }
  }
  if (o.stencil) { // a stenciled mark on the panel: a little arrow
    const cx = x + Math.floor(w / 2), cy = y + Math.floor(h / 2);
    g.set(cx, cy - 1, W(1)); g.set(cx - 1, cy, W(1)); g.set(cx, cy, W(1)); g.set(cx + 1, cy, W(1)); g.set(cx, cy + 1, W(1));
  }
  for (const [i, j] of [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2]]) g.set(x + i, y + j, "iron-2"); // nails
  g.set(x + w - 1, y, W(6)); // the corner facing the sun
}

/** An oil drum standing up, 2r+1 wide: banded cylinder shading, a highlight stripe, two rolled hoops (a lit ridge over a
 * dark groove), a dark foot ring, and an elliptical lid with its rim, a dark well and a bung. */
function drum(g: Px, cx: number, base: number, r: number, h: number, ramp: Ramp) {
  const top = base - h, n = 2 * r + 1, c = (k: number) => ramp[Math.max(0, Math.min(ramp.length - 1, k))];
  const col = (i: number) => { const s = (i - r) / r; return s < -0.7 ? 1 : s < -0.2 ? 2 : s < 0.25 ? 3 : s < 0.6 ? 4 : s < 0.85 ? 3 : 2; }; // highlight sits right of centre
  const hoops = [top + 2, base - 4];
  for (let i = 0; i < n; i++) for (let y = top; y < base; y++) {
    let k = col(i);
    if (y === base - 1) k -= 1;
    if (hoops.includes(y)) k += 1; else if (hoops.includes(y - 1)) k -= 1;
    g.set(cx - r + i, y, c(k));
  }
  // lid: back rim, the dark well, the front rim (light, it faces the sky)
  for (let i = 1; i < n - 1; i++) g.set(cx - r + i, top - 2, c(4));
  g.set(cx - r, top - 1, c(3)); g.set(cx + r, top - 1, c(4));
  for (let i = 1; i < n - 1; i++) g.set(cx - r + i, top - 1, c(1));
  for (let i = 0; i < n; i++) g.set(cx - r + i, top, i === 0 ? c(2) : c(i > r ? 5 : 4));
  g.set(cx + Math.ceil(r / 2), top - 1, c(3)); // the bung
}

/** A steel toolbox in copper paint: a lit lid, a tray seam, brass latches and a brass carry handle. */
function toolbox(g: Px, x: number, base: number) {
  const w = 12, h = 6, d = 2, y = base - h;
  for (let k = 1; k <= d; k++) for (let i = 0; i < w; i++) g.set(x + i + k, y - k, k === d ? "copper-2" : "copper-3");
  for (let k = 1; k <= d; k++) for (let j = 0; j < h; j++) g.set(x + w - 1 + k, y + j - k, j === 0 ? "copper-1" : "copper-0");
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) g.set(x + i, y + j, j === 0 ? "copper-2" : j === 2 ? "copper-0" : j === h - 1 ? "copper-0" : "copper-1");
  for (const i of [2, w - 3]) { g.set(x + i, y + 1, "brass-4"); g.set(x + i, y + 2, "brass-1"); } // latches
  g.hline(x + 4, y - 4, 5, "iron-3"); g.set(x + 4, y - 3, "iron-2"); g.set(x + 8, y - 3, "iron-2"); g.set(x + 7, y - 4, "haze-2"); // handle
}

/** Short pipe offcuts stacked like logs: copper rings with dark bores, lit on their upper right. */
function pipeStack(g: Px, x: number, base: number) {
  const ends: [number, number][] = [[0, 0], [6, 0], [12, 0], [3, -5], [9, -5], [6, -10]];
  for (const [dx, dy] of ends) {
    const cx = x + dx + 2, cy = base - 3 + dy;
    for (let yy = -2; yy <= 3; yy++) for (let xx = -2; xx <= 3; xx++) {
      const fx = xx - 0.5, fy = yy - 0.5, d2 = fx * fx + fy * fy;
      if (d2 > 6.6) continue;
      const lit = fx - fy; // up-right is lit
      g.set(cx + xx, cy + yy, d2 <= 1 ? (xx === 1 && yy === 0 ? "plate-0" : "soot") : lit >= 2 ? "copper-3" : lit >= 0 ? "copper-2" : lit >= -2 ? "copper-1" : "copper-0");
    }
  }
}

/** Gas bottles chained to the rail: tall round cylinders with domed shoulders, a painted band, and brass valves. */
function bottles(g: Px, x: number, base: number, n: number) {
  for (let k = 0; k < n; k++) {
    const ramp = k % 2 ? BLUE : RED, cx = x + k * 6 + 2, h = 15 - (k % 2) * 2, top = base - h;
    const c = (i: number) => ramp[Math.max(0, Math.min(ramp.length - 1, i))];
    for (let y = top; y < base; y++) for (let i = -2; i <= 2; i++) {
      const sh = y === top ? (Math.abs(i) <= 1) : y === top + 1 ? true : true;
      if (!sh) continue;
      let v = i === -2 ? 1 : i === -1 ? 2 : i === 0 ? 3 : i === 1 ? 4 : 2;
      if (y === top) v += 1;
      if (y === top + 4) v = i === 1 ? 5 : 4; // painted band, a step lighter
      if (y === base - 1) v -= 1;
      g.set(cx + i, y, c(v));
    }
    g.set(cx, top - 1, "brass-3"); g.set(cx + 1, top - 1, "brass-1"); g.set(cx, top - 2, "brass-4"); g.hline(cx - 1, top - 2, 1, "brass-2"); // valve
  }
  for (let i = 0; i < n * 6 - 1; i++) g.set(x + i, base - 9, i % 2 ? "iron-3" : "iron-2"); // the chain across them
}

/** A parts shelf against the back rail: iron uprights with a dark back panel so the parts read, three brass-lipped
 * boards, and on them small crates, a gear, cans and one glass jar. */
function shelf(g: Px, x: number, base: number) {
  const w = 24, h = 22, top = base - h;
  for (let y = top + 1; y < base; y++) for (let i = 2; i < w - 2; i++) g.set(x + i, y, (y + i) % 5 === 0 ? "iron-2" : "iron-1"); // back panel
  for (const px of [x, x + w - 2]) for (let y = top; y < base; y++) { g.set(px, y, "steel-1"); g.set(px + 1, y, y === top ? "steel-3" : "steel-2"); }
  for (let i = 0; i < w; i++) g.set(x + i, top, i > w / 2 ? "steel-3" : "steel-2");
  const items: ((ix: number, iy: number) => number)[] = [
    (ix, iy) => { for (let j = 0; j < 4; j++) for (let q = 0; q < 4; q++) g.set(ix + q, iy - j, j === 3 ? "plate-4" : q === 3 ? "plate-2" : "plate-3"); g.set(ix + 1, iy - 1, "plate-1"); return 5; }, // a little crate
    (ix, iy) => { g.ring(ix + 2, iy - 1.5, 2.2, "steel-3"); g.set(ix + 2, iy - 2, "iron-1"); g.set(ix + 3, iy - 4, "haze-2"); g.set(ix, iy - 4, "steel-2"); g.set(ix + 4, iy, "steel-2"); return 6; }, // a gear
    (ix, iy) => { for (let j = 0; j < 4; j++) { g.set(ix, iy - j, "copper-1"); g.set(ix + 1, iy - j, j === 3 ? "copper-3" : "copper-2"); g.set(ix + 2, iy - j, "copper-0"); } return 4; }, // a can
    (ix, iy) => { for (let j = 0; j < 4; j++) { g.set(ix, iy - j, "energy-0"); g.set(ix + 1, iy - j, j === 1 ? "energy-2" : "energy-1"); g.set(ix + 2, iy - j, "energy-0"); } g.hline(ix, iy - 4, 3, "brass-2"); g.set(ix + 2, iy - 4, "brass-4"); return 4; }, // a jar
  ];
  const rows = [[0, 2, 1], [1, 3, 0], [2, 0, 2]];
  for (let s = 0; s < 3; s++) {
    const by = top + 7 + s * 7; // the board
    let ix = x + 3;
    for (const k of rows[s]) { if (ix + 5 > x + w - 2) break; ix += items[k](ix, by - 1) + 1; }
    for (let i = 0; i < w; i++) { g.set(x + i, by, i > w * 0.6 ? "brass-3" : "brass-2"); g.set(x + i, by + 1, "brass-0"); }
  }
}

/** The copper main: out of the boiler, along the back rail on little stands, and down into each machine. */
function main(raw: Px, ox: number, oy: number, w: number) {
  const end = Math.min(w - 24, STATIONS[STATIONS.length - 1] + 30);
  const drops = STATIONS.filter((sx) => sx - 14 < w - 24).map((sx) => sx - 14);
  stamp(raw, ox, oy, (p) => {
    for (let x = BOILER_RIGHT - 6; x < end; x += 22) { p.vline(x, BACK_Y + 2, 4, "iron-1"); p.set(x + 1, BACK_Y + 2, "iron-2"); p.hline(x - 1, BACK_Y + 6, 3, "iron-0"); }
    tube(p, [[BOILER_RIGHT - 30, BACK_Y], [end, BACK_Y], [end, BACK_Y + 10]], 2.1, CU, { amb: 0.08, gloss: 0.55, bend: 3 });
    for (const dx of drops) tube(p, [[dx, BACK_Y], [dx, BACK_Y + 26]], 1.5, DIM_CU, { amb: 0.06, gloss: 0.4 });
    for (let x = BOILER_RIGHT + 6; x < end - 4; x += 32) { // bolted brass flanges along the main
      for (let j = -3; j <= 3; j++) { p.set(x, BACK_Y + j, j < 0 ? "brass-3" : "brass-1"); p.set(x + 1, BACK_Y + j, j < 0 ? "brass-4" : "brass-2"); }
      p.set(x + 1, BACK_Y - 3, "brass-5"); p.set(x, BACK_Y + 3, "brass-0"); p.set(x + 1, BACK_Y + 3, "brass-0");
    }
    for (const dx of drops) { // a brass tee collar where each drop leaves the main, and a valve wheel on it
      for (let j = -2; j <= 2; j++) tone(p, dx - 2 + (j + 2), BACK_Y - 2, GOLD, 0.5 + 0.08 * j);
      p.ring(dx + 0.5, BACK_Y + 6.5, 2, "brass-1"); p.set(dx + 2, BACK_Y + 5, "brass-3"); p.set(dx, BACK_Y + 6, "brass-2");
    }
  });
}

/** The fat feed from the boiler into Repo (the boiler powers the line): it leaves the boiler's front low down and runs
 * across the open floor left of the belt into Repo's left foot, flanged at both ends, with a pressure gauge and a valve
 * wheel. A small coal heap with a shovel sits by the firebox. */
function feed(raw: Px, g: Px, ox: number, oy: number) {
  const rx = STOP_X.repo / ART_PX, y = 44, x0 = BOILER_RIGHT - 34;
  for (let x = x0 - 3; x < rx - 22; x++) if (g.has(x, y + 3) && ((x + y) & 1)) g.set(x, y + 3, "iron-1"); // its shadow on the plates
  stamp(raw, ox, oy, (p) => {
    tube(p, [[x0, 33], [x0, y], [rx - 22, y]], 2.4, CU, { amb: 0.1, gloss: 0.6, bend: 4 });
    for (const fx of [rx - 24, x0 + 14]) for (let j = -3; j <= 3; j++) { tone(p, fx, y + j, GOLD, 0.4 + 0.05 * j); tone(p, fx + 1, y + j, GOLD, 0.62 - 0.04 * Math.abs(j)); }
    for (let j = 0; j < 3; j++) { tone(p, x0 - 3 + j, 34, GOLD, 0.45 + 0.1 * j); tone(p, x0 + 1 + j, 34, GOLD, 0.6); } // collar where it leaves the boiler
    // the gauge on a little stem
    p.vline(x0 + 24, y - 5, 3, "iron-1"); p.disc(x0 + 24.5, y - 7.5, 2.4, "brass-1"); p.disc(x0 + 24.5, y - 7.5, 1.5, "haze-2");
    p.set(x0 + 25, y - 8, "soot"); p.set(x0 + 24, y - 7, "soot"); p.set(x0 + 26, y - 9, "brass-4");
    // a valve wheel on top of the pipe
    p.vline(x0 + 34, y - 4, 2, "iron-2"); p.ring(x0 + 34.5, y - 5.5, 2.2, "copper-0"); p.set(x0 + 36, y - 7, "copper-2"); p.set(x0 + 35, y - 7, "copper-1");
  });
  // coal by the firebox: a low heap of dark lumps, a few lit faces, a shovel leaning in it
  const cx = x0 - 16, cy = 47;
  for (let x = cx - 9; x < cx + 9; x++) if (g.has(x, cy + 1) && ((x + cy) & 1)) g.set(x, cy + 1, "iron-0");
  stamp(raw, ox, oy, (p) => {
    for (let y = cy - 5; y <= cy; y++) for (let x = cx - 8; x <= cx + 8; x++) {
      const dx = (x - cx) / 8, dy = (cy - y) / 5;
      if (dx * dx + dy > 1 - (noise(x, y, 91) - 0.5) * 0.3) continue;
      const lump = noise(Math.floor(x / 2), Math.floor(y / 2), 92);
      p.set(x, y, lump > 0.8 ? "iron-2" : lump > 0.45 ? "iron-1" : "soot");
      if (lump > 0.7 && noise(x, y, 93) > 0.5) p.set(x, y, "steel-1");
    }
    p.line(cx + 3, cy - 3, cx + 9, cy - 13, "plate-2"); p.line(cx + 4, cy - 3, cx + 10, cy - 13, "plate-1"); // the shaft
    p.rect(cx + 1, cy - 4, 3, 3, "iron-3"); p.set(cx + 3, cy - 4, "haze-2"); p.hline(cx + 9, cy - 14, 3, "plate-3"); // blade and grip
  });
}

/** Dress the back floor of a deck w art px wide. g is the hull grid in art px; raw is the canvas grid under it. */
export function dressFloor(raw: Px, g: Px, w: number, ox: number, oy: number) {
  main(raw, ox, oy, w);
  feed(raw, g, ox, oy);
  // the gaps between stations, each dressed differently; nothing within 24 px of a station's centre line
  const gaps = STATIONS.slice(0, -1).map((sx, i) => (sx + STATIONS[i + 1]) / 2);
  gaps.push(Math.min(STATIONS[STATIONS.length - 1] + 40, w - 24));
  const put = (d: Draw) => stamp(raw, ox, oy, d); // one stamp per item, back to front
  const kit: ((cx: number) => void)[] = [
    (cx) => { // a crate stack: one behind, a big one in front with a small one on top
      shadow(g, cx + 2, cx + 13, 26); shadow(g, cx - 13, cx + 4, 33);
      put((p) => crate(p, cx + 2, 26, 8, 7, 3, { seed: 4 }));
      put((p) => crate(p, cx - 13, 33, 13, 10, 4, { seed: 1, stencil: true }));
      put((p) => crate(p, cx - 10, 23, 8, 7, 3, { brace: false, seed: 3 }));
    },
    (cx) => { // drums: two against the back, one in front
      shadow(g, cx - 10, cx + 10, 26); shadow(g, cx - 5, cx + 5, 35);
      put((p) => drum(p, cx - 5, 26, 4, 11, BLUE));
      put((p) => drum(p, cx + 5, 26, 4, 11, RED));
      put((p) => drum(p, cx, 35, 4, 11, BLUE));
    },
    (cx) => { // the parts shelf against the back rail, gas bottles chained beside it
      shadow(g, cx - 14, cx + 10, 25); shadow(g, cx + 11, cx + 22, 26);
      put((p) => shelf(p, cx - 14, 25));
      put((p) => bottles(p, cx + 12, 26, 2));
    },
    (cx) => { // pipe offcuts stacked at the back, a toolbox in front
      shadow(g, cx - 2, cx + 14, 28); shadow(g, cx - 12, cx + 2, 35);
      put((p) => pipeStack(p, cx - 1, 28));
      put((p) => toolbox(p, cx - 12, 35));
    },
    (cx) => { // a crate with a rusty drum beside it
      shadow(g, cx - 11, cx + 2, 32); shadow(g, cx + 3, cx + 11, 34);
      put((p) => crate(p, cx - 11, 32, 11, 9, 3, { seed: 8 }));
      put((p) => drum(p, cx + 7, 34, 3, 10, RED));
    },
    (cx) => { // bottles by the far rail and a small crate
      shadow(g, cx - 9, cx + 8, 26); shadow(g, cx - 1, cx + 9, 33);
      put((p) => bottles(p, cx - 9, 26, 3));
      put((p) => crate(p, cx - 1, 33, 8, 7, 3, { seed: 11 }));
    },
  ];
  gaps.forEach((cx, i) => { if (cx + 14 < w - 8) kit[i % kit.length](Math.round(cx)); });
}
