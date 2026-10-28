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
// The page: web/deck.html (vite dev: http://localhost:5173/deck.html) mounts web/src/deck2d/main.ts.
// Sprites: web/public/deck/art/*.webp, cleaned from Justin's ChatGPT sheets (names below).
// Change this file only with the hub thread; add fields, don't rename them.

// ---------- the line ----------
export type StopId = "repo" | "planner" | "builder" | "checks" | "review" | "gate" | "launch";
export const STOPS: readonly StopId[] = ["repo", "planner", "builder", "checks", "review", "gate", "launch"];
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
}

export interface CardView {
  id: string;
  title: string; // "Approve fix for checkout bug?"
  dots: { have: number; need: number } | null; // ●○○ toward automatic
  line: string; // "Approve 2 more like this and it's automatic."
  stop: StopId; // which stop the camera flies to
}

export type ShippyPose = "folded" | "peek" | "unfold" | "walking" | "lever" | "happy" | "alarmed";
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
  | { type: "station-built"; stop: StopId }
  | { type: "station-state"; stop: StopId; state: StopState }
  | { type: "crate-arrive"; stop: StopId; id: string }
  | { type: "jam"; stop: StopId }
  | { type: "approve"; cardId: string }
  | { type: "later"; cardId: string }
  | { type: "launch" }
  | { type: "automated"; stop: StopId }
  | { type: "shippy"; pose: ShippyPose };

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
export const STOP_X: Record<StopId, number> = {
  repo: 210, planner: 480, builder: 740, checks: 990, review: 1250, gate: 1560, launch: 2834,
};
export const LAUNCH_Y = 250; // the launch circle on the rocket island
/** Where things stand: a sprite's feet sit on this y at a stop (slightly in front of the belt). */
export const FLOOR_Y = BELT_Y + 42;

// ---------- art ----------
export const ART_BASE = "/deck/art/";
export const art = (name: string) => `${ART_BASE}${name}.webp`;
/** Every sprite on disk. Strips were split into one file per frame/state, frames share one size, feet at the bottom. */
export const SPRITES = {
  scene: ["sky", "clouds", "deck", "pad", "boiler-off", "boiler-on"],
  rocket: ["rocket", "flame"],
  stations: ["repo", "builder", "checks", "review", "gate"].flatMap((s) => ["idle", "working", "jammed", "auto"].map((st) => `${s}-${st}`)),
  line: ["belt", "crate-plain", "crate-ok", "crate-bad", "crate-glow", "crate-wait", "beacon", "plate"],
  lever: ["lever-up", "lever-down", "lever-glow"],
  // shippy-0..5 = unfold strip: 0 closed box eye off, 1 eye on, 2 legs out, 3 standing, 4 arm out, 5 walking.
  // Poses are separate files, their own sizes: lever (pulling, includes the lever), happy, alarm, peek.
  shippy: ["shippy-0", "shippy-1", "shippy-2", "shippy-3", "shippy-4", "shippy-5", "shippy-lever", "shippy-happy", "shippy-alarm", "shippy-peek"],
  ui: ["ui-panel", "ui-btn", "ui-btn-glow"], // 9-slice frames for the card and its two buttons
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
}
export type CreateShippy = (art: ArtLoader) => ShippyModule;

export interface CardHandle {
  show(card: CardView | null): void; // null hides it
  destroy(): void;
}
export type MountCard = (host: HTMLElement, handlers: { onApprove(id: string): void; onLater(id: string): void }) => CardHandle;

/** where(stop) gives the stop's position in CSS pixels on screen right now, for effects that sit on a machine. */
export type AttachJuice = (bus: DeckBus, host: HTMLElement, where: (stop: StopId) => { x: number; y: number }) => () => void;

// ---------- page hooks (screenshots, clips) ----------
// <body data-deck-ready> is set once sprites loaded and the first frame drew.
// URL params: ?speed=2 runs time faster, ?seed=1 makes the scripted story deterministic, ?source=story|live.
