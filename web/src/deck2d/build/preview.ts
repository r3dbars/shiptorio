import "../deck.css";
import { SPRITES, STOPS, createBus, type CreateShippy, type DeckView, type StopId } from "../contract";
import { createArt } from "../engine/art";
import { createEngine } from "../engine/engine";
import { fallbackShippy } from "../engine/fallbacks";
import { BUILD_SPRITES, STAGE_AT, createLayer, type Build } from "./index";

// Dev preview (web/deckbuild.html): every stop starts locked under a tarp; each button builds one.
const params = new URLSearchParams(location.search);
const speed = Math.max(0.1, Math.min(8, Number(params.get("speed")) || 1));
const BUILDABLE = STOPS.filter((s) => s !== "launch");
const shippyMods = import.meta.glob<Record<string, unknown>>("../shippy/index.ts");

(async () => {
  const art = createArt([...Object.values(SPRITES).flat(), ...BUILD_SPRITES]);
  const bus = createBus();
  const sm = Object.values(shippyMods)[0];
  const shippy = (((sm && (await sm()).createShippy) as CreateShippy | undefined) ?? fallbackShippy)(art);
  const layer = createLayer(art, bus) as ReturnType<typeof createLayer> & { build: Build };
  const cv = document.getElementById("world") as HTMLCanvasElement;
  const engine = createEngine(cv, art, bus, shippy, [layer]);

  const built = new Set<StopId>(["repo"]);
  const view = (): DeckView => {
    const act = layer.build.shippyAct();
    return {
      stops: STOPS.map((id) => ({ id, built: id === "launch" || built.has(id), locked: id !== "launch" && !built.has(id), building: layer.build.progress(id) ?? undefined, state: "idle", automated: false, items: [] })),
      jam: null, card: null, shipped: 0, caption: null,
      shippy: act ?? { pose: "folded", at: "corner" }, // the engine overrides this from shippyAct() anyway
      deck: { size: "large", island: "built" },
    } as DeckView;
  };
  const build = (s: StopId) => { built.add(s); };
  (window as unknown as { deckWhere: typeof engine.where }).deckWhere = (s) => engine.where(s); // shots crop around a stop
  const lockAll = () => { built.clear(); built.add("repo"); };

  const bar = document.getElementById("bar")!;
  for (const s of BUILDABLE) {
    const b = document.createElement("button");
    b.textContent = `Build ${s}`; b.dataset.build = s;
    b.onclick = () => { if (built.has(s)) { built.delete(s); setTimeout(() => build(s), 60); } else build(s); };
    bar.append(b);
  }
  const lock = document.createElement("button");
  lock.className = "lock"; lock.textContent = "Lock all"; lock.onclick = lockAll;
  bar.append(lock);
  bus.on((e) => { if (e.type === "build-stage" || e.type === "station-built") console.debug("[build]", e); });

  const auto = params.get("stop") as StopId | null;
  let autoT = 0.8;
  const loop = params.get("loop") === "1";
  await art.ready();
  let last = 0;
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - (last || now)) / 1000) * speed; last = now;
    if (auto && (autoT -= dt) <= 0) {
      if (built.has(auto)) { built.delete(auto); autoT = 0.6; } // re-tarp, then build again
      else { build(auto); autoT = loop ? STAGE_AT.gone + 1.2 : Infinity; }
    }
    engine.frame(view(), dt);
    if (!document.body.dataset.deckReady) document.body.dataset.deckReady = "1";
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
})();
