import { localBudget } from "./local-budget";
// Live check of every agentic Spark step against a real checkout of the testbed (r3dbars/Testing):
//   META_API_KEY=... bun run spark:loop [path/to/Testing checkout]
// Each row says whether the step ran on Spark and did the right thing. Exits 1 if any row fails.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gameMaster, judgePermit, pickFiles, planLocalTask, triage, type SparkStep } from "../src/spark";
import { diffText, referencedFiles, reviewDiff, type ReviewVerdict } from "../src/gauntlet";

const env = { ...localBudget(), META_API_KEY: process.env.META_API_KEY, SPARK_MODEL: process.env.SPARK_MODEL, SPARK_BASE_URL: process.env.SPARK_BASE_URL };
if (!env.META_API_KEY) { console.error("set META_API_KEY first"); process.exit(1); }
const root = process.argv[2] ?? process.env.TESTING_CHECKOUT ?? join(import.meta.dir, "../../../testing");

const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  if (name === ".git" || name === "node_modules") return [];
  const full = join(dir, name);
  return statSync(full).isDirectory() ? walk(full) : [relative(root, full)];
});
const paths = walk(root);
const read = async (path: string) => { try { return readFileSync(join(root, path), "utf8"); } catch { return null; } };
if (!paths.includes("src/index.ts")) { console.error(`${root} doesn't look like the Testing checkout (no src/index.ts)`); process.exit(1); }

// Testing #5 (README says npm) and the PR Codex built for it, #12, whose new example doesn't work:
// src/index.ts reads the coupon from process.argv[2], so `--coupon SAVE10` passes "--coupon" as the code.
const issue = { title: "README setup steps use npm instead of bun", body: "The Setup section says npm install / npm start. This repo uses bun. Update the setup steps.", district: "/" };
const badDiff = diffText([{ filename: "README.md", status: "modified", patch: "@@ -9,9 +9,17 @@\n ## Setup\n \n+Install dependencies and run the app through its source entry file:\n+\n+```sh\n+bun install\n+bun run src/index.ts\n+```\n+\n+Optionally, pass a coupon code:\n+\n ```sh\n-npm install\n-npm start\n+bun run src/index.ts --coupon SAVE10\n ```" }]);
const goodDiff = diffText([{ filename: "README.md", status: "modified", patch: "@@ -9,9 +9,13 @@\n ## Setup\n \n ```sh\n-npm install\n-npm start\n+bun install\n+bun run src/index.ts\n+bun run src/index.ts SAVE10   # optional coupon code\n ```" }]);
// Testing #13: a new docs/SHIPPING.md says "$50 or more ships free", but src/cart.ts only ships free above $50
// (open bug #2). A reviewer that reads the code should flag the mismatch.
const shippingDiff = diffText([{ filename: "docs/SHIPPING.md", status: "added", patch: "@@ -0,0 +1,3 @@\n+# Shipping\n+\n+Shipping costs $5.99. Orders totaling $50 or more after discounts ship free. An empty cart ships free." }]);
// The toolbox (when this checkout has one, PR #314) lets review and planning read and search the whole testbed.
const box = { paths, read, issue: () => JSON.stringify(issue) };
const tools = await import("../src/spark-tools" as string).catch(() => null) as { planLocalTask?: typeof planLocalTask } | null;
const plan: typeof planLocalTask = (env, task, allowed, _read, record) => (tools?.planLocalTask ? tools.planLocalTask(env, task, allowed, box as never, record) : planLocalTask(env, task, allowed, read, record));
const review = (task: { title: string; body: string; builder: string }, diff: string, ctx: { path: string; content: string }[]) =>
  (reviewDiff as unknown as (...a: unknown[]) => Promise<ReviewVerdict>)(env, task, diff, ctx, box);
const context = async (diff: string) => (await Promise.all(referencedFiles([{ filename: "README.md", status: "modified", patch: diff }]).map(async path => ({ path, content: (await read(path))?.slice(0, 6000) ?? "" })))).filter(c => c.content);

type Row = { step: string; ok: boolean; ms: number; detail: string };
const rows: Row[] = [];
async function step<T>(name: string, run: () => Promise<T>, check: (out: T) => [boolean, string]) {
  const t = Date.now();
  try { const out = await run(); const [ok, detail] = check(out); rows.push({ step: name, ok, ms: Date.now() - t, detail }); }
  catch (e) { rows.push({ step: name, ok: false, ms: Date.now() - t, detail: `FAILED: ${(e as Error).message.slice(0, 200)}` }); }
}

await step("triage", () => triage(env, { title: issue.title, body: issue.body, labels: [] }, ["/", "src", "test"]),
  t => [!!t.reason && t.district === "/", `${t.kind} → ${t.district}: ${t.reason}`]);
let scope: string[] = [];
await step("scope", async () => (scope = await pickFiles(env, { ...issue }, paths)),
  f => [f.includes("README.md"), f.join(", ")]);
const steps: SparkStep[] = [];
await step("plan (tool loop)", () => plan(env, issue, scope.length ? scope : ["README.md", "package.json"], read, async s => { steps.push(s); }),
  a => [a.files.includes("README.md") && steps.filter(s => s.tool !== "assign_job").length >= 2, `${steps.map(s => s.tool).join(" → ")} | edits ${a.files.join(", ")}`]);
await step("review catches broken example", async () => review({ ...issue, builder: "Codex" }, badDiff, await context(badDiff)),
  v => [v.verdict === "rework", `${v.verdict}: ${v.reason}`]);
await step("review passes a working example", async () => review({ ...issue, builder: "Codex" }, goodDiff, await context(goodDiff)),
  v => [v.verdict === "pass", `${v.verdict}: ${v.reason}`]);
await step("review flags doc vs code (#13)", async () => review({ title: "Docs: write down the shipping rule", body: "Record the free-shipping rule in docs/SHIPPING.md.", builder: "Codex" }, shippingDiff, []),
  v => [v.verdict === "rework" || /more than|strictly|>=?|over \$?50|5000|exactly \$?50/i.test(`${v.reason} ${v.findings.join(" ")}`), `${v.verdict}: ${v.reason}`]);
const rework: SparkStep[] = [];
await step("rework re-plan", () => plan(env, { ...issue, failure: "AI review: the README example passes --coupon, but src/index.ts reads the coupon from process.argv[2].", scars: [{ station: "review", reason: "README example `--coupon SAVE10` doesn't work against src/index.ts", strike: 1 }] }, ["README.md", "src/index.ts"], read, async s => { rework.push(s); }),
  a => [/argv|positional|--coupon/i.test(a.plan), `${rework.map(s => s.tool).join(" → ")} | ${a.plan.split("\n")[0].slice(0, 160)}`]);
await step("permit judgement", () => judgePermit(env, { lane: "docs", streak: 5, need: 5, ships: [{ title: "Use bun in setup docs" }, { title: "Document shipping rules" }], openRisks: [] }),
  p => [typeof p.recommend === "boolean" && !!p.why, `${p.recommend ? "grant" : "hold"}: ${p.why}`]);
await step("deck ranking", () => gameMaster(env, {
  bottleneck: { stage: "pad", stationId: "gate-1", wip: 1, ageMinutes: 20, valueAtRisk: 3, summary: "1 PR waiting on you to launch." }, stages: [], items: [], playerFeedback: "{}",
  cards: [
    { id: "launch-12", title: "Launch #12: use bun in README", why: "Every station passed.", kind: "ship", options: [{ id: "launch", label: "Launch", recommended: true }, { id: "later", label: "Later", recommended: false }] },
    { id: "plan-6", title: "Plan #6: document coupons", why: "Docs issue waiting.", kind: "plan", options: [{ id: "plan", label: "Plan it", recommended: true }, { id: "later", label: "Later", recommended: false }] },
  ],
}), g => [g.order.length > 0, `order ${g.order.join(" > ")}`]);

const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
console.log(`\n${pad("step", 32)} ${pad("result", 6)} ${pad("ms", 6)} detail`);
for (const r of rows) console.log(`${pad(r.step, 32)} ${pad(r.ok ? "PASS" : "FAIL", 6)} ${pad(String(r.ms), 6)} ${r.detail}`);
const failed = rows.filter(r => !r.ok).length;
console.log(`\n${rows.length - failed}/${rows.length} steps passed on ${process.env.SPARK_MODEL ?? "the default Spark model"}`);
process.exit(failed ? 1 : 0);
