// Build as you go (web/src/buildout/CONTRACT.md, ?buildout=1): the first run is eight builds, one at a time, while a
// real first issue rides through them. This is the one card that guides each build: one line, then hold (or tap) to
// build. Later is on the left, the build on the right. On your own repo the steps that need something real (the
// repo, your AI, an issue) open the repo picker, runner pairing or sign-in instead of pretending. The counters stay
// hidden until the first rocket, then a "Look around" card frees the camera and turns them on.
import { useEffect, useRef, useState } from "react";
import { continueOption, type FactoryState, type WebToServer } from "@shiptorio/shared";
import { HoldGesture, type HoldClock } from "./holdLaunch";
import { RunnerConnection } from "./RunnerConnection";
import { signInUrl } from "../account";
import { sound } from "../sound/engine";
import { LOOK, STEPS, lineFor, onBuild, phaseAt, stepFrom, STARTER_ISSUE, type BuildPhase, type Step } from "../buildout/journey";
import "./buildout.css";

/** The card's own words. Coach lines and button text come from the journey. */
export const BUILDOUT = {
  label: "Build",
  step: (n: number, total: number) => `Build ${n} of ${total}`,
  later: "Later",
  again: "Again",
  building: "Building…",
  resume: (name: string) => `Next: ${name}`,
  name: {
    tunnel: "GitHub tunnel",
    boiler: "Boiler",
    builder: "Builder",
    issue: "First issue",
    planner: "Planner",
    build: "The build",
    checks: "Checks",
    launch: "Launch pad",
  } as Record<string, string>,
  auto: { build: "Writing it now", checks: "Checking it" } as Record<string, string>,
  // your own repo: the real thing behind each piece
  real: {
    useRepo: "Use your repo",
    pickRepo: "Pick your repo",
    pair: "Pair your AI",
    pairDone: "Hide",
    starter: "File a starter issue",
    starterWhy: `No small issue yet. Tap to file one: "${STARTER_ISSUE.title}".`,
    starterFiled: "Filed. It's coming up the tunnel.",
    starterFailed: "Couldn't file it. Try again in a bit.",
  },
  look: {
    kicker: "Factory online",
    title: "Look around",
    why: "Everything's built. Drag, zoom and tap anything. Up top: what's waiting on you, and what you shipped.",
    go: "Look around",
  },
};

const realClock: HoldClock = {
  now: () => performance.now(),
  raf: (cb) => requestAnimationFrame(cb),
  caf: (id) => cancelAnimationFrame(id),
  after: (ms, cb) => window.setTimeout(cb, ms),
  clear: (id) => window.clearTimeout(id),
};

// a build takes about 7 seconds; if the scene never says done (no WebGL, a stub), the card moves on anyway
const BUILD_FALLBACK_MS = 9000;
const HOLD_BUILD_MS = 900;

/** Hold to build: the same consent rules as the big red launch button (holdLaunch.ts), with its own words. */
export function BuildHold({ card, label, red, onBuild, clock = realClock }: { card: string; label: string; red?: boolean; onBuild: () => void; clock?: HoldClock }) {
  const [p, setP] = useState(0);
  const [armed, setArmed] = useState(false);
  const build = useRef(onBuild);
  build.current = onBuild;
  const gesture = useRef<HoldGesture | null>(null);
  if (!gesture.current)
    gesture.current = new HoldGesture(
      {
        progress: setP,
        arm: () => sound.play("arm"),
        cancel: () => sound.play("click"),
        confirm: (c) => setArmed(c !== null),
        launch: () => {
          navigator.vibrate?.(40);
          build.current();
        },
      },
      clock,
      HOLD_BUILD_MS,
    );
  const g = gesture.current;
  useEffect(() => g.retarget(card), [g, card]);
  useEffect(() => {
    const leave = () => g.cancel();
    const hidden = () => { if (document.visibilityState !== "visible") g.cancel(); };
    window.addEventListener("blur", leave);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("blur", leave);
      document.removeEventListener("visibilitychange", hidden);
      g.dispose();
    };
  }, [g]);
  const isKey = (e: React.KeyboardEvent) => e.key === " " || e.key === "Enter";
  return (
    <button
      type="button"
      className={`bo-hold${red ? " red" : ""}${p > 0 ? " down" : ""}${armed ? " armed" : ""}`}
      style={{ "--p": p } as React.CSSProperties}
      aria-label={armed ? `Press again: ${label}` : `Hold to ${label.toLowerCase()}`}
      data-buildout-action=""
      onPointerDown={(e) => {
        if (!e.isPrimary || e.button !== 0) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        g.press(card);
      }}
      onPointerUp={() => g.release()}
      onPointerCancel={() => g.cancel()}
      onLostPointerCapture={() => g.cancel()}
      onBlur={() => g.cancel()}
      onKeyDown={(e) => {
        if (!isKey(e)) return;
        e.preventDefault();
        if (!e.repeat) g.press(card);
      }}
      onKeyUp={(e) => {
        if (!isKey(e)) return;
        e.preventDefault();
        g.release();
      }}
      // a bare activation (screen reader, switch) arms, a second one builds
      onClick={(e) => { if (e.detail === 0) g.assistive(card); }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="cap" />
      <span className="lbl">{armed ? BUILDOUT.again : label}</span>
    </button>
  );
}

/** The build moment playing right now (the scene's shiptorio:build events): which piece, and its phase. */
function useBuildMoment() {
  const [moment, setMoment] = useState<{ id: string; phase: BuildPhase } | null>(null);
  useEffect(() => {
    let at = 0;
    let id = "";
    let timer = 0;
    const tick = () => {
      // the payoff is over: the moment ends even if the scene never says done
      const phase = phaseAt(performance.now() - at);
      if (phase === "done") window.clearInterval(timer);
      setMoment(phase === "done" ? null : { id, phase });
    };
    const off = onBuild((d) => {
      window.clearInterval(timer);
      if (d.phase === "done") return setMoment(null);
      if (d.phase === "start") {
        id = String(d.id);
        at = performance.now();
      } else if (String(d.id) === id) at = Math.min(at, performance.now() - 4500); // burst: at least the burst phase
      tick();
      timer = window.setInterval(tick, 250);
    });
    return () => {
      off();
      window.clearInterval(timer);
    };
  }, []);
  return moment;
}

export interface BuildoutProps {
  state: FactoryState;
  live: boolean; // your own repo (false: the demo shop)
  repo?: string;
  free: boolean; // the player already took "Look around"
  send: (m: WebToServer) => void;
  onLookAround: () => void;
}

/** The root every slice keys off (CONTRACT.md DOM hooks): data-buildout, data-step, data-phase while a build plays. */
export function Buildout({ state, live, repo, free, send, onLookAround }: BuildoutProps) {
  const where = stepFrom(state);
  const moment = useBuildMoment();
  // asked: you finished the hold for this step, so the card folds until the scene builds it (or a fallback passes)
  const [asked, setAsked] = useState<string | null>(null);
  useEffect(() => {
    if (!asked) return;
    const t = window.setTimeout(() => setAsked(null), BUILD_FALLBACK_MS);
    return () => window.clearTimeout(t);
  }, [asked]);
  useEffect(() => setAsked(null), [where.id]);
  const building = (moment && moment.phase !== "done") || asked === where.id;
  return (
    <div className="bo-root" data-buildout="" data-step={where.id} data-phase={moment?.phase}>
      {where.id === LOOK ? (
        !free && <LookAround onGo={onLookAround} />
      ) : building ? (
        <div className="bo-chip building" role="status">
          <span className="bo-dot" aria-hidden="true" />
          {BUILDOUT.name[moment?.id ?? where.id] ?? BUILDOUT.name[where.id]} · {BUILDOUT.building}
        </div>
      ) : (
        where.step && <BuildCard step={where.step} n={where.index + 1} state={state} live={live} repo={repo} send={send} onAsked={() => setAsked(where.id)} />
      )}
    </div>
  );
}

function LookAround({ onGo }: { onGo: () => void }) {
  return (
    <section className="card bo-card bo-look" role="region" aria-label={BUILDOUT.label} data-buildout-card="">
      <div className="bo-body">
        <span className="bo-kick">{BUILDOUT.look.kicker}</span>
        <h2 className="bo-title">{BUILDOUT.look.title}</h2>
        <p className="bo-line">{BUILDOUT.look.why}</p>
      </div>
      <button type="button" className="bo-tab" data-buildout-action="" onClick={onGo} autoFocus>
        {BUILDOUT.look.go}
      </button>
    </section>
  );
}

/** The ask behind each build: messages that already exist, so the sim (slice 7) and the server need no new protocol. */
function ask(step: Step, state: FactoryState, live: boolean, send: (m: WebToServer) => void) {
  const move = state.move;
  const pick = move && continueOption(move);
  if (step.id === "tunnel" && !live) send({ type: "connect_source", kind: "github" });
  else if (step.id === "planner" && move && pick) send({ type: "choose_move", moveId: move.id, optionId: pick.id });
  else if (step.id === "launch") {
    const item = state.items.find((i) => i.state === "on_pad") ?? state.items.find((i) => i.state === "passed");
    if (!item) return;
    if (live) item.prUrl && window.open(item.prUrl, "_blank", "noreferrer");
    else send({ type: "launch_pr", itemId: item.id });
  } else send({ type: "station_action", stationId: "buildout", action: step.id });
}

function BuildCard({ step, n, state, live, repo, send, onAsked }: { step: Step; n: number; state: FactoryState; live: boolean; repo?: string; send: (m: WebToServer) => void; onAsked: () => void }) {
  const [later, setLater] = useState<string | null>(null); // the step you put off; the card folds to a chip until tapped
  const [pairing, setPairing] = useState(false);
  const [starter, setStarter] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const [failLine, setFailLine] = useState("");
  // on your own repo the issue step asks the server which issue to start with (server/src/starterIssue.ts)
  const [pickLine, setPickLine] = useState<string | null>(null); // "Start with #10. Smallest and safest."
  const issueApi = repo && `/api/repos/${repo}/starter-issue`;
  useEffect(() => {
    setStarter("idle");
    setPairing(false);
    setPickLine(null);
    if (!live || step.id !== "issue" || !issueApi) return;
    let on = true;
    fetch(issueApi, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ kind: string; issue?: { reason?: string } }>) : null))
      .then((j) => { if (on && j?.kind === "existing") setPickLine(j.issue?.reason ?? ""); })
      .catch(() => {});
    return () => { on = false; };
  }, [step.id, live, issueApi]);
  const name = BUILDOUT.name[step.id] ?? step.id;
  if (later === step.id) {
    return (
      <button type="button" className="bo-chip" onClick={() => setLater(null)}>
        <span className="bo-dot" aria-hidden="true" />
        {BUILDOUT.resume(name)}
      </button>
    );
  }

  const go = () => {
    ask(step, state, live, send);
    onAsked();
  };
  const fileStarter = async () => {
    if (!issueApi) return;
    setStarter("busy");
    try {
      // filed only on this tap (it's your repo); a double tap gets the same issue back
      const res = await fetch(issueApi, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tapped: true }) });
      if (!res.ok) setFailLine(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "");
      setStarter(res.ok ? "done" : "failed");
    } catch {
      setStarter("failed");
    }
  };

  // The right side: the build itself, or on your own repo the real thing it needs first.
  let right: React.ReactNode;
  let extra: React.ReactNode = null;
  const action = step.action ?? "";
  if (live && step.id === "tunnel") {
    right = <a className="bo-tab" data-buildout-action="" href="/?onboard=repo&source=live">{BUILDOUT.real.pickRepo}</a>;
  } else if (live && step.id === "boiler") {
    // no fake power on your own repo: the boiler lights when your runner pairs
    right = <button type="button" className="bo-tab" data-buildout-action="" aria-expanded={pairing} onClick={() => setPairing((v) => !v)}>{pairing ? BUILDOUT.real.pairDone : BUILDOUT.real.pair}</button>;
    if (pairing && repo) extra = <div className="bo-pair"><RunnerConnection repo={repo} /></div>;
  } else if (live && step.id === "issue" && pickLine !== null) {
    // there's a good small issue already: hold to roll it out
    if (pickLine) extra = <p className="bo-real">{pickLine}</p>;
    right = <BuildHold card={step.id} label={action} onBuild={go} />;
  } else if (live && step.id === "issue") {
    extra = <p className="bo-real" role="status">{starter === "done" ? BUILDOUT.real.starterFiled : starter === "failed" ? failLine || BUILDOUT.real.starterFailed : BUILDOUT.real.starterWhy}</p>;
    right = starter === "done" ? <div className="bo-wait"><span className="bo-dot" aria-hidden="true" />{BUILDOUT.building}</div> : (
      <button type="button" className="bo-tab" data-buildout-action="" disabled={starter === "busy"} onClick={() => void fileStarter()}>
        {BUILDOUT.real.starter}
      </button>
    );
  } else if (step.trigger === "hold") {
    right = <BuildHold card={step.id} label={action} red={step.id === "launch"} onBuild={go} />;
  } else if (step.trigger === "tap" || step.trigger === "continue") {
    const waiting = step.id === "planner" && live && !state.move; // the real plan hasn't come back yet
    right = <button type="button" className="bo-tab" data-buildout-action="" disabled={waiting} onClick={go}>{action}</button>;
  } else {
    // auto: nothing to press, the work happens on its own (real waits stay real)
    right = (
      <div className="bo-wait" role="status">
        <span className="bo-dot" aria-hidden="true" />
        {BUILDOUT.auto[step.id] ?? BUILDOUT.building}
      </div>
    );
  }
  if (step.id === "tunnel" && !live) {
    // the demo shop's tunnel is preset; your own repo is one tap away (play first, #359)
    extra = (
      <p className="bo-real">
        <a href={signInUrl()}>{BUILDOUT.real.useRepo} ›</a>
      </p>
    );
  }

  return (
    <section className="card bo-card" role="region" aria-label={BUILDOUT.label} data-buildout-card="" data-trigger={step.trigger}>
      <button type="button" className="bo-later" onClick={() => setLater(step.id)} aria-label={`${BUILDOUT.later}: ${name}`}>
        {BUILDOUT.later}
      </button>
      <div className="bo-body">
        <span className="bo-kick">
          {BUILDOUT.step(n, STEPS.length)} · {name}
        </span>
        <p className="bo-line">{lineFor(step, live)}</p>
        {extra}
        <span className="bo-segs" aria-hidden="true">
          {STEPS.map((x, i) => <i key={x.id} className={i < n - 1 ? "done" : i === n - 1 ? "now" : undefined} />)}
        </span>
      </div>
      {right}
    </section>
  );
}

const FREE_KEY = "shiptorio:buildout-free";
/** Free look and the two counters, earned after the first rocket with the "Look around" card. Remembered. */
export function useFreeLook() {
  const [free, setFree] = useState(() => {
    try {
      return localStorage.getItem(FREE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const take = () => {
    setFree(true);
    sound.play("click");
    try {
      localStorage.setItem(FREE_KEY, "1");
    } catch {
      // this visit only
    }
  };
  return [free, take] as const;
}
