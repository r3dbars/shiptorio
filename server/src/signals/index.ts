// The collector registry (docs/BRAIN.md step 1). Each source thread adds its collector to COLLECTORS with one
// import line. collect() reads only the collectors that are due (everyMs), keeps the rest from the last read,
// and never lets one broken source stop the others: a throw is logged and that source's old signals stand
// until they go stale on their own. Collectors never call a model.

import type { Bottleneck, BrainSignal, FactoryState, SignalCollector, SignalSource } from "@shiptorio/shared";
import { signalId } from "@shiptorio/shared";
import type { StageMetrics } from "../bottleneck";
import type { FactoryEnv } from "../factory";
import type { postHogCreds } from "../sources/creds";
import { ciCollector, kvCiCache } from "./ci";

/** What every collector gets. Read-only: collectors look, they never change the factory. */
export interface SignalContext {
  state: FactoryState;
  repo?: string;
  env: FactoryEnv;
  /** This tick's queue-jam read (server/src/bottleneck.ts), so the factory collector doesn't recompute it. */
  jam: { bottleneck: Bottleneck | null; stages: StageMetrics[] };
  /** Read-only view of the factory's own storage (e.g. the Sentry pulse log). */
  storage: { get<T>(key: string): Promise<T | undefined> };
  /** The linked PostHog credentials ({} when not linked). Factory-private, so it's a thunk. */
  posthogCreds?: () => ReturnType<typeof postHogCreds>;
  /** A GitHub installation token for the repo, when the factory has one. Memoized: call it freely. */
  githubToken?: () => Promise<string>;
}
export type Collector = SignalCollector<SignalContext>;

/**
 * Wraps a collector that wants its own context shape: `bind(feedbackCollector, c => ({ repo: c.repo, ... }))`.
 * The mapping runs only when the collector is due, so building its context (a token, a fetch) costs nothing otherwise.
 */
export function bind<C>(collector: SignalCollector<C>, toCtx: (ctx: SignalContext) => C | Promise<C>): Collector {
  return { source: collector.source, everyMs: collector.everyMs, read: async (ctx, now) => collector.read(await toCtx(ctx), now) };
}

const minutes = (ms: number) => ms < 3_600_000 ? `${Math.max(1, Math.round(ms / 60_000))} min` : `${Math.round(ms / 3_600_000)} h`;
const clamp = (n: number) => Math.min(1, Math.max(0, n));

/** factory:* from the queue-jam engine. Runs every tick: it's free, and it's the signal the player can see move. */
export const factoryCollector: Collector = {
  source: "factory",
  everyMs: 0,
  async read(ctx, now) {
    const { bottleneck: jam } = ctx.jam;
    const fresh = { observedAt: now, freshUntil: now + 15 * 60_000, confidence: 1 };
    const out: BrainSignal[] = [];
    if (jam?.stage === "resources") {
      out.push({ ...fresh, id: signalId("factory", "no_agent"), source: "factory", kind: "no_agent", severity: 0.9, title: `${jam.wip} ${jam.wip === 1 ? "change is" : "changes are"} waiting for an agent to build ${jam.wip === 1 ? "it" : "them"}.`, metric: { value: jam.wip, unit: "items" }, evidence: [{ label: jam.summary.slice(0, 120) }] });
    } else if (jam?.stage === "power") {
      out.push({ ...fresh, id: signalId("factory", "no_power"), source: "factory", kind: "no_power", severity: 0.8, title: `Your agents are out of power with ${jam.wip} ${jam.wip === 1 ? "change" : "changes"} waiting.`, metric: { value: jam.wip, unit: "items" }, evidence: [{ label: jam.summary.slice(0, 120) }] });
    } else if (jam && jam.stage !== "pad") { // PRs waiting on the player to launch are repo:approve_queue's
      // A fresh pile is normal flow; a pile that sits for hours is the jam. Value at risk tips it.
      const hours = jam.ageMs / 3_600_000;
      const severity = clamp(0.15 + 0.12 * Math.min(jam.wip, 5) + 0.12 * Math.min(hours, 4) + 0.02 * Math.min(jam.valueAtRisk, 10));
      out.push({ ...fresh, id: signalId("factory", "queue_jam", jam.stationId ?? jam.stage), source: "factory", kind: "queue_jam", scope: jam.stationId ?? jam.stage, severity, title: `${jam.wip} ${jam.wip === 1 ? "item has" : "items have"} waited ${minutes(jam.ageMs)} at ${jam.stage}.`, metric: { value: jam.ageMs / 60_000, unit: "min" }, evidence: [{ label: jam.summary.slice(0, 120) }] });
    }
    const bouncing = ctx.state.items.filter(i => i.state !== "launched" && (i.scars?.length ?? 0) >= 2);
    if (bouncing.length) {
      const worst = [...bouncing].sort((a, b) => (b.scars?.length ?? 0) - (a.scars?.length ?? 0))[0];
      out.push({ ...fresh, id: signalId("factory", "rework_loop"), source: "factory", kind: "rework_loop", severity: clamp(0.3 + 0.1 * bouncing.length + 0.05 * (worst.scars?.length ?? 0)), title: `${bouncing.length} ${bouncing.length === 1 ? "change keeps" : "changes keep"} getting sent back by the checks.`, metric: { value: bouncing.length, unit: "items" }, evidence: bouncing.slice(0, 5).map(i => ({ label: `${i.title.slice(0, 80)}: sent back ${i.scars?.length} times` })) });
    }
    return out;
  },
};

/** Every source's collector. Source threads: add yours here (one import, one entry). */
export const COLLECTORS: Collector[] = [
  factoryCollector,
  bind(ciCollector, async c => ({ repo: c.repo ?? c.state.repo, defaultBranch: c.state.baseBranch, token: c.githubToken ? await c.githubToken() : undefined, cache: kvCiCache(c.env.CACHE) })),
];

export interface SignalCache { readAt: Partial<Record<SignalSource, number>>; signals: BrainSignal[] }
export const emptyCache = (): SignalCache => ({ readAt: {}, signals: [] });

/**
 * Reads every due collector and merges with what the others said last time. Stale signals drop out here
 * so the cache can't grow. Returns the new cache; `errors` names sources whose read threw this time.
 */
export async function collect(ctx: SignalContext, cache: SignalCache, now: number, collectors: readonly Collector[] = COLLECTORS): Promise<{ cache: SignalCache; errors: { source: SignalSource; error: string }[] }> {
  const due = collectors.filter(c => now - (cache.readAt[c.source] ?? -Infinity) >= c.everyMs);
  const errors: { source: SignalSource; error: string }[] = [];
  const reads = await Promise.all(due.map(async c => {
    try { return { c, signals: (await c.read(ctx, now)).filter(s => s.source === c.source) }; }
    catch (e) { errors.push({ source: c.source, error: e instanceof Error ? e.message : String(e) }); return null; }
  }));
  const fresh = reads.filter(r => r !== null);
  const replaced = new Set(fresh.map(r => r.c.source));
  const readAt = { ...cache.readAt };
  for (const r of fresh) readAt[r.c.source] = now;
  // A source that read cleanly replaces all its old signals, so a fixed problem disappears instead of lingering.
  const signals = [...cache.signals.filter(s => !replaced.has(s.source)), ...fresh.flatMap(r => r.signals)].filter(s => now < s.freshUntil);
  return { cache: { readAt, signals }, errors };
}
