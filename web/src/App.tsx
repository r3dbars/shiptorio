import { useEffect, useMemo, useRef, useState } from "react";
import { savePref } from "./account";
import type { AutonomyLevel, FactoryState, Item, Move, PowerSource } from "@shiptorio/shared";
import { FactoryMap } from "./map/FactoryMap";
import type { Ping } from "./map/scene";
import { css, KIND_COLOR } from "./map/palette";
import { readConfig } from "./source";
import { SCENARIOS } from "./sim/engine";
import { useFactory, type LogLine } from "./store";
import { NextMove } from "./ui/NextMove";
import { CheckIn } from "./ui/CheckIn";
import { StationPanel } from "./ui/StationPanel";
import { SoundControl } from "./ui/SoundControl";
import { ActivityTray } from "./ui/ActivityTray";
import { Icon } from "./ui/icons";
import { Coach, lessonFocus, useTutorial } from "./ui/tutorial";
import { FieldGuide, GUIDE_TOTAL, guideMet } from "./ui/FieldGuide";
import { HowItThinks } from "./ui/HowItThinks";
import { GEO_EXPLAINER, notePowerJobs, powerLedger } from "./ui/powerLedger";
import { ConnectSource, MakeItYours } from "./ui/MakeItYours";
import { useFactorySound } from "./sound/useFactorySound";
import { sound } from "./sound/engine";
import { ShipCelebration } from "./ui/ShipCelebration";
import { introMode, useIntroTour } from "./ui/IntroTour";
import type { SourceConfig } from "./source";
import { Research, researchReady } from "./ui/Research";
import { checkStationId } from "@shiptorio/shared";
import { EmpireSheet, IslandChip, satellitesFor, useEmpire } from "./ui/Empire";

const STATE_LABEL: Record<Item["state"], string> = {
  ore: "ore",
  queued: "queued",
  working: "building",
  inspecting: "checking",
  rejected: "rework",
  passed: "passed",
  on_pad: "on the pad",
  launched: "launched",
};

const POWER_COLOR: Record<PowerSource["kind"], string> = { steam: "#e3a33f", solar: "#6cc28c", geothermal: "#ff7a2a" };

// What the ping on the map says, by where the work is stuck.
const PING_WORD: Record<NonNullable<Move["stage"]>, string> = {
  intake: "New work",
  triage: "Sorting",
  build: "Ready to build",
  inspect: "Needs a look",
  pad: "Ready to launch",
  release: "Releasing",
  impact: "Check impact",
  power: "Needs power",
  resources: "Needs power",
};

// What a quiet tag on a busy machine says.
const BUSY_WORD: Partial<Record<Item["state"], string>> = { working: "Building", inspecting: "Checking", rejected: "Reworking" };
const codePath = (district: string) => (district === "/" ? "/" : `/${district}`);

const LEVEL_LABEL: Record<AutonomyLevel, string> = { advisor: "Advisor", floor: "Floor", build: "Build", lights_out: "Lights out" };
// Subscriptions you can plug in. Each sign-in adds a solar plant and assemblers (docs/PRODUCT.md).
const SLOTS = [
  { harness: "claude_code", name: "Claude" },
  { harness: "codex", name: "ChatGPT" },
] as const;
// science packs by item kind (shared SCIENCE_FOR)
const SCIENCE_LABEL = { red: "bugs", green: "features", grey: "cleanup", blue: "tests" } as const;

// Two worlds on one map (docs/PRODUCT.md, Onboarding): Check in is "just show me what's stuck", Build is
// "let me make the factory mine". The first run asks once after the scan; the toggle switches any time.
type World = "checkin" | "build";
const WORLD_KEY = "shiptorio:world";
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

// Big news from the floor log shows up as a caption for a few seconds.
function useCaption(log: LogLine[]) {
  const [caption, setCaption] = useState<{ title: string; sub: string }>({ title: "The factory must grow", sub: "drag to pan · pinch or scroll to zoom" });
  const [on, setOn] = useState(true); // the text stays while the box fades out
  const last = log[log.length - 1];
  useEffect(() => {
    if (!last || last.level === "info") return;
    const [title, ...rest] = last.text.split(": ");
    setCaption({ title, sub: rest.join(": ") });
    setOn(true);
  }, [last]);
  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => setOn(false), 2800);
    return () => clearTimeout(t);
  }, [caption, on]);
  return { ...caption, on };
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
export function App({ config, onIntroDone, login }: { config?: SourceConfig; onIntroDone?: () => void; login?: string | null } = {}) {
  const cfg = useMemo(() => config ?? readConfig(), [config]);
  const { state, log, status, send } = useFactory(cfg);
  const empire = useEmpire(cfg, state);
  const satellites = useMemo(() => (empire.on ? satellitesFor(empire) : []), [empire.on, JSON.stringify(empire.others), empire.here?.repo, empire.here?.waiting, empire.here?.bottleneck?.wip]);
  const intro = introMode(cfg);
  // played straight from ?scenario=intro, the tour ends at the first run, the way onboarding would
  const tourDone = onIntroDone ?? (() => (location.href = "?source=sim&scenario=first-run"));
  const tourly = useIntroTour(intro ? state : null, send, tourDone, login);
  const caption = useCaption(log);
  // First run teaches one concept at a time and hides the HUD it hasn't introduced yet. ?tour=0 turns it off.
  const tour = useTutorial(state, cfg.kind === "sim" && cfg.scenario === "first-run" && new URLSearchParams(location.search).get("tour") !== "0");
  const { show } = tour;
  // which plant built each item this session, for the power sheet's job counts
  const powerJobs = useRef(new Map<string, string>());
  if (state) powerJobs.current = notePowerJobs(powerJobs.current, state);
  const plants = state ? powerLedger(state, powerJobs.current) : [];
  const [panel, setPanel] = useState<string | null>(null);
  // the first run asks which world to start in; everyone else lands in Build, the full map
  const [world, setWorldState] = useState<World | null>(() => (intro ? "build" : tour.on ? null : (readWorld() ?? "build")));
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
  const deck = state?.deck ?? (state?.move ? [state.move] : []);
  useFactorySound(state, focusKey ?? panel); // whatever the camera is in on, you hear up close
  const [sheet, setSheet] = useState<"line" | "power" | "guide" | "yours" | "thinks" | "research" | "empire" | null>(() => (new URLSearchParams(location.search).has("thinks") ? "thinks" : null));
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
  const fork = world === null && !!state && state.districts.length > 0 && !tour.lesson;
  const [tray, setTray] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
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
    const title = item?.state === "rejected" ? "Sent back" : stage ? PING_WORD[stage] : "Needs you";
    return { key, title, code: item ? codePath(item.district) : undefined, tone: item?.state === "on_pad" ? ("ok" as const) : ("warn" as const) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const narrow = typeof window !== "undefined" && window.innerWidth <= 560; // phones get fewer tags
  // Quiet tags on every other busy machine, naming the code it's working in, so the whole line reads as your codebase.
  const pings = useMemo(() => {
    if (!state) return [];
    const out: Ping[] = ping ? [ping] : [];
    for (const i of state.items) {
      const word = i.machineId ? BUSY_WORD[i.state] : undefined;
      const key = i.machineId && pickKey(i.machineId);
      if (!word || !key || out.some((p) => p.key === key)) continue;
      out.push({ key, title: word, code: codePath(i.district), quiet: true });
      if (out.length >= (narrow ? 3 : 5)) break;
    }
    return out;
  }, [state, ping, narrow]);
  const waiting = deck.length + pad.filter((i) => i.state === "on_pad").length;

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
  // the planner never codes: a new assembler runs on a subscription you've signed in with
  const plugged = SLOTS.find((sl) => state?.power.some((p) => p.id === `solar-${sl.harness}` && p.online));
  const build = () => {
    if (slot && plugged) send({ type: "place_machine", machineType: "assembler", x: slot.x, y: slot.y, harness: plugged.harness });
  };
  const toggleSheet = (s: "line" | "power" | "guide" | "yours" | "thinks" | "research" | "empire") => setSheet((v) => (v === s ? null : s));

  // L toggles labels; A and B do what the launch and build buttons say. Ignored while typing.
  const keys = useRef({ launch, build, show, intro });
  keys.current = { launch, build, show, intro };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (keys.current.intro || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "l") setShowLabels((v) => !v);
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

  const stats = metrics && (
    <div className="tray-stats">
      <div title="users unblocked + 10 × customers answered + rockets − 25 × escaped defects">
        <b>{metrics.shipScore.toLocaleString()}</b>ship score
      </div>
      <div title="Users affected by fixed issues">
        <b>{metrics.usersUnblocked}</b>users unblocked
      </div>
      <div title="Customer threads closed with a shipped fix">
        <b>{metrics.customersAnswered}</b>customers answered
      </div>
      <div title="Live Sentry errors your fixes killed">
        <b>{metrics.bitersKilled}</b>errors fixed
      </div>
      <div title="Median time from issue to merged">
        <b>{fmtLead(metrics.leadTimeMs)}</b>lead time
      </div>
      {show("science") &&
        (["red", "green", "grey", "blue"] as const).map((k) => (
          <div key={k}>
            <b>{state?.science[k] ?? 0}</b>
            {SCIENCE_LABEL[k]} shipped
          </div>
        ))}
    </div>
  );

  const settings = (
    <>
      <button type="button" className="credit-btn" onClick={() => { setTray(false); setSheet("thinks"); }}>
        powered by Meta Muse Spark · how it thinks
      </button>
      <SoundControl />
      {show("labels") && (
        <div className="row2">
          <span>Labels on every machine (L)</span>
          <button type="button" className="toggle" aria-pressed={showLabels} onClick={() => setShowLabels((v) => !v)}>
            {showLabels ? "On" : "Off"}
          </button>
        </div>
      )}
      {cfg.kind === "sim" && show("scenarios") && (
        <nav className="scen" aria-label="Scenarios">
          {Object.keys(SCENARIOS).map((name) => (
            <a key={name} href={`?source=sim&scenario=${name}`} aria-current={name === cfg.scenario ? "page" : undefined}>
              {name}
            </a>
          ))}
          <a href="/art/">art</a>
        </nav>
      )}
    </>
  );

  return (
    <div className={panel ? "app picked" : "app"}>
      <main className="floor">
        <FactoryMap
          state={state}
          onPick={pickOnMap}
          focus={intro ? tourly.cam.focus : (focusKey ?? panel)}
          wide={intro ? tourly.cam.wide : null}
          lift={intro ? (window.innerWidth <= 760 ? 0.24 : 0.13) : 0}
          showLabels={showLabels}
          teachingKeys={intro ? undefined : lessonFocus(state, tour.lesson?.id)}
          pings={intro ? (tourly.ping ? pings : undefined) : show("line") ? pings : undefined}
          satellites={intro ? undefined : satellites}
          empire={!intro && sheet === "empire"}
        />
        <ShipCelebration state={state} quiet={intro && tourly.quiet} high={intro} />
        {intro && <div className="tour-vignette" aria-hidden="true" />}
        {intro && tourly.top}
        {intro && tourly.card}
        {!intro && (<>

        <header className="topbar">
          <div className="chips">
            {empire.on && <IslandChip e={empire} open={sheet === "empire"} onToggle={() => { setPanel(null); toggleSheet("empire"); }} />}
            {show("score") && (
              <div className="chip" title="PRs merged">
                <span className="badge" style={{ background: "var(--amber)" }}>
                  <Icon name="rocket" size={14} />
                </span>
                <span>
                  {metrics?.rockets ?? shipped}
                  <small>shipped</small>
                </span>
              </div>
            )}
            {autonomy?.launches ? (
              // Live: how much of the shipping runs itself. Shows up after the first rocket.
              <div className="chip" title={permits.length ? `Ships on its own in ${permits.join(", ")}. The rest waits for you.` : "Every PR waits for you. Clean ships earn launch permits."}>
                <span className="badge" style={{ background: "var(--blue)" }}>
                  <Icon name="bot" size={14} />
                </span>
                <span>
                  {Math.round((autonomy.automated ?? 0) * 100)}%
                  <small>automated</small>
                </span>
              </div>
            ) : show("autonomy") && autonomy && (
              <div
                className="chip"
                title={autonomy.next ? `${autonomy.next.have}/${autonomy.next.need} ${autonomy.next.label} to unlock ${LEVEL_LABEL[autonomy.next.level]}` : "Top level"}
              >
                <span className="badge" style={{ background: "var(--blue)" }}>
                  <Icon name="bot" size={14} />
                </span>
                <span>
                  {autonomy.next ? `${autonomy.next.have}/${autonomy.next.need}` : LEVEL_LABEL[autonomy.level]}
                  <small>{autonomy.next ? `to ${LEVEL_LABEL[autonomy.next.level]}` : "trust"}</small>
                </span>
              </div>
            )}
            {show("score") && metrics && (
              <div className="chip desk" title="users unblocked + 10 × customers answered + rockets − 25 × escaped defects">
                <span className="badge" style={{ background: "var(--green)" }}>
                  <Icon name="star" size={14} />
                </span>
                <span>
                  {metrics.shipScore.toLocaleString()}
                  <small>score</small>
                </span>
              </div>
            )}
          </div>
          {!world && show("checkin") && deck.length > 1 && !checkin && (
            <button type="button" className="checkin-chip" onClick={() => setCheckin(true)} aria-label={`Check in: ${deck.length} cards waiting on you`}>
              Check in · {deck.length}
            </button>
          )}
          <button
            type="button"
            className={`hud-iconbtn guide-btn${met.size > seenGuide ? " new" : ""}`}
            aria-pressed={sheet === "guide"}
            onClick={() => { setSeenGuide(met.size); toggleSheet("guide"); }}
            aria-label={`Field guide, ${met.size} concepts found`}
            title={`Field guide · ${met.size} concepts found`}
          >
            <Icon name="book" size={20} />
          </button>
          {state && shipped > 0 && (
            // Research shows up after the first ship: that's the first science pack to spend.
            <button
              type="button"
              className={`hud-iconbtn research-btn${researchReady(state) ? " new" : ""}`}
              aria-pressed={sheet === "research"}
              onClick={() => toggleSheet("research")}
              aria-label="Research new checks"
              title="Research · spend science packs on new checks"
            >
              <Icon name="flask" size={20} />
            </button>
          )}
          <button type="button" className="hud-iconbtn" aria-label={`Activity, ${waiting} waiting on you`} aria-expanded={tray} onClick={() => setTray((v) => !v)}>
            {waiting > 0 && <span className="n">{waiting}</span>}
            <Icon name="bell" size={20} />
          </button>
        </header>

        {world && (
          <div className="lens" role="group" aria-label="View">
            <button type="button" aria-pressed={world === "checkin"} onClick={() => { setWorld("checkin"); setSheet(null); if (deck.length > 1) setCheckin(true); }}>
              Check in{deck.length > 0 && <span className="lens-n">{deck.length}</span>}
            </button>
            <button type="button" aria-pressed={world === "build"} onClick={() => { setWorld("build"); setCheckin(false); }}>
              Build
            </button>
          </div>
        )}

        {tour.lesson && (
          <section className="card coachcard" aria-label="Tour">
            <Coach lesson={tour.lesson} step={tour.step} total={tour.total} repo={state?.repo ?? "your repo"} onDismiss={tour.dismiss} onSkip={tour.skip} />
          </section>
        )}

        {fork && state ? (
          <section className="card nextmove firstread" aria-label="First read">
            <div className="nm-head">
              <span className="nm-kicker">First read · {state.repo}</span>
            </div>
            <h2>
              {state.bottleneck?.summary
                ? `Your bottleneck right now: ${state.bottleneck.summary}.`
                : `${state.districts.length} folders scanned. Now let's find what's stuck.`}
            </h2>
            <div className="opts">
              <button type="button" className="btn rec" onClick={() => { setWorld("checkin"); if (deck.length > 1) setCheckin(true); }}>
                Show me what's stuck
                <small>Suggested · decide what waits on you, two minutes at a time</small>
              </button>
              <button type="button" className="btn" onClick={() => setWorld("build")}>
                Let me build
                <small>Lay down your own factory line and ship a fix</small>
              </button>
            </div>
            <p className="empty">You can switch any time.</p>
          </section>
        ) : source && state ? (
          <ConnectSource kind={source} state={state} send={send} onClose={() => setSource(null)} />
        ) : sheet === "yours" && state ? (
          <MakeItYours state={state} send={send} onClose={() => setSheet(null)} />
        ) : sheet === "thinks" ? (
          <HowItThinks brain={state?.brain} onClose={() => setSheet(null)} />
        ) : sheet === "empire" ? (
          <EmpireSheet e={empire} live={cfg.kind === "live"} onClose={() => setSheet(null)} />
        ) : sheet === "research" && state ? (
          <Research state={state} send={send} onClose={() => setSheet(null)} onResearched={(tech) => { setSheet(null); setLanding(checkStationId(tech)); }} />
        ) : sheet === "guide" ? (
          <FieldGuide met={met} onClose={() => setSheet(null)} />
        ) : checkin ? (
          <CheckIn deck={deck} autonomy={autonomy} send={send} onFocus={setFocus} onClose={() => { setCheckin(false); setFocus(null); }} />
        ) : sheet === "line" ? (
          <section className="card sheet" aria-label="The line">
            <div className="sheet-top">
              <h2>The line</h2>
              <button type="button" className="hud-iconbtn" onClick={() => setSheet(null)} aria-label="Close">
                <Icon name="cross" size={14} />
              </button>
            </div>
            <h3>On the pad</h3>
            {pad.length === 0 && <p className="empty">Nothing ready to launch yet.</p>}
            {pad.map((i) => (
              <div key={i.id} className="lrow">
                <i className="sq" style={{ background: css(KIND_COLOR[i.kind]) }} aria-hidden="true" />
                <span className="tt">
                  #{i.prNumber} {i.title}
                  <code>{i.district}</code>
                </span>
                {cfg.kind === "live" && i.prUrl ? (
                  <a className="pill hot" href={i.prUrl} target="_blank" rel="noreferrer">
                    Open PR
                  </a>
                ) : (
                  <span className="pill hot">{STATE_LABEL[i.state]}</span>
                )}
              </div>
            ))}
            <h3>In progress</h3>
            {inFlight.length === 0 && <p className="empty">The line is quiet.</p>}
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
            {permits.length > 0 && <p className="empty">Launches on its own in {permits.join(", ")}</p>}
          </section>
        ) : sheet === "power" ? (
          <section className="card sheet" aria-label="Power">
            <div className="sheet-top">
              <h2>Power</h2>
              <button type="button" className="hud-iconbtn" onClick={() => setSheet(null)} aria-label="Close">
                <Icon name="cross" size={14} />
              </button>
            </div>
            <p className="empty">
              {plants.some((p) => p.kind === "geothermal")
                ? "Your sign-ins and your own computer power the builders. The planner decides what each one builds."
                : "Your sign-ins power the builders. More sign-ins, more builders. The planner decides what they build."}
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
                    <span className="meter" role="meter" aria-label={`${p.name} headroom`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                      <i style={{ width: `${pct}%`, background: POWER_COLOR[p.kind] }} />
                    </span>
                    <span className="plant-num">{p.online ? `${pct}% left` : "offline"}</span>
                    <span className="plant-num">
                      {p.jobs} {p.kind === "steam" ? (p.jobs === 1 ? "decision" : "decisions") : p.jobs === 1 ? "job" : "jobs"}
                    </span>
                  </div>
                  {p.kind === "geothermal" && <p className="plant-note">{GEO_EXPLAINER}</p>}
                </div>
              );
            })}
            <button type="button" className="credit-btn" onClick={() => setSheet("thinks")}>See how the planner thinks</button>
            {cfg.kind === "live" && state?.repo && (
              <button type="button" className="credit-btn" onClick={async () => {
                try {
                  const response = await fetch(`/api/repos/${state.repo}/runner/revoke`, { method: "POST" });
                  if (!response.ok) throw new Error("Revoke failed");
                } catch { window.alert("Could not disconnect the runner. Try again."); }
              }}>Disconnect local runner</button>
            )}

            {SLOTS.filter((sl) => !state?.power.some((p) => p.name === sl.name)).map((sl) => {
              const opt = state?.move?.stage === "resources" ? state.move.options.find((o) => o.id === sl.harness) : undefined;
              return (
                <div className="lrow" key={sl.harness}>
                  <span className="tt">
                    {sl.name}
                    <code>not signed in</code>
                  </span>
                  {opt && state?.move ? (
                    <button type="button" className="btn rec" style={{ flex: "none" }} onClick={() => send({ type: "choose_move", moveId: state.move!.id, optionId: opt.id })}>
                      Sign in
                    </button>
                  ) : (
                    <span className="pill" title="Run bunx shiptorio-runner pair on your machine to plug it in">
                      pair the runner
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
        ) : (
          <NextMove move={state?.move} bottleneck={state?.bottleneck} stations={state?.stations} send={send} onOpen={setPanel} />
        )}

        {!checkin && (
        <nav className="dock" aria-label="Actions">
          <button type="button" className="tool" aria-pressed={sheet === "line"} onClick={() => toggleSheet("line")} disabled={!show("line")}>
            {show("line") && inFlight.length + pad.length > 0 && <span className="n">{inFlight.length + pad.length}</span>}
            <Icon name="list" size={20} />
            Line
          </button>
          {world !== "checkin" && show("build") && (metrics?.rockets ?? shipped) > 0 && (
            <button type="button" className="tool" aria-pressed={sheet === "yours"} onClick={() => toggleSheet("yours")}>
              <Icon name="wrench" size={20} />
              Yours
            </button>
          )}
          {world !== "checkin" && (
          <button type="button" className="tool" aria-pressed={sheet === "power"} onClick={() => toggleSheet("power")} disabled={!show("power")}>
            <Icon name="bolt" size={20} />
            Power
          </button>
          )}
          <button type="button" className="tool big" onClick={launch} disabled={!show("launch") || pad.length === 0} aria-label="Launch the PR on the pad" title="Launch (B)">
            <Icon name="rocket" size={20} />
            Launch
          </button>
          {world === "checkin" ? (
          <button type="button" className="tool big go" onClick={() => setCheckin(true)} disabled={deck.length === 0} aria-label={`Check in: ${deck.length} waiting on you`}>
            {deck.length > 0 && <span className="n">{deck.length}</span>}
            <Icon name="list" size={20} />
            Check in
          </button>
          ) : (
          <button
            type="button"
            className="tool big go"
            onClick={build}
            disabled={!show("build") || !slot || !plugged || cfg.kind === "live"}
            aria-label={plugged ? `Place another ${plugged.name} assembler` : "Sign in with Claude or ChatGPT to build"}
            title={plugged ? `Place another ${plugged.name} assembler (A)` : "Sign in with Claude or ChatGPT first"}
          >
            <Icon name="bot" size={20} />
            Place
          </button>
          )}
        </nav>
        )}

        {panel && state && <StationPanel id={panel} state={state} log={log} send={send} onClose={() => setPanel(null)} jobs={powerJobs.current} />}

        <div className={`card caption${caption.on && !fork ? " on" : ""}${tour.lesson ? " coached" : ""}`} role="status" aria-live="polite">
          <div className="ptitle">{caption.title}</div>
          <div className="psub">{caption.sub}</div>
        </div>

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
            header={
              <>
                {cfg.kind === "sim" ? `sim · ${cfg.scenario}` : `${cfg.repo} · ${state?.baseBranch ?? "main"}`}
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
