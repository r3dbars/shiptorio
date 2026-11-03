// Where everything sits in the city, in city px (1 city px = CITY_PX = 10 world units = 2 deck art px). Pure maths, no
// canvas: the ring of six islands (DIRECTION.md section B), the connectors between them (spans, lifts, pylons, junctions,
// the Hub, and the 12 runway lamps on each), and the dotted rocket arc. The line keeps its own world position, so city
// (cx, cy) is world (cx * 10, cy * 10).
//
// Island positions are derived from the manifest's anchors, so a span's slope comes out exact whatever the art does: a
// +-2 px change in an anchor moves the island, never bends a span.
import { CITY_ISLANDS, type CityIsland } from "../contract";
import { RING_PAD, labelCss } from "./camera";
import { KIT, ROW, SLOPED_DEEP, cableRow, hubBoxes, planBoxes, slopeSign, spanRow, type CablePart, type ConnectorPlan, type HubPlan, type Lamp, type LiftPart, type MemberBox, type PylonPart, type SpanPart } from "./connector";
import { fallbackManifest, type CityManifest, type Side, type XY } from "./manifest";

export interface Rect { x: number; y: number; w: number; h: number }

/** The real line, drawn one zoom step smaller: the engine's BOUNDS (world x -20..3969, y -30..800) in city px. */
export const LINE_BOX: Rect = { x: -2, y: -3, w: 399, h: 83 };
/** Top-centre of the line's label (the repo name), 6 px under the rocks. */
export const LINE_LABEL: XY = [197, 86];
/** The launch spot the rocket arc leaves from: LAUNCH (3774, 250) in city px. */
export const ROCKET_SPOT: XY = [377, 25];
/** The Hub: the line's west-end intake, a junction tower 15 x 50 bolted to the line's west end (drawn behind the line). */
export const HUB: Rect = { x: -18, y: -6, w: 15, h: 50 };
/** Where a feed meets the Hub (belt centre line). */
export const HUB_PORTS = { upperWest: [-18, 16] as XY, lowerWest: [-18, 30] as XY, top: [-11, -6] as XY, bottom: [-11, 44] as XY };
/** The two 4 x 3 iron brackets that bolt the Hub to the line's west end face, just above each west port's belt centre: they
 *  clamp over the port belts' stubs where those run on under the line. */
export const HUB_BRACKETS: Rect[] = [13, 27].map((y) => ({ x: -KIT.hubBracket.w, y, ...KIT.hubBracket }));

/** The ring's design numbers (DIRECTION.md section B; the final numbers are in README.md). */
export const RING = {
  desktop: {
    errors: { dx: 196, slope: 1 / 2 }, // Errors' e anchor -> the Hub's upper west port
    traffic: { dx: 178, slope: -1 / 2 }, // Traffic's e anchor -> the Hub's lower west port
    // Inbox hangs under its lift (DIRECTION.md B): the lift comes straight down from the line's belly at x 96 onto the plinth
    // beside Inbox's post tower, at its n anchor (row 209), so the sprite's left edge is at x 42, left of the YOUR REPO label
    inboxLiftX: 96, inboxRow: 209,
    customersWx: 473, // Customers' w anchor; its span runs flat to Inbox's e anchor (369 long, three piers)
    marketing: [670, -80] as XY, // low and right enough that the Zoom and mute buttons (top right) never sit over its mast or beacon
  },
  phone: {
    // the Errors trunk: a lift on x -11 from the Hub's top port up to a head junction, and a stub east to Errors' w anchor, 53 px
    // right of the trunk so Errors' label and its 108 CSS px COMING SOON plate (216 city px) clear the trunk by 4 px
    trunkX: -11, errorsWy: -348, errorsWx: 42,
    junctionY: -150, trafficWx: 332, // Traffic's span runs flat from its w anchor west to junction J on the trunk
    inboxLiftX: 40, inboxRow: 213, // as on a desktop: the lift at x 40 lands on Inbox's n anchor (Inbox's left edge at x -14)
    customersWx: 357, // Customers' w anchor; flat to Inbox's e anchor
    marketing: [440, -520] as XY,
  },
} as const;

/** A 390 x 844 phone's usable height at the ring's k 1, city px: 748 CSS px (844 less the 80 px caption band and two 8 px
 *  edges) at 2 city px per CSS px. */
export const PHONE_USABLE_H = 1496;
/** A phone's ring is spread out vertically, at most this much, to use the height it has. */
export const SPREAD_MAX = 1.25;
/** The line's vertical middle: the spread scales each island's offset from it. */
const LINE_MID = LINE_BOX.y + LINE_BOX.h / 2;
/** The phone the spread measures its labels on (small labels, 2 city px per CSS px at k 1). */
const PHONE_SCREEN = { w: 390, h: 844 }, PHONE_CITY_PER_CSS = 2;

export interface RingLayout {
  portrait: boolean;
  /** Top-left of each island sprite. */
  pos: Record<CityIsland, XY>;
  line: Rect;
  /** A phone's vertical spread (1 on a desktop): every island's offset from the line's middle, times this. */
  sy: number;
}

const anchorOf = (manifest: CityManifest, id: CityIsland, side: Side): XY => {
  const art = manifest.islands[id], a = art.anchors[side];
  if (a) return a;
  const fallback: XY = side === "n" ? [art.w * 0.25, art.h * 0.4] : side === "s" ? [art.w * 0.4, art.h * 0.6] : side === "e" ? [art.w - 3, art.h * 0.5] : [3, art.h * 0.5];
  return [Math.round(fallback[0]), Math.round(fallback[1])];
};
const minus = (a: XY, b: XY): XY => [a[0] - b[0], a[1] - b[1]];

type Anchor = (id: CityIsland, side: Side) => XY;
/** A desktop's ring: the Hub spans fix Errors and Traffic, the lift fixes Inbox (its n anchor right under it), and Customers
 *  sits on Inbox's e row. */
function desktopPos(A: Anchor): Record<CityIsland, XY> {
  const D = RING.desktop, up = HUB_PORTS.upperWest, low = HUB_PORTS.lowerWest;
  const inbox = minus([D.inboxLiftX, D.inboxRow], A("inbox", "n"));
  return {
    errors: minus([up[0] - D.errors.dx, up[1] - D.errors.dx * D.errors.slope], A("errors", "e")),
    traffic: minus([low[0] - D.traffic.dx, low[1] - D.traffic.dx * D.traffic.slope], A("traffic", "e")),
    inbox,
    customers: minus([D.customersWx, inbox[1] + A("inbox", "e")[1]], A("customers", "w")),
    marketing: [D.marketing[0], D.marketing[1]],
  };
}
/** A phone's ring with every design row's offset from the line's middle times sy (whole city px). The rows are where the
 *  connectors attach, so lifts stretch with the spread and spans stay flat: Errors' w anchor (the trunk's head), junction J
 *  and Traffic's w anchor, Inbox's n anchor under its lift (and Customers on Inbox's e row); Marketing by its top. */
function phonePos(A: Anchor, sy: number): Record<CityIsland, XY> {
  const P = RING.phone, y = (row: number) => Math.round(LINE_MID + (row - LINE_MID) * sy);
  const inbox = minus([P.inboxLiftX, y(P.inboxRow)], A("inbox", "n"));
  return {
    errors: minus([P.errorsWx, y(P.errorsWy)], A("errors", "w")),
    traffic: minus([P.trafficWx, y(P.junctionY)], A("traffic", "w")),
    inbox,
    customers: minus([P.customersWx, inbox[1] + A("inbox", "e")[1]], A("customers", "w")),
    marketing: [P.marketing[0], y(P.marketing[1])],
  };
}
/** How tall a phone's ring is, city px at k 1, without its pad: the line and its label, every island, its label and plate. */
function phoneRingH(pos: Record<CityIsland, XY>, manifest: CityManifest): number {
  const tag = (plate: boolean) => labelCss(PHONE_SCREEN, plate) * PHONE_CITY_PER_CSS;
  const tops = [LINE_BOX.y], bottoms = [LINE_BOX.y + LINE_BOX.h, LINE_LABEL[1] + tag(false)];
  for (const id of CITY_ISLANDS) {
    const [, y] = pos[id], art = manifest.islands[id];
    tops.push(y);
    bottoms.push(y + art.h, y + art.label[1] + tag(true));
  }
  return Math.max(...bottoms) - Math.min(...tops);
}

/** The ring: each island placed so its anchor lands exactly where its connector needs it. Without a manifest, the
 *  expected sizes and anchors (fallbackManifest) stand in. A phone's ring is spread vertically to use the height it has:
 *  usableH is that height in city px at the ring's k 1 (PHONE_USABLE_H, a 390 x 844 phone, by default), and
 *  sy = min(1.25, (usableH - 2 * RING_PAD) / ringH), never below 1 (a short screen keeps the plain ring). */
export function ringLayout(portrait: boolean, manifest: CityManifest = fallbackManifest(), usableH: number = PHONE_USABLE_H): RingLayout {
  const A = (id: CityIsland, side: Side) => anchorOf(manifest, id, side);
  if (!portrait) return { portrait, pos: desktopPos(A), line: LINE_BOX, sy: 1 };
  const base = phonePos(A, 1), room = usableH - 2 * RING_PAD;
  let sy = Math.max(1, Math.min(SPREAD_MAX, room / phoneRingH(base, manifest))), pos = sy === 1 ? base : phonePos(A, sy);
  // rounding each row to a whole px can add a px or two: step back until the spread ring fits
  while (sy > 1 && phoneRingH(pos, manifest) > room) { sy = Math.max(1, sy - 0.005); pos = phonePos(A, sy); }
  return { portrait, pos, line: LINE_BOX, sy };
}

export const islandRect = (layout: RingLayout, manifest: CityManifest, id: CityIsland): Rect => {
  const [x, y] = layout.pos[id], { w, h } = manifest.islands[id];
  return { x, y, w, h };
};

/** A point on an island (anchor, lamp, label, pad, beacon): the island's top-left plus a sprite-px offset. */
export const at = (layout: RingLayout, id: CityIsland, p: XY): XY => [layout.pos[id][0] + p[0], layout.pos[id][1] + p[1]];

/** Where a connector stands on an island. A missing anchor falls back to the middle of that side. */
export function anchorAt(layout: RingLayout, manifest: CityManifest, id: CityIsland, side: Side): XY {
  return at(layout, id, anchorOf(manifest, id, side));
}

export type BridgeId = "errors" | "traffic" | "inbox" | "customers";
export const BRIDGE_IDS: readonly BridgeId[] = ["errors", "traffic", "inbox", "customers"];
export type Path = XY[];

export const pathLength = (path: Path) => path.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - path[i][0], p[1] - path[i][1]), 0);

// ---------- connectors ----------
/** The line's belly: where a lift from below runs in behind the rocks (the hull's front edge). */
export const BELLY_Y = 36;
/** Rows of a lift that show under the line (its rocks hide the rest). */
export const UNDER_LINE_Y = 80;
/** The Hub, with the ports this layout uses. */
/** A phone's trunk comes into the Hub's top and turns east into the line on the upper west port's row, as a desktop's
 *  Errors feed does. */
export function hubPlan(layout: RingLayout): HubPlan {
  const ports = layout.portrait ? [HUB_PORTS.top] : [HUB_PORTS.upperWest, HUB_PORTS.lowerWest];
  return { box: HUB, ports, brackets: HUB_BRACKETS, turn: HUB_PORTS.upperWest[1] };
}

/** A span's pylons: one on the rim it starts from, mid pylons on their piers, evenly spaced and at most KIT.pierEvery apart,
 *  and (with rimB) one on the rim it ends on. Each sits on its column's own belt row; a pier under a sloped span hangs under
 *  its deeper truss. */
function spanPylons(s: SpanPart, rimB = false): PylonPart[] {
  const [xa] = s.a, [xb] = s.b, len = Math.hypot(xb - xa, s.b[1] - s.a[1]), n = Math.ceil(len / KIT.pierEvery);
  const deep = slopeSign(s) ? SLOPED_DEEP : 0, out: PylonPart[] = [{ x: xa, c: s.a[1], foot: "rim" }];
  for (let i = 1; i < n; i++) { const x = Math.round(xa + ((xb - xa) * i) / n); out.push({ x, c: spanRow(s, x), foot: "pier", deep }); }
  if (rimB) out.push({ x: xb, c: s.b[1], foot: "rim" });
  return out;
}
/** A cable rest: where a main cable lies (x, y), and how far either side of x it leaves (3 for a saddle, 0 for a corner). */
interface Rest { x: number; y: number; half: number; taut?: boolean }
const saddle = (p: PylonPart): Rest => ({ x: p.x, y: p.c + ROW.saddle, half: 3 });
/** Main cables from rest to rest along a span: the pylons' saddles plus `ends` (a Hub corner, a junction or a lift top). */
function spanCables(pylons: PylonPart[], ends: Rest[] = []): CablePart[] {
  const rests = [...pylons.map(saddle), ...ends].sort((a, b) => a.x - b.x), out: CablePart[] = [];
  for (let i = 1; i < rests.length; i++) {
    const a = rests[i - 1], b = rests[i], taut = a.taut || b.taut;
    out.push({ a: [a.x + a.half, a.y], b: [b.x - b.half, b.y], ...(taut ? { taut } : {}) });
  }
  return out;
}
/** A main cable anchored on the deck itself at column x (a self-anchored end), just above the back rail. `taut`: the cable
 *  falls to it from a saddle on the level (a backstay), so it hangs nearly straight instead of sagging onto the deck. */
const deckAnchor = (s: SpanPart, x: number, taut = false): Rest => ({ x, y: spanRow(s, x) + ROW.band - 1 - KIT.cableClear, half: 0, ...(taut ? { taut } : {}) });

/** Spreads `n` lamps evenly over the allowed spots (each a lamp position with its belt distance from the lit end). */
function spread(spots: Lamp[], n: number): Lamp[] {
  if (n <= 0 || !spots.length) return [];
  const sorted = [...spots].sort((a, b) => a.dist - b.dist), out: Lamp[] = [];
  for (let k = 0; k < n; k++) out.push(sorted[Math.min(sorted.length - 1, Math.round(((k + 0.5) * sorted.length) / n - 0.5))]);
  return out;
}

/** Exactly 12 runway lamps: the fixed lanterns (pylons, junctions) plus `deck` or `arm` lanterns spread evenly over `spots`. */
function runway(fixed: Lamp[], spots: Lamp[]): Lamp[] {
  const lamps = [...fixed, ...spread(spots, 12 - fixed.length)];
  return lamps.sort((a, b) => a.dist - b.dist);
}

/** Deck lantern spots along a span: on the back rail, 12 px or more from any pylon (so the lit reach, cut halfway between two
 *  lamps, never splits a pylon or its pier rock), clear of the cables and of a cable's deck eye, and not where `skip(x)` says
 *  (a Hub or junction face). dist = belt px from the span's b end plus `base`. */
function deckSpots(s: SpanPart, pylons: PylonPart[], cables: CablePart[], base: number, skip: (x: number) => boolean): Lamp[] {
  const [xa] = s.a, [xb] = s.b, x0 = Math.min(xa, xb), x1 = Math.max(xa, xb), k = Math.hypot(xb - xa, s.b[1] - s.a[1]) / Math.abs(xb - xa);
  const belt = (x: number) => (x >= x0 && x <= x1 ? spanRow(s, x) : null), out: Lamp[] = [];
  for (let x = x0; x <= x1; x++) {
    if (skip(x) || pylons.some((p) => Math.abs(p.x - x) < 12)) continue;
    const c = spanRow(s, x), cable = cables.find((cb) => x >= Math.min(cb.a[0], cb.b[0]) && x <= Math.max(cb.a[0], cb.b[0]));
    if (cable && cableRow(cable, x, belt) > c + ROW.deckGlass - 4) continue; // the lantern would touch the cable
    if (cables.some((cb) => [cb.a, cb.b].some(([ex, ey]) => Math.abs(ex - x) <= 2 && ey > c + ROW.band - 9))) continue; // a deck eye
    out.push({ x, y: c + ROW.deckGlass, kind: "deck", dist: base + Math.abs(xb - x) * k });
  }
  return out;
}
/** Arm lantern spots up a lift (on the sun side), on rows top..bottom; dist = rows from the lift's lit end plus `base`. */
function armSpots(l: LiftPart, from: number, to: number, base: number, skip: (y: number) => boolean): Lamp[] {
  const out: Lamp[] = [], litEnd = l.up ? l.top : l.bottom;
  for (let y = from; y <= to; y++) if (!skip(y)) out.push({ x: l.x + KIT.lift.half + 3, y: y - 3, kind: "arm", dist: base + Math.abs(y - litEnd) });
  return out;
}
const pylonLamp = (p: PylonPart, dist: number): Lamp => ({ x: p.x, y: p.c + ROW.glass, kind: "pylon", dist });
const plan = (id: BridgeId, path: Path, parts: Partial<ConnectorPlan>): ConnectorPlan => ({
  id, path, length: pathLength(path), spans: [], lifts: [], pylons: [], junctions: [], cables: [], brackets: [], lamps: [], ...parts,
});

/** Every connector, island end first and lit end last: the belt runs along the path and the runway lamps count from its last
 *  point (the Hub or the line's belly for Errors, Traffic and Inbox; Inbox for Customers; junction J for a phone's Traffic).
 *  Inbox's is its lift alone; only the Customers span touches Inbox, on its east side. */
export function connectorPlans(layout: RingLayout, manifest: CityManifest): Record<BridgeId, ConnectorPlan> {
  const A = (id: CityIsland, side: Side) => anchorAt(layout, manifest, id, side);
  return layout.portrait ? phonePlans(A) : desktopPlans(A);
}

/** A sloped span from an island rim (a) to the Hub's west face (b): rim pylon, mid pylons, and a main cable down to the
 *  Hub's top corner; or, for the lower port (where that cable would cross the upper run), anchored on its own deck 14 px
 *  short of the Hub, under the upper run. */
function spanToHub(id: BridgeId, a: XY, port: XY, selfAnchored: boolean): ConnectorPlan {
  const s: SpanPart = { a, b: port }, pylons = spanPylons(s);
  const cables = spanCables(pylons, [selfAnchored ? deckAnchor(s, port[0] - 14) : { x: HUB.x + 1, y: HUB.y, half: 0 }]);
  const len = Math.hypot(port[0] - a[0], port[1] - a[1]), k = len / Math.abs(port[0] - a[0]);
  const fixed = pylons.map((p) => pylonLamp(p, Math.abs(port[0] - p.x) * k));
  const spots = deckSpots(s, pylons, cables, 0, (x) => x > port[0] - 4);
  return plan(id, [a, port], { spans: [s], pylons, cables, lamps: runway(fixed, spots) });
}
/** The lift's foot plate stands on the plinth's top, this far above Inbox's n anchor (the anchor is on the plinth's face,
 *  just under its brass trim). */
export const LIFT_SEAT = 4;
/** Inbox hangs under its lift: a lift from the line's belly (behind the rocks) straight down onto the plinth beside Inbox's
 *  post tower, its foot plate at the n anchor. The belt runs up into the line. Its 12 lamps are lanterns on 3 px arms up its
 *  sun side, lamp 0 just under the line's rocks, evenly apart (never closer than 10 px) down to just above the plinth. */
function inboxLift(n: XY): ConnectorPlan {
  const [x, row] = n, lift: LiftPart = { x, top: BELLY_Y, bottom: row - LIFT_SEAT, up: true, foot: true };
  const from = UNDER_LINE_Y + 4, to = row - LIFT_SEAT - 5, lamps: Lamp[] = [];
  for (let k = 0; k < 12; k++) {
    const y = from + Math.round((k * (to - from)) / 11); // the arm's row; its lantern's glass sits 3 rows above it
    lamps.push({ x: x + KIT.lift.half + 3, y: y - 3, kind: "arm", dist: y - BELLY_Y });
  }
  return plan("inbox", [n, [x, BELLY_Y]], { lifts: [lift], lamps });
}
/** Where the Customers span's last main cable comes down onto its own deck, this far east of Inbox's e anchor: Inbox's end
 *  has no pylon (its lift stands there), so the span is self-anchored on that side. */
export const FEED_ANCHOR = 14;
/** A flat span from Customers' w anchor to Inbox's e anchor, on Inbox's east side: a pylon on Customers' rim and mid pylons
 *  on their piers; its last cable is anchored on its own deck FEED_ANCHOR px short of Inbox, clear of Inbox's lift. Inbox is
 *  its lit end. */
function feedback(w: XY, inboxE: XY): ConnectorPlan {
  const s: SpanPart = { a: w, b: inboxE }, pylons = spanPylons(s), anchorX = inboxE[0] + FEED_ANCHOR;
  const cables = spanCables(pylons, [deckAnchor(s, anchorX, true)]);
  const fixed = pylons.map((p) => pylonLamp(p, Math.abs(inboxE[0] - p.x)));
  const spots = deckSpots(s, pylons, cables, 0, (x) => x < inboxE[0] + 12);
  return plan("customers", [w, inboxE], { spans: [s], pylons, cables, lamps: runway(fixed, spots) });
}

function desktopPlans(A: Anchor): Record<BridgeId, ConnectorPlan> {
  return {
    errors: spanToHub("errors", A("errors", "e"), HUB_PORTS.upperWest, false),
    traffic: spanToHub("traffic", A("traffic", "e"), HUB_PORTS.lowerWest, true),
    inbox: inboxLift(A("inbox", "n")),
    customers: feedback(A("customers", "w"), A("inbox", "e")),
  };
}

function phonePlans(A: Anchor): Record<BridgeId, ConnectorPlan> {
  const P = RING.phone, x = P.trunkX, ew = A("errors", "w"), J = KIT.junction;
  // Errors: the trunk. A stub from the rim into the head junction, then a lift down to the Hub's top port.
  const tw = A("traffic", "w"), jy = tw[1]; // junction J stands on Traffic's w row (spread with it)
  const head: XY = [x, ew[1]], trunk: LiftPart = { x, top: ew[1] + J + 1, bottom: HUB.y - 1, up: false, foot: false };
  const stub: SpanPart = { a: ew, b: [x + J + 1, ew[1]] };
  // a junction lantern's 2 px stem stands on the junction's top row (6 rows under the lantern's glass)
  const trunkLen = HUB.y - ew[1], headLamp: Lamp = { x, y: ew[1] - J - 6, kind: "junction", dist: trunkLen };
  const clearOfJ = (y: number) => Math.abs(y - jy) < 26 || y < ew[1] + J + 14;
  const errors = plan("errors", [ew, head, HUB_PORTS.top], {
    spans: [stub], lifts: [trunk], junctions: [{ x, y: ew[1] }],
    brackets: [{ x: x + J + 1, y: ew[1] + 4, w: KIT.bracket.w, h: KIT.bracket.h }],
    lamps: runway([headLamp], armSpots(trunk, ew[1] + J + 8, HUB.y - 8, HUB_PORTS.top[1] - trunk.bottom, clearOfJ)),
  });
  // Traffic: a flat span from its w anchor west to junction J on the trunk; J is its lit end.
  const jx = x + J + 1, s: SpanPart = { a: tw, b: [jx, jy] };
  const pylons = spanPylons(s), cables = spanCables(pylons, [{ x: x + J, y: jy - J, half: 0 }]);
  // J's top carries the trunk, so its lantern stands on an arm out of its west face (the cable comes in on the east)
  const jLamp: Lamp = { x: x - J - 4, y: jy - 12, kind: "junction", dist: 0, arm: x - J - 1 };
  // belt distances count from the trunk's centre line, where the path ends inside J
  const fixed = [jLamp, ...pylons.map((p) => pylonLamp(p, p.x - x))];
  const traffic = plan("traffic", [tw, [x, jy]], {
    spans: [s], pylons, cables, junctions: [{ x, y: jy }],
    lamps: runway(fixed, deckSpots(s, pylons, cables, jx - x, (cx) => cx < jx + 12)),
  });
  return { errors, traffic, inbox: inboxLift(A("inbox", "n")), customers: feedback(A("customers", "w"), A("inbox", "e")) };
}

/** Each connector's belt centre line, island end first and lit end last. */
export function bridgePaths(layout: RingLayout, manifest: CityManifest): Record<BridgeId, Path> {
  const plans = connectorPlans(layout, manifest);
  return Object.fromEntries(BRIDGE_IDS.map((id) => [id, plans[id].path])) as Record<BridgeId, Path>;
}
/** Every connector with everything the drawing and the clock need (round 1's name for it). */
export const bridges = connectorPlans;

/** Every member's bounding box (spans and lifts in 12 px chunks), with the connector it belongs to: for overlap tests. */
export interface ConnectorBox extends MemberBox { id: BridgeId | "hub" }
export function connectorBoxes(layout: RingLayout, manifest: CityManifest): ConnectorBox[] {
  const plans = connectorPlans(layout, manifest), out: ConnectorBox[] = [];
  for (const id of BRIDGE_IDS) for (const b of planBoxes(plans[id])) out.push({ ...b, id });
  for (const b of hubBoxes(hubPlan(layout))) out.push({ ...b, id: "hub" });
  return out;
}

// ---------- the rocket arc ----------
export const ARC_DOTS = 30;
/** Dots stay at least this far apart along the arc. */
export const ARC_GAP = 9;
/** How high the desktop arc climbs above the rocket spot, and where (as a share of the way to the pad) its top is. */
export const ARC_RISE = 70;
export const ARC_TOP_AT = 0.3;
/** The phone arc bows right by this share of the chord (the control point's offset; the curve's own bow is half of it).
 *  Shallower than round 1's 1.0, so at a phone's Customers framing (k 2) its furthest dot stays 78 device px or more inside
 *  the right edge (390 x 844: 94). Not 0.4: on a phone the rocket and the pad are only about 250 px apart, and at 0.4 that
 *  curve is too short for 30 dots ARC_GAP apart; 0.7 is the least bow that keeps them 9 px apart on 390 x 844, 390 x 664
 *  and 375 x 667. */
export const ARC_BOW = 0.7;
/** The arc ends this far straight above the pad: the arrowhead's tip (7 x 5, pointing down), 1 px clear of the nose of the
 *  rocket that lands there (15 tall). */
export const ARROW_ABOVE = 16;

/** The control point of the arc's quadratic curve. Desktop: the curve's highest point is ARC_RISE above `from`, ARC_TOP_AT of
 *  the way across. Phone: ARC_BOW of the chord to the right of the chord's middle. */
export function arcControl(from: XY, to: XY, portrait: boolean): XY {
  const [x0, y0] = from, [x2, y2] = to;
  if (portrait) {
    const dx = x2 - x0, dy = y2 - y0, chord = Math.hypot(dx, dy), nx = Math.abs(dy) / chord, ny = (-Math.sign(dy) * dx) / chord;
    return [(x0 + x2) / 2 + ARC_BOW * chord * nx, (y0 + y2) / 2 + ARC_BOW * chord * ny];
  }
  // y(t) = y0 + 2t(cy - y0) + t^2(y0 - 2cy + y2); its least value is y0 - u^2 / (2u + y2 - y0) with u = y0 - cy
  const u = ARC_RISE + Math.sqrt(ARC_RISE * ARC_RISE + ARC_RISE * (y2 - y0)), cy = y0 - u, t = u / (2 * u + y2 - y0);
  const topX = x0 + (x2 - x0) * ARC_TOP_AT, cx = (topX - (1 - t) ** 2 * x0 - t * t * x2) / (2 * (1 - t) * t);
  return [cx, cy];
}
const bezier = (a: XY, c: XY, b: XY, t: number): XY => [(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]];

/** The curve from the rocket to the arrowhead's tip above the pad, sampled finely, with the arc length at each sample. */
function arcCurve(from: XY, pad: XY, portrait: boolean) {
  const to = arcEnd(pad), ctrl = arcControl(from, to, portrait), steps = 600, pts: XY[] = [], cum = [0];
  for (let i = 0; i <= steps; i++) pts.push(bezier(from, ctrl, to, i / steps));
  for (let i = 1; i <= steps; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const along = (s: number): XY => {
    let i = 1; while (i < steps && cum[i] < s) i++;
    const f = cum[i] > cum[i - 1] ? (s - cum[i - 1]) / (cum[i] - cum[i - 1]) : 0;
    return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f];
  };
  return { pts, cum, total: cum[steps], along };
}
/** Where the arc ends: the arrowhead's tip, straight above the pad. */
export const arcEnd = (pad: XY): XY => [pad[0], pad[1] - ARROW_ABOVE];
/** The dotted route from the line's rocket to the Customers pad: n points evenly along the curve, from 7 px past the rocket
 *  to 9 px short of the arrowhead's tip (clear of the arrowhead). Index 0 is at the line's rocket (dots light from there, and
 *  Customers' capsule flies them in order), the last just above the pad. */
export function arcPoints(from: XY, pad: XY, portrait: boolean, n = ARC_DOTS): XY[] {
  const { total, along } = arcCurve(from, pad, portrait), endS = total - 9, startS = 7, out: XY[] = [];
  for (let j = 0; j < n; j++) {
    const p = along(startS + (j / (n - 1)) * (endS - startS));
    out.push([Math.round(p[0]), Math.round(p[1])]);
  }
  return out;
}

/** The island labels' top-centre, city px (the line's too). */
export function labelAt(layout: RingLayout, manifest: CityManifest, id: CityIsland | "line"): XY {
  return id === "line" ? LINE_LABEL : at(layout, id, manifest.islands[id].label);
}
