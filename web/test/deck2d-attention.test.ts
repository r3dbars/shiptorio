import { expect, test } from "bun:test";
import { createFirstVisitDemo } from "../src/deck2d/stations/first-visit";
import { needsAttention } from "../src/deck2d/stations/attention";
import { createMachineRehearsal } from "../src/deck2d/stations/rehearsal";
import { createMachineInteraction } from "../src/deck2d/stations/inspector";

test("first visit presents two decisions, then work and review, without inventing a red fault", () => {
  const src = createFirstVisitDemo();
  for (let i = 0; i < 2; i++) {
    const choose = src.view();
    expect(choose.card?.yes).toBe("Start agent"); expect(needsAttention(choose, "planner")).toBe(true);
    expect(choose.jam).toBeNull();
    src.approve(choose.card!.id);
    expect(src.view().shippy).toEqual({ at: "planner", pose: "lever" });
    src.step?.(1.3);
    expect(src.view().stops.find(s => s.id === "builder")?.state).toBe("working");
    src.step?.(6);
    const review = src.view();
    expect(needsAttention(review, "review")).toBe(true); expect(review.jam).toBeNull();
    src.approve(review.card!.id);
  }
  expect(src.view().card).toBeNull();
});

test("startup waits for Shippy, then powers the machine at contact before sending the build", () => {
  let ready = false;
  const src = createFirstVisitDemo({ ready: () => ready });
  src.approve(src.view().card!.id); src.step?.(10);
  expect(src.view().stops.some(s => s.state === "working")).toBe(false);
  ready = true; src.step?.(0.7);
  expect(src.view().stops.find(s => s.id === "planner")?.state).toBe("working");
  expect(src.view().shippy).toEqual({ at: "planner", pose: "lever" });
  src.step?.(0.6);
  expect(src.view().shippy).toEqual({ at: "builder", pose: "weld" });
});

test("yellow preview opens an approval card and clears on approval, not on Later", () => {
  const src = createMachineRehearsal(); src.setMode("attention");
  const ui = createMachineInteraction(() => src.setMode("working"));
  ui.select("repo"); const v = ui.view(src.view());
  expect(v.card?.yes).toBe("Approve job"); expect(v.jam).toBeNull();
  ui.answer(v.card!.id, false); expect(src.mode).toBe("attention");
  ui.select("repo"); ui.answer(ui.view(src.view()).card!.id, true);
  expect(src.mode).toBe("working");
});
