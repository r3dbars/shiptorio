// The 2D deck contract: the one file every facelift thread builds against.
// Plan: https://claude.ai/artifact/APbJAp64ymtzegrTv2wUfQ · hub thread "Plan the 2D pixel-art facelift".
//
// One floating iron deck, one line left to right. Crates are changes, rockets are releases, Shippy is the only
// character (no human). The pieces, each owned by one thread, each in its own folder under web/src/deck2d/:
//
//   engine/   (hub)    canvas renderer: sky, deck, belt, stations, crates, rocket, camera. Owns the canvas.
//   data/     (data)   deckView(state) -> DeckView from real factory state, plus approve/later actions.
//   story/    (story)  a scripted DeckSource for the first run (the 4 locked beats), no server needed.
//   shippy/   (shippy) createShippy(art) -> ShippyModule; draws Shippy into the engine's canvas.
//   card/     (card)   mountCard(host, handlers) -> CardHandle; the one iron swipe card, plain DOM.
//   juice/    (juice)  attachJuice(bus, host, where) -> detach; sounds + effects driven by DeckEvents.
//
// Entry points main.ts looks for (each optional, picked up when the file exists):
//   story/index.ts  export createStory(opts: { seed: number; speed: number }): DeckSource
//   data/index.ts   export createLiveSource(): DeckSource | Promise<DeckSource>     (?source=live)
//   shippy/index.ts export createShippy: CreateShippy
//   card/index.ts   export mountCard: MountCard
//   juice/index.ts  export attachJuice: AttachJuice
//
// The page: web/deck.html (vite dev: http://localhost:5173/deck.html) mounts web/src/deck2d/main.ts.
// Sprites: web/public/deck/art/*.webp, cleaned from Justin's ChatGPT sheets (names below).
// Change this file only with the hub thread; add fields, don't rename them.
import { pixelOn } from "../flags";

// ---------- the line ----------
export type StopId = "repo" | "planner" | "builder" | "checks" | "review" | "gate" | "launch";
export const STOPS: readonly StopId[] = ["repo", "planner", "builder", "checks", "review", "gate", "launch"];
/** One name per station, used word for word everywhere: deck, cards, captions, server logs, PR comments, docs.
 * No synonyms (web/test/station-names.test.ts guards the old ones). */
export const STOP_LABEL: Record<StopId, string> = {
  repo: "Repo", planner: "Planner", builder: "Builder", checks: "Checks", review: "Review", gate: "Gate", launch: "Launch",
};

/** Same four words as the sprite files (`<stop>-<state>.webp`). auto = green, it runs without you. */
export type StopState = "idle" | "working" | "jammed" | "auto";

/** A crate on the line. look picks the crate sprite (`crate-<look>.webp`). */
export interface Item {
  id: string; // stable across views, so the engine can animate the same crate from stop to stop
  title?: string;
  look: "plain" | "ok" | "bad" | "glow" | "wait"; // wait = red bands, stuck waiting on a call
}

export interface Stop {
  id: StopId;
  built: boolean; // false = not on the deck yet (the line builds out as the story goes)
  state: StopState;
  automated: boolean; // the player has handed this stop to Shippy
  items: Item[]; // crates queued at or inside this stop, front of the line first
  waiting?: string; // plate text when jammed, e.g. "REVIEW WAITING"
  locked?: boolean; // shown as a tarp + padlock plot: a piece you haven't added yet (e.g. before GitHub is connected)
  building?: number; // 0..1 while it's under construction (plot -> scaffolding -> machine); undefined when not building
}

export interface CardView {
  id: string;
  title: string; // "Approve fix for checkout bug?"
  dots: { have: number; need: number } | null; // ●○○ toward automatic
  line: string; // "Approve 2 more like this and it's automatic."
  stop: StopId; // which stop the camera flies to
  yes?: string; // button labels, default "Approve" / "Later" (e.g. "Show me my repo" / "Replay")
  no?: string;
  hold?: boolean; // ships real code (a merge): needs a held press or a full swipe, never a flick
  guide?: "shippy"; // verified Meta-guided recommendation; ordinary setup/status cards stay plain
  setup?: boolean; // a "plug in an agent" / connect card rather than a decision on work
  /** A story card: Shippy stands inside the card and says `line` (typed out). `yes` defaults to "Next"; Later only shows
   *  when `no` is set. Tap the card, swipe right or press → to go on (onApprove). dots, hold and guide are ignored. */
  shippy?: "talk" | "wave" | "point" | "happy";
}

export type ShippyPose = "folded" | "peek" | "unfold" | "walking" | "lever" | "happy" | "alarmed" | "weld" | "carry" | "inspect" | "poke" | "skid" | "idle";
export interface ShippyView {
  pose: ShippyPose;
  at: StopId | "corner"; // corner = folded up in the top-left of the screen
}

/** Everything the screen shows, at one moment. Sources (data/, story/) produce it; engine/ draws it. */
export interface DeckView {
  stops: Stop[]; // always all seven, in STOPS order
  jam: StopId | null; // the one bottleneck the camera parks on
  card: CardView | null; // at most one card, ever
  shippy: ShippyView;
  shipped: number; // rockets launched so far
  caption: string | null; // one short line, shown at the bottom when no card is up ("Software is a factory.")
  /** The platform grows with you. Omitted = full deck with the launch island built. */
  deck?: {
    size: "small" | "medium" | "large"; // small: repo + 1-2 stations; large: the whole line
    growing?: number; // 0..1 while bolting on the next section
    island: "none" | "building" | "built"; // bridge + rocket island; no rocket until it's built
    islandProgress?: number; // 0..1 while building
  };
}

/** Where a DeckView comes from: the scripted first run or the real factory. */
export interface DeckSource {
  view(): DeckView;
  step?(dt: number): void; // seconds; scripted sources advance here, live ones ignore it
  approve(cardId: string): void;
  later(cardId: string): void;
  subscribe?(fn: () => void): () => void; // live sources call fn when the view changed
}

// ---------- events (engine -> juice, shippy, anyone) ----------
// The engine diffs views and emits these. Juice maps them to sounds and effects.
export type DeckEvent =
  | { type: "build-start"; stop: StopId } // construction zone appears (scaffolding, sparks, Shippy welding)
  | { type: "station-built"; stop: StopId } // the payoff: glowing burst + green check, you added to your line
  | { type: "station-state"; stop: StopId; state: StopState }
  | { type: "crate-arrive"; stop: StopId; id: string }
  | { type: "jam"; stop: StopId }
  | { type: "approve"; cardId: string }
  | { type: "later"; cardId: string }
  | { type: "launch" }
  | { type: "automated"; stop: StopId }
  | { type: "shippy"; pose: ShippyPose }
  | { type: "deck-grow"; size: "small" | "medium" | "large"; phase: "beams" | "plates" | "rails" | "glow" | "rocks" | "done" } // grow/
  | { type: "build-stage"; stop: StopId; stage: "plot" | "scaffold" | "frame" | "panels" | "top" | "burst" | "check" } // build/
  | { type: "launch-stage"; stage: "island-rising" | "island-up" | "bridge" | "bridge-done" | "tower" | "rocket-lowering" | "rocket-seated" } // launch/
  | { type: "tap"; target: TapTarget } // interact/ (docs/PIXEL-PLAN.md section 6)
  | { type: "shippy-arrive"; target: TapTarget }
  | { type: "interact"; target: TapTarget; action: string };

/** Anything on the deck you can tap; Shippy walks to standX and does action. interact/targets.ts builds these. */
export interface TapTarget {
  kind: "station" | "belt" | "crate" | "lever" | "rocket" | "shippy" | "floor";
  id: string;
  box: { x: number; y: number; w: number; h: number }; // world units
  standX: number;
  face: -1 | 1;
  action: string;
}

export interface DeckBus {
  on(fn: (e: DeckEvent) => void): () => void;
  emit(e: DeckEvent): void;
}
export function createBus(): DeckBus {
  const fns = new Set<(e: DeckEvent) => void>();
  return { on: (fn) => (fns.add(fn), () => fns.delete(fn)), emit: (e) => fns.forEach((fn) => fn(e)) };
}

// ---------- world space ----------
// World units are deck-sprite pixels: deck.webp is 2039 x 657, the floor's belt line is at y = BELT_Y.
// The bridge + rocket island sits to the right; launch is the middle of its pad.
export const DECK = { w: 2039, h: 657 } as const;
export const BELT_Y = 236;
/** Pixel mode lays the line out wider (Justin 2026-10-28: "spread out a bit more"): the deck is DECK_DX longer, the
 * boiler gets its own bay at the left end, every stop gets room for crates either side, and the bridge + island move
 * right with the deck's end. Anything placed relative to the deck's right end adds DECK_DX. */
export const DECK_DX = pixelOn() ? 940 : 0;
export const DECK_END = 2039 + DECK_DX;
export const STOP_X: Record<StopId, number> = DECK_DX
  ? { repo: 640, planner: 1040, builder: 1440, checks: 1840, review: 2240, gate: 2640, launch: 2834 + DECK_DX }
  : { repo: 200, planner: 500, builder: 800, checks: 1100, review: 1400, gate: 1700, launch: 2834 };
export const LAUNCH_Y = 250; // the launch circle on the rocket island
/** The large deck's hull in world units (pixel mode draws it in code, hull/). The floor runs back..front; the belt row
 * (BELT_Y) and the stations' feet sit in the front half, the back half is open floor for the boiler and props. The
 * pixel deck has a deeper front strip (front 350) so Shippy has floor to walk on in front of the belt, and its orb hangs
 * clear below the rocks; the picture deck keeps its front rail at 318, where its bridge meets the deck. */
export const HULL = DECK_DX
  ? { x0: 0, x1: DECK_END, back: 40, front: 350, skirt: 422, bottom: 632, orb: { x: 1500, y: 660 } } as const
  : { x0: 0, x1: DECK_END, back: 40, front: 318, skirt: 390, bottom: 600, orb: { x: 1043, y: 578 } } as const;
/** Where things stand: a sprite's feet sit on this y at a stop (slightly in front of the belt). */
export const FLOOR_Y = BELT_Y + 42;
/** Drawn height of each station sprite (they come in at different scales) and how far below the belt its feet sit. */
export const LOOK: Record<StopId, { h: number; drop: number }> = {
  repo: { h: 190, drop: 46 }, planner: { h: 165, drop: 40 }, builder: { h: 172, drop: 42 }, checks: { h: 172, drop: 42 },
  review: { h: 140, drop: 44 }, gate: { h: 168, drop: 44 }, launch: { h: 0, drop: 0 },
};

// ---------- art ----------
export const ART_BASE = "/deck/art/";
export const art = (name: string) => `${ART_BASE}${name}.webp`;
/** Every sprite on disk. Strips were split into one file per frame/state, frames share one size, feet at the bottom. */
// ---------- the pixel canvas (LOCKED 2026-10-28, Justin) ----------
// Everything on the deck is pixel art on one canvas. Code draws anything that moves; snapped pictures are fine for
// big things that don't (sky, city, deck hull). Rules every module follows:
//  - The camera shows CANVAS art px (landscape) or CANVAS_PORTRAIT (phones), blown up at a whole-number scale with
//    smoothing off. 1 art px = ART_PX world units, so STOP_X / BELT_Y / LOOK stay as they are.
//  - Draw at whole art px only (world coords that are multiples of ART_PX): fillRect, no arcs, no anti-aliasing,
//    no rotating or free-scaling sprites (anything that turns gets frames).
//  - Only PALETTE colors, alpha fully on or off. One exception: glow/steam on a light layer at 25/50/75%.
//  - Light from the upper right: top/right faces use the light end of a ramp, bottom/left the dark end.
//    1 art px soot outline around anything on the deck; inside lines use the ramp's darkest color.
//  - jam reds = stuck only, ok greens = done/automatic only, energy cyan = Shippy's eye, the core, power.
//  - Calm: one thing moves at a time. Nothing ambient flashes; only the jam breathes.
// Sizes at this scale (art px): station ~38 tall, Shippy ~16 standing, crate ~8, belt ~7 tall.
export const CANVAS = { w: 640, h: 360 } as const;
export const CANVAS_PORTRAIT = { w: 360, h: 640 } as const;
export const ART_PX = 5;
/** Snap a world coordinate to the art grid. */
export const snap = (n: number) => Math.round(n / ART_PX) * ART_PX;
/** Black Iron 48 (art/palette/black-iron-48.*), each ramp dark -> light. */
export const PALETTE = {
  soot: ["#0a0604"],
  iron: ["#181211", "#291b17", "#432f29", "#6b5360", "#8f6f62"],
  steel: ["#121e2b", "#273349", "#3d4d6a", "#7d8ea3"],
  copper: ["#713e30", "#a04430", "#cd4f27", "#e28059", "#f2b48c"],
  brass: ["#422616", "#6d370c", "#a36915", "#c98115", "#fdc727", "#fdec9a"],
  plate: ["#351705", "#5a3521", "#834621", "#ae6237", "#b48254"],
  sun: ["#652203", "#bc3c0b", "#e44e1b", "#f6601f", "#fc8717", "#fdad1e", "#f9c47a"],
  haze: ["#623a3a", "#82525a", "#c0988e", "#eed3c5"],
  white: ["#fdfaec"],
  energy: ["#28545a", "#0ea0ac", "#41f3f7", "#bcf6f6"],
  ok: ["#1c450f", "#1ab004", "#81f381"],
  jam: ["#6a0d0d", "#c8231b", "#ff5b4a"],
} as const;
export const PALETTE_48: readonly string[] = Object.values(PALETTE).flat();

/** Pixel sheets: web/public/deck/px/<group>/<name>.png + .json (Aseprite json-array with frameTags). */
export const SHEETS = {
  stations: ["repo", "planner", "builder", "checks", "review", "gate"],
  shippy: ["shippy"],
  props: ["crate", "belt", "lever", "lamp", "beacon", "boiler", "rocket", "flame", "core", "vent"],
  scene: ["sky", "clouds", "skyline", "deck-small", "deck-medium", "deck-large"],
} as const;
export const sheet = (group: keyof typeof SHEETS, name: string) => `/deck/px/${group}/${name}`;

export const SPRITES = {
  scene: ["sky", "clouds", "deck", "pad", "boiler-off", "boiler-on"],
  rocket: ["rocket", "flame"],
  stations: ["repo", "planner", "builder", "checks", "review", "gate"].flatMap((s) => ["idle", "working", "jammed", "auto"].map((st) => `${s}-${st}`)),
  line: ["belt", "crate-plain", "crate-ok", "crate-bad", "crate-glow", "crate-wait", "beacon", "plate"],
  lever: ["lever-up", "lever-down", "lever-glow"],
  // shippy-0..5 = unfold strip: 0 closed box eye off, 1 eye on, 2 legs out, 3 standing, 4 arm out, 5 walking.
  // Poses are separate files, their own sizes: lever (pulling, includes the lever), happy, alarm, peek.
  shippy: ["shippy-0", "shippy-1", "shippy-2", "shippy-3", "shippy-4", "shippy-5", "shippy-lever", "shippy-happy", "shippy-alarm", "shippy-peek", "shippy-weld-0", "shippy-weld-1", "shippy-carry-0", "shippy-carry-1"],
  ui: ["ui-panel", "ui-btn", "ui-btn-glow", "logo"], // 9-slice frames for the card and its two buttons
} as const;

/** Loads sprites once; the engine passes its loader to modules so nothing loads twice. */
export interface ArtLoader {
  get(name: string): HTMLImageElement | null; // null until loaded
  ready(): Promise<void>;
}

// ---------- module APIs ----------
/** Shippy draws into the engine's canvas. drawWorld runs with the world transform set; drawCorner in screen pixels. */
export interface ShippyModule {
  update(dt: number, view: ShippyView): void;
  drawWorld(ctx: CanvasRenderingContext2D): void;
  drawCorner(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void; // x,y = top-left of a size x size box
  /** Tap-to-walk (pixel plan C6). Optional until shippy/ wires walk.ts; story poses still win over taps. */
  goTo?(target: TapTarget): void;
  busy?(): boolean;
}
export type CreateShippy = (art: ArtLoader) => ShippyModule;

export interface CardHandle {
  show(card: CardView | null, opts?: { quiet?: boolean }): void; // null hides it; quiet: no "All caught up" (a scripted beat took the screen)
  destroy(): void;
}
export type MountCard = (host: HTMLElement, handlers: { onApprove(id: string): void; onLater(id: string): void }) => CardHandle;

/** where(stop) gives the stop's position in CSS pixels on screen right now, for effects that sit on a machine. */
export type AttachJuice = (bus: DeckBus, host: HTMLElement, where: (stop: StopId) => { x: number; y: number }) => () => void;

/**
 * A drawing layer that plugs into the engine's canvas: grow/ (the platform growing), build/ (construction zones),
 * launch/ (bridge + island + tower + rocket). draw() is called once per slot, in world coords, in this order:
 *   sky-far (after the sky, before back clouds) · deck (where the platform draws) · line (after belt, before crates)
 *   · stations (after stations) · front (after front clouds).
 * replaces = what the engine stops drawing itself when this layer is mounted, so the layer owns it outright.
 */
export type LayerSlot = "sky-far" | "deck" | "line" | "stations" | "front";
export interface DeckLayer {
  /** Engine pieces this layer draws itself: the engine skips them. props/ takes "boiler" and "orb" (the core under the deck). */
  replaces?: ("deck" | "island" | "rocket" | "boiler" | "orb")[];
  update(dt: number, view: DeckView): void;
  draw(ctx: CanvasRenderingContext2D, slot: LayerSlot): void;
  /** build/: true while this layer draws the stop itself (locked tarp, mid-construction); the engine skips its sprite. */
  owns?(stop: Stop): boolean;
  /** grow/: the world x-range that's built right now; the camera fits it and the belt stops at its right edge. */
  bounds?(): { x0: number; x1: number };
  /** build/ only: camera shake in world px right now, and where Shippy should be while a build runs (overrides view.shippy). */
  build?: { shake?(): number; shippyAct?(): { at: StopId; pose: ShippyPose } | null };
}
export type CreateLayer = (art: ArtLoader, bus: DeckBus) => DeckLayer;
// Entries: grow/index.ts, build/index.ts, launch/index.ts, juice/index.ts, props/index.ts each `export const createLayer: CreateLayer`.
/** World geometry layers need: the deck's right edge right now (it grows), and the launch spot. */
export const LAUNCH = { x: 2834 + DECK_DX, y: 250 } as const;

// ---------- page hooks (screenshots, clips) ----------
// <body data-deck-ready> is set once sprites loaded and the first frame drew.
// URL params: ?speed=2 runs time faster, ?seed=1 makes the scripted story deterministic, ?source=story|live.
