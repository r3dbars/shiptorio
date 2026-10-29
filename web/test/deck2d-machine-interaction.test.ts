import { expect, test } from "bun:test";
import { createMachineInteraction } from "../src/deck2d/stations/inspector";
import { createMachineRehearsal } from "../src/deck2d/stations/rehearsal";

test("a blocked preview uses the swipe card and clears only after approval", () => {
  const src = createMachineRehearsal(); src.setMode("jammed");
  const interaction = createMachineInteraction(() => src.setMode("working"));
  interaction.select("repo");
  let v = interaction.view(src.view());
  expect(v.card?.yes).toBe("Clear jam"); expect(v.shippy).toEqual({ at: "repo", pose: "alarmed" });
  expect(interaction.answer(v.card!.id, false)).toBe(true); expect(src.mode).toBe("jammed");
  interaction.select("repo"); v = interaction.view(src.view());
  expect(interaction.answer(v.card!.id, true)).toBe(true); expect(src.mode).toBe("working");
  expect(interaction.view(src.view()).card).toBeNull();
});

test("live machine selection preserves the real approval and never invents a repair", () => {
  const src = createMachineRehearsal(); src.setMode("jammed");
  const interaction = createMachineInteraction(); interaction.select("repo");
  const info = interaction.view(src.view());
  expect(info.card?.yes).toBe("Got it");
  const real = { id: "actual-approval", title: "Repair failing tests", line: "Failure details", stop: "repo" as const, dots: null, hold: true };
  expect(interaction.view({ ...src.view(), card: real }).card).toBe(real);
  expect(interaction.answer(real.id, true)).toBe(false); // caller routes to the real source
});
