// The connector kit (DIRECTION.md section B): how a feed would physically reach the line from a floating island. Five
// parts, drawn here in city px with the 48 palette colours only, light from the upper right, 1 px soot outlines:
//
//   pylon     an A-frame lattice tower (30 px above the belt) with a brass saddle for the main cables and a lantern on top;
//             at a span's end it stands on the island's rim on a foot plate, mid-span on a tapering lattice leg down to its
//             own floating rock (one boulder, lit on its upper right, a cyan fleck in it once lit)
//   span      a straight run, flat or sloped (+-1/4, +-1/2): a 7-row riveted belt band on a truss (8 rows flat, 10 sloped), hung
//             from main cables that sag from saddle to saddle (or to a lift tower), with hangers every 6 px
//   lift      a vertical run: a 7-wide belt standing up inside a 13-wide K-braced lattice tower, lanterns on arms
//   junction  a 15 x 15 lattice block with a brass gear housing, where a run turns or a span meets a lift
//   hub       the line's west-end intake, a 15 x 50 junction tower whose port belts run on under the line's west rail,
//             clamped to the line with two brackets
//
// Every belt carries a 3 x 3 chevron every 14 px on its plates, pointing the way the ore runs (toward the line, or toward
// Inbox on the Customers span): brass once lit, dark iron before. Chevrons and plates advance one whole px per belt step.
//
// Painting is pure: it goes into a Raster (an RGBA buffer with a city-px origin), so the tests read every pixel without a
// canvas. createConnectorPicture turns a plan (layout.ts) into cached canvases: the dark picture, made once (posterized,
// lanterns off, belt at rest, never redrawn), and the lit picture per belt step (14 at most, each made when first needed).
// A frame draws the dark picture, then the lit one clipped to the lit reach, then the lit lanterns' halos.
import { PALETTE as C } from "../contract";
import type { Path, Rect } from "./layout";
import type { XY } from "./manifest";

// ---------- colours ----------
export type RGB = readonly [number, number, number];
const rgb = (hex: string): RGB => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const SOOT = rgb(C.soot[0]);
const IRON = C.iron.map(rgb), BRASS = C.brass.map(rgb), PLATE = C.plate.map(rgb), ENERGY = C.energy.map(rgb);

// ---------- sizes (city px) ----------
/** Rows relative to a span's belt centre row c, y down. */
export const ROW = {
  /** The belt band, 7 rows (c-3..c+3): soot, back rail (the top rail), three plate rows, front rail, soot. */
  band: -3,
  /** The truss under it from c+4: sun lip, top chord, the web, bottom chord, soot; its last row is c+11 on a flat span
   *  (a 4-row web) and SLOPED_DEEP lower on a sloped one (a 6-row web). */
  truss: 4,
  trussEnd: 11,
  /** A pylon's legs: 30 rows above the band (c-33..c-4). */
  legs: -33,
  /** The 7 x 3 saddle (c-36..c-34) under its soot outline (c-37). */
  saddle: -36,
  /** The pylon lantern's glass (c-43..c-42): the 5 x 7 lantern is c-46..c-40, on a 2 px stem (c-39..c-38). */
  glass: -43,
  /** A deck lantern's glass (c-9..c-8): the 3 x 4 lantern is c-10..c-7, on a 3 px post (c-6..c-4). */
  deckGlass: -9,
  /** A mid pier under a flat span's truss (SLOPED_DEEP lower under a sloped one): the tapering leg (c+12..c+21) and the
   *  floating boulder it stands on (14 x 9, c+22..c+30). */
  leg: 12,
  rock: 22,
  rockEnd: 30,
} as const;
/** Rows a sloped span's truss is deeper than a flat one's: a 6-row web, so each 12 px panel shows one clear diagonal. */
export const SLOPED_DEEP = 2;
export const KIT = {
  /** Brass stud on the back rail, soot seam between belt plates, truss bay (and a sloped span's panel), hanger spacing. */
  stud: 8, seam: 7, bay: 12, hanger: 6,
  /** A 3 x 3 chevron on the belt's plates every 14 px: one on every other plate. */
  chevron: 14,
  /** Pylon: legs 9 apart at the foot, 5 at the top, an X brace every 6 rows; foot plate 11 x 2. */
  pylon: { foot: 9, top: 5, brace: 6, plate: 11 },
  /** A mid pier: a lattice leg 7 px wide under the truss, 4 at its foot, 10 tall, on a 14 x 9 floating boulder whose flat
   *  6 px top takes the leg's foot. */
  pier: { top: 7, foot: 4, h: 10, rockW: 14, rockH: 9, seat: 6 },
  /** Main cables never come closer than this to the top rail (c-2). */
  cableClear: 4,
  /** A span longer than this gets mid pylons, evenly spaced. */
  pierEvery: 120,
  /** Lift: 13 wide (soot, chord, gap, 7-wide belt, gap, chord, soot), a K brace every 8 rows, lantern arms 3 px. */
  lift: { half: 6, brace: 8, arm: 3 },
  /** Junction tower: 15 x 15 (half 7), gear housing 7 x 7. */
  junction: 7,
  /** The iron brackets: a cable's anchor plate on a lift, Hub to the line. */
  bracket: { w: 6, h: 3 }, hubBracket: { w: 4, h: 3 },
} as const;
/** Main cable sag below the straight saddle line: 12% of the run, 6 to 24 px. */
export const sag = (length: number) => Math.max(6, Math.min(24, Math.round(0.12 * length)));
/** The belt's plates are 7 px long and carry a chevron on every other one, and they move in whole px, so a moving belt has
 *  exactly 14 pictures. */
export const BELT_STEPS = KIT.chevron;
const mod = (n: number, m: number) => ((n % m) + m) % m;

// ---------- plans (layout.ts builds them) ----------
/** A straight run of belt: centre line from a (the island side) to b (toward the lit end). Slope 0, +-1/4 or +-1/2. */
export interface SpanPart { a: XY; b: XY }
/** A pylon at column x, where the belt centre is row c. It stands on an island's rim (a foot plate, drawn in front of the
 *  island) or mid-span on its own pier (a trestle down to a floating rock). deep: rows its span's truss is deeper than a flat
 *  one's (SLOPED_DEEP on a sloped span), so the pier hangs under it. */
export interface PylonPart { x: number; c: number; foot: "rim" | "pier"; deep?: number }
/** A vertical run at column x from row top to row bottom; up = the belt runs up. foot = its foot plate stands on a rim at bottom. */
export interface LiftPart { x: number; top: number; bottom: number; up: boolean; foot: boolean }
/** A junction tower centred at (x, y). */
export interface JunctionPart { x: number; y: number }
/** A main cable between two rests (a saddle top, a corner of the Hub or a junction, a lift tower, or an anchor on the deck
 *  itself), sagging in between over the belt. A taut one (a backstay from a saddle down to its deck anchor) sags only an
 *  eighth of the height it falls, so it comes down to the deck without dipping under the clearance and lying along the rail. */
export interface CablePart { a: XY; b: XY; taut?: boolean }
export type LampKind = "pylon" | "junction" | "deck" | "arm";
/** One runway lamp: (x, y) = its glass's middle column and top row. dist = belt px from the lit end. A junction lantern
 *  whose junction has a run through its top stands on an arm out to column `arm` instead. */
export interface Lamp { x: number; y: number; kind: LampKind; dist: number; arm?: number }
export interface ConnectorPlan {
  id: string;
  /** The belt centre line, island end first, lit end last. */
  path: Path;
  length: number;
  spans: SpanPart[];
  lifts: LiftPart[];
  pylons: PylonPart[];
  junctions: JunctionPart[];
  cables: CablePart[];
  /** Iron brackets and anchor plates (in front of the island they hold). */
  brackets: Rect[];
  /** Exactly 12, lamp 0 nearest the lit end. */
  lamps: Lamp[];
}
/** The Hub, the line's west-end intake (drawn behind the line). `turn`: the row where a top port's belt, carried on down
 *  inside the Hub, turns east into the line. */
export interface HubPlan { box: Rect; ports: XY[]; brackets: Rect[]; turn?: number }

/** The belt centre row of a span at column x (the band's top row is this - 3). */
export function spanRow(s: SpanPart, x: number): number {
  const [xa, ya] = s.a, [xb, yb] = s.b;
  return xb === xa ? ya : ya + Math.round(((x - xa) * (yb - ya)) / (xb - xa));
}
/** +1 if a span's belt goes down as x grows, -1 if up, 0 if flat. */
export const slopeSign = (s: SpanPart) => (s.b[1] === s.a[1] ? 0 : Math.sign(s.b[0] - s.a[0]) * Math.sign(s.b[1] - s.a[1]));
/** Where a span's truss ends (its soot row), relative to the belt centre row. */
export const trussEnd = (s: SpanPart) => ROW.trussEnd + (slopeSign(s) ? SLOPED_DEEP : 0);
/** The span (if any) that covers column x, and its belt centre row there. */
function spanAt(plan: Pick<ConnectorPlan, "spans">, x: number): number | null {
  for (const s of plan.spans) if (x >= Math.min(s.a[0], s.b[0]) && x <= Math.max(s.a[0], s.b[0])) return spanRow(s, x);
  return null;
}

// ---------- the raster ----------
export interface Raster { x: number; y: number; w: number; h: number; data: Uint8ClampedArray<ArrayBuffer> }
export const createRaster = (box: Rect): Raster => ({ x: box.x, y: box.y, w: Math.max(1, box.w), h: Math.max(1, box.h), data: new Uint8ClampedArray(Math.max(1, box.w) * Math.max(1, box.h) * 4) });
function dot(r: Raster, x: number, y: number, c: RGB) {
  const i = x - r.x, j = y - r.y;
  if (i < 0 || j < 0 || i >= r.w || j >= r.h) return;
  const o = (j * r.w + i) * 4;
  r.data[o] = c[0]; r.data[o + 1] = c[1]; r.data[o + 2] = c[2]; r.data[o + 3] = 255;
}
function fill(r: Raster, x: number, y: number, w: number, h: number, c: RGB) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) dot(r, x + i, y + j, c);
}
function line(r: Raster, x0: number, y0: number, x1: number, y1: number, c: RGB) {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;
  for (;;) {
    dot(r, x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}
/** Paints rows of letters (a space or . is clear), one city px per letter. */
function sprite(r: Raster, x: number, y: number, rows: readonly string[], key: Record<string, RGB>) {
  rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const c = key[row[i]]; if (c) dot(r, x + i, y + j, c); } });
}

/** The dark picture: every opaque pixel to soot, iron[0] or iron[1] by the sum of its RGB (< 60, < 150, else). */
export function posterize(d: Uint8ClampedArray): void {
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const sum = d[i] + d[i + 1] + d[i + 2], c = sum < 60 ? SOOT : sum < 150 ? IRON[0] : IRON[1];
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
}

// ---------- lanterns ----------
const LANTERN = ["..S..", ".SSS.", "SSSSS", "SggGS", "SgggS", "SSSSS", ".SSS."]; // 5 x 7, glass rows 3-4
const SMALL = ["SSS", "ggG", "ggg", "SSS"]; // 3 x 4, glass rows 1-2
const glassKey = (on: boolean) => ({ S: SOOT, g: on ? BRASS[4] : IRON[1], G: on ? BRASS[5] : IRON[2] });
/** One runway lamp with what holds it: a 2 px stem (pylon, junction), a 3 px post on the back rail (deck) or a 3 px arm (lift). */
export function paintLamp(r: Raster, l: Lamp, on: boolean) {
  const key = glassKey(on);
  if (l.kind === "pylon" || l.kind === "junction") {
    fill(r, l.x, l.y + 4, 1, 2, IRON[2]); // stem
    if (l.arm !== undefined) {
      const a = Math.min(l.x, l.arm), b = Math.max(l.x, l.arm); // the arm out to the junction's face, a soot shadow under it
      fill(r, a, l.y + 7, b - a + 1, 1, SOOT);
      fill(r, a, l.y + 6, b - a + 1, 1, IRON[2]);
    }
    sprite(r, l.x - 2, l.y - 3, LANTERN, key);
  } else if (l.kind === "deck") {
    fill(r, l.x, l.y + 3, 1, 3, IRON[2]); // post on the back rail
    sprite(r, l.x - 1, l.y - 1, SMALL, key);
  } else {
    fill(r, l.x - 2, l.y + 3, KIT.lift.arm, 1, IRON[2]); // arm out from the lift's sun side
    dot(r, l.x - 2, l.y + 4, SOOT);
    sprite(r, l.x - 1, l.y - 1, SMALL, key);
  }
}
/** The box a lamp's lantern (and what holds it) covers. */
export function lampBox(l: Lamp): Rect {
  if (l.arm !== undefined) { const a = Math.min(l.x - 2, l.arm), b = Math.max(l.x + 2, l.arm); return { x: a, y: l.y - 3, w: b - a + 1, h: 11 }; }
  if (l.kind === "pylon" || l.kind === "junction") return { x: l.x - 2, y: l.y - 3, w: 5, h: 9 };
  if (l.kind === "deck") return { x: l.x - 1, y: l.y - 1, w: 3, h: 7 };
  return { x: l.x - 2, y: l.y - 1, w: 4, h: 6 };
}

// ---------- chevrons ----------
/** Chevron colours: lit, a brass[3] body with a brass[4] tip; dark, iron[1] (the dark picture is painted at rest). Never cyan. */
const chevronInk = (on: boolean) => (on ? { body: BRASS[3], tip: BRASS[4] } : { body: IRON[1], tip: IRON[1] });
/** One chevron on a horizontal belt: three columns from x (west) on rows c-1..c+1, the tip at the end it points to. */
function chevronH(r: Raster, x: number, c: number, toward: number, on: boolean) {
  const { body, tip } = chevronInk(on), [tipX, midX, backX] = toward < 0 ? [x, x + 1, x + 2] : [x + 2, x + 1, x];
  dot(r, tipX, c, tip);
  for (const dy of [-1, 0, 1]) dot(r, midX, c + dy, body);
  dot(r, backX, c - 1, body); dot(r, backX, c + 1, body);
}
/** One chevron on a lift's belt: three rows from y (top) on columns x-1..x+1, pointing up or down. */
function chevronV(r: Raster, x: number, y: number, up: boolean, on: boolean) {
  const { body, tip } = chevronInk(on), [tipY, midY, backY] = up ? [y, y + 1, y + 2] : [y + 2, y + 1, y];
  dot(r, x, tipY, tip);
  for (const dx of [-1, 0, 1]) dot(r, x + dx, midY, body);
  dot(r, x - 1, backY, body); dot(r, x + 1, backY, body);
}

// ---------- parts ----------
/** Half the distance between a pylon's legs at row y: 2 at the top (5 wide), 4 at the foot (9 wide). */
const TOP_HALF = (KIT.pylon.top - 1) / 2, FOOT_HALF = (KIT.pylon.foot - 1) / 2;
const legHalf = (y: number, top: number, bottom: number) => TOP_HALF + Math.round(((FOOT_HALF - TOP_HALF) * (y - top)) / Math.max(1, bottom - top));
const pylonBottom = (p: PylonPart) => (p.foot === "rim" ? p.c + 3 : p.c - 4);

export function paintPylon(r: Raster, p: PylonPart, on = true) {
  const top = p.c + ROW.legs, bottom = pylonBottom(p), half = (y: number) => legHalf(y, top, bottom);
  // soot outline either side of each leg, closed across the steps where the legs move out
  for (let y = top; y <= bottom; y++) {
    const h = half(y), next = y < bottom ? half(y + 1) : h;
    for (const hh of [h, next]) { dot(r, p.x - hh - 1, y, SOOT); dot(r, p.x + hh + 1, y, SOOT); }
  }
  // an X brace every 6 rows, then the legs over it: shade side iron[1], sun side iron[3]
  for (let y0 = top; y0 < bottom; y0 += KIT.pylon.brace) {
    const y1 = Math.min(bottom, y0 + KIT.pylon.brace);
    line(r, p.x - half(y0) + 1, y0, p.x + half(y1) - 1, y1, IRON[2]);
    line(r, p.x + half(y0) - 1, y0, p.x - half(y1) + 1, y1, IRON[2]);
  }
  for (let y = top; y <= bottom; y++) { dot(r, p.x - half(y), y, IRON[1]); dot(r, p.x + half(y), y, IRON[3]); }
  // the saddle the cables rest on: 7 x 3 brass, its top row lit, a soot outline round it
  fill(r, p.x - 4, top - 4, 9, 4, SOOT);
  fill(r, p.x - 3, top - 3, 7, 1, BRASS[3]);
  fill(r, p.x - 3, top - 2, 7, 2, BRASS[2]);
  dot(r, p.x + 3, top - 3, BRASS[4]); // the saddle's sunny corner
  if (p.foot === "rim") {
    // the foot plate bolted to the rim, under the belt's end: 11 x 2, lit along its top, two brass bolts
    const w = KIT.pylon.plate, half = (w - 1) / 2;
    fill(r, p.x - half - 1, p.c + 3, w + 2, 4, SOOT);
    fill(r, p.x - half, p.c + 4, w, 2, IRON[2]);
    fill(r, p.x - half, p.c + 4, w, 1, IRON[3]);
    dot(r, p.x - half + 1, p.c + 5, BRASS[2]); dot(r, p.x + half - 1, p.c + 5, BRASS[2]);
  } else {
    // under the truss: a tapering leg down to the pier's own floating boulder, on its flat top
    const y0 = p.c + ROW.leg + (p.deep ?? 0), y1 = y0 + KIT.pier.h - 1;
    paintLeg(r, p.x, y0, y1);
    paintPierRock(r, p.x, y1 + 1, on);
  }
}

/** How far a pier's leg reaches each side of its column at row y: 3 under the truss (7 wide) on both sides, narrowing to the
 *  4 px foot (2 on the shade side, 1 on the sun side) that stands on the boulder's 6 px top. */
const legSides = (y: number, y0: number, y1: number) => {
  const f = (y - y0) / Math.max(1, y1 - y0), top = (KIT.pier.top - 1) / 2;
  return { left: top - Math.round(f * (top - KIT.pier.foot / 2)), right: top - Math.round(f * (top - (KIT.pier.foot / 2 - 1))) };
};
/** The leg: two 1 px chords (shade iron[1], sun iron[3]) closing in toward the foot, a soot outline, and one K brace from the
 *  shade chord's top and foot to the middle of the sun chord. */
function paintLeg(r: Raster, x: number, y0: number, y1: number) {
  const at = (y: number) => legSides(y, y0, y1), ym = Math.round((y0 + y1) / 2);
  for (let y = y0; y <= y1; y++) {
    const a = at(y), b = y < y1 ? at(y + 1) : a;
    for (const s of [a, b]) { dot(r, x - s.left - 1, y, SOOT); dot(r, x + s.right + 1, y, SOOT); }
  }
  for (const [ya, yb] of [[y0, ym], [y1, ym]]) line(r, x - at(ya).left + 1, ya, x + at(yb).right - 1, yb, IRON[2]);
  for (let y = y0; y <= y1; y++) { dot(r, x - at(y).left, y, IRON[1]); dot(r, x + at(y).right, y, IRON[3]); }
}

// A pier's floating rock, 14 x 9: one irregular boulder with a flat 6 px top (columns 4-9) that takes the leg's foot. Lit
// from the upper right like the line's underside: a plate[3] lip and plate[2] face up on the right, plate[1] through the
// middle, iron[0] low on the left, a soot outline with a 2 px notch bitten out of its lower left. Lit, one energy[1] fleck
// of crystal shows in it (the only cyan on a pier); dark, that px is rock.
const PIER_ROCK = [
  "....SSSSSS....",
  "..SSffffggSS..",
  ".SeeeffffgggS.",
  "SaeeeeffffggfS",
  "SaaeeeeefffffS",
  ".SaaaeeeeeffS.",
  "..SSaaeeecfS..",
  "....SaaeeeS...",
  ".....SSSSS....",
];
const PIER_ROCK_KEY = (on: boolean): Record<string, RGB> => ({ S: SOOT, a: IRON[0], e: PLATE[1], f: PLATE[2], g: PLATE[3], c: on ? ENERGY[1] : PLATE[1] });
/** The boulder's first column, from the pier's column: its flat top (columns 4-9) sits under the leg's foot (x-3..x+2). */
const PIER_LEFT = -7;
function paintPierRock(r: Raster, x: number, y: number, on: boolean) {
  sprite(r, x + PIER_LEFT, y, PIER_ROCK, PIER_ROCK_KEY(on));
}

/** One column of a belt band, 7 rows from t = c - 3: soot, back rail (a brass stud every 8 px), three plate rows (a soot seam
 *  every 7 px, shifted `step` px toward `toward`), front rail, soot. */
function bandColumn(r: Raster, x: number, c: number, step: number, toward: number) {
  const t = c + ROW.band, seam = mod(x - toward * step, KIT.seam) === 0;
  dot(r, x, t, SOOT);
  dot(r, x, t + 1, mod(x, KIT.stud) === 0 ? BRASS[2] : IRON[2]); // back rail, a brass stud every 8 px
  dot(r, x, t + 2, seam ? SOOT : IRON[3]);
  dot(r, x, t + 3, seam ? SOOT : IRON[2]);
  dot(r, x, t + 4, seam ? SOOT : IRON[2]);
  dot(r, x, t + 5, IRON[1]); // front rail
  dot(r, x, t + 6, SOOT);
}

/** A span, column by column: the belt band (its plates and chevrons shifted `step` px toward b), the truss under it. */
export function paintSpan(r: Raster, s: SpanPart, step: number, on = true) {
  const [xa] = s.a, [xb] = s.b, x0 = Math.min(xa, xb), x1 = Math.max(xa, xb), toward = xb > xa ? 1 : -1;
  const slope = slopeSign(s), web = 4 + (slope ? SLOPED_DEEP : 0);
  for (let x = x0; x <= x1; x++) {
    const t = spanRow(s, x) + ROW.band;
    bandColumn(r, x, spanRow(s, x), step, toward);
    dot(r, x, t + 7, IRON[3]); // the truss: sun lip, top chord...
    dot(r, x, t + 8, IRON[2]);
    dot(r, x, t + 9 + web, IRON[0]); // ...bottom chord, outline
    dot(r, x, t + 10 + web, SOOT);
  }
  // The web, in shadow under the top chord. Flat: a Warren truss, 4 rows, 12 px bays, one diagonal down and one up per
  // bay, a vertical with a brass rivet at every bay end. Sloped: 6 rows, a vertical with its rivet every 12 px and one
  // diagonal per panel from the top of one vertical to the foot of the next, leaning down the slope (on a 1/2 slope a
  // Warren's up-diagonal would lie flat).
  const top = (x: number) => spanRow(s, x) + ROW.band + 9;
  for (let x = x0; x <= x1; x++) {
    if (slope === 0) {
      const u = mod(x, KIT.bay), off = u <= 6 ? Math.floor(u / 2) : Math.floor((KIT.bay - u) / 2);
      dot(r, x, top(x) + off, IRON[1]);
      if (u === 0) { for (let k = 1; k < web; k++) dot(r, x, top(x) + k, IRON[1]); dot(r, x, top(x), BRASS[2]); }
    } else if (mod(x, KIT.bay) === 0) {
      for (let k = 1; k < web; k++) dot(r, x, top(x) + k, IRON[1]);
      const xe = x + KIT.bay;
      if (xe <= x1) {
        if (slope > 0) line(r, x, top(x), xe, top(xe) + web - 1, IRON[1]);
        else line(r, x, top(x) + web - 1, xe, top(xe), IRON[1]);
      }
      dot(r, x, top(x), BRASS[2]); // the vertical's rivet, over the diagonal's end
    }
  }
  // a flat truss ends in a post at each end (riveted on top), so an end that butts against a face (the Customers span on
  // Inbox's plinth) is finished, not a cut bay
  if (slope === 0) for (const x of [x0, x1]) { for (let k = 1; k < web; k++) dot(r, x, top(x) + k, IRON[1]); dot(r, x, top(x), BRASS[2]); }
  // a chevron on every other plate, in the middle of it, advancing with the plates; on a slope it stays upright (all three
  // columns on the middle column's rows)
  for (let x = x0; x <= x1 - 2; x++) if (mod(x - toward * step, KIT.chevron) === 2) chevronH(r, x, spanRow(s, x + 1), toward, on);
}

/** The main cable's row at column x between two rests, sagging, but never within 4 px of the top rail. */
export function cableRow(cable: CablePart, x: number, beltRow: (x: number) => number | null): number {
  const [xa, ya] = cable.a, [xb, yb] = cable.b, len = Math.abs(xb - xa) || 1, f = (x - xa) / (xb - xa);
  const dip = cable.taut ? Math.abs(yb - ya) / 8 : sag(Math.hypot(xb - xa, yb - ya));
  const straight = ya + (yb - ya) * f, y = Math.round(straight + 4 * dip * f * (1 - f));
  const c = beltRow(x);
  return c === null || len < 2 ? y : Math.min(y, c - 2 - KIT.cableClear);
}

export function paintCables(r: Raster, plan: Pick<ConnectorPlan, "cables" | "spans" | "pylons">) {
  const belt = (x: number) => spanAt(plan, x);
  for (const cable of plan.cables) {
    const x0 = Math.min(cable.a[0], cable.b[0]), x1 = Math.max(cable.a[0], cable.b[0]);
    const ys = new Map<number, number>();
    for (let x = x0; x <= x1; x++) ys.set(x, cableRow(cable, x, belt));
    // hangers every 6 px, cable to back rail, clear of the pylons
    for (let x = x0 + 1; x < x1; x++) {
      const c = belt(x);
      if (c === null || mod(x, KIT.hanger) !== 3 || plan.pylons.some((p) => Math.abs(p.x - x) <= 4)) continue;
      for (let y = ys.get(x)! + 2; y <= c + ROW.band - 1; y++) dot(r, x, y, IRON[2]);
    }
    // the cable: 1 px iron[3] with a soot line under it; each column fills down to the next, so it never breaks
    const px: XY[] = [];
    for (let x = x0; x <= x1; x++) {
      const y = ys.get(x)!, n = ys.get(x + 1) ?? y;
      px.push([x, y]);
      for (let k = Math.min(y, n) + 1; k < Math.max(y, n); k++) px.push([n > y ? x : x + 1, k]);
    }
    const on = new Set(px.map(([x, y]) => `${x},${y}`));
    for (const [x, y] of px) if (!on.has(`${x},${y + 1}`)) dot(r, x, y + 1, SOOT);
    for (const [x, y] of px) dot(r, x, y, IRON[3]);
    // a cable anchored on the deck itself ends in an eye bolted to the back rail
    for (const [ex] of [cable.a, cable.b]) {
      const c = belt(ex), y = ys.get(ex)!;
      if (c !== null && c + ROW.band - y <= 8) for (let k = y + 2; k <= c + ROW.band - 1; k++) dot(r, ex, k, IRON[2]);
    }
  }
}

/** A lift: the 13-wide lattice tower (K braces every 8 rows) with the 7-wide belt standing up inside it. */
/** One row of a belt standing up, 7 wide round column x: soot, shade rail, three plates (lit toward the sun; a soot seam every
 *  7 rows, shifted by `flow`), sun rail with a brass stud every 8 px, soot. */
function beltRowV(r: Raster, x: number, y: number, flow: number) {
  const seam = mod(y + flow, KIT.seam) === 0;
  dot(r, x - 3, y, SOOT);
  dot(r, x - 2, y, IRON[1]);
  dot(r, x - 1, y, seam ? SOOT : IRON[2]);
  dot(r, x, y, seam ? SOOT : IRON[2]);
  dot(r, x + 1, y, seam ? SOOT : IRON[3]);
  dot(r, x + 2, y, mod(y, KIT.stud) === 0 ? BRASS[2] : IRON[2]);
  dot(r, x + 3, y, SOOT);
}
export function paintLift(r: Raster, l: LiftPart, step: number, on = true) {
  const { x } = l, h = KIT.lift.half, flow = l.up ? step : -step;
  for (let y = l.top; y <= l.bottom; y++) {
    dot(r, x - h, y, SOOT); dot(r, x - h + 1, y, IRON[1]); dot(r, x + h - 1, y, IRON[3]); dot(r, x + h, y, SOOT);
    beltRowV(r, x, y, flow);
  }
  // the cage's K braces, in front of the belt: a strut every 8 rows and two half-diagonals from the shade chord to the
  // middle of the sun chord, each with a soot shadow under it
  for (let y0 = l.top + 4; y0 < l.bottom - 2; y0 += KIT.lift.brace) {
    const y1 = Math.min(l.bottom - 1, y0 + KIT.lift.brace), ym = Math.round((y0 + y1) / 2);
    for (const [ax, ay, bx, by] of [[x - h + 2, y0, x + h - 2, ym], [x - h + 2, y1, x + h - 2, ym]]) { line(r, ax, ay + 1, bx, by + 1, SOOT); line(r, ax, ay, bx, by, IRON[2]); }
    fill(r, x - h + 2, y0 + 1, 2 * h - 3, 1, SOOT);
    fill(r, x - h + 2, y0, 2 * h - 3, 1, IRON[3]);
  }
  // the chevrons last, over the braces: a cage drawn over them would hide three in four of them at any moment
  for (let y = l.top; y <= l.bottom - 2; y++) if (mod(y + flow, KIT.chevron) === 2) chevronV(r, x, y, l.up, on);
  fill(r, x - h, l.top, 2 * h + 1, 1, SOOT); // cap
}
/** A lift's foot plate on the rim it stands on (drawn in front of that island). */
function paintLiftFoot(r: Raster, l: LiftPart) {
  const { x } = l, h = KIT.lift.half;
  fill(r, x - h - 1, l.bottom - 1, 2 * h + 3, 4, SOOT);
  fill(r, x - h, l.bottom, 2 * h + 1, 2, IRON[2]);
  fill(r, x - h, l.bottom, 2 * h + 1, 1, IRON[3]);
  dot(r, x - h + 1, l.bottom + 1, BRASS[2]); dot(r, x + h - 1, l.bottom + 1, BRASS[2]);
}

// The gear housing, 7 x 7: brass[2] ring lit on its upper right (brass[3]), iron[1] spokes, a brass[3] hub, soot inside.
const GEAR = ["..RRL..", ".RssLL.", "RsksksL", "RkkHkkL", "RsksksR", ".RsssR.", "..RRR.."];
const GEAR_KEY: Record<string, RGB> = { R: BRASS[2], L: BRASS[3], s: SOOT, k: IRON[1], H: BRASS[3] };
export function paintGear(r: Raster, x: number, y: number) { sprite(r, x - 3, y - 3, GEAR, GEAR_KEY); }

/** A lattice block: soot outline, iron[2] frame lit on its top and right, X braces in iron[1] in panels of `panel` rows. */
function paintBlock(r: Raster, b: Rect, panel: number) {
  const x1 = b.x + b.w - 1, y1 = b.y + b.h - 1;
  for (let y0 = b.y + 2; y0 < y1 - 1; y0 += panel) {
    const ye = Math.min(y1 - 2, y0 + panel - 1);
    line(r, b.x + 2, y0, x1 - 2, ye, IRON[1]);
    line(r, x1 - 2, y0, b.x + 2, ye, IRON[1]);
    if (y0 > b.y + 2) fill(r, b.x + 2, y0, b.w - 4, 1, IRON[2]);
  }
  for (let y = b.y; y <= y1; y++) { dot(r, b.x, y, SOOT); dot(r, x1, y, SOOT); dot(r, b.x + 1, y, IRON[1]); dot(r, x1 - 1, y, IRON[3]); }
  for (let x = b.x; x <= x1; x++) { dot(r, x, b.y, SOOT); dot(r, x, y1, SOOT); }
  fill(r, b.x + 1, b.y + 1, b.w - 2, 1, IRON[3]);
  fill(r, b.x + 2, y1 - 1, b.w - 3, 1, IRON[0]);
}
export function paintJunction(r: Raster, j: JunctionPart) {
  const n = KIT.junction;
  paintBlock(r, { x: j.x - n, y: j.y - n, w: 2 * n + 1, h: 2 * n + 1 }, 2 * n + 1);
  paintGear(r, j.x, j.y);
}
function paintBracket(r: Raster, b: Rect) {
  fill(r, b.x, b.y, b.w, b.h, SOOT);
  if (b.w > 2 && b.h > 2) { fill(r, b.x + 1, b.y + 1, b.w - 2, b.h - 2, IRON[2]); dot(r, b.x + b.w - 2, b.y + 1, IRON[3]); }
  else fill(r, b.x, b.y, b.w, 1, IRON[2]);
}

/** Where a Hub belt ends: under the line's west rail (the line's deck starts at x 0), in a soot cap. */
export const HUB_STUB_END = 1;
/** The rows a Hub belt leaves through the Hub's east face on: each west port's, and a top port's turn. */
export const hubExits = (hub: HubPlan): number[] => hub.ports.map(([px, py]) => (px === hub.box.x ? py : hub.turn ?? py + 6));
/** The Hub: a tall lattice block, a gear housing and a short belt at each port that is used. A west port's belt runs east
 *  through the Hub; a top port's (a phone's trunk) runs on down inside it to a gear that turns it east at `turn`. Either way
 *  it leaves through the Hub's east face as a 7-row stub, across the gap and under the line's west rail, so no sky shows
 *  between the Hub and the line on that belt's rows; the brackets that bolt the Hub to the line clamp over the stubs. */
export function paintHub(r: Raster, hub: HubPlan, step: number, on = true) {
  const b = hub.box, cx = b.x + Math.floor(b.w / 2), east = b.x + b.w;
  paintBlock(r, b, 12);
  const stub = (row: number) => {
    for (let x = east; x < HUB_STUB_END; x++) bandColumn(r, x, row, step, 1);
    for (let x = east - 2; x <= HUB_STUB_END - 3; x++) if (mod(x - step, KIT.chevron) === 2) chevronH(r, x, row, 1, on);
    fill(r, HUB_STUB_END, row + ROW.band, 1, 7, SOOT); // the end cap
  };
  for (const [px, py] of hub.ports) {
    if (px === b.x) {
      // a west port: the belt runs in through the west face, on east through the Hub and into the line
      paintSpan(r, { a: [b.x, py], b: [east - 1, py] }, step, on);
      stub(py);
      paintGear(r, cx, py);
    } else {
      // the top port: the trunk's belt runs on down to a gear that turns it east, through the Hub and into the line
      const turn = hub.turn ?? py + 6;
      for (let y = py; y <= turn; y++) beltRowV(r, cx, y, -step);
      for (let y = py; y <= turn - 2; y++) if (mod(y - step, KIT.chevron) === 2) chevronV(r, cx, y, false, on);
      paintSpan(r, { a: [cx, turn], b: [east - 1, turn] }, step, on);
      stub(turn);
      paintGear(r, cx, turn);
    }
  }
  for (const br of hub.brackets) paintBracket(r, br);
}

// ---------- the whole connector ----------
/** Everything a connector covers, city px (a little margin for the outlines). */
export function planBounds(plan: ConnectorPlan): Rect {
  const boxes = planBoxes(plan);
  const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)), y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0 - 2, y: y0 - 2, w: x1 - x0 + 4, h: y1 - y0 + 4 };
}

/** One member's box, named for the tests. */
export interface MemberBox extends Rect { part: "span" | "cable" | "pylon" | "pier" | "lift" | "junction" | "bracket" | "lamp" | "hub" }
/** Every member's bounding box: spans and lifts in 12 px chunks (a sloped span's one box would cover an empty triangle). */
export function planBoxes(plan: ConnectorPlan): MemberBox[] {
  const out: MemberBox[] = [];
  const belt = (x: number) => spanAt(plan, x);
  for (const s of plan.spans) {
    const x0 = Math.min(s.a[0], s.b[0]), x1 = Math.max(s.a[0], s.b[0]), end = trussEnd(s);
    for (let a = x0; a <= x1; a += 12) {
      const b = Math.min(x1, a + 11);
      let top = Infinity, bottom = -Infinity;
      for (let x = a; x <= b; x++) { const c = spanRow(s, x); top = Math.min(top, c + ROW.band); bottom = Math.max(bottom, c + end); }
      out.push({ part: "span", x: a, y: top, w: b - a + 1, h: bottom - top + 1 });
    }
  }
  for (const cable of plan.cables) {
    const x0 = Math.min(cable.a[0], cable.b[0]), x1 = Math.max(cable.a[0], cable.b[0]);
    for (let a = x0; a <= x1; a += 12) {
      const b = Math.min(x1, a + 11);
      let top = Infinity, bottom = -Infinity;
      for (let x = a; x <= b; x++) { const y = cableRow(cable, x, belt), c = belt(x); top = Math.min(top, y); bottom = Math.max(bottom, c === null ? y + 1 : c + ROW.band); }
      out.push({ part: "cable", x: a, y: top, w: b - a + 1, h: bottom - top + 1 });
    }
  }
  for (const p of plan.pylons) {
    const top = p.c + ROW.legs - 4;
    if (p.foot === "rim") out.push({ part: "pylon", x: p.x - 7, y: top, w: 15, h: p.c + 6 - top + 1 });
    else {
      // the tower above the deck, then the leg and its boulder under the truss
      const deep = p.deep ?? 0;
      out.push({ part: "pylon", x: p.x - 7, y: top, w: 15, h: p.c - top + 1 });
      out.push({ part: "pier", x: p.x + PIER_LEFT, y: p.c + ROW.leg + deep, w: KIT.pier.rockW, h: ROW.rockEnd + 1 - ROW.leg });
    }
  }
  for (const l of plan.lifts) {
    for (let a = l.top; a <= l.bottom; a += 12) {
      const b = Math.min(l.bottom, a + 11);
      out.push({ part: "lift", x: l.x - KIT.lift.half - (l.foot ? 1 : 0), y: a, w: 2 * KIT.lift.half + 1 + (l.foot ? 2 : 0), h: b - a + 1 + (l.foot && b === l.bottom ? 3 : 0) });
    }
  }
  for (const j of plan.junctions) out.push({ part: "junction", x: j.x - KIT.junction, y: j.y - KIT.junction, w: 2 * KIT.junction + 1, h: 2 * KIT.junction + 1 });
  for (const b of plan.brackets) out.push({ part: "bracket", ...b });
  for (const l of plan.lamps) out.push({ part: "lamp", ...lampBox(l) });
  return out;
}
export function hubBoxes(hub: HubPlan): MemberBox[] {
  const east = hub.box.x + hub.box.w, stubs = hubExits(hub).map((row): MemberBox => ({ part: "hub", x: east, y: row + ROW.band, w: HUB_STUB_END + 1 - east, h: 7 }));
  return [{ part: "hub", ...hub.box }, ...stubs, ...hub.brackets.map((b) => ({ part: "bracket" as const, ...b }))];
}

/** Paints a connector, back part (behind the islands) or front part (rim pylons, foot plates and brackets, in front). */
export function paintConnector(r: Raster, plan: ConnectorPlan, o: { pass: "back" | "front"; step: number; on: boolean }) {
  if (o.pass === "back") {
    for (const l of plan.lifts) paintLift(r, l, o.step, o.on);
    paintCables(r, plan);
    for (const s of plan.spans) paintSpan(r, s, o.step, o.on);
    for (const p of plan.pylons) if (p.foot !== "rim") paintPylon(r, p, o.on);
    for (const j of plan.junctions) paintJunction(r, j);
  } else {
    for (const l of plan.lifts) if (l.foot) paintLiftFoot(r, l);
    for (const p of plan.pylons) if (p.foot === "rim") paintPylon(r, p, o.on);
    for (const b of plan.brackets) paintBracket(r, b);
  }
  const front = (l: Lamp) => l.kind === "pylon" && plan.pylons.some((p) => p.foot === "rim" && p.x === l.x);
  for (const l of plan.lamps) if (front(l) === (o.pass === "front")) paintLamp(r, l, o.on);
}

// ---------- the lit reach ----------
/** How far from the lit end (belt px) the lit part reaches with `lampsLit` lamps on: halfway to the next lamp, so lamp j is
 *  lit exactly when j < lampsLit; everything once the last is on. */
export function litReach(plan: Pick<ConnectorPlan, "lamps" | "length">, lampsLit: number): number {
  const n = plan.lamps.length;
  if (lampsLit <= 0 || n === 0) return 0;
  if (lampsLit >= n) return Infinity;
  return (plan.lamps[lampsLit - 1].dist + plan.lamps[lampsLit].dist) / 2;
}
/** How far each side of a stretch its members reach: a span from its lanterns' tops (46 above the belt) to its pier boulders
 *  (32 below on a sloped span), a lift from its shade side and a junction lantern on its west arm (16 left) to its lantern
 *  arms (10 right); and how far past its lit end or past a stretch already wholly lit (a pylon, a junction) the cut reaches. */
const REACH = { above: 50, below: 42, left: 16, width: 34, end: 16 } as const;
/** The part of a connector within `reach` belt px of its lit end, as rects: each stretch of the path cut across at the
 *  reach and widened to everything that stretch carries (lanterns, cables, piers, lift arms). */
export function litRects(plan: Pick<ConnectorPlan, "path">, reach: number): Rect[] {
  const { path } = plan, out: Rect[] = [];
  if (reach <= 0) return out;
  let left = reach;
  for (let i = path.length - 1; i >= 1 && left > 0; i--) {
    const [bx, by] = path[i], [ax, ay] = path[i - 1], len = Math.hypot(bx - ax, by - ay);
    if (!len) continue;
    const take = Math.min(len, left), f = take / len, end = i === path.length - 1 ? REACH.end : 0, whole = take >= len ? REACH.end : 0;
    if (ax === bx) {
      const y = by + (ay - by) * f, y0 = Math.min(by, y), y1 = Math.max(by, y), s = Math.sign(ay - by);
      const lo = s > 0 ? y0 - end : y0 - whole, hi = s > 0 ? y1 + whole : y1 + end;
      out.push({ x: bx - REACH.left, y: Math.floor(lo), w: REACH.width, h: Math.ceil(hi) - Math.floor(lo) + 1 });
    } else {
      const x = bx + (ax - bx) * f, s = Math.sign(ax - bx);
      const lo = s > 0 ? Math.min(bx, x) - end : Math.min(bx, x) - whole, hi = s > 0 ? Math.max(bx, x) + whole : Math.max(bx, x) + end;
      const y0 = Math.min(ay, by) - REACH.above, y1 = Math.max(ay, by) + REACH.below;
      // a cut between two whole columns, so a lamp is either lit or not
      const cutLo = s > 0 ? Math.floor(lo) : Math.ceil(lo), cutHi = s > 0 ? Math.floor(hi) : Math.ceil(hi);
      out.push({ x: cutLo, y: y0, w: cutHi - cutLo + 1, h: y1 - y0 + 1 });
    }
    left -= take;
  }
  return out;
}

// ---------- cached pictures ----------
type Canvas = { c: HTMLCanvasElement; g: CanvasRenderingContext2D };
const makeCanvas = (w: number, h: number): Canvas => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  return { c, g };
};
const toCanvas = (r: Raster): HTMLCanvasElement => {
  const { c, g } = makeCanvas(r.w, r.h);
  g.putImageData(new ImageData(r.data, r.w, r.h), 0, 0);
  return c;
};

export interface ConnectorFrame { lampsLit: number; step: number }
export interface ConnectorPicture {
  /** The part behind the islands: the dark picture, the lit part over it. */
  drawBack(ctx: CanvasRenderingContext2D, frame: ConnectorFrame): void;
  /** The part in front of the islands: rim pylons, foot plates, brackets. */
  drawFront(ctx: CanvasRenderingContext2D, frame: ConnectorFrame): void;
  /** Builds the dark pictures now if they are not built yet. True if it did work. */
  warm(): boolean;
}
export function createConnectorPicture(plan: ConnectorPlan): ConnectorPicture {
  const box = planBounds(plan);
  let darkBack: HTMLCanvasElement | null = null, darkFront: HTMLCanvasElement | null = null, litFront: HTMLCanvasElement | null = null;
  const litBack = new Map<number, HTMLCanvasElement>();
  const paint = (pass: "back" | "front", step: number, on: boolean, dark: boolean) => {
    const r = createRaster(box);
    paintConnector(r, plan, { pass, step, on });
    if (dark) posterize(r.data);
    return toCanvas(r);
  };
  const build = () => { darkBack = paint("back", 0, false, true); darkFront = paint("front", 0, false, true); };
  const lit = (step: number) => {
    const k = mod(step, BELT_STEPS);
    let c = litBack.get(k);
    if (!c) litBack.set(k, (c = paint("back", k, true, false)));
    return c;
  };
  const clipped = (ctx: CanvasRenderingContext2D, reach: number, img: HTMLCanvasElement) => {
    if (reach === Infinity) { ctx.drawImage(img, box.x, box.y); return; }
    ctx.save();
    ctx.beginPath();
    for (const r of litRects(plan, reach)) ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.drawImage(img, box.x, box.y);
    ctx.restore();
  };
  return {
    warm() { if (darkBack) return false; build(); return true; },
    drawBack(ctx, frame) {
      if (!darkBack) build();
      ctx.drawImage(darkBack!, box.x, box.y);
      const reach = litReach(plan, frame.lampsLit);
      if (reach > 0) clipped(ctx, reach, lit(frame.step));
    },
    drawFront(ctx, frame) {
      if (!darkFront) build();
      ctx.drawImage(darkFront!, box.x, box.y);
      const reach = litReach(plan, frame.lampsLit);
      if (reach > 0) clipped(ctx, reach, (litFront ??= paint("front", 0, true, false)));
    },
  };
}

export interface HubPicture { draw(ctx: CanvasRenderingContext2D, lit: boolean, step: number): void; warm(): boolean }
export function createHubPicture(hub: HubPlan): HubPicture {
  const bs = hubBoxes(hub), x0 = Math.min(...bs.map((b) => b.x)) - 1, y0 = Math.min(...bs.map((b) => b.y)) - 1;
  const box: Rect = { x: x0, y: y0, w: Math.max(...bs.map((b) => b.x + b.w)) - x0 + 1, h: Math.max(...bs.map((b) => b.y + b.h)) - y0 + 1 };
  let dark: HTMLCanvasElement | null = null;
  const lit = new Map<number, HTMLCanvasElement>();
  const paint = (step: number, isDark: boolean) => {
    const r = createRaster(box);
    paintHub(r, hub, step, !isDark);
    if (isDark) posterize(r.data);
    return toCanvas(r);
  };
  return {
    warm() { if (dark) return false; dark = paint(0, true); return true; },
    draw(ctx, on, step) {
      if (!on) { ctx.drawImage((dark ??= paint(0, true)), box.x, box.y); return; }
      const k = mod(step, BELT_STEPS);
      let c = lit.get(k);
      if (!c) lit.set(k, (c = paint(k, false)));
      ctx.drawImage(c, box.x, box.y);
    },
  };
}
