/**
 * Pure queue telemetry. ore → intake; planning job → triage; queued/working and
 * approval → build; inspecting/passed → first unfinished gate; on_pad → merge;
 * rejected → failed station. Launched is terminal unless observed release/impact
 * history explicitly says otherwise. A merge does not prove deployment or impact.
 * Existing browser stages group ci/verify/review under inspect, merge under pad;
 * stationId identifies the actual jam. Internal metrics retain all nine stages.
 * History records real entry/exits; absent history uses updatedAt for wait only.
 */
import type { Bottleneck, FactoryState, Item, ItemKind, Stage } from "@shiptorio/shared";
import type { RunnerJob } from "./runner-job";

export const PIPELINE_STAGES = ["intake", "triage", "build", "ci", "verify", "review", "merge", "release", "impact", "power", "resources"] as const;
export type PipelineStage = typeof PIPELINE_STAGES[number];
export interface StageHistory { itemId: string; stage: PipelineStage; enteredAt: number; exitedAt?: number }
export interface StageMetrics {
  stage: PipelineStage; stationId?: string; itemIds: string[];
  wip: number; ageMs: number; throughputPerHour: number; valueAtRisk: number; score: number;
}
export type BottleneckJob = Pick<RunnerJob, "itemId" | "status">;
export interface BottleneckOptions { now?: number; powered?: boolean; history?: readonly StageHistory[]; jobs?: readonly BottleneckJob[]; windowMs?: number }
// Ordinal fallback priorities, not dollars/users: crashes > features > checks > cleanup.
// Explicit model weights, including zero, supersede these defaults.
export const DEFAULT_ITEM_VALUES: Record<ItemKind, number> = { bug: 5, feature: 3, tests: 2, cleanup: 1 };
export const itemValue = (item: Item): number => item.value !== undefined && Number.isFinite(item.value) ? Math.max(0, item.value) : DEFAULT_ITEM_VALUES[item.kind];
const STATIONS: Partial<Record<PipelineStage, string>> = { ci: "ci-1", verify: "verify-1", review: "review-1", merge: "gate-1" };
const STAGE_FOR_GATE = { ci: "ci", verify: "verify", ai: "review", human: "merge" } as const;
const fromStation = (station?: string): PipelineStage | undefined => station === "orbit" ? "impact" : station && ["ci", "verify", "review", "merge"].includes(station) ? station as PipelineStage : undefined;

export function stageForItem(item: Item, jobs: readonly BottleneckJob[] = []): PipelineStage | null {
  if (item.state === "launched") return null;
  const job = [...jobs].reverse().find(j => j.itemId === item.id && ["planning", "awaiting_approval", "ready", "running"].includes(j.status));
  if (job) return job.status === "planning" ? "triage" : "build";
  if (item.state === "ore") return "intake";
  if (item.state === "queued" || item.state === "working") return "build";
  if (item.state === "on_pad") return "merge";
  if (item.state === "rejected") {
    const failed = item.inspection?.stages.find(s => s.state === "rework");
    return fromStation(item.scars?.at(-1)?.station) ?? (failed && STAGE_FOR_GATE[failed.gate]) ?? "build";
  }
  const next = item.inspection?.stages.find(s => s.state !== "passed");
  if (next) return STAGE_FOR_GATE[next.gate];
  return item.state === "passed" ? "merge" : "ci";
}
function wireStage(stage: PipelineStage): Stage {
  return stage === "ci" || stage === "verify" || stage === "review" ? "inspect" : stage === "merge" ? "pad" : stage;
}
const LABELS: Record<PipelineStage, string> = {
  intake: "waiting to be read", triage: "waiting for a plan", build: "waiting on a local agent", ci: "waiting at CI", verify: "waiting at the verify bay", review: "waiting at AI review", merge: "waiting on you to launch", release: "waiting for release", impact: "waiting for the customer result", power: "waiting for power", resources: "waiting for an agent connection",
};
function summary(metric: StageMetrics): string {
  if (metric.stage === "resources") return "Your computer writes the code. Plug it in to start building.";
  if (metric.stage === "power") return "Your connected agents have no power. Recharge or connect another plant.";
  const age = metric.ageMs < 60_000 ? "less than a minute" : metric.ageMs < 3_600_000 ? `${Math.floor(metric.ageMs / 60_000)} min` : `${Math.floor(metric.ageMs / 3_600_000)} h`;
  return `${metric.wip} ${metric.wip === 1 ? "item" : "items"} ${LABELS[metric.stage]}. Oldest wait: ${age}.`;
}
export function deriveBottleneck(state: FactoryState, options: BottleneckOptions = {}): { bottleneck: Bottleneck | null; stages: StageMetrics[] } {
  const now = options.now ?? Date.now();
  const history = options.history ?? [];
  const windowMs = Math.max(1, options.windowMs ?? 3_600_000);
  const stages: StageMetrics[] = PIPELINE_STAGES.map(stage => ({ stage, stationId: state.stations?.find(s => s.kind === stage)?.id ?? STATIONS[stage], itemIds: [], wip: 0, ageMs: 0, throughputPerHour: 0, valueAtRisk: 0, score: 0 }));
  const byStage = new Map(stages.map(s => [s.stage, s]));
  for (const item of state.items) {
    let stage = stageForItem(item, options.jobs);
    const postMerge = item.state === "launched" ? history.filter(h => h.itemId === item.id && h.exitedAt === undefined && (h.stage === "release" || h.stage === "impact") && h.enteredAt <= now).sort((a,b) => b.enteredAt - a.enteredAt)[0] : undefined;
    if (postMerge) stage = postMerge.stage;
    if (!stage) continue;
    const metric = byStage.get(stage)!;
    const open = history.filter(h => h.itemId === item.id && h.stage === stage && h.exitedAt === undefined && h.enteredAt <= now).sort((a,b) => b.enteredAt - a.enteredAt)[0];
    metric.itemIds.push(item.id); metric.wip++;
    metric.valueAtRisk += itemValue(item);
    metric.ageMs = Math.max(metric.ageMs, Math.max(0, now - (open?.enteredAt ?? item.updatedAt)));
  }
  for (const metric of stages) {
    // Rework exits count; invalid/future exits never do. Window is (start, now].
    const exited = history.filter(h => h.stage === metric.stage && h.exitedAt !== undefined && h.exitedAt >= h.enteredAt && h.exitedAt > now - windowMs && h.exitedAt <= now);
    metric.throughputPerHour = exited.length * 3_600_000 / windowMs;
    metric.score = metric.valueAtRisk * metric.ageMs;
  }
  const build = byStage.get("build")!;
  const connectedPlants = state.power.filter(p => p.kind === "solar" || p.kind === "geothermal");
  const powered = options.powered ?? connectedPlants.some(p => p.online && p.level > 0);
  let forced: StageMetrics | undefined;
  if (build.wip && !powered) {
    const stage = connectedPlants.length ? "power" : "resources";
    forced = byStage.get(stage)!;
    Object.assign(forced, { itemIds: [...build.itemIds], wip: build.wip, ageMs: build.ageMs, valueAtRisk: build.valueAtRisk, score: build.score });
  }
  // Ties use documented pipeline order, including zero-age/zero-value work.
  const winner = forced ?? stages.filter(s => s.wip > 0).reduce<StageMetrics | undefined>((best, s) => !best || s.score > best.score ? s : best, undefined);
  if (!winner) return { bottleneck: null, stages };
  return { bottleneck: { stage: wireStage(winner.stage), stationId: winner.stationId, wip: winner.wip, ageMs: winner.ageMs, throughputPerHour: winner.throughputPerHour, valueAtRisk: winner.valueAtRisk, summary: summary(winner) }, stages };
}

export interface LiveBottleneckCandidate {
  id: string;
  stop: import("@shiptorio/shared").LiveBottleneckPick["stop"];
  itemId?: string;
  reason: string;
  priority: number;
  since: number;
  action: string;
}

/** Structured facts only. Issue text cannot supply a stop, action or instruction. */
export function liveBottleneckCandidates(state: FactoryState, jobs: readonly BottleneckJob[] = []): LiveBottleneckCandidate[] {
  const out: LiveBottleneckCandidate[] = [];
  const seen = new Set<string>();
  const label = (item: Item | undefined) => item?.prNumber ? `PR #${item.prNumber}` : item && /^gh-\d+$/.test(item.id) ? `#${item.id.slice(3)}` : "this change";
  const add = (candidate: LiveBottleneckCandidate) => {
    const key = `${candidate.stop}|${candidate.itemId ?? ""}`;
    if (!seen.has(key)) { seen.add(key); out.push(candidate); }
  };
  const moves = state.deck?.length ? state.deck : state.move ? [state.move] : [];
  for (const move of moves) {
    const item = state.items.find(i => i.id === move.itemId);
    if (move.itemId && (!item || item.state === "launched")) continue;
    const action = move.options.find(o => o.recommended)?.actions[0];
    if (!action) continue;
    const choices: Record<string, { stop: LiveBottleneckCandidate["stop"]; reason: string }> = {
      plan_runner_job: { stop: "repo", reason: `Waiting on your call: start issue ${label(item)}.` },
      approve_runner_job: { stop: "builder", reason: `Waiting on your call: start the build for ${label(item)}.` },
      request_merge: { stop: "gate", reason: `Waiting on your call: ship ${label(item)}.` },
      request_rework: { stop: "builder", reason: `Waiting on your call: plan a fix for ${label(item)}.` },
      run_missing_check: { stop: "checks", reason: `A required check needs attention for ${label(item)}.` },
      connect_source: { stop: action.args.kind === "github" ? "repo" : "builder", reason: action.args.kind === "github" ? "Connect GitHub to bring issues into the workshop." : "Connect your coding engine to start building." },
    };
    const choice = choices[action.tool];
    if (choice) add({ id: `decision:${move.id}`, ...choice, itemId: item?.id, priority: action.tool === "connect_source" ? 0 : 1, since: move.createdAt, action: action.tool });
  }
  for (const item of state.items) {
    const stage = stageForItem(item, jobs);
    if (!stage) continue;
    const stop: LiveBottleneckCandidate["stop"] = stage === "intake" ? "repo" : stage === "triage" ? "planner" : stage === "build" ? "builder" : stage === "ci" || stage === "verify" ? "checks" : stage === "review" ? "review" : stage === "merge" ? "gate" : "launch";
    const blocked = item.state === "rejected" || !!item.failure;
    const reason = blocked ? `A fix is needed before ${label(item)} can continue.`
      : stop === "repo" ? `An issue is ready to start: ${label(item)}.`
      : stop === "planner" ? `The plan for ${label(item)} is being prepared.`
      : stop === "builder" ? `The coding engine is working on ${label(item)}.`
      : stop === "checks" ? `Waiting for checks on ${label(item)}.`
      : stop === "review" ? `Waiting for review of ${label(item)}.`
      : stop === "gate" ? `Waiting on your call: ship ${label(item)}.` : `${label(item)} is being shipped.`;
    add({ id: `item:${item.id}:${stage}`, stop, itemId: item.id, reason, priority: blocked ? 0 : stop === "gate" ? 1 : 2, since: item.updatedAt, action: blocked ? "blocked" : "work" });
  }
  return out.sort((a, b) => a.priority - b.priority || a.since - b.since || a.id.localeCompare(b.id)).slice(0, 12);
}
