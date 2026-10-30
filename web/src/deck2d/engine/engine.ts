import {
  ART_PX, BELT_Y, CITY_COPY, CITY_PX, DECK_DX, DECK_END, HULL, snap, FLOOR_Y, LAUNCH_Y, LOOK, PALETTE, PALETTE_48, STOPS, STOP_X,
  type ArtLoader, type CityView, type CityZoom, type DeckBus, type DeckLayer, type DeckView, type Item, type LayerSlot, type Shot, type ShippyModule, type Stop, type StopId,
} from "../contract";
import { cityLabel, manualCity, parseCityShot } from "../city/zoom";
import type { CityModule } from "../city";
import { EDGE, createCityMove, type CityScreen } from "../city/camera";
import { LINE_BOX } from "../city/layout";
import { pixelOn } from "../../flags";
import { createPixelCanvas } from "./pixel";
import * as pd from "./pxdraw";
import { FLIGHT } from "../launch/flight";
import { BOILER_H, BOILER_W, boilerFrame } from "../props/boiler2d";
import { stationSize, type StationId } from "../stations";
import { advanceBeltDistance, beltConnectionAt } from "./flow";
import { needsAttention, type AttentionView } from "../stations/attention";
import { anchoredCenter, CITY_CAM_RATE, frameShot, pixelZoom, settleCamera, SHOT_RATE, wholeScale } from "./camera";
import { DIM, dimPixels } from "./dim";
import { halve2x, quantPhase } from "./halve";
import { SKY, SKY_BAND, SKY_FOOT, SKY_TOP, paintOut, ringLineRow, skyColumns, skyDarken, skyFills, skyLift, skyPlan, type SkyBand, type SkyLayout } from "./sky";

// stations/ (its own thread) draws each machine in pixel code; until it lands, pixel mode shows the snapped webp.
type DrawStation = (cx: CanvasRenderingContext2D, id: StopId, state: string, t: number, x: number, feetY: number, scale?: number, attention?: boolean) => void;
const drawStation = (Object.values(import.meta.glob("../stations/index.ts", { eager: true }))[0] as { drawStation?: DrawStation } | undefined)?.drawStation;

// The deck renderer: sky, clouds, deck, bridge + rocket island, belt, stations, crates, rocket, camera.
// It draws whatever DeckView it's handed and animates the in-between (crates sliding stop to stop by item id,
// stations dropping in, the rocket going up), and emits DeckEvents for juice/ by diffing views.

const PAD = { x: 1905 + DECK_DX, y: -50, s: 0.72 }; // bridge + rocket island sprite; its bridge meets the deck's right edge
const BRIDGE_Y = PAD.y + PAD.s * 560;
const ORB = HULL.orb;
/** The twin boiler: in pixel mode it is drawn in code at full art size (props/boiler2d.ts), standing on the back
 * edge of the floor behind Repo and Planner; ?px=0 keeps the small boiler-on picture. */
const BOILER = { x: DECK_DX ? 280 : 240, base: 182 };
const BOUNDS = { x0: -20, x1: PAD.x + 1533 * PAD.s + 20, y0: -30, y1: DECK_DX ? 800 : 670 }; // pixel mode: the whole underside, lanterns and all
/** World x just past the pixel launch islet's last opaque column (launch/px.ts: island-3.png drawn at the ring's x - 53 art
 *  px, opaque to its column 95). A phone's line zoom keeps it whole. */
const ISLET_RIGHT = (Math.round(STOP_X.launch / ART_PX) - 53 + 96) * ART_PX;
const SPEED = 170, GAP = 50, CRATE = 42;
const CRATE_PACE = 1.2; // crates ride a little faster than the belt art scrolls (feel test 2026-10-30, "whole pile")
// pixel mode: the lever stands on the floor in front of Review (Shippy pulls it from review + 150, facing left)
const LEVER = DECK_DX ? { x: STOP_X.review + 92, base: 330, h: 78 } : { x: STOP_X.review + 92, base: FLOOR_Y + 48, h: 78 };

// The belt: along the deck, down onto the bridge, out to the launch circle.
const PATH: [number, number][] = [[STOP_X.repo - 260, BELT_Y], [1915 + DECK_DX, BELT_Y], [1995 + DECK_DX, BRIDGE_Y], [STOP_X.launch - 130, BRIDGE_Y], [STOP_X.launch - 34, LAUNCH_Y]];
const SEGS: { ax: number; ay: number; bx: number; by: number; len: number; at: number; a: number }[] = [];
let PATH_LEN = 0;
for (let i = 1; i < PATH.length; i++) {
  const [ax, ay] = PATH[i - 1], [bx, by] = PATH[i], len = Math.hypot(bx - ax, by - ay);
  SEGS.push({ ax, ay, bx, by, len, at: PATH_LEN, a: Math.atan2(by - ay, bx - ax) });
  PATH_LEN += len;
}
const at = (d: number): [number, number] => {
  for (const g of SEGS) if (d <= g.at + g.len) { const t = (d - g.at) / g.len; return [g.ax + (g.bx - g.ax) * t, g.ay + (g.by - g.ay) * t]; }
  const g = SEGS[SEGS.length - 1]; return [g.bx, g.by];
};
const stopD = (s: StopId) => (s === "launch" ? PATH_LEN : STOP_X[s] - PATH[0][0]);

interface Crate { id: string; d: number; previousD: number; look: string; stop: StopId; fade: number; moving: boolean; badge?: string }
interface Puff { x: number; y: number; vx: number; vy: number; t: number; life: number; r: number }

export interface Engine {
  frame(view: DeckView, dt: number): void;
  where(stop: StopId): { x: number; y: number }; // CSS pixels on screen
  focus(stop: StopId | null): void; // fly the camera there (null: back to automatic)
  seeAll(on: boolean): void;
  /** True once the camera has arrived where the current view (or its `shot`) wants it. */
  settled(): boolean;
  /** Highlight one station (four brass corners), or null for none. */
  pick(id: StopId | "engine" | null): void;
  /** A station's box on screen in CSS px (top-centre x/y, bottom y), or null when it isn't tappable right now. */
  anchor(id: StopId | "engine"): { x: number; y: number; bottom: number } | null;
  readonly portrait: boolean;
  /** Which zoom the camera is at right now (view.city?.zoom, a ?shot=city preview, or station). */
  readonly zoom: CityZoom;
}

export function createEngine(cv: HTMLCanvasElement, art: ArtLoader, bus: DeckBus, shippy: ShippyModule, layers: DeckLayer[] = [], options: { onMachineSelect?: (id: StopId) => void; onPowerSelect?: () => void; onTapEmpty?: () => void; city?: CityModule } = {}): Engine {
  const owned = new Set(layers.flatMap((l) => l.replaces ?? []));
  const slot = (s: LayerSlot) => { for (const l of layers) l.draw(cx, s); };
  const screen = cv.getContext("2d")!;
  let cx = screen; // in pixel mode, the art-resolution buffer while the world draws
  // Pixel mode (contract: the pixel canvas): draw into a buffer at art resolution, blit at a whole-number scale,
  // snap every pixel to the 48 colors (?pq=0 skips the snap, for speed checks).
  const px = pixelOn() ? createPixelCanvas(cv, ART_PX, new URLSearchParams(location.search).get("pq") === "0" ? undefined : PALETTE_48) : null;
  // The city zoom (city/SPEC.md): its own pixel canvas on the city grid (1 px = CITY_PX world = 2 art px), only with the pixel deck.
  const city = px ? options.city : undefined;
  const cityPx = city ? createPixelCanvas(cv, CITY_PX, new URLSearchParams(location.search).get("pq") === "0" ? undefined : PALETTE_48) : null;
  const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
  const rehearsingShippy = new URLSearchParams(location.search).get("source") === "shippy-demo";
  const rehearsingMachines = new URLSearchParams(location.search).get("source") === "machine-demo";
  let W = 0, H = 0, DPR = 1, t = 0;
  const resize = () => { DPR = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); };
  addEventListener("resize", resize); resize();
  document.body.dataset.deckZoom = "station"; document.body.dataset.cityBeat = "";

  const crates = new Map<string, Crate>();
  const beltPhases = new Map<StopId, number>();
  const drop: Record<StopId, number> = Object.fromEntries(STOPS.map((s) => [s, 0])) as never;
  const puffs: Puff[] = [];
  const rocket = { y: 0, v: 0, mode: "ready" as "ready" | "count" | "up" | "away" | "down", t: 0 };
  let pendingLaunches = 0;
  let rocketHeld = false; // the city reveal (view.city.beat) keeps the hero rocket away; when the story lets go it is back on its pad
  let prev: DeckView | null = null, lever = 0;

  let deckW = DECK_END, islandUp = true, islandIn = true; // how much platform is built (deck.size / deck.island)

  // ---------- camera ----------
  const cam = { x: 1400, y: 300, s: 0.3, manual: 0, all: false, pin: null as StopId | null };
  const cityMove = createCityMove(); // city zoom: a new k or a long hop cuts, a short hop glides on a fixed smoothstep
  const RING_VIEW = manualCity("city"); // the city framing the whole ring (no island in focus): the sky hangs from it
  const portrait = () => W / H <= 1.2;
  // Zoom levels: station (the usual camera, untouched), line (the whole line, whole-number scale), city (the ring of
  // islands on the city grid). view.city decides; a ?shot=city preview stands in when the source sends none.
  let zoom: CityZoom = "station", zoomSeen = false, cityView: CityView | null = null, cityLabelWas: string | null = null, cityBroken = false;
  // What the city camera keeps clear (city/camera.ts CityScreen), measured once a frame and only on a phone while the city or
  // its line zoom is up: the manual city keeps clear of the Zoom button and has no caption band; at beat "card" the ring stands
  // above the sign-in card. Station zoom reads nothing from the page.
  let screenNow: CityScreen = { w: W, h: H, dpr: DPR, portrait: portrait() };
  const screenInfo = () => screenNow;
  function measureScreen() {
    const s: CityScreen = { w: W, h: H, dpr: DPR, portrait: portrait() };
    if (city && cityView?.cine && cityView.zoom !== "station") {
      // the tour's city: the story card owns the bottom, so the city frames itself in the screen above it
      const top = cardTop();
      if (top !== null) s.band = Math.max(s.portrait ? 80 : 96, Math.ceil(H - top) + EDGE);
    } else if (s.portrait && city && cityView && cityView.zoom !== "station") {
      if (!cityView.beat) {
        const button = document.getElementById("zoom")?.getBoundingClientRect();
        if (button && button.height > 0) s.top = Math.ceil(button.bottom) + EDGE;
        s.band = 0;
      } else if (cityView.beat === "card") {
        const top = cardTop();
        if (top !== null) s.cardTop = top;
      }
    }
    screenNow = s;
  }
  /** The sign-in card's top on screen, CSS px, where it settles: its layout box, not its slide-in (or a drag), so the camera
   *  starts its one glide as the card starts to slide up. Null while there is none. */
  function cardTop(): number | null {
    const card = document.querySelector<HTMLElement>(".ic-card:not(.ic-ghost)");
    if (!card || card.hidden || !card.offsetHeight) return null;
    const host = card.offsetParent as HTMLElement | null;
    return (host ? host.getBoundingClientRect().top + host.clientTop : 0) + card.offsetTop;
  }
  /** The line's middle (world). The reveal's zoom from the line to the city is a match cut: this stays on its screen spot. */
  const LINE_MID = { x: (LINE_BOX.x + LINE_BOX.w / 2) * CITY_PX, y: (LINE_BOX.y + LINE_BOX.h / 2) * CITY_PX };
  /** At the reveal's line zoom, where the line's middle is on screen this frame (CSS px); null anywhere else, at the Zoom
   *  button's line zoom and under reduced motion (those cut straight to the ring). */
  function matchSpot() {
    if (zoom !== "line" || !px || !city || !cityView?.beat || reduced?.matches) return null;
    return toScreen(LINE_MID.x, LINE_MID.y);
  }
  /** The city camera at scale s (CSS px per world unit) that keeps the line's middle on that spot. */
  const matchCut = (spot: { x: number; y: number }, s: number) => ({ x: LINE_MID.x - (spot.x - W / 2) / s, y: LINE_MID.y - (spot.y - H / 2) / s, s });
  const zoomOf = (v: DeckView): CityZoom => {
    cityView = v.city ?? previewCity;
    const z = cityView?.zoom ?? "station";
    return z === "city" && (!city || !cityPx || cityBroken) ? "line" : z; // no pixel canvas, no city: the line is as far as it goes
  };
  // The city is scenery: if it ever throws, the deck must not stop with it. Say so once and stay on the line.
  function cityFailed(e: unknown) { cityBroken = true; cx = screen; console.error("The city failed; staying on the line.", e); }
  function setZoom(level: CityZoom) {
    zoom = level; cam.manual = 0; // a new level takes the camera back from a drag
    document.body.dataset.deckZoom = level;
    if (zoomSeen) bus.emit({ type: "city-zoom", level });
    if (level === "city") { cityLabelWas = cv.getAttribute("aria-label"); cv.setAttribute("aria-label", CITY_COPY.canvas); }
    else if (cityLabelWas !== null) { cv.setAttribute("aria-label", cityLabelWas); cityLabelWas = null; }
  }
  const grow = layers.find((l) => l.bounds);
  const builder = layers.find((l) => l.build)?.build;
  const deckEnd = () => grow?.bounds?.().x1 ?? deckW + 40;
  const right = () => islandUp ? Math.max(BOUNDS.x1, deckEnd()) : islandIn ? Math.max(BOUNDS.x1 + 170, deckEnd()) : deckEnd(); // the camera frames only what's been built (plus the crane while the island builds)
  const fitAll = () => {
    const bw = right() - BOUNDS.x0, bh = BOUNDS.y1 - BOUNDS.y0;
    return { x: (BOUNDS.x0 + right()) / 2, y: (BOUNDS.y0 + BOUNDS.y1) / 2 + 30, s: Math.min(W / bw, (H * 0.9) / bh, 1.1) };
  };
  // A tall phone would show the whole line tiny, so the camera parks on whatever matters (plan pick: left to right,
  // park on the bottleneck, one tap to see it all).
  function focusX(v: DeckView) {
    const pin = cam.pin ?? (v as AttentionView).focus ?? v.card?.stop ?? v.jam;
    if (pin) return STOP_X[pin] + (pin === "launch" ? -200 : 60);
    // All clear: nothing to look at but Shippy resting on his dock, so a phone parks there.
    const resting = (v as DeckView & { allClear?: boolean }).allClear && (shippy as ShippyModule & { readonly state?: { x: number } }).state;
    if (resting) return resting.x + 80;
    if (v.shippy.at !== "corner") return STOP_X[v.shippy.at] + 120;
    if (rocket.mode === "count" || rocket.mode === "up") return STOP_X.launch - 200;
    const fresh = STOPS.find((s) => s !== "launch" && drop[s] > 0 && drop[s] < 1);
    if (fresh) return STOP_X[fresh];
    let lead = 0; crates.forEach((c) => { lead = Math.max(lead, c.d); });
    return PATH[0][0] + lead;
  }
  // Desktop keeps the whole line in view (the 5-second bottleneck test) and only steps one whole art px closer,
  // sliding toward the crate or card. Phones still park close on the stop that matters.
  function lean(all: { x: number; y: number; s: number }, x: number) {
    if (portrait()) return null;
    const k = Math.max(1, Math.round(all.s * ART_PX * DPR)) + 1, s = px ? k / (ART_PX * DPR) : all.s * 1.4;
    const half = W / 2 / s, x0 = BOUNDS.x0 - 40 + half, x1 = right() - half;
    return { x: x1 <= x0 ? all.x : Math.max(x0, Math.min(x1, x)), y: all.y - 20, s };
  }
  // Story shots (DeckView.shot, or ?shot= for previews): the first run frames one thing at a time.
  const rawShot = new URLSearchParams(location.search).get("shot");
  const previewCity = parseCityShot(rawShot, cityLabel(location.search)); // ?shot=city and ?shot=city-<island> preview the city
  const previewShot = (previewCity ? null : rawShot) as Shot | null;
  function subject(shot: Exclude<Shot, "line">) {
    if (shot === "shippy") {
      const actor = shippy as ShippyModule & { readonly state?: { x: number } };
      return { x: actor.state?.x ?? STOP_X.repo - 150, y: FLOOR_Y + (px ? 38 : 22) - 45, width: 560 };
    }
    // framed low, so the engine sits above the card; a looser shot than a station (Justin 2026-10-30: "zooms in a little too much")
    if (shot === "boiler") return { x: BOILER.x + 120, y: BOILER.base, width: 1300, rows: 320 };
    if (shot === "launch") return { x: STOP_X.launch - 70, y: LAUNCH_Y - 150, width: 1100 };
    return { x: STOP_X[shot], y: FLOOR_Y - 90, width: 900 };
  }
  function shotTarget(shot: Shot, all: { x: number; y: number; s: number }) {
    const scr = { w: W, h: H, dpr: DPR, artPx: ART_PX, pixel: !!px };
    // the whole line rounds the zoom down, so nothing built falls off the edge
    if (shot === "line") return { x: all.x, y: all.y, s: wholeScale(all.s, scr, true) };
    return frameShot(subject(shot), scr);
  }
  function target(v: DeckView) {
    const all = fitAll();
    if (zoom === "city" && city && cityView) { const c = city.camera(cityView, screenInfo()); return { x: c.x, y: c.y, s: c.k / (CITY_PX * DPR) }; }
    if (zoom === "line") {
      // A phone's line zoom shows the line at one art px per device px: wider than the screen. The launch islet (the rocket
      // that just went up) stays whole, 8 device px inside the right edge; the Repo end clips instead.
      const line = shotTarget("line", all);
      if (!px || !portrait()) return line;
      const k = Math.max(1, Math.round(line.s * ART_PX * DPR)), bw = Math.ceil(cv.width / k);
      const ox = ISLET_RIGHT / ART_PX + Math.ceil(8 / k) - bw; // the buffer's first column, so the islet ends 8 device px in
      return { ...line, x: (ox + bw / 2) * ART_PX };
    }
    const shot = v.shot ?? previewShot;
    if (shot) return shotTarget(shot, all);
    if (cam.all) return all;
    const following = (v as DeckView & { followItem?: string }).followItem;
    const cargo = following ? crates.get(following) : undefined;
    if (cargo) return lean(all, at(cargo.d)[0]) ?? { x: at(cargo.d)[0], y: 225, s: Math.max(all.s, W / 1100) };
    if ((v.card || (v as AttentionView).focus) && !rehearsingMachines) return lean(all, focusX(v)) ?? { x: focusX(v), y: 225, s: Math.max(all.s, W / 1100) };
    if (rehearsingMachines) {
      return { x: focusX(v), y: 225, s: Math.max(all.s, W / 1000) };
    }
    if (rehearsingShippy) {
      const actor = shippy as ShippyModule & { readonly state?: { x: number } };
      return { x: (actor.state?.x ?? focusX(v)) + 80, y: 225, s: Math.max(all.s, W / 1150) };
    }
    if (px && rocket.mode !== "ready") {
      return { x: STOP_X.launch - 70, y: 100, s: Math.max(all.s, W / 1100) };
    }
    // Desktop fits everything, except it leans in on a station while it's being built (construction reads small otherwise).
    const site = !portrait() && !v.card ? v.stops.find((x) => x.id !== "launch" && (x.building !== undefined || (x.built && layers.some((l) => l.owns?.(x))))) : undefined;
    if (!portrait() && !site) {
      // Pixel mode snaps the zoom to whole art px, so on a desktop the wide layout can come out wider than the screen.
      // Then frame the deck itself (the left end, the boiler bay, every stop), and slide right to the island only while
      // it's building or a rocket is going up.
      if (!px) return all;
      const k = Math.max(1, Math.round(all.s * ART_PX * DPR)), vw = W / (k / (ART_PX * DPR));
      if (vw >= right() - BOUNDS.x0) return all;
      const toIsland = (islandIn && !islandUp) || rocket.mode !== "ready";
      return { ...all, x: toIsland ? right() - vw / 2 : BOUNDS.x0 - 40 + vw / 2 };
    }
    const s = Math.max(all.s, W / (site ? 1300 : 1050)), half = W / 2 / s;
    if (site) return { x: Math.max(BOUNDS.x0 + half, Math.min(right() - half, STOP_X[site.id])), y: 230, s };
    return { x: Math.max(BOUNDS.x0 + half, Math.min(right() - half, focusX(v))), y: 250, s };
  }
  { const f = fitAll(); Object.assign(cam, f); }
  let first = true, arrived = false, lastShot: Shot | null | undefined;
  let shotTween: { from: { x: number; y: number; s: number }; t: number; dur: number } | null = null;

  // What a tap can land on, in world units: a built station, the boiler, or the rocket once its island is up.
  type Box = { x0: number; y0: number; x1: number; y1: number };
  function boxOf(id: StopId | "engine", v: DeckView): Box | null {
    if (id === "engine") return { x0: BOILER.x - BOILER_W * ART_PX / 2, x1: BOILER.x + BOILER_W * ART_PX / 2, y0: BOILER.base - BOILER_H * ART_PX, y1: BOILER.base };
    const s = v.stops.find(x => x.id === id);
    if (!s?.built || layers.some(l => l.owns?.(s))) return null;
    if (id === "launch") return islandUp && rocket.mode === "ready" ? { x0: STOP_X.launch - 70, x1: STOP_X.launch + 70, y0: LAUNCH_Y - 210, y1: LAUNCH_Y + 30 } : null;
    const size = stationSize(id as StationId), feet = BELT_Y + LOOK[id].drop;
    return { x0: STOP_X[id] - size.w * ART_PX / 2 - 15, x1: STOP_X[id] + size.w * ART_PX / 2 + 15, y0: feet - size.h * ART_PX - 10, y1: feet + 25 };
  }
  let picked: StopId | "engine" | null = null; // the station whose "what is this" note is open
  const toScreen = (x: number, y: number) => {
    if (!px) return { x: W / 2 + (x - cam.x) * cam.s, y: H / 2 + (y - cam.y) * cam.s };
    const grid = zoom === "city" && cityPx ? cityPx : px;
    const [ox, oy] = grid.toWorld(0, 0), [ux] = grid.toWorld(1, 0); // world units per CSS px, from the blit itself
    const per = ux - ox;
    return { x: (x - ox) / per, y: (y - oy) / per };
  };
  // Four brass corners around the picked station: still, 1 art px lines with a soot edge. Calm: nothing pulses.
  function pickedDraw(v: DeckView) {
    const b = picked && boxOf(picked, v);
    if (!b || !px || cityDraw) return;
    const P = ART_PX, arm = 6 * P, x0 = snap(b.x0 + 10), x1 = snap(b.x1 - 10), y0 = snap(b.y0 + 5), y1 = snap(b.y1 - 20);
    // each corner = two arms (x, y, w, h); the soot pass draws them one art px bigger all round
    const arms = [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]].flatMap(([x, y, dx, dy]) => [
      [dx > 0 ? x : x - arm + P, y, arm, P], [x, dy > 0 ? y : y - arm + P, P, arm]]);
    for (const [c, o] of [[PALETTE.soot[0], P], [PALETTE.brass[4], 0]] as const) {
      cx.fillStyle = c;
      for (const [x, y, w, h] of arms) cx.fillRect(x - o, y - o, w + 2 * o, h + 2 * o);
    }
  }

  // drag to pan, pinch or wheel to zoom
  const ptrs = new Map<number, [number, number]>(); let pinch = 0, moved = 0;
  cv.addEventListener("pointerdown", (e) => { if (zoom === "city") return; cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; });
  cv.addEventListener("pointermove", (e) => {
    if (zoom === "city") return; // the city is a picture: no drag, no pinch
    const p = ptrs.get(e.pointerId); if (!p) return;
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    moved += Math.abs(e.clientX - p[0]) + Math.abs(e.clientY - p[1]);
    if (moved < 6) return;
    cam.manual = Infinity;
    if (ptrs.size === 1) {
      const visibleScale = px ? px.k / (ART_PX * DPR) : cam.s;
      cam.x -= (e.clientX - p[0]) / visibleScale; cam.y -= (e.clientY - p[1]) / visibleScale;
    }
    else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / pinch);
      pinch = d;
    }
  });
  const up = (e: PointerEvent) => {
    if (zoom === "city") { ptrs.delete(e.pointerId); pinch = 0; return; } // and taps never open what-is notes there
    if (e.type === "pointerup" && moved < 6 && ptrs.size === 1 && prev) {
      const [x, y] = px ? px.toWorld(e.clientX, e.clientY) : [cam.x + (e.clientX - W / 2) / cam.s, cam.y + (e.clientY - H / 2) / cam.s];
      const inside = (b: Box | null) => !!b && x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
      const hit = prev.stops.find(s => inside(boxOf(s.id, prev!)));
      if (inside(boxOf("engine", prev))) options.onPowerSelect?.();
      else if (hit) options.onMachineSelect?.(hit.id);
      else options.onTapEmpty?.();
    }
    ptrs.delete(e.pointerId); pinch = 0;
    if (moved < 6 && e.clientX < 110 && e.clientY < 110) { cam.manual = 0; cam.pin = null; } // tap Shippy: fly to what he's looking at
  };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (zoom === "city") return;
    cam.manual = Infinity;
    // Chromium exposes macOS trackpad pinches as small ctrl+wheel deltas.
    const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? H : 1);
    zoomAt(e.clientX, e.clientY, Math.exp(-delta * (e.ctrlKey ? 0.012 : 0.004)));
  }, { passive: false });
  // Safari/WKWebView use gesture events instead of ctrl+wheel for a trackpad pinch.
  let gestureScale = 1;
  cv.addEventListener("gesturestart", (e) => { e.preventDefault(); gestureScale = 1; if (zoom !== "city") cam.manual = Infinity; }, { passive: false });
  cv.addEventListener("gesturechange", (e) => {
    e.preventDefault();
    if (zoom === "city") return;
    const gesture = e as Event & { scale: number; clientX?: number; clientY?: number };
    if (!(gesture.scale > 0)) return;
    zoomAt(gesture.clientX ?? W / 2, gesture.clientY ?? H / 2, gesture.scale / gestureScale);
    gestureScale = gesture.scale;
  }, { passive: false });
  cv.addEventListener("gestureend", (e) => { e.preventDefault(); gestureScale = 1; }, { passive: false });
  cv.addEventListener("dblclick", () => { if (zoom === "city") return; cam.manual = 0; cam.pin = null; });
  function zoomAt(screenX: number, screenY: number, f: number) {
    const world = px ? px.toWorld(screenX, screenY) : [cam.x + (screenX - W / 2) / cam.s, cam.y + (screenY - H / 2) / cam.s];
    cam.s = Math.max(fitAll().s * 0.8, Math.min(1.6, cam.s * f));
    if (px) {
      const zoom = pixelZoom(cam.s * ART_PX * DPR, px.k);
      cam.x = anchoredCenter(world[0], screenX * DPR, cv.width, zoom, ART_PX);
      cam.y = anchoredCenter(world[1], screenY * DPR, cv.height, zoom, ART_PX);
    } else {
      cam.x = world[0] - (screenX - W / 2) / cam.s; cam.y = world[1] - (screenY - H / 2) / cam.s;
    }
  }

  // ---------- views -> motion + events ----------
  function take(v: DeckView, dt: number) {
    // Until the first snapshot nothing is known, so the first real view isn't news (no old rocket, no rebuild).
    const p = (prev as DeckView & { loading?: boolean } | null)?.loading ? null : prev;
    if (v.card && v.card.id !== p?.card?.id) cam.manual = 0;
    for (const s of v.stops) {
      const was = p?.stops.find((x) => x.id === s.id);
      if (s.built && !was?.built) { if (p) bus.emit({ type: "station-built", stop: s.id }); else drop[s.id] = 1; }
      if (p && was && was.state !== s.state) bus.emit({ type: "station-state", stop: s.id, state: s.state });
      if (p && s.automated && !was?.automated) bus.emit({ type: "automated", stop: s.id });
      if (s.built && drop[s.id] < 1) {
        drop[s.id] = Math.min(1, drop[s.id] + dt * 2.2);
        if (drop[s.id] === 1 && s.id !== "launch") for (let i = 0; i < 10; i++) puffs.push({ x: STOP_X[s.id] + (Math.random() - 0.5) * 130, y: FLOOR_Y - 6, vx: (Math.random() - 0.5) * 90, vy: -10 - Math.random() * 30, t: 0, life: 0.9, r: 12 + Math.random() * 10 });
      }
    }
    if (p && v.jam && v.jam !== p.jam) bus.emit({ type: "jam", stop: v.jam });
    if (p && v.shippy.pose !== p.shippy.pose) bus.emit({ type: "shippy", pose: v.shippy.pose });
    if (px && owned.has("rocket")) {
      if (p && v.shipped > p.shipped) pendingLaunches += v.shipped - p.shipped;
      if (v.city?.beat) pendingLaunches = 0; // the reveal: the hero rocket is the last one up until the story lets go
      if (islandUp && pendingLaunches > 0 && rocket.mode === "ready") { pendingLaunches--; rocket.mode = "count"; rocket.t = 0; }
    } else if (p && islandUp && v.shipped > p.shipped && (rocket.mode === "ready" || rocket.mode === "down")) { rocket.mode = "count"; rocket.t = 0; }

    // crates: every item has a spot (its stop, minus its place in the queue); crates only ever slide forward
    const blocked = blockedZones(v);
    const cargoBlocked = (distance: number) => blocked.some(zone => zone.kind === "jam" && at(distance)[0] >= zone.left && at(distance)[0] <= zone.right);
    const seen = new Set<string>();
    crates.forEach(c => { c.moving = false; });
    for (const s of v.stops) s.items.forEach((it, k) => {
      seen.add(it.id);
      let c = crates.get(it.id);
      const item = it as Item & { badge?: string; spawnAt?: StopId; fromIntake?: boolean };
      if (!c) {
        const start = item.fromIntake ? stopD("repo") - 130 : stopD(item.spawnAt ?? s.id) - k * GAP;
        c = { id: it.id, d: start, previousD: start, look: it.look, stop: s.id, fade: 1, moving: false }; crates.set(it.id, c);
      }
      if (c.stop !== s.id) { c.stop = s.id; }
      c.look = it.look;
      c.badge = item.badge;
      const want = stopD(s.id) - k * GAP;
      const before = c.d;
      c.previousD = before;
      if (c.d !== want) c.d = advanceBeltDistance(c.d, want, SPEED * CRATE_PACE * dt, cargoBlocked);
      c.moving = c.d !== before;
      if (Math.abs(before - want) > 0.000001 && Math.abs(c.d - want) <= 0.000001 && k === 0) bus.emit({ type: "crate-arrive", stop: s.id, id: it.id });
    });
    crates.forEach((c, id) => {
      if (seen.has(id)) return;
      if (c.stop === "launch" || c.d >= PATH_LEN - 60) { crates.delete(id); return; } // it went up with the rocket
      c.fade -= dt * 3; if (c.fade <= 0) crates.delete(id);
    });
    const activeBays = new Set([...crates.values()].filter(c => c.moving && !cargoBlocked(c.d)).map(c => beltConnectionAt(at((c.previousD + c.d) / 2)[0])));
    for (const bay of activeBays) beltPhases.set(bay, (beltPhases.get(bay) ?? 0) + dt);
    prev = v;
  }

  function rocketStep(dt: number, v: DeckView) {
    // The city reveal holds the hero rocket away (it never lands under the city); when the story lets go (Replay, reset) it
    // is back on its pad without a sound or a puff.
    const hold = !!v.city?.beat;
    if (rocketHeld && !hold) { rocket.mode = "ready"; rocket.t = 0; rocket.y = 0; rocket.v = 0; }
    rocketHeld = hold;
    rocket.t += dt;
    if (rocket.mode === "count" && rocket.t > 0.3) { rocket.mode = "up"; rocket.t = 0; rocket.v = 0; bus.emit({ type: "launch" }); }
    else if (px && owned.has("rocket")) {
      // Keep camera/event ownership in sync with the pixel layer's full return flight.
      if (rocket.mode === "up" && rocket.t >= FLIGHT.ignition + FLIGHT.ascent) { rocket.mode = "away"; rocket.t = 0; }
      else if (rocket.mode === "away" && rocket.t >= FLIGHT.coast && !hold) { rocket.mode = "down"; rocket.t = 0; }
      else if (rocket.mode === "down" && rocket.t >= FLIGHT.landing + FLIGHT.settle) { rocket.mode = "ready"; rocket.t = 0; }
    }
    else if (rocket.mode === "up") {
      rocket.v += 820 * dt; rocket.y -= rocket.v * dt;
      if (rocket.y > -400) for (let i = 0; i < 2; i++) puffs.push({ x: STOP_X.launch + (Math.random() - 0.5) * 60, y: LAUNCH_Y - 4, vx: (Math.random() - 0.5) * 140, vy: -10 - Math.random() * 20, t: 0, life: 1.3, r: 14 + Math.random() * 14 });
      if (rocket.y < -1500) { rocket.mode = "away"; rocket.t = 0; }
    } else if (rocket.mode === "away" && rocket.t > 0.7 && !hold) { rocket.mode = "down"; rocket.y = -600; }
    else if (rocket.mode === "down") { rocket.y += -rocket.y * Math.min(1, dt * 5); if (Math.abs(rocket.y) < 1) { rocket.y = 0; rocket.mode = "ready"; } }
  }

  // ---------- drawing ----------
  let cityDraw = false; // true while the line is drawn into the small buffer for the city zoom: no badges, plates or stacks
  const img = (n: string) => art.get(n);
  function put(name: string, x: number, base: number, h: number) {
    const im = img(name); if (!im) return 0;
    const w = im.naturalWidth * h / im.naturalHeight;
    cx.drawImage(im, x - w / 2, base - h, w, h);
    return w;
  }
  function glow(x: number, y: number, r: number, rgb: string, a: number, add = false) {
    const g = cx.createRadialGradient(x, y, 2, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
    if (add) cx.globalCompositeOperation = "lighter";
    cx.fillStyle = g; cx.fillRect(x - r, y - r, r * 2, r * 2);
    cx.globalCompositeOperation = "source-over";
  }
  // Justin (10-29): the sky, city and cloud sea were as bright as the deck, so the platform didn't pop. In pixel
  // mode the background pictures are dimmed the pixel-art way: every pixel snaps to its nearest palette color, then
  // steps darker on that color's own ramp (dim.ts: DIM shades, one more on the long sun ramp, whose steps are small),
  // so hues and detail stay and only the brightness drops. scripts/art/dim-sky.py bakes it into <name>-dim.webp so the
  // first frame doesn't spend ~1.5s on a phone doing it; without that file it's done here once and cached. ?px=0 keeps
  // the old bright pictures.
  const darker = new Map<number, number>();
  const dimmed = new Map<string, HTMLCanvasElement>();
  function dimArt(name: string): HTMLCanvasElement | HTMLImageElement | null {
    if (!px) return img(name);
    const baked = img(`${name}-dim`); if (baked) return baked;
    const im = img(name); if (!im) return null;
    let c = dimmed.get(name);
    if (!c) {
      c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight;
      const g = c.getContext("2d")!; g.drawImage(im, 0, 0);
      const data = g.getImageData(0, 0, c.width, c.height), d = data.data;
      dimPixels(d, darker);
      g.putImageData(data, 0, 0); dimmed.set(name, c);
    }
    return c;
  }
  // The sky picture has its cloud sea painted in from ~45% down (islands hang to ~57%), right where the deck hangs. In pixel mode we cut it
  // there and drop the sea below the deck (`floor` = screen y the sea must start under), with sunset haze in the gap,
  // so the deck floats in open air instead of sitting on the cloud tops.
  const SEA = 0.47, FADE = 0.05;
  let skyCut: { top: HTMLCanvasElement; sea: HTMLCanvasElement; haze: string } | null = null;
  function cutSky(sk: HTMLCanvasElement | HTMLImageElement) {
    const nw = sk.width, nh = sk.height, cut = Math.round(nh * SEA), f = Math.round(nh * FADE);
    const part = (y0: number, y1: number, fadeTop: boolean) => {
      const c = document.createElement("canvas"); c.width = nw; c.height = y1 - y0;
      const g = c.getContext("2d")!; g.drawImage(sk, 0, y0, nw, y1 - y0, 0, 0, nw, y1 - y0);
      const m = g.createLinearGradient(0, fadeTop ? 0 : c.height - f, 0, fadeTop ? f * 2 : c.height);
      m.addColorStop(0, fadeTop ? "rgba(0,0,0,0)" : "#000"); m.addColorStop(1, fadeTop ? "#000" : "rgba(0,0,0,0)");
      g.globalCompositeOperation = "destination-in"; g.fillStyle = m; g.fillRect(0, 0, nw, c.height);
      return c;
    };
    return { top: part(0, cut + f, false), sea: part(cut - f, nh, true), haze: "#e0703a" };
  }
  // the haze between deck and sea: flat palette bands (bright glow up top, deeper orange toward the clouds) with a
  // checker dither between, plus a few long thin streaks of distant cloud. Exact palette colors so the quantizer
  // leaves it alone; cached per size since it never moves.
  let haze: HTMLCanvasElement | null = null;
  function hazeBand(W: number, H: number) {
    if (haze && haze.width === W && haze.height === H) return haze;
    haze = document.createElement("canvas"); haze.width = W; haze.height = H;
    const g = haze.getContext("2d")!, band = [PALETTE.sun[3 - DIM], PALETTE.sun[2 - DIM], PALETTE.sun[1 - DIM], PALETTE.copper[2 - DIM]];
    const bh = H / band.length;
    band.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, Math.round(i * bh), W, Math.ceil(bh) + 1); });
    for (let i = 1; i < band.length; i++) {
      const y = Math.round(i * bh); g.fillStyle = band[i - 1];
      for (let x = 0; x < W; x += 2) { g.fillRect(x, y, 1, 1); g.fillRect(x + 1, y + 1, 1, 1); }
    }
    let r = 7;
    const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 6; i++) { // a wisp: lit top row, wider body, shadowed belly
      const y = Math.round(bh * 0.8 + rnd() * (H - bh * 1.8)), x = Math.round(rnd() * W), w = Math.round(W * (0.03 + rnd() * 0.05));
      g.fillStyle = PALETTE.sun[4 - DIM]; g.fillRect(x + 3, y, w - 6, 1);
      g.fillStyle = PALETTE.sun[3 - DIM]; g.fillRect(x, y + 1, w, 2);
      g.fillStyle = PALETTE.copper[3 - DIM]; g.fillRect(x + 2, y + 3, w - 4, 1);
    }
    return haze;
  }
  function sky(W: number, H: number, camS: number, floor?: number) {
    const sk = dimArt("sky"); if (!sk) return;
    const s = Math.max(W / sk.width, H / sk.height) * 1.1, w = sk.width * s, h = sk.height * s;
    const ox = Math.max(-(w - W) / 2, Math.min((w - W) / 2, -(cam.x - 1400) * 0.04 * camS));
    const x = Math.round((W - w) / 2 + ox), y = Math.round((H - h) / 2);
    const drop = floor === undefined ? 0 : Math.round(Math.max(0, floor - (y + h * SEA)));
    if (!drop) { cx.drawImage(sk, x, y, Math.round(w), Math.round(h)); return; }
    skyCut ??= cutSky(sk);
    const cut = y + h * SEA, fh = h * FADE;
    const hy = Math.floor(cut - fh), hh = Math.ceil(drop + fh * 2) + 1;
    cx.drawImage(hazeBand(W, hh), 0, hy);
    cx.drawImage(skyCut.top, x, y, Math.round(w), Math.round(h * (SEA + FADE)));
    cx.drawImage(skyCut.sea, x, Math.round(cut - fh + drop), Math.round(w), Math.round(h * (1 - SEA + FADE)));
    if (y + drop + h < H) { cx.fillStyle = PALETTE.copper[1 - DIM]; cx.fillRect(0, Math.floor(y + drop + h), W, H); }
  }
  function clouds(y: number, scale: number, speed: number, alpha: number) {
    const c = img("clouds"); if (!c) return;
    const w = c.naturalWidth * scale, h = c.naturalHeight * scale, off = ((t * speed) % (2 * w) + 2 * w) % (2 * w);
    cx.globalAlpha = alpha;
    let i = 0;
    for (let x = BOUNDS.x0 - 2 * w - off; x < BOUNDS.x1 + w * 2; x += w - 1, i++) {
      if (i % 2) { cx.save(); cx.translate(x + w, y); cx.scale(-1, 1); cx.drawImage(c, 0, 0, w, h); cx.restore(); } // mirror every other tile so seams meet
      else cx.drawImage(c, x, y, w, h);
    }
    cx.globalAlpha = 1;
  }
  // Pixel mode's cloud strips, in buffer px (screen space): sized to the frame, not the world, so a zoom doesn't
  // scale them with the deck; `par` is how much of the camera's pan they follow (far = small).
  const SEA_AT = 0.72;
  function farClouds(W: number, H: number, y: number, h: number, speed: number, par: number, alpha: number) {
    const c = dimArt("clouds"); if (!c) return;
    const w = Math.round(c.width * h / c.height); h = Math.round(h);
    const off = (((t * speed + cam.x * par) / ART_PX) % (2 * w) + 2 * w) % (2 * w);
    cx.globalAlpha = alpha;
    let i = 0;
    for (let x = -off; x < W + w; x += w - 1, i++) {
      if (i % 2) { cx.save(); cx.translate(Math.round(x) + w, y); cx.scale(-1, 1); cx.drawImage(c, 0, 0, w, h); cx.restore(); }
      else cx.drawImage(c, Math.round(x), y, w, h);
    }
    cx.globalAlpha = 1;
  }
  // A stuck stop holds its bay red; a stop whose crates wait on your call holds it yellow.
  const holdOf = (v: DeckView, s: Stop) => s.state === "jammed" || s.id === v.jam ? "jam" as const : needsAttention(v, s.id) && s.items.length ? "wait" as const : null;
  function blockedZones(v: DeckView) {
    return v.stops.filter((s) => s.built && holdOf(v, s)).map((s) => {
      const i = STOPS.indexOf(s.id), x = STOP_X[s.id];
      const left = i > 0 ? STOP_X[STOPS[i - 1]] : x;
      const right = i > 0 ? x : STOP_X[STOPS[1]];
      return { left: Math.min(left, x - s.items.length * GAP - 60), right, kind: holdOf(v, s)! };
    });
  }
  function belt(v: DeckView) {
    const segs = islandUp ? SEGS : SEGS.slice(0, 1);
    if (px) {
      const blocked = blockedZones(v);
      const blockedAt = (x: number) => blocked.find((zone) => x >= zone.left && x <= zone.right)?.kind ?? false;
      for (const g of segs) pd.beltRun(cx, g.ax, g.ay, g.bx, g.by, islandUp ? g.len : Math.min(g.len, deckEnd() - 100 - g.ax), t, SPEED, blockedAt, x => cityDraw ? quantPhase(beltPhases.get(beltConnectionAt(x)) ?? 0, SPEED) : beltPhases.get(beltConnectionAt(x)) ?? 0);
      return;
    }
    const b = img("belt"); if (!b) return;
    const bh = 34, bw = b.naturalWidth * bh / b.naturalHeight, step = bw / 5; // the strip holds 5 chevron panels
    const off = (t * SPEED * 0.35) % step;
    for (const g of segs) {
      const len = islandUp ? g.len : Math.min(g.len, deckEnd() - 100 - g.ax);
      cx.save(); cx.translate(g.ax, g.ay); cx.rotate(g.a);
      cx.beginPath(); cx.rect(0, -bh / 2, len, bh); cx.clip();
      for (let x = off - step - bw; x < g.len; x += bw - 1) cx.drawImage(b, x, -bh / 2, bw, bh);
      cx.restore();
    }
  }
  function crate(c: Crate) {
    // city zoom halves the picture: crates move in whole city px so they never shimmer, on the odd art columns the halving samples so both outlines survive
    const [ax, y] = at(c.d), x = cityDraw ? Math.round(ax / CITY_PX) * CITY_PX + ART_PX : ax;
    if (px) {
      if (c.fade > 0.5) { pd.crate(cx, x, y, c.look as Item["look"]); if (c.badge && !cityDraw) pd.crateBadge(cx, x, y, c.badge); }
      return;
    }
    if (c.look === "wait") glow(x, y - 18, 46, "255,70,50", 0.3);
    cx.globalAlpha = c.fade;
    put("crate-" + c.look, x, y + 12, CRATE);
    cx.globalAlpha = 1;
  }
  function station(v: DeckView, id: StopId) {
    const s = v.stops.find((x) => x.id === id)!;
    if (!s.built || id === "launch") return;
    if (layers.some((l) => l.owns?.(s))) return;
    const e = 1 - drop[id], fall = -420 * e * e; // drops in from the sky
    const bob = 0; // calm: working stations don't jitter; the belt and crates show the work
    const L = LOOK[id];
    cx.globalAlpha = Math.min(1, drop[id] * 3);
    if (px && drawStation) drawStation(cx, id, v.jam === id ? "jammed" : s.state, t, STOP_X[id], BELT_Y + L.drop + fall, ART_PX, needsAttention(v, id));
    else put(`${id}-${s.state}`, STOP_X[id], BELT_Y + L.drop + fall + bob, L.h);
    cx.globalAlpha = 1;
    const hold = s.state === "jammed" ? "jam" : s.waiting && needsAttention(v, id) ? "wait" : null;
    if (hold) {
      // the one marker on the deck: a steady beacon with a slow breath, not a strobe (red stuck, yellow your call)
      const x = STOP_X[id], top = BELT_Y + L.drop - L.h;
      if (px) pd.beacon(cx, x, top, t, hold);
      else { glow(x, top, 130, "255,60,40", 0.22 + 0.08 * Math.sin(t * 2.4)); put("beacon", x, top + 18, 54); }
      if (!cityDraw && s.waiting && put("plate", x - 6, BELT_Y + 106, 52)) {
        cx.fillStyle = "#2b1a0a"; cx.textAlign = "center"; cx.textBaseline = "middle"; cx.font = "15px Silkscreen, monospace";
        const [a, b] = s.waiting.split(" ");
        cx.fillText(a, x - 6, BELT_Y + 71); if (b) cx.fillText(b, x - 6, BELT_Y + 88);
      }
    }
  }
  function leverDraw(v: DeckView) {
    const rv = v.stops.find((x) => x.id === "review")!;
    if (!rv.built) return;
    const e = 1 - drop.review, fall = -420 * e * e;
    if (prev && v.shippy.at === "review" && v.shippy.pose === "lever") lever = 0.4;
    const mode = lever > 0 ? "down" : needsAttention(v, "review") ? "glow" : "up";
    if (px) pd.lever(cx, LEVER.x, LEVER.base + fall, mode);
    else put("lever-" + mode, LEVER.x, LEVER.base + fall, LEVER.h);
  }
  function rocketDraw() {
    const rk = img("rocket"), fl = img("flame");
    if (!rk || rocket.mode === "away" || !islandUp || owned.has("rocket")) return;
    const h = 220, w = rk.naturalWidth * h / rk.naturalHeight, y = LAUNCH_Y - h + 20 + rocket.y;
    if ((rocket.mode === "up" || rocket.mode === "count") && fl) {
      const fh = (rocket.mode === "count" ? 56 : 150) * (0.85 + Math.random() * 0.3), fw = fl.naturalWidth * 150 / fl.naturalHeight;
      cx.drawImage(fl, STOP_X.launch - fw / 2, y + h - 24, fw, fh);
    }
    cx.drawImage(rk, STOP_X.launch - w / 2 + (rocket.mode === "count" ? (Math.random() - 0.5) * 3 : 0), y, w, h);
  }
  function puffsDraw(dt: number) {
    for (const p of puffs) {
      p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt;
      const k = p.t / p.life, r = p.r * (1 + k * 1.5);
      cx.fillStyle = `rgba(225,210,195,${0.6 * Math.max(0, 1 - k)})`;
      cx.fillRect(Math.round(p.x - r / 2), Math.round(p.y - r / 2), Math.round(r), Math.round(r));
    }
    for (let i = puffs.length - 1; i >= 0; i--) if (puffs[i].t >= puffs[i].life) puffs.splice(i, 1);
  }

  // The world pieces, from the far sky layer to the front clouds, into whatever `cx` is now: the pixel buffer at station
  // and line zoom, the small line buffer at city zoom (`small`: no badges, plates or intake stack, crates on the city grid).
  function drawWorld(v: DeckView, dt: number, small: boolean) {
    cityDraw = small;
    slot("sky-far");
    // pixel mode: the deck floats in open air (Justin: the clouds looked attached to it), so the cloud sea sits well
    // below the rocks and the orb; the near layer only fills the bottom of the frame
    if (!px) clouds(470, 1.1, 5, 0.85);
    // The platform grows (placeholder until Justin's small/medium deck art lands: the big deck, clipped).
    const dk = v.deck ?? { size: "large", island: "built" };
    const reach = { small: 0.42, medium: 0.7, large: 1 }[dk.size];
    deckW += ((reach + (dk.growing ?? 0) * 0.28) * DECK_END - deckW) * Math.min(1, dt * 3);
    const deck = img("deck");
    if (deck && !owned.has("deck")) { cx.save(); cx.beginPath(); cx.rect(-50, -100, deckW + 50, 900); cx.clip(); cx.drawImage(deck, 0, 0); cx.restore(); }
    const island = dk.island === "built" ? 1 : dk.island === "building" ? dk.islandProgress ?? 0 : 0;
    const pad = img("pad");
    if (pad && island > 0 && !owned.has("island")) {
      cx.globalAlpha = Math.min(1, island * 2);
      cx.drawImage(pad, PAD.x, PAD.y + (1 - island) * 260, pad.naturalWidth * PAD.s, pad.naturalHeight * PAD.s); // rises up out of the clouds
      cx.globalAlpha = 1;
    }
    islandUp = island >= 1; islandIn = island > 0;
    slot("deck");
    if (owned.has("boiler")) { /* props/ draws it */ }
    else if (px) cx.drawImage(boilerFrame(t), snap(BOILER.x - (BOILER_W * ART_PX) / 2), snap(BOILER.base - BOILER_H * ART_PX), BOILER_W * ART_PX, BOILER_H * ART_PX);
    else put("boiler-on", 112, 182, 168);
    if (!owned.has("orb")) glow(ORB.x, ORB.y, 100, "120,240,255", 0.32, true); // steady; nothing ambient pulses
    belt(v);
    slot("line");
    rocketDraw();
    const live = v as DeckView & { intake?: (Item & { badge?: string })[]; work?: { id: string; stop: StopId; badge: string } };
    if (px && !cityDraw && live.intake?.length) {
      const stack = [[0,0],[-65,0],[-130,0],[-30,-45],[-95,-45],[-65,-90]];
      for (let i = 0; i < Math.min(stack.length, live.intake.length); i++) pd.crate(cx, STOP_X.repo - 135 + stack[i][0], BELT_Y + stack[i][1], 'plain');
      pd.crateBadge(cx, STOP_X.repo - 200, BELT_Y - 100, String(live.intake.length));
    }
    crates.forEach(crate);
    for (const id of STOPS) station(v, id);
    slot("stations");
    pickedDraw(v);
    if (px && !cityDraw && live.work) {
      const c = crates.get(live.work.id);
      if (c) {
        const [x, y] = at(c.d);
        pd.crateBadge(cx, x, c.moving ? y : live.work.stop === 'launch' ? y : FLOOR_Y - LOOK[live.work.stop].h - 15, c.badge ?? live.work.badge);
      }
    }
    leverDraw(v);
    // the launch button by the pad (pixel mode): Shippy presses it to send a rocket; it glows while a crate waits on the pad
    if (px && islandUp) {
      const pad = v.stops.find((x) => x.id === "launch");
      pd.launchButton(cx, STOP_X.launch + 150 - 60, FLOOR_Y + 38, v.shippy.at === "launch" && v.shippy.pose === "poke" ? "down" : pad?.items.length ? "lit" : "up");
    }
    shippy.drawWorld(cx);
    puffsDraw(dt);
    if (!px) clouds(600, 1.6, 12, 0.95); // pixel mode keeps every cloud behind the deck, so nothing ever touches it
    slot("front");
    cityDraw = false;
  }

  function frame(v: DeckView, dt: number) {
    t += dt; lever = Math.max(0, lever - dt);
    take(v, dt); rocketStep(dt, v);
    const level = zoomOf(v), changed = level !== zoom;
    measureScreen();
    const spot = changed && level === "city" ? matchSpot() : null; // read off the line zoom's own last frame
    if (changed) setZoom(level);
    zoomSeen = true; // the first frame's zoom is not news
    const beat = cityView?.beat ?? "";
    if (document.body.dataset.cityBeat !== beat) document.body.dataset.cityBeat = beat;
    const shot = v.shot ?? previewShot;
    let shotCut = false;
    if (shot !== lastShot) {
      // the reveal's hero rocket cuts in from the story's own camera; a move from one story shot to another glides
      shotCut = shot === "launch" && lastShot === null;
      if (shot && lastShot && !shotCut && zoom === "station") {
        const tg = target(v), hop = Math.hypot(tg.x - cam.x, tg.y - cam.y) * Math.min(cam.s, tg.s);
        shotTween = { from: { x: cam.x, y: cam.y, s: cam.s }, t: 0, dur: Math.min(2.4, Math.max(0.9, hop / 700)) };
      } else shotTween = null;
      lastShot = shot; cam.manual = 0; // a new story shot takes the camera back from a drag
    }
    if (performance.now() >= cam.manual) {
      // A new zoom level cuts x, y and the scale in the same frame, and so does the story's launch shot (the reveal's rocket
      // climbs inside one fixed whole-number frame). The city glides (city/camera.ts createCityMove); the line glides x and y
      // at CITY_CAM_RATE and cuts the scale (whole numbers only); reduced motion cuts every move at line and city zoom. The
      // reveal's cut from the line to the city is a match cut: its first frame keeps the line's middle where the line zoom
      // had it, and the next frames glide to the ring (0.6 s, inside beat 2's hold).
      const tg = target(v);
      // The tour's city (cine) enters at the line zoom's own scale, matched on the line, and then pulls back one whole k at
      // a time: a slow zoom out instead of a cut.
      const cine = !!cityView?.cine && !reduced?.matches;
      if (first || changed || shotCut || (zoom !== "station" && reduced?.matches)) { Object.assign(cam, spot ? matchCut(spot, cine && changed ? cam.s : tg.s) : tg); cityMove.reset(); shotTween = null; }
      else if (zoom === "city") Object.assign(cam, cityMove.step(cam, tg, dt, screenInfo(), cine).pose);
      else if (shotTween && zoom === "station") {
        // a story shot changed: one eased glide over a fixed time, so a long move (the engine to the launch island) reads
        // as a pan, not a lurch that starts at full speed
        shotTween.t = Math.min(shotTween.dur, shotTween.t + dt);
        const u = shotTween.t / shotTween.dur, e = u * u * (3 - 2 * u), f = shotTween.from;
        cam.x = f.x + (tg.x - f.x) * e; cam.y = f.y + (tg.y - f.y) * e; cam.s = f.s + (tg.s - f.s) * e;
        if (u >= 1) shotTween = null;
      }
      else {
        const rate = zoom === "line" ? CITY_CAM_RATE : shot ? SHOT_RATE : undefined;
        cam.x = settleCamera(cam.x, tg.x, dt, ART_PX / 4, rate);
        cam.y = settleCamera(cam.y, tg.y, dt, ART_PX / 4, rate);
        cam.s = zoom === "line" ? tg.s : settleCamera(cam.s, tg.s, dt, 0.0001, rate);
      }
      arrived = cam.x === tg.x && cam.y === tg.y && cam.s === tg.s;
      first = false;
    }
    if (city && !cityBroken) { try { city.update(dt, cityView ?? undefined, screenInfo()); } catch (e) { cityFailed(e); } }
    for (const l of layers) l.update(dt, v);
    const act = builder?.shippyAct?.(); // a running build calls Shippy over to weld
    shippy.update(dt, act ? { pose: act.pose, at: act.at } : v.shippy);
    if (zoom === "city" && city && cityPx && !cityBroken) {
      try { drawCity(v, dt, city, cityPx); return; } catch (e) { cityFailed(e); } // this frame falls through to the usual picture
    }
    const quake = builder?.shake?.() ?? 0;

    const qx = (Math.random() - 0.5) * quake, qy = (Math.random() - 0.5) * quake;
    if (px) {
      cx = px.begin({ x: cam.x + qx, y: cam.y + qy, s: cam.s });
      if (cv.dataset.pixelZoom !== String(px.k)) cv.dataset.pixelZoom = String(px.k);
      const bw = cx.canvas.width, bh = cx.canvas.height, world = cx.getTransform();
      cx.setTransform(1, 0, 0, 1, 0, 0);
      cx.fillStyle = "#291b17"; cx.fillRect(0, 0, bw, bh);
      if (zoom === "line") citySky(bw, bh, lineSkyY()); // the line zoom stands in the city's sky, so beats 1 and 2 share one backdrop
      else {
        // The cloud sea is far away, so it lives in screen space: it starts at a fixed height (under the deck at the
        // usual framing) and only drifts with a slow parallax, so zooming or panning moves the deck over it, never with it.
        const floor = Math.round(bh * (portrait() ? SEA_AT + 0.04 : SEA_AT));
        sky(bw, bh, 1 / ART_PX, floor);
        farClouds(bw, bh, floor - Math.round(bh * 0.05), bh * 0.2, 5, 0.12, 0.85);
        farClouds(bw, bh, Math.round(bh * 0.86), bh * 0.3, 12, 0.3, 0.95);
      }
      cx.setTransform(world);
    } else {
      cx.setTransform(DPR, 0, 0, DPR, 0, 0);
      cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = "high";
      cx.fillStyle = "#2a1410"; cx.fillRect(0, 0, W, H);
      sky(W, H, cam.s);
      cx.setTransform(DPR * cam.s, 0, 0, DPR * cam.s, DPR * (W / 2 - (cam.x + qx) * cam.s), DPR * (H / 2 - (cam.y + qy) * cam.s));
    }
    drawWorld(v, dt, false);
    if (px) { px.end(); cx = screen; cx.imageSmoothingEnabled = false; }
    cx.setTransform(DPR, 0, 0, DPR, 0, 0);
    shippy.drawCorner(cx, 14, 14, 76);
    city?.place(undefined, toScreen); // the labels belong to the city only
  }


  // ---------- the city frame ----------
  // The line is drawn exactly as at station zoom, but into its own buffer at ART_PX (world x -40..4000, y -400..840: 808 x 248
  // art px, both origins even), then halved 2:1 into the city buffer, so the whole city frame is one pixel grid.
  const LINE_BUF = { x: -40, y: -400, w: 4040, h: 1240 };
  let lineBuf: { cv: HTMLCanvasElement; g: CanvasRenderingContext2D; half: ImageData; hcv: HTMLCanvasElement; hg: CanvasRenderingContext2D } | null = null;
  function lineBuffer() {
    if (lineBuf) return lineBuf;
    const w = LINE_BUF.w / ART_PX, h = LINE_BUF.h / ART_PX, cv2 = document.createElement("canvas"), hcv = document.createElement("canvas");
    cv2.width = w; cv2.height = h; hcv.width = w / 2; hcv.height = h / 2;
    const g = cv2.getContext("2d", { willReadFrequently: true })!, hg = hcv.getContext("2d")!;
    g.imageSmoothingEnabled = false; hg.imageSmoothingEnabled = false;
    return (lineBuf = { cv: cv2, g, half: new ImageData(w / 2, h / 2), hcv, hg });
  }
  // ---------- the city's sky (engine/sky.ts) ----------
  // The sky picture, dimmed like the deck's, at a whole-number scale with its skyline behind the line wherever the camera
  // framed the ring; on a tall screen bands of its upper sky stack upward, deepening toward the zenith, its cloud sea runs
  // on downward, and the cloud strips drift over the bottom. Each layout has its own copy, with the picture's floating
  // islands painted out. Screen space: the sky follows a city camera move at 0.08 and the strips at 0.2, in whole px.
  const skies = new Map<SkyLayout, HTMLCanvasElement | HTMLImageElement>();
  function skyArt(layout: SkyLayout) {
    const base = dimArt("sky"); if (!base) return null;
    let c = skies.get(layout);
    if (!c) {
      const fills = skyFills(layout);
      if (!fills.length) c = base;
      else {
        const copy = document.createElement("canvas"); copy.width = base.width; copy.height = base.height;
        const g = copy.getContext("2d", { willReadFrequently: true })!; g.drawImage(base, 0, 0);
        const data = g.getImageData(0, 0, copy.width, copy.height);
        paintOut(data.data, copy.width, copy.height, fills);
        g.putImageData(data, 0, 0); c = copy;
      }
      skies.set(layout, c);
    }
    return c;
  }
  /** A layout's sky, its top SKY_TOP rows only, `dark` ramp steps darker (sky.ts skyDarken): what the bands above the
   *  picture are cut from. Made once per layout and step. */
  const skyTops = new Map<string, HTMLCanvasElement>();
  function skyTop(layout: SkyLayout, sk: HTMLCanvasElement | HTMLImageElement, dark: number) {
    const key = `${layout} ${dark}`;
    let c = skyTops.get(key);
    if (!c) {
      c = document.createElement("canvas"); c.width = SKY.w; c.height = SKY_TOP;
      const g = c.getContext("2d", { willReadFrequently: true })!; g.drawImage(sk, 0, 0);
      const data = g.getImageData(0, 0, c.width, c.height);
      skyDarken(data.data, c.width, dark);
      g.putImageData(data, 0, 0); skyTops.set(key, c);
    }
    return c;
  }
  /** The ring's centre (city px) and the buffer row the line's top would sit on at the ring, for a buffer `bh` rows tall.
   *  Null without a city (the sky then hangs at a fixed height). */
  function ringRow(bh: number) {
    if (!city || cityBroken) return null;
    try {
      // the line zoom hangs it from the ring as the reveal frames it: a phone's manual city sits lower (under the Zoom button,
      // no caption band), and its line would float above the skyline at the line zoom
      const y = city.camera(RING_VIEW, zoom === "line" ? { w: W, h: H, dpr: DPR, portrait: portrait() } : screenInfo()).y / CITY_PX;
      return { y, row: ringLineRow(bh, y, BOUNDS.y0 / CITY_PX) };
    } catch (e) { cityBroken = true; console.error("The city failed; staying on the line.", e); return null; }
  }
  /** Rows `sy` .. `sy + rows` of the sky, the columns a buffer W wide shows with the picture at x, taken `b.shift` columns
   *  further along, at row b.y, whole scale n, upside down when `b.flip` and left for right when `b.mirror`. */
  function skyBand(sk: CanvasImageSource, W: number, sy: number, rows: number, x: number, n: number, b: SkyBand) {
    const [c0, c1] = skyColumns(W, x, n), left = x + c0 * n, right = x + c1 * n;
    cx.save();
    cx.translate(b.mirror ? left + right : 0, b.flip ? b.y + rows * n : b.y);
    cx.scale(b.mirror ? -1 : 1, b.flip ? -1 : 1);
    cx.drawImage(sk, c0 + b.shift, sy, c1 - c0, rows, left, 0, right - left, rows * n);
    cx.restore();
  }
  /** One cloud strip at whole scale n and full alpha, mirrored every other tile, drifting `speed` world units a second. */
  function cloudStrip(W: number, y: number, n: number, speed: number) {
    const c = dimArt("clouds"); if (!c) return;
    const w = c.width * n, h = c.height * n, off = Math.floor((t * speed) / ART_PX) % (2 * w);
    for (let x = -off, i = 0; x < W; x += w, i++) {
      if (i % 2) { cx.save(); cx.translate(x + w, y); cx.scale(-1, 1); cx.drawImage(c, 0, 0, w, h); cx.restore(); }
      else cx.drawImage(c, x, y, w, h);
    }
  }
  /** The reveal's line zoom hangs the sky where the match cut's first city frame will (that frame's camera y), so the cut does
   *  not move the skyline or the strips; null anywhere else: the sky hangs where the ring hangs it. */
  function lineSkyY(): number | null {
    const spot = matchSpot();
    if (!spot) return null;
    try { return matchCut(spot, city!.camera(RING_VIEW, screenInfo()).k / (CITY_PX * DPR)).y; }
    catch (e) { cityBroken = true; console.error("The city failed; staying on the line.", e); return null; } // mid-frame: as ringRow
  }
  /** The sky into the buffer W x H (screen space, identity transform). `camY`: the city camera's world y, which the sky
   *  follows at SKY_PARALLAX from the ring's framing; at line zoom lineSkyY (null: the sky stays where the ring hangs it). */
  function citySky(W: number, H: number, camY: number | null) {
    const layout: SkyLayout = portrait() ? "portrait" : "landscape", ring = ringRow(H), still = !!reduced?.matches;
    const dy = ring && camY !== null ? camY / CITY_PX - ring.y : 0;
    const plan = skyPlan(W, H, ring?.row ?? Math.round(H * 0.45), layout, skyLift(dy, still));
    const sk = skyArt(layout);
    if (sk) {
      const { n } = plan, from = SKY_BAND.from;
      for (const b of plan.above) skyBand(skyTop(layout, sk, b.dark), W, b.from, b.rows, plan.x, n, b);
      cx.drawImage(sk, 0, from, SKY.w, SKY.h - from, plan.x, plan.y + from * n, SKY.w * n, (SKY.h - from) * n);
      for (const b of plan.below) skyBand(sk, W, SKY.h - SKY_FOOT, SKY_FOOT, plan.x, n, b);
    }
    plan.strips.forEach((y, i) => cloudStrip(W, y, plan.n, still ? 0 : 2 + 2 * i));
  }
  function drawCity(v: DeckView, dt: number, module: CityModule, buf: ReturnType<typeof createPixelCanvas>) {
    cx = buf.begin({ x: cam.x, y: cam.y, s: cam.s });
    if (cv.dataset.pixelZoom !== String(buf.k)) cv.dataset.pixelZoom = String(buf.k);
    const dest = cx, bw = dest.canvas.width, bh = dest.canvas.height, world = dest.getTransform();
    dest.setTransform(1, 0, 0, 1, 0, 0);
    dest.fillStyle = "#291b17"; dest.fillRect(0, 0, bw, bh);
    citySky(bw, bh, cam.y);
    dest.setTransform(world);
    module.drawBack(dest);
    const L = lineBuffer();
    L.g.setTransform(1, 0, 0, 1, 0, 0); L.g.clearRect(0, 0, L.cv.width, L.cv.height);
    L.g.setTransform(1 / ART_PX, 0, 0, 1 / ART_PX, -LINE_BUF.x / ART_PX, -LINE_BUF.y / ART_PX);
    cx = L.g;
    drawWorld(v, dt, true);
    L.g.setTransform(1, 0, 0, 1, 0, 0);
    halve2x(L.g.getImageData(0, 0, L.cv.width, L.cv.height).data, L.cv.width, L.cv.height, L.half.data);
    L.hg.putImageData(L.half, 0, 0);
    cx = dest;
    dest.drawImage(L.hcv, LINE_BUF.x, LINE_BUF.y, LINE_BUF.w, LINE_BUF.h); // 404 x 124 px at one buffer px each
    module.drawFront(dest);
    buf.end(); cx = screen; cx.imageSmoothingEnabled = false;
    cx.setTransform(DPR, 0, 0, DPR, 0, 0);
    module.place(cityView ?? undefined, toScreen);
  }

  return {
    frame,
    where(stop) { return { x: W / 2 + (STOP_X[stop] - cam.x) * cam.s, y: H / 2 + ((stop === "launch" ? LAUNCH_Y : FLOOR_Y - 80) - cam.y) * cam.s }; },
    focus(stop) { cam.pin = stop; cam.manual = 0; },
    seeAll(on) { cam.all = on; cam.manual = 0; },
    settled() { return arrived; },
    pick(id) { picked = id; },
    anchor(id) {
      if (zoom === "city") return null; // no what-is notes over the city
      const b = prev && boxOf(id, prev);
      if (!b) return null;
      const top = toScreen((b.x0 + b.x1) / 2, b.y0), bottom = toScreen(b.x0, b.y1);
      return { x: top.x, y: top.y, bottom: bottom.y };
    },
    get portrait() { return portrait(); },
    get zoom() { return zoom; },
  };
}
