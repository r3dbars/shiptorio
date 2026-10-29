import { useEffect, useState } from "react";
import { RUNNER } from "../copy";

import type { RunnerStatus } from "../deck2d/rules/runner";

export type { RunnerStatus };

/** Polls the runner's status every five seconds while the tab is visible. */
export function useRunnerStatus(repo?: string) {
  const [status, setStatus] = useState<RunnerStatus | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setStatus(null);
    if (!repo) return;
    let active = true;
    const refresh = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch(`/api/repos/${repo}/runner/status`, { cache: "no-store" });
        if (!response.ok) throw new Error(RUNNER.noAccess);
        const data = await response.json() as RunnerStatus;
        if (active) { setStatus(data); setError(""); }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : RUNNER.unreachable); }
    };
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [repo]);
  return { status, setStatus, error, setError };
}

export type Light = "off" | "idle" | "wait" | "busy";

/** The one line the HUD light says: is your machine on, and what is it doing. */
export function machineLine(s: RunnerStatus | null): { light: Light; text: string } | null {
  if (!s) return null;
  const L = RUNNER.light;
  if (!s.paired) return { light: "off", text: L.unplugged };
  if (!s.online) return { light: "off", text: L.offline };
  if (s.harnesses.length === 0) return { light: "wait", text: L.signIn };
  const w = s.working;
  if (w) {
    const n = w.number != null ? `#${w.number}` : L.aJob;
    if (w.status === "running") return { light: "busy", text: L.building(n) };
    if (w.status === "ready") return { light: "busy", text: L.starting(n) };
    if (w.status === "planning") return { light: "busy", text: L.planning(n) };
    return { light: "wait", text: L.planReady(n) };
  }
  if (s.waitingOn) return { light: "wait", text: L.yourTurn };
  return { light: "idle", text: L.idle };
}
