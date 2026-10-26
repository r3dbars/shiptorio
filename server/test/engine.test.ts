import { describe, expect, it } from "bun:test";
import { FactoryState } from "@shiptorio/shared";
import { pickAssembler, SAFE_PATH, starterLine } from "../src/engine";
import { heuristicTriage, parseJsonReply } from "../src/spark";

const state = (): FactoryState =>
  FactoryState.parse({
    repo: "r3dbars/shiptorio",
    baseBranch: "main",
    districts: [],
    ...starterLine(),
    items: [],
    science: { red: 0, green: 0, grey: 0, blue: 0 },
    trust: 0.5,
    tick: 0,
  });

describe("starter line", () => {
  it("is a valid factory with one connected line", () => {
    const s = state();
    expect(s.machines.map((m) => m.type)).toEqual(["ore_deposit", "splitter", "assembler", "inspector", "launch_pad", "steam"]);
    expect(s.belts.map((b) => `${b.from}>${b.to}`)).toEqual([
      "ore-issues>splitter-1",
      "splitter-1>assembler-1",
      "assembler-1>inspector-1",
      "inspector-1>launch-pad",
    ]);
  });
});

describe("pickAssembler", () => {
  const item = { id: "gh-1", district: "/", state: "queued", attempts: 0 } as never;

  it("takes an idle Spark assembler", () => {
    expect(pickAssembler(state(), item)?.id).toBe("assembler-1");
  });

  it("skips busy ones", () => {
    const s = state();
    s.machines.find((m) => m.id === "assembler-1")!.state = "working";
    expect(pickAssembler(s, item)).toBeUndefined();
  });

  it("stalls when a player disconnects belts, changes belt type, or removes power", () => {
    const s = state();
    s.power[0].online = false;
    expect(pickAssembler(s, item)).toBeUndefined();
    s.power[0].online = true;
    s.belts = s.belts.filter((b) => b.from !== "assembler-1");
    expect(pickAssembler(s, item)).toBeUndefined();
  });
});

describe("SAFE_PATH", () => {
  it("allows normal repo paths", () => {
    for (const p of ["src/a.ts", "README.md", "web/src/sim/scenario-1.ts", "packages/@scope/x.json"]) expect(SAFE_PATH.test(p)).toBe(true);
  });
  it("refuses escapes and CI config", () => {
    for (const p of ["../etc/passwd", "/abs.ts", "src/../../x", ".github/workflows/ci.yml", "a b.ts"]) expect(SAFE_PATH.test(p)).toBe(false);
  });
});

describe("spark helpers", () => {
  it("parses JSON out of fenced or chatty replies", () => {
    expect(parseJsonReply<{ a: number }>('Sure!\n```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(parseJsonReply<{ a: number }>('here: {"a": 2} done')).toEqual({ a: 2 });
    expect(() => parseJsonReply("no json")).toThrow();
  });

  it("falls back to a heuristic triage without a key", () => {
    expect(heuristicTriage("Checkout button crashes", ["bug"], ["/", "web", "server"])).toEqual({ kind: "bug", district: "/" });
    expect(heuristicTriage("Add dark mode to web", [], ["/", "web"])).toEqual({ kind: "feature", district: "web" });
    expect(heuristicTriage("Refactor routing", [], ["/"]).kind).toBe("cleanup");
  });
});
