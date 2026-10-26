import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Onboarding, type OnboardStep } from "./ui/Onboarding";
import { sound } from "./sound/engine";
import "./styles.css";

sound.install();

// A bare visit starts at onboarding. `?onboard=repo` resumes it after the GitHub login; any
// `?source=` or `?scenario=` goes straight to the map.
function Root() {
  const q = new URLSearchParams(location.search);
  const start = (q.get("onboard") || (!q.has("source") && !q.has("scenario") ? "hello" : null)) as OnboardStep | null;
  const [step, setStep] = useState(start);
  if (!step) return <App />;
  const live = q.get("source") === "live";
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
