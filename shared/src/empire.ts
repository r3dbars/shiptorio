// The empire: every repo a player connects is its own island. The main island is the one you're
// playing; the rest float nearby as satellites. One small summary per island feeds the empire
// overview (rollups, the worst bottleneck across islands) and the satellites on the map.

import { z } from "zod";
import { Stage, type FactoryState } from "./model";

export const IslandSummary = z.object({
  repo: z.string(),
  ready: z.boolean(), // a factory exists for this repo (false: connected, never opened)
  rockets: z.number().int().nonnegative(), // PRs merged
  launches: z.number().int().nonnegative(), // rockets counted toward automated
  automated: z.number().min(0).max(1), // share of those that launched on a permit
  waiting: z.number().int().nonnegative(), // cards waiting on the player
  inFlight: z.number().int().nonnegative(), // items between ore and launched
  bottleneck: z
    .object({ stage: Stage, summary: z.string(), wip: z.number().int(), ageMs: z.number() })
    .nullable(),
  districts: z.array(z.object({ name: z.string(), files: z.number().int() })).max(12),
  permits: z.array(z.string()), // districts that ship on their own
  research: z.array(z.string()), // researched tech ids
  updatedAt: z.number(),
});
export type IslandSummary = z.infer<typeof IslandSummary>;

export const Empire = z.object({ islands: z.array(IslandSummary).max(24) });
export type Empire = z.infer<typeof Empire>;

export function summarizeIsland(s: FactoryState, now = Date.now()): IslandSummary {
  const launched = s.items.filter((i) => i.state === "launched").length;
  const b = s.bottleneck;
  return {
    repo: s.repo,
    ready: true,
    rockets: s.metrics?.rockets ?? launched,
    launches: s.autonomy?.launches ?? 0,
    automated: s.autonomy?.automated ?? 0,
    waiting: s.deck?.length ?? (s.move ? 1 : 0),
    inFlight: s.items.filter((i) => i.state !== "launched").length,
    bottleneck: b ? { stage: b.stage, summary: b.summary, wip: b.wip, ageMs: b.ageMs } : null,
    districts: [...s.districts].sort((x, y) => y.files - x.files).slice(0, 12).map((d) => ({ name: d.name, files: d.files })),
    permits: s.autonomy?.districts.filter((d) => d.permit).map((d) => d.district) ?? [],
    research: s.research?.done ?? [],
    updatedAt: now,
  };
}

// A repo the player connected but never opened: an island with nothing on it yet.
export const emptyIsland = (repo: string, now = Date.now()): IslandSummary => ({
  repo, ready: false, rockets: 0, launches: 0, automated: 0, waiting: 0, inFlight: 0,
  bottleneck: null, districts: [], permits: [], research: [], updatedAt: now,
});

// How badly an island is stuck: work piled up times how long it's waited. Cards on you count
// extra, since the player is the bottleneck Shiptorio cares about most.
export const stuckScore = (i: IslandSummary) =>
  (i.bottleneck ? i.bottleneck.wip * Math.max(1, i.bottleneck.ageMs / 60_000) : 0) + i.waiting * 30;

export interface EmpireRollup {
  islands: number;
  rockets: number;
  launches: number;
  automated: number; // weighted by launches, so a busy island counts more than a quiet one
  waiting: number;
  worst: IslandSummary | null; // the island most stuck right now
  research: string[]; // every tech researched on any island
}

export function rollup(list: IslandSummary[]): EmpireRollup {
  const launches = list.reduce((n, i) => n + i.launches, 0);
  const auto = list.reduce((n, i) => n + i.automated * i.launches, 0);
  const stuck = list.filter((i) => stuckScore(i) > 0).sort((a, b) => stuckScore(b) - stuckScore(a));
  return {
    islands: list.length,
    rockets: list.reduce((n, i) => n + i.rockets, 0),
    launches,
    automated: launches ? auto / launches : 0,
    waiting: list.reduce((n, i) => n + i.waiting, 0),
    worst: stuck[0] ?? null,
    research: [...new Set(list.flatMap((i) => i.research))],
  };
}
