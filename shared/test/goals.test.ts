import { describe, expect, it } from "bun:test";
import { BrainSignal, FactoryState, GOAL_MOVE_ID, goalContext, goalMove, goalsFromPick, goalText, goalWeight, inferGoals, WebToServer, type Goals } from "../src/index";

const player = (picks: Goals["picks"]): Goals => ({ picks, by: "player", at: 0 });

describe("goal guesses", () => {
  it("reads the README", () => {
    expect(inferGoals({ readme: "Fixes crashes and errors so checkout is stable. Sentry catches regressions." })[0].id).toBe("fewer_bugs");
    expect(inferGoals({ readme: "Coming soon! Join the waitlist for early access. Pricing on the landing page." })[0]).toMatchObject({ id: "first_users", why: "Guessed from your README." });
  });

  it("lets the player's taps outweigh the README", () => {
    const g = inferGoals({ readme: "A bug tracker.", yes: { reply: 8 } });
    expect(g[0]).toMatchObject({ id: "answer_users", why: "Guessed from the cards you keep saying yes to." });
  });

  it("guesses fewer bugs with no evidence at all, and ranks every goal", () => {
    const g = inferGoals({});
    expect(g[0]).toMatchObject({ id: "fewer_bugs", why: "A good start for any repo." });
    expect(g).toHaveLength(5);
  });
});

describe("the goal card", () => {
  const guesses = inferGoals({ readme: "crashes and errors" });
  it("is earned after the first rocket, never upfront", () => {
    expect(goalMove({ metrics: undefined }, undefined, guesses, 1)).toBeNull();
    const m = goalMove({ metrics: { rockets: 1 } as FactoryState["metrics"] }, undefined, guesses, 1)!;
    expect(m.id).toBe(GOAL_MOVE_ID);
    expect(m.title).toBe("Looks like you want fewer bugs. Right?");
    expect(m.options).toHaveLength(3);
    expect(m.options.filter((o) => o.recommended).map((o) => o.label)).toEqual(["Yes, fewer bugs"]);
  });

  it("stops once the player picked", () => {
    expect(goalMove({ metrics: { rockets: 4 } as FactoryState["metrics"] }, player(["ship_faster"]), guesses, 1)).toBeNull();
  });

  it("only takes real goal ids from a pick", () => {
    expect(goalsFromPick(["ship_faster", "nope", "ship_faster"], 5, 2)).toEqual({ picks: ["ship_faster"], by: "player", at: 5, rockets: 2 });
    expect(goalsFromPick("fewer_bugs", 5)).toBeNull();
    expect(WebToServer.safeParse({ type: "set_goals", picks: ["take_over"] }).success).toBe(false);
    expect(WebToServer.safeParse({ type: "set_goals", picks: ["first_users"] }).success).toBe(true);
  });
});

describe("goals for the brain", () => {
  it("tilts the areas the goal cares about, less for a guess", () => {
    expect(goalWeight(undefined, "quality")).toBe(1);
    expect(goalWeight(player(["fewer_bugs"]), "quality")).toBe(2);
    expect(goalWeight({ ...player(["fewer_bugs"]), by: "inferred" }, "quality")).toBe(1.5);
    expect(goalWeight(player(["fewer_bugs"]), "users")).toBe(1);
  });

  it("gives the planner a sentence and the brain a context", () => {
    expect(goalText(player(["first_users", "fewer_bugs"]))).toBe("The player's goal: first users, then fewer bugs.");
    expect(goalContext(player(["answer_users"]))).toMatchObject({ kind: "goals", confirmed: true, goals: [{ id: "answer_users", areas: ["feedback", "quality"] }] });
    expect(goalContext(undefined)).toBeNull();
  });

  it("validates as part of the factory state", () => {
    expect(FactoryState.shape.goals.safeParse(player(["grow_usage"])).success).toBe(true);
    expect(BrainSignal).toBeDefined();
  });
});
