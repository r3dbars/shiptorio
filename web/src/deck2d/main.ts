import { createConnections } from "./data/connections";
import "./deck.css";
import { SPRITES, createBus, type CardView, type StopId, type AttachJuice, type CreateLayer, type CreateShippy, type DeckLayer, type DeckSource, type MountCard } from "./contract";
import { createArt } from "./engine/art";
import { createDemo, createOrbDemo, createLaunchDemo } from "./engine/demo";
import { fallbackCard, fallbackShippy } from "./engine/fallbacks";
import { createShippyRehearsal } from "./shippy/rehearsal";
import { createWatchSource, isWatchMode } from "./data/watch";
import { createMachineRehearsal, mountMachineControls } from "./stations/rehearsal";
import { createMachineInteraction } from "./stations/inspector";
import { createFirstVisitDemo } from "./stations/first-visit";
import { createConveyorDemo } from "./engine/conveyor-demo";

/** Keyboard and screen-reader access for the existing card; it never invents an action. */
export function wireDeckAccessibility(canvas: HTMLCanvasElement, host: HTMLElement, caption: HTMLElement) {
  const doc = canvas.ownerDocument, win = doc.defaultView!;
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Factory deck. Decisions are in the card below.");
  caption.setAttribute("role", "status");
  caption.setAttribute("aria-live", "polite");
  caption.setAttribute("aria-atomic", "true");
  let last: string | null = null, serial = 0, previous: HTMLElement | null = null;
  const current = () => host.querySelector<HTMLElement>(".ic-card:not(.ic-ghost):not(.ic-empty)");
  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const target = e.target as HTMLElement | null;
    if (target?.isContentEditable || target?.closest("input,textarea,select")) return;
    const face = current();
    if (!face) return;
    if (e.key === "Escape") {
      e.preventDefault(); face.querySelector<HTMLButtonElement>(".later")?.click();
    } else if (e.key === "Enter" && !e.repeat && !target?.closest("button,a")) {
      e.preventDefault();
      const primary = face.querySelector<HTMLButtonElement>(".approve");
      if (!primary) return;
      primary.focus({preventScroll:true});
      // Use the card's existing key handlers for a held merge. A short keypress still cannot ship.
      if (face.classList.contains("hold")) primary.dispatchEvent(new win.KeyboardEvent("keydown", {key:"Enter", bubbles:true, cancelable:true}));
      else primary.click();
    }
  };
  win.addEventListener("keydown", onKey);
  return {
    update(card: CardView | null, text: string | null) {
      if (caption.textContent !== (text ?? "")) caption.textContent = text ?? "";
      if ((card?.id ?? null) === last) return;
      if (card) {
        if (!last) previous = doc.activeElement instanceof win.HTMLElement ? doc.activeElement : null;
        const face = current();
        if (face) {
          const id = `deck-decision-${++serial}`;
          const title = face.querySelector<HTMLElement>(".ic-title"), line = face.querySelector<HTMLElement>(".ic-line");
          face.tabIndex = -1; face.setAttribute("role", "group");
          if (title) { title.id = `${id}-title`; face.setAttribute("aria-labelledby", title.id); }
          if (line) { line.id = `${id}-description`; face.setAttribute("aria-describedby", line.id); }
          face.focus({preventScroll:true});
        }
      } else if (last) {
        const back = previous?.isConnected && !host.contains(previous) && previous !== doc.body ? previous : canvas;
        back.focus({preventScroll:true}); previous = null;
      }
      last = card?.id ?? null;
    },
    destroy() { win.removeEventListener("keydown", onKey); },
  };
}

// The 2D deck page (web/deck.html). Wires the engine to a source, the card, Shippy and juice.
if (typeof document !== "undefined" && document.getElementById("world")) void (async () => {
  const { createEngine } = await import("./engine/engine");
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


  const art = createArt(Object.values(SPRITES).flat());
  const bus = createBus();
  const [story, data, shippyMod, cardMod, juiceMod] = await Promise.all([
    load("story", "createStory"), load("data", "createLiveSource"), load("shippy", "createShippy"), load("card", "mountCard"), load("juice", "attachJuice")]);

  const connections = createConnections({
    repo: params.get("repo") || undefined, origin: location.origin, path: location.pathname + location.search,
    navigate: url => { location.href = url; }, copy: text => navigator.clipboard.writeText(text),
    onStart: id => (source as DeckSource & { focusItem?: (id: string) => void }).focusItem?.(id),
  });
  let source: DeckSource;
  const want = params.get("source");
  const rehearsal = want === "shippy-demo" ? createShippyRehearsal() : null;
  const machines = want === "machine-demo" ? createMachineRehearsal() : null;
  const conveyor = want === "conveyor-demo" ? createConveyorDemo() : null;
  const updateMachineControls = machines ? mountMachineControls(machines) : null;
  if (rehearsal) source = rehearsal;
  else if (conveyor) { source = conveyor; document.body.classList.add("machine-rehearsal"); }
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
  else if ((want === "replay" || want === "sim" || want === "live" && params.has("repo")) && data?.createLiveSource) source = await (data.createLiveSource as (cfg: undefined, opts: { onPower: () => void }) => Promise<DeckSource> | DeckSource)(undefined, { onPower: () => connections.open("power") });
  else if (want === "live") {
    const backdrop = createDemo().view();
    // Belief before setup: one sample crate waits at Review, so the bottleneck is visible before anything is connected.
    // It's plainly a sample (no number, no card of its own) and nothing here can start real work.
    source = { view: () => ({ ...backdrop, stops: backdrop.stops.map(stop => ({ ...stop, built: true, state: "idle", automated: false,
        items: stop.id === "review" ? [{ id: "sample-waiting", title: "Sample work", look: "plain" as const }] : [] })),
      attention: ["review"], jam: null, card: null, shipped: 0, caption: "Sample: this crate waits on your call. Connect your repo to run yours.", shippy: { at: "review", pose: "inspect" } }),
      approve() {}, later() {} };
  }
  else if (want !== "demo" && story?.createStory) source = (story.createStory as (o: { seed: number; speed: number }) => DeckSource)({ seed, speed });
  else source = createDemo();

  bus.on(event => {
    if (event.type === 'crate-arrive') (source as DeckSource & { arrive?: (id: string, stop: StopId) => void }).arrive?.(event.id, event.stop);
  });

  const shippy = ((shippyMod?.createShippy as CreateShippy | undefined) ?? fallbackShippy)(art);
  const cv = document.getElementById("world") as HTMLCanvasElement;
  const layers: DeckLayer[] = [];
  for (const f of ["grow", "build", "launch", "juice", "props"]) { const m = await load(f, "createLayer"); if (m) layers.push((m.createLayer as CreateLayer)(art, bus)); }
  const inspector = createMachineInteraction(machines ? id => { if (id === machines.machine) machines.setMode("working"); } : undefined);
  const connectionTools = document.createElement("div"); connectionTools.className = "shippy-tools connection-tools";
  for (const [label, target] of [["Repo inbox", "repo"], ["Codex engine", "power"]] as const) {
    const button = document.createElement("button"); button.type = "button"; button.textContent = label;
    button.onclick = () => connections.open(target); connectionTools.append(button);
  }
  if (!want?.endsWith("-demo")) document.body.append(connectionTools);
  if (want === "live" && !params.has("repo")) connections.open("repo");
  const engine = createEngine(cv, art, bus, shippy, layers, { onPowerSelect: () => connections.open("power"), onMachineSelect: id => {
    if (id === "repo" && !want?.endsWith("-demo")) { connections.open("repo"); return; }
    if (machines) machines.cycling = false;
    (source as DeckSource & { selectStop?: (stop: typeof id) => void }).selectStop?.(id);
    inspector.select(id);
  } });
  let updateConveyorControls: (() => void) | undefined;
  if (conveyor) {
    const controls = document.createElement("div"); controls.className = "shippy-tools";
    const pause = document.createElement("button"), block = document.createElement("button"), replay = document.createElement("button");
    pause.type = block.type = replay.type = "button";
    pause.onclick = () => { conveyor.paused = !conveyor.paused; };
    block.onclick = () => conveyor.toggleBlock(); replay.onclick = () => conveyor.replay(); replay.textContent = "Replay issue";
    controls.append(pause, block, replay); document.body.append(controls);
    updateConveyorControls = () => {
      pause.textContent = conveyor.paused ? "Resume" : "Pause";
      block.textContent = conveyor.view().jam ? "Clear blockage" : "Block line";
      block.disabled = !conveyor.canBlock;
    };
    updateConveyorControls();
  }
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
    onApprove(id) { if (id.startsWith("connection-")) { void connections.answer(id, true); return; } bus.emit({ type: "approve", cardId: id }); if (!inspector.answer(id, true)) source.approve(id); },
    onLater(id) { if (id.startsWith("connection-")) { void connections.answer(id, false); return; } bus.emit({ type: "later", cardId: id }); if (!inspector.answer(id, false)) source.later(id); },
  });
  (juiceMod?.attachJuice as AttachJuice | undefined)?.(bus, document.body, (s) => engine.where(s));

  const zoom = document.getElementById("zoom") as HTMLButtonElement;
  let all = false;
  const zoomLabel = () => { const label = all ? "Zoom in" : "See all"; zoom.hidden = !engine.portrait; zoom.textContent = label; zoom.setAttribute("aria-label", label); };
  zoom.addEventListener("click", () => { all = !all; engine.seeAll(all); zoomLabel(); });
  addEventListener("resize", zoomLabel); zoomLabel();

  const toast = document.getElementById("toast")!;
  const accessibility = wireDeckAccessibility(cv, document.getElementById("card-host")!, toast);
  let caption: string | null = null;

  await art.ready();
  let last = 0;
  let focusedMachine: string | null = null;
  const frame = (now: number) => {
    const dt = rehearsal?.paused || machines?.frozen || conveyor?.paused ? 0 : Math.min(0.05, (now - (last || now)) / 1000) * speed; last = now;
    source.step?.(dt);
    updateConveyorControls?.();
    if (machines) {
      if (machines.machine !== focusedMachine) { engine.focus(machines.machine); focusedMachine = machines.machine; }
      updateMachineControls?.();
    }
    connections.tick();
    const view = connections.view(inspector.view(source.view()));
    const work = (view as import('./data/view').LiveDeckView).work;
    cv.dataset.workId = work?.id ?? '';
    cv.dataset.workStop = work?.stop ?? '';
    cv.dataset.workMoving = String(!!(view as import('./data/view').LiveDeckView).followItem);
    engine.frame(view, dt);
    card.show(view.card);
    accessibility.update(view.card, view.caption);
    if (view.caption !== caption) caption = view.caption;
    toast.classList.toggle("on", !!caption && !view.card); // the card owns the bottom of the screen
    if (!document.body.dataset.deckReady) document.body.dataset.deckReady = "1";
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
})();
