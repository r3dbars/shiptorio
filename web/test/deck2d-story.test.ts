import { expect, test } from "bun:test";
import { STOPS } from "../src/deck2d/contract";
import { STORY_CARD, createStory, type Story } from "../src/deck2d/story";

// Steps the story until cond() or the time limit (sim seconds). Returns the sim seconds it took.
function run(s: Story, cond: () => boolean, limit = 120) {
  let t = 0;
  while (!cond() && t < limit) { s.step!(0.1); t += 0.1; }
  expect(cond()).toBe(true);
  return t;
}

test("the story plays all four beats and ends on the connect card", () => {
  let connected = 0;
  const s = createStory({ seed: 3, onConnect: () => connected++ });
  const v0 = s.view();
  expect(v0.stops.map((x) => x.id)).toEqual([...STOPS]);
  expect(v0.stops.every((x) => !x.built)).toBe(true); // the deck starts empty
  expect(v0.shippy).toEqual({ pose: "folded", at: "corner" });

  // 1 software is a factory: stops build in one by one, rockets go up
  let t = run(s, () => s.view().shipped >= 2);
  const built = s.view().stops.filter((x) => x.built).map((x) => x.id);
  expect(built).toEqual(["repo", "planner", "builder", "checks", "launch"]);

  // 2 there's always a bottleneck: review jams, a card slides up
  t += run(s, () => s.view().card != null);
  const v2 = s.view();
  const review = v2.stops.find((x) => x.id === "review")!;
  expect(v2.jam).toBe("review");
  expect(review.state).toBe("jammed");
  expect(review.waiting).toBe("REVIEW WAITING");
  expect(review.items.length).toBeGreaterThanOrEqual(5);
  expect(review.items.slice(1).every((i) => i.look === "wait")).toBe(true);
  expect(v2.card!.dots).toEqual({ have: 0, need: 3 });
  expect(v2.caption).toBeNull(); // the card talks while it's up
  expect(JSON.stringify(v2)).not.toMatch(/bottleneck is you/i);

  // Later hides the card, nothing moves at review, and it comes back
  const shippedBefore = s.view().shipped;
  s.later(v2.card!.id);
  expect(s.view().card).toBeNull();
  t += run(s, () => s.view().card != null, 10);
  expect(s.view().shipped).toBe(shippedBefore);

  // 3 swipe, and it moves
  s.approve(s.view().card!.id);
  t += run(s, () => s.view().shipped > shippedBefore, 15);

  // two more approvals -> 4 automatic
  for (const have of [1, 2]) {
    t += run(s, () => s.view().card != null, 20);
    expect(s.view().card!.dots).toEqual({ have, need: 3 });
    s.approve(s.view().card!.id);
  }
  expect(s.phase()).toBe("automatic");
  t += run(s, () => s.view().shippy.pose === "lever", 10);
  expect(s.view().shippy.at).toBe("review");
  const auto = s.view().stops.find((x) => x.id === "review")!;
  expect(auto.automated).toBe(true);
  expect(auto.state).toBe("auto");

  // the next jam, then the last card
  t += run(s, () => s.view().card?.id === STORY_CARD.connect, 20);
  expect(s.view().jam).toBe("checks");
  s.approve(STORY_CARD.connect);
  expect(connected).toBe(1);
  expect(t).toBeLessThan(90); // ~60-90s of story with instant swipes
});

test("same seed, same story; speed scales time; later on the last card replays", () => {
  const a = createStory({ seed: 7 }), b = createStory({ seed: 7 }), fast = createStory({ seed: 7, speed: 2 });
  for (let i = 0; i < 200; i++) { a.step!(0.1); b.step!(0.1); }
  for (let i = 0; i < 100; i++) fast.step!(0.1);
  expect(JSON.stringify(a.view())).toBe(JSON.stringify(b.view()));
  expect(fast.view().stops.filter((x) => x.built).length).toBe(a.view().stops.filter((x) => x.built).length);
  a.reset();
  expect(a.view().stops.every((x) => !x.built)).toBe(true);
});

test("item ids stay stable as crates move stop to stop", () => {
  const s = createStory({ seed: 1 });
  const seen = new Map<string, number>();
  for (let i = 0; i < 400; i++) {
    s.step!(0.05);
    const v = s.view();
    const ids = v.stops.flatMap((x) => x.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length); // never in two places
    v.stops.forEach((x, k) => x.items.forEach((it) => {
      const prev = seen.get(it.id);
      if (prev != null) expect(k).toBeGreaterThanOrEqual(prev); // only moves forward
      seen.set(it.id, k);
    }));
  }
});
