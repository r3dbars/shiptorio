// The planner's decision log. Every Spark call the factory makes is written here with what it looked
// at, what it decided and why, and so is every time a fixed rule had to stand in. The web "how it
// thinks" panel reads it, so anyone can check that Meta Muse Spark is the one making the calls.

import type { Brain, Thought } from "@shiptorio/shared";

type Score = NonNullable<Brain["score"]>;
const emptyScore = (): Score => ({ plans: 0, shipped: 0, reviews: 0, catches: 0, open: [] });

const KEEP = 40;

export const emptyBrain = (model: string, online: boolean): Brain => ({ model, online, decisions: 0, fallbacks: 0, thoughts: [] });

/** Adds one decision, newest first. Pure: returns a new brain. */
export function recordThought(brain: Brain, thought: Omit<Thought, "id">): Brain {
  const score = scoreThought(brain.score ?? emptyScore(), thought);
  const t: Thought = { ...thought, id: crypto.randomUUID(), title: thought.title.slice(0, 160), outcome: thought.outcome.replace(/\bSpark\b/gi, "planner").slice(0, 200), reason: thought.reason.replace(/\bSpark\b/gi, "planner").slice(0, 400), ...(thought.steps?.length ? { steps: thought.steps.slice(0, 8).map(x => ({ tool: x.tool.slice(0, 40), reason: x.reason.slice(0, 200), result: x.result.slice(0, 200) })) } : {}) };
  return {
    ...brain,
    model: thought.by === "spark" ? thought.model : brain.model,
    score,
    decisions: brain.decisions + (thought.by === "spark" ? 1 : 0),
    fallbacks: brain.fallbacks + (thought.by === "fallback" ? 1 : 0),
    // A re-rank that lands on the same top card replaces the last one, so ranking can't bury triage and plans.
    thoughts: [t, ...(t.decision === "rank" && brain.thoughts[0]?.decision === "rank" && brain.thoughts[0].outcome === t.outcome ? brain.thoughts.slice(1) : brain.thoughts)].slice(0, KEEP),
  };
}

/** Share of logged decisions Spark made itself. */
export const sparkShare = (brain: Brain): number => brain.decisions + brain.fallbacks ? brain.decisions / (brain.decisions + brain.fallbacks) : 0;

/** A Spark plan opens a job on the scorecard (re-plans on rework don't count twice); a Spark verdict counts as a review, a send-back as a catch. */
function scoreThought(score: Score, t: Omit<Thought, "id">): Score {
  if (t.by !== "spark") return score;
  if (t.decision === "plan" && t.itemId && !score.open.includes(t.itemId)) return { ...score, plans: score.plans + 1, open: [t.itemId, ...score.open] };
  if (t.decision === "review" && /^(Passed|Sent)/.test(t.outcome)) return { ...score, reviews: score.reviews + 1, catches: score.catches + (t.outcome.startsWith("Sent") ? 1 : 0) };
  return score;
}

/** A merged PR closes its job on the scorecard, if the planner planned it. */
export function scoreShip(brain: Brain | undefined, itemId: string): Brain | undefined {
  if (!brain?.score?.open.includes(itemId)) return brain;
  return { ...brain, score: { ...brain.score, shipped: brain.score.shipped + 1, open: brain.score.open.filter(id => id !== itemId) } };
}

import { liveBottleneckCandidates, type BottleneckJob, type LiveBottleneckCandidate } from "./bottleneck";
import type { FactoryState, LiveBottleneckPick } from "@shiptorio/shared";

const PICK_MAX_AGE_MS = 30 * 60_000;
const PICK_STOP: Record<string, LiveBottleneckPick["stop"]> = {
  intake: "repo", triage: "planner", build: "builder", inspect: "checks", "ci-1": "checks", "verify-1": "checks",
  "review-1": "review", pad: "gate", "gate-1": "gate", release: "launch", impact: "launch",
};

/** Match only known signal IDs from the existing brain. Never parse issue/model prose as routing. */
function applies(signalId: string, candidate: LiveBottleneckCandidate): boolean {
  const [source, kind, ...parts] = signalId.split(":");
  const scope = parts.join(":");
  if (source === "factory" && kind === "queue_jam") return candidate.stop === PICK_STOP[scope];
  if (source === "factory" && ["no_agent", "no_power"].includes(kind)) return candidate.stop === "builder";
  if (source === "factory" && kind === "rework_loop") return candidate.action === "blocked" || candidate.action === "request_rework";
  if (source === "repo" && kind === "approve_queue") return ["approve_runner_job", "request_merge"].includes(candidate.action) || candidate.stop === "gate";
  if (source === "repo" && ["issues_untriaged", "backlog_growing", "repo_missing"].includes(kind)) return candidate.stop === "repo";
  if (source === "ci" && ["ci_slow", "ci_flaky", "ci_red_main", "ci_queue", "ci_blocking", "ci_missing"].includes(kind)) return candidate.stop === "checks";
  return false;
}

/** Zero additional model calls: project the existing budgeted brain's current pick onto real work.
 * Its most urgent applicable candidate wins (a call waiting on the player before plain work), then the oldest; unknown/stale picks use the stable queue fallback.
 * Wording is generated from actual actions, not copied from untrusted issue or model text.
 */
export function projectLiveBottleneck(state: FactoryState, jobs: readonly BottleneckJob[] = [], now = Date.now()): LiveBottleneckPick | null {
  const candidates = liveBottleneckCandidates(state, jobs);
  if (!candidates.length) return null;
  const brain = state.holdingBack;
  const current = brain?.by === "spark" && brain.decidedAt <= now && now - brain.decidedAt <= PICK_MAX_AGE_MS;
  const chosen = current ? brain.signalIds.map(id => candidates.filter(c => applies(id, c)).sort((a, b) => a.priority - b.priority || a.since - b.since || a.id.localeCompare(b.id))[0]).find(Boolean) : undefined;
  const candidate = chosen ?? candidates[0];
  return { stop: candidate.stop, ...(candidate.itemId ? { itemId: candidate.itemId } : {}), reason: candidate.reason, source: chosen ? "spark" : "fallback" };
}
