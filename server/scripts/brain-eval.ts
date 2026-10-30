// Grades the bottleneck brain against scripted repo situations (server/scripts/brain-eval/cases.ts).
//   bun run brain:eval                 rule fallback + stubbed model, no key needed (what CI runs)
//   META_API_KEY=... bun run brain:eval --live [--only id,id] [--out report.json]
//   META_API_KEY=... bun run brain:eval --live --models muse-spark-1.3,muse-wonder-1.0   side by side
// Live mode uses the persistent local Spark ledger (~/.cache/shiptorio), like spark:check. Prints hit rate,
// over-nagging and cost per decision; --min-hit 0.8 exits 1 below that hit rate.
import { writeFileSync } from "node:fs";
import { localBudget } from "./local-budget";
import { sparkModel } from "../src/spark";
import { compare, evaluate, render, sparkThink, stubSpark, type Report } from "./brain-eval/harness";

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1]; };
const only = flag("--only")?.split(",").filter(Boolean);
const live = args.includes("--live");
// Each model call logs a spark.call line at info; the table is the point here.
if (!args.includes("--verbose")) console.info = () => {};

const reports: Report[] = [];
reports.push(await evaluate({ mode: "rule", model: "rule fallback", only }));
if (live) {
  if (!process.env.META_API_KEY) { console.error("--live needs META_API_KEY"); process.exit(1); }
  const models = flag("--models")?.split(",").filter(Boolean) ?? [process.env.SPARK_MODEL || ""];
  for (const model of models) {
    const env = { ...localBudget(), META_API_KEY: process.env.META_API_KEY, SPARK_MODEL: model || undefined, SPARK_BASE_URL: process.env.SPARK_BASE_URL };
    reports.push(await evaluate({ mode: "live", model: sparkModel(env), think: sparkThink(env), only, priceAs: sparkModel(env) }));
  }
} else {
  const stub = stubSpark();
  try { reports.push(await evaluate({ mode: "stub", model: "weight-following stub", think: sparkThink(stub.env), only })); }
  finally { stub.restore(); }
}

for (const r of reports) console.log(`${render(r)}\n`);
if (reports.length > 2) console.log(compare(reports));
const out = flag("--out");
if (out) { writeFileSync(out, JSON.stringify(reports, null, 2)); console.log(`wrote ${out}`); }
const min = Number(flag("--min-hit") ?? 0);
const last = reports.at(-1)!;
process.exit(last.summary.hitRate < min ? 1 : 0);
