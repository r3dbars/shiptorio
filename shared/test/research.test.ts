import { describe, expect, test } from "bun:test";
import type { Belt, FactoryState, Item, Machine } from "../src/model";
import { insertCheck, researchBlocked, runCheck, sciencePacks, suggestResearch, techById, techStatus } from "../src/research";

const science = (n: number) => ({ red: n, green: 0, grey: 0, blue: 0 });
const patch = (...lines: string[]) => `@@ -1,1 +1,${lines.length} @@\n${lines.map((l) => `+${l}`).join("\n")}`;

describe("research tree", () => {
  test("tier 1 opens after the first ship and costs science packs", () => {
    const tech = techById("leftovers")!;
    expect(techStatus(tech, { science: science(0) }).state).toBe("locked");
    expect(techStatus(tech, { science: science(1) }).state).toBe("short");
    expect(techStatus(tech, { science: science(2) }).state).toBe("ready");
    expect(techStatus(tech, { science: science(3), research: { done: ["leftovers"], spent: 2 } }).state).toBe("done");
    expect(sciencePacks({ science: science(3), research: { done: ["leftovers"], spent: 2 } })).toBe(1);
  });

  test("tier 2 needs its parent researched, and runner-only techs say so", () => {
    expect(researchBlocked({ science: science(9) }, "types")).toContain("Leftover sweeper first");
    expect(researchBlocked({ science: science(9), research: { done: ["leftovers"], spent: 2 } }, "types")).toBeNull();
    expect(techStatus(techById("perf")!, { science: science(20), research: { done: ["leftovers", "scope"], spent: 6 } }).state).toBe("soon");
  });
});

describe("checks run on the diff", () => {
  test("leftover sweeper", () => {
    expect(runCheck("leftovers", [{ filename: "web/src/cart.ts", patch: patch("const a = 1;", "console.log(cart)") }]).passed).toBe(false);
    expect(runCheck("leftovers", [{ filename: "web/src/cart.test.ts", patch: patch("console.log(cart)") }]).passed).toBe(true);
    expect(runCheck("leftovers", [{ filename: "web/src/cart.test.ts", patch: patch("it.only('x', () => {})") }]).passed).toBe(false);
    expect(runCheck("leftovers", [{ filename: "README.md", patch: patch("console.log is fine in docs") }]).passed).toBe(true);
  });

  test("secret scanner", () => {
    const r = runCheck("secrets", [{ filename: "server/config.ts", patch: patch('const key = "sk_live_abcdefghijklmnop1234"') }]);
    expect(r.passed).toBe(false);
    expect(r.reason).toContain("Stripe");
    expect(r.reason).not.toContain("sk_live"); // never echo the secret
    expect(runCheck("secrets", [{ filename: "server/config.ts", patch: patch("const key = env.STRIPE_KEY") }]).passed).toBe(true);
  });

  test("type guard", () => {
    expect(runCheck("types", [{ filename: "a.ts", patch: patch("// @ts-ignore", "x()") }]).reason).toContain("@ts-ignore");
    expect(runCheck("types", [{ filename: "a.ts", patch: patch("const x = y as any") }]).passed).toBe(false);
    expect(runCheck("types", [{ filename: "a.test.ts", patch: patch("const x = y as any") }]).passed).toBe(true);
    expect(runCheck("types", [{ filename: "a.ts", patch: patch("const many = 1") }]).passed).toBe(true);
  });

  test("scope gauge", () => {
    expect(runCheck("scope", [{ filename: "a.ts", additions: 380, deletions: 40 }]).passed).toBe(false);
    expect(runCheck("scope", [{ filename: "a.ts", additions: 20, deletions: 4 }]).passed).toBe(true);
  });

  test("dependency guard", () => {
    expect(runCheck("deps", [{ filename: "package.json", patch: patch('    "left-pad": "^1.3.0",') }]).passed).toBe(false);
    expect(runCheck("deps", [{ filename: "package.json", patch: patch('    "left-pad": "^1.3.0",') }, { filename: "bun.lock" }]).passed).toBe(true);
    expect(runCheck("deps", [{ filename: "package.json", patch: patch('    "dev": "vite --host",') }]).passed).toBe(true);
    expect(runCheck("deps", [{ filename: "bun.lock" }]).passed).toBe(false);
  });
});

describe("the planner suggests research from repeated scars", () => {
  const item = (id: string, reason: string): Item => ({ id, kind: "bug", source: "github_issue", title: id, district: "web", state: "queued", attempts: 1, updatedAt: 0, scars: [{ station: "review", reason, strike: 1 }] });
  test("two scars the sweeper would catch", () => {
    const items = [item("a", "Left a console.log in the handler"), item("b", "Stray console.log in cart")];
    expect(suggestResearch({ items, science: science(2) })?.tech).toBe("leftovers");
    expect(suggestResearch({ items: items.slice(0, 1), science: science(2) })).toBeUndefined();
    expect(suggestResearch({ items, science: science(2), research: { done: ["leftovers"], spent: 2 } })).toBeUndefined();
  });
});

describe("the line grows", () => {
  const line = (): Pick<FactoryState, "machines" | "belts"> => {
    const ids = ["assembler-1", "ci-1", "verify-1", "review-1", "gate-1", "launch-pad"];
    const machines: Machine[] = ids.map((id, i) => ({ id, type: i === 0 ? "assembler" : i === 5 ? "launch_pad" : "inspector", x: i * 3, y: 0, tier: 1, state: "idle" }));
    const belts: Belt[] = ids.slice(1).map((to, i) => ({ id: `b${i}`, from: ids[i], to }));
    return { machines, belts };
  };
  test("a check lands after CI and pushes the rest along", () => {
    const s = line();
    const a = insertCheck(s, "leftovers");
    expect(a.machines.find((m) => m.id === "check-leftovers")).toMatchObject({ x: 6, y: 0 });
    expect(a.machines.find((m) => m.id === "launch-pad")?.x).toBe(18);
    expect(a.removed).toEqual(["b1"]);
    expect(a.belts.map((b) => `${b.from}>${b.to}`)).toEqual(["ci-1>check-leftovers", "check-leftovers>verify-1"]);
    // apply, then a second check goes after the first
    const apply = (st: typeof s, p: typeof a) => ({
      machines: [...st.machines.filter((m) => !p.machines.some((x) => x.id === m.id)), ...p.machines],
      belts: [...st.belts.filter((b) => !p.removed.includes(b.id)), ...p.belts],
    });
    const s2 = apply(s, a);
    const b = insertCheck(s2, "secrets");
    expect(b.machines.find((m) => m.id === "check-secrets")?.x).toBe(9);
    expect(b.belts.map((x) => `${x.from}>${x.to}`)).toEqual(["check-leftovers>check-secrets", "check-secrets>verify-1"]);
    expect(insertCheck(apply(s2, b), "secrets").machines).toEqual([]);
  });
});
