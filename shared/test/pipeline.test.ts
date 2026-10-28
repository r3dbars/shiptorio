import { expect, test } from "bun:test";
import { projectPipeline, PIPELINE_IDS, PipelineStep } from "../src/pipeline";
import { Item, type Move } from "../src/model";
const item = (extra: Record<string, unknown> = {}) => Item.parse({ id: "gh-1", kind: "bug", source: "github_issue", title: "A fix", district: "/", state: "queued", updatedAt: 1, ...extra });
const state = (items = [item()], deck: Move[] = []) => ({ items, deck });
const at = (steps: ReturnType<typeof projectPipeline>, id: string) => steps.find(s => s.id === id)!;
const approved = { headSha: "a".repeat(40), state: "passed", humanApproved: false, stages: ["ci", "verify", "ai"].map(gate => ({ gate, state: "passed", reason: "ok" })).concat([{ gate: "human", state: "pending", reason: "Your call" }]) };
test("six stable steps remain idle without inventing work or exposing runner details", () => {
  const result = projectPipeline(state([]));
  expect(result.map(s => s.id)).toEqual([...PIPELINE_IDS]);
  expect(result.every(s => s.state === "idle" && PipelineStep.safeParse(s).success)).toBe(true);
});
test("plan approval, offline approved build and running build follow authoritative job state", () => {
  for (const [status, id, expected] of [["planning", "planner", "working"], ["awaiting_approval", "planner", "waiting_player"], ["ready", "builder", "stuck"], ["running", "builder", "working"]] as const) {
    expect(at(projectPipeline(state(), [{ itemId: "gh-1", status }], false), id).state).toBe(expected);
  }
  expect(at(projectPipeline(state(), [{ itemId: "gh-1", status: "failed" }, { itemId: "gh-1", status: "planning" }]), "planner").state).toBe("working");
});
test("checks, review, gate and launch never advance on elapsed time or incomplete receipts", () => {
  const current = item({ state: "on_pad", prNumber: 1, inspection: approved });
  expect(at(projectPipeline(state([current])), "gate").state).toBe("waiting_player");
  expect(at(projectPipeline(state([current])), "launch").state).toBe("idle");
  const missing = item({ state: "on_pad", prNumber: 1 });
  expect(at(projectPipeline(state([missing])), "checks")).toMatchObject({ state: "stuck", cause: "proof_required" });
  const reviewed = item({ ...current, inspection: { ...current.inspection, humanApproved: true } });
  expect(at(projectPipeline(state([reviewed])), "launch").state).toBe("working");
  expect(at(projectPipeline(state([item({ ...current, state: "launched" })])), "launch")).toMatchObject({ state: "done", cause: "launched" });
});
test("only current visible move IDs are offered, so Later and reconnect do not invent actions", () => {
  const move: Move = { id: "exact-plan", itemId: "gh-1", title: "Plan", why: "", createdAt: 1, options: [{ id: "approve", label: "Approve", recommended: true, actions: [{ tool: "approve_runner_job", args: { jobId: "safe-id" }, reason: "Approve" }] }] };
  expect(at(projectPipeline(state([item()], [move]), [{ id: "safe-id", itemId: "gh-1", status: "awaiting_approval" }]), "planner").moveIds).toEqual(["exact-plan"]);
  expect(at(projectPipeline(state([item()], [move]), [{ id: "safe-id", itemId: "gh-1", status: "ready" }]), "planner").moveIds).toEqual([]);
  const reloaded = structuredClone(state([item()], []));
  expect(at(projectPipeline(reloaded), "planner").moveIds).toEqual([]);
});
test("fresh failed check or review overrides old successes without leaking provider errors", () => {
  const failing = item({ state: "rejected", prNumber: 1, failure: "secret-provider-token", inspection: { ...approved, stages: approved.stages.map(s => s.gate === "verify" ? { ...s, state: "rework" } : s) } });
  const steps = projectPipeline(state([failing]));
  expect(at(steps, "checks")).toMatchObject({ state: "stuck", cause: "checks_failed" });
  expect(at(steps, "review").state).toBe("idle");
  expect(JSON.stringify(steps)).not.toContain("secret-provider-token");
});
