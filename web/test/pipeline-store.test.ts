import { expect, test } from "bun:test";
import { FactoryState, projectPipeline } from "@shiptorio/shared";
import { applyPatch } from "../src/store";

test("live pipeline replaces all six steps and unrelated patches retain the last authoritative projection", () => {
  const state = FactoryState.parse({ repo: "owner/repo", baseBranch: "main", districts: [], machines: [], belts: [], power: [], items: [], science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0 });
  const pipeline = projectPipeline(state);
  pipeline[0] = { ...pipeline[0], state: "working", cause: "planning", itemIds: ["gh-1"] };
  const updated = applyPatch(state, { pipeline });
  expect(updated.pipeline).toEqual(pipeline);
  expect(applyPatch(updated, { tick: 1 }).pipeline).toEqual(pipeline);
  const replacement = projectPipeline(state);
  expect(applyPatch(updated, { pipeline: replacement }).pipeline).toEqual(replacement);
});
