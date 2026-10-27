import { expect, test } from "bun:test";
import type { FactoryState, Item } from "@shiptorio/shared";

import { BUILD_MS, LOOK, STEPS, STEP_IDS, cameraFor, lineFor, phaseAt, resolve, stepFrom } from "../src/buildout/journey";
import { defaultPlan, makeLayout } from "../src/map/shaft/layout";

// the buildout scenario's first frame: nothing connected, nothing built
const empty = (): FactoryState =>
  ({
    repo: "demo/shop",
    baseBranch: "main",
    districts: [],
    machines: [],
    belts: [],
    items: [],
    power: [],
    science: { red: 0, green: 0, grey: 0, blue: 0 },
    trust: 0.5,
    tick: 0,
    sources: [],
    metrics: { rockets: 0, bitersKilled: 0, escapedDefects: 0, customersAnswered: 0, usersUnblocked: 0, shipScore: 0 },
  }) as unknown as FactoryState;
const item = (state: Item["state"], extra: Partial<Item> = {}) =>
  ({ id: "i-1", kind: "feature", source: "github_issue", title: "x", district: "/", state, attempts: 0, updatedAt: 0, ...extra }) as Item;
const github = { kind: "github", state: "connected", detail: "", eventsToday: 0, setup: { steps: [] } } as const;
const power = { id: "p", kind: "steam", name: "Claude", level: 1, online: true } as const;
const asm = { id: "asm-1", type: "assembler", x: 0, y: 0, tier: 1, state: "idle" } as const;

test("eight builds in order, then look", () => {
  expect(STEPS.map((s) => s.id)).toEqual([...STEP_IDS]);
  expect(STEP_IDS).toEqual(["tunnel", "boiler", "builder", "issue", "planner", "build", "checks", "launch"]);
  for (const s of STEPS) {
    expect(s.line.length).toBeGreaterThan(0);
    if (s.trigger !== "auto") expect(s.action).toBeTruthy();
  }
});

test("an empty factory starts on the tunnel", () => {
  const w = stepFrom(empty());
  expect(w.id).toBe("tunnel");
  expect(w.index).toBe(0);
  expect(w.built).toEqual([]);
});

test("each build moves the step on, read off real state", () => {
  let s = empty();
  s = { ...s, sources: [github] } as FactoryState;
  expect(stepFrom(s).id).toBe("boiler");
  s = { ...s, power: [power] };
  expect(stepFrom(s).id).toBe("builder");
  s = { ...s, machines: [asm] } as FactoryState;
  expect(stepFrom(s).id).toBe("issue");
  expect(stepFrom({ ...s, items: [item("ore")] }).id).toBe("planner");
  expect(stepFrom({ ...s, items: [item("queued")] }).id).toBe("planner");
  expect(stepFrom({ ...s, items: [item("working")] }).id).toBe("build");
  expect(stepFrom({ ...s, items: [item("working", { prNumber: 4 })] }).id).toBe("checks");
  expect(stepFrom({ ...s, items: [item("inspecting")] }).id).toBe("checks");
  const ciPassed = item("inspecting", { inspection: { headSha: "a", state: "pending", humanApproved: false, stages: [{ gate: "ci", state: "passed", reason: "" }] } } as Partial<Item>);
  expect(stepFrom({ ...s, items: [ciPassed] }).id).toBe("launch");
  expect(stepFrom({ ...s, items: [item("on_pad")] }).id).toBe("launch");
  const done = stepFrom({ ...s, items: [item("launched")] });
  expect(done.id).toBe(LOOK);
  expect(done.index).toBe(8);
  expect(done.step).toBeNull();
  expect(done.built).toEqual([...STEP_IDS]);
});

test("a later step done counts the earlier ones too", () => {
  // a returning factory whose state has no power or sources data still never lands back on step 1
  expect(stepFrom({ ...empty(), items: [item("working")] }).id).toBe("build");
  expect(stepFrom({ ...empty(), metrics: { ...empty().metrics!, rockets: 3 } }).id).toBe(LOOK);
});

test("the build moment runs chalk, construct, burst, payoff in about 7 s", () => {
  expect(phaseAt(0)).toBe("chalk");
  expect(phaseAt(499)).toBe("chalk");
  expect(phaseAt(500)).toBe("construct");
  expect(phaseAt(4500)).toBe("burst");
  expect(phaseAt(5500)).toBe("payoff");
  expect(phaseAt(BUILD_MS.payoff)).toBe("done");
});

test("reveals resolve to real layout ids on the default plan", () => {
  const L = makeLayout(defaultPlan());
  const ids = (id: string) => resolve(STEPS.find((s) => s.id === id)!.reveals, L);
  expect(ids("tunnel")).toEqual({ mines: ["github"], stations: [], paths: ["cart-github", "chute-github", "collector", "lift"] });
  expect(ids("boiler").stations).toHaveLength(1);
  expect(ids("builder").stations).toEqual(["asm-1"]);
  expect(ids("builder").paths).toContain("spur-asm-1");
  expect(ids("planner").stations).toEqual(["planner"]);
  expect(ids("checks").stations).toEqual(["ci"]);
  expect(ids("launch").stations).toEqual(["gate", "pad"]);
  // every station and path any step names exists in the layout
  const names = new Set([...L.stations.map((s) => s.id), ...L.paths.map((p) => p.name)]);
  for (const s of STEPS) for (const id of [...resolve(s.reveals, L).stations, ...resolve(s.reveals, L).paths]) expect(names.has(id)).toBe(true);
});

test("every step has somewhere for the camera to park", () => {
  const L = makeLayout(defaultPlan());
  for (const s of STEPS) expect(cameraFor(s, L).length).toBeGreaterThan(0);
  expect(cameraFor(STEPS[0], L)).toEqual(["mine:github"]);
});

test("the repo line replaces the demo line only where one is written", () => {
  const tunnel = STEPS[0];
  expect(lineFor(tunnel, false)).toBe(tunnel.line);
  expect(lineFor(tunnel, true)).toBe(tunnel.repoLine!);
  const planner = STEPS.find((s) => s.id === "planner")!;
  expect(lineFor(planner, true)).toBe(planner.line);
});
