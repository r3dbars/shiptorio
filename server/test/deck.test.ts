import { describe, expect, it } from "bun:test";
import { FactoryState, Move, type Item, type Move as MoveType } from "@shiptorio/shared";
import { buildDeck, deckScore, enrichMove, GROW_BONUS, moveScope } from "../src/deck";
const now = 600_000;
const item = (id: string, overrides: Partial<Item> = {}): Item => ({ id, kind: "bug", source: "github_issue", title: id, district: "server", state: "queued", attempts: 0, updatedAt: 0, ...overrides });
const state = (items: Item[] = []) => FactoryState.parse({ repo: "x/y", baseBranch: "main", districts: [], machines: [], belts: [], power: [], items, science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0, tick: 0 });
const move = (id: string, overrides: Partial<MoveType> = {}): MoveType => ({ id, title: id, why: "Unblock this", createdAt: 0, options: [{ id: "go", label: "Go", recommended: true, actions: [] }], ...overrides });
const ship = () => move("ship", { stage: "pad", kind: "ship", itemId: "pr", options: [{ id: "launch", label: "Launch", recommended: true, actions: [{ tool: "request_merge", args: { pr: 1 }, reason: "Passed" }] }] });
const stages = (failure?: string) => (["ci", "verify", "ai", "human"] as const).map(gate => ({ gate, state: gate === failure || gate === "human" ? "pending" as const : "passed" as const, reason: gate }));

describe("live check-in deck", () => {
  it("ranks value times wait, adds a bounded grow bonus, and settles ties stably", () => {
    const s = state([item("small", { value: 1 }), item("big", { value: 3 }), item("new", { value: 100, updatedAt: now })]);
    const input = [move("small", { itemId: "small", kind: "build" }), move("new", { itemId: "new", kind: "verify" }), move("big", { itemId: "big", kind: "build" })];
    expect(buildDeck(s, input, { now }).map(m => m.id)).toEqual(["big", "new", "small"]);
    expect(deckScore(input[1], s, now)).toBe(GROW_BONUS.verify!);
    expect(buildDeck(s, [move("z"), move("a")], { now }).map(m => m.id)).toEqual(["a", "z"]);
  });
  it("keeps a genuine zero item value and never rewards negative wait", () => {
    const s = state([item("zero", { value: 0 }), item("future", { updatedAt: now + 1 })]);
    expect(deckScore(move("zero", { itemId: "zero" }), s, now)).toBe(0);
    expect(deckScore(move("future", { itemId: "future" }), s, now)).toBe(0);
  });
  it("new proposals join previous open cards and duplicate ids update without duplicating", () => {
    const s = state();
    s.deck = [move("existing")]; s.move = move("existing", { title: "Latest" });
    expect(buildDeck(s, undefined, { now })).toHaveLength(1);
    const joined = buildDeck(s, [...s.deck, s.move, move("new")], { now });
    expect(joined.map(m => m.id)).toEqual(["existing", "new"]);
    expect(joined[0].title).toBe("Latest");
    expect(buildDeck(s, Array.from({ length: 20 }, (_, i) => move(String(i))), { now })).toHaveLength(12);
  });
  it.each(["ci", "verify", "ai"])("locks launch when %s has not passed, ignoring forged green card stamps", gate => {
    const s = state([item("pr", { state: "on_pad", machineId: "gate-1", prNumber: 1, inspection: { headSha: "a".repeat(40), state: "pending", humanApproved: false, stages: stages(gate) } })]);
    const input = ship(); input.evidence = [{ station: "Fake", ok: true }];
    const card = enrichMove(input, s);
    expect(card.locked).toBe(true);
    expect(card.options.find(o => o.recommended)?.actions[0]).toMatchObject({ tool: "run_missing_check", args: { itemId: "pr", gate } });
    expect(card.options.filter(o => o.recommended)).toHaveLength(1);
    expect(card.options.find(o => o.id === "launch")?.recommended).toBe(false);
    Move.parse(card);
  });
  it("locks a launch with missing inspection and unlocks only with every machine station passed", () => {
    expect(enrichMove(ship(), state()).locked).toBe(true);
    const s = state([item("pr", { inspection: { headSha: "a".repeat(40), state: "passed", humanApproved: false, stages: stages() } })]);
    const card = enrichMove(ship(), s);
    expect(card.locked).toBe(false);
    expect(card.evidence).toHaveLength(3);
    expect(card.evidence?.every(e => e.ok)).toBe(true);
    expect(card.options.find(o => o.recommended)?.id).toBe("launch");
  });
  it("enriches map focus, plan and growth without changing approved plans or rework choices", () => {
    const s = state([item("i", { machineId: "assembler-1" })]);
    const input = move("approval", { itemId: "i", kind: "build", plan: ["Files: server/a.ts", "Approved exact plan"] });
    const before = structuredClone(input);
    expect(enrichMove(input, s)).toMatchObject({ id: "approval", focus: "assembler-1", plan: input.plan, grows: [] });
    expect(input).toEqual(before);
    expect(enrichMove(move("tests", { kind: "verify" }), s).grows).toEqual(["+1 CHECK"]);
    const rework = move("scar", { kind: "review", stage: "inspect", options: [{ id: "overrule", label: "Overrule", recommended: false, actions: [{ tool: "request_merge", args: {}, reason: "Player call" }] }] });
    expect(enrichMove(rework, s).options).toEqual(rework.options);
    expect(enrichMove(rework, s).locked).toBeUndefined();
  });
  it("adds one safe bottleneck proposal when no open move covers it, with stable identity", () => {
    const s = state();
    s.bottleneck = { stage: "resources", wip: 3, ageMs: 10, throughputPerHour: 0, valueAtRisk: 15, summary: "No local agents" };
    const deck = buildDeck(s, [], { now });
    expect(deck).toHaveLength(1);
    expect(deck[0]).toMatchObject({ id: "bottleneck:resources", focus: "resources", stage: "resources" });
    expect(deck[0].options[0].actions[0].tool).toBe("connect_source");
    expect(buildDeck(s, deck, { now: now + 10 })).toHaveLength(1);
    expect(buildDeck(s, [], { now, suppressedIds: new Set([deck[0].id]) })).toEqual([]);
    s.bottleneck = { ...s.bottleneck, stage: "inspect", stationId: "verify-1" };
    const verify = buildDeck(s, [], { now })[0];
    expect(verify.options[0].actions[0].tool).toBe("inspect_bottleneck");
    expect(verify.focus).toBe("verify-1");
    expect(buildDeck(s, [move("verify", { focus: "verify-1" })], { now })).toHaveLength(1);
  });
  it("respects persisted scoped class rules and deferred ids including an implied card", () => {
    const s = state([item("i")]);
    const proposal = move("build", { kind: "build", itemId: "i" });
    expect(moveScope(proposal, s)).toBe("district:server");
    expect(buildDeck(s, [proposal], { now, rules: [{ kind: "build", scope: "district:server" }] })).toEqual([]);
    expect(buildDeck(s, [proposal], { now, rules: [{ kind: "build", scope: "district:web" }] })).toHaveLength(1);
    expect(buildDeck(s, [proposal], { now, suppressedIds: new Set(["build"]) })).toEqual([]);
    const source = move("source", { options: [{ id: "go", label: "Connect", recommended: true, actions: [{ tool: "connect_source", args: { kind: "sentry" }, reason: "Read errors" }] }] });
    expect(moveScope(source, s)).toBe("source:sentry");
    expect(buildDeck(s, [source], { now, rules: [{ kind: "input", scope: "source:sentry" }] })).toEqual([]);
    expect(moveScope(move("tool", { options: [{ id: "go", label: "Go", recommended: true, actions: [{ tool: "inspect", args: {}, reason: "Read" }] }] }), s)).toBe("tool:inspect");
  });
});

it("does not turn an earned permit card into a missing-proof merge card", () => {
  const permit = move("permit", { kind: "automate", stage: "pad", options: [{ id: "allow", label: "Allow", recommended: true, actions: [{ tool: "set_autonomy", args: { district: "docs" }, reason: "Earned" }] }] });
  expect(enrichMove(permit, state()).options[0].id).toBe("allow");
  expect(enrichMove(permit, state()).locked).toBeUndefined();
});

describe("runner decisions stay reachable in a full alert deck", () => {
  const clock = 5 * 60 * 60_000;
  const alerts = () => Array.from({ length: 12 }, (_, n) => move(`alert-${n}`, { kind: "unblock", stage: "intake", createdAt: clock - 4 * 60 * 60_000, options: [{ id: "later", label: "Look later", recommended: true, actions: [] }] }));
  const runner = (tool: "plan_runner_job" | "approve_runner_job", id = tool) => move(id, { kind: "build", stage: "build", itemId: "gh-58", createdAt: clock, options: [{ id: tool === "plan_runner_job" ? "codex" : "approve", label: "Continue the build", recommended: true, actions: [{ tool, args: tool === "plan_runner_job" ? { harness: "codex" } : { jobId: "job-58" }, reason: "Player approval is required" }] }] });
  for (const tool of ["plan_runner_job", "approve_runner_job"] as const) it(`keeps ${tool} visible after feedback resets the item's wait time`, () => {
    const s = state([item("gh-58", { updatedAt: clock })]);
    const decision = runner(tool);
    const candidates = [...alerts(), decision];
    expect(deckScore(candidates[0], s, clock)).toBeGreaterThan(deckScore(decision, s, clock));
    const deck = buildDeck(s, candidates, { now: clock });
    expect(deck).toHaveLength(12);
    expect(deck.some(card => card.id === decision.id)).toBe(true);
    expect(deck.filter(card => card.id.startsWith("alert-"))).toHaveLength(11);
  });
});
