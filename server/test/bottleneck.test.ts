import { describe, expect, it } from "bun:test";
import { FactoryState, type Item } from "@shiptorio/shared";
import { deriveBottleneck, itemValue, stageForItem, type BottleneckJob, type PipelineStage, type StageHistory } from "../src/bottleneck";

const now = 10_000_000;
const item = (overrides: Partial<Item> = {}): Item => ({ id: "i", kind: "bug", source: "github_issue", title: "Fix crash", district: "/", state: "queued", updatedAt: now - 1000, attempts: 0, ...overrides });
const factory = (items: Item[] = []) => FactoryState.parse({ repo: "r3dbars/demo", baseBranch: "main", districts: [], machines: [], belts: [], power: [], items, science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0, tick: 0 });
const inspect = (gate: "ci" | "verify" | "ai" | "human") => ({ headSha: "a".repeat(40), state: "pending" as const, humanApproved: false, stages: (["ci", "verify", "ai", "human"] as const).map((g, index, all) => ({ gate: g, state: index < all.indexOf(gate) ? "passed" as const : "pending" as const, reason: "test" })) });

describe("real bottleneck engine", () => {
  it("maps each real queue independently, including the gauntlet", () => {
    const cases: { stage: PipelineStage; wire: string; item: Item; jobs?: BottleneckJob[]; history?: StageHistory[]; station?: string }[] = [
      { stage: "intake", wire: "intake", item: item({ state: "ore" }) },
      { stage: "triage", wire: "triage", item: item(), jobs: [{ itemId: "i", status: "planning" }] },
      { stage: "build", wire: "build", item: item({ state: "working" }) },
      { stage: "ci", wire: "inspect", station: "ci-1", item: item({ state: "inspecting", inspection: inspect("ci") }) },
      { stage: "verify", wire: "inspect", station: "verify-1", item: item({ state: "inspecting", inspection: inspect("verify") }) },
      { stage: "review", wire: "inspect", station: "review-1", item: item({ state: "inspecting", inspection: inspect("ai") }) },
      { stage: "merge", wire: "pad", station: "gate-1", item: item({ state: "on_pad" }) },
      ...(["release", "impact"] as const).map(stage => ({ stage, wire: stage, item: item({ state: "launched" }), history: [{ itemId: "i", stage, enteredAt: now - 1000 }] })),
    ];
    for (const c of cases) {
      const result = deriveBottleneck(factory([c.item]), { now, powered: true, jobs: c.jobs, history: c.history });
      expect(result.bottleneck).toMatchObject({ stage: c.wire, wip: 1, ageMs: 1000, valueAtRisk: 5 });
      expect(result.bottleneck?.stationId).toBe(c.station);
      expect(result.stages.find(s => s.stage === c.stage)?.wip).toBe(1);
    }
  });
  it("chooses highest total value times oldest wait, with stable pipeline-order ties", () => {
    const items = [item({ id: "build", value: 8 }), item({ id: "ore", state: "ore", value: 4, updatedAt: now - 2000 })];
    expect(deriveBottleneck(factory(items), { now, powered: true }).bottleneck?.stage).toBe("intake");
    expect(deriveBottleneck(factory([...items].reverse()), { now, powered: true }).bottleneck?.stage).toBe("intake");
    items.push(item({ id: "second", value: 1 }));
    expect(deriveBottleneck(factory(items), { now, powered: true }).bottleneck).toMatchObject({ stage: "build", wip: 2, valueAtRisk: 9 });
  });
  it("uses observed stage entry instead of unrelated updatedAt changes", () => {
    const history: StageHistory[] = [{ itemId: "i", stage: "build", enteredAt: now - 20_000 }];
    expect(deriveBottleneck(factory([item({ updatedAt: now })]), { now, powered: true, history }).bottleneck?.ageMs).toBe(20_000);
  });
  it("measures rolling exits rather than guessing throughput from current WIP", () => {
    const history: StageHistory[] = [
      { itemId: "old", stage: "build", enteredAt: now - 8_000_000, exitedAt: now - 3_600_000 },
      { itemId: "one", stage: "build", enteredAt: now - 2000, exitedAt: now - 1000 },
      { itemId: "two", stage: "build", enteredAt: now - 2000, exitedAt: now },
      { itemId: "future", stage: "build", enteredAt: now, exitedAt: now + 1 },
      { itemId: "invalid", stage: "build", enteredAt: now, exitedAt: now - 1 },
    ];
    expect(deriveBottleneck(factory([item()]), { now, powered: true, history }).bottleneck?.throughputPerHour).toBe(2);
    expect(deriveBottleneck(factory([item()]), { now, powered: true, history, windowMs: 1_800_000 }).bottleneck?.throughputPerHour).toBe(4);
  });
  it("shows missing resources only for work actually blocked on building", () => {
    expect(deriveBottleneck(factory(), { now }).bottleneck).toBeNull();
    expect(deriveBottleneck(factory([item({ state: "ore" })]), { now }).bottleneck?.stage).toBe("intake");
    expect(deriveBottleneck(factory([item()]), { now }).bottleneck?.stage).toBe("resources");
    const state = factory([item()]);
    state.power.push({ id: "codex", name: "ChatGPT", kind: "solar", level: 0, online: true });
    expect(deriveBottleneck(state, { now }).bottleneck?.stage).toBe("power");
    state.power[0].level = 1;
    expect(deriveBottleneck(state, { now }).bottleneck?.stage).toBe("build");
    expect(deriveBottleneck(state, { now, powered: false }).bottleneck?.stage).toBe("power");
  });
  it("keeps scars at the failed station until re-planning takes over", () => {
    const rejected = item({ state: "rejected", scars: [{ station: "review", reason: "miss", strike: 1 }], inspection: inspect("ai") });
    expect(stageForItem(rejected)).toBe("review");
    expect(stageForItem(rejected, [{ itemId: "i", status: "planning" }])).toBe("triage");
    expect(stageForItem(rejected, [{ itemId: "i", status: "awaiting_approval" }])).toBe("build");
    expect(stageForItem(rejected, [{ itemId: "i", status: "completed" }])).toBe("review");
  });
  it("uses real station ids, sane waits and explicit zero weights", () => {
    const state = factory([item({ state: "inspecting", inspection: inspect("verify"), updatedAt: now + 100, value: 0 })]);
    state.stations = [{ id: "custom-verify", kind: "verify", name: "Verify bay", wip: 1, caughtThisWeek: 0, actions: [] }];
    expect(deriveBottleneck(state, { now }).bottleneck).toMatchObject({ stationId: "custom-verify", ageMs: 0, valueAtRisk: 0 });
    expect(itemValue(item({ kind: "cleanup" }))).toBe(1);
    expect(itemValue(item({ value: Number.NaN }))).toBe(5);
    expect(itemValue(item({ value: -10 }))).toBe(0);
  });
  it("does not fabricate release or impact trouble just because a PR merged", () => {
    expect(deriveBottleneck(factory([item({ state: "launched" })]), { now }).bottleneck).toBeNull();
  });
});
