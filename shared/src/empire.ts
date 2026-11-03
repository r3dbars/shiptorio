// The empire: every repo a player connects is its own island. The main island is the one you're
// playing; the rest float nearby as satellites. One small summary per island feeds the empire
// overview (rollups, the worst bottleneck across islands) and the satellites on the map.

import { z } from "zod";
import { Stage } from "./model";

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

// The island maths lives in islands.ts, free of zod, so the web bundle can use it without the schemas.
export { emptyIsland, rollup, stuckScore, summarizeIsland, type EmpireRollup } from "./islands";
