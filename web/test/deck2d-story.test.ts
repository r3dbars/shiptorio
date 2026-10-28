import { expect, test } from "bun:test";
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
  expect(v0.stops.every((x) => !x.built)).toBe(true); // the deck starts empty
  expect(v0.shippy).toEqual({ pose: "folded", at: "corner" });
  expect(v0.deck).toEqual({ size: "small", island: "none" });

  // ONE thing moves at a time: builds, grows and the island never overlap, and no caption shows while one plays
  const busy: { what: string; from: number; to: number }[] = [];
  let t0 = 0, prev = s.view();
  run(s, () => {
    const v = s.view();
    t0 += 0.1;
    for (const st of v.stops) if (st.built && !prev.stops.find((x) => x.id === st.id)!.built && st.id !== "launch") busy.push({ what: st.id, from: t0, to: t0 + 7.6 });
    if (v.deck!.size !== prev.deck!.size) busy.push({ what: v.deck!.size, from: t0, to: t0 + 7.4 });
    if (v.deck!.island === "building" && prev.deck!.island === "none") busy.push({ what: "island", from: t0, to: t0 + 12 });
    const now = busy.filter((b) => t0 > b.from + 0.05 && t0 < b.to - 0.05);
    expect(now.length).toBeLessThanOrEqual(1);
    if (now.length) expect(v.caption).toBeNull();
    if (v.shipped > 0) expect(v.deck!.island).toBe("built");
    prev = v;
    return v.stops.find((x) => x.id === "launch")!.built;
  });
  expect(busy.map((b) => b.what)).toEqual(["repo", "planner", "builder", "medium", "checks", "island"]);
  expect(s.view().deck!.size).toBe("medium");

  // 1 software is a factory: stops build in one by one, rockets go up
  let t = run(s, () => s.view().shipped >= 2);
  const built = s.view().stops.filter((x) => x.built).map((x) => x.id);
  expect(built).toEqual(["repo", "planner", "builder", "checks", "launch"]);
  // beat 2 builds Review and Gate one at a time too, on a still line
  run(s, () => s.view().stops.find((x) => x.id === "review")!.built);
  expect(s.view().stops.every((x) => x.items.length === 0)).toBe(true);
  expect(s.view().stops.find((x) => x.id === "gate")!.built).toBe(false);

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
  expect(s.view().deck!.size).toBe("large");
  expect(s.view().card).toMatchObject({ yes: "See my repo", no: "Replay", setup: true });
  s.approve(STORY_CARD.connect);
  expect(connected).toBe(1);
  expect(t).toBeLessThan(200); // slow and calm on purpose; one thing at a time
});

test("same seed, same story; later on the last card replays", () => {
  const a = createStory({ seed: 7 }), b = createStory({ seed: 7 });
  for (let i = 0; i < 200; i++) { a.step!(0.1); b.step!(0.1); }
  expect(JSON.stringify(a.view())).toBe(JSON.stringify(b.view()));
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
