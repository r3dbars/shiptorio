import { initTelemetry } from "./telemetry";
import { ErrorBoundary } from "./ErrorBoundary";
import { loadFeatureFlags } from "./flags";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Judge } from "./judge/Judge";
import { App } from "./App";
import { Onboarding, type OnboardStep } from "./ui/Onboarding";
import { sound } from "./sound/engine";
import "./iron.css";
import "./styles.css";

sound.install();

// Is the real Worker behind this page? On shiptorio.com (and `bun run dev`) /api/version answers JSON;
// the UI-only dev server (`bun run dev:web`) has no API, so a bare visit there stays in the sandbox.
async function hasServer(): Promise<boolean> {
  try {
    const res = await fetch("/api/version", { cache: "no-store" });
    return res.ok && (res.headers.get("content-type") ?? "").includes("json");
  } catch {
    return false;
  }
}

// A bare visit starts at onboarding. `?onboard=repo` resumes it after the GitHub login; any
// `?source=` or `?scenario=` goes straight to the map.
function Root() {
  if (location.pathname === "/judge" || location.pathname === "/judge/") return <Judge />;
  const q = new URLSearchParams(location.search);
  const start = (q.get("onboard") || (!q.has("source") && !q.has("scenario") ? "hello" : null)) as OnboardStep | null;
  const [step, setStep] = useState(start);
  // A stranger at the front door must sign in for real when there's a server, not land in the sandbox
  // (new-user-path.md, snag 1). Only a bare visit asks; an explicit ?source= wins.
  const [live, setLive] = useState<boolean | null>(q.has("source") ? q.get("source") === "live" : null);
  useEffect(() => {
    if (live === null && step) void hasServer().then(setLive);
  }, []);
  if (!step) return <App />;
  if (live === null) return null;
  return (
    <Onboarding
      live={live}
      step={step === "repo" || step === "intro" ? step : "hello"}
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
