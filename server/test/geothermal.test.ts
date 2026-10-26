import { afterEach, expect, test } from "bun:test";
import { enforceRoute, geothermalGuard, localPower, looksSmall, ruleRoute, runnerPower } from "../src/geothermal";
import { pickPower } from "../src/spark";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const docs = { kind: "cleanup" as const, title: "Fix typo in README setup steps", paths: ["README.md"], scars: 0, rework: false };

test("geothermal guard: small, safe, first-try jobs only", () => {
  expect(geothermalGuard(docs).ok).toBe(true);
  expect(geothermalGuard({ ...docs, kind: "bug", paths: ["src/format.ts", "test/format.test.ts"] }).ok).toBe(true);
  expect(geothermalGuard({ ...docs, paths: [] }).ok).toBe(false);
  expect(geothermalGuard({ ...docs, paths: ["a.md", "b.md", "c.md", "d.md"] }).reason).toContain("too big");
  for (const risky of [".github/workflows/ci.yml", "package.json", "bun.lock", "server/migrations/0007.sql", "server/src/auth.ts", "src/payments/stripe.ts", "runner/src/cli.ts", "wrangler.jsonc"])
    expect(geothermalGuard({ ...docs, paths: [risky] }).ok).toBe(false);
  expect(geothermalGuard({ ...docs, scars: 1 }).reason).toContain("stronger model");
  expect(geothermalGuard({ ...docs, rework: true }).ok).toBe(false);
  expect(geothermalGuard({ ...docs, kind: "feature", paths: ["src/cart.ts"] }).ok).toBe(false);
  expect(geothermalGuard({ ...docs, kind: "feature", paths: ["docs/guide.md"] }).ok).toBe(true);
});

test("rule route picks the cheapest allowed plant; the guard vetoes the planner", () => {
  expect(ruleRoute(docs, ["codex", "local"])?.harness).toBe("local");
  expect(ruleRoute({ ...docs, paths: ["server/src/auth.ts"] }, ["codex", "local"])?.harness).toBe("codex");
  expect(ruleRoute({ ...docs, scars: 2 }, ["local"])).toBeNull();
  expect(enforceRoute("local", { ...docs, paths: ["package.json"] }, ["claude_code", "local"])).toMatchObject({ harness: "claude_code", vetoed: true });
  expect(enforceRoute("local", docs, ["claude_code", "local"])).toMatchObject({ harness: "local", vetoed: false });
  expect(enforceRoute("codex", docs, ["claude_code", "local"])?.harness).toBe("claude_code"); // not signed in: first subscription
  expect(enforceRoute("local", { ...docs, scars: 1 }, ["local"])).toBeNull();
  expect(looksSmall(docs)).toBe(true);
  expect(looksSmall({ kind: "bug", title: "Checkout charges twice", scars: 0 })).toBe(false);
});

test("runner presence becomes plants: solar per subscription, geothermal for a local model", () => {
  expect(runnerPower(["claude_code", "local"])).toEqual([{ id: "solar-claude_code", kind: "solar", name: "Claude", level: 1, online: true }, localPower()]);
  expect(localPower()).toMatchObject({ id: "geo-local", kind: "geothermal", name: "Your computer" });
});

test("planner power pick must name an allowed plant", async () => {
  const reply = (content: unknown) => { globalThis.fetch = (async () => Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] })) as unknown as typeof fetch; };
  const c = { title: docs.title, plan: "Fix the typo", files: docs.paths, plants: [{ harness: "local", name: "Geothermal", cost: "free", strength: "small" }, { harness: "codex", name: "Solar", cost: "usage", strength: "strong" }] };
  reply({ harness: "local", why: "One-line docs fix." });
  expect(await pickPower({ META_API_KEY: "k" } as never, c)).toEqual({ harness: "local", why: "One-line docs fix." });
  reply({ harness: "grok", why: "?" });
  await expect(pickPower({ META_API_KEY: "k" } as never, c)).rejects.toThrow("isn't available");
});
