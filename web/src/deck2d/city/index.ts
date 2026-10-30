// The city: the third zoom level of the deck (SPEC.md). Zoom out once and the whole line shows; zoom out again and the
// line is one lit island among six, floating over the sunset clouds and joined by truss sky bridges. The five other
// islands are scenery for where this goes: nothing here reads an account, an issue or any service, and nothing on
// screen says or implies they work. GitHub is the only real source.
//
// Not a DeckLayer. The engine owns the frame (sky, clouds, the line drawn one step smaller); this module owns the rest of
// the city: the connectors (connector.ts), islands, lights, halos, the rocket arc, the labels. It draws a pure function of
// `view.city` (the story, or the Zoom button, owns time) plus a few small clocks of its own: belt phase, the rocket's dust
// puff, the 0.12 s checker when an island steps back to dark, and the previous view for the sound events. Reduced
// motion: no runway, no dither, no belts, no flight, no puff; an island's lights and halo come on with it, all at once.
import { CITY_COPY, CITY_ISLANDS, CITY_PX, type ArtLoader, type CityIsland, type CityView, type CityZoom, type DeckBus } from "../contract";
import { BAND, cityCamera, usable, type CityScreen } from "./camera";
import { DIM_DITHER, drawArc, drawBeacon, drawDrop, drawFlight, drawLight, drawPuff, drawRocket, lanternHalo, lightHalo, makeDither, puffFrame, warmBackdrop, type IslandLight, type LightKind } from "./draw";
import { createLabels, type LabelId, type LabelPlaces } from "./labels";
import { ARC_DOTS, BRIDGE_IDS, ROCKET_SPOT, arcEnd, arcPoints, at, connectorPlans, hubPlan, islandRect, labelAt, ringLayout, type BridgeId, type RingLayout } from "./layout";
import { createConnectorPicture, createHubPicture, lampBox, type ConnectorPicture, type ConnectorPlan, type HubPicture } from "./connector";
import { fallbackManifest, loadManifest, spriteName, type CityManifest, type IslandArt, type XY } from "./manifest";
import { cityEvents, growGlowOn, islandState, lightOrder, type IslandState } from "./timeline";
import { beltStep } from "../engine/halve";

export type { CityScreen } from "./camera";

export interface CityModule {
  /** Once per frame, before drawing. `city` is the view's city (undefined = nothing city-ish to show). Advances the
   *  small clocks and emits city-lamp / city-lit / city-all-lit / city-dim on the bus (cityEvents). */
  update(dt: number, city: CityView | undefined, screen: CityScreen): void;
  /** Camera target at city zoom: world centre and whole k (device px per city px). */
  camera(city: CityView, screen: CityScreen): { x: number; y: number; k: number };
  /** Into the city buffer, world transform set (1 buffer px = CITY_PX world), after the sky and before the line: the grow
   *  glow (the sky round the line warmed up its ramps), the connectors and the Hub, the islands, their lights, every halo. */
  drawBack(ctx: CanvasRenderingContext2D): void;
  /** After the line: the arc dots and arrowhead, Customers' rocket (in flight, then on its pad with its puff), Marketing's
   *  beacon. */
  drawFront(ctx: CanvasRenderingContext2D): void;
  /** After the blit: place (or hide) the DOM labels and plates. toScreen maps world -> CSS px for this frame. */
  place(city: CityView | undefined, toScreen: (x: number, y: number) => { x: number; y: number }): void;
  destroy(): void;
}

// ---------- the Zoom button (pure) ----------
/** The manual Zoom button's view.city: line = all dark, no plates; city = the end of beat 5 (all dark, COMING SOON plates on). */
export function manualCity(zoom: Exclude<CityZoom, "station">, label: string = CITY_COPY.repo): CityView {
  const per = <T,>(v: T) => Object.fromEntries(CITY_ISLANDS.map((i) => [i, v])) as Record<CityIsland, T>;
  return { zoom, lit: per(0), plates: per(zoom === "city"), focus: null, label };
}
/** station -> line -> city -> station. Without the pixel canvas (?px=0) there is no city, so it is just station <-> line. */
export const nextZoom = (z: CityZoom, hasCity = true): CityZoom => (z === "station" ? "line" : z === "line" && hasCity ? "city" : "station");
/** Zoom out at station and line, Zoom in once you are at the city (one press back to the station). */
export const zoomLabel = (z: CityZoom) => (z === "city" ? "Zoom in" : "Zoom out");
/** The line's label: owner/name from ?repo= when it is a real repo, else "your repo". */
export function cityLabel(search: string): string {
  const repo = new URLSearchParams(search).get("repo") ?? "";
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) && !repo.split("/").some((part) => part === "." || part === "..") ? repo : CITY_COPY.repo;
}
/** ?shot=city and ?shot=city-<island> previews: a manual city, framed on the island (a phone pans to it). */
export function parseCityShot(shot: string | null, label: string = CITY_COPY.repo): CityView | null {
  if (shot === "city") return manualCity("city", label);
  const island = /^city-(errors|traffic|inbox|customers|marketing)$/.exec(shot ?? "")?.[1] as CityIsland | undefined;
  return island ? { ...manualCity("city", label), focus: island } : null;
}

// ---------- the module ----------
interface Bundle {
  layout: RingLayout;
  plans: Record<BridgeId, ConnectorPlan>;
  pictures: Record<BridgeId, ConnectorPicture>;
  hub: HubPicture;
  /** The connectors whose lit end is the Hub: it lights with the first of them. */
  hubFeeds: BridgeId[];
  arc: XY[]; tip: XY; pad: XY; beacon: XY | null;
  lamp: Partial<Record<CityIsland, XY>>;
  lights: Record<CityIsland, IslandLight[]>;
}
const DARK: IslandState = islandState(0, 0, "errors");
const KINDS: readonly LightKind[] = ["signal", "pad", "thruster", "window", "crack"];
/** An island's own lights from its manifest (older manifests have none), in the order they come on (lightOrder), offset to
 *  where the island sits. */
function lightsOf(art: IslandArt, layout: RingLayout, id: CityIsland): IslandLight[] {
  const raw = (art as { lights?: unknown }).lights;
  if (!Array.isArray(raw)) return [];
  const own = raw.flatMap((l: { at?: unknown; kind?: unknown }) => {
    const p = l?.at;
    if (!Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite) || !KINDS.includes(l.kind as LightKind)) return [];
    return [{ at: p as XY, kind: l.kind as LightKind }];
  });
  return lightOrder(id, own).map((l) => ({ ...l, at: at(layout, id, l.at) }));
}
/** On a phone, the arc's dots wholly above the caption band, unless the camera is on Customers (it frames the arc). The
 *  others would peek out round the caption while the camera is on another island. `ctx` is the city buffer with the city-px
 *  transform set (its rows times k are device rows). */
export function arcDotsShown(ctx: Pick<CanvasRenderingContext2D, "getTransform" | "canvas">, dots: XY[], screen: CityScreen, focus: CityIsland | null): (j: number) => boolean {
  if (!screen.portrait || focus === "customers") return () => true;
  const m = ctx.getTransform(), k = Math.max(1, Math.round((screen.h * screen.dpr) / ctx.canvas.height)), limit = screen.h - BAND.portrait;
  return (j) => ((m.d * (dots[j][1] + 3) + m.f) * k) / screen.dpr <= limit; // the dot's bottom edge, CSS px
}

export function createCity(art: ArtLoader, bus: DeckBus, host: HTMLElement): CityModule {
  const mq = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
  const reduced = () => !!mq?.matches;
  const labels = createLabels(host);
  let manifest: CityManifest = fallbackManifest();
  // one bundle per layout: a desktop's, and a phone's per usable height (its ring spreads to use it)
  const bundles = new Map<string, Bundle>();
  const dithers: Partial<Record<CityIsland, HTMLCanvasElement>> = {};

  const sprite = (id: CityIsland, kind: "lit" | "dark") => art.get(spriteName(manifest.islands[id][kind]));
  let settled = false; // the manifest has come (or failed): the layout is final
  void loadManifest().then((m) => {
    settled = true;
    if (!m) return; // keep the expected sizes; no pictures, so no further requests
    manifest = m; bundles.clear();
    for (const id of CITY_ISLANDS) { sprite(id, "lit"); sprite(id, "dark"); } // start the ten webps now, long before the reveal needs them
  });
  // The cached pictures (each island's dither, each connector's dark picture) are made one a frame while the line zoom is up,
  // so the zoom into the city does not drop a frame building them. Nothing happens for a player who never zooms out.
  let canvasOk: boolean | undefined;
  const hasCanvas = () => (canvasOk ??= !!host.ownerDocument.createElement("canvas").getContext?.("2d"));
  function warmOne(b: Bundle) {
    if (!settled || !hasCanvas()) return;
    for (const id of CITY_ISLANDS) {
      if (dithers[id]) continue;
      const lit = sprite(id, "lit"), dark = sprite(id, "dark");
      if (lit && dark) { dithers[id] = makeDither(lit, dark); return; }
    }
    for (const id of BRIDGE_IDS) if (b.pictures[id].warm()) return;
    b.hub.warm();
  }

  /** A phone's usable height at the ring's k 1, city px, rounded down to a step of 8 (never more than the screen has), so a
   *  browser bar sliding in or out a few px rebuilds nothing. */
  const fitOf = (screen: CityScreen) => (screen.portrait ? Math.floor(usable(screen).h / 8) * 8 : 0);
  function bundle(screen: Pick<CityScreen, "portrait"> & { fit: number }): Bundle {
    const { portrait, fit } = screen, key = `${portrait}:${fit}`;
    let b = bundles.get(key);
    if (!b) {
      const layout = portrait ? ringLayout(true, manifest, fit) : ringLayout(false, manifest), plans = connectorPlans(layout, manifest);
      const c = manifest.islands.customers, pad = at(layout, "customers", c.pad ?? [Math.round(c.w * 0.84), Math.round(c.h * 0.46)]);
      const lamp: Partial<Record<CityIsland, XY>> = {};
      for (const id of CITY_ISLANDS) { const l = manifest.islands[id].lamp; if (l) lamp[id] = at(layout, id, l); }
      const beacon = manifest.islands.marketing.beacon;
      b = {
        layout, plans, pad, lamp,
        arc: arcPoints(ROCKET_SPOT, pad, portrait, ARC_DOTS), tip: arcEnd(pad),
        beacon: beacon ? at(layout, "marketing", beacon) : null,
        pictures: Object.fromEntries(BRIDGE_IDS.map((id) => [id, createConnectorPicture(plans[id])])) as Record<BridgeId, ConnectorPicture>,
        hub: createHubPicture(hubPlan(layout)),
        hubFeeds: portrait ? ["errors"] : ["errors", "traffic"],
        lights: Object.fromEntries(CITY_ISLANDS.map((id) => [id, lightsOf(manifest.islands[id], layout, id)])) as Record<CityIsland, IslandLight[]>,
      };
      // a window dragged taller or shorter makes a layout per 8 px: keep the last few, not every one
      if (bundles.size >= 3) bundles.delete(bundles.keys().next().value!);
      bundles.set(key, b);
    }
    return b;
  }
  const lampsOf = (b: Bundle) => (id: CityIsland) => (id === "marketing" ? 0 : b.plans[id].lamps.length);

  // ---- clocks and state ----
  let prev: CityView | undefined, active = false, grow = false, view = { portrait: false, fit: 0 }, screenNow: CityScreen = { w: 0, h: 0, dpr: 1, portrait: false };
  let states: Record<CityIsland, IslandState> = Object.fromEntries(CITY_ISLANDS.map((i) => [i, DARK])) as Record<CityIsland, IslandState>;
  const phase: Record<BridgeId, number> = { errors: 0, traffic: 0, inbox: 0, customers: 0 };
  const dimming: Record<CityIsland, number> = { errors: 0, traffic: 0, inbox: 0, customers: 0, marketing: 0 };
  let puffT = -1, rocketOn = false;

  return {
    camera(city, screen) {
      const b = bundle({ portrait: screen.portrait, fit: fitOf(screen) });
      return cityCamera(city, screen, b.layout, manifest);
    },
    update(dt, city, screen) {
      view = { portrait: screen.portrait, fit: fitOf(screen) }; screenNow = screen;
      const b = bundle(view), of = lampsOf(b), still = reduced();
      for (const e of cityEvents(prev, city, of)) bus.emit(e);
      prev = city;
      if (city) warmOne(b);
      active = !!city && city.zoom === "city";
      grow = growGlowOn(city);
      const next = Object.fromEntries(CITY_ISLANDS.map((i) => [i, city ? islandState(city.lit[i], of(i), i, b.lights[i].length) : DARK])) as Record<CityIsland, IslandState>;
      for (const id of CITY_ISLANDS) {
        // an island stepping back to dark (beat 5) shows the checker for a moment first, on our own clock
        if (states[id].stage === "lit" && next[id].stage === "dark" && active && !still) dimming[id] = DIM_DITHER;
        else if (next[id].stage !== "dark") dimming[id] = 0;
        else dimming[id] = Math.max(0, dimming[id] - dt);
      }
      states = next;
      if (!active) return;
      for (const id of BRIDGE_IDS) {
        if (!states[id].beltRuns) phase[id] = 0; // dark, or the runway is still lighting: the belt rests
        else if (!still) phase[id] += dt; // the belt starts once its last lamp is on, and never under reduced motion
      }
      const seated = states.customers.capsule;
      if (seated && !rocketOn) puffT = still ? Infinity : 0; // one dust puff as it sits down
      else if (!seated) puffT = -1;
      else if (Number.isFinite(puffT) && puffT >= 0) puffT += dt;
      rocketOn = seated;
    },
    drawBack(ctx) {
      if (!active) return;
      const b = bundle(view);
      ctx.save();
      ctx.scale(CITY_PX, CITY_PX); // from here on 1 unit = 1 city px = 1 buffer px
      if (grow) warmBackdrop(ctx); // the sky round the line, before any connector or line pixel: a step on and off
      const frame = (id: BridgeId) => ({ lampsLit: states[id].lampsLit, step: beltStep(phase[id]) });
      for (const id of BRIDGE_IDS) b.pictures[id].drawBack(ctx, frame(id));
      // the Hub's port belts run with the first feed whose belt is running (phase 0, at rest, until then or under reduced motion)
      const feed = b.hubFeeds.find((id) => states[id].beltRuns);
      b.hub.draw(ctx, b.hubFeeds.some((id) => states[id].lampsLit > 0), feed ? beltStep(phase[feed]) : 0);
      for (const id of CITY_ISLANDS) {
        const stage = states[id].stage, [x, y] = b.layout.pos[id];
        let img: CanvasImageSource | null = null;
        if (stage === "lit") img = sprite(id, "lit");
        else if (stage === "dark" && !dimming[id]) img = sprite(id, "dark");
        else {
          const lit = sprite(id, "lit"), dark = sprite(id, "dark");
          img = lit && dark ? (dithers[id] ??= makeDither(lit, dark)) : dark;
        }
        if (img) ctx.drawImage(img, x, y);
      }
      for (const id of BRIDGE_IDS) b.pictures[id].drawFront(ctx, frame(id));
      // lit islands: their own lights (coming on in order, then steady, never blinking), then every glow on top: the lights'
      // own, and the island lamp's as it blooms
      const lightsOn = (id: CityIsland) => b.lights[id].slice(0, states[id].lightsOn);
      for (const id of CITY_ISLANDS) for (const l of lightsOn(id)) drawLight(ctx, l);
      for (const id of CITY_ISLANDS) {
        for (const l of lightsOn(id)) lightHalo(ctx, l);
        const lamp = b.lamp[id], bloom = states[id].bloom;
        if (lamp && bloom) lanternHalo(ctx, lamp, undefined, bloom);
      }
      for (const id of BRIDGE_IDS) {
        const lamps = b.plans[id].lamps;
        for (let k = 0; k < Math.min(states[id].lampsLit, lamps.length); k++) lanternHalo(ctx, [lamps[k].x, lamps[k].y], lampBox(lamps[k]));
      }
      ctx.restore();
    },
    drawFront(ctx) {
      if (!active) return;
      const b = bundle(view), c = states.customers;
      ctx.save();
      ctx.scale(CITY_PX, CITY_PX);
      drawArc(ctx, b.arc, c.arcDots, b.tip, c.arrow, arcDotsShown(ctx, b.arc, screenNow, prev?.focus ?? null));
      if (!reduced()) {
        if (c.flight >= 0) drawFlight(ctx, b.arc, c.flight); // from the line's rocket along the lit dots
        else if (c.drop >= 0) drawDrop(ctx, b.arc, b.pad, c.drop); // then straight down onto the pad
      }
      if (c.capsule) { drawRocket(ctx, b.pad); const f = puffFrame(puffT); if (f >= 0) drawPuff(ctx, b.pad, f); }
      if (states.marketing.beacon && b.beacon) drawBeacon(ctx, b.beacon);
      ctx.restore();
    },
    place(city, toScreen) {
      if (!active || !city) { labels.place(undefined, null, { errors: false, traffic: false, inbox: false, customers: false, marketing: false }); return; }
      const b = bundle(view), places = {} as LabelPlaces;
      for (const id of [...CITY_ISLANDS, "line"] as LabelId[]) {
        const [x, y] = labelAt(b.layout, manifest, id);
        places[id] = toScreen(x * CITY_PX, y * CITY_PX);
        if (id === "line") continue;
        // the island's sprite box on screen: where a label the sign-in card covers can step to (labels.ts)
        const r = islandRect(b.layout, manifest, id), a = toScreen(r.x * CITY_PX, r.y * CITY_PX), z = toScreen((r.x + r.w) * CITY_PX, (r.y + r.h) * CITY_PX);
        places[id] = { ...places[id], sprite: { left: a.x, top: a.y, right: z.x, bottom: z.y } };
      }
      labels.place(city, places, Object.fromEntries(CITY_ISLANDS.map((i) => [i, states[i].halo])) as Record<CityIsland, boolean>);
    },
    destroy() { labels.destroy(); },
  };
}
