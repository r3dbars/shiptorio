import { describe, expect, it } from "bun:test";
import { FactoryState, insertCheck, type Item } from "@shiptorio/shared";
import { starterLine } from "../src/engine";
import { freshInspection, launchMove, liveStations, migrateGauntlet, nextGate, researchMove, reworkMove, runChecks, setStage, withChecks } from "../src/gauntlet";

const head = "c".repeat(40);
const pr = (overrides: Partial<Item> = {}): Item => ({ id: "gh-2", kind: "bug", source: "github_issue", title: "Fix cart", district: "/", state: "inspecting", attempts: 1, prNumber: 7, prUrl: "https://github.com/r3dbars/demo/pull/7", machineId: "ci-1", inspection: freshInspection(head), updatedAt: 1, ...overrides });
const researched = { research: { done: ["leftovers", "secrets"], spent: 4 } };
const diff = (line: string) => [{ filename: "web/src/cart.ts", patch: `@@ -1 +1 @@\n+${line}` }];

describe("researched checks in the gauntlet", () => {
  it("join a PR after CI and before the verify bay", () => {
    let item = withChecks(pr(), researched);
    expect(item.inspection?.checks?.map((c) => c.id)).toEqual(["leftovers", "secrets"]);
    item = setStage(item, "ci", "passed", "green");
    expect(item.machineId).toBe("check-leftovers");
    expect(nextGate(item)).toBe("checks");
    const { item: after, ran } = runChecks(item, diff("const total = sum(cart)"));
    expect(ran.every((r) => r.passed)).toBe(true);
    expect(after.machineId).toBe("verify-1");
    expect(nextGate(after)).toBe("verify");
    const done = setStage(setStage(after, "verify", "passed", "proof"), "ai", "passed", "ok");
    expect(done.state).toBe("on_pad");
    expect(launchMove(done).evidence?.map((e) => e.station)).toEqual(["CI inspector", "Leftover sweeper", "Secret scanner", "Verify bay", "AI review"]);
  });

  it("a failing check sends it back with a scar naming the check", () => {
    const item = setStage(withChecks(pr(), researched), "ci", "passed", "green");
    const { item: back } = runChecks(item, diff("console.log(cart)"));
    expect(back.state).toBe("rejected");
    expect(back.machineId).toBe("check-leftovers");
    expect(back.scars?.at(-1)).toMatchObject({ station: "custom", check: "leftovers", strike: 1 });
    expect(back.inspection?.checks?.[1].state).toBe("pending"); // the rest never ran
    expect(reworkMove(back).title).toBe("Leftover sweeper sent #7 back");
    // the second fail is a Steer: it says so, with the reason, and offers Try again
    const twice = { ...back, scars: [...(back.scars ?? []), { ...back.scars!.at(-1)!, strike: 2, reason: "console.log left in cart.ts" }] };
    const card = reworkMove(twice);
    expect(card.title).toBe("#7 failed twice");
    expect(card.why).toBe("Leftover sweeper: console.log left in cart.ts");
    expect(card.options[0]).toMatchObject({ label: "Try again", recommended: true });
  });

  it("leave PRs past the verify bay alone", () => {
    const past = setStage(setStage(pr(), "ci", "passed", "green"), "verify", "passed", "proof");
    expect(withChecks(past, researched)).toBe(past);
  });

  it("show up as stations between CI and the verify bay", () => {
    const s = FactoryState.parse({ repo: "r3dbars/demo", baseBranch: "main", districts: [], ...starterLine(), items: [], science: { red: 4, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0 });
    migrateGauntlet(s);
    const line = insertCheck(s, "leftovers");
    s.machines = [...s.machines.filter((m) => !line.machines.some((x) => x.id === m.id)), ...line.machines];
    s.belts = [...s.belts.filter((b) => !line.removed.includes(b.id)), ...line.belts];
    s.research = { done: ["leftovers"], spent: 2 };
    expect(liveStations(s).map((st) => st.id)).toEqual(["ci-1", "check-leftovers", "verify-1", "review-1", "gate-1", "orbit-1"]);
    expect(researchMove("leftovers", "AI review sent back 2 PRs for this.").options[0].actions[0]).toMatchObject({ tool: "research", args: { tech: "leftovers" } });
  });
});
