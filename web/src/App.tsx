import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { savePref } from "./account";
import type { FactoryState, Item, PowerSource } from "@shiptorio/shared";
import { FactoryMap } from "./map/FactoryMap";
import type { Ping } from "./map/scene";
import { css, KIND_COLOR } from "./map/palette";
import { readConfig } from "./source";
import { SCENARIOS } from "./sim/engine";
import { useFactory, type LogLine } from "./store";
import { NextMove } from "./ui/NextMove";
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
import { checkStationId } from "@shiptorio/shared";
import { cosmeticsOf, DayTally, DeckTrend, MorningBrief, ProgressChip, ProgressSheet, progressOn, progressProfile, useBottleneckNudge, useBrief, useProgress, XpPop } from "./ui/Progress";

import { EmpireSheet, IslandChip, satellitesFor, useEmpire } from "./ui/Empire";
import { ACTIVITY, FORK, HUD, LEVEL_LABEL, LINE, MAP, POWER, SETTINGS, STATE_LABEL, STATS, WORDS } from "./copy";

const POWER_COLOR: Record<PowerSource["kind"], string> = { steam: "#e3a33f", solar: "#6cc28c", geothermal: "#ff7a2a" };

const codePath = (district: string) => (district === "/" ? "/" : `/${district}`);

// Subscriptions you can plug in. Each sign-in adds a solar plant and assemblers (docs/PRODUCT.md).
const SLOTS = POWER.slots;

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
  const [caption, setCaption] = useState<{ title: string; sub: string }>({ title: MAP.captionTitle, sub: MAP.captionSub });
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
// Sheets nobody needs on the first screen load on their own; they're fetched once the browser is idle.
const loadCheckIn = () => import("./ui/CheckIn");
const loadHowItThinks = () => import("./ui/HowItThinks");
const CheckIn = lazy(() => loadCheckIn().then((m) => ({ default: m.CheckIn })));
const HowItThinks = lazy(() => loadHowItThinks().then((m) => ({ default: m.HowItThinks })));
const whenIdle = (f: () => void) => ("requestIdleCallback" in window ? requestIdleCallback(f, { timeout: 4000 }) : setTimeout(f, 2500));
whenIdle(() => void (loadCheckIn(), loadHowItThinks()));

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
  // Progression: level, streak, unlocks, morning brief. ?progress=1 until it's on by default.
  const [progressing] = useState(() => !intro && progressOn());
  const profile = progressProfile(cfg.kind, login);
  const prog = useProgress(state, profile, cfg.kind === "sim" ? `sim:${cfg.scenario}` : cfg.repo ?? "live", progressing && !tour.on);
  const brief = useBrief(progressing && !tour.on, !!state && state.districts.length > 0, profile);
  const nudge = useBottleneckNudge(deck, progressing);
  // today's log remembers the deck you walked in to (the morning number the trend is made of)
  useEffect(() => {
    if (progressing && state) prog.open(deck.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressing, !!state, deck.length > 0]);
  const [sheet, setSheet] = useState<"line" | "power" | "guide" | "yours" | "thinks" | "research" | "progress" | "empire" | null>(() => (new URLSearchParams(location.search).has("thinks") ? "thinks" : null));
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
  const toggleSheet = (s: "line" | "power" | "guide" | "yours" | "thinks" | "research" | "progress" | "empire") => setSheet((v) => (v === s ? null : s));

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

  const settings = (
    <>
      <button type="button" className="credit-btn" onClick={() => { setTray(false); setSheet("thinks"); }}>
        {SETTINGS.howItThinks}
      </button>
      <SoundControl />
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
          cosmetics={cosmeticsOf(prog.p, progressing)}

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
            {progressing && !tour.on && <ProgressChip p={prog.p} onOpen={() => toggleSheet("progress")} />}

            {empire.on && <IslandChip e={empire} open={sheet === "empire"} onToggle={() => { setPanel(null); toggleSheet("empire"); }} />}
            {show("score") && (
              <div className={progressing ? "chip desk" : "chip"} title={HUD.shippedTitle}>
                <span className="badge" style={{ background: "var(--amber)" }}>
                  <Icon name="rocket" size={14} />
                </span>
                <span>
                  {metrics?.rockets ?? shipped}
                  <small>{HUD.shipped}</small>
                </span>
              </div>
            )}
            {autonomy?.launches ? (
              // Live: how much of the shipping runs itself. Shows up after the first rocket.
              <div className="chip" title={permits.length ? HUD.automatedOn(permits.join(", ")) : HUD.automatedNone}>
                <span className="badge" style={{ background: "var(--blue)" }}>
                  <Icon name="bot" size={14} />
                </span>
                <span>
                  {Math.round((autonomy.automated ?? 0) * 100)}%
                  <small>{HUD.automated}</small>
                </span>
              </div>
            ) : show("autonomy") && autonomy && (
              <div
                className="chip"
                title={autonomy.next ? HUD.trustTo(autonomy.next.have, autonomy.next.need, autonomy.next.label, LEVEL_LABEL[autonomy.next.level]) : HUD.trustTop}
              >
                <span className="badge" style={{ background: "var(--blue)" }}>
                  <Icon name="bot" size={14} />
                </span>
                <span>
                  {autonomy.next ? `${autonomy.next.have}/${autonomy.next.need}` : LEVEL_LABEL[autonomy.level]}
                  <small>{autonomy.next ? HUD.toLevel(LEVEL_LABEL[autonomy.next.level]) : HUD.trust}</small>
                </span>
              </div>
            )}
            {show("score") && metrics && (
              <div className="chip desk" title={HUD.scoreTitle}>
                <span className="badge" style={{ background: "var(--green)" }}>
                  <Icon name="star" size={14} />
                </span>
                <span>
                  {metrics.shipScore.toLocaleString()}
                  <small>{HUD.score}</small>
                </span>
              </div>
            )}
          </div>
          {!world && show("checkin") && deck.length > 1 && !checkin && (
            <button type="button" className="checkin-chip" onClick={() => setCheckin(true)} aria-label={HUD.checkinLabel(deck.length)}>
              {HUD.checkinChip(deck.length)}
            </button>
          )}
          <button
            type="button"
            className={`hud-iconbtn guide-btn${met.size > seenGuide ? " new" : ""}`}
            aria-pressed={sheet === "guide"}
            onClick={() => { setSeenGuide(met.size); toggleSheet("guide"); }}
            aria-label={HUD.guideLabel(met.size)}
            title={HUD.guideTitle(met.size)}
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
              aria-label={HUD.researchLabel}
              title={HUD.researchTitle}
            >
              <Icon name="flask" size={20} />
            </button>
          )}
          <button type="button" className="hud-iconbtn" aria-label={HUD.activityLabel(waiting)} aria-expanded={tray} onClick={() => setTray((v) => !v)}>
            {waiting > 0 && <span className="n">{waiting}</span>}
            <Icon name="bell" size={20} />
          </button>
        </header>

        {world && (
          <div className="lens" role="group" aria-label={HUD.view}>
            <button type="button" aria-pressed={world === "checkin"} onClick={() => { setWorld("checkin"); setSheet(null); if (deck.length > 1) setCheckin(true); }}>
              {HUD.checkin}{deck.length > 0 && <span className="lens-n">{deck.length}</span>}
            </button>
            <button type="button" aria-pressed={world === "build"} onClick={() => { setWorld("build"); setCheckin(false); }}>
              {HUD.factory}
            </button>
          </div>
        )}

        {tour.lesson && (
          <section className="card coachcard" aria-label={HUD.tour}>
            <Coach lesson={tour.lesson} step={tour.step} total={tour.total} repo={state?.repo ?? WORDS.yourRepo} onDismiss={tour.dismiss} onSkip={tour.skip} />
          </section>
        )}

        {fork && state ? (
          <section className="card nextmove firstread" aria-label={FORK.label}>
            <div className="nm-head">
              <span className="nm-kicker">{FORK.kicker(state.repo)}</span>
            </div>
            <h2>
              {state.bottleneck?.summary
                ? FORK.bottleneck(state.bottleneck.summary)
                : FORK.scanned(state.districts.length)}
            </h2>
            <div className="opts">
              <button type="button" className="btn rec" onClick={() => { setWorld("checkin"); if (deck.length > 1) setCheckin(true); }}>
                {FORK.checkin}
                <small>{FORK.checkinSub}</small>
              </button>
              <button type="button" className="btn" onClick={() => setWorld("build")}>
                {FORK.factory}
                <small>{FORK.factorySub}</small>
              </button>
            </div>
            <p className="empty">{FORK.switch}</p>
          </section>
        ) : brief.show && progressing && !checkin && !sheet ? (
          <MorningBrief p={prog.p} deck={deck} onCheckin={() => { brief.close(); setCheckin(true); }} onClose={brief.close} />
        ) : sheet === "progress" ? (
          <ProgressSheet p={prog.p} notify={nudge.notify} onNotify={nudge.toggleNotify} onEquip={prog.equip} onClose={() => setSheet(null)} />
        ) : source && state ? (
          <ConnectSource kind={source} state={state} send={send} onClose={() => setSource(null)} />
        ) : sheet === "yours" && state ? (
          <MakeItYours state={state} send={send} onClose={() => setSheet(null)} />
        ) : sheet === "thinks" ? (
          <Suspense fallback={null}>
            <HowItThinks brain={state?.brain} onClose={() => setSheet(null)} />
          </Suspense>
        ) : sheet === "empire" ? (
          <EmpireSheet e={empire} live={cfg.kind === "live"} onClose={() => setSheet(null)} />
        ) : sheet === "research" && state ? (
          <Research state={state} send={send} onClose={() => setSheet(null)} onResearched={(tech) => { setSheet(null); setLanding(checkStationId(tech)); }} />
        ) : sheet === "guide" ? (
          <FieldGuide met={met} onClose={() => setSheet(null)} />
        ) : checkin ? (
          <Suspense fallback={null}>
            <CheckIn
              deck={deck}
              autonomy={autonomy}
              send={send}
              onFocus={setFocus}
              onClose={() => { setCheckin(false); setFocus(null); }}
              onAnswered={progressing ? prog.card : undefined}
              end={progressing ? (<><DayTally p={prog.p} /><DeckTrend p={prog.p} /></>) : undefined}
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
                    <span className="meter" role="meter" aria-label={`${p.name} headroom`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                      <i style={{ width: `${pct}%`, background: POWER_COLOR[p.kind] }} />
                    </span>
                    <span className="plant-num">{p.online ? `${pct}% left` : POWER.offline}</span>
                    <span className="plant-num">
                      {p.jobs} {p.kind === "steam" ? (p.jobs === 1 ? "decision" : "decisions") : p.jobs === 1 ? "job" : "jobs"}
                    </span>
                  </div>
                  {p.kind === "geothermal" && <p className="plant-note">{GEO_EXPLAINER}</p>}
                </div>
              );
            })}
            <button type="button" className="credit-btn" onClick={() => setSheet("thinks")}>{POWER.howItThinks}</button>
            {cfg.kind === "live" && state?.repo && (
              <button type="button" className="credit-btn" onClick={async () => {
                try {
                  const response = await fetch(`/api/repos/${state.repo}/runner/revoke`, { method: "POST" });
                  if (!response.ok) throw new Error("Revoke failed");
                } catch { window.alert(POWER.unplugFailed); }
              }}>{POWER.unplug}</button>
            )}

            {SLOTS.filter((sl) => !state?.power.some((p) => p.name === sl.name)).map((sl) => {
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
        ) : (
          <NextMove move={state?.move} bottleneck={state?.bottleneck} stations={state?.stations} send={send} onOpen={setPanel} onPower={cfg.kind === "live" ? () => setSheet("power") : undefined} />
        )}

        {!checkin && (
        <nav className="dock" aria-label={HUD.dock.label}>
          <button type="button" className="tool" aria-pressed={sheet === "line"} onClick={() => toggleSheet("line")} disabled={!show("line")}>
            {show("line") && inFlight.length + pad.length > 0 && <span className="n">{inFlight.length + pad.length}</span>}
            <Icon name="list" size={20} />
            {HUD.dock.line}
          </button>
          {world !== "checkin" && show("build") && (metrics?.rockets ?? shipped) > 0 && (
            <button type="button" className="tool" aria-pressed={sheet === "yours"} onClick={() => toggleSheet("yours")}>
              <Icon name="wrench" size={20} />
              {HUD.dock.yours}
            </button>
          )}
          {world !== "checkin" && (
          <button type="button" className="tool" aria-pressed={sheet === "power"} onClick={() => toggleSheet("power")} disabled={!show("power")}>
            <Icon name="bolt" size={20} />
            {HUD.dock.power}
          </button>
          )}
          <button type="button" className="tool big" onClick={launch} disabled={!show("launch") || pad.length === 0} aria-label={HUD.dock.launchLabel} title={HUD.dock.launchTitle}>
            <Icon name="rocket" size={20} />
            {HUD.dock.launch}
          </button>
          {world === "checkin" ? (
          <button type="button" className="tool big go" onClick={() => setCheckin(true)} disabled={deck.length === 0} aria-label={HUD.dock.checkinLabel(deck.length)}>
            {deck.length > 0 && <span className="n">{deck.length}</span>}
            <Icon name="list" size={20} />
            {HUD.checkin}
          </button>
          ) : (
          <button
            type="button"
            className="tool big go"
            onClick={build}
            disabled={!show("build") || !slot || !plugged || cfg.kind === "live"}
            aria-label={plugged ? HUD.dock.placeLabel(plugged.name) : HUD.dock.placeNeedsPower}
            title={plugged ? HUD.dock.placeTitle(plugged.name) : HUD.dock.placeNeedsPowerTitle}
          >
            <Icon name="bot" size={20} />
            {HUD.dock.place}
          </button>
          )}
        </nav>
        )}

        {panel && state && <StationPanel id={panel} state={state} log={log} send={send} onClose={() => setPanel(null)} jobs={powerJobs.current} />}

        {progressing && <XpPop pop={prog.pop} />}

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
