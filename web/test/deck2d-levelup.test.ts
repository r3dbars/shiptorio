import { expect, test } from "bun:test";
import { FactoryState } from "@shiptorio/shared";
import { starterLine } from "../../server/src/engine";
import { deckView } from "../src/deck2d/data/view";

const now = 100000;
const state = FactoryState.parse({
  repo: "r3dbars/Testing", baseBranch: "main", districts: [], ...starterLine(),
  science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0, tick: 4,
  items: [{ id: "gh-4", title: "Document the README checks", kind: "bug", source: "github_issue", district: "/", state: "working", attempts: 1, updatedAt: now }],
  learned: [{ key: "build|district:docs|approve_runner_job", label: "Approving plans in /docs", since: now }],
});

test("live learned snapshot marks the fourth crate's Builder automatic without an approval card", () => {
  const view = deckView(state, { now });
  expect(view.card).toBeNull();
  const live = deckView(state, { now, visualFlow: true });
  expect(live.card).toBeNull();
  expect(live.shippy).toEqual({ at: "builder", pose: "happy" });
  expect(deckView(state, { now: now + 5000, visualFlow: true }).shippy).toEqual({ at: "builder", pose: "weld" });
  expect(live.work).toMatchObject({ id: "gh-4", stop: "builder", badge: "#4" });
  expect(live.stops.find(s => s.id === "builder")).toMatchObject({ automated: true, state: "auto" });
  expect(view.stops.find(s => s.id === "builder")).toMatchObject({ automated: true, state: "auto", items: [{ id: "gh-4", title: "Document the README checks" }] });
  expect(view.shippy).toEqual({ at: "builder", pose: "happy" });
  expect(deckView(state, { now: now + 5000 }).shippy).toEqual({ at: "builder", pose: "weld" });
});

test("forgetting the class clears the automatic treatment on the same live crate", () => {
  expect(deckView({ ...state, learned: [] }, { now }).stops.find(s => s.id === "builder")).toMatchObject({ automated: false, state: "working" });
});
