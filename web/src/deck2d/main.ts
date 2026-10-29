import "./deck.css";
import { SPRITES, createBus, type AttachJuice, type CreateLayer, type CreateShippy, type DeckLayer, type DeckSource, type MountCard } from "./contract";
import { createArt } from "./engine/art";
import { createDemo, createOrbDemo, createLaunchDemo } from "./engine/demo";
import { createEngine } from "./engine/engine";
import { fallbackCard, fallbackShippy } from "./engine/fallbacks";
import { createShippyRehearsal } from "./shippy/rehearsal";
import { createWatchSource, isWatchMode } from "./data/watch";
import { createMachineRehearsal, mountMachineControls } from "./stations/rehearsal";
import { createMachineInteraction } from "./stations/inspector";
import { createFirstVisitDemo } from "./stations/first-visit";

// The 2D deck page (web/deck.html). Wires the engine to a source, the card, Shippy and juice.
// Each module lives in its own folder and is picked up here when it exists, so threads can land independently.
type Mod = Record<string, unknown>;
// Each folder's entry: index.ts, or the one file named after the folder's job (card/card.ts, data/source.ts).
const mods = import.meta.glob<Mod>(["./{story,data,shippy,card,juice,grow,build,launch,props}/index.ts", "./card/card.ts", "./data/source.ts", "./shippy/shippy.ts", "./story/story.ts"]);
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
  const rehearsal = want === "shippy-demo" ? createShippyRehearsal() : null;
  const machines = want === "machine-demo" ? createMachineRehearsal() : null;
  const updateMachineControls = machines ? mountMachineControls(machines) : null;
  if (rehearsal) source = rehearsal;
  else if (machines) { source = machines; document.body.classList.add("machine-rehearsal"); }
  else if (want === "attention-demo") source = createFirstVisitDemo({ ready: () => {
    const actor = shippy as typeof shippy & { state?: { world: string; dockPhase?: string } };
    return !actor.state || (actor.state.world === "stand" && (!actor.state.dockPhase || actor.state.dockPhase === "awake"));
  } });
  else if (isWatchMode(location.search)) {
    source = createWatchSource();
    document.body.classList.add("factory-watch");
  }
  else if (want === "launch-demo") source = createLaunchDemo();
  else if (want === "orb-demo") source = createOrbDemo();
  else if ((want === "live" || want === "sim") && data?.createLiveSource) source = await (data.createLiveSource as () => Promise<DeckSource> | DeckSource)();
  else if (want !== "demo" && story?.createStory) source = (story.createStory as (o: { seed: number; speed: number }) => DeckSource)({ seed, speed });
  else source = createDemo();

  const shippy = ((shippyMod?.createShippy as CreateShippy | undefined) ?? fallbackShippy)(art);
  const cv = document.getElementById("world") as HTMLCanvasElement;
  const layers: DeckLayer[] = [];
  for (const f of ["grow", "build", "launch", "juice", "props"]) { const m = await load(f, "createLayer"); if (m) layers.push((m.createLayer as CreateLayer)(art, bus)); }
  const inspector = createMachineInteraction(machines ? id => { if (id === machines.machine) machines.setMode("working"); } : undefined);
  const engine = createEngine(cv, art, bus, shippy, layers, { onMachineSelect: id => {
    if (machines) machines.cycling = false;
    (source as DeckSource & { selectStop?: (stop: typeof id) => void }).selectStop?.(id);
    inspector.select(id);
  } });
  if (rehearsal) {
    document.body.classList.add("shippy-rehearsal");
    const controls = document.createElement("div"); controls.className = "shippy-tools";
    for (const [label, run] of [
      ["Pause", (button: HTMLButtonElement) => { rehearsal.paused = !rehearsal.paused; button.textContent = rehearsal.paused ? "Play" : "Pause"; }],
      ["Next job", () => rehearsal.next()],
      ["Replay", () => rehearsal.reset()],
      ["Charge", () => { rehearsal.rest(); engine.focus(null); }],
    ] as const) {
      const button = document.createElement("button"); button.type = "button"; button.textContent = label;
      button.onclick = () => run(button); controls.append(button);
    }
    document.body.append(controls);
  }

  const mountCard = (cardMod?.mountCard as MountCard | undefined) ?? fallbackCard;
  const card = mountCard(document.getElementById("card-host")!, {
    onApprove(id) { bus.emit({ type: "approve", cardId: id }); if (!inspector.answer(id, true)) source.approve(id); },
    onLater(id) { bus.emit({ type: "later", cardId: id }); if (!inspector.answer(id, false)) source.later(id); },
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
  let focusedMachine: string | null = null;
  const frame = (now: number) => {
    const dt = rehearsal?.paused || machines?.frozen ? 0 : Math.min(0.05, (now - (last || now)) / 1000) * speed; last = now;
    source.step?.(dt);
    if (machines) {
      if (machines.machine !== focusedMachine) { engine.focus(machines.machine); focusedMachine = machines.machine; }
      updateMachineControls?.();
    }
    const view = inspector.view(source.view());
    engine.frame(view, dt);
    card.show(view.card);
    if (view.caption !== caption) { caption = view.caption; if (caption) toast.textContent = caption; }
    toast.classList.toggle("on", !!caption && !view.card); // the card owns the bottom of the screen
    if (!document.body.dataset.deckReady) document.body.dataset.deckReady = "1";
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
})();
