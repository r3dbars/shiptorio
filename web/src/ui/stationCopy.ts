// Panel copy for every clickable thing on the line, lifted from docs/loop.html (the S object).
// The numbers come from the factory state; this is only the words.

import type { StationKind } from "@shiptorio/shared";

export interface PanelCopy {
  zone: string;
  name: string;
  tag: [color: "green" | "amber" | "blue" | "red" | "steel", text: string];
  what: string;
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
    what: "Checks don't stop at merge. For 24 hours after a deploy, orbit watch checks the real world: Sentry quiet, checkouts back up, the customer answered. If the bug comes back, the ore reopens and that district loses trust.",
  },
  custom: {
    zone: "3 · Gauntlet",
    name: "Custom check",
    tag: ["steel", "researched"],
    what: "A check you added with research. It runs on every PR in the districts that need it.",
  },
};

export const REWORK_COPY: PanelCopy = {
  zone: "The loop back",
  name: "Rework belt",
  tag: ["red", "fails go back"],
  what: "Anything that fails a station rides back to Spark, not straight to the builder. It carries a scar tag: what failed and the evidence. Spark re-plans with that. Third strike, it comes to you. Same scar showing up again and again means a check should move up a layer.",
};

export const POWER_COPY: PanelCopy = {
  zone: "Power · AI compute",
  name: "Power plants",
  tag: ["green", "your sign-ins"],
  what: "Your Claude and ChatGPT sign-ins are power plants, and the meter is your real usage left this week. Every station spends power, so more checks cost more. Spark spends heavy checks where mistakes are expensive and keeps docs cheap. Spark's own thinking runs on its steam plant.",
};
