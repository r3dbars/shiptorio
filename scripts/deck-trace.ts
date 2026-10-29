// Build the honest sample fixture: real Testing identifiers, illustrative protocol states.
// This is NOT a recording of the live server. Use ?record=1 to capture an actual run.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { FactoryState, Item, Move } from "../shared/src";
import { parseTrace, type DeckTrace } from "../web/src/deck2d/data/replay";

const item: Item = { id: "gh-16", title: "Explain the README checks", kind: "cleanup", source: "github_issue", url: "https://github.com/r3dbars/Testing/issues/16", district: "/", state: "ore", attempts: 0, updatedAt: 1 };
const base: FactoryState = { repo: "r3dbars/Testing", baseBranch: "main", districts: [], machines: [], belts: [], power: [], items: [item], science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0, tick: 0 };
const stages = ["planner", "builder", "checks", "review", "gate", "launch"] as const;
const pipeline = (active: string, state: "working" | "waiting_player" | "done") => stages.map(id => ({ id, state: id === active ? state : "idle" as const, cause: id === active ? (id === "planner" ? "planning" as const : id === "builder" ? "building" as const : id === "checks" ? "checking" as const : id === "review" ? "reviewing" as const : id === "gate" ? "gate_waiting" as const : "launching" as const) : "no_work" as const, itemIds: id === active ? [item.id] : [], moveIds: [] }));
const move = (id: string, title: string, tool: string): Move => ({ id, itemId: item.id, title, why: "Sample replay of the README workflow. No action is sent.", createdAt: 1, kind: "build", options: [{ id: "continue", label: "Continue", recommended: true, actions: [{ tool, args: { itemId: item.id }, reason: "Sample" }] }] });
const trace: DeckTrace = { version: 1, provenance: "fixture", name: "Testing #16 → PR #27 · fixture sample", frames: [
  { at: 0, message: { type: "snapshot", state: base } },
  { at: 2000, message: { type: "patch", patch: { items: [{ ...item, state: "queued", updatedAt: 2 }], pipeline: pipeline("planner", "working") } } },
  { at: 6000, message: { type: "deck", deck: [move("plan-16", "Start the README build?", "approve_runner_job")] } },
  { at: 9000, message: { type: "deck", deck: [] } },
  { at: 9000, message: { type: "patch", patch: { items: [{ ...item, state: "working", updatedAt: 3 }], pipeline: pipeline("builder", "working") } } },
  { at: 69000, message: { type: "patch", patch: { items: [{ ...item, state: "inspecting", prNumber: 27, prUrl: "https://github.com/r3dbars/Testing/pull/27", updatedAt: 4 }], pipeline: pipeline("checks", "working") } } },
  { at: 129000, message: { type: "patch", patch: { pipeline: pipeline("review", "working") } } },
  { at: 189000, message: { type: "patch", patch: { items: [{ ...item, state: "on_pad", prNumber: 27, prUrl: "https://github.com/r3dbars/Testing/pull/27", updatedAt: 5 }], pipeline: pipeline("gate", "waiting_player") } } },
  { at: 189000, message: { type: "deck", deck: [{ ...move("ship-27", "Ship PR #27?", "request_merge"), kind: "ship" }] } },
  { at: 195000, message: { type: "deck", deck: [] } },
  { at: 196000, message: { type: "patch", patch: { items: [{ ...item, state: "launched", prNumber: 27, prUrl: "https://github.com/r3dbars/Testing/pull/27", updatedAt: 6, orbit: { state: "watching", since: 6, until: 10000000000000 } }], pipeline: pipeline("gate", "done"), metrics: { rockets: 1, bitersKilled: 0, escapedDefects: 0, customersAnswered: 0, usersUnblocked: 0, shipScore: 10 } } } },
] };
const checked = parseTrace(trace);
for (const target of ["web/test/fixtures/traces/testing-16-sample.json", "web/public/deck/traces/testing-16-sample.json"]) {
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(checked, null, 2) + "\n");
}
console.log("Wrote Testing fixture sample. This is not a recorded live trace.");
