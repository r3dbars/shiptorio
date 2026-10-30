import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CITY_ISLANDS, CITY_PX, CITY_TIMING, PALETTE, PALETTE_48, type CityIsland } from "../src/deck2d/contract";
import {
  AIM, BAND, EDGE, LIFT, NUDGE, RING_PAD, SIDE, SKY_ABOVE, arcBox, cityCamera, createCityMove, cutHop, focusBox, islandBox, labelCss, pushBox,
  ringBox, ringK, roomBox, sideBox, union, usable, type CamPose, type CityScreen,
} from "../src/deck2d/city/camera";
import { cardAt } from "../src/deck2d/city/labels";
import { LINE_BOX, ROCKET_SPOT, bridgePaths, connectorBoxes, islandRect, labelAt, ringLayout, type Rect } from "../src/deck2d/city/layout";
import { fallbackManifest, parseManifest, type CityManifest } from "../src/deck2d/city/manifest";
import {
  CLOUDS, SKY, SKY_ANCHOR, SKY_BAND, SKY_BOXES, SKY_DEEPEN, SKY_DEEPER, SKY_DEEPEST, SKY_FOOT, SKY_OFFSET, SKY_PAINTED, SKY_WINDOWS, paintOut,
  ringLineRow, skyColumns, skyDarken, skyFills, skyLift, skyPlan, skyScale, type SkyBoxId, type SkyLayout,
} from "../src/deck2d/engine/sky";
import { revealAt } from "../src/deck2d/story/reveal";

// The city camera and the ring's room (web/src/deck2d/city/SPEC.md section 1 "Camera per beat" and section 3 "Ring
// layout", DIRECTION.md "camera"): whole k only, the ring fits the screen with the caption band to spare, a phone pans to
// each island at k_ring + 1 without leaving the ring, a new k or a long hop is a cut and a short one a calm glide, the sky is
// drawn at a whole-number scale, and nothing the player has to read sits under a bridge, a button, the caption or one of
// the sky picture's own floating islands.

const real = parseManifest(JSON.parse(readFileSync(join(import.meta.dir, "../public/deck/art/city/manifest.json"), "utf8"))) as CityManifest;
const SCREENS: Record<string, CityScreen> = {
  "desktop 1280x720 @1": { w: 1280, h: 720, dpr: 1, portrait: false },
  "desktop 1280x720 @2 (retina)": { w: 1280, h: 720, dpr: 2, portrait: false },
  "desktop 1440x900 @1": { w: 1440, h: 900, dpr: 1, portrait: false },
  "phone 390x844 @2": { w: 390, h: 844, dpr: 2, portrait: true },
  "phone 390x664 @2 (Safari with its bars)": { w: 390, h: 664, dpr: 2, portrait: true },
  "phone 375x667 @2 (SE)": { w: 375, h: 667, dpr: 2, portrait: true },
};
const PHONES = Object.entries(SCREENS).filter(([, s]) => s.portrait);
/** The screens the bridge, button and island room checks have always covered. */
const ROOM = ["desktop 1280x720 @1", "desktop 1280x720 @2 (retina)", "desktop 1440x900 @1", "phone 390x844 @2"];
const none = () => Object.fromEntries(CITY_ISLANDS.map((i) => [i, false])) as Record<CityIsland, boolean>;
/** The ring as the city module lays it out: from the shipped manifest's anchors. */
const ringOf = (s: Pick<CityScreen, "portrait">) => ringLayout(s.portrait, real);
const camera = (screen: CityScreen, focus: CityIsland | null = null, plates = false) => {
  const layout = ringOf(screen);
  return cityCamera({ focus, plates: Object.fromEntries(CITY_ISLANDS.map((i) => [i, plates])) as Record<CityIsland, boolean> }, screen, layout, real);
};
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** The view a camera shows, city px: the whole screen, and how far down the caption band starts. */
function viewOf(c: { x: number; y: number; k: number }, s: CityScreen) {
  const w = (s.w * s.dpr) / c.k, h = (s.h * s.dpr) / c.k, x = c.x / CITY_PX - w / 2, y = c.y / CITY_PX - h / 2;
  return { x, y, w, h, band: y + h - (BAND[s.portrait ? "portrait" : "landscape"] * s.dpr) / c.k, edge: (EDGE * s.dpr) / c.k };
}

describe("the ring camera (SPEC.md section 1)", () => {
  test("the largest whole k that fits: 1 on a 1280x720 desktop and a 1440x900 one, 2 on a retina 1280x720, 1 on every phone", () => {
    expect(ringK(ringOf({ portrait: false }), real, SCREENS["desktop 1280x720 @1"])).toBe(1);
    expect(ringK(ringOf({ portrait: false }), real, SCREENS["desktop 1280x720 @2 (retina)"])).toBe(2);
    expect(ringK(ringOf({ portrait: false }), real, SCREENS["desktop 1440x900 @1"])).toBe(1);
    for (const [, s] of PHONES) expect(ringK(ringOf(s), real, s)).toBe(1);
  });

  test("the ring box is the line, every island and every label with its plate, plus 20 px of air", () => {
    expect(RING_PAD).toBe(20);
    for (const screen of Object.values(SCREENS)) {
      const layout = ringOf(screen), k = ringK(layout, real, screen), box = ringBox(layout, real, screen, k);
      const parts = [LINE_BOX, ...CITY_ISLANDS.map((id) => islandBox(layout, real, id, screen, k, true))];
      const x0 = Math.min(...parts.map((p) => p.x)), x1 = Math.max(...parts.map((p) => p.x + p.w)), y0 = Math.min(...parts.map((p) => p.y));
      expect(box.x).toBe(x0 - RING_PAD);
      expect(box.x + box.w).toBe(x1 + RING_PAD);
      expect(box.y).toBe(y0 - RING_PAD);
      for (const p of parts) expect(p.y + p.h).toBeLessThanOrEqual(box.y + box.h - RING_PAD);
      // the plates are in the box from the start, so the camera never moves when they appear
      expect(cityCamera({ focus: null, plates: none() }, screen, layout, real)).toEqual(camera(screen, null, true));
    }
  });

  test("the ring is centred in the screen above the caption band: centre x is the ring box's, whole k, world units = city px x 10", () => {
    for (const [name, screen] of Object.entries(SCREENS)) {
      const c = camera(screen);
      expect(Number.isInteger(c.k)).toBe(true);
      // the band takes the bottom: the camera centre sits half a band below the ring's own centre
      const box = ringBox(ringOf(screen), real, screen, c.k);
      expect(c.x / CITY_PX).toBe(box.x + box.w / 2); // -413..766 on a desktop (176.5), -34..570 on a phone (268)
      expect(c.y / CITY_PX).toBeCloseTo(box.y + box.h / 2 + (BAND[screen.portrait ? "portrait" : "landscape"] * screen.dpr) / 2 / c.k, 6);
      expect(name.length).toBeGreaterThan(0);
    }
    expect(camera(SCREENS["desktop 1280x720 @1"]).k).toBe(1);
    expect(camera(SCREENS["desktop 1280x720 @2 (retina)"]).k).toBe(2);
  });

  test("the whole ring fits the usable screen at k_ring (or k is 1): 8 px at the sides, the caption band at the bottom", () => {
    expect([EDGE, BAND.landscape, BAND.portrait]).toEqual([8, 96, 80]); // two caption lines at city zoom (DIRECTION.md section C)
    for (const screen of ROOM.map((name) => SCREENS[name])) {
      const layout = ringOf(screen), k = ringK(layout, real, screen), box = ringBox(layout, real, screen, k), u = usable(screen);
      expect(box.w * k).toBeLessThanOrEqual(u.w);
      expect(box.h * k).toBeLessThanOrEqual(u.h);
    }
  });

  test("with real room to spare on the screens that matter (so one taller sprite cannot drop a retina desktop to k 1)", () => {
    const retina = SCREENS["desktop 1280x720 @2 (retina)"], layout = ringOf(retina);
    const box = ringBox(layout, real, retina, 2), u = usable(retina);
    expect(u.h - box.h * 2).toBeGreaterThanOrEqual(12);
    const phone = SCREENS["phone 390x844 @2"];
    expect(usable(phone).h - ringBox(ringOf(phone), real, phone, 1).h).toBeGreaterThanOrEqual(8);
  });

  test("a phone's plate is 12 px Silkscreen with 2px 4px of padding in a 2 px border: 20 CSS px under a 16 px label", () => {
    expect(labelCss({ w: 390, h: 844 }, false)).toBe(16);
    expect(labelCss({ w: 390, h: 844 }, true)).toBe(16 + 4 + 20);
    expect(labelCss({ w: 1280, h: 720 }, true)).toBe(20 + 4 + 24);
  });
});

describe("one step closer in beat 3 (k_ring + 1): a phone's close-up and a desktop's push-in", () => {
  /** The ring the city module lays out for this screen: a phone's spread to its own usable height (index.ts fitOf). */
  const moduleRing = (s: CityScreen) => ringLayout(s.portrait, real, s.portrait ? Math.floor(usable(s).h / 8) * 8 : undefined);
  const shot = (s: CityScreen, focus: CityIsland | null, layout = moduleRing(s)) =>
    cityCamera({ focus, plates: none(), beat: "islands" }, s, layout, real);
  const CLOSE = { "phone 390x844 @2": SCREENS["phone 390x844 @2"], "phone 390x664 @2 (Safari with its bars)": SCREENS["phone 390x664 @2 (Safari with its bars)"] };
  const mid = LINE_BOX.x + LINE_BOX.w / 2;

  test("a phone frames each island at k 2, its view's edge in the gap between the two columns: the other column is out of the picture", () => {
    for (const [name, s] of PHONES) {
      const layout = moduleRing(s);
      for (const id of CITY_ISLANDS) {
        const c = shot(s, id, layout), v = viewOf(c, s), own = islandRect(layout, real, id), onLeft = own.x + own.w / 2 < mid;
        expect(c.k, `${name} ${id}`).toBe(ringK(layout, real, s) + 1);
        for (const o of CITY_ISLANDS) {
          const r = islandRect(layout, real, o);
          if ((r.x + r.w / 2 < mid) === onLeft) continue; // its own column
          expect(overlaps(r, v), `${name} ${id}: ${o} is in the picture`).toBe(false);
        }
      }
    }
  });

  test("the view stays in the room (the ring, every connector, the arc): 24 CSS px to spare at the sides, 300 above, give or take a nudge", () => {
    for (const [name, s] of PHONES) {
      const layout = moduleRing(s), kRing = ringK(layout, real, s), room = roomBox(layout, real, s, kRing);
      for (const id of CITY_ISLANDS) {
        const c = shot(s, id, layout), v = viewOf(c, s), toCity = s.dpr / c.k, slack = (NUDGE + LIFT) * toCity + 1e-9;
        expect(v.x, `${name} ${id}`).toBeGreaterThanOrEqual(room.x - SIDE * toCity - slack);
        expect(v.x + v.w, `${name} ${id}`).toBeLessThanOrEqual(room.x + room.w + SIDE * toCity + slack);
        expect(v.y, `${name} ${id}`).toBeGreaterThanOrEqual(room.y - SKY_ABOVE * toCity - slack);
        expect(v.band, `${name} ${id}`).toBeLessThanOrEqual(room.y + room.h + slack);
      }
      // so a phone never hops further than its own height between two islands
      for (let i = 1; i < CITY_ISLANDS.length; i++) {
        const a = shot(s, CITY_ISLANDS[i - 1], layout), b = shot(s, CITY_ISLANDS[i], layout);
        expect(Math.hypot(a.x - b.x, a.y - b.y) / CITY_PX / s.dpr * b.k).toBeLessThanOrEqual(s.h);
      }
    }
  });

  test("390x844 and 390x664: every island, Errors' trunk and every arc dot of Customers' close-up keep 24 CSS px from both sides", () => {
    for (const [name, s] of Object.entries(CLOSE)) {
      const layout = moduleRing(s), trunk = union(connectorBoxes(layout, real).filter((b) => b.id === "errors")), arc = arcBox(layout, real);
      for (const id of CITY_ISLANDS) {
        const c = shot(s, id, layout), v = viewOf(c, s), side = (SIDE * s.dpr) / c.k;
        const keep = [islandRect(layout, real, id), ...(id === "errors" ? [trunk] : []), ...(id === "customers" ? [arc] : [])];
        for (const b of keep) {
          expect(b.x - v.x, `${name} ${id}`).toBeGreaterThanOrEqual(side);
          expect(v.x + v.w - (b.x + b.w), `${name} ${id}`).toBeGreaterThanOrEqual(side);
        }
      }
      expect(sideBox(layout, real, "customers")).toEqual(union([islandRect(layout, real, "customers"), arc]));
    }
  });

  test("390x844 and 390x664: Marketing's middle is between 25% and 50% of the usable height, down from the top", () => {
    for (const [name, s] of Object.entries(CLOSE)) {
      const layout = moduleRing(s), c = shot(s, "marketing", layout), v = viewOf(c, s), r = islandRect(layout, real, "marketing");
      const at = (r.y + r.h / 2 - (v.y + v.edge)) / (v.band - v.edge - (v.y + v.edge));
      expect(at, name).toBeGreaterThanOrEqual(0.25);
      expect(at, name).toBeLessThanOrEqual(0.5);
    }
    expect(AIM).toBeGreaterThanOrEqual(0.35);
    expect(AIM).toBeLessThanOrEqual(0.4);
  });

  test("390x844 and 390x664: no other island's sprite is cut by an edge of the screen, it is wholly in or wholly out", () => {
    for (const [name, s] of Object.entries(CLOSE)) {
      const layout = moduleRing(s);
      for (const id of CITY_ISLANDS) {
        const v = viewOf(shot(s, id, layout), s);
        for (const o of CITY_ISLANDS.filter((o) => o !== id)) {
          const r = islandRect(layout, real, o), inside = r.x >= v.x && r.x + r.w <= v.x + v.w && r.y >= v.y && r.y + r.h <= v.y + v.h;
          const outside = r.x >= v.x + v.w || r.x + r.w <= v.x || r.y >= v.y + v.h || r.y + r.h <= v.y;
          expect(inside || outside, `${name}: ${o} cut in ${id}'s close-up`).toBe(true);
        }
      }
    }
  });

  test("Customers frames the arc its rocket flies in on, and every island and its label sit inside the view, above the band", () => {
    const phone = SCREENS["phone 390x844 @2"], layout = ringOf(phone), arc = arcBox(layout, real), cust = islandBox(layout, real, "customers", phone, 2, false);
    expect(arc.y).toBeLessThan(cust.y); // the arc leaves the line's rocket, high above the pad
    expect(focusBox(layout, real, "customers", phone, 2, false).y).toBe(arc.y);
    for (const [, s] of PHONES) {
      for (const id of CITY_ISLANDS) {
        const c = camera(s, id), v = viewOf(c, s), box = islandBox(ringOf(s), real, id, s, c.k, false);
        expect(box.x).toBeGreaterThanOrEqual(v.x);
        expect(box.x + box.w).toBeLessThanOrEqual(v.x + v.w);
        expect(box.y).toBeGreaterThanOrEqual(v.y + v.edge);
        expect(box.y + box.h).toBeLessThanOrEqual(v.band);
      }
    }
  });

  test("another island hanging down into the caption band from above is lifted clear (up to 60 CSS px), so is one peeking up from below", () => {
    expect(LIFT).toBe(60);
    for (const [, s] of PHONES) {
      const layout = ringOf(s);
      for (const id of CITY_ISLANDS) {
        const c = camera(s, id), v = viewOf(c, s), most = (LIFT * s.dpr) / c.k;
        for (const other of [...CITY_ISLANDS.filter((o) => o !== id).map((o) => islandBox(layout, real, o, s, c.k, false)), LINE_BOX]) {
          if (other.x + other.w <= v.x || other.x >= v.x + v.w) continue;
          const foot = other.y + other.h, bottom = v.y + v.h;
          // hanging into the band from above by no more than LIFT: the camera took it out
          if (other.y < v.band && foot > v.band && foot <= bottom) expect(foot - v.band).toBeGreaterThan(most);
          // peeking up into the band from below by no more than LIFT: the camera pushed it off the bottom
          if (other.y >= v.band && other.y < bottom) expect(bottom - other.y).toBeGreaterThan(most);
        }
      }
    }
  });

  test("a desktop pushes in one step on every island: 1280x720 @1 and 1440x900 @2 frame each island's box inside the usable screen", () => {
    const desks = { "desktop 1280x720 @1": SCREENS["desktop 1280x720 @1"], "desktop 1440x900 @2": { w: 1440, h: 900, dpr: 2, portrait: false } as CityScreen };
    for (const [name, s] of Object.entries(desks)) {
      const layout = ringOf(s), kRing = ringK(layout, real, s);
      for (const id of CITY_ISLANDS) {
        const c = shot(s, id, layout), v = viewOf(c, s), box = pushBox(layout, real, id, s, c.k, false);
        expect(c.k, `${name} ${id}`).toBe(kRing + 1);
        expect(box.x, `${name} ${id}`).toBeGreaterThanOrEqual(v.x + v.edge);
        expect(box.x + box.w, `${name} ${id}`).toBeLessThanOrEqual(v.x + v.w - v.edge);
        // a box up to EDGE too tall for the usable height uses the top EDGE (Customers' arc at 1280x720): its head stays on screen
        expect(box.y, `${name} ${id}`).toBeGreaterThanOrEqual(box.h * c.k <= usable(s).h ? v.y + v.edge : v.y);
        expect(box.y + box.h, `${name} ${id}`).toBeLessThanOrEqual(v.band - v.edge);
      }
    }
  });

  test("a desktop's push-in frames the island, its connector's whole run and the end of the line it meets", () => {
    const s = SCREENS["desktop 1280x720 @1"], layout = ringOf(s), paths = bridgePaths(layout, real), k = 2;
    const holds = (box: Rect, [x, y]: readonly number[]) => x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
    const box = (id: CityIsland) => pushBox(layout, real, id, s, k, false);
    for (const id of CITY_ISLANDS) expect(union([box(id), focusBox(layout, real, id, s, k, false)])).toEqual(box(id)); // island, label, Customers' arc
    for (const id of ["errors", "traffic", "inbox", "customers"] as const) {
      for (const [x, y] of paths[id]) for (const p of [[x - 8, y - 8], [x + 8, y + 8]]) expect(holds(box(id), p), `${id} path`).toBe(true);
    }
    expect(holds(box("errors"), [-18, paths.errors.at(-1)![1]])).toBe(true); // the Hub's west face
    expect(holds(box("traffic"), [-18, paths.traffic.at(-1)![1]])).toBe(true);
    expect(holds(box("inbox"), [96, 36])).toBe(true); // the line's belly
    expect(holds(box("customers"), ROCKET_SPOT)).toBe(true); // the rocket
    // Marketing has no connector: it hangs off the line's launch end, so it frames the rocket with it
    expect(box("marketing")).toEqual(union([focusBox(layout, real, "marketing", s, k, false), { x: ROCKET_SPOT[0], y: ROCKET_SPOT[1], w: 0, h: 0 }]));
  });

  test("a desktop whose push-in box would not fit keeps the ring", () => {
    const small: CityScreen = { w: 900, h: 560, dpr: 1, portrait: false }, layout = ringOf(small), kRing = ringK(layout, real, small);
    for (const id of CITY_ISLANDS) {
      const box = pushBox(layout, real, id, small, kRing + 1, false), u = usable(small);
      if (box.w * (kRing + 1) <= u.w && box.h * (kRing + 1) <= u.h + EDGE * small.dpr) continue;
      expect(shot(small, id, layout)).toEqual(shot(small, null, layout));
    }
  });

  test("a screen narrower than the ring's own width still frames it (the clamp falls back to the centre)", () => {
    const narrow: CityScreen = { w: 200, h: 844, dpr: 2, portrait: true };
    const c = cityCamera({ focus: "errors", plates: none() }, narrow, ringOf(narrow), real);
    expect(Number.isFinite(c.x) && Number.isFinite(c.y)).toBe(true);
    expect(c.k).toBeGreaterThanOrEqual(2);
  });
});

describe("a phone's manual city keeps clear of the Zoom button and uses the bottom (no caption)", () => {
  // the engine passes top = the Zoom button's bottom + 8 (62 beside the mute button, 110 under it in the demos) and no band
  const manual = (w: number, h: number, top: number): CityScreen => ({ w, h, dpr: 2, portrait: true, top, band: 0 });
  const moduleRing = (s: CityScreen) => ringLayout(true, real, Math.floor(usable(s).h / 8) * 8);
  const manualView = { focus: null, plates: Object.fromEntries(CITY_ISLANDS.map((i) => [i, true])) as Record<CityIsland, boolean> }; // the end of beat 5

  test("usable() and ringK take the top reserve off, and the ring's middle moves down by half of it", () => {
    const plain: CityScreen = { w: 390, h: 664, dpr: 2, portrait: true, band: 0 }, top = { ...plain, top: 62 };
    expect(usable(plain).h - usable(top).h).toBe(62 * 2);
    const layout = moduleRing(top), a = cityCamera(manualView, plain, layout, real), b = cityCamera(manualView, top, layout, real);
    expect(b.k).toBe(a.k);
    expect((a.y - b.y) / CITY_PX * (b.k / 2)).toBeCloseTo(62 / 2, 9); // the camera moves up half the reserve: the ring down
  });

  for (const [w, h] of [[390, 664], [375, 667], [360, 640]]) for (const top of [62, 110]) {
    test(`${w}x${h} with the Zoom button's bottom at ${top - 8}: every island sprite is below the top reserve, every label and plate above the bottom`, () => {
      const s = manual(w, h, top), layout = moduleRing(s), c = cityCamera(manualView, s, layout, real), v = viewOf(c, s);
      expect(Number.isInteger(c.k)).toBe(true);
      const css = (y: number) => ((y - v.y) * c.k) / s.dpr; // city px -> CSS px from the top of the screen
      for (const id of CITY_ISLANDS) {
        const r = islandRect(layout, real, id);
        expect(css(r.y), `${id} top`).toBeGreaterThanOrEqual(top);
        expect(css(islandBox(layout, real, id, s, c.k, true).y + islandBox(layout, real, id, s, c.k, true).h), `${id} plate`).toBeLessThanOrEqual(h - EDGE);
      }
    });
  }
});

describe("at beat \"card\" a phone's ring stands above the sign-in card", () => {
  const phone = SCREENS["phone 390x844 @2"], layout = ringOf(phone), plates = Object.fromEntries(CITY_ISLANDS.map((i) => [i, true])) as Record<CityIsland, boolean>;
  const cardTop = cardAt(phone.w, phone.h).top; // where the sign-in card settles (labels.ts)
  const card = cityCamera({ focus: null, plates, beat: "card" }, { ...phone, cardTop }, layout, real);

  test("390x844: Inbox's label and plate end above the card's top, and the ring's top stays on screen", () => {
    const v = viewOf(card, phone), css = (y: number) => ((y - v.y) * card.k) / phone.dpr;
    const inbox = islandBox(layout, real, "inbox", phone, card.k, true);
    expect(css(inbox.y + inbox.h)).toBeLessThanOrEqual(cardTop);
    expect(css(ringBox(layout, real, phone, card.k).y)).toBeGreaterThanOrEqual(EDGE - 1e-9);
    expect(card.k).toBe(camera(phone).k); // the same k as the ring: a glide, never a cut in scale
  });

  test("the ring fits above the card: centred between the top EDGE and 8 px above the card; too tall: its top EDGE under the top", () => {
    const ring = ringBox(layout, real, phone, card.k), v = viewOf(card, phone), css = (y: number) => ((y - v.y) * card.k) / phone.dpr;
    const room = cardTop - 2 * EDGE - EDGE, fits = (ring.h * card.k) / phone.dpr <= room;
    if (fits) expect(css(ring.y + ring.h / 2)).toBeCloseTo(EDGE + room / 2, 6);
    else expect(css(ring.y)).toBeCloseTo(EDGE, 6);
    const tall = cityCamera({ focus: null, plates, beat: "card" }, { ...phone, cardTop: 300 }, layout, real);
    expect(((ring.y - viewOf(tall, phone).y) * tall.k) / phone.dpr).toBeCloseTo(EDGE, 6);
    // before the card is up, and on a desktop, nothing changes
    expect(cityCamera({ focus: null, plates, beat: "card" }, phone, layout, real)).toEqual(camera(phone, null, true));
    const desk = SCREENS["desktop 1280x720 @1"];
    expect(cityCamera({ focus: null, plates, beat: "card" }, { ...desk, cardTop: 477 }, ringOf(desk), real)).toEqual(camera(desk, null, true));
  });

  test("the camera glides from the ring up over the card's slide, not a cut", () => {
    const move = createCityMove(), pose = (c: { x: number; y: number; k: number }) => ({ x: c.x, y: c.y, s: c.k / (CITY_PX * phone.dpr) });
    const from = pose(camera(phone, null, true)), to = pose(card);
    move.step(from, from, 1 / 60, phone);
    const step = move.step(from, to, 1 / 60, phone);
    expect(step.cut).toBe(false);
    expect(Math.hypot(to.x - from.x, to.y - from.y) * to.s).toBeGreaterThan(0);
  });
});

describe("how the city camera moves (createCityMove)", () => {
  const pose = (c: { x: number; y: number; k: number }, s: CityScreen): CamPose => ({ x: c.x, y: c.y, s: c.k / (CITY_PX * s.dpr) });

  test("a new k cuts: x, y and the scale reach the target in the same frame", () => {
    for (const [, s] of PHONES) {
      const move = createCityMove(), ring = pose(camera(s), s);
      let cam = { ...ring };
      for (let i = 0; i < 30; i++) cam = move.step(cam, ring, 1 / 60, s).pose; // settled on the ring at k 1
      for (const id of CITY_ISLANDS) {
        const target = pose(camera(s, id), s), step = move.step(cam, target, 1 / 60, s);
        expect(step.cut).toBe(true);
        expect(step.pose).toEqual(target);
        cam = move.step(step.pose, ring, 1 / 60, s).pose; // and back to the ring: another new k, another cut
        expect(cam).toEqual(ring);
      }
    }
  });

  test("a hop longer than half the usable height (374 CSS px on a 390 x 844 phone) cuts; a shorter one glides 0.6 s on a smoothstep", () => {
    const s = SCREENS["phone 390x844 @2"], move = createCityMove();
    expect(cutHop(s)).toBe(374);
    const a: CamPose = { x: 1000, y: 0, s: 0.1 }, near: CamPose = { x: 1000 + 3000, y: 0, s: 0.1 }, far: CamPose = { x: 1000 + 4000, y: 0, s: 0.1 };
    move.step(a, a, 1 / 60, s);
    expect(move.step(a, far, 1 / 60, s)).toEqual({ pose: far, cut: true }); // 400 CSS px
    move.reset(); move.step(a, a, 1 / 60, s);
    let cam = a, frames = 0;
    for (let i = 0; i < 120 && (cam.x !== near.x || frames === 0); i++, frames++) {
      const step = move.step(cam, near, 1 / 60, s);
      expect(step.cut).toBe(false);
      expect(Math.round(step.pose.x * step.pose.s * s.dpr)).toBe(step.pose.x * step.pose.s * s.dpr); // whole device px
      cam = step.pose;
    }
    expect(frames).toBe(Math.round(CITY_TIMING.move * 60)); // there in exactly 0.6 s
    expect(cam).toEqual(near);
  });

  test("through the whole reveal on a phone no frame moves the picture more than 20 CSS px, except at cuts", () => {
    for (const [name, s] of PHONES) {
      const move = createCityMove(), layout = ringOf(s);
      let cam: CamPose | null = null, cuts = 0, glides = 0;
      for (let f = 0; f <= 32 * 60; f++) {
        const city = revealAt(f / 60, false, "your repo").city;
        if (city?.zoom !== "city") { cam = null; continue; }
        const target = pose(cityCamera(city, s, layout, real), s);
        if (!cam) { cam = target; move.reset(); continue; } // the zoom change into the city is the engine's own cut
        const step = move.step(cam, target, 1 / 60, s);
        const shift = Math.hypot(step.pose.x - cam.x, step.pose.y - cam.y) * step.pose.s;
        if (step.cut) cuts++;
        else { expect(shift, `${name} at ${(f / 60).toFixed(2)} s`).toBeLessThanOrEqual(20); if (shift > 0) glides++; }
        cam = step.pose;
      }
      expect(cuts).toBeGreaterThanOrEqual(2); // into k 2 at the first island and back to the ring at k 1
      expect(glides).toBeGreaterThan(0);
    }
  });

  test("a desktop's reveal: one step closer for each island's turn, the whole ring at k_ring again for \"The factory must grow.\"", () => {
    for (const name of ["desktop 1280x720 @1", "desktop 1280x720 @2 (retina)", "desktop 1440x900 @1"]) {
      const s = SCREENS[name], layout = ringOf(s), kRing = ringK(layout, real, s), move = createCityMove();
      let cam: CamPose | null = null, cuts = 0;
      for (let f = 0; f <= 32 * 60; f++) {
        const city = revealAt(f / 60, false, "your repo").city;
        if (city?.zoom !== "city") { cam = null; continue; }
        const c = cityCamera(city, s, layout, real), target = pose(c, s);
        expect(c.k, `${name} ${city.beat} ${city.focus}`).toBe(city.focus ? kRing + 1 : kRing);
        if (!cam) { cam = target; move.reset(); continue; }
        const step = move.step(cam, target, 1 / 60, s);
        if (step.cut) cuts++;
        else expect(Math.hypot(step.pose.x - cam.x, step.pose.y - cam.y) * step.pose.s, `${name} at ${(f / 60).toFixed(2)} s`).toBeLessThanOrEqual(20);
        cam = step.pose;
      }
      expect(cuts).toBeGreaterThanOrEqual(2); // in to the first island at k_ring + 1, back out to the lit ring at k_ring
    }
  });
});

// ---- room: labels, buttons, bridges ----
const ADVANCE = 0.72; // Silkscreen's advance as a share of its font size (measured: "ERRORS" at 14 px is 60 px wide)
/** deck.css: labels 16 / 12 px (padding 4 a side); plates 16 / 12 px, padding 6 / 4 and a 2 px border a side. */
const FONT = (s: CityScreen) => (s.w >= 900 && s.h >= 560 ? { label: 16, plate: 16, pad: 16 } : { label: 12, plate: 12, pad: 12 });
/** One island's label (and the COMING SOON plate under it) as a rect in city px at the ring's k. */
function labelZone(id: CityIsland | "line", s: CityScreen, k: number, layout = ringOf(s)): Rect {
  const f = FONT(s), toCity = s.dpr / k, text = id === "line" ? "your repo" : id[0].toUpperCase() + id.slice(1);
  const w = Math.max(text.length * ADVANCE * f.label + 8, id === "line" ? 0 : 11 * ADVANCE * f.plate + f.pad) * toCity;
  const [x, y] = labelAt(layout, real, id);
  return { x: x - w / 2, y, w, h: labelCss(s, id !== "line") * toCity };
}
/** The Zoom button and the mute button, top right, as a rect in city px at the ring camera. In the demos
 *  (body.machine-rehearsal) the Zoom button drops to top 62 under the mute button, so the zone runs down to 100 CSS px. */
function buttonsZone(s: CityScreen): Rect {
  const c = camera(s), css = { x: s.w - 62 - 125, y: 14, w: 125 + 62 - 14 + 14, h: 86 };
  const left = c.x / CITY_PX - (s.w * s.dpr) / c.k / 2, top = c.y / CITY_PX - (s.h * s.dpr) / c.k / 2;
  return { x: left + (css.x * s.dpr) / c.k, y: top + (css.y * s.dpr) / c.k, w: (css.w * s.dpr) / c.k, h: (css.h * s.dpr) / c.k };
}

describe("room at the ring's camera", () => {
  for (const [name, s] of Object.entries(SCREENS)) {
    const layout = ringOf(s), c = camera(s), k = c.k;
    const members = connectorBoxes(layout, real); // every connector member: spans, cables, pylons, lifts, junctions, lamps, the Hub

    test(`${name}: every label and its plate is on screen, 8 px inside the edges and above the caption band`, () => {
      const v = viewOf(c, s);
      for (const id of [...CITY_ISLANDS, "line" as const]) {
        const z = labelZone(id, s, k, layout);
        expect(z.x).toBeGreaterThanOrEqual(v.x + v.edge);
        expect(z.x + z.w).toBeLessThanOrEqual(v.x + v.w - v.edge);
        expect(z.y).toBeGreaterThanOrEqual(v.y + v.edge);
        expect(z.y + z.h).toBeLessThanOrEqual(v.band + 0.5);
      }
    });

    // The rest of the room checks run on the screens they always ran on (the layout is the connector builder's).
    if (!ROOM.includes(name)) continue;

    test(`${name}: no connector member crosses a label or its plate`, () => {
      for (const id of [...CITY_ISLANDS, "line" as const]) {
        const z = labelZone(id, s, k, layout);
        for (const m of members) expect(overlaps(m, z)).toBe(false);
      }
    });

    test(`${name}: nothing sits under the Zoom and mute buttons`, () => {
      const b = buttonsZone(s);
      for (const id of CITY_ISLANDS) expect(overlaps(islandRect(layout, real, id), b)).toBe(false);
      for (const id of CITY_ISLANDS) expect(overlaps(labelZone(id, s, k, layout), b)).toBe(false);
      expect(overlaps(LINE_BOX, b)).toBe(false);
    });

    test(`${name}: labels never run into another island's picture`, () => {
      for (const id of CITY_ISLANDS) {
        const z = labelZone(id, s, k, layout);
        for (const other of CITY_ISLANDS) if (other !== id) expect(overlaps(z, islandRect(layout, real, other))).toBe(false);
        expect(overlaps(z, LINE_BOX)).toBe(false);
      }
    });
  }

  test("the same room holds for the expected-size stand-ins, so the layout never depends on the pictures having loaded", () => {
    const stand = fallbackManifest();
    for (const s of ROOM.map((name) => SCREENS[name])) {
      const layout = ringLayout(s.portrait, stand), k = ringK(layout, stand, s), box = ringBox(layout, stand, s, k), u = usable(s);
      expect(box.w * k).toBeLessThanOrEqual(u.w);
      expect(box.h * k).toBeLessThanOrEqual(u.h);
    }
  });
});

// ---- the sky (engine/sky.ts) ----
/** The buffer the engine draws a zoom into: city px at the ring's k, art px (5 world) at the line's whole k. */
function buffers(s: CityScreen) {
  const k = ringK(ringOf(s), real, s);
  const lineK = Math.max(1, Math.floor((Math.min(s.w / 3989, (s.h * 0.9) / 830, 1.1) * 5 * s.dpr) + 1e-6)); // engine.ts fitAll + wholeScale
  return [
    { zoom: "city", bw: Math.ceil((s.w * s.dpr) / k), bh: Math.ceil((s.h * s.dpr) / k) },
    { zoom: "city, an island", bw: Math.ceil((s.w * s.dpr) / (k + 1)), bh: Math.ceil((s.h * s.dpr) / (k + 1)) },
    { zoom: "line", bw: Math.ceil((s.w * s.dpr) / lineK), bh: Math.ceil((s.h * s.dpr) / lineK) },
  ];
}
const ringRowOf = (s: CityScreen, bh: number) => ringLineRow(bh, camera(s).y / CITY_PX, LINE_BOX.y);
const layoutOf = (s: CityScreen): SkyLayout => (s.portrait ? "portrait" : "landscape");

describe("the sky: whole-number scale, hung from the line, every row covered", () => {
  const SIZES: Record<string, CityScreen> = {
    "1280x720": { w: 1280, h: 720, dpr: 1, portrait: false },
    "1440x900": { w: 1440, h: 900, dpr: 1, portrait: false },
    "390x844": { w: 390, h: 844, dpr: 2, portrait: true },
    "390x664": { w: 390, h: 664, dpr: 2, portrait: true },
    "375x667": { w: 375, h: 667, dpr: 2, portrait: true },
  };
  test("sky.webp and clouds.webp are the sizes the plan is made for", () => {
    const size = (file: string) => {
      const b = readFileSync(join(import.meta.dir, "../public/deck/art", file)), chunk = b.toString("ascii", 12, 16);
      if (chunk === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
      if (chunk === "VP8L") { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; }
      return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff]; // VP8
    };
    expect(size("sky.webp")).toEqual([SKY.w, SKY.h]);
    expect(size("clouds.webp")).toEqual([CLOUDS.w, CLOUDS.h]);
  });

  for (const [name, s] of Object.entries(SIZES)) {
    test(`${name}: the sky's draw scale is a whole number (1), at the ring, on an island and at the line`, () => {
      for (const b of buffers(s)) {
        const plan = skyPlan(b.bw, b.bh, ringRowOf(s, b.bh), layoutOf(s));
        expect(Number.isInteger(plan.n), b.zoom).toBe(true);
        expect(plan.n, b.zoom).toBe(1);
        expect(skyScale(b.bw)).toBe(plan.n);
        expect(Number.isInteger(plan.x) && Number.isInteger(plan.y)).toBe(true);
      }
    });

    test(`${name}: tiles above, the picture, the sea below: every row of every buffer is covered, pans included`, () => {
      for (const b of buffers(s)) for (const dy of [-400, -60, 0, 60, 400]) {
        const plan = skyPlan(b.bw, b.bh, ringRowOf(s, b.bh), layoutOf(s), skyLift(dy, false));
        const rows: [number, number][] = [[plan.y + SKY_BAND.from * plan.n, plan.y + SKY.h * plan.n], ...plan.above.map((a) => [a.y, a.y + a.rows * plan.n] as [number, number]), ...plan.below.map((a) => [a.y, a.y + SKY_FOOT * plan.n] as [number, number])];
        for (let y = 0; y < b.bh; y++) expect(rows.some(([a, z]) => y >= a && y < z), `${b.zoom} row ${y}`).toBe(true);
        expect(plan.x).toBeLessThanOrEqual(0);
        expect(plan.x + SKY.w * plan.n).toBeGreaterThanOrEqual(b.bw);
      }
    });
  }

  test("at the ring the line's top stands in front of the picture's skyline (its anchor row, shifted by the layout's offset)", () => {
    for (const s of Object.values(SIZES)) {
      const [b] = buffers(s), row = ringRowOf(s, b.bh), plan = skyPlan(b.bw, b.bh, row, layoutOf(s));
      expect(row - plan.y).toBe(SKY_ANCHOR - SKY_OFFSET[layoutOf(s)][1]);
      expect(row - plan.y).toBeGreaterThan(150); // below the tallest spires
      expect(row - plan.y).toBeLessThan(300); // above the cloud sea
    }
  });

  test("the sky follows a camera move at 0.08 and the strips at 0.2, in whole px; under reduced motion it stays put", () => {
    expect(skyLift(-420, false)).toEqual({ sky: -34, strips: -84 });
    expect(skyLift(37.5, false)).toEqual({ sky: 3, strips: 8 });
    expect(skyLift(-420, true)).toEqual({ sky: 0, strips: 0 });
    expect(skyLift(0, false)).toEqual({ sky: 0, strips: 0 });
  });

  test("a desktop drifts one cloud strip, low (0.86 of the height); a phone stacks them over the sea below the picture", () => {
    const desk = skyPlan(1280, 720, ringRowOf(SIZES["1280x720"], 720), "landscape");
    expect(desk.strips).toEqual([Math.round(720 * 0.86)]);
    const s = SIZES["390x844"], plan = skyPlan(780, 1688, ringRowOf(s, 1688), "portrait");
    expect(plan.strips.length).toBeGreaterThanOrEqual(2);
    expect(plan.strips[0]).toBeLessThan(plan.y + SKY.h);
    expect(plan.strips.at(-1)! + CLOUDS.h).toBeGreaterThanOrEqual(1688);
  });
});

describe("the sky picture's own floating islands stay 24 px clear of the city (craft-5)", () => {
  const gap = (a: Rect, b: Rect) => Math.hypot(Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), 0), Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h), 0));
  /** Every listed sky box, where it lands in city px at the ring framing on this screen. */
  function skyBoxes(s: CityScreen) {
    const [b] = buffers(s), c = camera(s), plan = skyPlan(b.bw, b.bh, ringRowOf(s, b.bh), layoutOf(s));
    const ox = Math.round(c.x / CITY_PX - b.bw / 2), oy = Math.round(c.y / CITY_PX - b.bh / 2);
    return (Object.entries(SKY_BOXES) as [SkyBoxId, readonly number[]][]).map(([id, [x0, y0, x1, y1]]) => ({
      id, r: { x: ox + plan.x + x0 * plan.n, y: oy + plan.y + y0 * plan.n, w: (x1 - x0) * plan.n, h: (y1 - y0) * plan.n },
      view: { x: ox, y: oy, w: b.bw, h: b.bh },
    }));
  }
  function obstacles(s: CityScreen) {
    const layout = ringOf(s), k = ringK(layout, real, s);
    return [
      ...CITY_ISLANDS.map((id) => islandRect(layout, real, id)), LINE_BOX, ...connectorBoxes(layout, real),
      ...[...CITY_ISLANDS, "line" as const].map((id) => labelZone(id, s, k, layout)),
    ];
  }
  const CHECKED: Record<string, CityScreen> = {
    "1280x720": { w: 1280, h: 720, dpr: 1, portrait: false },
    "1440x900": { w: 1440, h: 900, dpr: 1, portrait: false },
    "1920x1080": { w: 1920, h: 1080, dpr: 1, portrait: false },
    "390x844": { w: 390, h: 844, dpr: 2, portrait: true },
  };

  test("the offsets are pinned: landscape (34, -37), portrait (-89, -34); every sky island and plume is painted out, the sun never", () => {
    expect(SKY_OFFSET).toEqual({ landscape: [34, -37], portrait: [-89, -34] });
    // engine/sky.ts: what no offset could clear, what an edge would cut and what would hang near the line or a label, in both
    // layouts: so every island and plume the picture has
    const islands = (Object.keys(SKY_BOXES) as SkyBoxId[]).filter((id) => id !== "sun").sort();
    for (const layout of ["landscape", "portrait"] as const) {
      expect([...SKY_PAINTED[layout]].sort()).toEqual(islands);
      expect(SKY_PAINTED[layout]).not.toContain("sun");
    }
  });

  test("every sky island still in the picture is wholly on screen or wholly off it: 1280x720, 1440x900, 1920x1080, 390x844, 375x667", () => {
    for (const s of [...Object.values(CHECKED), { w: 375, h: 667, dpr: 2, portrait: true }] as CityScreen[]) {
      for (const { id, r, view } of skyBoxes(s)) {
        if (SKY_PAINTED[layoutOf(s)].includes(id)) continue;
        const inside = r.x >= view.x && r.x + r.w <= view.x + view.w, outside = r.x + r.w <= view.x || r.x >= view.x + view.w;
        expect(inside || outside, `${id} at ${s.w}x${s.h}`).toBe(true);
      }
    }
  });

  for (const [name, s] of Object.entries(CHECKED)) {
    test(`${name}: every sky island and the sun that is still in the picture is 24 px clear of every island, connector, label and plate`, () => {
      const obs = obstacles(s), painted = SKY_PAINTED[layoutOf(s)];
      for (const { id, r } of skyBoxes(s)) {
        if (painted.includes(id)) continue;
        for (const o of obs) expect(gap(r, o), `${id} vs ${JSON.stringify(o)}`).toBeGreaterThanOrEqual(24);
      }
    });
  }

  test("1280x720: the sun stands wholly on screen, just right of Marketing", () => {
    const s = CHECKED["1280x720"], sun = skyBoxes(s).find((b) => b.id === "sun")!;
    expect(sun.r.x).toBeGreaterThanOrEqual(sun.view.x);
    expect(sun.r.x + sun.r.w).toBeLessThanOrEqual(sun.view.x + sun.view.w);
    expect(sun.r.x).toBeGreaterThan(islandRect(ringOf(s), real, "marketing").x);
  });

  test("painting out fills a region only from outside it (the same rows mirrored, or the rows under it) and leaves the rest alone", () => {
    const w = 48, h = 16, island = (x: number, y: number) => x >= 20 && x < 30 && y >= 3 && y < 8;
    for (const from of ["sides", "left", "right", "below", 15.5] as const) {
      const d = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set([x, y, island(x, y) ? 255 : 0, 255], (y * w + x) * 4);
      const before = d.slice();
      paintOut(d, w, h, [{ box: [20, 3, 30, 8], from }]);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (!island(x, y)) { expect([...d.slice(i, i + 4)]).toEqual([...before.slice(i, i + 4)]); continue; }
        expect(d[i + 2], `${from} ${x},${y}`).toBe(0); // no island pixel left
        if (from === "below") expect([d[i], d[i + 1]]).toEqual([x, y + 5]);
        else if (from === 15.5) expect([d[i], d[i + 1]]).toEqual([31 - x, y]); // mirrored round column 15.5
        else {
          // "sides" splits this picture at its middle (every split costs the same here), with a 4 px checker across it
          const left = from === "left" || (from === "sides" && (Math.abs(x - 24.5) < 2 ? (x + y) % 2 === 0 : x < 25));
          expect([d[i], d[i + 1]]).toEqual([left ? 39 - x : 59 - x, y]);
        }
      }
    }
  });

  test("every painted box is filled, the fills keep off the sun's disc, and a fill never reads from a box painted after it", () => {
    for (const layout of ["landscape", "portrait"] as const) {
      const fills = skyFills(layout), inside = (x: number, y: number, [x0, y0, x1, y1]: readonly number[]) => x >= x0 && x < x1 && y >= y0 && y < y1;
      for (const id of SKY_PAINTED[layout]) {
        const [x0, y0, x1, y1] = SKY_BOXES[id];
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) expect(fills.some((f) => inside(x, y, f.box)), `${id} ${x},${y}`).toBe(true);
      }
      const [sx0, sy0, sx1, sy1] = SKY_BOXES.sun;
      for (const f of fills) for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) expect(inside(x, y, f.box)).toBe(false);
    }
  });
});

describe("the bands above the picture: no wallpaper, and a zenith that deepens (round 2, craft-2 and spectacle-8)", () => {
  /** A phone's buffer (390x844 at dpr 2) with the line's top at row 1057 (or `lift` rows lower): its plan, the buffer row of
   *  the picture's top, and the sky columns it shows. */
  function phoneSky(lift = 0) {
    const plan = skyPlan(780, 1688, 1057 + lift, "portrait");
    return { plan, top: plan.y + SKY_BAND.from * plan.n, cols: skyColumns(780, plan.x, plan.n) };
  }
  const chains = SKY_DEEPER as readonly (readonly string[])[];
  const hex = (id: string) => { const [ramp, i] = id.split("."); return (PALETTE as Record<string, readonly string[]>)[ramp][Number(i)]; };
  const rgb = (id: string) => [1, 3, 5].map((j) => parseInt(hex(id).slice(j, j + 2), 16));
  /** Where `steps` steps down its chain take a colour (a colour on no chain, or a chain's last, stays). */
  const deeper = (id: string, steps: number) => {
    for (let s = 0; s < steps; s++) {
      const chain = chains.find((c) => c.slice(0, -1).includes(id));
      if (chain) id = chain[chain.indexOf(id) + 1];
    }
    return id;
  };

  test("the first band is SKY_BAND upside down, unshifted, unmirrored and undarkened: the one band a desktop shows is unchanged", () => {
    for (const s of [SCREENS["desktop 1280x720 @1"], SCREENS["desktop 1440x900 @1"], SCREENS["phone 390x844 @2"]]) for (const b of buffers(s)) {
      const plan = skyPlan(b.bw, b.bh, ringRowOf(s, b.bh), layoutOf(s)), rows = SKY_BAND.to - SKY_BAND.from;
      if (!plan.above.length) continue;
      expect(plan.above[0]).toEqual({ y: plan.y + (SKY_BAND.from - rows) * plan.n, from: SKY_BAND.from, rows, flip: true, mirror: false, shift: 0, dark: 0 });
    }
  });

  test("each band is one of SKY_WINDOWS, stacked edge to edge from the picture's top up past the screen's, its columns inside the picture", () => {
    const { plan, top, cols: [c0, c1] } = phoneSky();
    let foot = top;
    for (const b of plan.above) {
      expect(SKY_WINDOWS.some(([from, to]) => from === b.from && to - from === b.rows)).toBe(true);
      expect(b.y + b.rows * plan.n).toBe(foot);
      expect(c0 + b.shift).toBeGreaterThanOrEqual(0);
      expect(c1 + b.shift).toBeLessThanOrEqual(SKY.w);
      foot = b.y;
    }
    expect(foot).toBeLessThanOrEqual(0);
  });

  test("a phone's bands draw all three windows from across the picture's whole width, in an order with no period", () => {
    const { plan, cols: [c0, c1] } = phoneSky(), rest = plan.above.slice(1), room = SKY.w - (c1 - c0);
    expect(new Set(rest.map((b) => b.from)).size).toBe(SKY_WINDOWS.length);
    const starts = rest.map((b) => c0 + b.shift);
    expect(Math.min(...starts)).toBeLessThan(room * 0.15);
    expect(Math.max(...starts)).toBeGreaterThan(room * 0.85);
    expect(new Set(rest.map((b) => `${b.from} ${b.shift}`)).size).toBe(rest.length); // no two cut from the same place
    const order = rest.map((b) => b.from);
    for (let p = 1; p <= 6; p++) expect(order.every((f, i) => i < p || f === order[i - p]), `period ${p}`).toBe(false);
  });

  test("each band is one ramp step darker for every SKY_DEEPEN px its foot hangs above the picture, up to SKY_DEEPEST at a phone's zenith", () => {
    const { plan, top } = phoneSky();
    for (const b of plan.above) expect(b.dark).toBe(Math.min(SKY_DEEPEST, Math.floor((top - b.y - b.rows * plan.n) / (SKY_DEEPEN * plan.n))));
    expect(plan.above.at(-1)!.dark).toBe(SKY_DEEPEST);
    expect(plan.below.every((b) => b.dark === 0 && b.from === SKY.h - SKY_FOOT && b.rows === SKY_FOOT)).toBe(true);
  });

  test("the bands keep their place on the picture when the sky follows the camera: only bands at the very top come and go", () => {
    const a = phoneSky(), b = phoneSky(60), n = Math.min(a.plan.above.length, b.plan.above.length);
    const onPicture = (s: ReturnType<typeof phoneSky>) => s.plan.above.slice(0, n).map((x) => ({ ...x, y: x.y - s.top }));
    expect(onPicture(b)).toEqual(onPicture(a));
  });

  test("SKY_DEEPER steps only to darker palette colours, and at the deepest step the zenith's four colours stay three, never flat", () => {
    const luma = (id: string) => [0.299, 0.587, 0.114].reduce((sum, k, i) => sum + k * rgb(id)[i], 0);
    for (const chain of chains) for (let i = 1; i < chain.length; i++) {
      expect(PALETTE_48).toContain(hex(chain[i]));
      expect(luma(chain[i]), `${chain[i - 1]} to ${chain[i]}`).toBeLessThan(luma(chain[i - 1]));
    }
    expect(new Set(["copper.1", "copper.0", "haze.0", "sun.0"].map((id) => deeper(id, SKY_DEEPEST))).size).toBeGreaterThanOrEqual(3);
  });

  test("skyDarken moves each colour that many steps down its chain and leaves the rest; above row 52 the iron fringe is haze first", () => {
    const ids = ["copper.1", "copper.0", "haze.0", "sun.0", "iron.2", "plate.0", "white.0"], w = ids.length, rows = SKY_BAND.from + 1;
    for (const steps of [0, 1, 2, SKY_DEEPEST]) {
      const d = new Uint8ClampedArray(w * rows * 4);
      for (let y = 0; y < rows; y++) ids.forEach((id, x) => d.set([...rgb(id), 255], (y * w + x) * 4));
      skyDarken(d, w, steps);
      const at = (x: number, y: number) => [...d.slice((y * w + x) * 4, (y * w + x) * 4 + 4)];
      ids.forEach((id, x) => {
        expect(at(x, rows - 1), `${id}, ${steps} steps`).toEqual([...rgb(deeper(id, steps)), 255]);
        expect(at(x, 0), `${id}, ${steps} steps, row 0`).toEqual([...rgb(deeper(id === "iron.2" ? "haze.0" : id, steps)), 255]);
      });
    }
  });
});
