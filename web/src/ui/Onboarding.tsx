// The first screens of the game (docs/PRODUCT.md, Onboarding): sign in with GitHub, pick a repo.
// Then the map takes over: Spark scans the repo, proposes the starter factory, and asks for power.
// In the sim, sign-in is pretend and the repos are fake. Live sign-in goes through the GitHub App.

import { useEffect, useState } from "react";

export type OnboardStep = "hello" | "repo";

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

function Spark({ children }: { children: React.ReactNode }) {
  return (
    <div className="ob-spark">
      <span className="who">SPARK</span>
      <p>{children}</p>
    </div>
  );
}

export function Onboarding({ live, step: initial, onDone }: { live: boolean; step: OnboardStep; onDone: (repo: string) => void }) {
  const [step, setStep] = useState<OnboardStep>(initial);
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
  const at = step === "hello" ? 0 : 1;
  const valid = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(typed.trim());

  return (
    <div className="onboard">
      <section className="card ob-card" aria-label="Welcome to Shiptorio">
        <div className="ob-steps" aria-hidden="true">
          {["SIGN IN", "PICK A REPO", "BUILD", "POWER"].map((s, n) => (
            <span key={s} className={n === at ? "on" : n < at ? "done" : undefined}>
              {n + 1} {s}
            </span>
          ))}
        </div>

        {step === "hello" && (
          <>
            <div className="ptitle ob-title">SHIPTORIO</div>
            <p className="psub">The factory must grow.</p>
            <Spark>
              I'm Spark. I run the floor and you call the shots. Sign in with GitHub and I'll turn your repo into a factory: folders become
              districts, issues become ore, and every merged PR is a rocket.
            </Spark>
            <div className="nm-options">
              <button type="button" className="nm-btn rec" onClick={signIn} autoFocus>
                SIGN IN WITH GITHUB
              </button>
              {!live && <span className="psub">sim: no real sign-in</span>}
            </div>
          </>
        )}

        {step === "repo" && (
          <>
            <div className="ptitle small">PICK A REPO</div>
            <Spark>
              {login ? `Hey ${login}. ` : ""}Which repo is the factory? I'll read its tree, open issues and CI, then propose a starter line.
            </Spark>
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
