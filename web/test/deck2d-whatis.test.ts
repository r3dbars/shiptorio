import { expect, test } from "bun:test";
import { STOPS } from "../src/deck2d/contract";
import { TUTORIAL } from "../src/deck2d/story/script";
import { createWhatIsState, whatIs } from "../src/deck2d/stations/whatis";

test("every station and the engine has a short note in Shippy's tutorial words", () => {
  for (const id of [...STOPS, "engine" as const]) {
    const w = whatIs(id);
    expect(w.line.length).toBeGreaterThan(10);
    expect(w.line).not.toMatch(/^This is /);
    const card = TUTORIAL.find((c) => c.id === id)!;
    expect(card.lines.join(" ")).toContain(w.line.split(". ")[0]); // copy lives in story/script.ts only
  }
  expect(whatIs("repo")).toEqual({ title: "Repo", line: "Your GitHub issues land here." });
  expect(whatIs("engine").title).toBe("Steam engine");
});

test("tap opens, same tap or empty deck closes, the tour blocks it", () => {
  const s = createWhatIsState();
  expect(s.tap("checks")).toBe("checks");
  expect(s.tap("gate")).toBe("gate");
  expect(s.tap("gate")).toBeNull();
  s.tap("review"); expect(s.tap(null)).toBeNull();
  expect(s.tap("planner", true)).toBeNull();
});
