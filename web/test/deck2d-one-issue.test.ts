import { expect, test } from "bun:test";
import { createTour } from "../src/deck2d/story/tour";
import { JOURNEY } from "../src/deck2d/story/journey";

test("?journey=1 takes one crate from Repo to Launch on four yeses, then plays again", () => {
  const t = createTour(undefined, JOURNEY);
  const seen: string[] = [];
  const at: string[] = [];
  for (let i = 0; i < 400 && seen.length < 5; i++) {
    const c = t.view().card;
    if (c && seen.at(-1) !== c.title) {
      seen.push(c.title);
      at.push(t.view().stops.find(s => s.items.length)?.id ?? "none");
      if (c.yes !== "Again") t.approve(c.id);
    }
    t.step(0.25);
  }
  expect(seen).toEqual(["A new issue from GitHub", "Here's my plan", "Approve the fix?", "Ship it?", "Shipped!"]);
  expect(at.slice(0, 4)).toEqual(["repo", "planner", "review", "gate"]);
  expect(t.view().stops.every(s => s.built)).toBe(true);
  t.approve(t.view().card!.id); // Again
  expect(t.view().card?.title).toBe("A new issue from GitHub");
});
