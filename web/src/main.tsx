import { initTelemetry } from "./telemetry";
import { ErrorBoundary } from "./ErrorBoundary";
import { buildoutOn, loadFeatureFlags } from "./flags";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Judge } from "./judge/Judge";
import { App } from "./App";
import { Onboarding, type OnboardStep } from "./ui/Onboarding";
import { sound } from "./sound/engine";
import { SANDBOX_REPO, serverUp } from "./account";
import "./iron.css";
import "./styles.css";
import "./foundry.css";

sound.install();

// The demo shop a signed-out player plays in. Signing in with GitHub (the floor card's chip, or the card after
// the first rocket) is the unlock that brings their own repo.
// Build as you go (?buildout=1) is its own first run, so a bare visit with it lands on the empty rock instead.
const SANDBOX = buildoutOn()
  ? `?buildout=1&source=sim&scenario=buildout&repo=${encodeURIComponent(SANDBOX_REPO)}`
  : `?source=sim&scenario=first-run&repo=${encodeURIComponent(SANDBOX_REPO)}`;

// Play first, sign in later. A bare visit plays the welcome tour once, then drops a signed-out player
// straight into the demo shop; a signed-in one goes to their repos. `?onboard=repo` resumes after the
// GitHub login, `?onboard=hello` still shows the sign-in card, and any `?source=` or `?scenario=` goes
// straight to the map.
function Root() {
  if (location.pathname === "/judge" || location.pathname === "/judge/") return <Judge />;
  const q = new URLSearchParams(location.search);
  const bare = !q.get("onboard") && !q.has("source") && !q.has("scenario");
  const start = (q.get("onboard") || (bare ? "hello" : null)) as OnboardStep | null;
  const [step, setStep] = useState(start);
  // With a server, signed-in players get their real repos, never the sandbox's pretend sign-in
  // (new-user-path.md, snag 1). Only a bare visit asks; an explicit ?source= wins.
  const [live, setLive] = useState<boolean | null>(q.has("source") ? q.get("source") === "live" : null);
  useEffect(() => {
    if (live === null && step) void serverUp().then(setLive);
  }, []);
  if (!step) return <App />;
  if (live === null) return null;
  return (
    <Onboarding
      live={live}
      step={step === "repo" || step === "intro" ? step : "hello"}
      onPlay={bare ? () => { history.replaceState(null, "", SANDBOX); setStep(null); } : undefined}
      onDone={(repo) => {
        if (live) return void (location.href = `?source=live&repo=${encodeURIComponent(repo)}&connect=1`);
        // The sim plays the rest: scan, starter factory, power, first build.
        history.replaceState(null, "", `?source=sim&scenario=first-run&repo=${encodeURIComponent(repo)}`);
        setStep(null);
      }}
    />
  );
}

const judge = location.pathname === "/judge" || location.pathname === "/judge/";
// Public replay stays offline, including boot: no telemetry/account/flag requests.
// Only the map style survives (?world=shaft), so judges can watch the replay in the vertical shaft too.
const judgeWorld = new URLSearchParams(location.search).get("world");
if (judge) history.replaceState(null, "", `/judge?source=sim${judgeWorld && /^(shaft|iron|classic)$/.test(judgeWorld) ? `&world=${judgeWorld}` : ""}`);
void Promise.all(judge ? [] : [initTelemetry(), loadFeatureFlags()]).then(() => createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary><Root /></ErrorBoundary>
  </StrictMode>,
));
