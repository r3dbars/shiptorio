import { createAway } from "./data/away";
import { createConnections } from "./data/connections";
import "./deck.css";
import { SPRITES, createBus, type ArtLoader, type CardView, type CityView, type CityZoom, type DeckBus, type DeckView, type StopId, type AttachJuice, type CreateLayer, type CreateShippy, type DeckLayer, type DeckSource, type MountCard } from "./contract";
import { cityLabel, manualCity, nextZoom, zoomLabel, type CityModule } from "./city";
import { createArt } from "./engine/art";
import { pixelOn } from "../flags";
import { createDemo, createOrbDemo, createLaunchDemo } from "./engine/demo";
import { fallbackShippy } from "./engine/fallbacks";
import { createShippyRehearsal } from "./shippy/rehearsal";
import { createWatchSource, isWatchMode } from "./data/watch";
import { createMachineRehearsal, mountMachineControls } from "./stations/rehearsal";
import { createMachineInteraction } from "./stations/inspector";
import { createWhatIsState, mountWhatIs } from "./stations/whatis";
import { createFirstVisitDemo } from "./stations/first-visit";
import { createConveyorDemo } from "./engine/conveyor-demo";
import { createPayoff } from "./payoff";
import { createFirstRun } from "./data/firstrun";
import { createTour } from "./story/tour";
import { shipFeel } from "./story/ship";
import { askPassword } from "./password";
import type { AttentionView } from "./stations/attention";

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
    } else if (e.key === "Enter" && !e.repeat && target && face.contains(target) && !target.closest("button,a")) {
      // Only when the card has focus: a stray Enter elsewhere must not start a Codex build.
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

/** Copy text that may still be on its way. A ClipboardItem holding a promise keeps the tap's permission
 * (Safari drops it after an await); browsers without one copy once the text arrives. */
export function copyText(text: string | Promise<string>): Promise<void> {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write)
    return navigator.clipboard.write([new ClipboardItem({ "text/plain": Promise.resolve(text).then(t => new Blob([t], { type: "text/plain" })) })]);
  return Promise.resolve(text).then(t => navigator.clipboard.writeText(t));
}

/** Staging only: ?fresh=1 forgets this browser and signs out, so the whole first run plays again from the story.
 *  For Justin's recording takes (2026-10-29). Never on shiptorio.com, and there is no button for it. */
const FRESH_HOSTS = ["shiptorio.dev", "www.shiptorio.dev", "localhost", "127.0.0.1"];
export async function freshStart(loc: Pick<Location, "search" | "hostname" | "pathname" | "replace"> = location,
  storage: Storage = localStorage, session: Storage = sessionStorage, request: typeof fetch = fetch): Promise<boolean> {
  const q = new URLSearchParams(loc.search);
  if (q.get("fresh") !== "1" || !FRESH_HOSTS.includes(loc.hostname)) return false;
  try {
    for (const key of Object.keys(storage)) if (key.startsWith("shiptorio")) storage.removeItem(key);
    session.clear();
  } catch { /* storage off: nothing to forget */ }
  await request("/auth/logout", { redirect: "manual", cache: "no-store" }).catch(() => undefined);
  q.delete("fresh"); q.set("source", "live");
  loc.replace(`${loc.pathname}?${q}`);
  return true;
}

/** What the pixel deck's first frame draws from pictures; everything else is code. web/deck.html preloads these by
 *  URL (web/test/deck2d-first-paint.test.ts keeps the two lists equal). sky/clouds come pre-dimmed (engine dimArt). */
export const FIRST_FRAME_ART = ["sky-dim", "clouds-dim", ...SPRITES.rocket, "plate"] as const;

/** A requested live URL is not proof that this browser is signed in. */
export async function deckSignedIn(request: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await request("/api/me", { cache: "no-store", signal: AbortSignal.timeout(2000) });
    if (!response.ok) return false;
    const account = await response.json();
    return account.guest !== true && typeof account.login === "string" && account.login.length > 0;
  } catch { return false; }
}

/** Tapping Repo or the boilers opens setup only on a signed-in live repo. There are no separate setup buttons. */
export function setupFromStations(search: string, signedIn: boolean): boolean {
  const q = new URLSearchParams(search), repo = q.get("repo") ?? "";
  return signedIn && q.get("source") === "live" && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)
    && !repo.split("/").some(part => part === "." || part === "..");
}

/** One question at a time: while a card asks, only its station glows. Everything else stays quiet background. */
export function oneAsk<V extends DeckView>(view: V): V {
  const card = view.card, attention = (view as AttentionView).attention;
  if (!card || !attention?.length || attention.length === 1 && attention[0] === card.stop) return view;
  return { ...view, attention: [card.stop] };
}

/** Finish the sample loop with the existing connection card, not a second front door.
 *  ask: the story's own "Want to create your own factory?" card shows first, and only its yes opens sign-in
 *  (the guest tour: the password comes up there, never before), straight on to the password or GitHub with no second
 *  card. Closing sign-in brings that card back.
 *  ending(): the story's own last card (the city reveal's "Start with your repo.") while the connection card is up in its
 *  place: dressSignIn lends the words to the sign-in card, so Yes still runs today's sign-in and Replay still replays. */
export function storyBeforeSignIn(story: DeckSource, connections: { open(target: "repo"): void; card(): CardView | null; answer?(id: string, yes: boolean): unknown }, opts: { ask?: boolean } = {}): DeckSource & { ending(): CardView | null } {
  let finished = false, replay = 0, asks = 0, asked = false, pressed: string | null = null, ending: CardView | null = null;
  const askId = () => `story-connect:ask-${asks}`; // fresh each time it shows, so the card renders it again
  const originalId = (id: string) => !replay ? id : id.endsWith(`:replay-${replay}`) ? id.slice(0, -`:replay-${replay}`.length) : null;
  return { ...story, approve(id) { if (opts.ask && id === askId()) { asked = true; return; } const original = originalId(id); if (original) story.approve(original); },
    later(id) { if (opts.ask && id === askId()) { asks++; story.later("story-connect"); return; } const original = originalId(id); if (original) story.later(original); }, ending: () => (finished ? ending : null), view() {
    const view = story.view();
    if (view.card?.id !== "story-connect") return replay && view.card ? { ...view, card: { ...view.card, id: `${view.card.id}:replay-${replay}` } } : view;
    if (opts.ask && !asked) return { ...view, card: { ...view.card, id: askId() } };
    if (!finished) { finished = true; connections.open("repo"); }
    else if (opts.ask && connections.answer && connections.card()?.yes === "Sign in" && pressed !== `${asks}`) {
      pressed = `${asks}`; void connections.answer(connections.card()!.id, true); // "Build mine" was the press
    }
    else if (!connections.card() && opts.ask) { finished = false; asked = false; asks++; return { ...view, card: { ...view.card, id: askId() } }; }
    else if (!connections.card()) {
      finished = false; replay++; ending = null;
      story.later("story-connect"); // Close replays with fresh ids, so the renderer can show the same decisions again.
      return story.view();
    }
    ending = view.card;
    return { ...view, card: null };
  } };
}

/** The reveal's last beat (city beat "card"): the sign-in card says what the story says ("Start with your repo.",
 *  "Sign in with GitHub", "Replay") and is a setup card. Same id, so Yes is still the existing sign-in and No still closes it.
 *  The card is dressed while it asks (yes "Sign in") and also while it waits for the answer (yes "Please wait…", titled
 *  "Finding your repositories…"), so a slow /api/me never shows the player a different, shorter card for a moment. */
export function dressSignIn(card: CardView | null, ending: CardView | null, city: CityView | undefined): CardView | null {
  if (!card || !ending || city?.beat !== "card") return card;
  if (!card.id.startsWith("connection-") || (card.yes !== "Sign in" && card.yes !== "Please wait…")) return card;
  return { ...card, title: ending.title, line: ending.line, yes: ending.yes, no: ending.no, setup: true };
}

/** The Zoom button steps aside while a card asks, while Shippy's tour talks, and for the story's whole city reveal: from the hero
 *  rocket (reveal t = 0, when the story's view has no city yet) through the sign-in card. Replay brings it back. */
export function zoomHidden(view: Pick<DeckView, "card">, storyCity: CityView | undefined, storyRun: { phase(): string } | null, firstRun: { playing(): boolean } | null): boolean {
  return !!view.card || !!storyCity?.beat || storyRun?.phase() === "reveal" || storyRun?.phase() === "end" || !!firstRun?.playing();
}

// The 2D deck page (web/deck.html). Wires the engine to a source, the card, Shippy and juice.
if (typeof document !== "undefined" && document.getElementById("world")) void (async () => {
  if (await freshStart()) return;
// Each module lives in its own folder and is picked up here when it exists, so threads can land independently.
type Mod = Record<string, unknown>;
// Each folder's entry: index.ts, or the one file named after the folder's job (card/card.ts, data/source.ts).
const mods = import.meta.glob<Mod>(["./{story,data,shippy,card,juice,grow,build,launch,props,city}/index.ts", "./card/card.ts", "./data/source.ts", "./shippy/shippy.ts", "./story/story.ts"]);
const load = async (folder: string, name: string) => {
  for (const [path, get] of Object.entries(mods)) if (path.startsWith(`./${folder}/`)) { const m = await get(); if (m[name]) return m; }
  return null;
};

const params = new URLSearchParams(location.search);
const speed = Math.max(0.1, Math.min(8, Number(params.get("speed")) || 1));
const seed = Number(params.get("seed")) || 0;

  // First paint is a stranger's first impression (Justin 2026-10-29: "never show a blank"), so everything the first
  // frame needs starts at once: its pictures, every module, and the sign-in check, instead of one after another.
  // The pixel deck draws stations, Shippy, crates and the card in code, so it waits only for the pictures it shows
  // (deck.html preloads the same ones). Station pictures (build/ uses them for the build-in) load right after.
  const pixel = pixelOn();
  const art = createArt(pixel ? FIRST_FRAME_ART : Object.values(SPRITES).flat());
  const want = params.get("source");
  const [{ createEngine }, deckSound, [story, data, shippyMod, cardMod, juiceMod], layerMods, signedIn] = await Promise.all([
    import("./engine/engine"), import("./sound"),
    Promise.all([load("story", "createStory"), load("data", "createLiveSource"), load("shippy", "createShippy"), load("card", "mountCard"), load("juice", "attachJuice")]),
    Promise.all(["grow", "build", "launch", "juice", "props"].map(f => load(f, "createLayer"))),
    want === "live" ? deckSignedIn() : false]);
  const bus = createBus();
  const setupReachable = setupFromStations(location.search, signedIn);

  const connections = createConnections({
    repo: signedIn ? params.get("repo") || undefined : undefined, origin: location.origin, path: location.pathname + location.search,
    navigate: url => { location.href = url; }, copy: copyText,
    askPassword: next => askPassword(document, next, url => { location.href = url; }),
    onStart: id => (source as DeckSource & { focusItem?: (id: string) => void }).focusItem?.(id),
  });
  let source: DeckSource;
  let storyRun: { phase(): string } | null = null; // the deck page's story: the Zoom button hides during its reveal
  let storyEnding: (() => CardView | null) | null = null; // the full story's last card, lent to the sign-in card (dressSignIn)
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
  else if ((want === "replay" || want === "sim" || want === "live" && signedIn && params.has("repo")) && data?.createLiveSource) source = await (data.createLiveSource as (cfg: undefined, opts: { onPower: () => void }) => Promise<DeckSource> | DeckSource)(undefined, { onPower: () => connections.open("power") });
  else if (want === "live" && signedIn) {
    const backdrop = createDemo().view();
    // Belief before setup: one sample crate waits at Review, so the bottleneck is visible before anything is connected.
    // It's plainly a sample (no number, no card of its own) and nothing here can start real work.
    source = { view: () => ({ ...backdrop, stops: backdrop.stops.map(stop => ({ ...stop, built: true, state: "idle", automated: false,
        items: stop.id === "review" ? [{ id: "sample-waiting", title: "Sample work", look: "plain" as const }] : [] })),
      attention: ["review"], jam: null, card: null, shipped: 0, caption: "Sample: this crate waits on your call. Connect your repo to run yours.", shippy: { at: "review", pose: "inspect" } }),
      approve() {}, later() {} };
  }
  else if (want !== "demo" && story?.createStory) {
    // A guest at the live front door meets Shippy: a small deck, the story told in the card at their pace, each
    // station built and named, then one fix shipped. /deck.html keeps the jam-and-swipe story for the video, which ends
    // on the city reveal (?reveal=1 starts there, for shots and recording takes), then the same sign-in card.
    if (want === "live") source = storyBeforeSignIn(shipFeel(createTour(), bus), connections, { ask: true });
    else {
      const run = (story.createStory as (o: { seed: number; speed: number; reducedMotion?: boolean; startAt?: "reveal" }) => DeckSource & { phase(): string })({
        seed, speed, reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches, startAt: params.get("reveal") === "1" ? "reveal" : undefined });
      storyRun = run;
      const wrapped = storyBeforeSignIn(run, connections);
      storyEnding = wrapped.ending;
      source = wrapped;
    }
  }
  else source = createDemo();
  const guestTour = want === "live" && !signedIn;

  const liveState = (source as DeckSource & { state?: () => import("@shiptorio/shared").FactoryState | null }).state;
  // Live only; ?source=sim&away=5h or ?source=replay&away=5h shows it for rehearsals and the video.
  const away = (want === "live" && params.has("repo") || (want === "replay" || want === "sim") && params.has("away")) && liveState ? createAway({ scope: params.get("repo") ?? want, search: location.search, state: liveState }) : null;

  // After a ship: the rocket goes, then one calm "Shipped. That's 3 today." before the next card (payoff.ts).
  // A guest on /deck?source=live plays the story first: its crates are not real ships, so they neither
  // get a beat each nor go into the saved "today" count a signed-in player sees later.
  const live = !!liveState && (want === "live" || want === "replay");
  const payoff = createPayoff({ every: live, phase: (source as DeckSource & { phase?: () => string }).phase,
    // one count per factory: the saved ship total only means something for the repo it came from
    store: want === "live" && liveState ? { get: k => localStorage.getItem(`${k}:${params.get("repo")}`), set: (k, v) => localStorage.setItem(`${k}:${params.get("repo")}`, v) } : null });
  bus.on(event => {
    payoff.event(event);
    if (event.type === 'crate-arrive') (source as DeckSource & { arrive?: (id: string, stop: StopId) => void }).arrive?.(event.id, event.stop);
  });

  const shippy = ((shippyMod?.createShippy as CreateShippy | undefined) ?? fallbackShippy)(art);
  const cv = document.getElementById("world") as HTMLCanvasElement;
  const layers: DeckLayer[] = [];
  for (const m of layerMods) if (m) layers.push((m.createLayer as CreateLayer)(art, bus));
  const cityMod = await load("city", "createCity"); // scenery only: nothing in it reads an account, an issue or a service
  const city = cityMod ? (cityMod.createCity as (art: ArtLoader, bus: DeckBus, host: HTMLElement) => CityModule)(art, bus, document.body) : undefined;
  const inspector = createMachineInteraction(machines ? id => { if (id === machines.machine) machines.setMode("working"); } : undefined);
  if (want === "live" && signedIn && !params.has("repo")) connections.open("repo");
  // The live first run after sign-in (the guest already met Shippy in the tour): picking a repo and connecting Codex
  // each build the next stations, one at a time, with one plain line each.
  // New accounts only (no repo yet, or the onboarding hand-off); ?firstrun=1 replays it.
  const repo = signedIn ? params.get("repo") ?? "" : "";
  if (params.get("firstrun") === "1") try { for (const k of ["", repo]) localStorage.removeItem(`shiptorio:firstrun:${k}`); } catch { /* private mode */ }
  const firstRun = want === "live" && (!repo || params.get("onboard") === "codex" || params.has("firstrun")) ? createFirstRun({
    key: repo, store: (() => { try { return localStorage; } catch { return undefined; } })(),
    stage: () => !signedIn ? null : !repo ? "hello" : connections.engineReady() ? "engine" : "repo",
    established: () => !!(source.view() as import('./data/view').LiveDeckView).work,
  }) : null;
  // Tap a station: brass corners + a small "what is this" note in Shippy's words (stations/whatis.ts). Ignored while
  // Shippy's tour talks, so a tap never fights the story card. The machine rehearsal keeps its inspector card.
  const whatis = createWhatIsState();
  let tourTalking = false;
  const note = mountWhatIs(document, () => whatis.close());
  document.addEventListener("pointerdown", e => { const t = e.target as HTMLElement; if (t !== cv && !t.closest?.(".whatis")) whatis.close(); });
  const engine = createEngine(cv, art, bus, shippy, layers, { city, onPowerSelect: () => {
    if (setupReachable) connections.open("power"); else whatis.tap("engine", tourTalking);
  }, onTapEmpty: () => whatis.close(), onMachineSelect: id => {
    deckSound.playTap(id);
    if (id === "repo" && setupReachable) { connections.open("repo"); return; }
    if (machines) { machines.cycling = false; inspector.select(id); return; }
    (source as DeckSource & { selectStop?: (stop: typeof id) => void }).selectStop?.(id);
    whatis.tap(id, tourTalking);
  } });
  if (import.meta.env.DEV) (window as unknown as { deckAnchor: typeof engine.anchor }).deckAnchor = id => engine.anchor(id); // shot scripts tap stations
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

  const mountCard = cardMod?.mountCard as MountCard; // the one card (card/card.ts); there is no second style to fall back to
  const card = mountCard(document.getElementById("card-host")!, {
    onApprove(id) { if (away?.answer(id)) return; if (id.startsWith("connection-")) { void connections.answer(id, true); return; } bus.emit({ type: "approve", cardId: id }); if (!inspector.answer(id, true)) source.approve(id); },
    onLater(id) { if (away?.answer(id)) return; if (id.startsWith("connection-")) { void connections.answer(id, false); return; } bus.emit({ type: "later", cardId: id }); if (!inspector.answer(id, false)) source.later(id); },
  });
  // The card's font is fetched the first time a card draws. On a ?reveal=1 page that is the sign-in card at the end of the reveal:
  // it drew once in the fallback font (a 294 px card), then swapped to Pixelify Sans (225 px) a frame later. Ask for it now.
  void document.fonts?.load('700 16px "Pixelify Sans"')?.catch(() => undefined);
  (juiceMod?.attachJuice as AttachJuice | undefined)?.(bus, document.body, (s) => engine.where(s));
  deckSound.attachSound(bus, () => source.view());

  const zoom = document.getElementById("zoom") as HTMLButtonElement;
  // Zoom out cycles station -> line -> city -> station in every source (story, sim, live, replay). The story takes the
  // camera itself during its city reveal (view.city), and the button steps aside until the card comes.
  let manual: CityZoom = "station", asking = false, painted = "";
  const paintZoom = (hidden: boolean) => {
    const label = zoomLabel(manual), key = `${hidden}|${label}`;
    if (key === painted) return;
    painted = key; zoom.hidden = hidden; zoom.textContent = label; zoom.setAttribute("aria-label", label);
  };
  zoom.addEventListener("click", () => { manual = nextZoom(manual, pixelOn()); paintZoom(zoom.hidden); });
  paintZoom(false);

  const toast = document.getElementById("toast")!;
  const accessibility = wireDeckAccessibility(cv, document.getElementById("card-host")!, toast);
  let caption: string | null = null;

  await art.ready();
  if (pixel) for (const name of SPRITES.stations) if (name.endsWith("-idle")) art.get(name);
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
    const base = inspector.view(source.view());
    firstRun?.step(dt);
    const asked = connections.view(away ? away.view(base) : base), ending = storyEnding?.() ?? null;
    const shown = payoff.view(ending && asked.card ? { ...asked, card: dressSignIn(asked.card, ending, asked.city) } : asked, dt);
    const underlying = oneAsk(firstRun ? firstRun.view(shown) : shown);
    const storyCity = underlying.city; // only the story sets it: the reveal owns the camera
    if (storyCity || storyRun?.phase() === "reveal") manual = "station"; // the reveal owns the camera from the rocket (beat 0: the launch shot) to the card
    if (!!underlying.card !== asking) { asking = !!underlying.card; if (asking) manual = "station"; } // a new question brings the camera back to it
    const view = !storyCity && manual !== "station"
      ? { ...underlying, city: manualCity(manual, cityLabel(location.search)), caption: manual === "city" ? null : underlying.caption } : underlying;
    paintZoom(zoomHidden(view, storyCity, storyRun, firstRun) || guestTour); // the tour frames every shot itself
    document.body.classList.toggle("first-run", !!firstRun?.playing());
    const work = (view as import('./data/view').LiveDeckView).work;
    cv.dataset.workId = work?.id ?? '';
    cv.dataset.workStop = work?.stop ?? '';
    cv.dataset.workMoving = String(!!(view as import('./data/view').LiveDeckView).followItem);
    cv.dataset.allClear = String(!!(view as import('./data/view').LiveDeckView).allClear);
    tourTalking = !!firstRun?.playing() || !!view.card?.shippy;
    if (tourTalking) whatis.close();
    engine.frame(view, dt);
    const anchor = whatis.open && engine.anchor(whatis.open);
    if (whatis.open && !anchor) whatis.close();
    engine.pick(whatis.open);
    note.show(whatis.open, anchor || null);
    // No "All caught up" while a script owns the screen: the first run, or the guest tour building between Shippy's cards.
    card.show(view.card, { quiet: !!firstRun?.playing() || guestTour });
    accessibility.update(view.card, view.caption);
    if (view.caption !== caption) caption = view.caption;
    toast.classList.toggle("on", !!caption && !view.card); // the card owns the bottom of the screen
    if (!document.body.dataset.deckReady) document.body.dataset.deckReady = "1";
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
})();
