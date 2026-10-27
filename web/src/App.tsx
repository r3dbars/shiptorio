import { QuotaCard } from "./ui/QuotaCard";
import { SparkSpendChip } from "./ui/SparkSpend";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { Ref } from "react";

import { SANDBOX_REPO, savePref, serverUp, signInUrl, whoAmI, isGuestPlay } from "./account";
import { attentionOf, type FactoryState, type Item, type PowerSource, type WebToServer } from "@shiptorio/shared";
import { FactoryMap } from "./map/FactoryMap";
import type { Ping } from "./map/scene";
import { css, KIND_COLOR } from "./map/palette";
import { readConfig } from "./source";
import { SCENARIOS } from "./sim/engine";
import { useFactory } from "./store";
import { NextMove, type NeedRow } from "./ui/NextMove";
import { FloorCard, Ticker, type Count } from "./ui/Hud";
import { SupportPanel, supportReviewTarget } from "./ui/SupportPanel";
import { whatsNext, type NudgeAction } from "./ui/whatsNext";
import { StationPanel } from "./ui/StationPanel";
import { SoundControl } from "./ui/SoundControl";
import { ActivityTray } from "./ui/ActivityTray";
import { Icon } from "./ui/icons";
import { Coach, lessonFocus, useTutorial } from "./ui/tutorial";
import { FieldGuide, GUIDE_TOTAL, guideMet } from "./ui/FieldGuide";
import { GEO_EXPLAINER, notePowerJobs, powerLedger } from "./ui/powerLedger";
import { ConnectSource, MakeItYours } from "./ui/MakeItYours";
import { useFactorySound } from "./sound/useFactorySound";
import { sound } from "./sound/engine";
import { ShipCelebration } from "./ui/ShipCelebration";
import { introMode, useIntroTour } from "./ui/IntroTour";
import type { SourceConfig } from "./source";
import { Research, researchReady } from "./ui/Research";
import { AchievementToast, AchievementsSheet, useAchievements, type ProgressLink } from "./ui/Achievements";
import { checkStationId } from "@shiptorio/shared";
import { cosmeticsOf, DayTally, DeckTrend, MorningBrief, ProgressChip, ProgressSheet, progressOn, progressProfile, useBottleneckNudge, useBrief, useProgress } from "./ui/Progress";
import { FactoryText, factorySummary } from "./ui/FactoryText";
import { captions, SoundCaptions, useCaptionsOn } from "./ui/SoundCaptions";

import { EmpireSheet, IslandChip, satellitesFor, useEmpire } from "./ui/Empire";
import { ACTIVITY, HUD, LEVEL_LABEL, LINE, MACHINE_NAME, MAP, PLAY, POWER, SETTINGS, STATE_LABEL, STATS, WORDS } from "./copy";
import { RunnerConnection } from "./ui/RunnerConnection";
import { AttentionTray } from "./ui/Attention";
import { attentionOn } from "./flags";
import { useComeback } from "./ui/Comeback";

const POWER_COLOR: Record<PowerSource["kind"], string> = { steam: "var(--iron-amber)", solar: "var(--iron-ok)", geothermal: "var(--iron-furnace)" };

const ON_LINE = new Set<Item["state"]>(["working", "inspecting", "rejected", "passed", "on_pad"]);

const codePath = (district: string) => (district === "/" ? "/" : `/${district}`);

// Subscriptions you can plug in. Each sign-in adds a solar plant and assemblers (docs/PRODUCT.md).
const SLOTS = POWER.slots;

// Two worlds on one map (docs/PRODUCT.md, Onboarding): Check in is "just show me what's stuck", Build is
// "let me make the factory mine". Everyone starts on the map; the toggle switches any time.
type World = "checkin" | "build";
type Sheet = "line" | "power" | "guide" | "yours" | "thinks" | "research" | "progress" | "empire" | "achievements" | "status";
const WORLD_KEY = "shiptorio:world";
const TOOLS_AT = 5; // rockets before Make it yours and Place show up on their own
const GUIDE_SEEN_KEY = "shiptorio:guide-seen";
function readWorld(): World | null {
  try {
    const w = localStorage.getItem(WORLD_KEY);
    return w === "checkin" || w === "build" ? w : null;
  } catch {
    return null;
  }
}

function fmtLead(ms?: number) {
  if (ms === undefined) return "–";
  const m = Math.round(ms / 60_000);
  return m < 90 ? `${m}m` : `${Math.round(m / 60)}h`;
}

// The HUD's plates measure themselves into CSS variables on the floor, so the plates around them stack without
// overlapping (the mockup's layout(): on a phone the needs tray and the ticker sit right above the controls).
function useHeightVars() {
  const host = useRef<HTMLElement | null>(null);
  const refs = useMemo(() => {
    const live = new Map<string, ResizeObserver>();
    const make = (name: string): Ref<HTMLElement> => (el) => {
      live.get(name)?.disconnect();
      live.delete(name);
      const set = (v: string) => host.current?.style.setProperty(name, v);
      if (!el) return set("0px");
      if (typeof ResizeObserver === "undefined") return;
      const ro = new ResizeObserver(() => set(`${el.offsetHeight}px`));
      ro.observe(el);
      live.set(name, ro);
    };
    return { top: make("--top-h"), ctrl: make("--ctrl-h"), needs: make("--needs-h") };
  }, []);
  return { host, refs };
}

// Next free spot for a new assembler, stacked beside the existing ones.
function buildSlot(state: FactoryState) {
  const asm = state.machines.find((m) => m.type === "assembler");
  const x = asm?.x ?? 0;
  for (const y of [-2, 2, -4, 4, -6, 6]) {
    if (!state.machines.some((m) => Math.abs(m.x - x) < 2 && Math.abs(m.y - y) < 2)) return { x, y };
  }
  return null;
}

// config: the welcome tour runs the App on its own sim (ui/Onboarding.tsx). onIntroDone: where the tour's last button goes.
// Sheets nobody needs on the first screen load on their own; they're fetched once the browser is idle.
const loadCheckIn = () => import("./ui/CheckIn");
const loadHowItThinks = () => import("./ui/HowItThinks");
const CheckIn = lazy(() => loadCheckIn().then((m) => ({ default: m.CheckIn })));
const HowItThinks = lazy(() => loadHowItThinks().then((m) => ({ default: m.HowItThinks })));
const whenIdle = (f: () => void) => ("requestIdleCallback" in window ? requestIdleCallback(f, { timeout: 4000 }) : setTimeout(f, 2500));
whenIdle(() => void (loadCheckIn(), loadHowItThinks()));

export function App({ config, onIntroDone, login }: { config?: SourceConfig; onIntroDone?: () => void; login?: string | null } = {}) {
  const cfg = useMemo(() => config ?? readConfig(), [config]);
  const { state, log, status, send: sendRaw } = useFactory(cfg);
  const empire = useEmpire(cfg, state);
  const satellites = useMemo(() => (empire.on ? satellitesFor(empire) : []), [empire.on, JSON.stringify(empire.others), empire.here?.repo, empire.here?.waiting, empire.here?.bottleneck?.wip]);
  const intro = introMode(cfg);
  // Play first, sign in later: the sim on a real server is the demo shop new players start in, and signing
  // in with GitHub is the unlock that brings their own repo (the floor card's chip, then a card after a rocket).
  const [server, setServer] = useState(false);
  // only a signed-out guest in the demo shop syncs progress to the guest session; a signed-in player's sim
  // play, and every other scenario, stays in this browser so it never lands on the real account
  const [guest, setGuest] = useState(false);
  const demoShop = cfg.kind === "sim" && !intro && cfg.repo === SANDBOX_REPO;
  useEffect(() => {
    if (cfg.kind === "sim" && !intro) void serverUp().then(setServer);
    if (demoShop) void serverUp().then((up) => (up ? whoAmI() : null)).then((me) => setGuest(isGuestPlay(cfg.repo, me)));
  }, [cfg.kind, intro, demoShop]);
  const sandbox = server && cfg.kind === "sim" && !intro;
  const achLink = useRef<ProgressLink>({ streak: 0 }); // progression is set up further down
  // docs/ATTENTION.md: with the attention flag, a badge only toasts right after your own tap; the rest wait in the sheet.
  const lastTap = useRef(0);
  const ach = useAchievements(state, cfg.kind === "live", intro || (attentionOn() && Date.now() - lastTap.current > 10_000), sendRaw, achLink, progressProfile(cfg.kind, login));
  const send = ach.send; // achievements never treat an attempted send as an accepted move
  // played straight from ?scenario=intro, the tour ends at the first run, the way onboarding would
  const tourDone = onIntroDone ?? (() => (location.href = "?source=sim&scenario=first-run"));
  const tourly = useIntroTour(intro ? state : null, send, tourDone, login);
  const hv = useHeightVars();
  // First run teaches one concept at a time and hides the HUD it hasn't introduced yet. ?tour=0 turns it off.
  const tour = useTutorial(state, cfg.kind === "sim" && cfg.scenario === "first-run" && new URLSearchParams(location.search).get("tour") !== "0");
  const { show } = tour;
  // Coming back after hours away: a few seconds of what really shipped meanwhile, then the launch waiting on you.
  const [reduced] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  const back = useComeback(state, cfg.kind === "sim" ? `sim:${cfg.scenario}` : cfg.repo ?? "live", !intro && !tour.on, reduced);
  // which plant built each item this session, for the power sheet's job counts
  const powerJobs = useRef(new Map<string, string>());
  if (state) powerJobs.current = notePowerJobs(powerJobs.current, state);
  const plants = state ? powerLedger(state, powerJobs.current) : [];
  const [panel, setPanel] = useState<string | null>(null);
  // Everyone lands in Build, the full map. The first run used to ask Check in or Build before the player had
  // seen a machine, and both led to the same starter-factory card (new-player walkthrough, 2026-10-27).
  const [world, setWorldState] = useState<World>(() => (intro ? "build" : (readWorld() ?? "build")));
  const setWorld = (w: World) => {
    setWorldState(w);
    try {
      localStorage.setItem(WORLD_KEY, w);
    } catch {
      // remembered for this visit only
    }
  };
  // ?checkin opens the deck on load, the way a phone check-in would.
  const [checkin, setCheckin] = useState(() => new URLSearchParams(location.search).has("checkin") || cfg.scenario === "checkin");
  const [focus, setFocus] = useState<string | null>(null); // what the check-in wants the map to zoom to
  // the map's pick keys: a station id as-is, a folder as d:<name>, any other machine as m:<id>
  const pickKey = (id: string) =>
    state?.stations?.some((st) => st.id === id) || id === "rework" || id.includes(":") ? id : state?.districts.some((d) => d.name === id) ? `d:${id}` : `m:${id}`;
  const focusKey = focus && pickKey(focus);
  const parkKey = back.park?.focus ? pickKey(back.park.focus) : null; // r4-pull: the comeback lands on the launch waiting
  const deck = state?.deck ?? (state?.move ? [state.move] : []);
  const [supportReview, setSupportReview] = useState<string | null>(null);
  const sendCard = (message: WebToServer) => {
    lastTap.current = Date.now();
    const ticketId = supportReviewTarget(message, deck);
    if (ticketId) { setSupportReview(ticketId); setPanel("m:ore-inbox"); setCheckin(false); return; }
    send(message);
  };
  useFactorySound(state, focusKey ?? panel, attentionOn()); // whatever the camera is in on, you hear up close
  // Progression: level, streak, unlocks, morning brief. ?progress=1 until it's on by default.
  const [progressing] = useState(() => !intro && progressOn());
  const profile = progressProfile(cfg.kind, login, guest);
  const prog = useProgress(state, profile, cfg.kind === "sim" ? `sim:${cfg.scenario}` : cfg.repo ?? "live", progressing && !tour.on);
  const brief = useBrief(progressing && !tour.on, !!state && state.districts.length > 0, profile);
  const [calm] = useState(attentionOn); // docs/ATTENTION.md: on by default, ?attention=0 for the old Next move card
  const nudge = useBottleneckNudge(deck, progressing, calm);
  achLink.current = { streak: prog.p.best, onUnlock: (a) => prog.bonus(a.xp, a.name), hold: !!tour.lesson }; // achievements pay XP into progression; toasts wait out the tour coach card
  // today's log remembers the deck you walked in to (the morning number the trend is made of)
  useEffect(() => {
    if (progressing && state) prog.open(deck.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressing, !!state, deck.length > 0]);
  const [sheet, setSheet] = useState<Sheet | null>(() => (new URLSearchParams(location.search).has("thinks") ? "thinks" : null));

  // the comeback parks on a waiting launch with its card up (the tray's), not under the check-in deck; opening
  // anything else lets the camera go
  useEffect(() => {
    if (back.park) setCheckin(false);
  }, [back.park?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (panel || checkin || sheet) back.release();
  }, [panel, checkin, sheet]); // eslint-disable-line react-hooks/exhaustive-deps

  // after research, fly to the new station as soon as it's on the line
  const [landing, setLanding] = useState<string | null>(null);
  useEffect(() => {
    if (landing && state?.stations?.some((st) => st.id === landing)) {
      setPanel(landing);
      setLanding(null);
    }
  }, [landing, state]);
  const [source, setSource] = useState<string | null>(null); // an empty mine you tapped
  // map picks: an empty mine opens its connect sheet, anything else its panel
  const pickOnMap = (k: string | null) => {
    if (intro) return tourly.pick(k);
    if (k?.startsWith("island:")) return void (location.href = empire.hrefFor(k.slice(7)));
    if (k?.startsWith("src:")) {
      setSource(k.slice(4));
      setCheckin(false);
    } else setPanel(k);
  };
  const met = guideMet(state, tour.learned);
  // the guide button glows when something new lands; remembered so a returning player isn't told about all of it again
  const [seenGuide, setSeenGuideState] = useState(() => {
    try {
      return Number(localStorage.getItem(GUIDE_SEEN_KEY)) || 0;
    } catch {
      return 0;
    }
  });
  const setSeenGuide = (n: number) => {
    setSeenGuideState(n);
    savePref("guideSeen", String(n));
    try {
      localStorage.setItem(GUIDE_SEEN_KEY, String(n));
    } catch {
      // this visit only
    }
  };
  const [tray, setTray] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  // The default screen is the map, one card and two counters (Justin, 2026-10-27: "still a ton of shit just in my
  // face"). Every other tool waits behind one Menu button, and stays out while a sheet or the tray it opened is up.
  const [menu, setMenu] = useState(false);
  const toolsOut = menu || !!sheet || tray;
  const items = state?.items ?? [];
  const pad = items.filter((i) => i.state === "on_pad" || i.state === "passed");
  const inFlight = items.filter((i) => !["on_pad", "passed", "launched"].includes(i.state));
  const metrics = state?.metrics;
  const autonomy = state?.autonomy;
  const permits = autonomy?.districts.filter((d) => d.permit).map((d) => `/${d.district}`) ?? [];
  const shipped = state ? state.science.red + state.science.green + state.science.grey + state.science.blue : 0;
  // The ping: a pulsing dot on the thing that needs you, tagged with the part of the codebase it's about,
  // so players learn what each part of their code does. Tap it for the details panel.
  const ping = useMemo(() => {
    if (!state) return null;
    const move = state.move;
    const station = state.stations?.find((st) => st.id === state.bottleneck?.stationId);
    const item = state.items.find((i) => i.id === move?.itemId) ?? (station && state.items.find((i) => i.machineId === station.machineId && i.state !== "launched"));
    const machine = item?.machineId && state.machines.find((m) => m.id === item.machineId);
    const key = move?.focus ? pickKey(move.focus) : station ? station.id : machine ? pickKey(machine.id) : null;
    if (!key) return null;
    const stage = move?.stage ?? state.bottleneck?.stage;
    const title = item?.state === "rejected" ? MAP.pingSentBack : stage ? MAP.ping[stage] : MAP.pingNeedsYou;
    return { key, title, code: item ? codePath(item.district) : undefined, tone: item?.state === "on_pad" ? ("ok" as const) : ("warn" as const) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const narrow = typeof window !== "undefined" && window.innerWidth <= 560; // phones get fewer tags
  // Quiet tags on every other busy machine, naming the code it's working in, so the whole line reads as your codebase.
  const pings = useMemo(() => {
    if (!state) return [];
    const out: Ping[] = ping ? [ping] : [];
    for (const i of state.items) {
      const word = i.machineId ? MAP.busy[i.state] : undefined;
      const key = i.machineId && pickKey(i.machineId);
      if (!word || !key || out.some((p) => p.key === key)) continue;
      out.push({ key, title: word, code: codePath(i.district), quiet: true });
      if (out.length >= (narrow ? 3 : 5)) break;
    }
    return out;
  }, [state, ping, narrow]);
  // Each thing waiting on you counts once: a PR on the pad that already has its own card isn't counted twice.
  const carded = new Set(deck.map((m) => m.itemId).filter(Boolean));
  const waiting = deck.length + pad.filter((i) => i.state === "on_pad" && !carded.has(i.id)).length;
  // A machine stopped for want of power is already the "plug in power" card, so it isn't a second ask.
  const unpowered = [...deck, state?.move].some((m) => m?.stage === "resources" || m?.stage === "power");
  const blocked = unpowered ? [] : state?.machines.filter((m) => m.state === "blocked") ?? [];

  // The floor card shows two numbers, nothing else: what's waiting on you, and what you've shipped (Justin, 2026-10-27:
  // "show only two counters"). Mined, on line and rework are on the map and in the Line sheet.
  const F = HUD.floor;
  const counts: Count[] = [];
  // Calm: "Waiting on you" counts only what's parked on you (approve + steer), never ideas.
  const needs = calm ? deck.filter((m) => attentionOf(m) !== "suggest").length : waiting + blocked.length;
  if (show("line")) counts.push({ key: "need", label: F.needs, value: needs, tone: "need", title: F.needsTitle });
  if (show("score")) counts.push({ key: "ship", label: F.shipped, value: back.shipped(metrics?.rockets ?? shipped), tone: "ship", title: HUD.shippedTitle });
  // Trust and score live in the Line sheet's header, so the floor card's row stays the mockup's five.
  const extras: Count[] = [];
  if (autonomy?.launches) {
    // Live: how much of the shipping runs itself. Shows up after the first rocket.
    extras.push({
      key: "auto",
      label: autonomy.level === "advisor" ? HUD.automated : `${HUD.automated} · ${LEVEL_LABEL[autonomy.level]}`,
      value: `${Math.round((autonomy.automated ?? 0) * 100)}%`,
      tone: "aether",
      title: [permits.length ? HUD.automatedOn(permits.join(", ")) : HUD.automatedNone, autonomy.next ? HUD.trustTo(autonomy.next.have, autonomy.next.need, autonomy.next.label, LEVEL_LABEL[autonomy.next.level]) : ""].join(" ").trim(),
    });
  } else if (show("autonomy") && autonomy) {
    extras.push({
      key: "auto",
      label: autonomy.next ? HUD.toLevel(LEVEL_LABEL[autonomy.next.level]) : HUD.trust,
      value: autonomy.next ? `${autonomy.next.have}/${autonomy.next.need}` : LEVEL_LABEL[autonomy.level],
      tone: "aether",
      title: autonomy.next ? HUD.trustTo(autonomy.next.have, autonomy.next.need, autonomy.next.label, LEVEL_LABEL[autonomy.next.level]) : autonomy.level === "advisor" ? HUD.trustAdvisor : HUD.trustTop,
    });
  }
  if (show("score") && metrics) extras.push({ key: "score", label: F.score, value: metrics.shipScore.toLocaleString(), tone: "amber", title: HUD.scoreTitle });

  // The needs-you tray's other rows: the rest of the check-in deck, and any machine that stopped to ask.
  const needRows: NeedRow[] = [];
  if (world !== "checkin" && show("checkin") && deck.length > 1 && !checkin)
    needRows.push({ key: "deck", label: HUD.needs.checkin(deck.length), text: HUD.needs.checkinWhy(deck.length - (state?.move ? 1 : 0)), go: { label: HUD.needs.checkinGo, onClick: () => setCheckin(true), aria: HUD.checkinLabel(deck.length) } });
  for (const m of blocked.slice(0, 2)) {
    const name = MACHINE_NAME[m.type] ?? m.type;
    needRows.push({ key: `m:${m.id}`, label: HUD.needs.blocked(name), text: HUD.needs.blockedWhy, go: { label: HUD.needs.open, onClick: () => setPanel(pickKey(m.id)), aria: `${HUD.needs.open} ${name}` } });
  }

  const launchItem = (item: Item) => {
    sound.play("arm");
    if (cfg.kind === "sim") send({ type: "launch_pr", itemId: item.id });
    else if (item.prUrl) window.open(item.prUrl, "_blank", "noreferrer");
  };
  const launch = () => {
    const next = pad.find((i) => i.state === "on_pad") ?? pad[0];
    if (next) launchItem(next);
  };
  const slot = state ? buildSlot(state) : null;
  // Place shows up when building is what's holding the line up, or once the player has shipped enough to tinker.
  const placeNeeded = show("build") && (state?.bottleneck?.stage === "build" || (metrics?.rockets ?? shipped) >= TOOLS_AT);
  // the planner never codes: a new assembler runs on a subscription you've signed in with
  const plugged = SLOTS.find((sl) => state?.power.some((p) => p.id === `solar-${sl.harness}` && p.online));
  const build = () => {
    if (slot && plugged) send({ type: "place_machine", machineType: "assembler", x: slot.x, y: slot.y, harness: plugged.harness });
  };
  // No card open: always offer a next move, so the factory never goes quiet after a rocket (#105).
  // The first-run coach does its own teaching, so it waits until the coach is done.
  const whatNext = state && !state.move && !tour.lesson ? whatsNext(state, { canPlace: world !== "checkin" && show("build") && !!slot && !!plugged && cfg.kind !== "live", live: cfg.kind === "live", sandbox }) : null;
  const onNudge = (a: NudgeAction) => {
    if (a.do === "launch") {
      const item = state?.items.find((i) => i.id === a.itemId);
      if (item) launchItem(item);
    } else if (a.do === "checkin") setCheckin(true);
    else if (a.do === "station") setPanel(a.id);
    else if (a.do === "research") setSheet("research");
    else if (a.do === "connect") setSource(a.source);
    else if (a.do === "place") build();
    else if (a.do === "signin") location.href = signInUrl();
    else setSheet(a.sheet);
  };
  // the needs tray is up when nothing bigger holds the middle of the screen (the chain of sheets below)
  const trayUp = !(brief.show && progressing && !checkin && !sheet) && !source && !sheet && !checkin;
  const toggleSheet = (s: Sheet) => setSheet((v) => (v === s ? null : s));

  // Keyboard players: whatever opens (a sheet, a station panel, the tray, the deck) takes focus,
  // and focus goes back to what opened it when it closes.
  const opened = tray ? "tray" : panel ? `panel:${panel}` : checkin ? "checkin" : sheet;
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!opened) {
      const back = opener.current;
      opener.current = null;
      // what opened it may be gone (a row in a sheet that became a panel): land on the map instead
      (back?.isConnected ? back : document.querySelector<HTMLElement>("canvas.map"))?.focus({ preventScroll: true });
      return;
    }
    const was = document.activeElement as HTMLElement | null;
    if (!opener.current && was && was !== document.body) opener.current = was;
    const box = document.querySelector<HTMLElement>(".tray, .stationpanel, .checkin, .sheet");
    if (!box || box.contains(document.activeElement)) return;
    const first = box.matches(".checkin") ? box.querySelector<HTMLElement>(".ci-card[tabindex]") : box.querySelector<HTMLElement>("h2, .ptitle");
    if (first) {
      if (!first.hasAttribute("tabindex")) first.tabIndex = -1;
      first.focus({ preventScroll: true });
    }
  }, [opened]);

  // T opens the text view of the factory, C the sound captions.
  // L toggles labels; A and B do what the launch and build buttons say. Ignored while typing.
  const keys = useRef({ launch, build, show, intro });
  keys.current = { launch, build, show, intro };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (keys.current.intro || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "l") setShowLabels((v) => !v);
      else if (k === "t") setSheet((v) => (v === "status" ? null : "status"));
      else if (k === "c") captions.set(!captions.on);
      else if (k === "b" && keys.current.show("launch")) keys.current.launch();
      else if (k === "a" && keys.current.show("build")) keys.current.build();
      else if (k === "escape") {
        setTray(false);
        setSheet(null);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const captionsOn = useCaptionsOn();
  const stats = metrics && (
    <div className="tray-stats">
      <div title={STATS.score.title}>
        <b>{metrics.shipScore.toLocaleString()}</b>{STATS.score.label}
      </div>
      <div title={STATS.users.title}>
        <b>{metrics.usersUnblocked}</b>{STATS.users.label}
      </div>
      <div title={STATS.customers.title}>
        <b>{metrics.customersAnswered}</b>{STATS.customers.label}
      </div>
      <div title={STATS.errors.title}>
        <b>{metrics.bitersKilled}</b>{STATS.errors.label}
      </div>
      <div title={STATS.lead.title}>
        <b>{fmtLead(metrics.leadTimeMs)}</b>{STATS.lead.label}
      </div>
      {show("science") &&
        (["red", "green", "grey", "blue"] as const).map((k) => (
          <div key={k}>
            <b>{state?.science[k] ?? 0}</b>
            {STATS.scienceShipped(STATS.science[k])}
          </div>
        ))}
    </div>
  );

  useEffect(() => {
    if (cfg.kind === "live" && new URLSearchParams(location.search).has("connect")) setSheet("power");
  }, [cfg.kind, cfg.repo]);

  const settings = (
    <>
      <a className="btn" href="/settings">Account &amp; data</a>
      <button type="button" className="credit-btn" onClick={() => { setTray(false); setSheet("thinks"); }}>
        {SETTINGS.howItThinks}
      </button>
      <SoundControl />
      <div className="row2">
        <span>Sound captions (C)</span>
        <button type="button" className="toggle" aria-pressed={captionsOn} onClick={() => captions.set(!captionsOn)}>
          {captionsOn ? "On" : "Off"}
        </button>
      </div>
      {cfg.kind === "live" && <button type="button" className="credit-btn" onClick={() => { setTray(false); setSheet("power"); }}>Connect your machine</button>}
      {show("labels") && (
        <div className="row2">
          <span>{SETTINGS.labels}</span>
          <button type="button" className="toggle" aria-pressed={showLabels} onClick={() => setShowLabels((v) => !v)}>
            {showLabels ? WORDS.on : WORDS.off}
          </button>
        </div>
      )}
      {cfg.kind === "sim" && show("scenarios") && (
        <nav className="scen" aria-label={SETTINGS.scenarios}>
          {Object.keys(SCENARIOS).map((name) => (
            <a key={name} href={`?source=sim&scenario=${name}`} aria-current={name === cfg.scenario ? "page" : undefined}>
              {name}
            </a>
          ))}
          <a href="/art/">{SETTINGS.art}</a>
        </nav>
      )}
    </>
  );

  return (
    <div className={`app${panel ? " picked" : ""}${toolsOut ? " tools-out" : ""}`}>
      <QuotaCard repo={cfg.kind === "live" ? cfg.repo : undefined} onBudget={() => toggleSheet("thinks")} />
      <main className="floor" ref={hv.host as Ref<HTMLElement>}>
        {intro && <h1 className="sr">Shiptorio{state ? `: ${state.repo}` : ""}</h1>}
        <FactoryMap
          state={state}
          onPick={pickOnMap}
          focus={intro ? tourly.cam.focus : (focusKey ?? panel ?? parkKey)}
          wide={intro ? tourly.cam.wide : null}
          lift={intro ? (window.innerWidth <= 760 ? 0.24 : 0.13) : 0}
          showLabels={showLabels}
          teachingKeys={intro ? undefined : lessonFocus(state, tour.lesson?.id)}
          pings={intro ? (tourly.ping ? pings : undefined) : show("line") && !back.holding ? pings : undefined}
          cosmetics={cosmeticsOf(prog.p, progressing)}

          satellites={intro ? undefined : satellites}
          empire={!intro && sheet === "empire"}
          summary={factorySummary(state)}
          lapse={intro ? null : back.lapse}
        />
        <SoundCaptions />
        <ShipCelebration state={state} quiet={intro && tourly.quiet} high={intro} />
        {intro && <div className="tour-vignette" aria-hidden="true" />}
        {intro && tourly.top}
        {intro && tourly.card}
        {!intro && (<>

        <div className="hudtop" ref={hv.refs.top as Ref<HTMLDivElement>}>
          <FloorCard
            counts={counts}
            repo={state?.repo}
            showKey={false}
            extra={(progressing && !tour.on) || empire.on || cfg.kind === "live" || sandbox ? (<>
              {sandbox && (
                <a className="chip play-chip" href={signInUrl()} aria-label={PLAY.chipLabel} title={PLAY.chipLabel}>
                  <span>{PLAY.chip}<small>{PLAY.chipCta}</small></span>
                </a>
              )}
              <SparkSpendChip expanded={sheet === "thinks"} repo={cfg.kind === "live" ? cfg.repo : undefined} onOpen={() => toggleSheet("thinks")} />
              {progressing && !tour.on && <ProgressChip p={prog.p} onOpen={() => toggleSheet("progress")} />}
              {empire.on && <IslandChip e={empire} open={sheet === "empire"} onToggle={() => { setPanel(null); toggleSheet("empire"); }} />}
            </>) : undefined}
          />
          <div className="hudicons">
            <button type="button" className="tbtn ico menu-btn" aria-expanded={toolsOut} aria-label={HUD.menuLabel} title={HUD.menuTitle} onClick={() => { if (toolsOut) { setMenu(false); setSheet(null); setTray(false); } else setMenu(true); }}>
              <Icon name="list" size={16} />
            </button>
            {toolsOut && state && (
              <button
                type="button"
                className="tbtn ico"
                aria-pressed={sheet === "status"}
                onClick={() => toggleSheet("status")}
                aria-label="Factory status as text"
                title="Factory status as text (T)"
              >
                <Icon name="eye" size={16} />
              </button>
            )}
            {toolsOut && <button
              type="button"
              className={`tbtn ico guide-btn${met.size > seenGuide ? " new" : ""}`}
              aria-pressed={sheet === "guide"}
              onClick={() => { setSeenGuide(met.size); toggleSheet("guide"); }}
              aria-label={HUD.guideLabel(met.size)}
              title={HUD.guideTitle(met.size)}
            >
              <Icon name="book" size={16} />
            </button>}
            {toolsOut && state && (researchReady(state) || (state.research?.done.length ?? 0) > 0) && (
              // Research shows up once there's enough science to buy a check, not before.
              <button
                type="button"
                className={`tbtn ico research-btn${researchReady(state) ? " new" : ""}`}
                aria-pressed={sheet === "research"}
                onClick={() => toggleSheet("research")}
                aria-label={HUD.researchLabel}
                title={HUD.researchTitle}
              >
                <Icon name="flask" size={16} />
              </button>
            )}
            {toolsOut && ach.count > 0 && (
              // Achievements show up with the first one earned.
              <button
                type="button"
                className={`tbtn ico ach-btn${ach.toast ? " new" : ""}`}
                aria-pressed={sheet === "achievements"}
                onClick={() => toggleSheet("achievements")}
                aria-label={`Achievements, ${ach.count} earned`}
                title={`Achievements · ${ach.count} earned`}
              >
                <Icon name="medal" size={16} />
              </button>
            )}
            {toolsOut && <button type="button" className="tbtn ico" aria-label={HUD.activityLabel(waiting)} aria-expanded={tray} onClick={() => setTray((v) => !v)}>
              {waiting > 0 && <span className="n">{waiting}</span>}
              <Icon name="bell" size={16} />
            </button>}
          </div>
        </div>

        {tour.lesson && (
          <section className="card coachcard" aria-label={HUD.tour}>
            <Coach lesson={tour.lesson} step={tour.step} total={tour.total} repo={state?.repo ?? WORDS.yourRepo} onDismiss={tour.dismiss} onSkip={tour.skip} />
          </section>
        )}

        {brief.show && progressing && !checkin && !sheet ? (
          <MorningBrief p={prog.p} deck={deck} onCheckin={() => { brief.close(); setCheckin(true); }} onClose={brief.close} />
        ) : sheet === "progress" ? (
          <ProgressSheet p={prog.p} notify={nudge.notify} onNotify={nudge.toggleNotify} onEquip={prog.equip} onClose={() => setSheet(null)} />
        ) : source && state ? (
          <ConnectSource kind={source} state={state} send={send} onClose={() => setSource(null)} />
        ) : sheet === "yours" && state ? (
          <MakeItYours state={state} send={send} onClose={() => setSheet(null)} />
        ) : sheet === "thinks" ? (
          <Suspense fallback={null}>
            <HowItThinks repo={cfg.kind === "live" ? cfg.repo : undefined} brain={state?.brain} onClose={() => setSheet(null)} />
          </Suspense>
        ) : sheet === "empire" ? (
          <EmpireSheet e={empire} live={cfg.kind === "live"} onClose={() => setSheet(null)} />
        ) : sheet === "research" && state ? (
          <Research state={state} send={send} onClose={() => setSheet(null)} onResearched={(tech) => { setSheet(null); setLanding(checkStationId(tech)); }} />
        ) : sheet === "status" && state ? (
          <FactoryText state={state} onOpen={(k) => { setSheet(null); setPanel(k); }} onClose={() => setSheet(null)} />
        ) : sheet === "achievements" ? (
          <AchievementsSheet earned={ach.earned} state={state} streak={prog.p.best} onClose={() => setSheet(null)} />
        ) : sheet === "guide" ? (
          <FieldGuide met={met} onClose={() => setSheet(null)} />
        ) : checkin && !back.holding ? (
          <Suspense fallback={null}>
            <CheckIn
              deck={deck}
              autonomy={autonomy}
              send={sendCard}
              onFocus={setFocus}
              onClose={() => { setCheckin(false); setFocus(null); }}
              onAnswered={progressing ? prog.card : undefined}
              end={progressing ? (<><DayTally p={prog.p} /><DeckTrend p={prog.p} /></>) : undefined}
              calm={calm}
            />
          </Suspense>
        ) : sheet === "line" ? (
          <section className="card sheet" aria-label={LINE.title}>
            <div className="sheet-top">
              <h2>{LINE.title}</h2>
              <button type="button" className="hud-iconbtn" onClick={() => setSheet(null)} aria-label={WORDS.close}>
                <Icon name="cross" size={14} />
              </button>
            </div>
            {extras.length > 0 && (
              <dl className="counts">
                {extras.map((c) => (
                  <div key={c.key} className={c.tone} title={c.title}>
                    <dt>{c.label}</dt>
                    <dd>{c.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            <h3>{LINE.onPad}</h3>
            {pad.length === 0 && <p className="empty">{LINE.padEmpty}</p>}
            {pad.map((i) => (
              <div key={i.id} className="lrow">
                <i className="sq" style={{ background: css(KIND_COLOR[i.kind]) }} aria-hidden="true" />
                <span className="tt">
                  #{i.prNumber} {i.title}
                  <code>{i.district}</code>
                </span>
                {cfg.kind === "live" && i.prUrl ? (
                  <a className="pill hot" href={i.prUrl} target="_blank" rel="noreferrer">
                    {WORDS.openPr}
                  </a>
                ) : (
                  <span className="pill hot">{STATE_LABEL[i.state]}</span>
                )}
              </div>
            ))}
            <h3>{LINE.onBelt}</h3>
            {inFlight.length === 0 && <p className="empty">{LINE.beltEmpty}</p>}
            {inFlight.map((i) => (
              <div key={i.id} className="lrow" title={i.failure}>
                <i className="sq" style={{ background: css(KIND_COLOR[i.kind]) }} aria-hidden="true" />
                <span className="tt">
                  {i.title}
                  <code>{i.district}</code>
                </span>
                <span className={`pill ${i.state}`}>{STATE_LABEL[i.state]}</span>
              </div>
            ))}
            {permits.length > 0 && <p className="empty">{LINE.permits(permits.join(", "))}</p>}
          </section>
        ) : sheet === "power" ? (
          <section className="card sheet" aria-label={POWER.title}>
            <div className="sheet-top">
              <h2>{POWER.title}</h2>
              <button type="button" className="hud-iconbtn" onClick={() => setSheet(null)} aria-label={WORDS.close}>
                <Icon name="cross" size={14} />
              </button>
            </div>
            {cfg.kind === "live" && <RunnerConnection repo={cfg.repo} />}
            <p className="empty">
              {plants.some((p) => p.kind === "geothermal") ? POWER.introGeo : POWER.intro}
            </p>
            {plants.map((p) => {
              const pct = p.online ? Math.round(p.level * 100) : 0;
              return (
                <div className={`plant ${p.kind}`} key={p.id}>
                  <div className="plant-top">
                    <span className="sq" style={{ background: POWER_COLOR[p.kind] }} />
                    <span className="tt">
                      {p.name}
                      <code>
                        {p.kindLabel} · {p.cost}
                      </code>
                    </span>
                    <span className={p.busy ? "pill working" : "pill"}>{p.online ? (p.busy ? "running" : "ready") : "offline"}</span>
                  </div>
                  <div className="plant-bar">
                    {!(cfg.kind === "live" && p.kind === "solar") && <span className="meter" role="meter" aria-label={`${p.name} headroom`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                      <i style={{ width: `${pct}%`, background: POWER_COLOR[p.kind] }} />
                    </span>}
                    <span className="plant-num">{cfg.kind === "live" && p.kind === "solar" ? (p.online ? "Signed in" : POWER.offline) : p.online ? `${pct}% left` : POWER.offline}</span>
                    <span className="plant-num">
                      {p.jobs} {p.kind === "steam" ? (p.jobs === 1 ? "decision" : "decisions") : p.jobs === 1 ? "job" : "jobs"}
                    </span>
                  </div>
                  {p.kind === "geothermal" && <p className="plant-note">{GEO_EXPLAINER}</p>}
                </div>
              );
            })}

            <button type="button" className="credit-btn" onClick={() => setSheet("thinks")}>{POWER.howItThinks}</button>

            {SLOTS.filter((sl) => !state?.power.some((p) => p.id === `solar-${sl.harness}` || p.name === sl.name)).map((sl) => {
              const opt = state?.move?.stage === "resources" ? state.move.options.find((o) => o.id === sl.harness) : undefined;
              return (
                <div className="lrow" key={sl.harness}>
                  <span className="tt">
                    {sl.name}
                    <code>{POWER.notSignedIn}</code>
                  </span>
                  {opt && state?.move ? (
                    <button type="button" className="btn rec" style={{ flex: "none" }} onClick={() => send({ type: "choose_move", moveId: state.move!.id, optionId: opt.id })}>
                      {POWER.signIn}
                    </button>
                  ) : (
                    <span className="pill" title={POWER.pairTitle}>
                      {POWER.pair}
                    </span>
                  )}
                </div>
              );
            })}
            {!plants.some((p) => p.kind === "geothermal") && (
              <div className="lrow">
                <span className="tt">
                  Your computer
                  <code>geothermal · free, runs small jobs on a local model</code>
                </span>
                <span className="pill" title="Run Ollama or any OpenAI-compatible model on this machine and the runner finds it">
                  start a local model
                </span>
              </div>
            )}
          </section>
        ) : back.holding ? null : (
          <div className="needs-slot" ref={hv.refs.needs as Ref<HTMLDivElement>}>
            {calm ? (
              <AttentionTray
                deck={deck}
                send={sendCard}
                first={back.park?.id}
                onPower={cfg.kind === "live" ? () => setSheet("power") : undefined}
                onCheckin={world !== "checkin" && show("checkin") && !checkin ? () => setCheckin(true) : undefined}
                quiet={whatNext ? { kicker: whatNext.kicker, title: whatNext.title, cta: whatNext.cta.label, onGo: () => onNudge(whatNext.cta.action) } : null}
              />
            ) : (
              <NextMove move={state?.move} bottleneck={state?.bottleneck} stations={state?.stations} send={sendCard} onOpen={setPanel} onPower={cfg.kind === "live" ? () => setSheet("power") : undefined} nudge={whatNext} onNudge={onNudge} rows={needRows} />
            )}
          </div>
        )}

        {toolsOut && show("log") && <Ticker log={log} className={trayUp ? undefined : "covered"} />}

        {!checkin && toolsOut && (
        <nav className="ctrl" aria-label={HUD.dock.label} ref={hv.refs.ctrl as Ref<HTMLElement>}>
          {world && (
            <div className="row" role="group" aria-label={HUD.view}>
              <span className="eyebrow" aria-hidden="true">{HUD.view}</span>
              <button type="button" className="tbtn" aria-pressed={world === "checkin"} onClick={() => { setWorld("checkin"); setSheet(null); if (deck.length > 1) setCheckin(true); }}>
                {HUD.checkin}{deck.length > 0 && <span className="cnt">{deck.length}</span>}
              </button>
              <button type="button" className="tbtn" aria-pressed={world === "build"} onClick={() => { setWorld("build"); setCheckin(false); }}>
                {HUD.factory}
              </button>
            </div>
          )}
          <div className="row">
            <span className="eyebrow" aria-hidden="true">{HUD.dock.tools}</span>
            {/* Tools show up when they're needed, never as dead buttons waiting to unlock (2026-10-27). */}
            {show("line") && (
              <button type="button" className="tbtn" aria-pressed={sheet === "line"} onClick={() => toggleSheet("line")}>
                {inFlight.length + pad.length > 0 && <span className="cnt">{inFlight.length + pad.length}</span>}
                {HUD.dock.line}
              </button>
            )}
            {world !== "checkin" && show("build") && (metrics?.rockets ?? shipped) >= TOOLS_AT && (
              <button type="button" className="tbtn" aria-pressed={sheet === "yours"} onClick={() => toggleSheet("yours")}>
                {HUD.dock.yours}
              </button>
            )}
            {world !== "checkin" && (cfg.kind === "live" || show("power")) && (
              <button type="button" className="tbtn" aria-pressed={sheet === "power"} onClick={() => toggleSheet("power")}>
                {HUD.dock.power}
              </button>
            )}
            {show("launch") && (
              <button type="button" className={pad.length > 0 ? "tbtn hot" : "tbtn"} onClick={launch} disabled={pad.length === 0} aria-label={HUD.dock.launchLabel} title={HUD.dock.launchTitle}>
                {HUD.dock.launch}
              </button>
            )}
            {world === "checkin" ? (
              <button type="button" className="tbtn hot" onClick={() => setCheckin(true)} disabled={deck.length === 0} aria-label={HUD.dock.checkinLabel(deck.length)}>
                {deck.length > 0 && <span className="cnt">{deck.length}</span>}
                {HUD.checkin}
              </button>
            ) : placeNeeded && (
              <button
                type="button"
                className="tbtn ok"
                onClick={build}
                disabled={!show("build") || !slot || !plugged || cfg.kind === "live"}
                aria-label={plugged ? HUD.dock.placeLabel(plugged.name) : HUD.dock.placeNeedsPower}
                title={plugged ? HUD.dock.placeTitle(plugged.name) : HUD.dock.placeNeedsPowerTitle}
              >
                {HUD.dock.place}
              </button>
            )}
          </div>
        </nav>
        )}

        {back.overlay}

        <AchievementToast toast={ach.toast} onDismiss={ach.dismiss} onOpen={() => { setCheckin(false); setSheet("achievements"); }} />

        {panel && state && (panel === "m:ore-inbox" && state.support ? <SupportPanel state={state} send={send} reviewTicket={supportReview} onClose={() => setPanel(null)} /> : <StationPanel id={panel} state={state} log={log} send={send} onClose={() => setPanel(null)} jobs={powerJobs.current} live={cfg.kind === "live"} />)}


        {tray && (
          <ActivityTray
            deck={deck}
            pad={pad}
            log={show("log") ? log : []}
            live={status === "live"}
            send={send}
            onShow={(f) => {
              setPanel(pickKey(f));
              setTray(false);
            }}
            onLaunch={launchItem}
            onCheckin={show("checkin") ? () => { setTray(false); setCheckin(true); } : undefined}
            onClose={() => setTray(false)}
            historyOnly={calm}
            header={
              <>
                {cfg.kind === "sim" ? ACTIVITY.sim(cfg.scenario) : `${cfg.repo} · ${state?.baseBranch ?? "main"}`}
                <span className={`status ${status}`}> · {status}</span>
              </>
            }
            stats={show("score") ? stats : undefined}
            settings={settings}
          />
        )}
        </>)}
      </main>
    </div>
  );
}
