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
  it("is a valid factory with one connected line through the gauntlet", () => {
    const s = state();
    expect(s.machines.map((m) => m.type)).toEqual(["ore_deposit", "splitter", "assembler", "inspector", "inspector", "inspector", "inspector", "launch_pad", "steam"]);
    expect(s.belts.map((b) => `${b.from}>${b.to}`)).toEqual([
      "ore-issues>splitter-1",
      "splitter-1>assembler-1",
      "assembler-1>ci-1",
      "ci-1>verify-1",
      "verify-1>review-1",
      "review-1>gate-1",
      "gate-1>launch-pad",
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
    for (const p of ["src/a.ts", "README.md", "web/src/sim/scenario-1.ts", "packages/@scope/x.json", "server/test/engine.test.ts", "docs/SETUP.md", "src/env.ts", "src/dev.vars.ts", "docs/.github-notes.md", "src/key.ts"]) expect(SAFE_PATH.test(p)).toBe(true);
  });
  it("refuses escapes and CI config", () => {
    for (const p of ["../etc/passwd", "/abs.ts", "src/../../x", ".github/workflows/ci.yml", "a b.ts", "a\tb.ts", "a.ts\n", "src/a\\b.ts", "src/a?.ts", ""]) expect(SAFE_PATH.test(p)).toBe(false);
  });
  it("refuses env and dev vars basenames at any depth regardless of case", () => {
    for (const name of [".env", ".env.local", ".ENV.Production", ".dev.vars", ".DeV.VaRs.local"]) {
      for (const prefix of ["", "server/", "packages/app/"]) expect(SAFE_PATH.test(prefix + name)).toBe(false);
    }
  });
  it("refuses git and github segments at any depth regardless of case", () => {
    for (const name of [".git", ".GiT", ".github", ".GiTHuB"]) {
      for (const prefix of ["", "server/", "packages/app/"]) {
        expect(SAFE_PATH.test(prefix + name)).toBe(false);
        expect(SAFE_PATH.test(prefix + name + "/config")).toBe(false);
      }
    }
  });
  it("refuses private key and certificate extensions regardless of case", () => {
    for (const extension of ["pem", "PeM", "key", "KeY", "p12", "P12", "pfx", "PfX"]) {
      for (const prefix of ["", "server/", "packages/app/"]) expect(SAFE_PATH.test(`${prefix}private.${extension}`)).toBe(false);
    }
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
