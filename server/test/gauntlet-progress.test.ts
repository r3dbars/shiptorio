import { expect, it, mock } from "bun:test";
import { FactoryState, type Item } from "@shiptorio/shared";
import { starterLine } from "../src/engine";
import { freshInspection, nextGate, setStage } from "../src/gauntlet";
mock.module("cloudflare:workers", () => ({ DurableObject: class {} }));
const { Factory } = await import("../src/factory");

const head = "a".repeat(40);
const item = (id = "first", pr = 7): Item => setStage({ id, kind: "bug", source: "github_issue", title: "Fix", district: "/", state: "inspecting", attempts: 1, prNumber: pr, inspection: freshInspection(head), updatedAt: 1 }, "ci", "passed", "green");
function fixture() {
  // Exercise the real tick/burst scheduler; station I/O and unrelated polling are boundaries.
  const f: any = Object.create(Factory.prototype);
  const events: string[] = [];
  f.state = FactoryState.parse({ repo: "owner/repo", baseBranch: "main", districts: [], ...starterLine(), items: [item(), item("second", 8)], science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0 });
  f.meta = { repo: "owner/repo", installationId: 1 };
  let paused = false, stopped = false;
  f.env = { DB: { prepare: () => ({ bind: () => ({ first: async () => paused ? { scope: "*" } : null }) }) } };
  f.ctx = { storage: { getAlarm: async () => Date.now() + 1000 } };
  f.load = async () => f.state;
  f.processDeliveries = async () => { events.push("deliveries"); };
  f.githubStopped = async () => stopped;
  f.githubRestUntil = 0;
  f.reliabilityFailure = async () => {};
  f.refreshDecisions = async () => {};
  f.accountAlarm = async () => {};
  f.runGauntlet = async (target: Item) => {
    events.push(`${target.id}:${nextGate(target)}`);
    const advanced = setStage(target, nextGate(target) === "checks" ? "ci" : nextGate(target)!, "passed", "proof");
    f.state.items = f.state.items.map((i: Item) => i === target ? advanced : i);
    return advanced;
  };
  return { f, events, pause: () => { paused = true; }, stop: () => { stopped = true; } };
}
it("advances one proven PR through verify and review before due background reconciliation", async () => {
  const { f, events } = fixture();
  f.guard = async (name: string) => { events.push(`background:${name}`); throw new Error("end after first background boundary"); };
  f.githubGuard = async (_name: string, run: () => Promise<void>) => run();
  await f.tick();
  expect(events).toEqual(["deliveries", "first:verify", "first:ai", "background:pollPostHog"]);
  expect(f.state.items[0].state).toBe("on_pad");
  expect(nextGate(f.state.items[1])).toBe("verify");
});
it("never follows no progress, a rejection, or a replaced exact-head inspection", async () => {
  for (const mode of ["no-progress", "rework", "replacement", "new-head", "new-pr"] as const) {
    const { f, events } = fixture();
    f.runGauntlet = async (target: Item) => {
      events.push(target.id);
      if (mode === "no-progress") return;
      const advanced = setStage(target, "verify", mode === "rework" ? "rework" : "passed", "proof");
      f.state.items[0] = mode === "replacement" ? { ...advanced, inspection: { ...advanced.inspection! } }
        : mode === "new-head" ? { ...advanced, inspection: { ...advanced.inspection!, headSha: "b".repeat(40) } }
        : mode === "new-pr" ? { ...advanced, prNumber: 9 } : advanced;
      return advanced;
    };
    await f.runGauntletBurst();
    expect(events).toEqual(["first"]);
  }
});
it("rechecks pause, lifecycle and GitHub cooldown between stations without selecting another PR", async () => {
  for (const mode of ["pause", "stop", "cooldown"] as const) {
    const { f, events, pause, stop } = fixture(), advance = f.runGauntlet;
    f.runGauntlet = async (target: Item) => {
      const result = await advance(target);
      if (mode === "pause") pause(); else if (mode === "stop") stop(); else f.githubRestUntil = Date.now() + 60000;
      return result;
    };
    await f.runGauntletBurst();
    expect(events).toEqual(["first:verify"]);
  }
});

it("caps a three-station path at two and never starts AI or another PR as a third station", async () => {
  const { f, events } = fixture();
  f.state.items[0].inspection.checks = [{ id: "test-check", state: "pending", reason: "waiting" }];
  f.runGauntlet = async (target: Item) => {
    const gate = nextGate(target); events.push(`${target.id}:${gate}`);
    const advanced = gate === "checks" ? { ...target, inspection: { ...target.inspection!, checks: target.inspection!.checks!.map(c => ({ ...c, state: "passed" })) } }
      : setStage(target, "verify", "passed", "proof");
    f.state.items[0] = advanced; return advanced;
  };
  await f.runGauntletBurst();
  expect(events).toEqual(["first:checks", "first:verify"]);
  expect(nextGate(f.state.items[0])).toBe("ai");
});
