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
    reply({ order: ["bottleneck:review-1", "made-up", "ship"], reason: "Review is the jam.", picks: { ship: "later", "bottleneck:review-1": "merge_everything" }, bottleneck: { title: "Review is backed up", why: "Two fixes wait." } });
    const call = await gameMaster(env, brief);
    expect(call.order).toEqual(["bottleneck:review-1", "ship"]);
    expect(call.picks).toEqual({ ship: "later" });
    expect(call.bottleneck?.title).toBe("Review is backed up");
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
