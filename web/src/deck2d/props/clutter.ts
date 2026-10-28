import { ART_PX, STOP_X } from "../contract";
import { Px, shift } from "../stations/px";
import { GOLD, blotch, cylV, noise, rivet, tone, type Ramp } from "../stations/shade";
import { CU, lathe, tube } from "../../bakeoff/boiler2d";

// Back-floor dressing (hub ask, 2026-10-28): the deck behind the line is a working floor, not an empty plate. A copper
// main runs out of the boiler along the back rail and drops into every machine; one fat feed pipe goes from the boiler
// straight into Repo (the boiler powers the line); crates, barrels, a toolbox, a hose coil, gas bottles and a parts
// shelf fill the gaps between stations. Everything is static and kept dark and low-contrast, and nothing stands right
// behind a station, so the stations stay the heroes.
//
// Each prop is drawn on its own grid, gets its own 1px soot outline, then is stamped onto the hull: the hull's single
// outline pass only rings the outside of the whole deck.

/** Muted ramps: one or two steps darker than the station ones, so props sit back. */
const WOOD: Ramp = ["soot", "plate-0", "plate-1", "plate-2", "plate-3", "plate-4"];
const DRUM: Ramp = ["soot", "iron-0", "steel-0", "steel-1", "steel-2", "steel-3", "haze-2"];
const RUST: Ramp = ["soot", "plate-0", "copper-0", "plate-1", "copper-1", "plate-2", "copper-2"];
const DIM_CU: Ramp = CU.slice(0, 7);
const HOSE: Ramp = ["soot", "iron-1", "iron-2", "iron-3", "iron-4"];

const SX = Object.values(STOP_X).map((x) => x / ART_PX);
const STATIONS = SX.slice(0, 6); // repo .. gate stand on the deck; launch is on the bridge
const BACK_Y = 13; // the copper main's centre line, just in front of the back rail
const BOILER_RIGHT = (STOP_X.repo / ART_PX) - 26; // the boiler's right flank, just left of Repo

type Draw = (g: Px) => void;

/** Draw one prop on its own grid, ring it with soot, and stamp it over the hull. */
function stamp(raw: Px, ox: number, oy: number, draw: Draw) {
  const tmp = new Px(raw.w, raw.h);
  draw(shift(tmp, ox, oy));
  tmp.outline();
  for (let i = 0; i < tmp.d.length; i++) if (tmp.d[i] !== 255) raw.d[i] = tmp.d[i];
  raw.glows.push(...tmp.glows);
}

/** A soft contact shadow on the floor plates, down and to the left of a footprint (light is upper right). */
function shadow(g: Px, x0: number, x1: number, y: number, depth = 3) {
  for (let j = 0; j < depth; j++) for (let x = x0 - 2 - j; x < x1 - j; x++) {
    if (!g.has(x, y + j)) continue;
    if (j === 0 || ((x + y + j) & 1)) g.set(x, y + j, j === 0 ? "iron-0" : "iron-1");
  }
}

/** A wooden crate in 3/4: slatted front with a plank frame and a cross brace, lit top, dark right side. */
function crate(g: Px, x: number, base: number, s: number, seed: number, brace = true) {
  const d = Math.max(2, Math.round(s * 0.4)), y = base - s;
  for (let k = 1; k <= d; k++) for (let i = 0; i < s; i++) { // top
    const v = 0.78 + 0.1 * (i / s) - 0.04 * k + (blotch(x + i, y - k, 3, seed) - 0.5) * 0.18;
    tone(g, x + i + k, y - k, WOOD, (i + k) % 4 === 0 ? v - 0.14 : v); // board seams run front to back
  }
  for (let k = 0; k < d; k++) for (let j = 0; j < s; j++) tone(g, x + s + k, y + j - k, WOOD, 0.38 - 0.1 * (j / s) + (k === 0 ? -0.06 : 0)); // side, away from the light
  for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
    const edge = i === 0 || j === 0 || i === s - 1 || j === s - 1;
    let v = 0.56 + 0.1 * (i / s) - 0.12 * (j / s) + (blotch(x + i, y + j, 3, seed + 2) - 0.5) * 0.2 + (noise(x + i, y + j, seed) - 0.5) * 0.05;
    if (!edge && j % 3 === 0) v -= 0.16; // slat gaps
    if (edge) v += j === 0 ? 0.18 : 0.06;
    if (brace && !edge && (Math.abs(i - j) < 1 || Math.abs(i - (s - 1 - j)) < 1)) v = 0.7 + 0.06 * (i / s); // X brace
    tone(g, x + i, y + j, WOOD, v);
  }
  g.set(x + s - 1, y, "plate-4"); // the corner facing the sun
  rivet(g, x + 1, y + 1, "brass-2", "plate-0"); rivet(g, x + s - 2, y + 1, "brass-3", "plate-0");
}

/** An oil drum standing up: a slightly bellied cylinder with two rolled hoops and a lid seen from above. */
function drum(g: Px, cx: number, base: number, r: number, h: number, ramp: Ramp, seed: number) {
  const top = base - h;
  lathe(g, cx, top, base, (y) => r * (0.94 + 0.08 * Math.sin(Math.PI * (y - top) / h)), ramp, { amb: 0.16, gloss: 0.4, rust: 0.04, seed, grime: 1 });
  for (const f of [0.3, 0.7]) { // hoops: a dark line under a lit line
    const y = Math.round(top + f * h);
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) { if (!g.has(x, y)) continue; tone(g, x, y, ramp, 0.62 + 0.3 * ((x - cx) / r)); g.set(x, y + 1, ramp[1]); }
  }
  for (let y = top - 2; y <= top; y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) { // lid ellipse
    const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - (top - 1)) / 1.6;
    if (dx * dx + dy * dy > 1) continue;
    const rim = dx * dx + dy * dy > 0.55;
    tone(g, x, y, ramp, rim ? 0.66 + 0.2 * dx : 0.36 + 0.1 * dx);
  }
  g.set(Math.round(cx + r * 0.4), top - 1, ramp[1]); // the bung
}

/** A riveted steel toolbox with a brass handle and a red-rust lid band. */
function toolbox(g: Px, x: number, base: number) {
  const w = 11, h = 5, y = base - h;
  for (let k = 1; k <= 2; k++) for (let i = 0; i < w; i++) tone(g, x + i + k, y - k, RUST, 0.6 + 0.12 * (i / w) - 0.06 * k);
  for (let k = 0; k < 2; k++) for (let j = 0; j < h; j++) tone(g, x + w + k, y + j - k, RUST, 0.26 - 0.06 * (j / h));
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) tone(g, x + i, y + j, RUST, (j === 1 ? 0.28 : 0.46) + 0.12 * (i / w) - 0.08 * (j / h) + (blotch(x + i, y + j, 3, 31) - 0.5) * 0.15);
  g.set(x + 2, y + 2, "brass-3"); g.set(x + w - 3, y + 2, "brass-3"); // latches
  g.hline(x + 4, y - 4, 5, "brass-2"); g.set(x + 4, y - 3, "brass-1"); g.set(x + 8, y - 3, "brass-1"); g.set(x + 7, y - 4, "brass-4"); // handle
}

/** A coiled hose lying flat: three loops stacked up, each a 1px lit band over a 1px dark band, and a brass nozzle. */
function hose(g: Px, cx: number, cy: number) {
  for (let k = 0; k < 3; k++) {
    const oy = cy - k * 1.5, rx = 5.5 - k * 0.3, ry = 2.3;
    for (let a = 0; a < Math.PI * 2; a += 0.04) {
      const x = Math.round(cx + Math.cos(a) * rx), y = Math.round(oy + Math.sin(a) * ry);
      const front = Math.sin(a) > 0; // the near half of the loop
      tone(g, x, y, HOSE, (front ? 0.55 : 0.4) + 0.3 * Math.max(0, Math.cos(a - 5.6)));
      if (front) g.set(x, y + 1, "soot");
    }
  }
  g.line(cx + 5, cy - 4, cx + 9, cy - 7, "iron-3"); g.set(cx + 10, cy - 8, "brass-4"); g.set(cx + 9, cy - 8, "brass-2");
}

/** Gas bottles chained to the rail: tall thin cylinders with domed tops and brass valves. */
function bottles(g: Px, x: number, base: number, n: number) {
  for (let k = 0; k < n; k++) {
    const cx = x + k * 5 + 2, h = 14 - (k % 2) * 2, top = base - h - (k % 2);
    lathe(g, cx, top, base - (k % 2), (y) => (y < top + 2 ? 1 + (y - top) : 2.3), k % 2 ? DRUM : RUST, { amb: 0.08, gloss: 0.5, seed: 40 + k });
    g.set(Math.round(cx - 0.5), top - 1, "brass-3"); g.set(Math.round(cx + 0.5), top - 1, "brass-1");
  }
  g.hline(x, base - 9, n * 5, "iron-0"); // the chain strap
}

/** A parts shelf against the back rail: an iron rack with three shelves of boxes, gears and one glass jar. */
function shelf(g: Px, x: number, base: number) {
  const w = 24, h = 20, top = base - h;
  for (const px of [x, x + w - 2]) cylV(g, px, top, 2, h, DRUM, { amb: 0.08, gloss: 0.2 });
  for (let s = 0; s < 3; s++) {
    const y = top + 3 + s * 6;
    // the stuff on this shelf, sitting on the board
    for (let i = 3; i < w - 3;) {
      const pick = noise(x + i, s, 77), iw = 2 + Math.floor(noise(i, s, 78) * 3);
      if (pick < 0.35) { for (let j = 0; j < 3; j++) for (let q = 0; q < iw; q++) tone(g, x + i + q, y + 2 - j, WOOD, 0.35 + 0.15 * (q / iw) + (j === 2 ? 0.15 : 0)); }
      else if (pick < 0.6) { g.ring(x + i + 1.5, y + 0.5, 1.6, "iron-3"); g.set(x + i + 2, y - 1, "iron-4"); g.set(x + i + 1, y + 1, "iron-1"); }
      else if (pick < 0.72 && s === 1) { g.rect(x + i, y - 1, 2, 3, "energy-0"); g.set(x + i + 1, y - 1, "energy-1"); g.hline(x + i, y - 2, 2, "brass-2"); }
      else if (pick < 0.85) { g.rect(x + i, y + 1, iw, 2, "plate-1"); g.hline(x + i, y + 1, iw, "plate-2"); }
      i += iw + 1;
    }
    for (let i = 0; i < w; i++) { tone(g, x + i, y + 3, GOLD, 0.34 + 0.2 * (i / w)); g.set(x + i, y + 4, "iron-0"); } // the board, brass-edged
  }
  for (let i = 0; i < w; i++) tone(g, x + i, top, DRUM, 0.5 + 0.1 * (i / w)); // the top rail
}

/** The copper main: out of the boiler, along the back rail on little stands, and down into each machine. */
function main(raw: Px, ox: number, oy: number, w: number) {
  const end = Math.min(w - 24, STATIONS[STATIONS.length - 1] + 30);
  const drops = STATIONS.filter((sx) => sx - 14 < w - 24).map((sx) => sx - 14);
  stamp(raw, ox, oy, (p) => {
    for (let x = BOILER_RIGHT - 6; x < end; x += 22) { p.vline(x, BACK_Y + 2, 4, "iron-1"); p.set(x + 1, BACK_Y + 2, "iron-2"); p.hline(x - 1, BACK_Y + 6, 3, "iron-0"); }
    tube(p, [[BOILER_RIGHT - 30, BACK_Y], [end, BACK_Y], [end, BACK_Y + 10]], 2.1, CU, { amb: 0.08, gloss: 0.55, bend: 3 });
    for (const dx of drops) tube(p, [[dx, BACK_Y], [dx, BACK_Y + 26]], 1.5, DIM_CU, { amb: 0.06, gloss: 0.4 });
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
  const kit: ((cx: number) => void)[] = [
    (cx) => { // a crate stack
      shadow(g, cx - 12, cx + 10, 33); shadow(g, cx + 6, cx + 14, 26, 2);
      stamp(raw, ox, oy, (p) => { crate(p, cx - 13, 33, 11, 1); crate(p, cx - 1, 33, 8, 2, false); crate(p, cx - 10, 22, 8, 3, false); crate(p, cx + 7, 25, 6, 4); });
    },
    (cx) => { // three drums, one rusty
      shadow(g, cx - 10, cx + 10, 31);
      stamp(raw, ox, oy, (p) => { drum(p, cx - 6, 25, 4.2, 12, DRUM, 5); drum(p, cx + 4, 26, 4.2, 12, RUST, 6); drum(p, cx - 1, 34, 4.2, 12, DRUM, 7); });
    },
    (cx) => { // the parts shelf against the back rail, gas bottles beside it
      shadow(g, cx - 12, cx + 12, 22, 2);
      stamp(raw, ox, oy, (p) => { shelf(p, cx - 13, 22); bottles(p, cx + 12, 23, 2); });
    },
    (cx) => { // a toolbox and the coiled hose
      shadow(g, cx - 10, cx + 2, 32); shadow(g, cx + 2, cx + 13, 25, 2);
      stamp(raw, ox, oy, (p) => { toolbox(p, cx - 10, 32); hose(p, cx + 7, 24); });
    },
    (cx) => { // a crate with a drum on the floor beside it
      shadow(g, cx - 10, cx + 10, 30);
      stamp(raw, ox, oy, (p) => { crate(p, cx - 9, 30, 9, 8); drum(p, cx + 6, 31, 3.4, 10, RUST, 9); });
    },
    (cx) => { // bottles and a small crate at the far end
      shadow(g, cx - 8, cx + 8, 26, 2);
      stamp(raw, ox, oy, (p) => { bottles(p, cx - 8, 24, 3); crate(p, cx - 1, 31, 7, 11); });
    },
  ];
  gaps.forEach((cx, i) => { if (cx + 14 < w - 8) kit[i % kit.length](Math.round(cx)); });
}
