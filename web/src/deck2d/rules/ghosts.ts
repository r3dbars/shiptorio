// Pure source-mine placement shared by the renderer and simulator.
import type { FactoryState, Machine } from "@shiptorio/shared";

export type OreKind = "sentry" | "inbox" | "posthog" | "issues";

export function oreKind(m: Machine): OreKind {
  if (m.id.includes("sentry")) return "sentry";
  if (m.id.includes("inbox")) return "inbox";
  if (m.id.includes("posthog")) return "posthog";
  return "issues";
}

// Sources you haven't connected yet sit on the island as empty mines (docs/PRODUCT.md, Onboarding): a dim
// deposit with a "tap to connect" label, picked as "src:<kind>". Connecting one replaces it with the real deposit.
// The support mine ("email": support inbox + Intercom) waits for the first rocket: once something has shipped,
// the next question is who to tell (docs/VISION.md principle 9).
export const GHOST_SOURCES = ["sentry", "posthog", "email"] as const;
export type GhostSource = (typeof GHOST_SOURCES)[number];
const GHOST_TRY: Record<GhostSource, [number, number][]> = {
  sentry: [[0, -3], [0, -6], [-3, -3]],
  posthog: [[-3, 0], [0, 6], [-3, 3]],
  email: [[0, 6], [0, 9], [-3, 6]],
};
const GHOST_ORE: Record<GhostSource, OreKind> = { sentry: "sentry", posthog: "posthog", email: "inbox" };

export function ghostSpots(state: FactoryState): { kind: GhostSource; x: number; y: number }[] {
  const ore = state.machines.find((m) => m.type === "ore_deposit" && oreKind(m) === "issues");
  if (!ore) return [];
  const taken = state.machines.map((m) => [m.x, m.y]);
  const out: { kind: GhostSource; x: number; y: number }[] = [];
  for (const kind of GHOST_SOURCES) {
    if (kind === "email" && !(state.metrics?.rockets ?? 0)) continue;
    const live = state.machines.some((m) => m.type === "ore_deposit" && oreKind(m) === GHOST_ORE[kind]) || state.sources?.some((x) => (x.kind as string) === kind && x.state === "connected");
    if (live) continue;
    const spot = GHOST_TRY[kind].map(([dx, dy]) => [ore.x + dx, ore.y + dy]).find(([x, y]) => !taken.some(([tx, ty]) => Math.abs(tx - x) < 2 && Math.abs(ty - y) < 2));
    if (!spot) continue;
    taken.push(spot);
    out.push({ kind, x: spot[0], y: spot[1] });
  }
  return out;
}

