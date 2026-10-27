import { FactoryState } from "../../shared/src/model";
import { starterLine } from "../../server/src/engine";
export function personaSnapshot(persona: string, repo: string, now = Date.now()) {
  const item = (n: number, state: string) => ({ id: `gh-${n}`, kind: "bug", source: "github_issue", title: `Fixture cart regression ${n}`, district: "src", state, attempts: 1, updatedAt: now, prNumber: n });
  return FactoryState.parse({ repo, baseBranch: "main", districts: [], ...starterLine(),
    items: persona === "test-midgame" ? [1, 2, 3].map(n => item(n, "launched")) : persona === "test-blocked" ? [{ ...item(7, "rejected"), failure: "Fixture CI failed: cart regression", scars: [{ station: "ci", reason: "Fixture cart regression", strike: 1, at: now }], inspection: { headSha: "b".repeat(40), state: "rework", humanApproved: false, stages: [{ gate: "ci", state: "rework", reason: "Fixture cart regression" }] } }] : [],
    science: { red: persona === "test-midgame" ? 3 : 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0,
    autonomy: { level: persona === "test-midgame" ? "floor" : "advisor", districts: [], next: null, ranAlone: 0 },
  });
}
