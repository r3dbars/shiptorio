import { describe, expect, it } from "bun:test";
import type { Move } from "@shiptorio/shared";
import { emptyDeckBook, noteYes, resetYes } from "../src/deck-decisions";
import { dismissNote, forget, forgetOnComeback, isLearned, LEARN_NEED, learnedList, learnFromYes, learnKey, learnLabel, learnMeter, learnOption, noteAutoRun } from "../src/learn";

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
    expect(learnMeter(book, c, scope)).toEqual({ have: 0, need: LEARN_NEED });
    for (let i = 1; i < LEARN_NEED; i++) {
      noteYes(book, "build", scope);
      expect(learnFromYes(book, c, scope, 10)).toBe(false);
      expect(learnMeter(book, c, scope)).toEqual({ have: i, need: LEARN_NEED });
    }
    noteYes(book, "build", scope);
    expect(learnFromYes(book, c, scope, 10)).toBe(true);
    expect(isLearned(book, key)).toBe(true);
    expect(learnMeter(book, c, scope)).toBeUndefined();
    expect(learnedList(book)).toEqual([{ key, label: "Plans in /web", since: 10 }]);
  });

  it("a Later, an Edit or a dismiss empties the dots", () => {
    const book = emptyDeckBook(), c = card("plan_runner_job");
    noteYes(book, "build", scope); noteYes(book, "build", scope);
    resetYes(book, "build", scope);
    expect(learnMeter(book, c, scope)).toEqual({ have: 0, need: LEARN_NEED });
  });

  it("an old streak never skips the last yes", () => {
    const book = emptyDeckBook(), c = card("plan_runner_job");
    for (let i = 0; i < 7; i++) noteYes(book, "build", scope);
    expect(learnMeter(book, c, scope)).toEqual({ have: LEARN_NEED - 1, need: LEARN_NEED });
  });

  it("asks again when the player says so, or when work it ran on its own comes back", () => {
    const book = emptyDeckBook(), c = card("plan_runner_job"), key = learnKey(c, scope);
    for (let i = 0; i < LEARN_NEED; i++) noteYes(book, "build", scope);
    learnFromYes(book, c, scope, 1);
    noteAutoRun(book, "gh-7", key);
    expect(forgetOnComeback(book, "gh-9")).toBeNull();
    expect(forgetOnComeback(book, "gh-7")).toBe(key);
    expect(isLearned(book, key)).toBe(false);
    expect(book.yes?.[key]).toBeUndefined();
    expect(forget(book, key)).toBe(false);
  });

  it("labels and dismiss notes read plainly", () => {
    expect(learnLabel("verify|tool:run_missing_check")).toBe("Checks");
    expect(dismissNote(card("plan_runner_job"), scope)).toContain("try a smaller or different version");
  });
});
