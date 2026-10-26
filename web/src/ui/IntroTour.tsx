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
import { sound } from "../sound/engine";

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

export const BEATS: Beat[] = [
  {
    kick: "Welcome",
    title: "Welcome to *Shiptorio*.",
    body: "This floating island is a codebase. Every building is a folder. This sandbox uses a demo shop and sample changes; your repo comes next.",
  },
  {
    kick: "AI builds now",
    title: "Your agents are *fast*.",
    body: "Claude and Codex write fixes and features all day. These sample crates show how your agents turn a plan into a change.",
    cue: "build",
  },
  {
    kick: "Today",
    title: "And you're the *approve button*.",
    body: "Every change stops at the merge gate and waits for your yes. Does it work? Is it safe? Ship it? The pile only grows.",
  },
  {
    kick: "Step 1 · Verify",
    title: "Checks make a yes *safe*.",
    body: "Before a crate reaches you, CI runs it, the verify bay proves the fix, and a second AI reviews it. You're not guessing anymore.",
    after: "One tap, because three checks already did the hard part. The more you verify, the less you have to look.",
    act: "ship",
  },
  {
    kick: "Step 2 · Automate",
    title: "Then hand it *off*.",
    body: "Here's the real goal. Docs PRs keep passing every check clean. Let them ship on their own.",
    after: "Now the safe stuff ships itself and only the risky crates wait for you. Every week a bit more runs alone, every step still checked.",
    act: "permit",
  },
  {
    kick: "The game",
    title: "The bottleneck *moves*.",
    body: "Clear one and the next shows up. Watch the verify bay: a /cart fix passed CI but still gets the total wrong.",
    after: "Now CI catches that kind of bug first. Every check you add means more can ship alone. Shiptorio finds the next one and suggests the fix.",
    act: "turret",
    cue: "catch",
  },
  {
    kick: "Connect more",
    title: "Every source is a *new mine*.",
    body: "GitHub brings issues. Sentry adds errors the moment users hit them. PostHog shows what people really do. Tap the Sentry mine.",
    after: "Errors arrive as ore now, and biters show where they hit. More sources, more to fix, more to automate.",
    act: "sentry",
  },
  {
    kick: "Where you're headed",
    title: "It runs *itself*.",
    body: "Verified, automated, growing. Bugs fixed before users notice. Features shipped while you sleep. You set the direction and check in when it asks.",
    cue: "lights",
  },
];

const VERIFY_TOUR = ["ci-1", "verify-1", "review-1"] as const;
const STAMPS = ["CI ✓", "Verified ✓", "AI review ✓"];
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
    : at === 1 ? state.items.some(i => i.state === "working" || i.state === "inspecting")
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

  // the camera, per beat
  const cam: TourCam = useMemo(() => {
    const f = (focus: string | null): TourCam => ({ focus, wide: null });
    const w = (wide: number): TourCam => ({ focus: null, wide });
    switch (at) {
      case 0:
        return w(0.85);
      case 1:
        return has("assembler-1") ? f("m:assembler-1") : w(0.85);
      case 2:
        return f("gate-1");
      case 3:
        return done ? f("m:launch-pad") : tourAt >= 0 && tourAt < 3 ? f(VERIFY_TOUR[tourAt]) : f("gate-1");
      case 4:
        return done ? w(0.8) : f("gate-1");
      case 5:
        return done && turret ? f(`m:${turret.id}`) : caught ? f("verify-1") : w(0.8);
      case 6:
        return sentry ? f("m:ore-sentry") : f("src:sentry");
      default:
        return w(1.0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, done, tourAt, !!caught, sentry, turret?.id, has("assembler-1")]);

  // a tap on the map: the Sentry mine is the beat-6 move
  const pick = (key: string | null) => {
    if (at === 6 && key === "src:sentry") act();
  };

  const auto = Math.round((state?.autonomy?.automated ?? 0) * 100);
  const actLabel =
    beat.act === "ship" ? (pad[0]?.prNumber ? `Ship #${pad[0].prNumber}` : "Ship it") :
    beat.act === "permit" ? "Let docs ship on their own" :
    beat.act === "turret" ? `Add a test turret on /${caught?.district ?? "cart"}` :
    beat.act === "sentry" ? "Connect Sentry" : "";
  const actReady = introCanAct(state, at, tourAt >= 3);

  let extra: ReactNode = null;
  if (at === 2) extra = (
    <div className="tour-pile">
      <b>{pad.length}</b> waiting on you at the merge gate
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
          <b>5 docs PRs shipped clean</b> this week, zero rework.
        </span>
      </div>
    );
  if (at === 7 && state?.metrics)
    extra = (
      <div className="tour-stats">
        <Stat n={rockets} label="shipped" />
        <Stat n={state.metrics.usersUnblocked} label="users helped" />
        <Stat n={auto} label="automated" suffix="%" />
      </div>
    );

  const card = (
    <section className="card nextmove tour" aria-label="Welcome tour">
      <div className="nm-head">
        <span className="nm-kicker tour-kick">Sandbox · {at === 0 && login ? `Welcome, @${login}` : beat.kick}</span>
        <span className="tour-step">
          {at + 1}/{BEATS.length}
        </span>
      </div>
      <div className="tour-words" key={at}>
        <Title text={beat.title} />
        <p className="nm-why tour-body" key={String(done)}>
          {done && beat.after ? beat.after : beat.body}
        </p>
        {extra}
      </div>
      <div className="nm-options">
        {beat.act && !done ? (
          <button type="button" className="btn rec tour-go" onClick={act} disabled={!actReady}>
            {actReady ? actLabel : beat.act === "turret" ? "Watch the verify bay…" : actLabel}
          </button>
        ) : (
          <button type="button" className="btn rec tour-go" onClick={next} disabled={!ready} autoFocus>
            {at === BEATS.length - 1 ? "Start your factory →" : ready ? "Next" : "…"}
          </button>
        )}
      </div>
    </section>
  );

  const top = (
    <header className="topbar tour-top">
      <div className="tour-segs" aria-label={`Step ${at + 1} of ${BEATS.length}`}>
        {BEATS.map((_, i) => (
          <i key={i} className={i < at ? "done" : i === at ? "now" : undefined} />
        ))}
      </div>
      {rockets > 0 && (
        <div className="chip" title="PRs merged">
          <span className="badge" style={{ background: "var(--amber)" }}>
            <Icon name="rocket" size={14} />
          </span>
          <span>
            {rockets}
            <small>shipped</small>
          </span>
        </div>
      )}
      {at >= 4 && (
        <div className="chip" title="Rockets that launched on their own">
          <span className="badge" style={{ background: "var(--blue)" }}>
            <Icon name="bot" size={14} />
          </span>
          <span>
            {auto}%<small>automated</small>
          </span>
        </div>
      )}
      <button type="button" className="checkin-chip tour-skip" onClick={onDone}>
        Skip
      </button>
    </header>
  );

  return { at, cam, card, top, pick, ping: at === 1 || at === 2 || (at === 5 && !!caught && !done), quiet: rockets > 1 };
}
