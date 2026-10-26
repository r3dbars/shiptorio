// Draft pricing (docs/context/pricing.md). Not live: the beta is free and Stripe is on hold. One source of truth
// for the plan numbers (the landing page's hidden #pricing block mirrors them, shown with ?pricing=1) and the
// unit-cost math behind them.
//
// What we pay for is the brain. Building runs on the player's own Claude / Codex sign-ins, so a launch costs us
// only the Spark calls that sort, plan, review and judge it, plus a little Cloudflare time.

export interface Plan {
  id: "free" | "solo" | "crew";
  name: string; // the plan card title
  price: number; // USD a month, flat
  who: string; // one line: who it's for
  launches: number; // rockets a month with Spark fuel included
  repos: number; // islands
  players: number;
  perks: string[];
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Outpost",
    price: 0,
    who: "Try it on one repo",
    launches: 20,
    repos: 1,
    players: 1,
    perks: ["GitHub mine", "Full gauntlet and research tree", "Autonomy earned by playing, never bought"],
  },
  {
    id: "solo",
    name: "Factory",
    price: 19,
    who: "Solo founders shipping every day",
    launches: 150,
    repos: 3,
    players: 1,
    perks: ["Sentry and PostHog mines", "Launch permits and lights out", "Bring your own Meta key for unlimited fuel"],
  },
  {
    id: "crew",
    name: "Crew",
    price: 59,
    who: "Tiny teams, up to 5 players",
    launches: 400,
    repos: 10,
    players: 5,
    perks: ["Everything in Factory", "Shared check-in deck and fuel pool", "Bring your own Meta key for unlimited fuel"],
  },
];

/** Extra fuel when a plan runs dry. Out of fuel never stops the factory: fixed rules (or your own key) take over. */
export const FUEL_PACK = { launches: 25, price: 5 };

// Muse Spark 1.3 list price, USD per million tokens (third-party reports, Sep 2026; verify against Meta's page).
export const SPARK_PRICE = { input: 1.25, output: 4.25 };

/** Estimated Spark tokens one shipped item burns, call by call (server/src/spark.ts, gauntlet.ts, factory.ts). */
export const SPARK_CALLS: { call: string; per: number; input: number; output: number }[] = [
  { call: "triage", per: 1, input: 1500, output: 600 },
  { call: "plan (≈3.5 of 5 turns)", per: 1, input: 21000, output: 4500 },
  { call: "AI review", per: 1, input: 8000, output: 1500 },
  { call: "deck ranking", per: 4, input: 4000, output: 800 },
  { call: "orbit verdict", per: 0.5, input: 2000, output: 500 },
  { call: "re-plan + re-review on rework (30%)", per: 0.3, input: 29000, output: 6000 },
  { call: "research + permit picks", per: 0.2, input: 3000, output: 600 },
];

export function sparkCostPerLaunch(calls = SPARK_CALLS, price = SPARK_PRICE): number {
  return calls.reduce((sum, c) => sum + c.per * (c.input * price.input + c.output * price.output) / 1e6, 0);
}

/** Cloudflare cost of one active factory a month: a Durable Object ticking every 2s for ~2h a day, after the $5 base. */
export const INFRA_PER_FACTORY = 0.4;

/** Worst-case gross margin when a plan burns its whole fuel allowance. */
export function planMargin(plan: Plan, perLaunch = sparkCostPerLaunch()): number {
  const cost = plan.launches * perLaunch + INFRA_PER_FACTORY * plan.repos;
  return plan.price ? (plan.price - cost) / plan.price : -cost;
}
