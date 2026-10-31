import "../deck.css";
import { SPRITES, STOPS, createBus, type DeckSource, type DeckView, type StopId } from "../contract";
import { createArt } from "../engine/art";
import { createDemo } from "../engine/demo";
import { createEngine } from "../engine/engine";
import { fallbackShippy } from "../engine/fallbacks";
import { createGrow, GROW_SECONDS, type DeckSize } from "./index";

// Dev page web/deckgrow.html: the real engine + the grow/ layer, with a Grow button. The demo source runs the line;
// this page decides which stops stand on the deck for each size and when the island goes up.
const ON: Record<DeckSize, StopId[]> = {
  small: ["repo", "planner", "builder"],
  medium: ["repo", "planner", "builder", "checks", "review"],
  large: [...STOPS],
};
const ORDER: DeckSize[] = ["small", "medium", "large"];
const params = new URLSearchParams(location.search);
const speed = Math.max(0.05, Math.min(8, Number(params.get("speed")) || 1));
const pick = (k: string) => (ORDER.includes(params.get(k) as DeckSize) ? (params.get(k) as DeckSize) : null);

let size: DeckSize = pick("from") ?? pick("size") ?? "small";
let stopsT = 0, islandT = -1; // seconds since the size changed (stations wait for their floor); island progress clock

function source(): DeckSource {
  const demo = createDemo();
  return {
    ...demo,
    view(): DeckView {
      const v = demo.view();
      const ready = stopsT > GROW_SECONDS * 0.6; // new stations land once their plates are down
      const on = ready ? ON[size] : ON[ORDER[Math.max(0, ORDER.indexOf(size) - 1)]];
      const island = size !== "large" || islandT < 0 ? "none" : islandT >= 1 ? "built" : "building";
      return {
        ...v,
        stops: v.stops.map((s) => (on.includes(s.id) ? { ...s, built: true } : { ...s, built: false, items: [], state: "idle" })),
        jam: v.jam && on.includes(v.jam) ? v.jam : null,
        card: null, // this page is about the platform; no card in the way
        caption: null,
        deck: { size, island, islandProgress: Math.max(0, Math.min(1, islandT)) },
      };
    },
  };
}

(async () => {
  const art = createArt(Object.values(SPRITES).flat());
  const bus = createBus();
  const grow = createGrow(art, bus);
  let frozen = false;
  const src = source();
  const cv = document.getElementById("world") as HTMLCanvasElement;
  // while a screenshot is frozen the engine keeps easing its camera, but the grow clock holds still
  const held = { ...grow, replaces: grow.replaces, update: (dt: number, v: DeckView) => grow.update(frozen ? 0 : dt, v), draw: grow.draw, bounds: grow.bounds };
  const engine = createEngine(cv, art, bus, fallbackShippy(art), [held]);
  const go = document.getElementById("grow-go") as HTMLButtonElement;
  const label = document.getElementById("grow-size")!;
  const log: string[] = [];
  bus.on((e) => { if (e.type === "deck-grow") log.push(`${e.size}:${e.phase}`); });

  const set = (s: DeckSize) => { size = s; stopsT = s === "small" ? 99 : 0; islandT = -1; };
  const sync = () => {
    go.disabled = size === "large" || !!grow.growing;
    label.textContent = `${(grow.growing ?? grow.size).toUpperCase()} DECK${grow.growing ? " · BUILDING" : ""}`;
  };
  const api = {
    grow() { if (size !== "large") set(ORDER[ORDER.indexOf(size) + 1]); frozen = false; },
    reset() { set("small"); frozen = false; grow.seek("small", "small", 0); },
    seek(from: DeckSize, to: DeckSize, t: number) {
      size = to; stopsT = t; islandT = to === "large" ? Math.max(-1, (t - GROW_SECONDS) / 2) : -1;
      grow.seek(from, to, t); frozen = true;
    },
    get size() { return grow.size; },
    log,
  };
  (window as unknown as { GROW: typeof api }).GROW = api;
  go.addEventListener("click", () => api.grow());
  document.getElementById("grow-reset")!.addEventListener("click", () => api.reset());
  stopsT = 99;
  const from = pick("from"), to = pick("to"), at = Number(params.get("at"));
  await art.ready();
  if (from && to && Number.isFinite(at)) api.seek(from, to, at);

  let last = 0;
  const frame = (now: number) => {
    const real = Math.min(0.05, (now - (last || now)) / 1000) * speed, dt = frozen ? 0 : real; last = now;
    src.step?.(dt);
    stopsT += dt;
    if (size === "large" && !grow.growing && islandT < 1) islandT = islandT < 0 ? 0 : Math.min(1, islandT + dt / 2);
    engine.frame(src.view(), frozen ? real : dt);
    sync();
    if (!document.body.dataset.deckReady) document.body.dataset.deckReady = "1";
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
})();
