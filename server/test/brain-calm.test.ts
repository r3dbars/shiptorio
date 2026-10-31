// Prove-it item 5: Shippy stays quiet when the factory is healthy, doesn't re-nag after Later, and notices a
// check that breaks mid-run. Each scenario walks the real loop (runDiagnose + tapBrain) over hours of passes,
// with signals shaped and re-read the way the collectors do it (CI every 10 min, fresh 30 min).

import { describe, expect, it } from "bun:test";
import { signalId, type BrainSignal } from "@shiptorio/shared";
import { BRAIN, emptyMemory, ruleDiagnosis, runDiagnose, tapBrain, type BrainMemory, type ModelDiagnosis, type RunResult } from "../src/diagnose";

const T = Date.parse("2026-10-30T12:00:00Z");
const MIN = 60_000;
const CI_FRESH = 30 * MIN, CI_EVERY = 10 * MIN, PASS = 30_000;

/** ci_blocking as ci.ts builds it: one signal per workflow, one evidence row per failing PR. */
const red = (prs: number[], at: number): BrainSignal => ({
  id: signalId("ci", "ci_blocking", "CI"), source: "ci", kind: "ci_blocking", scope: "CI", confidence: 1,
  title: prs.length === 1 ? `"CI" is failing on #${prs[0]}, so it can't ship.` : `"CI" is failing on ${prs.length} open PRs.`,
  severity: Math.min(1, 0.7 + Math.min(0.2, (prs.length - 1) * 0.1)), metric: { value: prs.length, unit: "PRs" },
  evidence: prs.map(pr => ({ label: `Failing on #${pr}`, url: `https://github.com/r3dbars/testing/actions/runs/${pr}00` })),
  observedAt: at, freshUntil: at + CI_FRESH,
});
/** A faint one the healthy Testing factory really shows: a small fresh pile, under the rule's floor. */
const faint = (at: number): BrainSignal => ({
  id: "factory:queue_jam:planner", source: "factory", kind: "queue_jam", scope: "planner", confidence: 1, severity: 0.27,
  title: "1 item has waited 2 min at planner.", evidence: [{ label: "1 item waiting" }], observedAt: at, freshUntil: at + 15 * MIN,
});

const pick = (s: BrainSignal): ModelDiagnosis => {
  const r = ruleDiagnosis([s], emptyMemory(), s.observedAt)!;
  return { bottleneck: { ...r.bottleneck, by: "spark" }, unlock: r.unlock, reason: "model" };
};

/** Runs passes every 30s like kickBrain, re-reading CI on its cadence. Returns every card shown and model calls. */
async function walk(opts: { from: number; to: number; memory: BrainMemory; signalsAt: (readAt: number, now: number) => BrainSignal[]; think: (b: { signals: BrainSignal[] }) => Promise<ModelDiagnosis> }) {
  let memory = opts.memory, readAt = opts.from, calls = 0;
  const cards: { at: number; id: string; title: string }[] = [];
  let last: RunResult | undefined;
  for (let now = opts.from; now <= opts.to; now += PASS) {
    if (now - readAt >= CI_EVERY) readAt = now;
    last = await runDiagnose({ signals: opts.signalsAt(readAt, now), memory, now, playerFeedback: "", budget: null, think: async b => { calls++; return opts.think(b); } });
    memory = last.memory;
    const b = last.diagnosis.bottleneck;
    if (b && cards.at(-1)?.title !== b.title) cards.push({ at: now, id: b.id, title: b.title });
  }
  return { memory, cards, calls, last: last! };
}

describe("Shippy stays calm and catches breaks", () => {
  it("(a) a healthy factory gets no card and few model calls all afternoon", async () => {
    const out = await walk({ from: T, to: T + 4 * 3_600_000, memory: emptyMemory(), signalsAt: (_, now) => [faint(now)], think: async () => ({ quiet: true, reason: "Fine." }) });
    expect(out.cards).toEqual([]);
    expect(out.calls).toBeLessThanOrEqual(4 * 2 + 1); // at most the half-hourly look
  });

  it("(b) Later holds for the day even though the red check keeps being re-read", async () => {
    const think = async (b: { signals: BrainSignal[] }) => pick(b.signals[0]);
    // The card is up, the player sits on it, then taps Later just before CI's next read (the signal is decayed).
    const up = await walk({ from: T, to: T + 9 * MIN, memory: emptyMemory(), signalsAt: at => [red([39], at)], think });
    expect(up.cards.map(c => c.id)).toEqual(["ci:ci_blocking:CI"]);
    const sig = red([39], T);
    const { signalWeight } = await import("@shiptorio/shared");
    const parked = tapBrain(up.memory, sig.id, "later", signalWeight(sig, T + 9.5 * MIN), T + 9.5 * MIN);
    const after = await walk({ from: T + 10 * MIN, to: T + 20 * 3_600_000, memory: parked, signalsAt: at => [red([39], at)], think });
    expect(after.cards).toEqual([]);
  });

  it("(c) a new PR breaking on the same check comes back, even after Later", async () => {
    const think = async (b: { signals: BrainSignal[] }) => pick(b.signals[0]);
    const sig = red([39], T);
    const parked = tapBrain({ ...emptyMemory() }, sig.id, "later", 0.7, T, ["Failing on #39"]);
    const breakAt = T + 40 * MIN;
    const out = await walk({ from: T + MIN, to: T + 90 * MIN, memory: parked, signalsAt: at => [red(at >= breakAt ? [39, 47] : [39], at)], think });
    expect(out.cards.length).toBe(1);
    expect(out.cards[0].at - breakAt).toBeLessThanOrEqual(CI_EVERY + BRAIN.minGapMs * 2);
  });

  it("(c) a check breaking mid-run while Shippy is quiet gets a card at the next CI read", async () => {
    const think = async (b: { signals: BrainSignal[] }) => b.signals.some(s => s.kind === "ci_blocking") ? pick(b.signals.find(s => s.kind === "ci_blocking")!) : { quiet: true as const, reason: "Fine." };
    const loud = (at: number): BrainSignal => ({ ...faint(at), severity: 0.85, title: "3 items have waited 3 h at builder." });
    const breakAt = T + 40 * MIN;
    // The heavier jam stays the top signal (the factory collector re-reads it every pass), so the break shows up second.
    const out = await walk({ from: T, to: T + 90 * MIN, memory: emptyMemory(), signalsAt: (at, now) => [loud(now), ...(at >= breakAt ? [red([47], at)] : [])], think });
    const card = out.cards.find(c => c.id === "ci:ci_blocking:CI");
    expect(card).toBeDefined();
    expect(card!.at - breakAt).toBeLessThanOrEqual(CI_EVERY + BRAIN.minGapMs * 2);
  });
});
