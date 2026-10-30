// Runs the real bottleneck loop against the scripted cases and grades it. Used by `bun run brain:eval` and by
// server/test/brain-eval.test.ts (stub mode, so CI never needs a Meta key).
//
// The loop core is server/src/diagnose.ts (runDiagnose); the eval drives it exactly as the Durable Object
// does, minus the DO: same memory, same throttle, same rule fallback, same model call.

import { Database } from "bun:sqlite";
import * as shared from "@shiptorio/shared";
import { SIGNAL_KINDS, signalWeight, type BottleneckArea, type BrainSignal } from "@shiptorio/shared";
import { emptyMemory, modelDiagnose, runDiagnose, tapBrain, type BrainMemory, type DiagnoseBrief, type ModelDiagnosis } from "../../src/diagnose";
import { measuredCost, NANO_USD, type TokenUsage } from "../../src/spend";
import type { SparkEnv } from "../../src/spark";
import { playsFor } from "../../src/unlocks";
import { CASES, type EvalCase } from "./cases";

const MIN = 60_000;
/** A fixed clock, so runs are comparable. Tuesday 2026-10-27 14:00 UTC. */
export const T0 = Date.UTC(2026, 9, 27, 14);

// ---------- the brain ----------

export type Think = (brief: DiagnoseBrief) => Promise<ModelDiagnosis>;

export interface Decision {
  area: BottleneckArea | null;
  signalId?: string;
  play?: string;
  text: string; // what the player reads: bottleneck title + why, card title + because
  by?: "spark" | "rule";
  reason: string;
  memory: BrainMemory;
  thought: boolean;
  fellBack?: string;
}

// The factory tilts signals by the player's goals before diagnosing (#387). Until that lands the tilt is a no-op.
type Tilt = (signals: readonly BrainSignal[], goals: unknown) => BrainSignal[];
const tiltByGoals = (shared as unknown as { tiltByGoals?: Tilt }).tiltByGoals;
export const goalTilt = (c: EvalCase, signals: BrainSignal[]): BrainSignal[] => c.goals && tiltByGoals ? tiltByGoals(signals, { ...c.goals, at: T0 }) : signals;

async function decide(c: EvalCase, memory: BrainMemory, now: number, think?: Think): Promise<Decision> {
  const r = await runDiagnose({ signals: goalTilt(c, c.signals(now)), memory, now, goal: c.goal, playerFeedback: "", budget: null, ctx: { repo: "acme/shop" }, think });
  const { bottleneck: b, unlock: u, reason } = r.diagnosis;
  return {
    area: b?.area ?? null, signalId: b?.signalIds[0], play: u?.play, by: b?.by, reason,
    text: b && u ? `${b.title} | ${b.why} | ${u.title} | ${u.because}` : "",
    memory: r.memory, thought: r.thought, fellBack: r.fellBack,
  };
}

// ---------- metering ----------

export interface Meter { calls: number; input: number; output: number; nanoUsd: number; unmeasured: number; ms: number }
const zero = (): Meter => ({ calls: 0, input: 0, output: 0, nanoUsd: 0, unmeasured: 0, ms: 0 });

/**
 * Wraps fetch so every chat completion's usage lands on the current meter, whoever made the call.
 * Returns a restore function; always call it.
 */
export function meterFetch(current: () => Meter, model?: string): () => void {
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const t = Date.now();
    const res = await real(input as RequestInfo, init);
    if (!url.endsWith("/chat/completions")) return res;
    const m = current();
    m.calls++; m.ms += Date.now() - t;
    try {
      const usage = ((await res.clone().json()) as { usage?: TokenUsage }).usage;
      const cost = measuredCost(usage, model);
      if (cost) { m.input += cost.input; m.output += cost.output; m.nanoUsd += cost.cost; } else m.unmeasured++;
    } catch { m.unmeasured++; }
    return res;
  }) as typeof fetch;
  return () => { globalThis.fetch = real; };
}

// ---------- the stub model (CI) ----------

/** A throwaway Spark ledger, so stub runs go through the real budget code without touching ~/.cache. */
export function memoryBudget(): Pick<SparkEnv, "DB" | "budgetAccount"> {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE spark_usage(account TEXT, day TEXT, calls INTEGER DEFAULT 0, tokens INTEGER DEFAULT 0, PRIMARY KEY(account, day))");
  db.exec("CREATE TABLE admin_controls(scope TEXT PRIMARY KEY, paused INTEGER NOT NULL DEFAULT 0)"); // reserveSpark checks the admin pause (#353)
  // Every paid call is charged against the dollar ledger too, factory or not.
  db.exec("CREATE TABLE spark_factory_budgets(repo TEXT PRIMARY KEY, daily_nano_usd INTEGER NOT NULL)");
  db.exec("CREATE TABLE spark_factory_calls(id TEXT PRIMARY KEY, repo TEXT, day TEXT, model TEXT, input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0, cached_tokens INTEGER DEFAULT 0, nano_usd INTEGER, settled INTEGER DEFAULT 0, account TEXT)");
  return {
    budgetAccount: async () => "brain-eval",
    DB: { prepare(sql: string) {
      const query = db.query(sql);
      return { bind(...values: unknown[]) { return { first: async () => query.get(...(values as never[])), run: async () => query.run(...(values as never[])) }; } };
    } } as unknown as D1Database,
  };
}

type StubBrief = { signals: { id: string; weight: number; title: string; plays: { play: string }[] }[]; observations: unknown[] };
/** Digs the diagnose brief out of the user message, whatever envelope the injection policy wraps it in. */
function briefFrom(user: string): StubBrief {
  const tryJson = (t: string): unknown => { try { return JSON.parse(t); } catch { return undefined; } };
  for (const line of [user, ...user.split("\n")]) {
    let v = tryJson(line.trim());
    if (typeof v === "string") v = tryJson(v);
    if (v && typeof v === "object" && Array.isArray((v as StubBrief).signals)) return v as StubBrief;
  }
  const start = user.indexOf('{"goal"');
  const v = start === -1 ? undefined : tryJson(user.slice(start, user.lastIndexOf("}") + 1));
  if (v && typeof v === "object") return v as StubBrief;
  throw new Error(`stub can't find the brief in: ${user.slice(0, 120)}`);
}

/**
 * A fake Meta endpoint that plays a weight-following model: it reads the heaviest signal, then names it with
 * its first play. It proves the plumbing (prompt → JSON → schema → diagnosis → grade → cost) without a key.
 * Its score says nothing about Spark; only a live run does.
 */
export function stubSpark(): { env: SparkEnv; restore: () => void } {
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith("https://stub.meta.local/")) return real(input as RequestInfo, init);
    const body = JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[] };
    const user = body.messages.find(m => m.role === "user")!.content;
    const brief = briefFrom(user);
    const top = [...brief.signals].sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id))[0];
    const reply = brief.observations.length === 0
      ? { tool: "read_signal", signalId: top.id, reason: "Reading the heaviest signal first." }
      : { tool: "diagnose", signalIds: [top.id], title: top.title.slice(0, 60), why: `The heaviest signal, at ${top.weight}.`, play: top.plays[0].play, reason: "Heaviest signal.", confidence: 0.6 };
    const content = JSON.stringify(reply);
    const prompt = Math.ceil(user.length / 4), completion = Math.ceil(content.length / 4) + 120;
    return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion } }), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { env: { ...memoryBudget(), META_API_KEY: "stub", SPARK_BASE_URL: "https://stub.meta.local/v1" }, restore: () => { globalThis.fetch = real; } };
}

// ---------- grading ----------

export interface CaseResult {
  id: string; title: string;
  expected: { area: BottleneckArea | null; signal?: string; plays: string[] };
  got: { area: BottleneckArea | null; signalId?: string; play?: string; text: string; by?: string; reason: string };
  hit: boolean; // area matches expected or an alsoOk read
  exact: boolean; // area matches expected exactly
  signalHit: boolean | null; // main signal id matches (null when the case names none)
  playHit: boolean | null; // the unlock is an acceptable play (null for quiet cases)
  wordingHit: boolean | null; // the card's words name an acceptable move (null for quiet cases)
  /** Over-nagging: a card on a quiet case (first look or the later heartbeat), a card that changed with nothing changed, or a Later'd card back within the hour. */
  nags: { quietCard: boolean; flip: boolean; renag: boolean; heartbeatCard: boolean };
  thinks: number; fellBack?: string;
  meter: Meter;
}

export interface Report {
  mode: string; model: string; at: string;
  cases: CaseResult[];
  summary: {
    cases: number; hitRate: number; exactRate: number; signalRate: number; playRate: number; wordingRate: number;
    quietCases: number; quietRight: number; overNags: number; overNagRate: number;
    thinks: number; calls: number; fallbacks: number;
    usdPerDecision: number; tokensPerDecision: number; msPerDecision: number; usdTotal: number;
  };
}

const ok = (c: EvalCase, area: BottleneckArea | null) => area === c.expect.area || (c.alsoOk ?? []).includes(area);
/** Acceptable plays: the case's own list, else every play for the expected main signal's kind. */
export const playsOk = (c: EvalCase): string[] => c.plays ?? (c.expect.signal ? playsFor(c.expect.signal.split(":")[1]).map(p => p.play) : []);
const weightOf = (c: EvalCase, id: string | undefined, now: number) => { const s = c.signals(now).find(x => x.id === id); return s ? signalWeight(s, now) : 1; };

export async function runCase(c: EvalCase, think: Think | undefined, meter: Meter): Promise<CaseResult> {
  // 1. First look: a fresh brain sees the picture.
  const first = await decide(c, emptyMemory(), T0, think);
  let thinks = Number(first.thought);
  // 2. Fifteen minutes on, nothing changed: the card must not change, and it shouldn't pay to think again.
  const steady = await decide(c, first.memory, T0 + 15 * MIN, think);
  thinks += Number(steady.thought);
  const flip = first.signalId !== steady.signalId;
  // 3. The player says Later; half an hour on, nothing changed: the same card must not come back.
  let renag = false;
  if (first.signalId) {
    const later = tapBrain(steady.memory, first.signalId, "later", weightOf(c, first.signalId, T0 + 16 * MIN), T0 + 16 * MIN);
    const after = await decide(c, later, T0 + 45 * MIN, think);
    thinks += Number(after.thought);
    renag = after.signalId === first.signalId;
  }
  // 4. Quiet cases: still quiet hours later, after the brain has had time to look again.
  let heartbeatCard = false;
  if (c.expect.area === null) {
    const beat = await decide(c, steady.memory, T0 + 7 * 60 * MIN, think);
    thinks += Number(beat.thought);
    heartbeatCard = !!beat.signalId;
  }
  const plays = playsOk(c);
  const carded = !!first.signalId && c.expect.area !== null;
  return {
    id: c.id, title: c.title, expected: { ...c.expect, plays },
    got: { area: first.area, signalId: first.signalId, play: first.play, text: first.text, by: first.by, reason: first.reason },
    hit: ok(c, first.area), exact: first.area === c.expect.area,
    signalHit: c.expect.signal ? first.signalId === c.expect.signal : null,
    playHit: c.expect.area === null ? null : carded && plays.includes(first.play ?? ""),
    wordingHit: c.expect.area === null || !c.unlock ? null : carded && c.unlock.test(first.text),
    nags: { quietCard: c.expect.area === null && !!first.signalId, flip, renag, heartbeatCard },
    thinks, fellBack: first.fellBack, meter,
  };
}

const rate = (n: number, d: number) => (d ? n / d : 0);

export function summarize(mode: string, model: string, cases: CaseResult[]): Report {
  const named = cases.filter(c => c.signalHit !== null), plays = cases.filter(c => c.playHit !== null), worded = cases.filter(c => c.wordingHit !== null), quiet = cases.filter(c => c.expected.area === null);
  const overNags = cases.reduce((n, c) => n + Number(c.nags.quietCard) + Number(c.nags.flip) + Number(c.nags.renag) + Number(c.nags.heartbeatCard), 0);
  const thinks = cases.reduce((n, c) => n + c.thinks, 0);
  const sum = (f: (m: Meter) => number) => cases.reduce((n, c) => n + f(c.meter), 0);
  // Over-nag opportunities: every case gets the steady and Later checks; quiet cases add the first look and the heartbeat.
  const chances = cases.length * 2 + quiet.length * 2;
  return {
    mode, model, at: new Date().toISOString(), cases,
    summary: {
      cases: cases.length,
      hitRate: rate(cases.filter(c => c.hit).length, cases.length),
      exactRate: rate(cases.filter(c => c.exact).length, cases.length),
      signalRate: rate(named.filter(c => c.signalHit).length, named.length),
      playRate: rate(plays.filter(c => c.playHit).length, plays.length),
      wordingRate: rate(worded.filter(c => c.wordingHit).length, worded.length),
      quietCases: quiet.length, quietRight: quiet.filter(c => !c.nags.quietCard && !c.nags.heartbeatCard).length,
      overNags, overNagRate: rate(overNags, chances),
      thinks, calls: sum(m => m.calls), fallbacks: cases.filter(c => c.fellBack && !/No model configured/.test(c.fellBack)).length,
      usdPerDecision: rate(sum(m => m.nanoUsd), thinks) / NANO_USD,
      tokensPerDecision: rate(sum(m => m.input + m.output), thinks),
      msPerDecision: rate(sum(m => m.ms), thinks),
      usdTotal: sum(m => m.nanoUsd) / NANO_USD,
    },
  };
}

/** A case is ready once every kind it uses is in the contract; until then it waits on `needs`. */
export const ready = (c: EvalCase): boolean => c.signals(T0).every(s => SIGNAL_KINDS[s.source].includes(s.kind)) && (!c.goals || !!tiltByGoals);

/** Runs every case (or the ones named) through one mode. `think` undefined = the rule fallback alone. */
export async function evaluate(opts: { mode: string; model: string; think?: Think; only?: string[]; priceAs?: string }): Promise<Report> {
  const results: CaseResult[] = [];
  let meter = zero();
  const restore = meterFetch(() => meter, opts.priceAs);
  try {
    for (const c of CASES.filter(c => (!opts.only?.length || opts.only.includes(c.id)) && ready(c))) {
      meter = zero();
      results.push(await runCase(c, opts.think, meter));
    }
  } finally { restore(); }
  return summarize(opts.mode, opts.model, results);
}

export const sparkThink = (env: SparkEnv): Think => brief => modelDiagnose(env, brief, { repo: "acme/shop" });

// ---------- printing ----------

const pct = (x: number) => `${Math.round(x * 100)}%`;
const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);

export function render(r: Report): string {
  const s = r.summary;
  const waiting = CASES.filter(c => !ready(c)).map(c => `${c.id} (${c.needs ?? "?"})`);
  const lines = [`Bottleneck brain eval: ${r.mode} (${r.model}), ${s.cases} cases${waiting.length ? `; waiting on new kinds: ${waiting.join(", ")}` : ""}`, "", `${pad("case", 24)} ${pad("expected", 9)} ${pad("got", 9)} ${pad("grade", 6)} ${pad("nag", 10)} card`];
  for (const c of r.cases) {
    const grade = c.exact ? "HIT" : c.hit ? "ok" : "MISS";
    const nag = [c.nags.quietCard && "card", c.nags.flip && "flip", c.nags.renag && "renag", c.nags.heartbeatCard && "beat"].filter(Boolean).join(",") || "-";
    lines.push(`${pad(c.id, 24)} ${pad(c.expected.area ?? "quiet", 9)} ${pad(c.got.area ?? "quiet", 9)} ${pad(grade, 6)} ${pad(nag, 10)} ${c.got.text.slice(0, 90)}${c.fellBack && !/No model/.test(c.fellBack) ? ` [fell back: ${c.fellBack.slice(0, 60)}]` : ""}`);
  }
  lines.push("",
    `Hit rate ${pct(s.hitRate)} (exact area ${pct(s.exactRate)}, main signal ${pct(s.signalRate)}, unlock play ${pct(s.playRate)}, card wording ${pct(s.wordingRate)})`,
    `Quiet when nothing's wrong: ${s.quietRight}/${s.quietCases}. Over-nags: ${s.overNags} (${pct(s.overNagRate)} of chances)`,
    `Decisions ${s.thinks}, model calls ${s.calls}, fallbacks ${s.fallbacks}. Per decision: $${s.usdPerDecision.toFixed(5)}, ${Math.round(s.tokensPerDecision)} tokens, ${Math.round(s.msPerDecision)} ms. Total $${s.usdTotal.toFixed(4)}`);
  return lines.join("\n");
}

/** One line per mode, so two models read side by side. */
export function compare(reports: Report[]): string {
  const head = `${pad("model", 22)} ${pad("hit", 5)} ${pad("signal", 7)} ${pad("move", 5)} ${pad("words", 6)} ${pad("quiet", 6)} ${pad("nags", 5)} ${pad("fallbk", 7)} ${pad("$/decision", 11)} ${pad("ms/dec", 7)} $total`;
  const rows = reports.map(r => { const s = r.summary; return `${pad(r.model, 22)} ${pad(pct(s.hitRate), 5)} ${pad(pct(s.signalRate), 7)} ${pad(pct(s.playRate), 5)} ${pad(pct(s.wordingRate), 6)} ${pad(`${s.quietRight}/${s.quietCases}`, 6)} ${pad(String(s.overNags), 5)} ${pad(String(s.fallbacks), 7)} ${pad(`$${s.usdPerDecision.toFixed(5)}`, 11)} ${pad(String(Math.round(s.msPerDecision)), 7)} $${s.usdTotal.toFixed(4)}`; });
  return ["Side by side", head, ...rows].join("\n");
}
