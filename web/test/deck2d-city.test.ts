import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CITY_ISLANDS, CITY_TIMING, PALETTE, PALETTE_48, type CityIsland, type CityView, type DeckEvent } from "../src/deck2d/contract";
import {
  ARC_BOW, ARC_DOTS, ARC_GAP, ARC_RISE, ARROW_ABOVE, BELLY_Y, BRIDGE_IDS, FEED_ANCHOR, HUB, HUB_BRACKETS, HUB_PORTS, LIFT_SEAT, LINE_BOX, PHONE_USABLE_H, RING, ROCKET_SPOT, SPREAD_MAX,
  UNDER_LINE_Y, anchorAt, arcControl, arcEnd, arcPoints, bridgePaths, connectorBoxes, connectorPlans, hubPlan, islandRect, labelAt, at, ringLayout, type ConnectorBox, type RingLayout,
  type Rect,
} from "../src/deck2d/city/layout";
import {
  BELT_STEPS, HUB_STUB_END, KIT, ROW, SLOPED_DEEP, cableRow, createRaster, hubExits, litReach, litRects, paintConnector, paintHub, paintLift, paintPylon, paintSpan, planBounds, posterize,
  sag, spanRow, trussEnd, type ConnectorPlan, type Raster,
} from "../src/deck2d/city/connector";
import { EXPECTED_SIZE, fallbackManifest, parseManifest, spriteName, type CityManifest, type Side } from "../src/deck2d/city/manifest";
import { DROP, FLIGHT, SEQUENCE, SEQUENCED, beltAt, bloomAt, cityEvents, growGlowOn, islandState, lampsOn, lightOrder } from "../src/deck2d/city/timeline";
import {
  CLUMP, DIM_DITHER, DOT, DOT_DARK, FLAME, GLOW_BAND, GROW_GLOW, PUFF_FRAME, PUFF_OUT, ROCKET, ROCKET_LEVEL, ROCKET_UP, checker, dropAt, flightAt, inEllipse, inRing, litCell, nearest48,
  puffFrame, drawArc, drawBeacon, drawPuff, lanternHalo, rampOf, ring, warmStep, warmSteps, warmUp,
} from "../src/deck2d/city/draw";
import { BAND, cityCamera, ringBox, usable, type CityScreen } from "../src/deck2d/city/camera";
import { beltStep, halve2x, quantPhase, stepPhase } from "../src/deck2d/engine/halve";
import { beltRun, beltRunV } from "../src/deck2d/engine/pxdraw";
import { arcDotsShown, manualCity } from "../src/deck2d/city";

// The city's pure parts (web/src/deck2d/city/DIRECTION.md section B, SPEC.md sections 1 and 3): where everything sits, the
// connector kit (spans, lifts, pylons, piers, junctions, the Hub, the chevrons on the belts) and its 12 runway lamps, the
// rocket arc and the capsule that flies it, how a progress number becomes a picture, which events a change of view fires,
// and the small pixel helpers (the grow glow's palette warm-up among them). The numbers pinned here are the direction's own
// (slopes 0, 1/4 or 1/2, 12 lamps 10 px apart, piers at most 120 apart, 30 arc dots 9 px apart, the desktop arc 70 px above
// the rocket, Inbox under its lift, a phone's ring filling 75% of its height), not the code's sums.

const real = parseManifest(JSON.parse(readFileSync(join(import.meta.dir, "../public/deck/art/city/manifest.json"), "utf8"))) as CityManifest;
const manifests = { "the shipped manifest": real, "the expected sizes": fallbackManifest() };
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const grow = (r: Rect, n: number): Rect => ({ x: r.x - n, y: r.y - n, w: r.w + n * 2, h: r.h + n * 2 });
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",");
const colours = (d: Uint8ClampedArray) => { const out = new Set<string>(); for (let i = 0; i < d.length; i += 4) if (d[i + 3]) out.add(`${d[i]},${d[i + 1]},${d[i + 2]}`); return out; };
const layouts = (manifest: CityManifest) => ({ desktop: ringLayout(false, manifest), phone: ringLayout(true, manifest) });

/** The labels' real boxes, CSS px, measured in Chromium with deck.css's sizes (Silkscreen 16 px labels and plates on a big
 *  screen; 12 px labels and 12 px plates on a small one): label widths, the COMING SOON plate's width, and the heights. */
const TAG = {
  big: { label: { errors: 78, traffic: 80, inbox: 66, customers: 114, marketing: 110, line: 112 }, plate: 144, text: 20, gap: 4, plateH: 24 },
  small: { label: { errors: 61, traffic: 62, inbox: 52, customers: 88, marketing: 85, line: 86 }, plate: 108, text: 16, gap: 4, plateH: 20 },
} as const;
const SCREENS = { desktop: { w: 1280, h: 720, dpr: 1, portrait: false, big: true }, phone: { w: 390, h: 844, dpr: 2, portrait: true, big: false } } as const;
/** One label (and the plate under it) as a rect in city px at zoom k, with 2 CSS px of slack all round. */
function tagBox(layout: RingLayout, manifest: CityManifest, id: CityIsland | "line", screen: { big: boolean; dpr: number }, k = 1): Rect {
  const t = screen.big ? TAG.big : TAG.small, toCity = screen.dpr / k, slack = 2;
  const w = (Math.max(t.label[id], id === "line" ? 0 : t.plate) + 2 * slack) * toCity, h = (t.text + (id === "line" ? 0 : t.gap + t.plateH) + 2 * slack) * toCity;
  const [x, y] = labelAt(layout, manifest, id);
  return { x: x - w / 2, y: y - slack * toCity, w, h };
}
const at4 = (r: Raster, x: number, y: number) => { const i = x - r.x, j = y - r.y; if (i < 0 || j < 0 || i >= r.w || j >= r.h) return ""; const o = (j * r.w + i) * 4; return r.data[o + 3] ? `${r.data[o]},${r.data[o + 1]},${r.data[o + 2]}` : ""; };
/** A stand-in 2D context that records every px painted, its colour and its alpha (the halos and sprites only use fillRect). */
function fakeCtx(transform = { a: 1, d: 1, e: 0, f: 0 }, height = 100) {
  const painted = new Map<string, { color: string; alpha: number }>(), stack: [string, number, string][] = [];
  const ctx = {
    fillStyle: "", globalAlpha: 1, globalCompositeOperation: "source-over", canvas: { height }, getTransform: () => transform,
    save() { stack.push([this.fillStyle, this.globalAlpha, this.globalCompositeOperation]); },
    restore() { const s = stack.pop(); if (s) [this.fillStyle, this.globalAlpha, this.globalCompositeOperation] = s; },
    fillRect(x: number, y: number, w: number, h: number) { for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) painted.set(`${x + i},${y + j}`, { color: this.fillStyle, alpha: this.globalAlpha }); },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, painted };
}
/** Belt px from a connector's lit end to the point of its path nearest where a lamp stands: under a pylon or deck lantern,
 *  beside an arm lantern's lift, or the centre of a junction lantern's junction. */
function beltDist(p: ConnectorPlan, l: ConnectorPlan["lamps"][number]): number {
  const j = p.junctions.length ? p.junctions.reduce((a, b) => (Math.hypot(b.x - l.x, b.y - l.y) < Math.hypot(a.x - l.x, a.y - l.y) ? b : a)) : null;
  const [qx, qy] = l.kind === "pylon" ? [l.x, l.y - ROW.glass] : l.kind === "deck" ? [l.x, l.y - ROW.deckGlass] : l.kind === "arm" ? [l.x - KIT.lift.half - 3, l.y + 3] : [j!.x, j!.y];
  let best = Infinity, at = 0, from = 0;
  for (let i = p.path.length - 1; i >= 1; i--) {
    const [bx, by] = p.path[i], [ax, ay] = p.path[i - 1], len = Math.hypot(ax - bx, ay - by);
    const f = Math.max(0, Math.min(1, ((qx - bx) * (ax - bx) + (qy - by) * (ay - by)) / (len * len))), d = Math.hypot(bx + (ax - bx) * f - qx, by + (ay - by) * f - qy);
    if (d < best) { best = d; at = from + f * len; }
    from += len;
  }
  return at;
}
/** The islands a connector may touch: its own two ends. */
const ENDS: Record<ConnectorBox["id"], CityIsland[]> = { errors: ["errors"], traffic: ["traffic"], inbox: ["inbox"], customers: ["customers", "inbox"], hub: [] };

describe("the manifest", () => {
  test("the shipped manifest parses, matches the size table, and every island has what its bridge needs", () => {
    expect(real).not.toBeNull();
    for (const id of CITY_ISLANDS) {
      const a = real.islands[id];
      expect(a.w).toBe(EXPECTED_SIZE[id].w);
      expect(Math.abs(a.h - EXPECTED_SIZE[id].h)).toBeLessThanOrEqual(3);
      expect(spriteName(a.lit)).toBe(`city/${id}-lit`);
      expect(spriteName(a.dark)).toBe(`city/${id}-dark`);
      expect(Object.keys(a.anchors).length).toBe(id === "marketing" ? 0 : 4);
    }
    expect(real.islands.customers.pad).not.toBeNull();
    expect(real.islands.marketing.beacon).not.toBeNull();
    expect(real.islands.marketing.lamp).toBeNull();
  });

  test("the expected sizes stand in until it loads, and a manifest with anything off is refused", () => {
    const fallback = fallbackManifest();
    expect(parseManifest(JSON.parse(JSON.stringify(fallback)))).toEqual(fallback);
    for (const id of CITY_ISLANDS) expect([fallback.islands[id].w, fallback.islands[id].h]).toEqual([EXPECTED_SIZE[id].w, EXPECTED_SIZE[id].h]);
    const mutate = (f: (m: any) => void) => { const m = JSON.parse(JSON.stringify(fallback)); f(m); return parseManifest(m); };
    expect(mutate(() => {})).not.toBeNull();
    expect(mutate((m) => { m.version = 2; })).toBeNull();
    expect(mutate((m) => { m.unit = "px"; })).toBeNull();
    expect(mutate((m) => { delete m.islands.traffic; })).toBeNull();
    expect(mutate((m) => { m.islands.errors.w = 0; })).toBeNull();
    expect(mutate((m) => { delete m.islands.inbox.anchors.n; })).toBeNull();
    expect(mutate((m) => { m.islands.customers.label = [1]; })).toBeNull();
    expect(mutate((m) => { m.islands.marketing.anchors = {}; })).not.toBeNull(); // Marketing has no bridge
    expect(parseManifest(null)).toBeNull();
    expect(parseManifest("nope")).toBeNull();
  });
});

describe("the ring", () => {
  for (const [name, manifest] of Object.entries(manifests)) for (const portrait of [false, true]) {
    test(`${portrait ? "phone" : "desktop"} layout with ${name}: nothing overlaps and the line keeps its own place`, () => {
      const layout = ringLayout(portrait, manifest);
      expect(layout.line).toEqual(LINE_BOX); // the line is never moved: city (cx, cy) is world (cx * 10, cy * 10)
      const rects = CITY_ISLANDS.map((id) => islandRect(layout, manifest, id));
      rects.forEach((a, i) => {
        expect(overlaps(a, LINE_BOX)).toBe(false);
        rects.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false));
      });
    });
  }

  test("the line is the engine's BOUNDS in city px: 399 x 83, its launch spot at (377, 25); the Hub is bolted to its west end", () => {
    expect(LINE_BOX).toEqual({ x: -2, y: -3, w: 399, h: 83 });
    expect(ROCKET_SPOT).toEqual([377, 25]);
    expect(HUB).toEqual({ x: -18, y: -6, w: 15, h: 50 });
    expect(HUB_PORTS).toEqual({ upperWest: [-18, 16], lowerWest: [-18, 30], top: [-11, -6], bottom: [-11, 44] });
    for (const portrait of [false, true]) for (const b of hubPlan(ringLayout(portrait)).brackets) expect(b.x + b.w).toBe(0); // up to the line's west face
    // two 4 x 3 brackets, each just above a west port's belt centre (rows 13-15 over 16, 27-29 over 30)
    expect(HUB_BRACKETS.map((b) => [b.y, b.w, b.h])).toEqual([[13, 4, 3], [27, 4, 3]]);
    expect(HUB_BRACKETS.map((b, i) => [HUB_PORTS.upperWest, HUB_PORTS.lowerWest][i][1] - (b.y + b.h - 1))).toEqual([1, 1]); // its last row right above the centre row
  });

  test("the Hub joins the line: each belt leaves its east face as a 7-row stub under the line's west rail, a soot cap at x +1", () => {
    for (const portrait of [false, true]) {
      const hub = hubPlan(ringLayout(portrait)), r = createRaster({ x: -24, y: -12, w: 30, h: 64 }), east = HUB.x + HUB.w;
      paintHub(r, hub, 5, true);
      const rows = hubExits(hub);
      expect(rows).toEqual(portrait ? [HUB_PORTS.upperWest[1]] : [HUB_PORTS.upperWest[1], HUB_PORTS.lowerWest[1]]); // a phone's trunk turns east on the upper port's row
      expect(HUB_STUB_END).toBe(1);
      for (const c of rows) {
        // no sky between the Hub's lattice and the line's west face (x 0) on the belt's rows: every px from x -4 to x +1 is painted
        for (let x = east - 1; x <= HUB_STUB_END; x++) for (let y = c + ROW.band; y <= c + ROW.band + 6; y++) expect(at4(r, x, y), `${x},${y}`).not.toBe("");
        for (let y = c + ROW.band; y <= c + ROW.band + 6; y++) expect(at4(r, HUB_STUB_END, y)).toBe(rgb(PALETTE.soot[0])); // the end cap
        for (let y = c + ROW.band; y <= c + ROW.band + 6; y++) expect(at4(r, HUB_STUB_END + 1, y)).toBe(""); // and nothing past it
        // a band, not a truss: nothing under it in the gap
        for (let x = east; x < 0; x++) expect(at4(r, x, c + ROW.band + 7)).toBe("");
        // the stub's plates run on from the Hub's: the same seam rule (a soot seam every 7 px, moved by the belt step)
        const seams = (x0: number, x1: number) => Array.from({ length: x1 - x0 + 1 }, (_, i) => x0 + i).filter((x) => at4(r, x, c + 1) === rgb(PALETTE.soot[0]));
        for (const x of seams(east, HUB_STUB_END - 1)) expect((((x - 5) % 7) + 7) % 7).toBe(0);
      }
      // the brackets clamp over the stubs (painted last): a soot plate with an iron[2] / iron[3] middle
      for (const b of hub.brackets) expect([at4(r, b.x + 1, b.y + 1), at4(r, b.x + 2, b.y + 1)]).toEqual([rgb(PALETTE.iron[2]), rgb(PALETTE.iron[3])]);
    }
    // a phone's trunk runs on down inside the Hub (its belt's sun rail with a brass stud every 8 px) to the gear at the turn
    const r = createRaster({ x: -24, y: -12, w: 30, h: 64 }), hub = hubPlan(ringLayout(true));
    paintHub(r, hub, 0, true);
    for (let y = HUB.y + 1; y < hub.turn! - 3; y++) expect(at4(r, HUB_PORTS.top[0] - 3, y), `${y}`).toBe(rgb(PALETTE.soot[0])); // its shade-side soot edge
  });

  test("islands are placed from their anchors: moving an anchor 2 px moves the island and never bends a span", () => {
    const base = fallbackManifest(), moved = fallbackManifest();
    const e = moved.islands.errors.anchors.e!, w = moved.islands.traffic.anchors.w!;
    moved.islands.errors.anchors.e = [e[0] + 2, e[1] - 2];
    moved.islands.traffic.anchors.w = [w[0] - 2, w[1] + 1];
    for (const portrait of [false, true]) {
      const a = ringLayout(portrait, base), b = ringLayout(portrait, moved), pa = bridgePaths(a, base), pb = bridgePaths(b, moved);
      expect(pb.errors).toEqual(pa.errors); // the same run, from the same anchor point
      expect(pb.traffic).toEqual(pa.traffic);
      if (!portrait) expect(b.pos.errors).toEqual([a.pos.errors[0] - 2, a.pos.errors[1] + 2]);
      else expect(b.pos.traffic).toEqual([a.pos.traffic[0] + 2, a.pos.traffic[1] - 1]);
    }
  });

  test("a phone spreads its ring to use its height: at 390 x 844 the ring box fills at least 75% of the usable height", () => {
    const phone: CityScreen = { w: 390, h: 844, dpr: 2, portrait: true }, u = usable(phone);
    expect(PHONE_USABLE_H).toBe(u.h); // 748 CSS px at 2 city px each
    for (const manifest of Object.values(manifests)) {
      const layout = ringLayout(true, manifest), box = ringBox(layout, manifest, phone, 1);
      expect(layout.sy).toBeGreaterThan(1);
      expect(layout.sy).toBeLessThanOrEqual(SPREAD_MAX);
      expect(box.h).toBeGreaterThanOrEqual(0.75 * u.h);
      expect(box.h).toBeLessThanOrEqual(u.h); // and still fits at k 1
      expect(box.w).toBeLessThanOrEqual(u.w);
      // nothing overlaps: no two islands, no island and the line, no label or plate and another island or another label
      const sprites = CITY_ISLANDS.map((id) => islandRect(layout, manifest, id)), tags = ([...CITY_ISLANDS, "line"] as const).map((id) => tagBox(layout, manifest, id, SCREENS.phone));
      sprites.forEach((a, i) => { expect(overlaps(a, LINE_BOX)).toBe(false); sprites.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)); });
      tags.forEach((t, i) => {
        sprites.forEach((sp, j) => { if (j !== i) expect(overlaps(t, sp)).toBe(false); });
        tags.slice(i + 1).forEach((o) => expect(overlaps(t, o)).toBe(false));
        if (i < CITY_ISLANDS.length) expect(overlaps(t, LINE_BOX)).toBe(false);
      });
    }
  });

  test("the spread scales offsets from the line's middle (whole px, spans stay flat), never squeezes, and leaves a desktop alone", () => {
    const m = fallbackManifest(), plain = ringLayout(true, m, 0), full = ringLayout(true, m);
    expect(plain.sy).toBe(1); // a short screen keeps the plain ring
    expect(ringLayout(false, m, 5000).sy).toBe(1);
    expect(ringLayout(false, m, 5000).pos).toEqual(ringLayout(false, m).pos);
    expect(ringLayout(true, m, 1e6).sy).toBe(SPREAD_MAX);
    const mid = LINE_BOX.y + LINE_BOX.h / 2, row = (L: RingLayout, id: CityIsland, side: Side) => anchorAt(L, m, id, side)[1];
    for (const [id, side] of [["errors", "w"], ["traffic", "w"], ["inbox", "n"]] as const) {
      expect(row(full, id, side)).toBe(Math.round(mid + (row(plain, id, side) - mid) * full.sy));
      expect(Number.isInteger(full.pos[id][1])).toBe(true);
    }
    expect(row(full, "customers", "w")).toBe(row(full, "inbox", "e")); // Customers' span to Inbox stays flat
    const plans = connectorPlans(full, m);
    expect(plans.traffic.path.every(([, y]) => y === row(full, "traffic", "w"))).toBe(true); // Traffic's span to J stays flat
    expect(plans.errors.lifts[0].top).toBeLessThan(connectorPlans(plain, m).errors.lifts[0].top); // the trunk stretches
  });

  test("a phone stacks the ring vertically, Marketing on top and Customers at the bottom, inside 700 px of width", () => {
    for (const manifest of Object.values(manifests)) {
      const layout = ringLayout(true, manifest), ys = CITY_ISLANDS.map((id) => layout.pos[id][1]);
      expect(layout.pos.marketing[1]).toBe(Math.min(...ys));
      expect(layout.pos.customers[1]).toBe(Math.max(...ys));
      const rects = CITY_ISLANDS.map((id) => islandRect(layout, manifest, id));
      expect(Math.max(...rects.map((r) => r.x + r.w), LINE_BOX.x + LINE_BOX.w) - Math.min(...rects.map((r) => r.x), LINE_BOX.x)).toBeLessThanOrEqual(700);
    }
  });
});

describe("the connectors", () => {
  for (const [name, manifest] of Object.entries(manifests)) for (const [view, layout] of Object.entries(layouts(manifest))) {
    const plans = connectorPlans(layout, manifest), paths = bridgePaths(layout, manifest), label = `${view}, ${name}`;

    test(`${label}: every stretch is flat, a 1/4 or 1/2 slope, or vertical, and runs island end first, lit end last`, () => {
      expect(Object.keys(paths)).toEqual([...BRIDGE_IDS]);
      for (const id of BRIDGE_IDS) {
        const path = paths[id];
        expect(path).toEqual(plans[id].path);
        path.slice(1).forEach(([bx, by], i) => {
          const [ax, ay] = path[i], dx = bx - ax, dy = by - ay;
          expect(Math.abs(dx) + Math.abs(dy)).toBeGreaterThan(0);
          if (dx !== 0) expect([0, 0.25, 0.5]).toContain(Math.abs(dy / dx));
        });
        const own = id === "customers" ? "customers" : id, r = grow(islandRect(layout, manifest, own), 1), [x, y] = path[0];
        expect(x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h).toBe(true); // it starts on its island
      }
      const liftX = view === "desktop" ? RING.desktop.inboxLiftX : RING.phone.inboxLiftX;
      expect(paths.inbox[0]).toEqual(anchorAt(layout, manifest, "inbox", "n")); // from Inbox's plinth, under the lift...
      expect(paths.inbox.at(-1)).toEqual([liftX, BELLY_Y]); // ...straight up into the line's belly
      expect(paths.inbox.length).toBe(2);
      expect(paths.customers.at(-1)).toEqual(anchorAt(layout, manifest, "inbox", "e")); // the feedback lands on Inbox's east side
      if (view === "desktop") {
        expect(paths.errors.at(-1)).toEqual(HUB_PORTS.upperWest);
        expect(paths.traffic.at(-1)).toEqual(HUB_PORTS.lowerWest);
        expect(paths.errors.length).toBe(2); // one straight span each, slope exactly 1/2 down and 1/2 up
        expect((paths.errors[1][1] - paths.errors[0][1]) / (paths.errors[1][0] - paths.errors[0][0])).toBe(0.5);
        expect((paths.traffic[1][1] - paths.traffic[0][1]) / (paths.traffic[1][0] - paths.traffic[0][0])).toBe(-0.5);
      } else {
        expect(paths.errors.at(-1)).toEqual(HUB_PORTS.top); // the trunk stands on the Hub
      }
    });

    test(`${label}: spans step in clean stairs, pylons stand on whole rows, piers at most 120 px apart`, () => {
      for (const id of BRIDGE_IDS) {
        const p = plans[id];
        for (const s of p.spans) {
          const [xa, ya] = s.a, [xb, yb] = s.b, slope = (yb - ya) / (xb - xa);
          for (let x = Math.min(xa, xb); x <= Math.max(xa, xb); x++) expect(spanRow(s, x)).toBe(ya + Math.round((x - xa) * slope));
          for (const py of p.pylons) expect(spanRow(s, py.x)).toBe(py.c);
          // every stretch between supports (pylons and the span's two ends) is at most 120 px long
          const xs = [xa, xb, ...p.pylons.map((q) => q.x)].sort((a, b) => a - b);
          for (let i = 1; i < xs.length; i++) expect(Math.hypot(xs[i] - xs[i - 1], (xs[i] - xs[i - 1]) * slope)).toBeLessThanOrEqual(KIT.pierEvery + 1);
        }
        // and no more piers than that needs: the run from the rim pylon to the span's other end, in stretches of at most 120
        for (const s of p.spans) {
          const rim = p.pylons.find((q) => q.foot === "rim");
          if (!rim) continue;
          const run = Math.hypot(s.b[0] - rim.x, s.b[1] - rim.c);
          expect(p.pylons.filter((q) => q.foot === "pier").length).toBe(Math.ceil(run / KIT.pierEvery) - 1);
          // a pier under a sloped span hangs under its deeper truss
          for (const q of p.pylons) if (q.foot === "pier") expect(q.deep ?? 0).toBe(s.b[1] === s.a[1] ? 0 : SLOPED_DEEP);
        }
      }
    });

    test(`${label}: main cables sag 12% of their run (6 to 24 px) and never come within 4 px of the top rail`, () => {
      expect([sag(10), sag(100), sag(150), sag(400)]).toEqual([6, 12, 18, 24]);
      for (const id of BRIDGE_IDS) {
        const p = plans[id], belt = (x: number) => { for (const s of p.spans) if (x >= Math.min(s.a[0], s.b[0]) && x <= Math.max(s.a[0], s.b[0])) return spanRow(s, x); return null; };
        for (const cable of p.cables) for (let x = Math.min(cable.a[0], cable.b[0]); x <= Math.max(cable.a[0], cable.b[0]); x++) {
          const c = belt(x);
          if (c !== null) expect(cableRow(cable, x, belt)).toBeLessThanOrEqual(c - 2 - KIT.cableClear);
        }
      }
    });
  }

  test("a phone's Traffic span ends on the Errors trunk, at junction J", () => {
    for (const manifest of Object.values(manifests)) {
      const layout = ringLayout(true, manifest), plans = connectorPlans(layout, manifest), trunk = plans.errors.lifts[0], [x, y] = plans.traffic.path.at(-1)!;
      expect(Math.abs(x - trunk.x)).toBeLessThanOrEqual(KIT.lift.half);
      expect(y > trunk.top && y < trunk.bottom).toBe(true);
      expect(plans.traffic.junctions.map((j) => [j.x, j.y])).toEqual([[x, y]]);
      expect(plans.traffic.lamps[0].kind).toBe("junction"); // J's lantern is Traffic's lamp 0
    }
  });

  test("Inbox hangs under its lift: one lift straight down from the line's belly onto the plinth by its post tower, at its n anchor", () => {
    for (const manifest of Object.values(manifests)) for (const portrait of [false, true]) {
      const layout = ringLayout(portrait, manifest), p = connectorPlans(layout, manifest).inbox, n = anchorAt(layout, manifest, "inbox", "n");
      const liftX = portrait ? RING.phone.inboxLiftX : RING.desktop.inboxLiftX;
      expect(n[0]).toBe(liftX); // the n anchor stands right under the lift
      expect(p.path).toEqual([n, [liftX, BELLY_Y]]);
      expect(p.lifts).toEqual([{ x: liftX, top: BELLY_Y, bottom: n[1] - LIFT_SEAT, up: true, foot: true }]); // its foot plate on the plinth's top
      expect([p.spans, p.pylons, p.junctions, p.cables, p.brackets]).toEqual([[], [], [], [], []]); // no junction tower, no west span: a lift alone
      // twelve lanterns on arms up its sun side: lamp 0 just under the line's rocks, then down, never closer than 10 px, the
      // lowest (glass, arm and the arm's shadow) clear above the lift's foot plate
      expect(p.lamps.every((l) => l.kind === "arm" && l.x === liftX + KIT.lift.half + 3)).toBe(true);
      expect(p.lamps[0].y + 3).toBe(UNDER_LINE_Y + 4);
      p.lamps.forEach((l, k) => { if (k) expect(l.y - p.lamps[k - 1].y).toBeGreaterThanOrEqual(10); });
      expect(p.lamps[11].y + 4).toBeLessThan(n[1] - LIFT_SEAT - 1);
    }
  });

  test("Inbox's left edge is at x 42 on a desktop and -14 on a phone, and only the Customers span touches it, on its east side", () => {
    for (const manifest of Object.values(manifests)) {
      const nx = manifest.islands.inbox.anchors.n![0];
      expect(Math.abs(nx - 54)).toBeLessThanOrEqual(2); // DIRECTION.md A3: n (54, 69)
      for (const portrait of [false, true]) {
        const layout = ringLayout(portrait, manifest), inbox = islandRect(layout, manifest, "inbox"), liftX = portrait ? RING.phone.inboxLiftX : RING.desktop.inboxLiftX;
        expect(inbox.x).toBe(liftX - nx); // placed by its n anchor: 96 - 54 = 42 on a desktop, 40 - 54 = -14 on a phone
        expect(inbox.x).toBe(portrait ? -14 + (54 - nx) : 42 + (54 - nx));
        // nothing but Inbox's own lift (from above) and the Customers span (on its east half) comes near Inbox's sprite
        for (const b of connectorBoxes(layout, manifest)) {
          if (!overlaps(b, inbox)) continue;
          expect(["inbox", "customers"]).toContain(b.id);
          if (b.id === "customers") expect(b.x + b.w / 2).toBeGreaterThan(inbox.x + inbox.w / 2);
        }
        // the Customers span stops on Inbox's e anchor, with no pylon on Inbox (its lift stands there)
        const c = connectorPlans(layout, manifest).customers, e = anchorAt(layout, manifest, "inbox", "e");
        expect(c.spans.map((s) => s.b)).toEqual([e]);
        expect(c.pylons.every((q) => q.x > inbox.x + inbox.w)).toBe(true);
      }
    }
  });

  test("desktop: Customers' span to Inbox is 369 long on three piers, as DIRECTION.md B draws it; a phone's on two", () => {
    for (const manifest of Object.values(manifests)) {
      const desk = connectorPlans(ringLayout(false, manifest), manifest).customers, phone = connectorPlans(ringLayout(true, manifest), manifest).customers;
      expect(Math.abs(desk.length - 369)).toBeLessThanOrEqual(2);
      expect(desk.pylons.filter((p) => p.foot === "pier").length).toBe(3);
      expect(phone.pylons.filter((p) => p.foot === "pier").length).toBe(2);
    }
  });

  test("Customers' span is self-anchored at Inbox's end: its last cable falls taut from the first pier's saddle onto its own deck", () => {
    for (const manifest of Object.values(manifests)) for (const portrait of [false, true]) {
      const layout = ringLayout(portrait, manifest), p = connectorPlans(layout, manifest).customers, e = anchorAt(layout, manifest, "inbox", "e");
      const back = p.cables.find((cb) => Math.min(cb.a[0], cb.b[0]) === e[0] + FEED_ANCHOR)!;
      expect(back).toBeDefined();
      expect(back.taut).toBe(true);
      expect(p.cables.filter((cb) => cb.taut)).toEqual([back]); // the rest sag between saddles as before
      const belt = (x: number) => (x >= e[0] && x <= p.spans[0].a[0] ? spanRow(p.spans[0], x) : null);
      const ys = Array.from({ length: back.b[0] - back.a[0] + 1 }, (_, i) => cableRow(back, back.a[0] + i, belt));
      // it climbs all the way from the deck to the saddle (never lies along the rail, never dips under its anchor)
      ys.forEach((y, i) => { if (i) expect(y).toBeLessThanOrEqual(ys[i - 1]); });
      expect(ys[0] - ys.at(-1)!).toBeGreaterThanOrEqual(20);
      expect(ys.filter((y) => y === ys[0]).length).toBeLessThanOrEqual(4);
    }
  });
});

describe("runway lamps", () => {
  for (const [name, manifest] of Object.entries(manifests)) for (const [view, layout] of Object.entries(layouts(manifest))) {
    const plans = connectorPlans(layout, manifest);
    test(`${view}, ${name}: exactly 12 per connector, at least 10 px apart, lamp 0 at the lit end, then outward`, () => {
      for (const id of BRIDGE_IDS) {
        const lamps = plans[id].lamps;
        expect(lamps.length).toBe(12);
        lamps.forEach((l, k) => { if (k) expect(l.dist).toBeGreaterThan(lamps[k - 1].dist); });
        for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) expect(Math.hypot(lamps[i].x - lamps[j].x, lamps[i].y - lamps[j].y)).toBeGreaterThanOrEqual(10);
        // each lamp's distance is where it really stands along the belt, so lamp 0 is the nearest the lit end
        for (const l of lamps) expect(Math.abs(beltDist(plans[id], l) - l.dist)).toBeLessThanOrEqual(1.5);
        expect(lamps[11].dist).toBeLessThanOrEqual(plans[id].length + 1);
      }
      // every pylon and junction carries one of the lamps
      for (const id of BRIDGE_IDS) for (const p of plans[id].pylons) expect(plans[id].lamps.some((l) => l.kind === "pylon" && l.x === p.x)).toBe(true);
    });

    test(`${view}, ${name}: the lit part grows lamp by lamp from the lit end and is the whole connector after the last`, () => {
      for (const id of BRIDGE_IDS) {
        const p = plans[id];
        expect(litReach(p, 0)).toBe(0);
        expect(litRects(p, 0)).toEqual([]);
        expect(litReach(p, 12)).toBe(Infinity);
        let was = 0;
        for (let k = 1; k < 12; k++) {
          const reach = litReach(p, k), rects = litRects(p, reach);
          expect(reach).toBeGreaterThan(was);
          was = reach;
          p.lamps.forEach((l, j) => expect(rects.some((r) => l.x >= r.x && l.x < r.x + r.w && l.y >= r.y && l.y < r.y + r.h)).toBe(j < k));
        }
      }
    });
  }

  test("the belt starts only once the 12th lamp is on (lamp k at 0.06 k s, the last at 0.66 s); Customers' right then", () => {
    const at = (s: number) => islandState(s / CITY_TIMING.light, 12, "customers", 15);
    expect(at(0.65)).toMatchObject({ lampsLit: 11, beltRuns: false });
    expect(at(0.66)).toMatchObject({ lampsLit: 12, beltRuns: true });
  });

  test("Errors', Traffic's and Inbox's belts wait until the island has finished lighting, and never start before 1.3 s", () => {
    for (const [island, lights] of [["errors", 3], ["traffic", 8], ["inbox", 4]] as const) {
      const at = (s: number) => islandState(s / CITY_TIMING.light, 12, island, lights), from = beltAt(lights);
      expect(from).toBeGreaterThanOrEqual(SEQUENCE.belt);
      expect(from).toBeCloseTo(Math.max(1.3, bloomAt(lights) + 3 * SEQUENCE.bloom), 9); // one step after the halo is whole
      expect(at(0.66)).toMatchObject({ lampsLit: 12, beltRuns: false }); // every lamp on, the belt still at rest
      expect(at(from - 0.01).beltRuns).toBe(false);
      expect(at(from).beltRuns).toBe(true);
      expect(at(CITY_TIMING.light).beltRuns).toBe(true);
    }
    expect(beltAt(3)).toBeCloseTo(1.3, 9); // Errors: lights to 0.99, halo whole at 1.16
    expect(beltAt(4)).toBeCloseTo(1.3, 9); // Inbox: lights to 1.04, halo whole at 1.21
    expect(beltAt(8)).toBeCloseTo(1.47, 9); // Traffic: eight signals to 1.24, halo whole at 1.41
  });
});

describe("room: no member over another island, a label or a plate", () => {
  for (const [name, manifest] of Object.entries(manifests)) for (const view of ["desktop", "phone"] as const) {
    const screen = SCREENS[view], layout = ringLayout(screen.portrait, manifest), boxes = connectorBoxes(layout, manifest);
    test(`${view} at k 1, ${name}: every member clear of other islands' sprites and of every label and plate`, () => {
      expect(boxes.length).toBeGreaterThan(50);
      for (const b of boxes) {
        for (const id of CITY_ISLANDS) if (!ENDS[b.id].includes(id)) expect(overlaps(b, islandRect(layout, manifest, id))).toBe(false);
        for (const id of [...CITY_ISLANDS, "line" as const]) expect(overlaps(b, tagBox(layout, manifest, id, screen))).toBe(false);
      }
    });
  }

  test("a phone's Errors plate stays 4 px clear of the trunk, and the trunk runs left of Errors", () => {
    for (const manifest of Object.values(manifests)) {
      const layout = ringLayout(true, manifest), tag = grow(tagBox(layout, manifest, "errors", SCREENS.phone), 4);
      for (const b of connectorBoxes(layout, manifest)) if (b.id === "errors") expect(overlaps(b, tag)).toBe(false);
      expect(connectorPlans(layout, manifest).errors.lifts[0].x).toBeLessThan(layout.pos.errors[0]);
    }
  });
});

describe("connector pixels", () => {
  const PAL = new Set(Object.values(PALETTE).flat().map(rgb));
  const plansOf = (manifest: CityManifest) => Object.values(layouts(manifest)).flatMap((l) => Object.values(connectorPlans(l, manifest)));
  const paint = (p: ConnectorPlan, pass: "back" | "front", step: number, on: boolean) => { const r = createRaster(planBounds(p)); paintConnector(r, p, { pass, step, on }); return r; };

  test("the dark connector (posterized once, lanterns off) uses only soot, iron[0] and iron[1]; the Hub too", () => {
    const dark = new Set([PALETTE.soot[0], PALETTE.iron[0], PALETTE.iron[1]].map(rgb));
    for (const p of plansOf(fallbackManifest())) for (const pass of ["back", "front"] as const) {
      const r = paint(p, pass, 0, false);
      posterize(r.data);
      for (const c of colours(r.data)) expect(dark.has(c)).toBe(true);
    }
    for (const portrait of [false, true]) {
      const hub = hubPlan(ringLayout(portrait)), r = createRaster({ x: -24, y: -12, w: 30, h: 64 });
      paintHub(r, hub, 0); posterize(r.data);
      for (const c of colours(r.data)) expect(dark.has(c)).toBe(true);
    }
    // the posterize rule itself: RGB sum < 60 soot, < 150 iron[0], else iron[1]; clear stays clear
    const d = new Uint8ClampedArray([20, 20, 19, 255, 20, 20, 20, 255, 50, 50, 49, 255, 50, 50, 50, 255, 0, 0, 0, 0]);
    posterize(d);
    expect([...d]).toEqual([10, 6, 4, 255, 24, 18, 17, 255, 24, 18, 17, 255, 41, 27, 23, 255, 0, 0, 0, 0]);
  });

  test("the lit connector uses the 48 palette colours only, its lanterns brass[4] with a brass[5] glint", () => {
    for (const p of plansOf(fallbackManifest())) for (const pass of ["back", "front"] as const) {
      const r = paint(p, pass, 3, true), seen = colours(r.data);
      for (const c of seen) expect(PAL.has(c)).toBe(true);
      if (pass === "back") { expect(seen.has(rgb(PALETTE.brass[4]))).toBe(true); expect(seen.has(rgb(PALETTE.brass[5]))).toBe(true); }
    }
  });

  test("the belt moves in whole px toward the lit end and has exactly 14 pictures (a chevron every other plate)", () => {
    expect(BELT_STEPS).toBe(14);
    const p = connectorPlans(ringLayout(false), fallbackManifest()).customers;
    const a = paint(p, "back", 0, true), b = paint(p, "back", 1, true), c = paint(p, "back", 14, true), d = paint(p, "back", 7, true);
    expect([...c.data]).toEqual([...a.data]);
    expect([...b.data]).not.toEqual([...a.data]);
    expect([...d.data]).not.toEqual([...a.data]); // the plates repeat after 7 steps, the chevrons only after 14
    // a seam (soot on the three plate rows) one px further toward Inbox (west) at step 1
    const s = p.spans[0], row = spanRow(s, 300) + ROW.band + 3, px = (r: typeof a, x: number) => r.data.slice(((row - r.y) * r.w + (x - r.x)) * 4, ((row - r.y) * r.w + (x - r.x)) * 4 + 3).join(",");
    const seams = (r: typeof a) => Array.from({ length: 21 }, (_, i) => 290 + i).filter((x) => px(r, x) === rgb(PALETTE.soot[0]));
    expect(seams(b)).toEqual(seams(a).map((x) => x - 1).filter((x) => x >= 290));
  });
});

describe("chevrons on the belts", () => {
  const at = (r: Raster, x: number, y: number) => { const o = ((y - r.y) * r.w + (x - r.x)) * 4; return r.data[o + 3] ? `${r.data[o]},${r.data[o + 1]},${r.data[o + 2]}` : ""; };
  const BODY = rgb(PALETTE.brass[3]), TIP = rgb(PALETTE.brass[4]), DARK = rgb(PALETTE.iron[1]);
  /** The tips (brass[4]) on a horizontal belt's centre row. */
  const tipsH = (r: Raster, s: { a: [number, number]; b: [number, number] }) => {
    const out: number[] = [];
    for (let x = Math.min(s.a[0], s.b[0]); x <= Math.max(s.a[0], s.b[0]); x++) if (at(r, x, spanRow(s, x)) === TIP) out.push(x);
    return out;
  };

  test("a 3 x 3 brass chevron every 14 px points with the flow and steps one whole px a belt step; never cyan", () => {
    for (const toward of [1, -1]) {
      const s = { a: [toward > 0 ? 0 : 140, 50] as [number, number], b: [toward > 0 ? 140 : 0, 50] as [number, number] }, paintAt = (step: number) => { const r = createRaster({ x: -2, y: 40, w: 146, h: 30 }); paintSpan(r, s, step, true); return r; };
      const r0 = paintAt(0), r1 = paintAt(1), t0 = tipsH(r0, s), t1 = tipsH(r1, s);
      expect(t0.length).toBeGreaterThanOrEqual(9);
      t0.slice(1).forEach((x, i) => expect(x - t0[i]).toBe(14));
      for (const x of t0) if (x + toward >= 2 && x + toward <= 138) expect(t1).toContain(x + toward); // one px toward b
      expect(Math.abs(t1.length - t0.length)).toBeLessThanOrEqual(1);
      for (const x of t0) {
        // the tip leads; the middle column is a full 3 px; the back column has the two arms
        const mid = x - toward, back = x - 2 * toward;
        expect([at(r0, x, 49), at(r0, x, 51)]).not.toContain(TIP);
        expect([at(r0, mid, 49), at(r0, mid, 50), at(r0, mid, 51)]).toEqual([BODY, BODY, BODY]);
        expect([at(r0, back, 49), at(r0, back, 51)]).toEqual([BODY, BODY]);
        expect(at(r0, back, 50)).not.toBe(BODY);
      }
      // the only colours on the plate rows are the plates', the seams' and the chevrons' (no energy anywhere)
      const energy = new Set(PALETTE.energy.map(rgb));
      for (const c of colours(r0.data)) expect(energy.has(c)).toBe(false);
    }
  });

  test("on a sloped span every chevron stays upright: its three columns sit on the middle column's rows", () => {
    const p = connectorPlans(ringLayout(false), fallbackManifest()).errors, s = p.spans[0], r = createRaster(planBounds(p));
    paintSpan(r, s, 0, true);
    let seen = 0;
    for (let x = Math.min(s.a[0], s.b[0]) + 2; x <= Math.max(s.a[0], s.b[0]) - 2; x++) {
      const c = spanRow(s, x - 1); // toward +1: the tip is the east column, the middle one to its west
      if (at(r, x, c) !== TIP || at(r, x - 1, c) !== BODY) continue;
      seen++;
      expect([at(r, x - 1, c - 1), at(r, x - 1, c + 1), at(r, x - 2, c - 1), at(r, x - 2, c + 1)]).toEqual([BODY, BODY, BODY, BODY]);
    }
    expect(seen).toBeGreaterThanOrEqual(10);
  });

  test("a lift's chevrons point up (Inbox) or down (a phone's trunk) and move that way; the dark belt's are iron[1] at rest", () => {
    for (const up of [true, false]) {
      // the cage's braces cross the belt in front of it, so some chevrons hide behind them: a long lift shows plenty
      const l = { x: 0, top: 0, bottom: 400, up, foot: false }, paintAt = (step: number, on = true) => { const r = createRaster({ x: -8, y: 0, w: 17, h: 401 }); paintLift(r, l, step, on); return r; };
      const tips = (r: Raster) => Array.from({ length: 401 }, (_, y) => y).filter((y) => at(r, 0, y) === TIP && at(r, -1, y) !== BODY);
      const t0 = tips(paintAt(0)), t1 = tips(paintAt(1));
      expect(t0.length).toBeGreaterThanOrEqual(8);
      expect(t1.filter((y) => t0.includes(y + (up ? 1 : -1))).length).toBeGreaterThanOrEqual(Math.ceil(t1.length * 0.6)); // one px up, or down
      const r = paintAt(0), y = t0[2], next = up ? 1 : -1;
      expect([at(r, -1, y + next), at(r, 0, y + next), at(r, 1, y + next)].filter((c) => c === BODY).length).toBeGreaterThanOrEqual(2); // behind the tip, the body
      const dark = paintAt(0, false);
      expect(tips(dark)).toEqual([]); // no brass when dark...
      expect(at(dark, 0, t0[2])).toBe(DARK); // ...iron[1] chevrons where the brass ones would be
    }
  });

  test("the Hub's port belts carry chevrons too, pointing east into the line, and step with the belt", () => {
    const hub = hubPlan(ringLayout(false));
    let shown = 0;
    for (let step = 0; step < BELT_STEPS; step++) {
      const r = createRaster({ x: -24, y: -12, w: 30, h: 64 });
      paintHub(r, hub, step, true);
      for (const [, py] of hub.ports) for (let x = -18; x <= -4; x++) if (at(r, x, py) === TIP) { shown++; expect(at(r, x - 1, py)).toBe(BODY); } // body to the tip's west
    }
    expect(shown).toBeGreaterThanOrEqual(4); // the gear housing hides them for part of the way
  });
});

describe("a mid pier: a lattice leg down to one floating boulder", () => {
  const at = (r: Raster, x: number, y: number) => { const o = ((y - r.y) * r.w + (x - r.x)) * 4; return r.data[o + 3] ? `${r.data[o]},${r.data[o + 1]},${r.data[o + 2]}` : ""; };
  const paintPier = (on: boolean, deep = 0) => { const r = createRaster({ x: -16, y: -50, w: 33, h: 95 }); paintPylon(r, { x: 0, c: 0, foot: "pier", deep }, on); return r; };
  const SOOT = rgb(PALETTE.soot[0]);

  test("the leg narrows from 7 px under the deck to a 4 px foot over 10 rows: shade chord iron[1], sun chord iron[3], soot outline", () => {
    const r = paintPier(true), y0 = ROW.leg, y1 = ROW.leg + KIT.pier.h - 1;
    expect(KIT.pier).toMatchObject({ top: 7, foot: 4, h: 10, rockW: 14, rockH: 9, seat: 6 });
    expect([at(r, -3, y0), at(r, 3, y0)]).toEqual([rgb(PALETTE.iron[1]), rgb(PALETTE.iron[3])]);
    expect([at(r, -2, y1), at(r, 1, y1)]).toEqual([rgb(PALETTE.iron[1]), rgb(PALETTE.iron[3])]);
    expect([at(r, -4, y0), at(r, 4, y0), at(r, -3, y1), at(r, 2, y1)]).toEqual(Array(4).fill(SOOT)); // outlined
    // one K brace (iron[2]) inside the frame
    let brace = 0;
    for (let y = y0; y <= y1; y++) for (let x = -3; x <= 3; x++) if (at(r, x, y) === rgb(PALETTE.iron[2])) brace++;
    expect(brace).toBeGreaterThanOrEqual(6);
  });

  test("its rock: one boulder 14 x 9 whose flat 6 px top takes the leg's foot, lit upper right, dark lower left, a notch, no split", () => {
    const r = paintPier(true), top = ROW.rock, y1 = ROW.leg + KIT.pier.h - 1;
    expect(ROW.rockEnd - ROW.rock + 1).toBe(KIT.pier.rockH);
    const rows = Array.from({ length: KIT.pier.rockH }, (_, j) => top + j), span = (y: number) => Array.from({ length: 33 }, (_, i) => i - 16).filter((x) => at(r, x, y) !== "");
    const xs = rows.flatMap(span);
    expect(Math.max(...xs) - Math.min(...xs) + 1).toBe(14);
    expect(at(r, -2, top - 1) !== "" && at(r, 1, top - 1) !== "" && at(r, 0, ROW.rockEnd + 1) === "").toBe(true); // the leg's foot on it, nothing below it
    expect(rows.every((y) => span(y).length > 0)).toBe(true); // 9 rows tall
    // the flat top: exactly the 6 px under the leg's foot (its outline x -3..2), all soot
    expect(span(top)).toEqual([-3, -2, -1, 0, 1, 2]);
    expect(span(top).every((x) => at(r, x, top) === SOOT)).toBe(true);
    expect(span(y1)).toEqual(expect.arrayContaining([-3, 2]));
    // one boulder: every row is one run, soot only at its two ends (no crevice down the middle)
    for (const y of rows.slice(1, -1)) {
      const s = span(y);
      expect(s.at(-1)! - s[0] + 1).toBe(s.length);
      const inside = s.filter((x) => at(r, x, y) !== SOOT);
      expect(inside.at(-1)! - inside[0] + 1).toBe(inside.length);
    }
    // the facets: plate[3] / plate[2] up on the right, plate[1] in the middle, iron[0] low on the left
    const body = rows.flatMap((y) => span(y).map((x) => [x, y] as const)).filter(([x, y]) => at(r, x, y) !== SOOT);
    const of = (...cs: string[]) => body.filter(([x, y]) => cs.map(rgb).includes(at(r, x, y)));
    const mean = (pts: readonly (readonly [number, number])[]) => [pts.reduce((n, p) => n + p[0], 0) / pts.length, pts.reduce((n, p) => n + p[1], 0) / pts.length];
    const lit = of(PALETTE.plate[3], PALETTE.plate[2]), mid = of(PALETTE.plate[1]), dark = of(PALETTE.iron[0]);
    expect([lit.length, mid.length, dark.length].every((n) => n >= 8)).toBe(true);
    expect(of(PALETTE.plate[3]).length).toBeGreaterThanOrEqual(5);
    const [lx, ly] = mean(lit), [mx] = mean(mid), [dx, dy] = mean(dark);
    expect(lx).toBeGreaterThan(mx);
    expect(mx).toBeGreaterThan(dx);
    expect(ly).toBeLessThan(dy);
    expect(new Set(body.map(([x, y]) => at(r, x, y)))).toEqual(new Set([PALETTE.plate[3], PALETTE.plate[2], PALETTE.plate[1], PALETTE.iron[0], PALETTE.energy[1]].map(rgb)));
    // a 2 px notch bitten out of its lower left: the body's left edge steps in 2 px from one row to the next, once
    const left = rows.slice(1, -1).map((y) => Math.min(...span(y).filter((x) => at(r, x, y) !== SOOT)));
    const steps = left.slice(1).map((x, i) => x - left[i]).filter((d, i) => i >= 3 && d >= 2);
    expect(steps).toEqual([2]);
  });

  test("lit, its only cyan is one energy[1] fleck; dark, none; under a sloped span the whole pier hangs 2 rows lower", () => {
    const cyan = (r: Raster) => { const out: string[] = []; for (let y = -50; y < 45; y++) for (let x = -16; x < 17; x++) if (PALETTE.energy.map(rgb).includes(at(r, x, y))) out.push(`${x},${y},${at(r, x, y)}`); return out; };
    const lit = cyan(paintPier(true));
    expect(lit.length).toBe(1);
    expect(lit[0].endsWith(rgb(PALETTE.energy[1]))).toBe(true);
    const [fx, fy] = lit[0].split(",").map(Number);
    expect(fy >= ROW.rock && fy <= ROW.rockEnd && fx >= -7 && fx <= 6).toBe(true); // in the boulder
    expect(cyan(paintPier(false))).toEqual([]);
    const sloped = paintPier(true, SLOPED_DEEP), flat = paintPier(true);
    for (let y = ROW.leg; y <= ROW.rockEnd; y++) for (let x = -8; x <= 8; x++) expect(at(sloped, x, y + SLOPED_DEEP)).toBe(at(flat, x, y));
  });
});

describe("the truss under a sloped span", () => {
  test("12 px panels, a 6-row web with one diagonal each, every vertical upright with a brass rivet on top", () => {
    const p = connectorPlans(ringLayout(false), fallbackManifest()).errors, s = p.spans[0], r = createRaster(planBounds(p));
    paintSpan(r, s, 0, true);
    const at = (x: number, y: number) => { const o = ((y - r.y) * r.w + (x - r.x)) * 4; return r.data[o + 3] ? `${r.data[o]},${r.data[o + 1]},${r.data[o + 2]}` : ""; };
    expect(trussEnd(s)).toBe(ROW.trussEnd + SLOPED_DEEP);
    const x0 = Math.min(s.a[0], s.b[0]), x1 = Math.max(s.a[0], s.b[0]), web = (x: number) => spanRow(s, x) + ROW.band + 9;
    let verticals = 0;
    for (let x = x0; x <= x1; x++) {
      if (((x % 12) + 12) % 12 === 0) {
        verticals++;
        expect(at(x, web(x))).toBe(rgb(PALETTE.brass[2]));
        for (let k = 1; k < 6; k++) expect(at(x, web(x) + k)).toBe(rgb(PALETTE.iron[1]));
        expect(at(x, web(x) + 6)).toBe(rgb(PALETTE.iron[0])); // the bottom chord under the 6-row web
      } else if (((x % 12) + 12) % 12 === 6) {
        // no vertical half way along a panel: only the panel's one diagonal crosses it
        const ink = Array.from({ length: 6 }, (_, k) => at(x, web(x) + k)).filter((c) => c === rgb(PALETTE.iron[1])).length;
        expect(ink).toBeLessThanOrEqual(2);
      }
    }
    expect(verticals).toBeGreaterThanOrEqual(14);
  });
});

describe("the rocket arc", () => {
  for (const [name, manifest] of Object.entries(manifests)) for (const portrait of [false, true]) {
    const layout = ringLayout(portrait, manifest), pad = at(layout, "customers", manifest.islands.customers.pad!), dots = arcPoints(ROCKET_SPOT, pad, portrait);
    test(`${portrait ? "phone" : "desktop"}, ${name}: 30 dots, at least 11 px apart, from the line's rocket (dot 0) to the pad`, () => {
      expect(ARC_DOTS).toBe(30);
      expect(dots.length).toBe(30);
      const d = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
      for (let j = 1; j < 30; j++) expect(d(dots[j], dots[j - 1])).toBeGreaterThanOrEqual(ARC_GAP);
      expect(d(dots[0], ROCKET_SPOT)).toBeLessThan(12);
      expect(d(dots[29], pad)).toBeLessThan(d(dots[29], ROCKET_SPOT));
      // the arrowhead's tip is straight above the pad, clear of the rocket that lands there, and of the last dot
      expect(arcEnd(pad)).toEqual([pad[0], pad[1] - ARROW_ABOVE]);
      expect(d(dots[29], arcEnd(pad))).toBeGreaterThanOrEqual(8);
    });
  }

  test("desktop: the arc's highest point is 70 px above the rocket spot, and it clears Marketing and every label", () => {
    for (const manifest of Object.values(manifests)) {
      const layout = ringLayout(false, manifest), pad = at(layout, "customers", manifest.islands.customers.pad!), end = arcEnd(pad);
      const [cx, cy] = arcControl(ROCKET_SPOT, end, false), y0 = ROCKET_SPOT[1], y2 = end[1], u = y0 - cy;
      expect(y0 - u * u / (2 * u + y2 - y0)).toBeCloseTo(ROCKET_SPOT[1] - ARC_RISE, 6);
      expect(Number.isFinite(cx)).toBe(true);
      const dots = arcPoints(ROCKET_SPOT, pad, false);
      expect(Math.min(...dots.map((p) => p[1]))).toBeLessThanOrEqual(ROCKET_SPOT[1] - ARC_RISE);
      for (const [x, y] of dots) {
        const dot = { x: x - 2, y: y - 2, w: 5, h: 5 };
        expect(overlaps(dot, islandRect(layout, manifest, "marketing"))).toBe(false);
        for (const id of [...CITY_ISLANDS, "line" as const]) expect(overlaps(dot, tagBox(layout, manifest, id, SCREENS.desktop))).toBe(false);
      }
    }
  });

  test("phone: it bows out to the right and stays 24 CSS px inside the screen at the ring camera", () => {
    for (const manifest of Object.values(manifests)) {
      const layout = ringLayout(true, manifest), pad = at(layout, "customers", manifest.islands.customers.pad!), dots = arcPoints(ROCKET_SPOT, pad, true);
      expect(Math.max(...dots.map((p) => p[0]))).toBeGreaterThan(Math.max(ROCKET_SPOT[0], pad[0]) + 15);
      const screen: CityScreen = { w: 390, h: 844, dpr: 2, portrait: true }, cam = cityCamera({ focus: null, plates: manualCity("city").plates }, screen, layout, manifest);
      const right = cam.x / 10 + (screen.w * screen.dpr) / cam.k / 2 - (24 * screen.dpr) / cam.k;
      for (const [x] of dots) expect(x + 2).toBeLessThanOrEqual(right);
    }
  });

  test("phone: a shallower bow than round 1's, so at the Customers close-up (k 2) the furthest dot is 48 device px or more inside the right edge", () => {
    expect(ARC_BOW).toBeLessThan(1);
    expect(ARC_GAP).toBe(9);
    for (const manifest of Object.values(manifests)) for (const [w, h] of [[390, 844], [390, 664], [375, 667]]) {
      const screen: CityScreen = { w, h, dpr: 2, portrait: true }, layout = ringLayout(true, manifest, Math.floor(usable(screen).h / 8) * 8);
      const pad = at(layout, "customers", manifest.islands.customers.pad!), dots = arcPoints(ROCKET_SPOT, pad, true);
      for (let j = 1; j < dots.length; j++) expect(Math.hypot(dots[j][0] - dots[j - 1][0], dots[j][1] - dots[j - 1][1]), `${w}x${h} dot ${j}`).toBeGreaterThanOrEqual(ARC_GAP);
      const cam = cityCamera({ focus: "customers", plates: manualCity("city").plates }, screen, layout, manifest);
      expect(cam.k).toBe(2);
      const right = cam.x / 10 + (screen.w * screen.dpr) / cam.k / 2, furthest = Math.max(...dots.map((p) => p[0] + 2));
      expect((right - furthest) * cam.k, `${w}x${h}`).toBeGreaterThanOrEqual(48);
    }
  });
});

describe("one number, one picture: islandState", () => {
  const T = CITY_TIMING.light;
  const at = (s: number, lamps = 12, island: CityIsland = "errors") => islandState(s / T, lamps, island);

  test("dark until the step starts; lit = 0 is a step to dark, never a fade", () => {
    expect(islandState(0, 12, "errors")).toMatchObject({ stage: "dark", lampsLit: 0, halo: false, beltRuns: false, arcDots: 0, capsule: false, beacon: false });
  });

  test("runway lamps light 60 ms apart, the first the moment the step starts, twelve by 0.66 s; the belt starts after the last", () => {
    expect(islandState(0.0001 / T, 12, "errors").lampsLit).toBe(1);
    expect(at(0.059).lampsLit).toBe(1);
    expect(at(0.06).lampsLit).toBe(2);
    expect(at(0.119).lampsLit).toBe(2);
    expect(at(0.12).lampsLit).toBe(3);
    expect(at(0.65).lampsLit).toBe(11);
    expect(at(0.66).lampsLit).toBe(12);
    expect(at(0.65, 12, "customers").beltRuns).toBe(false);
    expect(at(0.66, 12, "customers").beltRuns).toBe(true);
    expect(at(T).lampsLit).toBe(12);
    expect(at(0.3, 5, "customers").lampsLit).toBe(5); // a short bridge has fewer lamps; the belt runs after its last
    expect(at(0.24, 5, "customers").beltRuns).toBe(true);
    expect(at(0.24, 5).beltRuns).toBe(false); // Errors' waits for the island to finish lighting (1.3 s)
    expect(at(0.3, 0, "marketing")).toMatchObject({ lampsLit: 0, beltRuns: false }); // Marketing has no bridge
  });

  test("Errors, Traffic and Inbox: after the lit step their own lights come on one at a time, 0.05 s apart, then the lamp's halo blooms", () => {
    expect(SEQUENCED).toEqual(["errors", "traffic", "inbox"]);
    expect(SEQUENCE).toEqual({ gap: 0.05, bloom: 0.06, belt: 1.3 });
    for (const [island, n] of [["errors", 3], ["traffic", 8], ["inbox", 4]] as const) {
      const st = (s: number) => islandState(s / T, 12, island, n);
      expect(st(0.83)).toMatchObject({ lightsOn: 0, bloom: 0, halo: false });
      expect(st(0.84)).toMatchObject({ lightsOn: 0, bloom: 0, halo: true }); // the lit step: the picture first, on its own
      for (let j = 0; j < n; j++) {
        const on = CITY_TIMING.lit + (j + 1) * SEQUENCE.gap; // light j
        expect(st(on - 0.001).lightsOn).toBe(j);
        expect(st(on).lightsOn).toBe(j + 1);
        expect(st(on).bloom).toBe(0); // the halo waits for the last light
      }
      // then three halo steps 0.06 s apart, and it holds
      const b = bloomAt(n);
      expect(b).toBeCloseTo(CITY_TIMING.lit + (n + 1) * SEQUENCE.gap, 9);
      expect([st(b - 0.001).bloom, st(b).bloom, st(b + 0.06).bloom, st(b + 0.12).bloom, st(T).bloom]).toEqual([0, 1, 2, 3, 3]);
      expect(st(T).lightsOn).toBe(n); // and every light stays on: steady, never blinking
      // reduced motion lights the island in one frame: every light and the whole halo at once
      expect(islandState(1, 12, island, n)).toMatchObject({ lightsOn: n, bloom: 3 });
    }
    // Customers and Marketing light their own way: Customers' lights and halo all with the lit step, as before
    expect(at(0.84, 12, "customers")).toMatchObject({ lightsOn: 0, bloom: 3 }); // no lights passed: none to show
    expect(islandState(0.84 / T, 12, "customers", 15)).toMatchObject({ lightsOn: 15, bloom: 3 });
    expect(islandState(0.83 / T, 12, "customers", 15)).toMatchObject({ lightsOn: 0, bloom: 0 });
  });

  test("the lights' order: Errors' crack from the crater down, Traffic's signals west to east, Inbox's portholes bottom to top", () => {
    for (const manifest of Object.values(manifests)) {
      const lights = (id: CityIsland) => lightOrder(id, manifest.islands[id].lights).map((l) => l.at);
      const errors = lights("errors"), traffic = lights("traffic"), inbox = lights("inbox");
      expect(errors.length).toBe(manifest.islands.errors.lights.length);
      errors.forEach((p, i) => { if (i) expect(p[1]).toBeGreaterThan(errors[i - 1][1]); });
      traffic.forEach((p, i) => { if (i) expect(p[0]).toBeGreaterThan(traffic[i - 1][0]); });
      inbox.forEach((p, i) => { if (i) expect(p[1] < inbox[i - 1][1] || (p[1] === inbox[i - 1][1] && p[0] > inbox[i - 1][0])).toBe(true); });
      expect(new Set(inbox.map((p) => p.join())).size).toBe(inbox.length);
    }
    // whatever order the manifest lists them in
    const shuffled = [{ at: [36, 94] as const, kind: "window" }, { at: [22, 126] as const, kind: "window" }, { at: [36, 126] as const, kind: "window" }, { at: [22, 94] as const, kind: "window" }];
    expect(lightOrder("inbox", shuffled).map((l) => l.at.join())).toEqual(["22,126", "36,126", "22,94", "36,94"]);
    expect(lightOrder("errors", [{ at: [110, 80] as const }, { at: [109, 13] as const }, { at: [124, 40] as const }]).map((l) => l.at[1])).toEqual([13, 40, 80]);
    expect(lightOrder("traffic", [{ at: [60, 66] as const }, { at: [12, 66] as const }, { at: [36, 66] as const }]).map((l) => l.at[0])).toEqual([12, 36, 60]);
    expect(lightOrder("customers", shuffled)).toEqual(shuffled); // anything else: the manifest's own order
  });

  test("the island goes dark -> a 2x2 checker (0.72 s) -> lit (0.84 s), with its lamp halo from then on", () => {
    expect(at(0.71).stage).toBe("dark");
    expect(at(0.72).stage).toBe("dither");
    expect(at(0.83).stage).toBe("dither");
    expect(at(0.84).stage).toBe("lit");
    expect(at(T).stage).toBe("lit");
    expect(at(0.83).halo).toBe(false);
    expect(at(0.84).halo).toBe(true);
  });

  test("Customers: arc dots light from the line's rocket 20 ms apart from 0.84 s (all 30 by 1.42 s)", () => {
    const c = (s: number) => at(s, 12, "customers");
    expect(c(0.83).arcDots).toBe(0);
    expect(c(0.84).arcDots).toBe(1);
    expect(c(0.86).arcDots).toBe(2);
    expect(c(1.4).arcDots).toBe(29);
    expect(c(1.42).arcDots).toBe(30);
    expect(c(T).arcDots).toBe(30);
    for (const id of ["errors", "traffic", "inbox", "marketing"] as const) expect(at(T, 12, id)).toMatchObject({ arcDots: 0, capsule: false, flight: -1, arrow: false });
  });

  test("then the capsule flies the lit dots from 1.42 s to CITY_TIMING.capsule - 0.12, drops straight onto the pad and sits from CITY_TIMING.capsule", () => {
    const c = (s: number) => at(s, 12, "customers");
    expect(DROP).toBe(0.12);
    expect(CITY_TIMING.capsule).toBe(1.94);
    expect(FLIGHT).toEqual({ from: CITY_TIMING.lit + 29 * CITY_TIMING.arcDot, to: CITY_TIMING.capsule - 0.12 });
    expect(FLIGHT.from).toBeCloseTo(1.42, 9);
    expect(c(1.41)).toMatchObject({ flight: -1, drop: -1, arrow: false, capsule: false });
    expect(c(1.42).flight).toBeCloseTo(0, 6);
    expect(c(1.42).arrow).toBe(true); // the arrowhead shows once all 30 dots are lit...
    const mid = (FLIGHT.from + FLIGHT.to) / 2;
    expect(c(mid).flight).toBeCloseTo(0.5, 6);
    expect(c(FLIGHT.to - 0.001).flight).toBeGreaterThan(0.99);
    // ...until the capsule is over the pad: then it drops straight down for 0.12 s, the arrowhead gone
    expect(c(FLIGHT.to)).toMatchObject({ flight: -1, arrow: false, capsule: false });
    expect(c(FLIGHT.to).drop).toBeCloseTo(0, 6);
    expect(c(FLIGHT.to + 0.06).drop).toBeCloseTo(0.5, 6);
    expect(c(CITY_TIMING.capsule - 0.001).drop).toBeGreaterThan(0.99);
    expect(c(CITY_TIMING.capsule)).toMatchObject({ flight: -1, drop: -1, arrow: false, capsule: true }); // it sits down
    expect(c(T)).toMatchObject({ flight: -1, drop: -1, arrow: false, capsule: true });
    // reduced motion lights it all in one frame: on the pad already, never in the air
    expect(islandState(1, 12, "customers")).toMatchObject({ flight: -1, drop: -1, arrow: false, capsule: true });
  });

  test("Marketing: no bridge, no runway; the mast-tip beacon lights at 1.02 s", () => {
    const m = (s: number) => at(s, 0, "marketing");
    expect(m(1.01).beacon).toBe(false);
    expect(m(1.02).beacon).toBe(true);
    expect(m(0.3).lampsLit).toBe(0);
    for (const id of ["errors", "traffic", "inbox", "customers"] as const) expect(at(T, 12, id).beacon).toBe(false);
  });

  test("lampsOn agrees, and progress past 1 or below 0 is clamped", () => {
    expect(lampsOn(1, 12)).toBe(12);
    expect(lampsOn(5, 12)).toBe(12);
    expect(lampsOn(-1, 12)).toBe(0);
    expect(lampsOn(0.5, 0)).toBe(0);
    expect(islandState(7, 12, "customers").arcDots).toBe(30);
  });
});

describe("events: what a change of view fires", () => {
  const dark = () => Object.fromEntries(CITY_ISLANDS.map((i) => [i, 0])) as Record<CityIsland, number>;
  const view = (lit: Partial<Record<CityIsland, number>>, beat: CityView["beat"] = "islands"): CityView =>
    ({ zoom: "city", beat, lit: { ...dark(), ...lit }, plates: Object.fromEntries(CITY_ISLANDS.map((i) => [i, false])) as Record<CityIsland, boolean>, focus: null, label: "your repo" });
  const lamps = () => 12;

  test("Errors lighting at 60 fps: twelve ticks in order, one tap, nothing else", () => {
    const out: DeckEvent[] = [];
    let prev = view({});
    for (let k = 1; k <= 140; k++) {
      const next = view({ errors: Math.max(0, Math.min(1, (k / 60 - 0.6) / CITY_TIMING.light)) });
      out.push(...cityEvents(prev, next, lamps));
      prev = next;
    }
    expect(out.filter((e) => e.type === "city-lamp").map((e) => (e as { lamp: number }).lamp)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(out.filter((e) => e.type === "city-lamp").every((e) => (e as { of: number }).of === 12 && (e as { island: string }).island === "errors")).toBe(true);
    expect(out.filter((e) => e.type === "city-lit")).toEqual([{ type: "city-lit", island: "errors" }]);
    expect(out.length).toBe(13);
    expect(out.findIndex((e) => e.type === "city-lit")).toBeGreaterThan(11); // the tap comes after the runway
  });

  test("a jump over more than two lamps is silent, but one island reaching lit still taps", () => {
    const lampEvents = (a: number, b: number) => cityEvents(view({ errors: a / CITY_TIMING.light }), view({ errors: b / CITY_TIMING.light }), lamps).filter((e) => e.type === "city-lamp").map((e) => (e as { lamp: number }).lamp);
    expect(lampEvents(0.0016, 0.1016)).toEqual([1]); // an ordinary frame
    expect(lampEvents(0.0016, 0.1516)).toEqual([1, 2]); // two lamps in one frame still tick
    expect(lampEvents(0.0016, 0.2116)).toEqual([]); // three in one frame: a jump, silent
    expect(cityEvents(view({}), view({ errors: 0.6 }), lamps)).toEqual([{ type: "city-lit", island: "errors" }]); // 1.56 s in: the runway is silent, the tap is not
  });

  test("two islands reaching lit in one frame (reduced motion) tap nobody; city-all-lit fires when the beat enters grow", () => {
    const all = { errors: 1, traffic: 1, inbox: 1, customers: 1, marketing: 1 };
    expect(cityEvents(view({}, "city"), view(all, "grow"), lamps)).toEqual([{ type: "city-all-lit" }]);
    expect(cityEvents(view(all, "grow"), view(all, "grow"), lamps)).toEqual([]);
    expect(cityEvents(view({}, "islands"), view(all, "grow"), lamps)).toEqual([{ type: "city-all-lit" }]);
  });

  test("an island stepping back to dark thuds once; five at once (reduced motion) are one thud", () => {
    const all = { errors: 1, traffic: 1, inbox: 1, customers: 1, marketing: 1 };
    expect(cityEvents(view(all, "dim"), view({ ...all, marketing: 0 }, "dim"), lamps)).toEqual([{ type: "city-dim", island: "marketing" }]);
    expect(cityEvents(view(all, "grow"), view({}, "dim"), lamps)).toEqual([{ type: "city-dim", island: "errors" }]);
    expect(cityEvents(view({ errors: 0.2 }, "islands"), view({}, "islands"), lamps)).toEqual([]); // dimming before it was lit is nothing to hear
  });

  test("nothing fires for a view that has just appeared, for the manual city, or when there is no city", () => {
    const all = { errors: 1, traffic: 1, inbox: 1, customers: 1, marketing: 1 };
    expect(cityEvents(undefined, view(all, "grow"), lamps)).toEqual([]);
    expect(cityEvents(view({}), undefined, lamps)).toEqual([]);
    expect(cityEvents(manualCity("city"), manualCity("city"), lamps)).toEqual([]);
    expect(cityEvents(manualCity("line"), manualCity("city"), lamps)).toEqual([]);
  });

  test("a bridge with no lamps (Marketing) never ticks", () => {
    const out = cityEvents(view({}), view({ marketing: 0.02 }), (id) => (id === "marketing" ? 0 : 12));
    expect(out.filter((e) => e.type === "city-lamp")).toEqual([]);
  });
});

describe("the small pixel helpers", () => {
  const rgba = (...px: number[][]) => new Uint8ClampedArray(px.flat());

  test("the dither is a checker of 2x2 px cells: pixel (x, y) is lit when ((x >> 1) + (y >> 1)) & 1 is 0", () => {
    const grid = Array.from({ length: 4 }, (_, y) => Array.from({ length: 6 }, (_, x) => (litCell(x, y) ? 1 : 0)).join(""));
    expect(grid).toEqual(["110011", "110011", "001100", "001100"]);
    // and it only ever uses colours from the two pictures, each pixel from the one its cell says
    const w = 6, h = 4, a = rgba(...Array.from({ length: w * h }, (_, i) => [i, 0, 0, 255])), b = rgba(...Array.from({ length: w * h }, (_, i) => [0, i, 0, 255]));
    const out = checker(a, b, w, h);
    for (let i = 0; i < w * h; i++) expect([out[i * 4], out[i * 4 + 1]]).toEqual(litCell(i % w, Math.floor(i / w)) ? [i, 0] : [0, i]);
  });

  test("stepping back to dark shows that checker for 0.12 s first (the city's own clock)", () => {
    expect(DIM_DITHER).toBe(0.12);
  });

  test("the rocket's dust puff is three frames of 0.13 s, clumps 9, 15 and 21 px out either side, then gone", () => {
    expect(PUFF_FRAME).toBe(0.13);
    expect([...PUFF_OUT]).toEqual([9, 15, 21]);
    expect([-1, 0, 0.129, 0.13, 0.259, 0.26, 0.389, 0.39, 5].map(puffFrame)).toEqual([-1, 0, 0, 1, 1, 2, 2, -1, -1]);
  });

  test("the puff's clumps: 7 x 5, a soot outline round a white[0] top row and a haze[3] body; the third frame a px higher; a skirt in the first", () => {
    expect(CLUMP.length).toBe(5);
    expect(CLUMP.every((r) => r.length === 7)).toBe(true);
    const pad: [number, number] = [100, 50], frame = (f: number) => { const { ctx, painted } = fakeCtx(); drawPuff(ctx, pad, f); return painted; };
    for (const f of [0, 1, 2]) {
      const p = frame(f), out = PUFF_OUT[f], lift = f === 2 ? 1 : 0;
      for (const side of [-1, 1]) {
        const cx = pad[0] + side * out, px = [...p].filter(([k]) => { const [x, y] = k.split(",").map(Number); return Math.abs(x - cx) <= 3 && y <= pad[1]; });
        const xs = px.map(([k]) => Number(k.split(",")[0])), ys = px.map(([k]) => Number(k.split(",")[1]));
        expect([Math.max(...xs) - Math.min(...xs) + 1, Math.max(...ys) - Math.min(...ys) + 1]).toEqual([7, 5]);
        expect(Math.max(...ys)).toBe(pad[1] - lift); // standing on the foot's row (the third frame 1 px up)
        const colour = (x: number, y: number) => p.get(`${x},${y}`)?.color;
        const top = Math.min(...ys);
        expect(colour(cx, top)).toBe(PALETTE.soot[0]); // the outline over...
        expect(colour(cx, top + 1)).toBe(PALETTE.white[0]); // ...a white top row...
        expect(colour(cx, top + 3)).toBe(PALETTE.haze[3]); // ...over a haze[3] body
        expect(colour(cx - 3, top + 3)).toBe(PALETTE.soot[0]);
        expect(colour(cx, top + 4)).toBe(PALETTE.soot[0]);
        expect(new Set(px.map(([, v]) => v.color))).toEqual(new Set([PALETTE.soot[0], PALETTE.white[0], PALETTE.haze[3]]));
      }
      const skirt = [...p].filter(([k, v]) => Number(k.split(",")[1]) === pad[1] + 1 && v.color === PALETTE.haze[2]).map(([k]) => Number(k.split(",")[0]));
      expect(skirt.length).toBe(f === 0 ? 11 : 0); // an 11 x 1 haze[2] skirt under the rocket in the first frame only
      if (f === 0) expect([Math.min(...skirt), Math.max(...skirt)]).toEqual([pad[0] - 5, pad[0] + 5]);
    }
    expect(frame(3).size).toBe(0); // then gone
  });

  test("arc dots: lit, a 5 x 5 brass bead in a soot outline; dark, the same 5 x 5, an iron[1] bead with an iron[3] glint", () => {
    expect(DOT.length).toBe(5);
    expect(DOT.every((r) => r.length === 5)).toBe(true);
    expect(DOT_DARK).toEqual(DOT); // the same size and shape, lit or not
    const { ctx, painted } = fakeCtx();
    drawArc(ctx, [[10, 10], [30, 10]], 1, [60, 40], false);
    const colour = (k: string) => painted.get(k)?.color;
    expect([colour("29,9"), colour("30,10"), colour("31,9")]).toEqual([PALETTE.iron[1], PALETTE.iron[1], PALETTE.iron[3]]); // the dark bead
    expect([colour("28,10"), colour("32,10"), colour("30,8"), colour("30,12")]).toEqual(Array(4).fill(PALETTE.soot[0])); // in a soot outline
    expect([colour("9,9"), colour("11,9"), colour("10,8")]).toEqual([PALETTE.brass[4], PALETTE.brass[5], PALETTE.soot[0]]); // the lit one
    const box = (x0: number) => [...painted].filter(([k, v]) => { const [x, y] = k.split(",").map(Number); return v.alpha === 1 && Math.abs(x - x0) <= 4 && Math.abs(y - 10) <= 4; }).map(([k]) => k.split(",").map(Number));
    const size = (pts: number[][]) => [Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0])) + 1, Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1])) + 1];
    expect(size(box(30))).toEqual(size(box(10))); // unlit and lit beads are the same size
    expect([...painted.keys()].some((k) => k.startsWith("60,"))).toBe(false); // no arrowhead unless asked
    // `show` leaves dots out
    const hidden = fakeCtx();
    drawArc(hidden.ctx, [[10, 10], [30, 10]], 2, [60, 40], false, (j) => j === 0);
    expect(hidden.painted.has("10,10")).toBe(true);
    expect([...hidden.painted.keys()].some((k) => Number(k.split(",")[0]) >= 25)).toBe(false);
  });

  test("on a phone, dots that would sit in the caption band hide unless the camera is on Customers; a desktop shows them all", () => {
    const phone: CityScreen = { w: 390, h: 844, dpr: 2, portrait: true }, desk: CityScreen = { w: 1280, h: 720, dpr: 1, portrait: false };
    // a city buffer at k 2 on a phone: 844 rows (1688 device rows); this transform puts city row y on buffer row y + 100
    const { ctx } = fakeCtx({ a: 1, d: 1, e: 0, f: 100 }, 844);
    const limit = (phone.h - BAND.portrait) * phone.dpr / 2 - 100; // the band's top edge in city rows: 664
    const dots: [number, number][] = [[0, limit - 4], [0, limit - 3], [0, limit - 2], [0, limit + 40]];
    const shown = (focus: CityIsland | null, screen = phone) => dots.map((_, j) => arcDotsShown(ctx, dots, screen, focus)(j));
    expect(shown("errors")).toEqual([true, true, false, false]); // a dot's bottom edge (y + 3) must be above the band
    expect(shown(null)).toEqual([true, true, false, false]);
    expect(shown("customers")).toEqual([true, true, true, true]);
    expect(shown("errors", desk)).toEqual([true, true, true, true]);
  });

  test("Customers' capsule: 9 x 15 upright, the line's rocket in small, and its flight poses in the same palette", () => {
    expect(ROCKET.length).toBe(15);
    expect(ROCKET.every((r) => r.length === 9)).toBe(true);
    expect(ROCKET.slice(0, 4).map((r) => r.replace(/[.S]/g, "").length)).toEqual([0, 1, 3, 5]); // the nose widens 1, 3, 5
    expect(ROCKET[3]).toBe(".SnnnnNS."); // copper[3] with a copper[4] right edge
    for (const r of ROCKET.slice(4, 9)) expect(r.slice(2, 7).replace(/e/g, "w")).toBe("HHwww"); // haze[3] on the left 2, white[0] on the right 3
    expect([ROCKET[5].slice(4, 6), ROCKET[6].slice(4, 6)]).toEqual(["ee", "ee"]); // the 2 x 2 porthole at rows 5-6
    expect(ROCKET[9]).toBe(".SBBBBBS."); // the brass band at row 9
    expect(ROCKET.slice(11, 13).every((r) => r[1] === "f" && r[7] === "F")).toBe(true); // fins: copper[1] in the shade, copper[3] in the sun
    expect(ROCKET.join("")).toContain("i"); // the iron nozzle
    const letters = (rows: readonly string[]) => new Set(rows.join("").replace(/\./g, ""));
    for (const pose of [ROCKET_UP, ROCKET_LEVEL]) {
      for (const ch of letters(pose)) expect(letters(ROCKET).has(ch)).toBe(true);
      expect(pose.every((r) => r.length === pose[0].length)).toBe(true);
    }
    expect(ROCKET_LEVEL[4].slice(-2)).toBe("NS"); // level: the nose points right
    expect(ROCKET_UP[0].lastIndexOf("S")).toBeGreaterThan(ROCKET_UP[0].length - 4); // up and right: the tip is top right
    expect(FLAME).toEqual({ w: 1, h: 2, color: PALETTE.sun[4] }); // coming down upright, on a 1 x 2 sun[4] flame
  });

  test("the flight: whole city px along the dots, nose up-right over dots 0-9, level over 10-16, then upright from dot 17 on", () => {
    const dots = Array.from({ length: 30 }, (_, j) => [j * 11.4, j < 15 ? -j * 3.3 : -50 + (j - 15) * 6.1] as [number, number]).map(([x, y]) => [Math.round(x), Math.round(y)] as [number, number]);
    expect(flightAt(dots, 0)).toEqual({ at: dots[0], pose: "up" });
    expect(flightAt(dots, 1)).toEqual({ at: dots[29], pose: "upright" });
    for (let k = 0; k <= 200; k++) {
      const p = k / 200, { at, pose } = flightAt(dots, p), u = p * 29;
      expect(at.every(Number.isInteger)).toBe(true);
      expect(pose).toBe(u < 10 ? "up" : u < 17 ? "level" : "upright");
    }
  });

  test("the drop: straight from the last dot to standing on the pad, in whole px; drawn upright on its flame, no turning", () => {
    const last: [number, number] = [210, 120], pad: [number, number] = [214, 150];
    expect(dropAt(last, pad, 0)).toEqual(last);
    expect(dropAt(last, pad, 1)).toEqual([pad[0], pad[1] - (ROCKET.length >> 1)]); // its foot (centre + 7) on the pad's row
    let was = dropAt(last, pad, 0);
    for (let k = 1; k <= 20; k++) {
      const p = dropAt(last, pad, k / 20);
      expect(p.every(Number.isInteger)).toBe(true);
      expect(p[1]).toBeGreaterThanOrEqual(was[1]); // only ever down
      was = p;
    }
  });

  test("halo rings drawn one over the other never overlap: r 7-4 and r 4-2 tile the band from 2 to 7", () => {
    for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
      expect(inRing(7, 4, dx, dy) && inRing(4, 2, dx, dy)).toBe(false);
      const d2 = dx * dx + dy * dy;
      if (d2 > 2 * 2 + 2 && d2 <= 7 * 7 - 2) expect(inRing(7, 4, dx, dy) || inRing(4, 2, dx, dy)).toBe(true);
    }
    expect(inRing(4, 2, 0, 0)).toBe(false); // the lantern itself is never covered
    // drawn as runs per row, exactly those pixels, at one alpha, skipping the lantern's own box
    const painted = new Set<string>(), alphas = new Set<number>();
    const ctx = { fillStyle: "", globalAlpha: 1, globalCompositeOperation: "", save() {}, restore() {}, fillRect(x: number, y: number, w: number, h: number) { alphas.add(this.globalAlpha); for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) { const k = `${x + i},${y + j}`; expect(painted.has(k)).toBe(false); painted.add(k); } } };
    const skip = { x: 98, y: 47, w: 5, h: 9 };
    ring(ctx as unknown as CanvasRenderingContext2D, 100, 50, 7, 4, PALETTE.brass[3], 0.25, skip);
    for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
      const x = 100 + dx, y = 50 + dy, inSkip = x >= skip.x && x < skip.x + skip.w && y >= skip.y && y < skip.y + skip.h;
      expect(painted.has(`${x},${y}`)).toBe(inRing(7, 4, dx, dy) && !inSkip);
    }
    expect([...alphas]).toEqual([0.25]);
  });

  test("an island lamp's halo blooms in three steps: r 3-2 at 50%, then r 5-3 at 25% round it, then r 7-4 at 25% and r 4-2 at 50%", () => {
    const at = [50, 50] as [number, number], rings = (step: 1 | 2 | 3) => {
      const { ctx, painted } = fakeCtx();
      lanternHalo(ctx, at, undefined, step);
      const out = new Map<string, string[]>();
      for (const [k, v] of painted) { const key = `${v.color}@${v.alpha}`; out.set(key, [...(out.get(key) ?? []), k]); }
      return out;
    };
    const set = (outer: number, inner: number) => { const s: string[] = []; for (let dy = -9; dy <= 9; dy++) for (let dx = -9; dx <= 9; dx++) if (inRing(outer, inner, dx, dy)) s.push(`${at[0] + dx},${at[1] + dy}`); return s.sort(); };
    const one = rings(1), two = rings(2), three = rings(3);
    expect([...one.keys()]).toEqual([`${PALETTE.brass[4]}@0.5`]);
    expect(one.get(`${PALETTE.brass[4]}@0.5`)!.sort()).toEqual(set(3, 2));
    expect([...two.keys()].sort()).toEqual([`${PALETTE.brass[3]}@0.25`, `${PALETTE.brass[4]}@0.5`].sort());
    expect(two.get(`${PALETTE.brass[3]}@0.25`)!.sort()).toEqual(set(5, 3));
    expect(two.get(`${PALETTE.brass[4]}@0.5`)!.sort()).toEqual(set(3, 2));
    expect(three.get(`${PALETTE.brass[3]}@0.25`)!.sort()).toEqual(set(7, 4)); // today's halo, whole
    expect(three.get(`${PALETTE.brass[4]}@0.5`)!.sort()).toEqual(set(4, 2));
    // each step reaches further out than the last, and never covers the lamp itself
    const reach = (m: Map<string, string[]>) => Math.max(...[...m.values()].flat().map((k) => { const [x, y] = k.split(",").map(Number); return Math.hypot(x - at[0], y - at[1]); }));
    expect(reach(one)).toBeLessThan(reach(two));
    expect(reach(two)).toBeLessThan(reach(three));
    for (const m of [one, two, three]) expect([...m.values()].flat()).not.toContain(`${at[0]},${at[1]}`);
  });

  test("Marketing's beacon: r 14-9 brass[3] at 25%, r 9-4 brass[4] at 50%, a 3 x 3 brass[5] core with one white[0] px", () => {
    const { ctx, painted } = fakeCtx(), b = [100, 100] as [number, number];
    drawBeacon(ctx, b);
    for (let dy = -15; dy <= 15; dy++) for (let dx = -15; dx <= 15; dx++) {
      const p = painted.get(`${b[0] + dx},${b[1] + dy}`), core = Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
      if (core) expect(p).toEqual({ color: dx === 1 && dy === -1 ? PALETTE.white[0] : PALETTE.brass[5], alpha: 1 });
      else if (inRing(9, 4, dx, dy)) expect(p).toEqual({ color: PALETTE.brass[4], alpha: 0.5 });
      else if (inRing(14, 9, dx, dy)) expect(p).toEqual({ color: PALETTE.brass[3], alpha: 0.25 });
      else expect(p).toBeUndefined();
    }
  });

  test("the grow glow: on for beat grow only (off from the dim on, never the manual city, never at line zoom), as a step", () => {
    const view = (beat?: CityView["beat"]): CityView => ({ ...manualCity("city"), ...(beat ? { beat } : {}) });
    expect(growGlowOn(view("grow"))).toBe(true);
    for (const b of ["line", "city", "islands", "dim", "card"] as const) expect(growGlowOn(view(b))).toBe(false);
    expect(growGlowOn(view())).toBe(false);
    expect(growGlowOn({ ...manualCity("line"), beat: "grow" })).toBe(false);
    expect(growGlowOn(undefined)).toBe(false);
  });

  test("the grow glow is a backlight: only the sky's own ramps step up, two inside the inner ellipse, one inside the outer, opaque palette only", () => {
    expect(GROW_GLOW).toEqual({ at: [150, 40], outer: [196, 78], inner: [150, 56] });
    // a backdrop of every palette colour and some colours off the palette, over the ellipses' whole box
    const x0 = 150 - 200, y0 = 40 - 82, w = 401, h = 165, d = new Uint8ClampedArray(w * h * 4), seed = (i: number) => (i * 2654435761) >>> 0;
    for (let i = 0; i < w * h; i++) {
      const k = seed(i) % 61;
      const c = k < 48 ? PALETTE_48[k].slice(1).match(/../g)!.map((v) => parseInt(v, 16)) : [seed(i + 7) & 255, seed(i + 11) & 255, seed(i + 13) & 255];
      d.set([c[0], c[1], c[2], 255], i * 4);
    }
    const before = d.slice();
    warmUp(d, w, h, x0, y0);
    const PAL = PALETTE_48.map((hex) => rgb(hex));
    let twice = 0, moved = 0;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const o = (j * w + i) * 4, x = x0 + i, y = y0 + j, steps = warmSteps(x, y);
      const was = nearest48(before[o], before[o + 1], before[o + 2]), now = `${d[o]},${d[o + 1]},${d[o + 2]}`;
      if (!steps) { expect([...d.slice(o, o + 4)]).toEqual([...before.slice(o, o + 4)]); continue; } // outside: untouched
      expect(d[o + 3]).toBe(255);
      const idx = PAL.indexOf(now);
      expect(idx).toBeGreaterThanOrEqual(0); // a palette colour
      expect(idx).toBe(warmStep(was, steps));
      const a = rampOf(was), b = rampOf(idx);
      expect(b.ramp).toBe(a.ramp); // nothing ever leaves its ramp...
      if (a.ramp !== "sun" && a.ramp !== "copper") expect(idx).toBe(was); // ...and only the sky's ramps move: towers stay dark
      else { expect(b.k).toBeGreaterThanOrEqual(a.k); if (idx !== was) moved++; }
      if (steps === 2) twice++;
    }
    expect(twice).toBeGreaterThan(3000); // the inner ellipse's sky above and below the line
    expect(moved).toBeGreaterThan(1000);
    expect([inEllipse(150, 56, 149, 0), inEllipse(150, 56, 151, 0), inEllipse(196, 78, 0, 78), inEllipse(196, 78, 0, 79)]).toEqual([true, false, true, false]);
  });

  test("the glow's edges are a 4 px band of 2 x 2 checker, never a hard arc: inside it the checker picks the inner or the outer count", () => {
    expect(GLOW_BAND).toBe(2);
    const [cx, cy] = GROW_GLOW.at;
    const band = (r: readonly [number, number], dx: number, dy: number) => inEllipse(r[0] + GLOW_BAND, r[1] + GLOW_BAND, dx, dy) && !inEllipse(r[0] - GLOW_BAND, r[1] - GLOW_BAND, dx, dy);
    let edgeInner = 0, edgeOuter = 0;
    for (let y = cy - 90; y <= cy + 90; y++) for (let x = cx - 210; x <= cx + 210; x++) {
      const dx = x - cx, dy = y - cy, s = warmSteps(x, y);
      if (band(GROW_GLOW.inner, dx, dy)) { edgeInner++; expect(s).toBe(litCell(x, y) ? 2 : 1); }
      else if (inEllipse(GROW_GLOW.inner[0] - GLOW_BAND, GROW_GLOW.inner[1] - GLOW_BAND, dx, dy)) expect(s).toBe(2);
      else if (band(GROW_GLOW.outer, dx, dy)) { edgeOuter++; expect(s).toBe(litCell(x, y) ? 1 : 0); }
      else if (inEllipse(GROW_GLOW.outer[0] - GLOW_BAND, GROW_GLOW.outer[1] - GLOW_BAND, dx, dy)) expect(s).toBe(1);
      else expect(s).toBe(0);
    }
    expect(edgeInner).toBeGreaterThan(1000);
    expect(edgeOuter).toBeGreaterThan(1000);
    // along any row, the count never jumps across an edge without the checker between: 2 -> 1 -> 0 through dithered cells
    for (let y = cy - 80; y <= cy + 80; y++) {
      const row = Array.from({ length: 421 }, (_, i) => warmSteps(cx - 210 + i, y));
      row.forEach((s, i) => { if (i) expect(Math.abs(s - row[i - 1])).toBeLessThanOrEqual(1); });
    }
  });

  test("the warm-up's steps: sun and copper climb their own ramps one place a step; nothing else moves", () => {
    const i = (ramp: keyof typeof PALETTE, k: number) => PALETTE_48.indexOf(PALETTE[ramp][k]);
    expect(warmStep(i("sun", 2), 1)).toBe(i("sun", 3));
    expect(warmStep(i("sun", 4), 2)).toBe(i("sun", 6));
    expect(warmStep(i("sun", 5), 2)).toBe(i("sun", 6)); // the top of a ramp stays
    expect(warmStep(i("sun", 6), 2)).toBe(i("sun", 6));
    expect(warmStep(i("copper", 1), 2)).toBe(i("copper", 3));
    expect(warmStep(i("copper", 3), 2)).toBe(i("copper", 4));
    for (const ramp of ["soot", "iron", "steel", "brass", "plate", "haze", "white", "energy", "ok", "jam"] as const) {
      PALETTE[ramp].forEach((_, k) => { for (const n of [1, 2]) expect(warmStep(i(ramp, k), n)).toBe(i(ramp, k)); });
    }
  });

  test("a belt's phase moves in whole city px: the plates only ever shift an even number of art px", () => {
    for (let p = 0; p < 6; p += 0.0137) {
      const shift = Math.floor((quantPhase(p) * 170) / 5);
      expect(shift % 2).toBe(0);
      expect(quantPhase(p)).toBeGreaterThanOrEqual(0);
    }
    expect(beltStep(0)).toBe(0);
    expect(beltStep(10 / 170)).toBe(1); // one city px = 10 world units at 170 world/s
    expect(Math.floor((stepPhase(7) * 170) / 5)).toBe(14);
    let last = -1;
    for (let p = 0; p < 4; p += 0.01) { const q = quantPhase(p); expect(q).toBeGreaterThanOrEqual(last); last = q; }
  });
});

describe("halving the line 2:1 for the city grid", () => {
  const px = (r: number, g: number, b: number, a = 255) => [r, g, b, a];
  const pic = (w: number, rows: number[][][]) => new Uint8ClampedArray(rows.flat(2));

  test("every output pixel is one of the four it covers, so the palette survives", () => {
    const src = new Uint8ClampedArray(8 * 8 * 4);
    for (let i = 0; i < 64; i++) { const c = (i * 37) % 7; src.set([c * 30, c * 20, c * 10, 255], i * 4); }
    const out = halve2x(src, 8, 8), seen = new Set<string>();
    for (let i = 0; i < 64; i++) seen.add([...src.slice(i * 4, i * 4 + 4)].join());
    for (let i = 0; i < 16; i++) expect(seen.has([...out.slice(i * 4, i * 4 + 4)].join())).toBe(true);
  });

  test("plain nearest-neighbour: the upper right pixel of each 2x2 block, the light's side", () => {
    const a = px(10, 0, 0), b = px(20, 0, 0), c = px(30, 0, 0), d = px(40, 0, 0), e = px(50, 0, 0), f = px(60, 0, 0), g = px(70, 0, 0), h = px(80, 0, 0);
    // two blocks side by side: [a b | e f] over [c d | g h]
    expect([...halve2x(pic(4, [[a, b, e, f], [c, d, g, h]]), 4, 2)]).toEqual([...b, ...f]);
    // so a 1 px feature on an even column is skipped and one on an odd column is kept, the same way every time
    const body = px(100, 100, 100), rivet = px(250, 200, 20);
    expect([...halve2x(pic(2, [[rivet, body], [body, body]]), 2, 2)]).toEqual(body);
    expect([...halve2x(pic(2, [[body, rivet], [body, body]]), 2, 2)]).toEqual(rivet);
  });

  test("a silhouette keeps its outline: a transparent upper right gives way to the first solid pixel, never to sky", () => {
    const outline = px(10, 6, 4), clear = px(0, 0, 0, 0), body = px(100, 100, 100);
    expect([...halve2x(pic(2, [[outline, clear], [clear, clear]]), 2, 2)]).toEqual(outline); // upper left
    expect([...halve2x(pic(2, [[clear, clear], [clear, outline]]), 2, 2)]).toEqual(outline); // lower right
    expect([...halve2x(pic(2, [[clear, clear], [outline, clear]]), 2, 2)]).toEqual(outline); // lower left
    expect([...halve2x(pic(2, [[body, clear], [outline, outline]]), 2, 2)]).toEqual(body); // upper left before the lower ones
    expect([...halve2x(pic(2, [[clear, clear], [clear, clear]]), 2, 2)]).toEqual(clear);
    // translucent only (a halo): the most opaque one stands for the block
    expect([...halve2x(pic(2, [[px(9, 9, 9, 30), px(8, 8, 8, 10)], [px(7, 7, 7, 90), px(6, 6, 6, 60)]]), 2, 2)]).toEqual(px(7, 7, 7, 90));
  });

  test("the same picture always halves the same way, and the size is exactly half", () => {
    const src = new Uint8ClampedArray(6 * 4 * 4).map((_, i) => (i * 53) % 251);
    for (let i = 3; i < src.length; i += 4) src[i] = 255;
    const a = halve2x(src, 6, 4), b = halve2x(src, 6, 4);
    expect(a.length).toBe(3 * 2 * 4);
    expect([...a]).toEqual([...b]);
  });
});

describe("belts: the engine's own, turned for the bridges", () => {
  function render(draw: (ctx: CanvasRenderingContext2D) => void) {
    const pixels = new Map<string, string>();
    const ctx = { fillStyle: "", globalAlpha: 1, save() {}, restore() {}, fillRect(x: number, y: number, w: number, h: number) { for (let j = y; j < y + h; j += 5) for (let i = x; i < x + w; i += 5) pixels.set(`${i},${j}`, this.fillStyle); } };
    draw(ctx as unknown as CanvasRenderingContext2D);
    return pixels;
  }
  const arrows = (p: Map<string, string>, colour: string, keep: (x: number, y: number) => boolean) => [...p].filter(([k, c]) => { const [x, y] = k.split(",").map(Number); return c === colour && keep(x, y); }).map(([k]) => k.split(",").map(Number));

  test("beltRun runs right by default, left with dir -1: the chevrons travel the way the plates run", () => {
    const run = (t: number, dir: 1 | -1) => render((c) => beltRun(c, 0, 50, 300, 50, 300, 0, 50, () => false, () => t, dir));
    const row = (p: Map<string, string>) => arrows(p, PALETTE.energy[2], (x, y) => y === 35 && x >= 25 && x < 275).map(([x]) => x).sort((a, b) => a - b);
    expect(row(run(0.1, 1))).toEqual(row(run(0, 1)).map((x) => x + 5).filter((x) => x < 275 && x >= 25));
    const left = row(run(0.1, -1)), still = row(run(0, -1));
    expect(left).toEqual(still.map((x) => x - 5).filter((x) => x >= 25));
    expect(row(run(0, 1))).not.toEqual(row(run(0, -1))); // and the chevron itself points the other way
  });

  test("beltRun with no dir is byte for byte what it was (the line's belt)", () => {
    const a = render((c) => beltRun(c, 0, 50, 300, 50, 300, 0, 50, () => false, (x) => x / 100));
    const b = render((c) => beltRun(c, 0, 50, 300, 50, 300, 0, 50, () => false, (x) => x / 100, 1));
    expect([...a]).toEqual([...b]);
  });

  test("beltRunV is the belt standing up: 12 art px wide, plates 14 long, soot edges, a lit rail on the right", () => {
    const p = render((c) => beltRunV(c, 100, 0, 200, 0, 50, 0, 1));
    const xs = [...p.keys()].map((k) => Number(k.split(",")[0])), ys = [...p.keys()].map((k) => Number(k.split(",")[1]));
    expect(Math.max(...xs) - Math.min(...xs) + 5).toBe(12 * 5);
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBe(195);
    const x0 = Math.min(...xs);
    for (let y = 0; y < 200; y += 5) { expect(p.get(`${x0},${y}`)).toBe(PALETTE.soot[0]); expect(p.get(`${x0 + 55},${y}`)).toBe(PALETTE.soot[0]); } // soot edge either side
    expect([...p.values()].every((c) => (Object.values(PALETTE).flat() as string[]).includes(c))).toBe(true);
  });

  test("the plates repeat every 14 art px, so the engine's belt has exactly 7 pictures at city steps", () => {
    const h = (step: number, dir: 1 | -1) => render((c) => beltRun(c, 0, 50, 300, 50, 300, 0, 170, () => false, () => stepPhase(step), dir));
    const v = (step: number, dir: 1 | -1) => render((c) => beltRunV(c, 100, 0, 300, 0, 170, stepPhase(step), dir));
    const PLATE_STEPS = 7;
    for (let step = 0; step < 9; step++) for (const dir of [1, -1] as const) {
      expect([...h(step + PLATE_STEPS, dir)]).toEqual([...h(step, dir)]);
      expect([...v(step + PLATE_STEPS, dir)]).toEqual([...v(step, dir)]);
    }
    expect([...h(1, 1)]).not.toEqual([...h(0, 1)]); // and the steps in between do differ
    expect([...v(3, -1)]).not.toEqual([...v(2, -1)]);
  });

  test("beltRunV runs the plates down with dir 1 and up with dir -1, and holds still at phase 0", () => {
    const run = (phase: number, dir: 1 | -1) => render((c) => beltRunV(c, 100, 0, 400, 0, 50, phase, dir));
    const col = (p: Map<string, string>) => arrows(p, PALETTE.energy[2], (x, y) => x === 110 && y >= 50 && y < 350).map(([, y]) => y).sort((a, b) => a - b);
    expect(col(run(0.1, 1))).toEqual(col(run(0, 1)).map((y) => y + 5).filter((y) => y >= 50 && y < 350));
    expect(col(run(0.1, -1))).toEqual(col(run(0, -1)).map((y) => y - 5).filter((y) => y >= 50 && y < 350));
    expect([...run(0, 1)]).toEqual([...run(0, 1)]);
  });
});
