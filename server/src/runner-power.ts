import type { PowerSource } from "@shiptorio/shared";
import { runnerPower } from "./geothermal";
import type { RunnerJob } from "./runner-job";
type Harness = RunnerJob["harness"];
const managed = new Set(["power-codex", "power-claude_code", "solar-codex", "solar-claude_code", "geo-local"]);
/** Keep each known subscription visible when disconnected, without inventing usage quota. */
export function syncRunnerPower(power: PowerSource[], harnesses: Harness[]): PowerSource[] {
  const live = runnerPower([...new Set(harnesses)]);
  return [...power.filter(p => !managed.has(p.id)),
    ...power.filter(p => managed.has(p.id) && !p.id.startsWith("power-") && !live.some(l => l.id === p.id)).map(p => ({ ...p, online: false })), ...live];
}
/** Subscription assemblers execute the same approved plan. Local power still requires Spark's guard. */
export function availableJobHarness(preferred: Harness, free: Harness[]): Harness | null {
  if (free.includes(preferred)) return preferred;
  if (preferred === "local") return null;
  return free.find(h => h !== "local") ?? null;
}
