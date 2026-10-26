// The planner's decision log. Every Spark call the factory makes is written here with what it looked
// at, what it decided and why, and so is every time a fixed rule had to stand in. The web "how it
// thinks" panel reads it, so anyone can check that Meta Muse Spark is the one making the calls.

import type { Brain, Thought } from "@shiptorio/shared";

const KEEP = 40;

export const emptyBrain = (model: string, online: boolean): Brain => ({ model, online, decisions: 0, fallbacks: 0, thoughts: [] });

/** Adds one decision, newest first. Pure: returns a new brain. */
export function recordThought(brain: Brain, thought: Omit<Thought, "id">): Brain {
  const t: Thought = { ...thought, id: crypto.randomUUID(), title: thought.title.slice(0, 160), outcome: thought.outcome.slice(0, 200), reason: thought.reason.slice(0, 400) };
  return {
    ...brain,
    model: thought.by === "spark" ? thought.model : brain.model,
    decisions: brain.decisions + (thought.by === "spark" ? 1 : 0),
    fallbacks: brain.fallbacks + (thought.by === "fallback" ? 1 : 0),
    // A re-rank that lands on the same top card replaces the last one, so ranking can't bury triage and plans.
    thoughts: [t, ...(t.decision === "rank" && brain.thoughts[0]?.decision === "rank" && brain.thoughts[0].outcome === t.outcome ? brain.thoughts.slice(1) : brain.thoughts)].slice(0, KEEP),
  };
}

/** Share of logged decisions Spark made itself. */
export const sparkShare = (brain: Brain): number => brain.decisions + brain.fallbacks ? brain.decisions / (brain.decisions + brain.fallbacks) : 0;
