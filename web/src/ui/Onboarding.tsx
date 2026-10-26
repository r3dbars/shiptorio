import { introEnabled } from "../flags";
// The first screens of the game (docs/PRODUCT.md, Onboarding): sign in with GitHub, pick a repo.
// Then the map takes over: the planner scans the repo, proposes the starter factory, and asks for power.
// In the sim, sign-in is pretend and the repos are fake. Live sign-in goes through the GitHub App.

import { Component, useEffect, useState, type ReactNode } from "react";
import { App } from "../App";
import type { SourceConfig } from "../source";
import { IslandBackdrop } from "./IslandBackdrop";
import { savePref, seedPrefs, type PrefKey } from "../account";
import { CREDIT, ONBOARD } from "../copy";

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

export function Onboarding({ live, step: initial, onDone }: { live: boolean; step: OnboardStep; onDone: (repo: string) => void }) {
  // the tour comes first, before anyone's asked to sign in (playtest #107)
  const [step, setStep] = useState<OnboardStep>(introEnabled && initial === "hello" && !introSeen() ? "intro" : initial === "intro" && (!introEnabled || INTRO_PARAM === "0") ? "repo" : initial);
  const [login, setLogin] = useState<string | null>(live ? null : "you");
  const [repos, setRepos] = useState<Repo[] | null>(live ? null : SIM_REPOS);
  const [typed, setTyped] = useState("");
  const [installUrl, setInstallUrl] = useState<string | null>(null);

  // Live: who is signed in and which repositories the existing App installation can see.
  useEffect(() => {
    if (!live) return;
    fetch("/api/me")
      .then((r) => r.json() as Promise<{ login: string | null; installUrl?: string | null; prefs?: Partial<Record<PrefKey, string>> }>)
      .then((me) => {
        setLogin(me.login);
        setInstallUrl(me.installUrl ?? null);
        seedPrefs(me.prefs);
        if (me.login && step === "hello") setStep("repo");
      })
      .catch(() => setLogin(null));
    fetch("/api/repos")
      .then((r) => (r.ok ? (r.json() as Promise<{ repos: Repo[] }>) : Promise.reject()))
      .then((d) => setRepos(d.repos))
      .catch(() => setRepos([]));
  }, [live]);

  const signIn = () => {
    if (live) location.href = `/auth/login?next=${encodeURIComponent("/?onboard=repo&source=live")}`;
    else setStep("repo");
  };
  const at = step === "intro" ? 0 : step === "hello" ? 1 : 2;
  const valid = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(typed.trim());

  if (step === "intro" && introEnabled) return <App config={TOUR} login={live ? login : null} onIntroDone={() => { markIntroSeen(); setStep(live && login ? "repo" : "hello"); }} />;

  return (
    <div className="onboard">
      <IslandFallback><IslandBackdrop /></IslandFallback>
      <section className="card ob-card" aria-label={ONBOARD.label}>
        <div className="ob-steps" aria-hidden="true">
          {ONBOARD.steps.map((s, n) => (
            <span key={s} className={n === at ? "on" : n < at ? "done" : undefined}>
              {n + 1} {s}
            </span>
          ))}
        </div>

        {step === "hello" && (
          <>
            <div className="ptitle ob-title">{ONBOARD.brand}</div>
            <p className="psub">{ONBOARD.tagline}</p>
            <Coach>{ONBOARD.hello}</Coach>
            <div className="nm-options">
              <button type="button" className="btn rec nm-btn" onClick={signIn} autoFocus={typeof matchMedia === "undefined" || !matchMedia("(pointer: coarse)").matches}>
                {ONBOARD.signIn}
              </button>
            </div>
            <button hidden={!introEnabled} type="button" className="linkish ob-replay" onClick={() => setStep("intro")}>
              {ONBOARD.replay}
            </button>
            {!live && <p className="psub ob-sim-note">{ONBOARD.simNote}</p>}
            <p className="ob-credit">{CREDIT}</p>
          </>
        )}

        {step === "repo" && (
          <>
            <div className="ptitle small">{ONBOARD.pickTitle}</div>
            <Coach>
              {login ? ONBOARD.pickHey(login) : ""}{ONBOARD.pickAsk}{live ? ONBOARD.pickLive : ONBOARD.pickSim}
            </Coach>
            {repos === null && <p className="psub">{ONBOARD.looking}</p>}
            {repos && repos.length > 0 && (
              <ul className="ob-repos">
                {repos.map((r) => (
                  <li key={r.fullName}>
                    <button type="button" className="ob-repo" onClick={() => onDone(r.fullName)}>
                      <b>{r.fullName}</b>
                      <i>
                        {r.blurb}{typeof r.issues === "number" && ONBOARD.issues(r.issues)}
                      </i>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {live && (
              <form
                className="ob-type"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (valid) onDone(typed.trim());
                }}
              >
                <input
                  aria-label={ONBOARD.repoLabel}
                  placeholder="owner/name"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  spellCheck={false}
                  autoFocus
                />
                <button type="submit" className="btn rec nm-btn" disabled={!valid}>
                  {ONBOARD.open}
                </button>
              </form>
            )}
            <p className="psub">
              {/* the list is the repos your GitHub account reaches through the App; installing on more adds them */}
              {ONBOARD.notThere}<a href={installUrl ?? "https://github.com/settings/installations"}>{ONBOARD.install}</a>{ONBOARD.onRepo}
              {live && login ? <>{ONBOARD.then}<a href={`/auth/login?next=${encodeURIComponent("/?onboard=repo&source=live")}`}>{ONBOARD.refresh}</a></> : ONBOARD.first}.
            </p>
          </>
        )}
      </section>
      <a className="ob-skip" href="?source=sim&scenario=quiet-morning">
        {ONBOARD.skip}
      </a>
    </div>
  );
}
