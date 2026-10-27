import { introEnabled } from "../flags";
// The first screens of the game (docs/PRODUCT.md, Onboarding): the welcome tour, then play first, sign in later.
// A signed-out player goes straight to the demo shop (onPlay); signing in with GitHub is the unlock that brings
// the repo step here. Then the map takes over: the planner scans the repo, proposes the starter factory, and asks for power.
// In the sim, sign-in is pretend and the repos are fake. Live sign-in goes through the GitHub App.

import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { App } from "../App";
import type { SourceConfig } from "../source";
import { IslandBackdrop } from "./IslandBackdrop";
import { savePref, seedPrefs, signInUrl, type PrefKey } from "../account";
import { CREDIT, ONBOARD } from "../copy";
import { Icon, type IconName } from "./icons";
import { Wordmark } from "./Logo";
import "./onboarding.css";

// An older phone without WebGL must still be able to sign in.
class IslandFallback extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

export type OnboardStep = "hello" | "intro" | "repo";

interface Repo {
  fullName: string;
  blurb: string;
  issues?: number; // omitted when the server has not fetched an actual count
}

// Only the sandbox uses sample repositories; live reads the App's installed repos.
const SIM_REPOS: Repo[] = [
  { fullName: "you/demo-shop", blurb: ONBOARD.simRepoBlurb, issues: 3 },
];

// The welcome tour plays on the real map, a demo shop in the sim (ui/IntroTour.tsx). New players see it
// first, once per browser (Justin approved it, 2026-10-26). ?intro=1 replays it, ?intro=0 skips it.
const TOUR: SourceConfig = { kind: "sim", repo: "", scenario: "intro" };
const INTRO_PARAM = new URLSearchParams(location.search).get("intro");
// Storage can be off (private windows), so seen fails open: the tour plays again, which is fine.
function introSeen() {
  if (INTRO_PARAM === "0") return true;
  if (INTRO_PARAM === "1") return false;
  try {
    return localStorage.getItem("shiptorio:intro") === "1";
  } catch {
    return false;
  }
}
function markIntroSeen() {
  savePref("intro", "1");
  try {
    localStorage.setItem("shiptorio:intro", "1");
  } catch {
    // replays next time, which is fine
  }
}

function Coach({ children }: { children: React.ReactNode }) {
  return (
    <div className="ob-spark">
      <p>{children}</p>
    </div>
  );
}

const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// The brand wordmark (ui/Logo.tsx) heads the plate, as the sign over the foundry gate.
function BrandWordmark() {
  return (
    <h1 className="ob-wordmark">
      <Wordmark width={420} />
    </h1>
  );
}

// GitHub's mark as a 12×12 pixel sprite, so it sits in the Black Iron button like the rest of the icons.
const GH = [
  "....####....",
  "..########..",
  ".##.####.##.",
  ".##......##.",
  "###......###",
  "###......###",
  "####....####",
  "#.###..#####",
  ".#.##..####.",
  ".##....####.",
  "..##...###..",
  "....#..#....",
];
function GitHubMark() {
  return (
    <svg className="ob-gh" width={24} height={24} viewBox="0 0 12 12" fill="currentColor" aria-hidden="true" shapeRendering="crispEdges">
      {GH.flatMap((row, y) => [...row].map((c, x) => (c === "#" ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} /> : null)))}
    </svg>
  );
}

// The shift clock's readout: the real time, so punching in feels like punching in.
function useClock() {
  const fmt = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const [now, setNow] = useState(fmt);
  useEffect(() => {
    const t = setInterval(() => setNow(fmt()), 10000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const JOURNEY_ICONS: IconName[] = ["ore", "cog", "check", "rocket"];

function Journey() {
  return (
    <ol className="ob-journey" aria-label={ONBOARD.journeyLabel}>
      {ONBOARD.journey.map((j, n) => (
        <li key={j.k} className={`ob-stop s${n}`}>
          <Icon name={JOURNEY_ICONS[n]} size={16} />
          <b>{j.k}</b>
          <span>{j.d}</span>
        </li>
      ))}
    </ol>
  );
}

// onPlay: a bare visit. Nobody signed in goes to the demo shop instead of the sign-in card.
export function Onboarding({ live, step: initial, onDone, onPlay }: { live: boolean; step: OnboardStep; onDone: (repo: string) => void; onPlay?: () => void }) {
  // the tour comes first, before anyone's asked to sign in (playtest #107)
  const [step, setStep] = useState<OnboardStep>(introEnabled && initial === "hello" && !introSeen() ? "intro" : initial === "intro" && (!introEnabled || INTRO_PARAM === "0") ? "repo" : initial);
  const [login, setLogin] = useState<string | null | undefined>(live ? undefined : "you"); // undefined: still asking /api/me
  const [repos, setRepos] = useState<Repo[] | null>(live ? null : SIM_REPOS);
  const [typed, setTyped] = useState("");
  const [installUrl, setInstallUrl] = useState<string | null>(null);
  const [reposFailed, setReposFailed] = useState(false);
  const [punched, setPunched] = useState(false); // the card is in the clock: sign-in is on its way
  const [chosen, setChosen] = useState<string | null>(null);
  const [find, setFind] = useState("");
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) => {
    if (reducedMotion()) return fn();
    timers.current.push(window.setTimeout(fn, ms));
  };
  const now = useClock();

  // The sandbox has no real sign-in to wait for: a bare visit just plays.
  useEffect(() => {
    if (!live && step === "hello") onPlay?.();
  }, [live, step]);

  // Live: who is signed in and which repositories the existing App installation can see.
  useEffect(() => {
    if (!live) return;
    fetch("/api/me")
      .then((r) => r.json() as Promise<{ login: string | null; installUrl?: string | null; prefs?: Partial<Record<PrefKey, string>> }>)
      .then((me) => {
        setLogin(me.login);
        setInstallUrl(me.installUrl ?? null);
        seedPrefs(me.prefs);
        // repos only for a real account: a guest (or nobody) gets the demo shop, and /api/repos would refuse them
        if (me.login) loadRepos();
        else setRepos((r) => r ?? []);
        if (me.login && step === "hello") setStep("repo");
        else if (!me.login && step === "hello") onPlay?.();
      })
      .catch(() => { setLogin(null); if (step === "hello") onPlay?.(); });
  }, [live]);

  const loadRepos = () =>
    fetch("/api/repos", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ repos: Repo[] }>) : Promise.reject()))
      .then((d) => { setRepos(d.repos); setReposFailed(false); })
      .catch(() => { setRepos((r) => r ?? []); setReposFailed(true); });

  // A brand-new player installs the App in another tab. GitHub's install webhook adds the repo to their
  // account, so keep looking while the list is empty instead of asking them to sign in again.
  const waiting = live && !!login && step === "repo" && repos !== null && repos.length === 0;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(loadRepos, 3000);
    // coming back to this tab from GitHub's checks right away
    const back = () => { if (document.visibilityState === "visible") loadRepos(); };
    window.addEventListener("focus", loadRepos);
    document.addEventListener("visibilitychange", back);
    return () => { clearInterval(timer); window.removeEventListener("focus", loadRepos); document.removeEventListener("visibilitychange", back); };
  }, [waiting]);

  // Punch the card first (a beat of animation), then go: GitHub when live, the repo step in the sim.
  const signIn = () => {
    if (punched) return;
    setPunched(true);
    later(() => {
      if (live) location.href = signInUrl();
      else setStep("repo");
    }, 720);
  };
  const pick = (repo: string) => {
    if (chosen) return;
    setChosen(repo);
    later(() => onDone(repo), 380);
  };
  const at = step === "intro" ? 0 : step === "hello" ? 1 : 2;
  const valid = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(typed.trim());
  const searchable = !!repos && repos.length >= 5;
  const needle = find.trim().toLowerCase();
  const shown = repos && (searchable && needle ? repos.filter((r) => r.fullName.toLowerCase().includes(needle)) : repos);

  if (step === "intro" && introEnabled) return <App config={TOUR} login={live ? login : null} onIntroDone={() => { markIntroSeen(); if (live && login) setStep("repo"); else if (onPlay) onPlay(); else setStep("hello"); }} />;

  // a bare visit: the hello card only shows when ?onboard=hello asks for it, never while we work out where to go
  if (step === "hello" && onPlay) return null;

  return (
    <div className="onboard">
      <IslandFallback><IslandBackdrop /></IslandFallback>
      <section className={`ob-card iron-plate iron-rivets ob-step-${step}`} aria-label={ONBOARD.label}>
        <div className="ob-steps" aria-hidden="true">
          {ONBOARD.steps.map((s, n) => (
            <span key={s} className={n === at ? "on" : n < at ? "done" : undefined}>
              <i />{s}
            </span>
          ))}
        </div>

        {step === "hello" && (
          <>
            <p className="iron-eyebrow ob-eyebrow">{ONBOARD.eyebrow}</p>
            <BrandWordmark />
            <p className="ob-tagline">{ONBOARD.tagline}</p>
            <Coach>{ONBOARD.hello}</Coach>

            <div className={`ob-clock${punched ? " punched" : ""}`} aria-hidden="true">
              <div className="ob-readout">
                <small>{punched ? ONBOARD.clockedIn : ONBOARD.clockLabel}</small>
                <b>{now}</b>
              </div>
              <div className="ob-slot">
                <div className="ob-punchcard">
                  <span className="ob-pc-top">{ONBOARD.card}</span>
                  <span className="ob-pc-holes">{Array.from({ length: 16 }, (_, n) => <i key={n} className={[1, 4, 6, 9, 11, 14].includes(n) ? "x" : undefined} />)}</span>
                  <span className="ob-pc-name">{ONBOARD.cardName}</span>
                  <span className="ob-pc-stamp">{ONBOARD.clockedIn}</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              className="ob-lever"
              onClick={signIn}
              aria-busy={punched || undefined}
              autoFocus={typeof matchMedia === "undefined" || !matchMedia("(pointer: coarse)").matches}
            >
              <GitHubMark />
              <span>{ONBOARD.signIn}</span>
            </button>

            <Journey />

            <div className="ob-foot">
              <button hidden={!introEnabled} type="button" className="ob-replay" onClick={() => setStep("intro")}>
                {ONBOARD.replay}
              </button>
              {!live && <p className="ob-sim-note">{ONBOARD.simNote}</p>}
              <p className="ob-credit">{CREDIT}</p>
            </div>
          </>
        )}

        {step === "repo" && (
          <>
            <p className="iron-eyebrow ob-eyebrow">{ONBOARD.pickEyebrow}</p>
            <h2 className="iron-title ob-pick-title">{ONBOARD.pickTitle}</h2>
            <Coach>
              {login ? ONBOARD.pickHey(login) : ""}{ONBOARD.pickAsk}{live ? ONBOARD.pickLive : ONBOARD.pickSim}
            </Coach>
            {repos === null && (
              <p className="ob-status" role="status">
                <span className="iron-state" data-s="WORKING">{ONBOARD.looking}</span>
              </p>
            )}
            {live && reposFailed && (
              <div className="ob-alarm" role="alert">
                <span className="ob-lamp bad" />
                <div>
                  <b>{ONBOARD.failed}</b>
                  <span>{ONBOARD.failedHelp}</span>
                </div>
                <button type="button" className="iron-btn" onClick={() => void loadRepos()}>
                  {ONBOARD.retry}
                </button>
              </div>
            )}
            {waiting && !reposFailed && (
              // First visit: nothing installed yet. This is the one thing to do, so it's the big button.
              <div className="ob-install">
                <a className="ob-lever" href={installUrl ?? "https://github.com/settings/installations"} target="_blank" rel="noreferrer">
                  <GitHubMark />
                  <span>{ONBOARD.installCta}</span>
                </a>
                <p className="ob-help">{ONBOARD.installHelp}</p>
                <p className="ob-status" role="status">
                  <span className="iron-state" data-s="BLOCKED">{ONBOARD.installWaiting}</span>
                </p>
              </div>
            )}
            {searchable && (
              <input
                className="iron-input ob-find"
                type="search"
                aria-label={ONBOARD.find}
                placeholder={ONBOARD.findPlaceholder}
                value={find}
                onChange={(e) => setFind(e.target.value)}
                spellCheck={false}
              />
            )}
            {shown && shown.length > 0 && (
              <ul className="ob-repos">
                {shown.map((r) => {
                  const lamp = typeof r.issues === "number" ? (r.issues ? "open" : "clear") : "ready";
                  return (
                    <li key={r.fullName}>
                      <button
                        type="button"
                        className={`ob-repo${chosen === r.fullName ? " chosen" : ""}`}
                        onClick={() => pick(r.fullName)}
                        aria-pressed={chosen === r.fullName}
                        disabled={!!chosen && chosen !== r.fullName}
                      >
                        <span className={`ob-lamp ${lamp}`} aria-hidden="true" />
                        <span className="ob-repo-text">
                          <b>{r.fullName}</b>
                          <i>
                            {r.blurb}{typeof r.issues === "number" && ONBOARD.issues(r.issues)}
                          </i>
                        </span>
                        <span className="ob-repo-tag" aria-hidden="true">
                          {typeof r.issues === "number" ? ONBOARD.lampOpen(r.issues) : ONBOARD.lampUnknown}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {searchable && needle && shown?.length === 0 && <p className="ob-help" role="status">{ONBOARD.noMatch(find.trim())}</p>}
            {live && reposFailed && (
              // only when the list couldn't load: the server still checks the player can reach the repo
              <form
                className="ob-type"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (valid) onDone(typed.trim());
                }}
              >
                <input
                  className="iron-input"
                  aria-label={ONBOARD.repoLabel}
                  placeholder="owner/name"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  spellCheck={false}
                  autoFocus
                />
                <button type="submit" className="iron-btn primary" disabled={!valid}>
                  {ONBOARD.open}
                </button>
              </form>
            )}
            {!waiting && <p className="ob-help">
              {/* the list is the repos your GitHub account reaches through the App; installing on more adds them */}
              {ONBOARD.notThere}<a href={installUrl ?? "https://github.com/settings/installations"}>{ONBOARD.install}</a>{ONBOARD.onRepo}
              {live && login ? <>{ONBOARD.then}<a href={signInUrl()}>{ONBOARD.refresh}</a></> : ONBOARD.first}.
            </p>}
          </>
        )}
      </section>
      <nav aria-label="Skip">
        <a className="ob-skip" href="?source=sim&scenario=quiet-morning">
          {ONBOARD.skip}
        </a>
      </nav>
    </div>
  );
}
