// Panel copy for every clickable thing on the line, lifted from docs/loop.html (the S object).
// The numbers come from the factory state; this is only the words.

import { techOfStation, type Machine, type StationKind } from "@shiptorio/shared";

export interface PanelCopy {
  zone: string;
  name: string;
  tag: [color: "green" | "amber" | "blue" | "red" | "steel", text: string];
  what: string;
  actions?: { id: string; label: string; recommended: boolean }[]; // for panels with no Station behind them
}

export const STATION_COPY: Record<StationKind, PanelCopy> = {
  ci: {
    zone: "3 · Gauntlet · station 1",
    name: "CI inspector",
    tag: ["green", "cheap + fast"],
    what: "The first and cheapest check: lint, types, unit tests. It catches the boring breaks fast, so nothing expensive runs on broken code.",
  },
  verify: {
    zone: "3 · Gauntlet · station 2",
    name: "Verify bay",
    tag: ["amber", "done means evidence"],
    what: "The real check. Run the bug against the real app, before and after. Before: the crash happens. After: it's gone. The PR carries the receipts: the failing test that turns green, a log or screenshot from the running app.",
  },
  review: {
    zone: "3 · Gauntlet · station 3",
    name: "AI review",
    tag: ["blue", "second opinion"],
    what: "A different model than the one that wrote it tries to break it. Claude built it, so Codex reviews (or the reverse). It looks for what tests miss: the wrong approach, swallowed errors, security holes, scope creep.",
  },
  merge: {
    zone: "3 · Gauntlet · station 4",
    name: "Merge gate",
    tag: ["amber", "you"],
    what: "You. Every PR that gets here has passed every station, and the card shows the receipts: CI, verify, review. Merge and the rocket launches. Districts earn launch permits over time, so routine PRs can launch on their own.",
  },
  orbit: {
    zone: "4 · Shipped · after the merge",
    name: "Orbit watch",
    tag: ["green", "real world"],
    what: "Checks don't stop at merge. For 24 hours after a launch, orbit watch checks the real world: Sentry stays quiet, nobody reverts it, main stays green. If the bug comes back, it rides the rework belt with an orbit scar and that lane loses its launch permit.",
  },
  measure: {
    zone: "5 · Growth · after the launch",
    name: "Measure station",
    tag: ["green", "did it work?"],
    what: "Shipping a growth change isn't the end. For a week after the launch, the measure station watches the same PostHog funnel step that dropped and compares it to the week before. Enough people and a clear jump: lift. A clear drop: it hurt, roll it back. Otherwise: no lift, try the next idea.",
  },
  custom: {
    zone: "3 · Gauntlet",
    name: "Custom check",
    tag: ["steel", "researched"],
    what: "A check you added with research. It runs on every PR in the districts that need it.",
  },
};

/** A researched check's panel: what it does and a real example of what it stops (shared/src/research.ts). */
export function researchedCopy(stationId: string): PanelCopy {
  const t = techOfStation(stationId);
  if (!t) return STATION_COPY.custom;
  return { zone: "3 · Gauntlet · researched", name: t.name, tag: ["blue", "runs after CI"], what: `${t.what} Catches ${t.catches}.` };
}

export const REWORK_COPY: PanelCopy = {
  zone: "The loop back",
  name: "Rework belt",
  tag: ["red", "fails go back"],
  what: "Anything that fails a station rides back to the planner, not straight to the builder. It carries a scar tag: what failed and the evidence. The plan gets redone with that. Third strike, it comes to you. Same scar showing up again and again means a check should move up a layer.",
  actions: [
    { id: "turret", label: "Add a test turret on the top scar's district", recommended: true },
    { id: "scars", label: "See all scar tags", recommended: false },
    { id: "me", label: "Send the oldest to me now", recommended: false },
  ],
};

export const POWER_COPY: PanelCopy = {
  zone: "Power · AI compute",
  name: "Power plants",
  tag: ["green", "your sign-ins"],
  what: "Your Claude and ChatGPT sign-ins are power plants, and the meter is your real usage left this week. Every station spends power, so more checks cost more. Heavy checks go where mistakes are expensive and docs stay cheap. The planner runs on its own steam plant.",
  actions: [
    { id: "sign-in", label: "Sign in with another plan", recommended: false },
    { id: "hold", label: "Hold low-value items", recommended: false },
    { id: "balance", label: "Balance power for me", recommended: true },
  ],
};

// Every other machine on the map opens a detail panel too (Justin's playtest: click anything, see what it's doing).
export const MACHINE_COPY: Partial<Record<Machine["type"], PanelCopy>> = {
  ore_deposit: {
    zone: "1 · Ore · signals in",
    name: "Ore mine",
    tag: ["amber", "signals in"],
    what: "Every source is a mine: GitHub issues, Sentry errors, customer email. Duplicates merge into one weighted chunk, so 40 crash reports about one bug ride the belt as one chunk weighing 40.",
    actions: [{ id: "connect", label: "Connect another source", recommended: true }],
  },
  splitter: {
    zone: "Brain · planner",
    name: "Planner",
    tag: ["blue", "reads, plans, routes"],
    what: "Reads each chunk, restates the problem in plain words, scores who it hurts, picks a machine and writes the plan. It never writes code. It runs on the steam plant.",
    actions: [{ id: "replan", label: "Re-plan the queue by value", recommended: true }],
  },
  assembler: {
    zone: "2 · Build",
    name: "Assembler",
    tag: ["amber", "your subscription"],
    what: "Your Claude Code or Codex, running on your own subscription, builds what the planner planned and opens a PR. It has to attach evidence, not just say done.",
    actions: [
      { id: "upgrade", label: "Upgrade to MK2 (more parallel jobs)", recommended: true },
      { id: "pause", label: "Pause this assembler", recommended: false },
    ],
  },
  launch_pad: {
    zone: "4 · Shipped",
    name: "Launch pad",
    tag: ["green", "merge = launch"],
    what: "Every merge is a launch. Countdown, vapor, liftoff, then it deploys and real numbers move: errors gone, customers answered, checkouts back.",
  },
  turret: {
    zone: "Defense",
    name: "Test turret",
    tag: ["red", "guards a district"],
    what: "Tests guarding one district. It fires while Sentry errors are attacking that district, and every PR into the district has to get past it.",
  },
};

export const POWER_TYPES: Machine["type"][] = ["steam", "solar", "battery", "geothermal"];

// The label for an action id on any panel, so the floor log can say what was asked for.
export function actionLabel(action: string): string | undefined {
  const all = [REWORK_COPY, POWER_COPY, ...Object.values(MACHINE_COPY)].flatMap((c) => c?.actions ?? []);
  return all.find((a) => a.id === action)?.label;
}
