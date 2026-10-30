// Shippy's brain lab: a local page for poking the real bottleneck brain with your own Meta key.
//   bun run brain:lab              then open http://localhost:5199
// Pick a scenario (every brain-eval case), tweak its signals, and ask Muse Spark and Muse Wonder side by side.
// "Run the eval" grades every case on each model and keeps a scoreboard. Local only: nothing here touches
// shiptorio.dev or a real repo. The key comes from META_API_KEY or server/.dev.vars and never leaves this process.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_AREA, SIGNAL_KINDS, signalId, signalWeight, type BrainSignal, type SignalSource } from "@shiptorio/shared";
import { emptyMemory, modelDiagnose, runDiagnose, BRAIN, type DiagnoseStep } from "../src/diagnose";
import { PLAYBOOK, playsFor } from "../src/unlocks";
import { TOOL_GUIDE } from "../src/spark-tools";
import { MODEL_PRICES } from "../src/spend";
import type { SparkEnv } from "../src/spark";
import { localBudget } from "./local-budget";
import { CASES } from "./brain-eval/cases";
import { goalTilt, meterFetch, playsOk, ready, runCase, stubSpark, T0, type Meter } from "./brain-eval/harness";

const PORT = Number(process.env.PORT ?? 5199);
const RULE = "rule";
const MODELS = Object.keys(MODEL_PRICES);

function metaKey(): string | undefined {
  if (process.env.META_API_KEY) return process.env.META_API_KEY;
  const vars = join(import.meta.dir, "..", ".dev.vars");
  if (!existsSync(vars)) return undefined;
  return readFileSync(vars, "utf8").match(/^META_API_KEY\s*=\s*"?([^"\n]+)"?/m)?.[1]?.trim();
}
// --stub: a fake weight-following model (brain-eval's), for trying the page without a key or spend.
const STUB = process.argv.includes("--stub") ? stubSpark() : undefined;
const KEY = STUB ? "stub" : metaKey();
// Each model call logs a spark.call line at info; keep the terminal readable.
if (!process.argv.includes("--verbose")) console.info = () => {};

// A lab run can be a few hundred calls; the local ledger's default 400/day would stop a full eval halfway.
const envFor = (model: string): SparkEnv => ({ ...localBudget(), META_API_KEY: KEY, SPARK_MODEL: model, SPARK_BASE_URL: STUB?.env.SPARK_BASE_URL ?? process.env.SPARK_BASE_URL, SPARK_DAILY_CALLS: "5000", SPARK_DAILY_TOKENS: "50000000" });

// The fetch meter is global, so model calls run one at a time.
let chain = Promise.resolve();
const serial = <T>(f: () => Promise<T>): Promise<T> => { const run = chain.then(f, f); chain = run.then(() => {}, () => {}); return run; };
const zero = (): Meter => ({ calls: 0, input: 0, output: 0, nanoUsd: 0, unmeasured: 0, ms: 0 });
const metered = <T>(model: string, f: () => Promise<T>) => serial(async () => {
  const meter = zero(), t = Date.now();
  const restore = meterFetch(() => meter, model);
  try { return { out: await f(), meter, wallMs: Date.now() - t }; } finally { restore(); }
});

/** Signals from the page: trusted shape, untrusted text. Ids, times and weights are rebuilt here. */
function cleanSignals(raw: unknown, now: number): BrainSignal[] {
  if (!Array.isArray(raw)) throw new Error("signals must be a list");
  return raw.slice(0, 20).map((r: any) => {
    const source = String(r.source) as SignalSource;
    if (!SIGNAL_KINDS[source]?.includes(String(r.kind))) throw new Error(`unknown signal ${r.source}/${r.kind}`);
    const scope = r.scope ? String(r.scope).slice(0, 80) : undefined;
    return {
      id: signalId(source, String(r.kind), scope), source, kind: String(r.kind), scope,
      title: String(r.title ?? "").slice(0, 200), severity: Math.min(1, Math.max(0, Number(r.severity) || 0)), confidence: Math.min(1, Math.max(0, Number(r.confidence ?? 1))),
      evidence: (Array.isArray(r.evidence) ? r.evidence : []).slice(0, 6).map((e: any) => ({ label: String(e?.label ?? e).slice(0, 200), ...(e?.url ? { url: String(e.url) } : {}) })),
      ...(r.metric ? { metric: r.metric } : {}), observedAt: now - 60_000, freshUntil: now + 6 * 3_600_000,
    } as BrainSignal;
  });
}

function scenarios() {
  const now = Date.now();
  return CASES.filter(ready).map(c => ({
    id: c.id, title: c.title, goal: c.goal ?? "", why: c.why,
    expect: { area: c.expect.area, signal: c.expect.signal ?? null, alsoOk: c.alsoOk ?? [], plays: playsOk(c), unlock: c.unlock?.source ?? null },
    signals: goalTilt(c, c.signals(now)).map(s => ({ source: s.source, kind: s.kind, scope: s.scope, title: s.title, severity: s.severity, confidence: s.confidence, evidence: s.evidence, metric: s.metric, id: s.id })),
  }));
}

function toolbox() {
  return {
    brain: [
      { name: "read_signal", what: "Read one signal's evidence, numbers and links before deciding." },
      { name: "read_factory", what: "Read the line: stations, scars and the player's past calls." },
      { name: "diagnose", what: "Name the one bottleneck, its area, and pick one move from the playbook for the main signal." },
      { name: "quiet", what: "Say nothing. Nothing is worth interrupting the player for." },
    ],
    turns: BRAIN.turns, floor: BRAIN.floor, ruleFloor: BRAIN.ruleFloor,
    builderTools: Object.entries(TOOL_GUIDE).map(([name, what]) => ({ name, what })),
    moves: PLAYBOOK.map(p => ({ play: p.play, title: p.title, kind: p.kind, effort: p.effort, fixes: p.kinds, grows: p.grows ?? [], does: p.action ? "button in the game" : p.path ? `opens GitHub: ${p.path}` : "opens the evidence link" })),
    signals: Object.fromEntries(Object.entries(SIGNAL_KINDS).map(([source, kinds]) => [source, { area: DEFAULT_AREA[source as SignalSource], kinds }])),
    models: MODELS.map(m => ({ id: m, price: MODEL_PRICES[m] })),
    otherJobs: [
      "Triage: sorts each new issue into a kind and district",
      "Scope + plan: picks files, then plans the job with the builder tools above",
      "Review: reads the PR diff and CI, passes or sends it back",
      "Game master: ranks the deck and words the cards",
      "Orbit judge: decides if an error spike after launch was caused by it",
      "Research pick, permit advice, goal guess, experiments",
    ],
  };
}

async function think(body: any) {
  const model = String(body.model);
  const now = Date.now();
  const signals = cleanSignals(body.signals, now);
  const steps: DiagnoseStep[] = [];
  const brief = { signals: signals.map(s => ({ ...s, weight: Number(signalWeight(s, now).toFixed(2)) })) };
  if (model !== RULE && !MODELS.includes(model)) throw new Error(`unknown model ${model}`);
  if (model !== RULE && !KEY) throw new Error("No META_API_KEY: put it in server/.dev.vars or the environment");
  const env = envFor(model);
  const { out, meter, wallMs } = await metered(model, () => runDiagnose({
    signals, memory: emptyMemory(), now, goal: body.goal || undefined, playerFeedback: "", budget: null, ctx: { repo: "acme/shop" },
    think: model === RULE ? undefined : b => modelDiagnose(env, b, { repo: "acme/shop" }, {}, async step => { steps.push(step); }),
  }));
  const d = out.diagnosis;
  return {
    model, wallMs, meter: { ...meter, usd: meter.nanoUsd / 1e9 }, steps, fellBack: out.fellBack && !/No model/.test(out.fellBack) ? out.fellBack : undefined,
    bottleneck: d.bottleneck, unlock: d.unlock, reason: d.reason, ...brief,
    playsForMain: d.bottleneck ? playsFor(signals.find(s => s.id === d.bottleneck!.id)?.kind ?? "").map(p => p.play) : [],
  };
}

async function grade(body: any) {
  const model = String(body.model);
  const c = CASES.find(x => x.id === body.caseId);
  if (!c) throw new Error(`no case ${body.caseId}`);
  if (model !== RULE && !KEY) throw new Error("No META_API_KEY");
  const env = envFor(model);
  const out = await serial(async () => {
    const meter = zero();
    const restore = meterFetch(() => meter, model);
    try { return await runCase(c, model === RULE ? undefined : b => modelDiagnose(env, b, { repo: "acme/shop" }), meter); } finally { restore(); }
  });
  return { ...out, meter: { ...out.meter, usd: out.meter.nanoUsd / 1e9 } };
}

const page = readFileSync(join(import.meta.dir, "brain-lab", "index.html"), "utf8");
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });

Bun.serve({
  port: PORT, hostname: "127.0.0.1", idleTimeout: 240,
  async fetch(req) {
    const { pathname } = new URL(req.url);
    try {
      if (pathname === "/") return new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } });
      if (pathname === "/api/setup") return json({ key: !!KEY, stub: !!STUB, models: [...MODELS, RULE], t0: T0 });
      if (pathname === "/api/scenarios") return json(scenarios());
      if (pathname === "/api/tools") return json(toolbox());
      if (req.method === "POST" && pathname === "/api/think") return json(await think(await req.json()));
      if (req.method === "POST" && pathname === "/api/grade") return json(await grade(await req.json()));
      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  },
});
console.log(`Shippy's brain lab: http://localhost:${PORT}  (${STUB ? "STUB model, not real AI" : KEY ? "Meta key found" : "Meta key MISSING: add META_API_KEY to server/.dev.vars"})`);
