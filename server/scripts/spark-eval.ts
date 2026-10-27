// Live, seeded AI-review eval. Labels/oracles never enter the reviewer prompt.
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { localBudget } from "./local-budget";
import { budgetUsage } from "../src/budget";
import { diffText, referencedFiles, reviewDiff, type ReviewVerdict } from "../src/gauntlet";
import { REVIEW_TURNS, type SparkStep } from "../src/spark-tools";
import { measuredCost, NANO_USD, type TokenUsage } from "../src/spend";
import type { SparkEnv } from "../src/spark";

type Edit = { path: string; before?: string; after: string };
type Case = { id: string; good: boolean; task: { title: string; body: string; builder: string }; rationale: string; edits: Edit[]; witness: { expression: string; base: unknown; head: unknown } };
type Call = { status?: number; requestSha256: string; response?: unknown; usage?: TokenUsage; estimatedUsd: number | null; error?: string };
type Prepared = { seed: Case; files: Record<string, string>; diff: string; context: { path: string; content: string }[]; witness: unknown[]; tests?: { baseExit: number; headExit: number; baseLog: string; headLog: string } };
type Row = { id: string; good: boolean; outcome: string; verdict?: ReviewVerdict; error?: string; steps: SparkStep[]; calls: Call[]; ms: number; witness: unknown[]; tests?: Prepared["tests"]; reservedTokens: number };
const root = resolve(import.meta.dir, "../..");
const fixtures = join(import.meta.dir, "eval-cases");
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const baseText = readFileSync(join(fixtures, "base.json"), "utf8");
const casesText = readFileSync(join(fixtures, "cases.json"), "utf8");
const base = JSON.parse(baseText) as { repo: string; sha: string; files: Record<string, string> };
const seeds = JSON.parse(casesText) as Case[];
const args = new Set(process.argv.slice(2));
if ([...args].some(a => !["--check", "--report"].includes(a))) throw new Error("Usage: bun run spark:eval [--check | --report]");
function command(cwd: string, cmd: string[], allowFailure = false) {
  const out = Bun.spawnSync(cmd, { cwd, env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR }, timeout: 30000 });
  const stdout = out.stdout.toString(), stderr = out.stderr.toString();
  if (!allowFailure && out.exitCode !== 0) throw new Error(`${cmd.join(" ")}: ${stderr}`);
  return { stdout, stderr, exitCode: out.exitCode };
}
function put(dir: string, files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    if (path.startsWith("/") || path.split("/").includes("..")) throw new Error("Unsafe fixture path");
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
}
function prepare(): Prepared[] {
  if (seeds.length !== 15 || seeds.filter(c => !c.good).length !== 10 || new Set(seeds.map(c => c.id)).size !== seeds.length) throw new Error("Expected 10 bad and 5 good unique cases");
  return seeds.map(seed => {
    const files = { ...base.files };
    for (const edit of seed.edits) {
      if (edit.before === undefined) {
        if (edit.path in files) throw new Error(`Added file exists: ${edit.path}`);
        files[edit.path] = edit.after;
      } else {
        if (!edit.before || files[edit.path]?.split(edit.before).length !== 2) throw new Error(`Non-unique edit: ${seed.id} ${edit.path}`);
        files[edit.path] = files[edit.path].replace(edit.before, edit.after);
      }
    }
    const dir = mkdtempSync(join(tmpdir(), "shiptorio-eval-"));
    try {
      put(dir, base.files);
      command(dir, ["git", "init", "-q"]);
      command(dir, ["git", "add", "."]);
      const witness = () => {
        const out = command(dir, [process.execPath, "-e", `import * as cart from './src/cart.ts'; import * as format from './src/format.ts'; console.log(JSON.stringify(await (async()=>{return ${seed.witness.expression}})()));`]);
        return JSON.parse(out.stdout.trim());
      };
      const before = witness();
      put(dir, files);
      const after = witness();
      if (JSON.stringify(before) !== JSON.stringify(seed.witness.base) || JSON.stringify(after) !== JSON.stringify(seed.witness.head)) throw new Error(`Ground-truth witness mismatch: ${seed.id}: ${before} -> ${after}`);
      const changed = [...new Set(seed.edits.map(e => e.path))];
      // git diff includes new files after intent-to-add, without fake line numbers or hand-written patches.
      command(dir, ["git", "add", "-N", "."]);
      const prFiles = changed.map(filename => ({ filename, status: filename in base.files ? "modified" : "added", patch: command(dir, ["git", "diff", "--no-ext-diff", "--unified=3", "--", filename]).stdout.split("\n").filter(l => !/^(diff --git|index |--- |\+\+\+ |new file mode )/.test(l)).join("\n") }));
      let tests: Prepared["tests"];
      if (files["test/regression.test.ts"]) {
        const headRun = command(dir, [process.execPath, "test", "test/regression.test.ts"], true);
        put(dir, base.files); // Keep the proposed test, revert only the implementation.
        const baseRun = command(dir, [process.execPath, "test", "test/regression.test.ts"], true);
        tests = { baseExit: baseRun.exitCode, headExit: headRun.exitCode, baseLog: baseRun.stderr + baseRun.stdout, headLog: headRun.stderr + headRun.stdout };
        if (headRun.exitCode !== 0 || (seed.good && baseRun.exitCode === 0) || (seed.id === "bad-05-nonregression-test" && baseRun.exitCode !== 0)) throw new Error(`Regression proof mismatch: ${seed.id}`);
      }
      const context = referencedFiles(prFiles).map(path => ({ path, content: files[path]?.slice(0, 6000) ?? "" })).filter(c => c.content);
      return { seed, files, diff: diffText(prFiles), context, witness: [before, after], tests };
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}
const dollars = (n: number) => `$${n.toFixed(6)}`;
const escapeCell = (s: string) => s.replace(/\|/g, "\\|").replace(/\s+/g, " ");
function report(run: { started: string; revision: string; fixtureHash: string; rows: Row[]; complete: boolean }, filename: string) {
  const rows = run.rows;
  const caught = rows.filter(r => !r.good && r.outcome === "caught").length;
  const missed = rows.filter(r => r.outcome === "missed").length;
  const falseAlarms = rows.filter(r => r.outcome === "false alarm").length;
  const fallbacks = rows.filter(r => r.outcome === "fell back to rules").length;
  const failed = rows.filter(r => ["error", "paused"].includes(r.outcome)).length;
  const calls = rows.flatMap(r => r.calls);
  const measured = calls.reduce((n,c) => n + (c.estimatedUsd ?? 0), 0);
  const unmeasured = calls.filter(c => c.estimatedUsd === null).length;
  const headline = `AI review eval: caught ${caught}/10 seeded bad fixes (${caught * 10}%); ${falseAlarms}/5 good fixes flagged; ${fallbacks} rules fallbacks, ${failed} unavailable. [Results and limits](docs/EVAL.md).`;
  const table = rows.map(r => {
    const usage = r.calls.map(c => c.usage);
    const known = usage.every(u => u?.prompt_tokens !== undefined && u?.completion_tokens !== undefined);
    const input = usage.reduce((n,u) => n + (u?.prompt_tokens ?? 0), 0), output = usage.reduce((n,u) => n + (u?.completion_tokens ?? 0), 0);
    const cost = r.calls.every(c => c.estimatedUsd !== null) ? dollars(r.calls.reduce((n,c) => n + c.estimatedUsd!,0)) : "unknown (usage missing)";
    return `| ${r.id} | ${r.good ? "good" : "bad"} | ${r.outcome} | ${r.calls.length} | ${known ? `${input} / ${output}` : "unknown"} | ${cost} | ${escapeCell(r.verdict ? `${r.verdict.verdict}: ${r.verdict.reason} ${r.verdict.findings.join("; ")}` : r.error ?? "")} |`;
  }).join("\n");
  const limitations = rows.filter(r => r.outcome === "missed" || r.outcome === "false alarm" || r.outcome === "error" || r.outcome === "paused").map(r => `- **${r.id} (${r.outcome})**: ${seeds.find(c => c.id === r.id)!.rationale} Reviewer: ${r.verdict?.reason ?? r.error}`);
  const doc = `# AI review eval

Generated by \`bun run spark:eval\`; do not hand-edit results.

${headline.replace("(docs/EVAL.md)", "(EVAL.md)")}

Run: ${run.started}. Complete: **${run.complete}**. Reviewer revision: \`${run.revision}\`. Model: \`muse-spark-1.3\`, medium reasoning, six-turn tool loop. Fixture SHA-256: \`${run.fixtureHash}\`. Raw responses, tool steps, executable witnesses and base/head test logs: [${filename}](../server/scripts/eval-cases/${filename}).

## Method

Fifteen hand-seeded candidate patches against [r3dbars/Testing at ${base.sha}](https://github.com/${base.repo}/tree/${base.sha}), ten bad and five good. The committed base snapshot includes all tracked files. The original README flag failure comes from Testing PR #12; the SHIPPING mismatch is seeded from #13. Each candidate is applied independently to the pinned base; the toolbox reads its proposed head, not base. Diffs are generated by git. Labels, rationale and witness assertions are withheld from the reviewer. Only the issue, candidate diff, referenced-file context and repo toolbox reach it. CI/comments are unavailable rather than fabricated.

Same entry point as \`spark:loop\`: \`reviewDiff\` → \`reviewWithTools\` in unchanged production code. A bad candidate sent to rework is **caught**, a bad pass is **missed**, a good rework is a **false alarm**, and a good pass is **correct pass**. This scores gate decisions; it does not assert every rejection identified the planted defect. Full findings remain in the receipts. A no-model fixed security rejection is **fell back to rules**, never AI credit; exceptions are **error** or **paused**, never catches. Production currently pauses on exhausted budgets and sends ordinary reviewer errors to rework; it does not silently replace them with an AI verdict.

Caught ${caught}/10 bad; missed ${missed}/10; false alarms ${falseAlarms}/5 good; rules ${fallbacks}; unavailable ${failed}. Fixed denominators retain unavailable cases. No model verdict is retried to improve a score. Production transport retries remain enabled and every request counts.

## Recorded results

| Case | Label | Outcome | API calls | Input / output tokens | Estimated USD | Reviewer decision |
| --- | --- | --- | ---: | ---: | ---: | --- |
${table}

${calls.length} API attempts; measured estimated cost ${dollars(measured)}; ${unmeasured} attempts without measured cost. API usage includes reasoning output. Costs use production \`measuredCost\`: $1.25/M input, $0.15/M cached input, $4.25/M output ([Meta pricing](https://dev.meta.ai/docs/pricing-rate-limits)); these are estimates, not invoices. Unmeasured attempts retain their token reservation in the daily ledger.

## What it misses

${limitations.length ? limitations.join("\n") : "No misses or false alarms in this single run. This small curated set cannot establish production accuracy."}

This is one run on a tiny cart, not an unbiased benchmark. Existing unrelated bugs remain in the base; a good fix is scoped to its issue. The reviewer reads and searches but cannot execute tests. In particular, bad-05 fixes the shipping code but supplies a test that passes on base: that is inadequate proof by the explicit issue requirements. The eval independently executes each supplied regression test on base and head, but those oracle results are not fed to the reviewer. Review cannot replace the verify bay or a human merge. Repeated runs may differ.

## Reproduce and budget

\`META_API_KEY=… bun run spark:eval\` validates all 15 fixtures locally, calls the live reviewer once per case, records a new JSON receipt, then regenerates this file and the README line. \`bun run spark:eval --check\` checks fixtures without paid calls; \`bun run spark:eval --report\` rebuilds docs from the latest recorded run without paid calls. No key is written to receipts. No deployment or GitHub mutation occurs.

Before any paid call the script prints the remaining daily token/call allowance and conservative dollar ceiling. It shares \`localBudget()\`'s persistent smoke-check ledger (\`~/.cache/shiptorio/spark-check.sqlite\`, UTC days) with \`spark:loop\`, explicitly capped at 400 calls / 1,000,000 tokens; each production request reserves before fetch, including transport retries. Concurrent local smoke checks share that cap. Hosted/team usage is outside this local ledger. The run stops scheduling cases after a budget pause; partial receipts are published as partial, without inventing missing verdicts.
`;
  writeFileSync(join(root,"docs/EVAL.md"),doc);
  const readmePath = join(root,"README.md"), readme = readFileSync(readmePath,"utf8");
  writeFileSync(readmePath, readme.includes("AI review eval:") ? readme.replace(/^AI review eval:.*$/m,headline) : readme.replace("**The factory must grow.**",`**The factory must grow.**\n\n${headline}`));
}
const resultsDir = join(fixtures,"runs");
if (args.has("--report")) {
  const latest = readFileSync(join(resultsDir,"latest.txt"),"utf8").trim();
  if (!/^[\w.-]+\.json$/.test(latest)) throw new Error("Invalid run name");
  const run = JSON.parse(readFileSync(join(resultsDir,latest),"utf8"));
  if (run.fixtureHash !== hash(baseText+casesText)) throw new Error("Latest run belongs to different fixtures");
  report(run,`runs/${latest}`);
  process.exit(0);
}
const prepared = prepare();
console.log(`Validated ${prepared.length} seeded patches, witnesses and supplied base/head regression tests.`);
if (args.has("--check")) process.exit(0);
if (!process.env.META_API_KEY) throw new Error("Set META_API_KEY in the environment; no paid calls made.");
const env: SparkEnv = { ...localBudget(), META_API_KEY: process.env.META_API_KEY, SPARK_MODEL: "muse-spark-1.3", SPARK_DISABLED: process.env.SPARK_DISABLED, SPARK_DAILY_CALLS: "400", SPARK_DAILY_TOKENS: "1000000" };
const startBudget = await budgetUsage(env,await env.budgetAccount!());
const remainingTokens = Math.max(0,1000000-startBudget.tokens), remainingCalls = Math.max(0,400-startBudget.calls);
console.log(`Cost BEFORE calls: <= ${dollars(remainingTokens*4.25/1000000)} (all remaining tokens at output rate); typical 15×${REVIEW_TURNS} = <=90 calls before transport retries. Remaining daily allowance: ${remainingCalls}/400 calls, ${remainingTokens}/1000000 tokens. Unknown usage retains reservations. Actual cost printed per case.`);
const started = new Date().toISOString();
const run = { started, revision: command(root,["git","rev-parse","HEAD"]).stdout.trim(), fixtureHash: hash(baseText+casesText), startBudget, rows: [] as Row[], complete: false };
mkdirSync(resultsDir,{recursive:true});
const filename = `${started.replace(/[:.]/g,"-")}.json`;
const save = () => { writeFileSync(join(resultsDir,filename),JSON.stringify(run,null,2)+"\n"); writeFileSync(join(resultsDir,"latest.txt"),filename+"\n"); };
const realFetch = globalThis.fetch;
let activeCalls: Call[] = [];
// Observe actual production HTTP responses; never substitute a model answer or change its prompt.
const observed = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url !== "https://api.meta.ai/v1/chat/completions") throw new Error("Unexpected eval network destination");
  const call: Call = { requestSha256: hash(String(init?.body ?? "")), estimatedUsd: null };
  activeCalls.push(call);
  try {
    const response = await realFetch(input,init);
    call.status = response.status;
    // An invalid/non-JSON response must reach production unchanged; observation never causes a retry.
    try {
      const text = await response.clone().text();
      let body: { usage?: TokenUsage };
      try { body = JSON.parse(text); } catch { call.response = text; return response; }
      call.response = body; call.usage = body?.usage;
      const cost = measuredCost(body?.usage);
      call.estimatedUsd = cost ? cost.cost/NANO_USD : null;
    } catch { call.error = "Unable to observe response body"; }
    return response;
  } catch(error) { call.error = error instanceof Error ? error.message : "HTTP failure"; throw error; }
}) as typeof fetch;
globalThis.fetch = observed;
try {
  for (const p of prepared) {
    activeCalls = [];
    const steps: SparkStep[] = [], at = Date.now();
    const before = await budgetUsage(env,await env.budgetAccount!());
    const row: Row = { id:p.seed.id,good:p.seed.good,outcome:"error",steps,calls:activeCalls,ms:0,witness:p.witness,tests:p.tests,reservedTokens:0 };
    try {
      const read = async (path: string) => p.files[path] ?? null;
      row.verdict = await reviewDiff(env,p.seed.task,p.diff,p.context,{paths:Object.keys(p.files),read,issue:()=>JSON.stringify(p.seed.task)},async s=>{ steps.push(s); });
      row.outcome = !activeCalls.length ? "fell back to rules" : row.verdict.verdict === "rework" ? p.seed.good ? "false alarm" : "caught" : p.seed.good ? "correct pass" : "missed";
    } catch(error) {
      row.error = error instanceof Error ? error.message : "Unknown reviewer failure";
      row.outcome = /budget|accounting|429/i.test(row.error) ? "paused" : "error";
    }
    row.ms = Date.now()-at;
    const after = await budgetUsage(env,await env.budgetAccount!());
    row.reservedTokens = after.tokens-before.tokens;
    run.rows.push(row); save();
    console.log(`${row.id}: ${row.outcome}; ${row.calls.length} calls; ${row.reservedTokens} ledger tokens; ${row.calls.every(c=>c.estimatedUsd!==null) ? dollars(row.calls.reduce((n,c)=>n+c.estimatedUsd!,0)) : "cost unknown"}; ${row.ms}ms`);
    if (row.outcome === "paused") break;
  }
} finally { globalThis.fetch = realFetch; save(); }
run.complete = run.rows.length === seeds.length && !run.rows.some(r=>r.outcome === "error" || r.outcome === "paused");
save(); report(run,`runs/${filename}`);
console.log(`Receipts: server/scripts/eval-cases/runs/${filename}; docs/EVAL.md and README regenerated.`);
process.exitCode = run.complete ? 0 : 1;
