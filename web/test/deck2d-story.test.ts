import { expect, test } from "bun:test";
import { STAGE_AT } from "../src/deck2d/build/build";
import { STOPS } from "../src/deck2d/contract";
import { STORY_CARD, createStory, type Story } from "../src/deck2d/story";

// Steps the story until cond() or the time limit (sim seconds). Returns the sim seconds it took.
function run(s: Story, cond: () => boolean, limit = 200) {
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
  expect(v0.stops.filter((x) => x.built).map((x) => x.id)).toEqual(["repo", "planner", "builder", "checks", "review", "launch"]); // a small working line
  expect(v0.shippy).toEqual({ pose: "folded", at: "corner" });
  expect(v0.deck).toEqual({ size: "large", island: "built" }); // island up means the large deck, never a gap

  // 1 software is a factory: rockets go up right away. 2 then it jams at Review and the card lands fast (north star)
  let t = run(s, () => s.view().shipped >= 1);
  t += run(s, () => s.view().card != null);
  expect(t).toBeLessThan(15);
  const v2 = s.view();
  const review = v2.stops.find((x) => x.id === "review")!;
  expect(v2.jam).toBe("review");
  expect(review.state).toBe("jammed");
  expect(review.waiting).toBe("REVIEW WAITING");
  expect(review.items.length).toBeGreaterThanOrEqual(3);
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

  // the reward, one thing at a time: new crates stop, then the Gate builds; no caption or card over it
  t += run(s, () => s.view().stops.find((x) => x.id === "gate")!.built, 20);
  for (let k = 0; k < (STAGE_AT.gone - 2.3) * 10; k++) {
    s.step!(0.1); t += 0.1;
    if (k > 22) expect(s.view().caption).toBeNull();
    expect(s.view().card).toBeNull();
  }

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
  expect(s.view().card).toMatchObject({ yes: "See my repo", no: "Replay", setup: true });
  s.approve(STORY_CARD.connect);
  expect(connected).toBe(1);
  expect(t).toBeLessThan(120);
});

test("same seed, same story; later on the last card replays", () => {
  const a = createStory({ seed: 7 }), b = createStory({ seed: 7 });
  for (let i = 0; i < 200; i++) { a.step!(0.1); b.step!(0.1); }
  expect(JSON.stringify(a.view())).toBe(JSON.stringify(b.view()));
  a.reset();
  expect(a.view().stops.find((x) => x.id === "gate")!.built).toBe(false);
});

test("item ids stay stable as crates move stop to stop", () => {
  const s = createStory({ seed: 1 });
  const seen = new Map<string, number>();
  for (let i = 0; i < 400; i++) {
    s.step!(0.05);
    const v = s.view();
    const ids = v.stops.flatMap((x) => x.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length); // never in two places
    if (v.deck?.island !== "none") expect(v.deck?.size).toBe("large"); // the bridge never hangs past the deck's end
    v.stops.forEach((x, k) => x.items.forEach((it) => {
      const prev = seen.get(it.id);
      if (prev != null) expect(k).toBeGreaterThanOrEqual(prev); // only moves forward
      seen.set(it.id, k);
    }));
  }
});
