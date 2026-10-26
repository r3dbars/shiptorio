// The first screens of the game (docs/PRODUCT.md, Onboarding): sign in with GitHub, pick a repo.
// Then the map takes over: Spark scans the repo, proposes the starter factory, and asks for power.
// In the sim, sign-in is pretend and the repos are fake. Live sign-in goes through the GitHub App.

import { useEffect, useState } from "react";
import { Intro } from "./Intro";

export type OnboardStep = "hello" | "intro" | "repo";

interface Repo {
  fullName: string;
  blurb: string;
  issues: number;
}

// Sim stand-ins until the server lists the App's installed repos.
const SIM_REPOS: Repo[] = [
  { fullName: "r3dbars/shiptorio", blurb: "TypeScript · Cloudflare Worker + React", issues: 2 },
  { fullName: "you/demo-shop", blurb: "Next.js shop · Stripe test mode", issues: 3 },
  { fullName: "you/side-project", blurb: "Python CLI · no CI yet", issues: 0 },
];

// The welcome intro is off until it's rebuilt in the game's own art (Justin, 2026-10-26): ?intro=1 shows it.
// Storage can be off (private windows), so seen fails open.
const INTRO_ON = new URLSearchParams(location.search).get("intro") === "1";
function introSeen() {
  if (!INTRO_ON) return true;
  try {
    return localStorage.getItem("shiptorio:intro") === "1";
  } catch {
    return false;
  }
}
function markIntroSeen() {
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
  const [step, setStep] = useState<OnboardStep>(initial === "intro" && !INTRO_ON ? "repo" : initial);
  const [login, setLogin] = useState<string | null>(live ? null : "you");
  const [repos, setRepos] = useState<Repo[] | null>(live ? null : SIM_REPOS);
  const [typed, setTyped] = useState("");

  // Live: who's signed in, and which repos the App can see. No repo list on the server yet, so live falls
  // back to typing owner/name.
  useEffect(() => {
    if (!live) return;
    fetch("/api/me")
      .then((r) => r.json() as Promise<{ login: string | null }>)
      .then((me) => {
        setLogin(me.login);
        if (me.login && step === "hello") setStep(introSeen() ? "repo" : "intro");
      })
      .catch(() => setLogin(null));
    fetch("/api/repos")
      .then((r) => (r.ok ? (r.json() as Promise<{ repos: Repo[] }>) : Promise.reject()))
      .then((d) => setRepos(d.repos))
      .catch(() => setRepos([]));
  }, [live]);

  const signIn = () => {
    if (live) location.href = `/auth/login?next=${encodeURIComponent(INTRO_ON ? "/?onboard=intro&source=live&intro=1" : "/?onboard=repo&source=live")}`;
    else setStep(introSeen() ? "repo" : "intro");
  };
  const at = step === "hello" ? 0 : step === "intro" ? 1 : 2;
  const valid = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(typed.trim());

  if (step === "intro") return <Intro login={live ? login : null} onDone={() => { markIntroSeen(); setStep("repo"); }} />;

  return (
    <div className="onboard">
      <section className="card ob-card" aria-label="Welcome to Shiptorio">
        <div className="ob-steps" aria-hidden="true">
          {["SIGN IN", "WELCOME", "PICK A REPO", "BUILD"].map((s, n) => (
            <span key={s} className={n === at ? "on" : n < at ? "done" : undefined}>
              {n + 1} {s}
            </span>
          ))}
        </div>

        {step === "hello" && (
          <>
            <div className="ptitle ob-title">SHIPTORIO</div>
            <p className="psub">The factory must grow.</p>
            <Coach>
              Let's build your factory. Your factory is one codebase. We start small: one machine, one fix, one rocket, and each
              piece shows up when you need it.
            </Coach>
            <div className="nm-options">
              <button type="button" className="nm-btn rec" onClick={signIn} autoFocus>
                SIGN IN WITH GITHUB
              </button>
              {!live && <span className="psub">sim: no real sign-in</span>}
            </div>
            <p className="ob-credit">powered by Meta Muse Spark</p>
          </>
        )}

        {step === "repo" && (
          <>
            <div className="ptitle small">PICK A REPO</div>
            <Coach>
              {login ? `Hey ${login}. ` : ""}Which repo is the factory? We'll read its tree, open issues and CI, then suggest a starter line.
            </Coach>
            {repos === null && <p className="psub">Looking for repos…</p>}
            {repos && repos.length > 0 && (
              <ul className="ob-repos">
                {repos.map((r) => (
                  <li key={r.fullName}>
                    <button type="button" className="ob-repo" onClick={() => onDone(r.fullName)}>
                      <b>{r.fullName}</b>
                      <i>
                        {r.blurb} · {r.issues} open issue{r.issues === 1 ? "" : "s"}
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
                  aria-label="Repo, as owner/name"
                  placeholder="owner/name"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  spellCheck={false}
                  autoFocus
                />
                <button type="submit" className="nm-btn rec" disabled={!valid}>
                  OPEN
                </button>
              </form>
            )}
            <p className="psub">
              Not there? <a href="/setup">Install the Shiptorio app</a> on the repo first.
            </p>
          </>
        )}
      </section>
      <a className="ob-skip" href="?source=sim&scenario=quiet-morning">
        skip to the sandbox
      </a>
    </div>
  );
}
