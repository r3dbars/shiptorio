// "Welcome to Shiptorio", played on the real map (docs/VISION.md, Goal log 2026-10-26). A demo shop's
// factory runs in the sim (scenario "intro") and eight beats walk through it: you're the approve button
// today; verify, then automate, and the factory runs more of itself every week. The player does the
// three moves that matter (ship a verified PR, give docs a launch permit, add a check, connect Sentry)
// and the camera shows each one land.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { FactoryState, WebToServer } from "@shiptorio/shared";
import type { SourceConfig } from "../source";
import { freeNear } from "./MakeItYours";
import { Icon } from "./icons";
import { Wordmark } from "./Logo";
import { sound } from "../sound/engine";
import { BEAT_COPY, HUD, TOUR } from "../copy";

// what the camera does: fly in on a pick key, or pull back over the island (bigger is further out)
export type TourCam = { focus: string | null; wide: number | null };

interface Beat {
  kick: string;
  title: string; // the phrase in *stars* is the amber one
  body: string;
  after?: string; // replaces body once the player's move lands
  act?: string; // the player's move; Next waits for it
  cue?: "build" | "catch" | "lights"; // what the sim does when the beat opens
}

// The words live in copy.ts (BEAT_COPY); this adds what the player does and what the sim cues, beat by beat.
const BEAT_MOVES: Pick<Beat, "act" | "cue">[] = [{}, { cue: "build" }, {}, { act: "ship" }, { act: "permit" }, { act: "turret", cue: "catch" }, { act: "sentry" }, { cue: "lights" }];
export const BEATS: Beat[] = BEAT_COPY.map((words, i) => ({ ...words, ...BEAT_MOVES[i] }));

const VERIFY_TOUR = ["ci-1", "verify-1", "review-1"] as const;
const STAMPS = TOUR.stamps;
const TOUR_MS = 1500;

function Title({ text }: { text: string }) {
  // word by word, the starred phrase in amber
  const parts = text.split(/(\*[^*]+\*[.,]?)/).flatMap((p) => (p.startsWith("*") ? [p] : p.split(/\s+/))).filter(Boolean);
  return (
    <h2 className="tour-title">
      {parts.map((w, i) => {
        const m = w.match(/^\*([^*]+)\*(.*)$/);
        return (
          <span key={i} className="w" style={{ animationDelay: `${120 + i * 60}ms` }}>
            {m ? (
              <>
                <em>{m[1]}</em>
                {m[2]}
              </>
            ) : (
              w
            )}{" "}
          </span>
        );
      })}
    </h2>
  );
}

function useCount(target: number) {
  const [n, setN] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const a = from.current;
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 700);
      const v = Math.round(a + (target - a) * (1 - Math.pow(1 - k, 3)));
      setN(v);
      from.current = v;
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return n;
}

function Stat({ n, label, suffix = "" }: { n: number; label: string; suffix?: string }) {
  const v = useCount(n);
  return (
    <div className="tour-stat">
      <b>
        {v.toLocaleString()}
        {suffix}
      </b>
      <span>{label}</span>
    </div>
  );
}

/** Explicitly local simulation: a live URL with intro flags never gains tour commands. */
export const introMode = (config: SourceConfig) => config.kind === "sim" && config.scenario === "intro";
export function introDone(state: FactoryState, at: number): boolean {
  return at === 3 ? (state.metrics?.rockets ?? 0) > 0
    : at === 4 ? !!state.autonomy?.districts.some(d => d.district === "docs" && d.permit)
    : at === 5 ? state.machines.some(m => m.type === "turret")
    : at === 6 ? state.machines.some(m => m.id === "ore-sentry") : false;
}
export function introNextReady(state: FactoryState | null, at: number, done: boolean): boolean {
  if (!state) return false;
  return at === 0 ? state.districts.length >= 4
    // the intro feed stops after a handful of items, so once they've all reached the pad nothing is working again:
    // anything built counts too, or Next would wait forever
    : at === 1 ? state.items.some(i => i.state === "working" || i.state === "inspecting" || i.state === "on_pad" || i.state === "launched")
    : at === 2 ? state.items.filter(i => i.state === "on_pad").length >= 2
    : BEATS[at]?.act ? done : true;
}
export function introCanAct(state: FactoryState | null, at: number, inspected: boolean): boolean {
  if (!state) return false;
  const action = BEATS[at]?.act;
  const caught = state.items.find(i => i.scars?.length && i.state !== "launched");
  return action === "ship" ? inspected && state.items.some(i => i.state === "on_pad")
    : action === "turret" ? !!caught && caught.state !== "inspecting" : !!action;
}
/** The UI and guided playtest send exactly the same ordinary simulator protocol. */
export function introCommand(state: FactoryState, at: number): WebToServer | null {
  const action = BEATS[at]?.act;
  if (action === "ship") { const item = state.items.find(i => i.state === "on_pad"); return item ? { type: "launch_pr", itemId: item.id } : null; }
  if (action === "permit") return { type: "set_autonomy", district: "docs", permit: true };
  if (action === "sentry") return { type: "connect_source", kind: "sentry" };
  if (action === "turret") {
    const ci = state.machines.find(m => m.id === "ci-1"), spot = ci && freeNear(state, ci.x, ci.y);
    const caught = state.items.find(i => i.scars?.length && i.state !== "launched");
    return spot ? { type: "place_machine", machineType: "turret", x: spot.x, y: spot.y, district: caught?.district ?? "cart" } : null;
  }
  return null;
}

export function useIntroTour(state: FactoryState | null, send: (m: WebToServer) => void, onDone: () => void, login?: string | null) {
  const [at, setAt] = useState(0);
  const [done, setDone] = useState(false); // this beat's move has landed
  const [tourAt, setTourAt] = useState(-1); // beat 3: which station the camera is on
  const beat = BEATS[at];
  const items = state?.items ?? [];
  const pad = items.filter((i) => i.state === "on_pad");
  const has = (id: string) => !!state?.machines.some((m) => m.id === id);
  const caught = items.find((i) => i.scars?.length && i.state !== "launched");
  const sentry = has("ore-sentry");
  const turret = state?.machines.find((m) => m.type === "turret");
  const rockets = state?.metrics?.rockets ?? 0;

  // the map pings and labels wear the tour's caution paint while it runs (styles.css "Welcome tour")
  // (the hook always runs; App passes a null state outside the intro, so only paint while the tour is live)
  const live = !!state;
  useEffect(() => {
    if (!live) return;
    document.documentElement.dataset.tour = "1";
    return () => void delete document.documentElement.dataset.tour;
  }, [live]);

  // each beat's cue for the sim, once
  const cued = useRef(new Set<number>());
  const acted = useRef(new Set<number>()); // double taps cannot ship the next crate or move a new turret
  useEffect(() => {
    if (!state || !beat.cue || cued.current.has(at)) return;
    cued.current.add(at);
    send({ type: "station_action", stationId: "intro", action: beat.cue });
  }, [at, beat.cue, send, state]);

  // sound: a whoosh as each card slides in, the warm finale on the last one, a chime when your move lands
  useEffect(() => {
    if (at === 0) return;
    sound.play(beat.cue === "lights" ? "finale" : "beat");
  }, [at]);
  useEffect(() => {
    if (done) sound.play("beat_done");
  }, [done]);
  useEffect(() => {
    const stamp = (["stamp_pass", "verify_pop", "review_stamp"] as const)[tourAt - 1];
    if (stamp) sound.play(stamp);
  }, [tourAt]);

  // beat 3: the camera walks the gauntlet while the stamps light up
  useEffect(() => {
    if (at !== 3) return setTourAt(-1);
    setTourAt(0);
    const ts = [1, 2, 3].map((n) => setTimeout(() => setTourAt(n), TOUR_MS * n));
    return () => ts.forEach(clearTimeout);
  }, [at]);

  // the move lands when the factory says so, not when the button is pressed
  useEffect(() => {
    if (!done && state && introDone(state, at)) setDone(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, at, done]);

  // Next waits for the beat to have something to show
  const ready = introNextReady(state, at, done);
  const act = () => {
    if (!state || !introCanAct(state, at, tourAt >= 3) || acted.current.has(at)) return;
    const command = introCommand(state, at);
    if (!command) return;
    acted.current.add(at);
    send(command);
  };
  const next = () => {
    if (at === BEATS.length - 1) return onDone();
    setDone(false);
    setAt(at + 1);
  };

  // the camera, per beat: always close on the one thing the beat is about, never the whole factory. The art is
  // revealed by playing, not by the tour (Justin's playtest, 2026-10-27).
  const cam: TourCam = useMemo(() => {
    const f = (focus: string | null): TourCam => ({ focus, wide: null });
    switch (at) {
      case 0:
        return f("src:github");
      case 1:
        return has("assembler-1") ? f("m:assembler-1") : f("src:github");
      case 2:
        return f("m:launch-pad");
      case 3:
        return done ? f("m:launch-pad") : tourAt >= 0 && tourAt < 3 ? f(VERIFY_TOUR[tourAt]) : f("m:launch-pad");
      case 4:
        return f("m:launch-pad");
      case 5:
        return done && turret ? f(`m:${turret.id}`) : f("verify-1");
      case 6:
        return sentry ? f("m:ore-sentry") : f("src:sentry");
      default:
        return f("m:launch-pad");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, done, tourAt, sentry, turret?.id, has("assembler-1")]);

  // a tap on the map: the Sentry mine is the beat-6 move
  const pick = (key: string | null) => {
    if (at === 6 && key === "src:sentry") act();
  };

  const auto = Math.round((state?.autonomy?.automated ?? 0) * 100);
  const actLabel =
    beat.act === "ship" ? TOUR.ship(pad[0]?.prNumber) :
    beat.act === "permit" ? TOUR.permit :
    beat.act === "turret" ? TOUR.turret(caught?.district ?? "cart") :
    beat.act === "sentry" ? TOUR.sentry : "";
  const actReady = introCanAct(state, at, tourAt >= 3);

  let extra: ReactNode = null;
  if (at === 2) extra = (
    <div className="tour-pile">
      <b>{pad.length}</b> {TOUR.pile}
    </div>
  );
  if (at === 3)
    extra = (
      <div className="tour-stamps">
        {STAMPS.map((s, i) => (
          <span key={s} className={`stamp${tourAt > i || done ? " on" : ""}`}>
            {s}
          </span>
        ))}
      </div>
    );
  if (at === 4 && !done)
    extra = (
      <div className="tour-ask">
        <Icon name="bot" size={16} />
        <span>
          <b>{TOUR.askLead}</b>{TOUR.askRest}
        </span>
      </div>
    );
  if (at === 7 && state?.metrics)
    extra = (
      <div className="tour-stats">
        <Stat n={rockets} label={TOUR.statShipped} />
        <Stat n={state.metrics.usersUnblocked} label={TOUR.statUsers} />
        <Stat n={auto} label={TOUR.statAuto} suffix="%" />
      </div>
    );

  const pad2 = (n: number) => String(n).padStart(2, "0");
  const card = (
    <section className="card nextmove tour" aria-label={TOUR.label} data-at={at} data-done={done || undefined}>
      <div className="nm-head tour-head">
        <span className="nm-kicker tour-kick">{TOUR.kicker(at === 0 && login ? TOUR.welcome(login) : beat.kick)}</span>
        {/* the beat counter: a brass odometer, read as words by screen readers */}
        <span className="tour-step tour-dial">
          <span className="sr">{TOUR.step(at + 1, BEATS.length)}</span>
          <span aria-hidden="true">
            <b key={at}>{pad2(at + 1)}</b>
            <i>/</i>
            {pad2(BEATS.length)}
          </span>
        </span>
      </div>
      <div className="tour-words" key={at}>
        {at === 0 && <Wordmark className="tour-wordmark" width={297} />}
        <Title text={beat.title} />
        <p className="nm-why tour-body" key={String(done)}>
          {done && beat.after ? beat.after : beat.body}
        </p>
        {extra}
      </div>
      <div className="nm-options">
        {beat.act && !done ? (
          <button type="button" className="btn rec tour-go" onClick={act} disabled={!actReady}>
            {actReady ? actLabel : beat.act === "turret" ? TOUR.watchVerify : actLabel}
          </button>
        ) : (
          <button type="button" className="btn rec tour-go" onClick={next} disabled={!ready} autoFocus>
            {at === BEATS.length - 1 ? TOUR.start : ready ? TOUR.next : TOUR.wait}
          </button>
        )}
        {at < BEATS.length - 1 && (
          <button type="button" className="tour-skip" onClick={onDone}>
            {TOUR.skip}
          </button>
        )}
      </div>
    </section>
  );

  const top = (
    <header className="topbar tour-top">
      <div className="tour-segs" role="progressbar" aria-label="Tour" aria-valuemin={1} aria-valuemax={BEATS.length} aria-valuenow={at + 1} aria-valuetext={TOUR.step(at + 1, BEATS.length)}>
        {BEATS.map((_, i) => (
          <i key={i} className={i < at ? "done" : i === at ? "now" : undefined} />
        ))}
      </div>
      {rockets > 0 && (
        <div className="chip" title={HUD.shippedTitle}>
          <span className="badge" style={{ background: "var(--amber)" }}>
            <Icon name="rocket" size={14} />
          </span>
          <span>
            {rockets}
            <small>{HUD.shipped}</small>
          </span>
        </div>
      )}
      {at >= 4 && (
        <div className="chip" title={TOUR.autoTitle}>
          <span className="badge" style={{ background: "var(--blue)" }}>
            <Icon name="bot" size={14} />
          </span>
          <span>
            {auto}%<small>{HUD.automated}</small>
          </span>
        </div>
      )}
    </header>
  );

  return { at, cam, card, top, pick, ping: at === 1 || at === 2 || (at === 5 && !!caught && !done), quiet: rockets > 1 };
}
