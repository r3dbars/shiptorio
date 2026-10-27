import { describe, expect, it } from "bun:test";
import { BrainSignal, SIGNAL_KINDS, type FactoryState, type Goals } from "@shiptorio/shared";
import { goalSignals, goalsCollector } from "../src/signals/goals";

const DAY = 86400000, now = 10 * DAY;
const metrics = (rockets: number) => ({ rockets }) as FactoryState["metrics"];
const player = (over: Partial<Goals> = {}): Goals => ({ picks: ["fewer_bugs"], by: "player", at: now - DAY, rockets: 3, ...over });

describe("goals collector", () => {
  it("stays quiet before the first rocket", () => {
    expect(goalSignals({ state: { metrics: metrics(0) } }, now)).toEqual([]);
  });

  it("says goal_missing, low, while there's only a guess", () => {
    const [s] = goalSignals({ state: { metrics: metrics(2), goals: { picks: ["ship_faster"], by: "inferred", at: 0, why: "Guessed from your README." } } }, now);
    expect(s).toMatchObject({ id: "goals:goal_missing:repo", kind: "goal_missing", title: "No goal picked yet; the factory guesses ship faster." });
    expect(s.severity).toBeLessThanOrEqual(0.35);
    expect(BrainSignal.safeParse(s).success).toBe(true);
  });

  it("says goal_stalled when nothing shipped since the goal was set", () => {
    expect(goalSignals({ state: { metrics: metrics(3), goals: player() } }, now)).toEqual([]);
    const [s] = goalSignals({ state: { metrics: metrics(3), goals: player({ at: now - 5 * DAY }) } }, now);
    expect(s).toMatchObject({ kind: "goal_stalled", scope: "fewer_bugs", title: "Nothing has shipped toward fewer bugs in 5 days." });
    expect(goalSignals({ state: { metrics: metrics(4), goals: player({ at: now - 5 * DAY }) } }, now)).toEqual([]);
  });

  it("says goal_off_track when the player's yeses serve another goal", () => {
    const [s] = goalSignals({ state: { metrics: metrics(4), goals: player() }, yes: { reply: 7 } }, now);
    expect(s).toMatchObject({ kind: "goal_off_track", scope: "answer_users" });
    expect(goalSignals({ state: { metrics: metrics(4), goals: player() }, yes: { verify: 7 } }, now)).toEqual([]);
  });

  it("only emits kinds the contract lists", async () => {
    const all = [
      ...goalSignals({ state: { metrics: metrics(2) } }, now),
      ...goalSignals({ state: { metrics: metrics(3), goals: player({ at: 0 }) }, yes: { reply: 9 } }, now),
    ];
    expect(all.length).toBe(3);
    for (const s of all) expect(SIGNAL_KINDS.goals).toContain(s.kind);
    expect(goalsCollector.source).toBe("goals");
    expect(await goalsCollector.read({ state: { metrics: metrics(0) } }, now)).toEqual([]);
  });
});
