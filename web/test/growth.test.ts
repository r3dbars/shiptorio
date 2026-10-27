import { expect, test } from "bun:test";
import type { FactoryState } from "@shiptorio/shared";

import { standingFor, toRaise } from "../src/map/shaft/modules/growth.js";

// Floating-city art pass, slice 10 (ART-PASS.md "Floors"): the rock is there from the start, the build deck rises
// after the tunnel, the checks floor after the build runs, the launch floor after checks.
const base = { items: [], power: [], machines: [], sources: [], metrics: { rockets: 0 } };
const state = (x: object) => ({ ...base, ...x }) as unknown as FactoryState;
const tunnel = { sources: [{ kind: "github", state: "connected" }] };
const builder = { ...tunnel, power: [{ online: true }], machines: [{ type: "assembler" }] };

test("each floor rises once, right after the build before the step that sits on it", () => {
  const standing = new Set<string>(["mine"]);
  const raised: [string, string[]][] = [];
  for (const id of ["tunnel", "boiler", "builder", "issue", "planner", "build", "checks", "launch"]) {
    const up = toRaise(id, standing);
    for (const f of up) standing.add(f);
    if (up.length) raised.push([id, up]);
  }
  expect(raised).toEqual([["tunnel", ["build"]], ["build", ["checks"]], ["checks", ["launch"]]]);
  expect(toRaise("look", standing)).toEqual([]); // not a build
});

test("a returning factory stands on every floor it has built, with no replay", () => {
  expect(standingFor(state({}))).toEqual(["mine"]); // brand new: the rock and its boarded tunnel
  expect(standingFor(state(tunnel))).toEqual(["mine", "build"]); // the boiler's deck is up
  expect(standingFor(state(builder))).toEqual(["mine", "build"]); // on the issue step the deck stays
  expect(standingFor(state({ ...builder, items: [{ state: "passed", attempts: 1, prNumber: 4 }] }))).toEqual(["mine", "build", "checks", "launch"]);
  expect(standingFor(state({ ...builder, metrics: { rockets: 3 } }))).toEqual(["mine", "build", "checks", "launch"]);
});
