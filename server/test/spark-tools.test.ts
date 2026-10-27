import { sparkTestEnv } from "./budget-fixture";
import { describe, expect, it } from "bun:test";
import { compact, planLocalTask, reviewWithTools, runReadTool, type Toolbox } from "../src/spark-tools";
import { factoryBrief, signalsBrief } from "../src/spark-context";
import type { FactoryState, Item } from "@shiptorio/shared";

// The r3dbars/Testing shop, as the two live review misses saw it (Testing #12 and #13).
const repo: Record<string, string> = {
  "README.md": "# Shop\n\nRun `bun run src/index.ts SAVE10` to apply a coupon.\n",
  "src/index.ts": "import { total } from './cart';\nconst code = process.argv[2];\nconsole.log(total(code));\n",
  "src/cart.ts": `${"// line\n".repeat(40)}export const freeShipping = (subtotal: number) => subtotal > 50;\n`,
  "docs/SHIPPING.md": "Orders of $50 or more ship free.\n",
  "server/.dev.vars": "META_API_KEY=sk-live-should-never-be-read",
  "src/config.ts": "export const token = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';\n",
};
const box = (extra: Partial<Toolbox> = {}): Toolbox => ({ paths: Object.keys(repo), read: async p => repo[p] ?? null, ...extra });

/** Fake Spark: replays a script and keeps every user payload it was sent. */
function spark(script: unknown[]) {
  const sent: string[] = [];
  globalThis.fetch = (async (_: unknown, init: RequestInit) => {
    sent.push((JSON.parse(String(init.body)) as { messages: { role: string; content: string }[] }).messages.find(m => m.role === "user")!.content);
    return Response.json({ choices: [{ message: { content: JSON.stringify(script[sent.length - 1]) } }] });
  }) as unknown as typeof fetch;
  return sent;
}

describe("read tools", () => {
  it("never read secret paths, and redact secrets inside readable files", async () => {
    expect(await runReadTool(box(), "read_file", { path: "server/.dev.vars" })).toContain("not readable");
    expect(await runReadTool(box(), "read_file", { path: "../etc/passwd" })).toContain("not readable");
    expect(await runReadTool(box(), "list_files", { prefix: "server" })).not.toContain(".dev.vars");
    const config = await runReadTool(box(), "read_file", { path: "src/config.ts" });
    expect(config).not.toContain("ghp_");
    expect(await runReadTool(box(), "search_code", { query: "META_API_KEY" })).toContain("No matches");
  });

  it("search_code finds the rule a doc describes, case-insensitively, with file and line", async () => {
    const hits = await runReadTool(box(), "search_code", { query: "FREESHIPPING" });
    expect(hits).toContain("src/cart.ts:41: export const freeShipping = (subtotal: number) => subtotal > 50;");
    expect(await runReadTool(box(), "search_code", { query: "argv" })).toContain("src/index.ts:2:");
  });

  it("search_code ranks the code index first and skips index hits outside the path rules", async () => {
    const searched: string[] = [];
    const out = await runReadTool(box({ search: async q => { searched.push(q); return ["server/.dev.vars", "src/cart.ts"]; } }), "search_code", { query: "subtotal" });
    expect(searched).toEqual(["subtotal"]);
    expect(out).toContain("1 from the code index");
  });

  it("say so when this toolbox has no PR or CI to read", async () => {
    expect(await runReadTool(box(), "read_ci", {})).toBeUndefined();
    expect(await runReadTool(box({ ci: async () => "test: failure" }), "read_ci", {})).toBe("test: failure");
  });

  it("compact shrinks the oldest big results first and keeps the newest whole", () => {
    const obs = [{ tool: "read_file", result: "a".repeat(30000) }, { tool: "read_file", result: "b".repeat(30000) }];
    const out = compact(obs, 36000);
    expect(out[0].result.length).toBeLessThan(2000);
    expect(out[1].result).toBe(obs[1].result);
    expect(obs[0].result.length).toBe(30000); // pure
  });
});

describe("AI review as a tool loop", () => {
  it("catches Testing #13: a doc's '$50 or more' against code that says > 50", async () => {
    const diff = "--- docs/SHIPPING.md (added)\n+Orders of $50 or more ship free.";
    const sent = spark([
      { tool: "search_code", query: "freeShipping", reason: "Find the rule the doc describes" },
      { tool: "read_file", path: "src/cart.ts", reason: "Read the threshold" },
      { tool: "verdict", verdict: "rework", reason: "The doc says $50 ships free but src/cart.ts:41 uses > 50, so $50 does not.", findings: ["docs/SHIPPING.md contradicts src/cart.ts:41"] },
    ]);
    const v = await reviewWithTools(sparkTestEnv(), { title: "Document shipping", body: "Add docs/SHIPPING.md", builder: "Codex" }, diff, box());
    expect(v.verdict).toBe("rework");
    expect(v.steps.map(s => s.tool)).toEqual(["search_code", "read_file", "verdict"]);
    expect(sent[1]).toContain("src/cart.ts:41: export const freeShipping"); // the search result reached Spark on the next turn
  });

  it("starts from prefetched context, and takes a bare verdict reply as the verdict turn", async () => {
    const sent = spark([{ verdict: "rework", reason: "--coupon is never parsed; src/index.ts reads argv[2].", findings: [] }]);
    const v = await reviewWithTools(sparkTestEnv(), { title: "README uses npm", body: "", builder: "Codex" }, "--- README.md\n+bun run src/index.ts --coupon SAVE10", box(), [{ path: "src/index.ts", content: repo["src/index.ts"] }]);
    expect(v.verdict).toBe("rework");
    expect(sent[0]).toContain("process.argv[2]");
  });

  it("an unknown tool gets told what exists instead of failing the review", async () => {
    const sent = spark([{ tool: "assign_job", reason: "wrong loop" }, { tool: "verdict", verdict: "pass", reason: "Fine", findings: [] }]);
    const v = await reviewWithTools(sparkTestEnv(), { title: "x", body: "", builder: "Codex" }, "+x", box());
    expect(v.verdict).toBe("pass");
    expect(sent[1]).toContain("assign_job isn't available here");
  });

  it("must rule before it runs out of turns", async () => {
    spark(Array(10).fill({ tool: "list_files", prefix: "", reason: "look" }));
    await expect(reviewWithTools(sparkTestEnv(), { title: "x", body: "", builder: "Codex" }, "+x", box())).rejects.toThrow("without a verdict");
  });
});

describe("planner tools", () => {
  const found = [
    { tool: "read_issue", reason: "Understand it" },
    { tool: "search_code", query: "argv", reason: "Find where the coupon is read" },
    { tool: "read_file", path: "src/index.ts", reason: "Read the entry point" },
    { tool: "assign_job", reason: "Fix the example", plan: "Change the README example to pass the coupon as the first argument.", acceptance: ["README example runs"], files: ["README.md", "src/index.ts"] },
  ];

  it("can search and read past the approved paths, but only edit them unless the player approves the scope", async () => {
    spark(found);
    await expect(planLocalTask(sparkTestEnv(), { title: "README", body: "", district: "/" }, ["README.md"], box(), async () => {})).rejects.toThrow("explicit writable subset");
    spark(found);
    const widened = await planLocalTask(sparkTestEnv(), { title: "README", body: "", district: "/" }, ["README.md"], box(), async () => {}, { widen: true });
    expect(widened.files).toEqual(["README.md", "src/index.ts"]);
  });

  it("can't widen to a file it never read", async () => {
    spark([found[0], { tool: "read_file", path: "README.md", reason: "r" }, { ...found[3], files: ["README.md", "src/cart.ts"] }]);
    await expect(planLocalTask(sparkTestEnv(), { title: "README", body: "", district: "/" }, ["README.md"], box(), async () => {}, { widen: true })).rejects.toThrow("explicit writable subset");
  });

  it("stops the loop on a secret path instead of letting it probe", async () => {
    spark([{ tool: "read_file", path: "server/.dev.vars", reason: "check config" }]);
    await expect(planLocalTask(sparkTestEnv(), { title: "x", body: "", district: "/" }, ["README.md"], box(), async () => {})).rejects.toThrow("unapproved");
  });

  it("reads the factory and the mines when the toolbox has them", async () => {
    const sent = spark([{ tool: "read_factory", reason: "Check scars" }, { tool: "read_signals", reason: "Check Sentry" }, found[0], { tool: "read_file", path: "README.md", reason: "r" }, { ...found[3], files: ["README.md"] }]);
    await planLocalTask(sparkTestEnv(), { title: "x", body: "", district: "/" }, ["README.md"], box({ factory: () => "{\"stations\":\"FACTORY\"}", signals: () => "SENTRY-SPIKE" }), async () => {});
    expect(sent[1]).toContain("FACTORY");
    expect(sent[2]).toContain("SENTRY-SPIKE");
  });
});

describe("factory context", () => {
  const item = (over: Partial<Item>): Item => ({ id: "gh-1", kind: "bug", source: "github_issue", title: "Cart", district: "src", state: "queued", attempts: 0, updatedAt: 0, ...over });
  const state = {
    repo: "r3dbars/Testing", baseBranch: "main", districts: [], machines: [], belts: [], power: [], science: { red: 0, green: 0 }, trust: 0, tick: 0,
    items: [item({}), item({ id: "gh-2", title: "Old cart bug", scars: [{ station: "review", reason: "free shipping off by one", strike: 1 }] }), item({ id: "sentry-1", source: "sentry", title: "TypeError in cart", ore: { fingerprint: "f", count: 12, firstSeen: 0, lastSeen: 0, severity: 3, usersAffected: 4, reporters: ["ann@example.com"], linked: [], hints: ["src/cart.ts:41"], rawRefs: [], paying: true } })],
    support: [{ id: "t1", channel: "email", thread: "x", from: "ann@example.com", subject: "Charged shipping on $50", body: "my email is ann@example.com", messages: 1, receivedAt: 0, state: "new", sent: [], triage: { kind: "bug", district: "src", summary: "Shipping charged at exactly $50", reason: "r", linkedItemId: "gh-1", by: "spark" } }],
  } as unknown as FactoryState;

  it("read_factory carries district scars, permits and the player's past calls", () => {
    const brief = factoryBrief(state, state.items[0], { lanes: { docs: { lane: "docs", streak: 3, shipped: 3, reworks: 0, permit: false, autoLaunched: 0 } } } as never, "never propose lint cards");
    expect(brief).toContain("free shipping off by one");
    expect(brief).toContain("\"cleanStreak\":3");
    expect(brief).toContain("never propose lint cards");
  });

  it("read_signals ties Sentry and support to the work, without customer addresses", () => {
    const brief = signalsBrief(state, state.items[0]);
    expect(brief).toContain("TypeError in cart");
    expect(brief).toContain("Shipping charged at exactly $50");
    expect(brief).not.toContain("ann@example.com");
  });
});
