import { describe, expect, it } from "bun:test";
import type { Item, Move } from "@shiptorio/shared";
import { emptyDeckBook } from "../src/deck-decisions";
import { dismissNote, forget, forgetAll, freshWork, forgetOnComeback, isLearned, LEARN_NEED, learnedList, learnFromYes, learnKey, learnLabel, learnMeter, learnOption, noteAutoRun, resetLearn } from "../src/learn";

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
    expect(learnMeter(book, c, scope, true)).toBeUndefined(); // no dots before the first yes
    for (let i = 1; i < LEARN_NEED; i++) {
      expect(learnFromYes(book, c, scope, 10, true, "justin")).toBe(false);
      expect(learnMeter(book, c, scope, true)).toEqual({ have: i, need: LEARN_NEED });
    }
    expect(learnFromYes(book, c, scope, 10, true, "justin")).toBe(true);
    expect(isLearned(book, key)).toBe(true);
    expect(learnMeter(book, c, scope, true)).toBeUndefined();
    expect(learnedList(book)).toEqual([{ key, label: "Starting plans in /web", since: 10 }]);
    expect(book.auto?.[key].by).toBe("justin");
    noteAutoRun(book, "gh-9", key); // the deck says which crates Shippy started itself
    expect(learnedList(book)).toEqual([{ key, label: "Starting plans in /web", since: 10, items: ["gh-9"] }]);
  });

  it("starting and approving plans are learned apart", () => {
    const book = emptyDeckBook(), plan = card("plan_runner_job"), approve = card("approve_runner_job");
    learnFromYes(book, plan, scope, 1, true, "justin"); learnFromYes(book, plan, scope, 1, true, "justin");
    expect(learnMeter(book, approve, scope, true)).toBeUndefined();
    expect(learnMeter(book, plan, scope, true)).toEqual({ have: 2, need: LEARN_NEED });
  });

  it("a Later, an Edit or a dismiss empties the dots of that kind and place", () => {
    const book = emptyDeckBook(), c = card("plan_runner_job");
    learnFromYes(book, c, scope, 1, true, "justin"); learnFromYes(book, c, scope, 1, true, "justin");
    learnFromYes(book, c, "district:api", 1, true, "justin");
    resetLearn(book, "build", scope);
    expect(learnMeter(book, c, scope, true)).toBeUndefined();
    expect(learnMeter(book, c, "district:api", true)).toEqual({ have: 1, need: LEARN_NEED });
  });

  it("asks again when the player says so, or when work it ran on its own comes back", () => {
    const book = emptyDeckBook(), c = card("plan_runner_job"), key = learnKey(c, scope);
    for (let i = 0; i < LEARN_NEED; i++) learnFromYes(book, c, scope, 1, true, "justin");
    noteAutoRun(book, "gh-7", key);
    expect(forgetOnComeback(book, "gh-9")).toBeNull();
    expect(forgetOnComeback(book, "gh-7")).toBe(key);
    expect(isLearned(book, key)).toBe(false);
    expect(book.learnYes?.[key]).toBeUndefined();
    expect(forget(book, key)).toBe(false);
  });

  it("forgetting everything also empties half-filled dots, so a scripted run leaves no streak behind", () => {
    const book = emptyDeckBook(), plan = card("plan_runner_job"), build = card("approve_runner_job");
    for (let i = 0; i < LEARN_NEED; i++) learnFromYes(book, plan, scope, 1, true, "justin");
    learnFromYes(book, build, scope, 1, true, "justin");
    noteAutoRun(book, "gh-7", learnKey(plan, scope));
    expect(forget(book, learnKey(build, scope))).toBe(false); // one key can't clear a streak that never learned
    expect(forgetAll(book)).toBe(true);
    expect(learnedList(book)).toEqual([]);
    expect(learnMeter(book, build, scope, true)).toBeUndefined();
    expect(forgetAll(book)).toBe(false);
  });

  it("rework, base refreshes and work with a PR or a scar never count or show dots", () => {
    const book = emptyDeckBook(), c = card("approve_runner_job");
    const item = { id: "gh-7", kind: "bug", source: "github_issue", title: "Fix the login", district: "web", state: "queued", attempts: 0, updatedAt: 1 } as Item;
    expect(freshWork(c, item, [])).toBe(true);
    expect(freshWork(c, undefined, [])).toBe(false);
    expect(freshWork(c, { ...item, prNumber: 170 }, [])).toBe(false);
    expect(freshWork(c, { ...item, state: "rejected" }, [])).toBe(false);
    expect(freshWork(c, { ...item, scars: [{ station: "ci", reason: "red", at: 1 }] } as unknown as Item, [])).toBe(false);
    expect(freshWork(c, item, [{ itemId: "gh-7", approvalMoveId: "c1", reworkPr: 170 }])).toBe(false);
    expect(freshWork(c, item, [{ itemId: "gh-7", approvalMoveId: "c1", refreshBase: { expectedHeadSha: "a" } }])).toBe(false);
    const refresh = card("plan_runner_job"); refresh.options[0].actions[0].args = { refreshBase: true };
    expect(freshWork(refresh, item, [])).toBe(false);
    for (let i = 0; i < 5; i++) expect(learnFromYes(book, c, scope, 1, false, "justin")).toBe(false);
    expect(book.learnYes).toBeUndefined();
    expect(learnMeter(book, c, scope, false)).toBeUndefined();
  });

  it("labels and dismiss notes read plainly", () => {
    expect(learnLabel("build|district:/|approve_runner_job")).toBe("Approving plans");
    expect(dismissNote(card("plan_runner_job"), scope)).toContain("try a smaller or different version");
  });
});

it("README and docs-only approvals share a reviewed scope; code and mixed changes do not", async () => {
  const { learnScope } = await import("../src/learn");
  const c = card("approve_runner_job");
  const scopeFor = (files: string[]) => learnScope(c, "district:/", [{ approvalMoveId: c.id, allowedPaths: files }]);
  expect(scopeFor(["README.md"])).toBe("district:docs");
  expect(scopeFor(["docs/setup.md", "docs/guide.rst"])).toBe("district:docs");
  expect(scopeFor(["README.md", "package.json"])).toBe("district:/");
  expect(scopeFor(["docs/worker.ts"])).toBe("district:/");
  expect(scopeFor(["docs/../server/secrets.md"])).toBeNull();
  expect(scopeFor([])).toBeNull();
  expect(learnScope(card("plan_runner_job"), "district:/", [{ approvalMoveId: c.id, allowedPaths: ["README.md"] }])).toBe("district:/");
});

it("resetting a learned class revokes automation as well as its streak", () => {
  const book = emptyDeckBook(), c = card("approve_runner_job"), key = learnKey(c, scope);
  for (let n = 0; n < 3; n++) learnFromYes(book, c, scope, n, true, "justin");
  noteAutoRun(book, "gh-7", key);
  resetLearn(book, "build", scope);
  expect(isLearned(book, key)).toBe(false);
  expect(book.autoRuns).toEqual([]);
  expect(learnMeter(book, c, scope, true)).toBeUndefined();
});


it("docs code approvals teach a separate class and never fill the prose streak", async () => {
  const { learnScope } = await import("../src/learn");
  const c = card("approve_runner_job"), book = emptyDeckBook();
  const codeScope = learnScope(c, "district:docs", [{ approvalMoveId: c.id, allowedPaths: ["docs/example.ts"] }]);
  expect(codeScope).toBe("code:docs");
  for (let n = 0; n < LEARN_NEED; n++) learnFromYes(book, c, codeScope, n, true, "justin");
  expect(isLearned(book, learnKey(c, "code:docs"))).toBe(true);
  expect(isLearned(book, learnKey(c, "district:docs"))).toBe(false);
  expect(learnMeter(book, c, "district:docs", true)).toBeUndefined();
  expect(learnLabel(learnKey(c, "code:docs"))).toBe("Approving code plans in /docs");
  resetLearn(book, "build", codeScope);
  expect(isLearned(book, learnKey(c, "code:docs"))).toBe(false);
});

it("missing, ambiguous, noncanonical or forbidden approval files never teach a class", async () => {
  const { learnScope } = await import("../src/learn");
  const c = card("approve_runner_job"), book = emptyDeckBook();
  for (const allowedPaths of [undefined, [], ["docs//guide.md"], ["docs/./guide.md"], ["docs/../guide.md"], ["/docs/guide.md"], ["docs/AGENTS.md"], ["docs/.env.md"], Array.from({length: 11}, (_, i) => `docs/${i}.md`)]) {
    const value = learnScope(c, "district:docs", [{ approvalMoveId: c.id, allowedPaths }]);
    expect(value).toBeNull();
    for (let n = 0; n < LEARN_NEED; n++) expect(learnFromYes(book, c, value, n, true, "justin")).toBe(false);
    expect(learnMeter(book, c, value, true)).toBeUndefined();
  }
  c.options[0].actions.push({ tool: "plan_runner_job", args: {}, reason: "" });
  expect(learnScope(c, "district:docs", [{ approvalMoveId: c.id, allowedPaths: ["README.md"] }])).toBeNull();
  expect(book.auto).toBeUndefined();
});
