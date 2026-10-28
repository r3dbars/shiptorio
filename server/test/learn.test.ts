import { describe, expect, it } from "bun:test";
import type { Move } from "@shiptorio/shared";
import { emptyDeckBook } from "../src/deck-decisions";
import { dismissNote, forget, forgetOnComeback, isLearned, LEARN_NEED, learnedList, learnFromYes, learnKey, learnLabel, learnMeter, learnOption, noteAutoRun, resetLearn } from "../src/learn";

const card = (tool: string, overrides: Partial<Move> = {}): Move => ({
  id: "c1", title: "Plan #7: fix the login", why: "", kind: "build", stage: "build", itemId: "gh-7", createdAt: 1,
  options: [{ id: "go", label: "Start the plan", recommended: true, actions: [{ tool, args: {}, reason: "" }] }, { id: "skip", label: "Not now", recommended: false, actions: [] }],
  ...overrides,
});
const scope = "district:web";

describe("learning what the player approves", () => {
  it("only plans and plan approvals can be learned", () => {
    expect(learnOption(card("plan_runner_job"))).toBe("go");
    expect(learnOption(card("approve_runner_job"))).toBe("go");
    expect(learnOption(card("request_merge"))).toBeNull();
    expect(learnOption(card("send_customer_reply"))).toBeNull();
    expect(learnOption(card("plan_runner_job", { kind: "ship" }))).toBeNull();
    expect(learnOption(card("plan_runner_job", { locked: true }))).toBeNull();
    const rework = card("plan_runner_job");
    rework.options[0].id = "rework-1";
    expect(learnOption(rework)).toBeNull();
  });

  it("fills the dots on yeses in a row and learns on the last one", () => {
    const book = emptyDeckBook(), c = card("plan_runner_job"), key = learnKey(c, scope);
    expect(key).toBe("build|district:web|plan_runner_job");
    expect(learnMeter(book, c, scope)).toBeUndefined(); // no dots before the first yes
    for (let i = 1; i < LEARN_NEED; i++) {
      expect(learnFromYes(book, c, scope, 10)).toBe(false);
      expect(learnMeter(book, c, scope)).toEqual({ have: i, need: LEARN_NEED });
    }
    expect(learnFromYes(book, c, scope, 10)).toBe(true);
    expect(isLearned(book, key)).toBe(true);
    expect(learnMeter(book, c, scope)).toBeUndefined();
    expect(learnedList(book)).toEqual([{ key, label: "Starting plans in /web", since: 10 }]);
  });

  it("starting and approving plans are learned apart", () => {
    const book = emptyDeckBook(), plan = card("plan_runner_job"), approve = card("approve_runner_job");
    learnFromYes(book, plan, scope, 1); learnFromYes(book, plan, scope, 1);
    expect(learnMeter(book, approve, scope)).toBeUndefined();
    expect(learnMeter(book, plan, scope)).toEqual({ have: 2, need: LEARN_NEED });
  });

  it("a Later, an Edit or a dismiss empties the dots of that kind and place", () => {
    const book = emptyDeckBook(), c = card("plan_runner_job");
    learnFromYes(book, c, scope, 1); learnFromYes(book, c, scope, 1);
    learnFromYes(book, c, "district:api", 1);
    resetLearn(book, "build", scope);
    expect(learnMeter(book, c, scope)).toBeUndefined();
    expect(learnMeter(book, c, "district:api")).toEqual({ have: 1, need: LEARN_NEED });
  });

  it("asks again when the player says so, or when work it ran on its own comes back", () => {
    const book = emptyDeckBook(), c = card("plan_runner_job"), key = learnKey(c, scope);
    for (let i = 0; i < LEARN_NEED; i++) learnFromYes(book, c, scope, 1);
    noteAutoRun(book, "gh-7", key);
    expect(forgetOnComeback(book, "gh-9")).toBeNull();
    expect(forgetOnComeback(book, "gh-7")).toBe(key);
    expect(isLearned(book, key)).toBe(false);
    expect(book.learnYes?.[key]).toBeUndefined();
    expect(forget(book, key)).toBe(false);
  });

  it("labels and dismiss notes read plainly", () => {
    expect(learnLabel("build|district:/|approve_runner_job")).toBe("Approving plans");
    expect(dismissNote(card("plan_runner_job"), scope)).toContain("try a smaller or different version");
  });
});
