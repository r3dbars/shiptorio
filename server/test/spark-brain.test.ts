import { afterEach, describe, expect, it } from "bun:test";
import { gameMaster, triage, type GameMasterBrief } from "../src/spark";
import { emptyBrain, recordThought, sparkShare } from "../src/brain";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const reply = (content: unknown) => { globalThis.fetch = (async () => Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] })) as unknown as typeof fetch; };
const env = { META_API_KEY: "k" };
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
