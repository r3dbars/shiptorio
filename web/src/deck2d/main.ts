import "./deck.css";
import { SPRITES, createBus, type AttachJuice, type CreateLayer, type CreateShippy, type DeckLayer, type DeckSource, type MountCard } from "./contract";
import { createArt } from "./engine/art";
import { createDemo } from "./engine/demo";
import { createEngine } from "./engine/engine";
import { fallbackCard, fallbackShippy } from "./engine/fallbacks";

// The 2D deck page (web/deck.html). Wires the engine to a source, the card, Shippy and juice.
// Each module lives in its own folder and is picked up here when it exists, so threads can land independently.
type Mod = Record<string, unknown>;
// Each folder's entry: index.ts, or the one file named after the folder's job (card/card.ts, data/source.ts).
const mods = import.meta.glob<Mod>(["./{story,data,shippy,card,juice,grow,build,launch}/index.ts", "./card/card.ts", "./data/source.ts", "./shippy/shippy.ts", "./story/story.ts"]);
const load = async (folder: string, name: string) => {
  for (const [path, get] of Object.entries(mods)) if (path.startsWith(`./${folder}/`)) { const m = await get(); if (m[name]) return m; }
  return null;
};

const params = new URLSearchParams(location.search);
const speed = Math.max(0.1, Math.min(8, Number(params.get("speed")) || 1));
const seed = Number(params.get("seed")) || 0;

(async () => {
  const art = createArt(Object.values(SPRITES).flat());
  const bus = createBus();
  const [story, data, shippyMod, cardMod, juiceMod] = await Promise.all([
    load("story", "createStory"), load("data", "createLiveSource"), load("shippy", "createShippy"), load("card", "mountCard"), load("juice", "attachJuice")]);

  let source: DeckSource;
  const want = params.get("source");
  if (want === "live" && data?.createLiveSource) source = await (data.createLiveSource as () => Promise<DeckSource> | DeckSource)();
  else if (want !== "demo" && story?.createStory) source = (story.createStory as (o: { seed: number; speed: number }) => DeckSource)({ seed, speed });
  else source = createDemo();

  const shippy = ((shippyMod?.createShippy as CreateShippy | undefined) ?? fallbackShippy)(art);
  const cv = document.getElementById("world") as HTMLCanvasElement;
  const layers: DeckLayer[] = [];
  for (const f of ["grow", "build", "launch"]) { const m = await load(f, "createLayer"); if (m) layers.push((m.createLayer as CreateLayer)(art, bus)); }
  const engine = createEngine(cv, art, bus, shippy, layers);

  const mountCard = (cardMod?.mountCard as MountCard | undefined) ?? fallbackCard;
  const card = mountCard(document.getElementById("card-host")!, {
    onApprove(id) { bus.emit({ type: "approve", cardId: id }); source.approve(id); },
    onLater(id) { bus.emit({ type: "later", cardId: id }); source.later(id); },
  });
  (juiceMod?.attachJuice as AttachJuice | undefined)?.(bus, document.body, (s) => engine.where(s));

  const zoom = document.getElementById("zoom") as HTMLButtonElement;
  let all = false;
  const zoomLabel = () => { zoom.hidden = !engine.portrait; zoom.textContent = all ? "Zoom in" : "See all"; };
  zoom.addEventListener("click", () => { all = !all; engine.seeAll(all); zoomLabel(); });
  addEventListener("resize", zoomLabel); zoomLabel();

  const toast = document.getElementById("toast")!;
  let caption: string | null = null;

  await art.ready();
  let last = 0;
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - (last || now)) / 1000) * speed; last = now;
    source.step?.(dt);
    const view = source.view();
    engine.frame(view, dt);
    card.show(view.card);
    if (view.caption !== caption) { caption = view.caption; if (caption) toast.textContent = caption; toast.classList.toggle("on", !!caption); }
    if (!document.body.dataset.deckReady) document.body.dataset.deckReady = "1";
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
})();
