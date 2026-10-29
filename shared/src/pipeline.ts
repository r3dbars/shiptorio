import { z } from "zod";
import type { FactoryState, Item, Move } from "./model";

export const PIPELINE_IDS = ["planner", "builder", "checks", "review", "gate", "launch"] as const;
export const PIPELINE_REASONS = {
  no_work: "Waiting for work.", planning: "Reading the issue and preparing a plan.",
  plan_required: "Choose whether to prepare a plan for this issue.", approval_required: "Review the plan before your agent builds.", building: "Your agent is building the approved change.",
  runner_offline: "Reconnect your local agent to start the approved build.", build_failed: "The build needs attention.",
  checking: "Checking this PR's current revision.", checks_failed: "A check sent this change back for repair.",
  proof_required: "Current-revision verification is required before this change can advance.",
  reviewing: "Reviewing the verified change.", review_failed: "The review sent this change back for repair.",
  gate_waiting: "Your decision is needed at Gate.", launching: "Waiting for GitHub to confirm the launch.",
  complete: "This step is complete.", launched: "GitHub confirmed this change launched.",
} as const;
export const PipelineStep = z.object({
  id: z.enum(PIPELINE_IDS), state: z.enum(["idle", "working", "stuck", "waiting_player", "done"]),
  cause: z.enum(Object.keys(PIPELINE_REASONS) as [keyof typeof PIPELINE_REASONS, ...(keyof typeof PIPELINE_REASONS)[]]),
  itemIds: z.array(z.string()).max(40), moveIds: z.array(z.string()).max(12),
});
export type PipelineStep = z.infer<typeof PipelineStep>;
/** Only this safe subset of internal runner jobs may enter the browser projection. */
export interface PipelineJob {
  id?: string; itemId: string; status: "planning" | "awaiting_approval" | "ready" | "running" | "completed" | "failed";
  approvedAt?: number;
}
const rank = { idle: 0, done: 1, working: 2, waiting_player: 3, stuck: 4 };
type StepId = PipelineStep["id"];
type Cause = PipelineStep["cause"];

/** Presentation only. Existing move IDs, exact plan/head validation and Launch remain the authority.
 * It is rebuilt from current data, never advanced by a client timer or an optimistic tap. */
export function projectPipeline(state: Pick<FactoryState, "items" | "deck" | "move">, jobs: readonly PipelineJob[] = [], runnerOnline = true): PipelineStep[] {
  const steps: PipelineStep[] = PIPELINE_IDS.map(id => ({ id, state: "idle", cause: "no_work", itemIds: [], moveIds: [] }));
  const mark = (id: StepId, status: PipelineStep["state"], cause: Cause, itemId?: string, moveId?: string) => {
    const step = steps.find(s => s.id === id)!;
    if (rank[status] > rank[step.state]) { step.state = status; step.cause = cause; step.itemIds = []; }
    if (itemId && status === step.state && step.itemIds.length < 40 && !step.itemIds.includes(itemId)) step.itemIds.push(itemId);
    if (moveId && step.moveIds.length < 12 && !step.moveIds.includes(moveId)) step.moveIds.push(moveId);
  };
  const cards = state.deck ?? (state.move ? [state.move] : []);
  for (const item of state.items) {
    if (item.state === "launched") { for (const id of PIPELINE_IDS) mark(id, "done", id === "launch" ? "launched" : "complete", item.id); continue; }
    const active = jobs.find(j => j.itemId === item.id && ["planning", "awaiting_approval", "ready", "running"].includes(j.status));
    const failed = !active && jobs.find(j => j.itemId === item.id && j.status === "failed");
    if (item.prNumber) { mark("planner", "done", "complete", item.id); mark("builder", "done", "complete", item.id); }
    if (active?.status === "planning") mark("planner", "working", "planning", item.id);
    if (active?.status === "awaiting_approval") mark("planner", "waiting_player", "approval_required", item.id);
    if (active && ["ready", "running"].includes(active.status)) {
      mark("planner", "done", "complete", item.id);
      mark("builder", !runnerOnline ? "stuck" : "working", !runnerOnline ? "runner_offline" : "building", item.id);
    } else if (item.state === "working") mark("builder", "working", "building", item.id);
    if (failed && !item.prNumber) mark(failed.approvedAt ? "builder" : "planner", "stuck", "build_failed", item.id);
    const inspection = item.inspection;
    if (!item.prNumber || !["inspecting", "passed", "on_pad", "rejected"].includes(item.state)) continue;
    const passed = (gate: string) => inspection?.stages.filter(s => s.gate === gate).length === 1 && inspection.stages.find(s => s.gate === gate)?.state === "passed";
    const validStations = !!inspection && ["ci", "verify", "ai", "human"].every(gate => inspection.stages.filter(s => s.gate === gate).length === 1);
    const checks = validStations && !!inspection?.headSha && inspection.headSha !== "unknown" && passed("ci") && passed("verify") && (inspection.checks ?? []).every(c => c.state === "passed");
    const failedChecks = inspection?.stages.some(s => ["ci", "verify"].includes(s.gate) && s.state === "rework") || inspection?.checks?.some(c => c.state === "rework");
    if (checks) mark("checks", "done", "complete", item.id);
    else mark("checks", failedChecks || !validStations ? "stuck" : "working", failedChecks ? "checks_failed" : !validStations ? "proof_required" : "checking", item.id);
    if (!checks) continue;
    if (!passed("ai")) { const rejected = inspection?.stages.some(s => s.gate === "ai" && s.state === "rework"); mark("review", rejected ? "stuck" : "working", rejected ? "review_failed" : "reviewing", item.id); continue; }
    mark("review", "done", "complete", item.id);
    if (inspection?.humanApproved) { mark("gate", "done", "complete", item.id); mark("launch", "working", "launching", item.id); }
    else mark("gate", "waiting_player", "gate_waiting", item.id);
  }
  for (const card of cards) {
    const item = state.items.find(i => i.id === card.itemId);
    if (item?.state === "launched") continue;
    const actions = card.options.flatMap(o => o.actions);
    const approval = actions.find(a => a.tool === "approve_runner_job");
    if (approval && !jobs.some(j => j.id === approval.args.jobId && j.itemId === card.itemId && j.status === "awaiting_approval")) continue;
    const tools = actions.map(a => a.tool);
    if (tools.some(t => ["plan_runner_job", "approve_runner_job"].includes(t))) mark("planner", "waiting_player", approval ? "approval_required" : "plan_required", card.itemId, card.id);
    else if (tools.includes("request_merge")) {
      // A locked card explains missing proof; it cannot claim a ready launch.
      if (card.locked) mark("checks", "stuck", "proof_required", card.itemId, card.id);
      else { mark("gate", "waiting_player", "gate_waiting", card.itemId, card.id); mark("launch", "waiting_player", "gate_waiting", card.itemId, card.id); }
    }
  }
  return steps;
}
