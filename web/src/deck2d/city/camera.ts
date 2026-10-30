// The city zoom's camera, as pure functions (SPEC.md sections 1 and 3, DIRECTION.md "camera"). Whole-number k only: pixel
// art never scales smoothly. cityCamera says where the camera wants to be; createCityMove says how it gets there.
import { CITY_ISLANDS, CITY_PX, CITY_TIMING, type CityIsland, type CityView } from "../contract";
import {
  ARC_DOTS, LINE_BOX, LINE_LABEL, ROCKET_SPOT, arcEnd, arcPoints, at, bridgePaths, connectorBoxes, islandRect, labelAt,
  type BridgeId, type ConnectorBox, type Path, type Rect, type RingLayout,
} from "./layout";
import type { CityManifest } from "./manifest";

/** CSS px; dpr is capped at 2 by the engine. What a moment keeps clear comes with it: `top`, a reserve under the top edge (a
 *  phone's manual city keeps clear of the Zoom button); `band`, what the bottom keeps for the caption (BAND by default; the
 *  manual city shows no caption); `cardTop`, the top of the sign-in card on screen (beat "card"). */
export interface CityScreen { w: number; h: number; dpr: number; portrait: boolean; top?: number; band?: number; cardTop?: number }

/** CSS px kept clear at each side of the screen. */
export const EDGE = 8;
/** CSS px at the bottom the caption (two lines at city zoom) and the sign-in card's top edge own. */
export const BAND = { landscape: 96, portrait: 80 } as const;
/** City px of air around the ring box. */
export const RING_PAD = 20;
/** The labels are DOM text (deck.css): their CSS size, and so how many city px they cover at each k. A phone's plate is
 *  12 px Silkscreen with 2px 4px of padding inside a 2 px border: 20 CSS px tall. */
export const LABEL_CSS = { big: { text: 20, plate: 24 }, small: { text: 16, plate: 20 }, gap: 4 } as const;
export const isBig = (s: Pick<CityScreen, "w" | "h">) => s.w >= 900 && s.h >= 560;
export const bandOf = (s: CityScreen) => s.band ?? (s.portrait ? BAND.portrait : BAND.landscape);
const topOf = (s: CityScreen) => s.top ?? 0;

/** Height of an island's label (and, with `plate`, the brass plate under it) in CSS px, measured from the label's top. */
export const labelCss = (s: Pick<CityScreen, "w" | "h">, plate: boolean) => {
  const m = isBig(s) ? LABEL_CSS.big : LABEL_CSS.small;
  return m.text + (plate ? LABEL_CSS.gap + m.plate : 0);
};

export const union = (boxes: Rect[]): Rect => {
  const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)), y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

/** One island's sprite plus its label (and plate) region, city px, at this k. */
export function islandBox(layout: RingLayout, manifest: CityManifest, id: CityIsland, screen: CityScreen, k: number, plate: boolean): Rect {
  const r = islandRect(layout, manifest, id), [, ly] = labelAt(layout, manifest, id);
  const bottom = Math.max(r.y + r.h, ly + Math.ceil((labelCss(screen, plate) * screen.dpr) / k));
  return { x: r.x, y: r.y, w: r.w, h: bottom - r.y };
}

/** The dotted rocket arc to Customers' pad with its arrowhead, city px: every dot (5 x 5) and the arrowhead (7 x 5). */
export function arcBox(layout: RingLayout, manifest: CityManifest): Rect {
  const c = manifest.islands.customers, pad = at(layout, "customers", c.pad ?? [Math.round(c.w * 0.84), Math.round(c.h * 0.46)]);
  const dots = arcPoints(ROCKET_SPOT, pad, layout.portrait, ARC_DOTS).map(([x, y]) => ({ x: x - 2, y: y - 2, w: 5, h: 5 }));
  const [tx, ty] = arcEnd(pad);
  return union([...dots, { x: tx - 3, y: ty - 4, w: 7, h: 5 }]);
}

/** What a phone frames for an island: its sprite and label, and for Customers the arc its rocket flies in on. */
export function focusBox(layout: RingLayout, manifest: CityManifest, id: CityIsland, screen: CityScreen, k: number, plate: boolean): Rect {
  const box = islandBox(layout, manifest, id, screen, k, plate);
  return id === "customers" ? union([box, arcBox(layout, manifest)]) : box;
}

/** The whole ring: the line (and its label), every island with its label and plate, plus RING_PAD all round. */
export function ringBox(layout: RingLayout, manifest: CityManifest, screen: CityScreen, k: number, pad = RING_PAD): Rect {
  const lineLabel: Rect = { x: LINE_LABEL[0], y: LINE_LABEL[1], w: 0, h: Math.ceil((labelCss(screen, false) * screen.dpr) / k) };
  const box = union([LINE_BOX, lineLabel, ...CITY_ISLANDS.map((id) => islandBox(layout, manifest, id, screen, k, true))]);
  return { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 };
}

/** What the camera can show, device px: the screen less an edge all round, the caption band at the bottom and the top reserve. */
export const usable = (s: CityScreen) => ({ w: s.w * s.dpr - 2 * EDGE * s.dpr, h: s.h * s.dpr - (bandOf(s) + topOf(s) + 2 * EDGE) * s.dpr });

/** The largest whole k (device px per city px) at which the ring box fits the usable screen; 1 if none does. */
export function ringK(layout: RingLayout, manifest: CityManifest, screen: CityScreen): number {
  const u = usable(screen);
  for (let k = 16; k > 1; k--) {
    const b = ringBox(layout, manifest, screen, k);
    if (b.w * k <= u.w && b.h * k <= u.h) return k;
  }
  return 1;
}

// The connectors' paths and member boxes, made once per layout (the camera asks every frame).
const connectorsOf = (() => {
  const made = new WeakMap<RingLayout, { manifest: CityManifest; paths: Record<BridgeId, Path>; boxes: ConnectorBox[] }>();
  return (layout: RingLayout, manifest: CityManifest) => {
    let c = made.get(layout);
    if (!c || c.manifest !== manifest) made.set(layout, (c = { manifest, paths: bridgePaths(layout, manifest), boxes: connectorBoxes(layout, manifest) }));
    return c;
  };
})();

/** City px of air round each point of a connector's path when a desktop frames it. */
export const PATH_AIR = 8;
/** What a desktop frames for an island one step closer (k_ring + 1): the island and its label (Customers' with its arc), its
 *  connector's whole run (every point of its path, PATH_AIR round it) and the end of the line nearest it: the Hub's west face
 *  (x -18) for Errors and Traffic, the line's belly (96, 36) for Inbox, the rocket for Customers and for Marketing, which has
 *  no connector and hangs off the line's launch end. */
export function pushBox(layout: RingLayout, manifest: CityManifest, id: CityIsland, screen: CityScreen, k: number, plate: boolean): Rect {
  const parts = [focusBox(layout, manifest, id, screen, k, plate)], path = id === "marketing" ? [] : connectorsOf(layout, manifest).paths[id];
  parts.push(...path.map(([x, y]) => ({ x: x - PATH_AIR, y: y - PATH_AIR, w: 2 * PATH_AIR, h: 2 * PATH_AIR })));
  const [nx, ny] = id === "customers" || id === "marketing" ? ROCKET_SPOT : path[path.length - 1]; // a path ends at the line: the Hub, or the belly
  return union([...parts, { x: nx, y: ny, w: 0, h: 0 }]);
}

/** CSS px a phone's close-up keeps between the screen's sides and its island (Errors with its trunk, Customers with its arc);
 *  also how far past the city a close-up may look at either side. */
export const SIDE = 24;
/** CSS px of sky a phone's close-up may show above the ring, so the top island can sit low enough to read. */
export const SKY_ABOVE = 300;
/** Where a phone's close-up puts its island's middle: this share of the way down the usable height. */
export const AIM = 0.375;
/** CSS px a phone's close-up moves, at most, so no other island is cut by an edge (wholly in, or wholly out). */
export const NUDGE = 80;
/** CSS px a phone moves its picture, at most, to take another island out from under the caption band. */
export const LIFT = 60;

/** Everything a phone's close-up may look at, city px: the ring box, every connector member and the rocket arc. */
export function roomBox(layout: RingLayout, manifest: CityManifest, screen: CityScreen, k: number): Rect {
  return union([ringBox(layout, manifest, screen, k), ...connectorsOf(layout, manifest).boxes, arcBox(layout, manifest)]);
}

/** What a phone's close-up keeps SIDE clear of the screen's sides: the island, Errors' trunk, Customers' arc. */
export function sideBox(layout: RingLayout, manifest: CityManifest, id: CityIsland): Rect {
  const parts = [islandRect(layout, manifest, id)];
  if (id === "errors") parts.push(...connectorsOf(layout, manifest).boxes.filter((b) => b.id === "errors"));
  if (id === "customers") parts.push(arcBox(layout, manifest));
  return union(parts);
}

export interface CityShot { x: number; y: number; k: number }

const clampOr = (v: number, lo: number, hi: number, fallback: number) => (hi < lo ? fallback : Math.max(lo, Math.min(hi, v)));
/** The whole step nearest `v`, at most `most` away, that `allowed` takes and that leaves the fewest `cuts`: `v` itself when
 *  nothing is cut there, or when no allowed step has fewer cuts. */
function nudge(v: number, most: number, cuts: (v: number) => number, allowed: (v: number) => boolean): number {
  let best = v, fewest = cuts(v);
  for (let d = 1; d <= most && fewest > 0; d++) for (const c of [v - d, v + d]) {
    if (!allowed(c)) continue;
    const n = cuts(c);
    if (n < fewest) { best = c; fewest = n; }
  }
  return best;
}

/** A view of the city at k, city px on the pixel canvas's own grid (whole px, its size as the canvas makes it): its top-left
 *  (x, y) and size, and how many other islands' sprites it cuts, across a side (x) or across the top or bottom edge (y). */
function viewAt(layout: RingLayout, manifest: CityManifest, focus: CityIsland, screen: CityScreen, k: number) {
  const bw = Math.ceil((screen.w * screen.dpr) / k), bh = Math.ceil((screen.h * screen.dpr) / k);
  const sprites = CITY_ISLANDS.filter((o) => o !== focus).map((o) => islandRect(layout, manifest, o));
  const on = (r: Rect, x: number, y: number) => r.x < x + bw && r.x + r.w > x && r.y < y + bh && r.y + r.h > y;
  return {
    bw, bh,
    cutsX: (x: number, y: number) => sprites.filter((r) => on(r, x, y) && (r.x < x || r.x + r.w > x + bw)).length,
    cutsY: (x: number, y: number) => sprites.filter((r) => on(r, x, y) && (r.y < y || r.y + r.h > y + bh)).length,
  };
}
const shotOf = (x: number, y: number, bw: number, bh: number, k: number): CityShot => ({ x: (x + bw / 2) * CITY_PX, y: (y + bh / 2) * CITY_PX, k });

/** Where the ring (or any box) sits in the usable screen: centred, so half the caption band below its own centre and half the
 *  top reserve above it. A box too tall for the usable height instead keeps its top EDGE under the reserve when there is one
 *  (`pinTop`), so nothing the reserve keeps clear is ever under it. */
function centreOn(box: Rect, screen: CityScreen, k: number, band = bandOf(screen), pinTop = false): CityShot {
  const x = (box.x + box.w / 2) * CITY_PX, room = screen.h * screen.dpr - (band + topOf(screen) + 2 * EDGE) * screen.dpr;
  if (pinTop && box.h * k > room) return { x, y: (box.y - ((EDGE + topOf(screen)) * screen.dpr) / k + (screen.h * screen.dpr) / k / 2) * CITY_PX, k };
  return { x, y: (box.y + box.h / 2 + ((band - topOf(screen)) * screen.dpr) / 2 / k) * CITY_PX, k };
}

/** World centre and whole k for a city view (CITY_PX world units per city px).
 *  - No focus: the whole ring at k_ring, centred in the usable screen. At beat "card" on a phone the sign-in card's top is the
 *    band (8 px above it): the ring re-centres above the card if it fits there, else its top stays EDGE under the screen's top.
 *  - A focus (the story sets one only in beat 3) on a desktop: pushIn, one step closer; the ring when that does not fit.
 *  - A focus on a phone: closeUp, one step closer. */
export function cityCamera(view: Pick<CityView, "focus" | "plates"> & Partial<Pick<CityView, "beat">>, screen: CityScreen, layout: RingLayout, manifest: CityManifest): CityShot {
  const kRing = ringK(layout, manifest, screen), ring = ringBox(layout, manifest, screen, kRing);
  if (view.focus && screen.portrait) return closeUp(view.focus, view.plates, screen, layout, manifest, kRing);
  if (view.focus) { const shot = pushIn(view.focus, view.plates, screen, layout, manifest, kRing); if (shot) return shot; }
  if (view.beat === "card" && screen.portrait && screen.cardTop !== undefined)
    return centreOn(ring, screen, kRing, Math.max(BAND.portrait, screen.h - screen.cardTop + EDGE), true);
  return centreOn(ring, screen, kRing, bandOf(screen), topOf(screen) > 0);
}

/** A desktop's close-up of one island at k_ring + 1: pushBox centred in the usable screen (so half the caption band below the
 *  screen's middle). A box up to EDGE too tall for that may use the top EDGE: its foot stays on the usable height, above the
 *  band, so its label still shows (Customers' arc on a 1280 x 720 screen). Any taller and the ring stays. Then, as on a phone,
 *  the picture moves at most NUDGE CSS px, the box still wholly in the usable screen, so that fewer other islands are cut by
 *  an edge (each wholly in, or wholly out). */
function pushIn(id: CityIsland, plates: CityView["plates"], screen: CityScreen, layout: RingLayout, manifest: CityManifest, kRing: number): CityShot | null {
  const k = kRing + 1, toCity = screen.dpr / k, edge = EDGE * toCity, top = topOf(screen) * toCity, band = bandOf(screen) * toCity;
  const box = pushBox(layout, manifest, id, screen, k, !!plates[id]), u = usable(screen);
  if (box.w * k > u.w || box.h * k > u.h + EDGE * screen.dpr) return null;
  const { bw, bh, cutsX, cutsY } = viewAt(layout, manifest, id, screen, k), most = Math.floor(NUDGE * toCity);
  // the view's top-left on whole px: the box EDGE inside both sides; its foot EDGE above the band, its head EDGE under the top
  // (or, when it is a few px too tall for that, its foot where it must be and its head in the top EDGE)
  const xlo = Math.ceil(box.x + box.w + edge - bw), xhi = Math.floor(box.x - edge);
  const ylo = Math.ceil(box.y + box.h + band + edge - bh), yhi = Math.max(ylo, Math.floor(box.y - edge - top));
  let x = clampOr(Math.round(box.x + box.w / 2 - bw / 2), xlo, xhi, xlo);
  let y = clampOr(Math.round(box.y + box.h / 2 - (bh - band + top) / 2), ylo, yhi, ylo);
  const inX = (v: number) => v >= xlo && v <= xhi, inY = (v: number) => v >= ylo && v <= yhi, x0 = x;
  x = nudge(x, most, (v) => cutsX(v, y), inX);
  y = nudge(y, most, (v) => cutsY(x, v), inY);
  if (cutsX(x, y) > cutsX(x0, y)) x = nudge(x0, most, (v) => cutsX(v, y), inX); // the move in y brought an island in at a side
  return shotOf(x, y, bw, bh, k);
}

/** A phone's close-up of one island at k_ring + 1:
 *  1. x: a phone's ring stands in two columns, left and right of the line's middle. The view's edge goes in the gap between
 *     them, 1 px clear of the other column, so that column is wholly out (on a 390 px phone: x 134 for Errors and Inbox, 390
 *     for Traffic, Customers and Marketing), then stays inside roomBox with SIDE CSS px to spare at either side, keeps the
 *     island (Errors' trunk, Customers' arc) SIDE clear of both sides, and moves at most NUDGE so no other island is cut.
 *  2. y: the island's box (sprite and label, Customers' arc) AIM of the way down the usable height, inside roomBox with up to
 *     SKY_ABOVE CSS px of sky above it and nothing below it; then, when another island (or the line) would sit half under the
 *     caption band, the picture moves by up to LIFT to take it out: up, when it hangs down into the band from above, or down,
 *     when its top peeks up into the band from below the screen, never so far that the framed island leaves the usable
 *     height; then at most NUDGE so no other island is cut by the top or bottom edge. */
function closeUp(id: CityIsland, plates: CityView["plates"], screen: CityScreen, layout: RingLayout, manifest: CityManifest, kRing: number): CityShot {
  const k = kRing + 1, toCity = screen.dpr / k, edge = EDGE * toCity, top = topOf(screen) * toCity, band = bandOf(screen) * toCity;
  const { bw, bh, cutsX, cutsY } = viewAt(layout, manifest, id, screen, k);
  const box = focusBox(layout, manifest, id, screen, k, !!plates[id]), room = roomBox(layout, manifest, screen, kRing), side = SIDE * toCity;
  const tags = [...CITY_ISLANDS.filter((o) => o !== id).map((o) => islandBox(layout, manifest, o, screen, k, !!plates[o])), LINE_BOX];
  const most = Math.floor(NUDGE * toCity), lift = LIFT * toCity;
  // another island (or the line) half under the caption band by no more than LIFT: the camera could have taken it out
  const underBand = (x: number, y: number) => {
    const bandTop = y + bh - band, bottom = y + bh;
    return tags.filter((b) => b.x < x + bw && b.x + b.w > x).filter((b) =>
      (b.y < bandTop && b.y + b.h > bandTop && b.y + b.h <= bottom && b.y + b.h - bandTop <= lift) || (b.y >= bandTop && b.y < bottom && bottom - b.y <= lift)).length;
  };
  const framed = (y: number) => box.y >= y + edge + top && box.y + box.h <= y + bh - band; // the island in the usable height

  // y, first pass: the island's middle AIM of the way down the usable height, inside the room
  const usableH = bh - band - 2 * edge - top;
  let y = Math.round(clampOr(box.y + box.h / 2 - AIM * usableH - edge - top, room.y - SKY_ABOVE * toCity, room.y + room.h + band - bh, room.y + (room.h + band - bh) / 2));

  // x: the gap between the columns, inside the room, the island SIDE clear of both sides, no other island cut
  const mid = LINE_BOX.x + LINE_BOX.w / 2, own = islandRect(layout, manifest, id), all = CITY_ISLANDS.map((o) => islandRect(layout, manifest, o));
  const onLeft = own.x + own.w / 2 < mid, other = all.filter((r) => (r.x + r.w / 2 < mid) !== onLeft); // the other column
  let x = !other.length ? own.x + own.w / 2 - bw / 2 : onLeft ? Math.min(...other.map((r) => r.x)) - 1 - bw : Math.max(...other.map((r) => r.x + r.w)) + 1;
  x = clampOr(x, room.x - side, room.x + room.w + side - bw, room.x + (room.w - bw) / 2);
  const keep = sideBox(layout, manifest, id), clear = (v: number) => keep.x >= v + side && keep.x + keep.w <= v + bw - side;
  x = Math.round(clampOr(x, keep.x + keep.w + side - bw, keep.x - side, x));
  const settleX = (x0: number, yy: number) => nudge(x0, most, (v) => cutsX(v, yy), (v) => (clear(v) || !clear(x0)) && underBand(v, yy) <= underBand(x0, yy));
  x = settleX(x, y);

  // y: the band lift, then as few islands as can be cut by the top or bottom edge
  const bandTop = y + bh - band, bottom = y + bh;
  let up = 0, down = 0; // city px the picture has to move up (camera down) or down (camera up)
  for (const b of tags) {
    if (b.x + b.w <= x || b.x >= x + bw || b.y + b.h <= bandTop || b.y >= bottom) continue; // not in the band
    if (b.y < bandTop && b.y + b.h <= bottom) up = Math.max(up, b.y + b.h - bandTop); // hangs into the band from above
    else if (b.y >= bandTop) down = Math.max(down, bottom - b.y); // peeks up into the band from below the screen
  }
  const roomUp = box.y - (y + edge + top), roomDown = bandTop - (box.y + box.h);
  if (up > 0 && !down && up <= lift && up <= roomUp) y += Math.ceil(up);
  else if (down > 0 && !up && down <= lift && down <= roomDown) y -= Math.ceil(down);
  const y0 = y;
  y = nudge(y, most, (v) => cutsY(x, v), (v) => (framed(v) || !framed(y0)) && underBand(x, v) <= underBand(x, y0));
  if (cutsX(x, y) > cutsX(x, y0)) x = settleX(x, y); // a move in y brought a new island in at a side
  return shotOf(x, y, bw, bh, k);
}

// ---------- moving there ----------
/** The engine's camera: world centre and scale (CSS px per world unit). */
export interface CamPose { x: number; y: number; s: number }
/** A hop longer than this (CSS px on screen) is a cut: half the usable height (374 on a 390 x 844 phone). */
export const cutHop = (s: CityScreen) => ((s.h - bandOf(s) - topOf(s) - 2 * EDGE) * 0.5);
/** One frame of a city camera move. */
export interface CityStep { pose: CamPose; cut: boolean }

/** How the camera gets to cityCamera's target (motion-2). A new k cuts x, y and the scale in the same frame; so does a hop
 *  longer than cutHop. Any other new target glides on a fixed smoothstep over CITY_TIMING.move from where the camera was when
 *  the target changed (u = min(1, t / move), e = u * u * (3 - 2 * u)), x and y on whole device px. */
export function createCityMove(move: number = CITY_TIMING.move) {
  let from: CamPose | null = null, to: CamPose | null = null, t = 0;
  const cut = (target: CamPose): CityStep => { from = { ...target }; to = { ...target }; t = move; return { pose: { ...target }, cut: true }; };
  return {
    step(cam: CamPose, target: CamPose, dt: number, screen: CityScreen): CityStep {
      if (!to || to.x !== target.x || to.y !== target.y || to.s !== target.s) {
        if (target.s !== cam.s || Math.hypot(target.x - cam.x, target.y - cam.y) * target.s > cutHop(screen)) return cut(target);
        from = { x: cam.x, y: cam.y, s: cam.s }; to = { ...target }; t = 0;
      }
      t = Math.min(move, t + dt);
      const u = move > 0 ? t / move : 1;
      if (u >= 1) return { pose: { ...to }, cut: false };
      const e = u * u * (3 - 2 * u), dev = to.s * screen.dpr; // device px per world unit
      const x = from!.x + (to.x - from!.x) * e, y = from!.y + (to.y - from!.y) * e;
      return { pose: { x: Math.round(x * dev) / dev, y: Math.round(y * dev) / dev, s: to.s }, cut: false };
    },
    /** Forget the move in progress: the next step starts from wherever the camera is (after a zoom change or a cut). */
    reset() { from = to = null; t = 0; },
  };
}
export type CityMove = ReturnType<typeof createCityMove>;
