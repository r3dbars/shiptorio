import { sparkTestEnv } from "./budget-fixture";
import { afterEach, describe, expect, it } from "bun:test";
import { gameMaster, triage, type GameMasterBrief } from "../src/spark";
import { emptyBrain, recordThought, scoreShip, sparkShare } from "../src/brain";
import { Brain, scorecard } from "@shiptorio/shared";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const reply = (content: unknown) => { globalThis.fetch = (async () => Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] })) as unknown as typeof fetch; };
const env = sparkTestEnv();
const brief: GameMasterBrief = {
  bottleneck: { stage: "inspect", stationId: "review-1", wip: 2, ageMinutes: 30, valueAtRisk: 8, summary: "2 items waiting at AI review." },
  stages: [], items: [], playerFeedback: "{}",
  cards: [
    { id: "ship", title: "Launch #4", why: "Green", options: [{ id: "launch", label: "Launch", recommended: true }, { id: "later", label: "Later", recommended: false }] },
    { id: "bottleneck:review-1", title: "2 items waiting", why: "x", options: [{ id: "review", label: "Review", recommended: true }] },
  ],
};

describe("Spark game master", () => {
  it("keeps only real card ids and real option ids", async () => {
    reply({ order: ["bottleneck:review-1", "made-up", "ship"], reason: "Review is the jam.", picks: { ship: "later", "bottleneck:review-1": "merge_everything" }, because: { ship: "  Two  fixes wait on review first. ", ghost: "x" }, bottleneck: { title: "Review is backed up", why: "Two fixes wait." } });
    const call = await gameMaster(env, brief);
    expect(call.order).toEqual(["bottleneck:review-1", "ship"]);
    expect(call.picks).toEqual({ ship: "later" });
    expect(call.bottleneck?.title).toBe("Review is backed up");
    expect(call.because).toEqual({ ship: "Two fixes wait on review first." });
  });
  it("refuses an empty order so the rule ranking stands", async () => {
    reply({ order: ["nope"], reason: "?" });
    await expect(gameMaster(env, brief)).rejects.toThrow("no card order");
  });
  it("triage carries Spark's reason", async () => {
    reply({ kind: "bug", district: "web", reason: "Safari checkout spins." });
    expect(await triage(env, { title: "Pay spins", body: "", labels: [] }, ["/", "web"])).toEqual({ kind: "bug", district: "web", reason: "Safari checkout spins." });
  });
});

describe("decision log", () => {
  it("counts Spark calls and fallbacks, newest first", () => {
    let b = emptyBrain("muse-spark-1.3", true);
    b = recordThought(b, { at: 1, decision: "triage", by: "spark", model: "muse-spark-1.3", ms: 900, title: "A", outcome: "bug → web", reason: "r" });
    b = recordThought(b, { at: 2, decision: "triage", by: "fallback", model: "keyword rule", ms: 0, title: "B", outcome: "feature → /", reason: "r" });
    expect([b.decisions, b.fallbacks, b.thoughts[0].title]).toEqual([1, 1, "B"]);
    expect(sparkShare(b)).toBe(0.5);
  });
  it("a repeat re-rank replaces itself instead of burying plans", () => {
    let b = emptyBrain("m", true);
    const rank = { at: 1, decision: "rank" as const, by: "spark" as const, model: "m", ms: 1, title: "deck", outcome: "Top card: X", reason: "r" };
    b = recordThought(recordThought(b, rank), rank);
    expect([b.thoughts.length, b.decisions]).toEqual([1, 2]);
  });
});

import { judgeOrbit, judgePermit, pickResearch } from "../src/spark";
describe("Spark judges", () => {
  const orbit = { launch: { pr: 4, title: "Fix cart", district: "web", files: ["web/cart.ts"], launchedMinutesAgo: 40 }, error: { title: "Font CDN 404", district: "web", events: 5, firstSeenMinutesAfterLaunch: 30 } };
  it("orbit: a clear unrelated verdict keeps the launch up", async () => {
    reply({ caused: false, reason: "A CDN outage, nothing in cart.ts." });
    expect(await judgeOrbit(env, orbit)).toEqual({ caused: false, reason: "A CDN outage, nothing in cart.ts." });
  });
  it("orbit: no verdict throws so the spike rule stands", async () => {
    reply({ reason: "hmm" });
    await expect(judgeOrbit(env, orbit)).rejects.toThrow();
  });
  it("research: only techs on the tree, null allowed", async () => {
    const c = { scars: [{ station: "ci", reason: "console.log left" }, { station: "ci", reason: "debugger left" }], techs: [{ id: "leftovers", name: "Leftover sweeper", what: "", cost: 2, affordable: true }] };
    reply({ tech: "leftovers", why: "Two debug leftovers." });
    expect((await pickResearch(env, c)).tech).toBe("leftovers");
    reply({ tech: null, why: "" });
    expect((await pickResearch(env, c)).tech).toBeNull();
    reply({ tech: "rm-rf", why: "" });
    await expect(pickResearch(env, c)).rejects.toThrow("isn't on the tree");
  });
  it("permit: advice needs a boolean", async () => {
    reply({ recommend: false, why: "Only typo fixes so far." });
    expect(await judgePermit(env, { lane: "docs", streak: 5, need: 5, ships: [], openRisks: [] })).toEqual({ recommend: false, why: "Only typo fixes so far." });
  });
});

import { planLocalTask } from "../src/spark";
describe("plans learn from never swipes", () => {
  it("sends the player's past calls to the planner and cites the ones it heeded", async () => {
    const bodies: string[] = [];
    const turns = [
      { tool: "read_issue", reason: "Read it" },
      { tool: "read_file", path: "src/cart.ts", reason: "Read the code" },
      { tool: "assign_job", reason: "Clear", plan: "Fix the percent math.", acceptance: ["SAVE10 takes 10%"], files: ["src/cart.ts"], heeded: ["You said no refactors in /src, so this only touches discount()."] },
    ];
    globalThis.fetch = (async (_: unknown, init?: RequestInit) => { bodies.push(String(init?.body)); return Response.json({ choices: [{ message: { content: JSON.stringify(turns[bodies.length - 1]) } }] }); }) as unknown as typeof fetch;
    const feedback = JSON.stringify({ excludedMoveClasses: [{ kind: "build", scope: "district:src" }], playerCorrections: ["Player correction for build in district:src: Refactor cart. Reason: wrong call"] });
    const out = await planLocalTask(env, { title: "SAVE10", body: "", district: "src", playerFeedback: feedback }, ["src/cart.ts"], async () => "code", async () => {});
    expect(bodies[0]).toContain("wrong call");
    expect(out.heeded).toHaveLength(1);
    expect(out.plan).toContain("Respects your past calls:\n- You said no refactors");
  });
});

describe("scorecard", () => {
  const t = (decision: "plan" | "review" | "triage", by: "spark" | "fallback", outcome: string, itemId = "gh-1") => ({ decision, by, outcome, itemId, at: 1, model: "m", ms: 1, title: "x", reason: "r" });
  it("measures plan success, review catch rate and fallback share", () => {
    let b = emptyBrain("m", true);
    expect(scorecard(b)).toMatchObject({ planSuccess: null, catchRate: null, fallbackRate: null });
    b = recordThought(b, t("plan", "spark", "Planned 2 files"));
    b = recordThought(b, t("plan", "spark", "Re-planned after a scar")); // same job, counted once
    b = recordThought(b, t("plan", "spark", "Planned 1 file", "gh-2"));
    b = recordThought(b, t("review", "spark", "Sent codex's PR back"));
    b = recordThought(b, t("review", "spark", "Passed codex's PR"));
    b = recordThought(b, t("review", "spark", "Verdict made, comment didn't post yet; retrying")); // not a new verdict
    b = recordThought(b, t("triage", "fallback", "bug → web"));
    b = scoreShip(b, "gh-1")!;
    b = scoreShip(b, "gh-1")!; // a redelivered merge doesn't count twice
    b = scoreShip(b, "gh-9")!; // never planned, not on the card
    expect(scorecard(b)).toEqual({ planSuccess: 0.5, catchRate: 0.5, fallbackRate: 1 / 7, plans: 2, shipped: 1, reviews: 2, catches: 1 });
  });
});

it("retains every outstanding plan until launch, beyond fifty concurrent plans", () => {
  let b = emptyBrain("m", true);
  for (let i = 0; i < 75; i++) b = recordThought(b, { decision: "plan", by: "spark", outcome: "Planned", itemId: `gh-${i}`, at: i, model: "m", ms: 1, title: "x", reason: "r" });
  b = Brain.parse(JSON.parse(JSON.stringify(b)));
  b = recordThought(b, { decision: "plan", by: "spark", outcome: "Re-planned", itemId: "gh-0", at: 76, model: "m", ms: 1, title: "x", reason: "r" });
  expect(b.score?.plans).toBe(75);
  for (let i = 0; i < 75; i++) b = scoreShip(b, `gh-${i}`)!;
  expect(scorecard(b)).toMatchObject({ plans: 75, shipped: 75, planSuccess: 1 });
  expect(b.score?.open).toEqual([]);
});

describe("tolerant replies (live Testing run, 2026-10-26)", () => {
  const sequence = (contents: string[], seen: string[] = []) => {
    let n = 0;
    globalThis.fetch = (async (_u: unknown, init: RequestInit) => { seen.push(String(init.body)); return Response.json({ choices: [{ message: { content: contents[Math.min(n++, contents.length - 1)] } }] }); }) as unknown as typeof fetch;
  };
  it("triage keeps a reply with extra keys, an off-list kind or a file path for district", async () => {
    sequence([JSON.stringify({ kind: "docs", district: "README.md", reason: "README fix.", confidence: 0.9 })]);
    expect(await triage(env, { title: "Docs: start a changelog", body: "", labels: [] }, ["/", "src"])).toMatchObject({ district: "/", reason: "README fix." });
  });
  it("repairs trailing commas and smart-quoted keys", async () => {
    sequence(['{“kind”: "bug", "district": "src", "reason": "Wrong total.",}']);
    expect(await triage(env, { title: "Receipt says 2 items", body: "", labels: [] }, ["/", "src"])).toEqual({ kind: "bug", district: "src", reason: "Wrong total." });
  });
  it("escapes a double quote the model forgot to escape inside a sentence", async () => {
    sequence(['{"order": ["ship"], "reason": "Ship "Fix receipt" first, it\'s green.", "because": {"ship": "The "2 items" bug is fixed: [tests] pass."}}']);
    const call = await gameMaster(env, brief);
    expect(call.reason).toBe('Ship "Fix receipt" first, it\'s green.');
    expect(call.because.ship).toBe('The "2 items" bug is fixed: [tests] pass.');
  });
  it("keeps what arrived when a reply is cut off mid-sentence, without the half sentence", async () => {
    sequence(['{"order": ["bottleneck:review-1", "ship"], "reason": "Review is the jam.", "because": {"bottleneck:review-1": "Two fixes wait.", "ship": "It passed every sta']);
    const call = await gameMaster(env, brief);
    expect(call.order).toEqual(["bottleneck:review-1", "ship"]);
    expect(call.because).toEqual({ "bottleneck:review-1": "Two fixes wait." });
  });
  it("skips chatter with braces before the JSON", async () => {
    sequence(['Looking at {cards} and {stations} first. {"order": ["ship"], "reason": "Ship it."}']);
    expect((await gameMaster(env, brief)).order).toEqual(["ship"]);
  });
  it("asks once more with the reason when a reply is malformed, then uses the good one", async () => {
    const seen: string[] = [];
    sequence(['{"order": ["ship" "bottleneck:review-1"]}', JSON.stringify({ order: ["ship"], reason: "Ship it." })], seen);
    expect((await gameMaster(env, brief)).order).toEqual(["ship"]);
    expect(seen).toHaveLength(2);
    expect(seen[1]).toContain("previous reply was rejected");
  });
  it("gives up after two bad replies so the fixed rule decides", async () => {
    sequence(["not json at all"]);
    await expect(triage(env, { title: "x", body: "", labels: [] }, ["/"])).rejects.toThrow("twice");
  });
});

describe("pickFiles drops picks outside the list", () => {
  it("keeps the listed, allowed files and drops the rest", async () => {
    const { pickFiles } = await import("../src/spark");
    globalThis.fetch = (async () => Response.json({ choices: [{ message: { content: JSON.stringify({ files: ["src/cart.ts", "src/made-up.ts", "src/cart.ts"] }) } }] })) as unknown as typeof fetch;
    expect(await pickFiles(env, { title: "x", body: "", district: "src" }, ["src/cart.ts", "README.md"])).toEqual(["src/cart.ts"]);
  });
  it("still fails when nothing it picked is on the list", async () => {
    const { pickFiles } = await import("../src/spark");
    globalThis.fetch = (async () => Response.json({ choices: [{ message: { content: JSON.stringify({ files: ["server/.dev.vars"] }) } }] })) as unknown as typeof fetch;
    await expect(pickFiles(env, { title: "x", body: "", district: "src" }, ["src/cart.ts"])).rejects.toThrow("Unapproved file selection");
  });
  it("lets a docs task propose up to two new Markdown files at the root or in docs/", async () => {
    const { pickFiles } = await import("../src/spark");
    globalThis.fetch = (async () => Response.json({ choices: [{ message: { content: JSON.stringify({ files: ["CHANGELOG.md", "docs/deep/x.md", "docs/SHIPPING.md", "docs/THIRD.md"] }) } }] })) as unknown as typeof fetch;
    expect(await pickFiles(env, { title: "Add a changelog", body: "", district: "docs" }, ["README.md"])).toEqual(["CHANGELOG.md", "docs/SHIPPING.md"]);
  });
  it("never lets it invent a new code file", async () => {
    const { pickFiles } = await import("../src/spark");
    globalThis.fetch = (async () => Response.json({ choices: [{ message: { content: JSON.stringify({ files: ["src/new.ts", ".github/x.md"] }) } }] })) as unknown as typeof fetch;
    await expect(pickFiles(env, { title: "x", body: "", district: "src" }, ["README.md"])).rejects.toThrow("Unapproved file selection");
  });
});

describe("a re-plan sees why the last attempt was sent back", () => {
  it("puts the failure and scars next to the title on every turn", async () => {
    const { planLocalTask } = await import("../src/spark");
    const users: string[] = [];
    const script = [{ tool: "read_issue", reason: "ask" }, { tool: "read_file", path: "README.md", reason: "look" }, { tool: "assign_job", reason: "fix", plan: "Show the coupon as a positional argument.", acceptance: ["No --coupon flag"], files: ["README.md"] }];
    let n = 0;
    globalThis.fetch = (async (_u: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { messages: { role: string; content: string }[] };
      users.push(body.messages.find(m => m.role === "user")!.content);
      return Response.json({ choices: [{ message: { content: JSON.stringify(script[n++]) } }] });
    }) as unknown as typeof fetch;
    await planLocalTask(env, { title: "README uses npm", body: "", district: "/", failure: "AI review: --coupon is never parsed", scars: [{ station: "review", reason: "src/index.ts reads argv[2]", strike: 1 }] }, ["README.md"], async () => "# readme", async () => {});
    expect(users).toHaveLength(3);
    for (const u of users) { expect(u).toContain("--coupon is never parsed"); expect(u).toContain("review: src/index.ts reads argv[2]"); }
  });
  it("leaves a first plan alone", async () => {
    const { planLocalTask } = await import("../src/spark");
    const users: string[] = [];
    const script = [{ tool: "read_issue", reason: "ask" }, { tool: "read_file", path: "README.md", reason: "look" }, { tool: "assign_job", reason: "fix", plan: "Use bun.", acceptance: ["bun"], files: ["README.md"] }];
    let n = 0;
    globalThis.fetch = (async (_u: unknown, init: RequestInit) => {
      users.push((JSON.parse(String(init.body)) as { messages: { role: string; content: string }[] }).messages.find(m => m.role === "user")!.content);
      return Response.json({ choices: [{ message: { content: JSON.stringify(script[n++]) } }] });
    }) as unknown as typeof fetch;
    await planLocalTask(env, { title: "README uses npm", body: "", district: "/" }, ["README.md"], async () => "# readme", async () => {});
    expect(users[0]).not.toContain('"rework"');
  });
});

it("planner failure copy in the public decision log never names the model", () => {
  const brain = recordThought(emptyBrain('muse-spark-1.3', true), { at: 1, decision: 'plan', by: 'fallback', model: 'fixed rule', ms: 1, title: 'Fix cart', outcome: 'Spark returned no content', reason: 'Spark is unavailable' });
  expect(brain.thoughts[0].outcome).toBe('planner returned no content');
  expect(brain.thoughts[0].reason).toBe('planner is unavailable');
});
