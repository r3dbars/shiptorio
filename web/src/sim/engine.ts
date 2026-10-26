// A fake factory that speaks the same protocol as the server, so the UI never waits on
// the backend. Scenarios are scripted and double as demo replays.
//
// The sim also plays Spark the Foreman (docs/PRODUCT.md): it logs tool calls in Spark's
// voice, asks before building (autonomy starts at Advisor), puts the bottleneck on the
// Next Move card, and keeps the HUD metrics. Spark never writes code; the assemblers do.

import { ghostSpots } from "../map/ghosts";
import { actionLabel } from "../ui/stationCopy";
import {
  SCIENCE_FOR,
  checkStationId,
  insertCheck,
  researchBlocked,
  researchedChecks,
  suggestResearch,
  techById,
  type Autonomy,
  type Belt,
  type Bottleneck,
  type District,
  type FactoryState,
  type Harness,
  type Item,
  type ItemKind,
  type Machine,
  type Metrics,
  type Move,
  type OreSource,
  type Patch,
  type PowerSource,
  type ServerToWeb,
  type Stage,
  type Station,
  type StationKind,
  type ThoughtDecision,
  type WebToServer,
} from "@shiptorio/shared";
import type { Listener, Source, StatusListener } from "../source";

const TICK_MS = 900;

interface SparkLine {
  tool: string;
  text: string;
  reason?: string;
}

interface Ore {
  at: number; // tick it arrives
  title: string;
  kind: ItemKind;
  district: string;
  source?: OreSource;
  failFirst?: string; // a gauntlet station rejects the first attempt with this
  failAt?: StationKind; // which station catches it (default: the CI inspector)
  failCheck?: string; // a researched check that catches it first, once the player has it (shared/src/research.ts)
  users?: number; // usersAffected, from Sentry
  reporter?: string; // who reported it (email sender, issue author)
  linkTo?: string; // title of an earlier ore this is the same problem as; merges into it
  ask?: string; // Spark asks before building it; this is the card's question
  spark?: SparkLine[]; // what Spark logs when it reads this ore
  comeback?: string; // orbit watch catches it after the first launch: "Sentry fired it again"
}

interface Scenario {
  ores: Ore[];
  districts?: District[];
  harness?: Harness; // who builds; the player's subscription
  unplugged?: boolean; // first run: no subscription yet, so the assembler sits dark until you sign in
  checkin?: boolean; // deal a full check-in deck on start (docs/PRODUCT.md "Check-in")
  onboard?: boolean; // first run from the start: Spark scans the repo, then proposes the starter factory
  intro?: boolean; // the welcome tour (ui/IntroTour.tsx): fast and quiet, and the tour cues each beat
  permits?: string[]; // lanes that start with a launch permit
  science?: FactoryState["science"]; // packs already shipped, so the research tree has something to spend
  rockets?: number; // PRs already shipped
}

const REPO_DISTRICTS: District[] = [
  { name: "web", x: 0, y: 0, w: 7, h: 6, files: 40 },
  { name: "server", x: 9, y: 0, w: 6, h: 5, files: 30 },
  { name: "shared", x: 17, y: 0, w: 3, h: 3, files: 8 },
  { name: "docs", x: 22, y: 0, w: 3, h: 2, files: 5 },
  { name: "/", x: 27, y: 0, w: 3, h: 3, files: 9 },
];

const SHOP_DISTRICTS: District[] = [
  { name: "checkout", x: 0, y: 0, w: 6, h: 5, files: 34 },
  { name: "cart", x: 8, y: 0, w: 5, h: 4, files: 21 },
  { name: "api", x: 15, y: 0, w: 5, h: 4, files: 26 },
  { name: "docs", x: 22, y: 0, w: 3, h: 2, files: 6 },
];

export const SCENARIOS = {
  "quiet-morning": {
    ores: [
      { at: 2, title: "Checkout button spins forever on Safari", kind: "bug", district: "web" },
      { at: 6, title: "Add dark mode toggle", kind: "feature", district: "web", failAt: "review", failFirst: "swallows the theme load error instead of handling it" },
      { at: 11, title: "Missing tests for webhook signatures", kind: "tests", district: "server" },
      { at: 16, title: "Remove dead map cache code", kind: "cleanup", district: "server" },
    ],
  },
  "rework-loop": {
    ores: [
      { at: 2, title: "Retry sync when the app comes back online", kind: "bug", district: "server", failFirst: "vitest: 2 failing (sync.test.ts)" },
      { at: 8, title: "Show PR status on the launch pad", kind: "feature", district: "web" },
    ],
  },
  // The research loop (docs/LOOP.md "Players add checks"): AI review keeps catching the same leftover
  // console.log, the planner suggests the Leftover sweeper, and once it's researched the sweeper catches
  // the next one right after CI, before anything expensive runs.
  research: {
    science: { red: 3, green: 2, grey: 1, blue: 0 },
    rockets: 6,
    ores: [
      { at: 2, title: "Cart badge shows the wrong count", kind: "bug", district: "web", failAt: "review", failFirst: "left a console.log of the whole cart in the badge component" },
      { at: 5, title: "Retry webhook delivery on 502", kind: "bug", district: "server", failAt: "review", failFirst: "stray console.log of the webhook payload, that's customer data in the logs" },
      { at: 26, title: "Sort orders by newest first", kind: "feature", district: "server", failAt: "review", failCheck: "leftovers", failFirst: "console.log(orders) left in the orders handler" },
      { at: 34, title: "Fix typo on the pricing page", kind: "cleanup", district: "docs" },
    ],
  },
  // The heal cascade from docs/PRODUCT.md, beat for beat. Also the demo's backup replay.
  heal: {
    districts: SHOP_DISTRICTS,
    harness: "claude_code",
    ores: [
      {
        at: 2,
        title: "TypeError: cart.total is undefined",
        kind: "bug",
        district: "checkout",
        source: "sentry",
        users: 112,
        failAt: "verify",
        failFirst: "passed CI, but the crash still happens with an empty cart (repro attached)",
        ask: "Send it to your Claude Code assembler with the plan: guard cart.total, add a coupon-on-empty-cart test.",
        spark: [
          { tool: "get_sentry_issue", text: "New error on /checkout: TypeError: cart.total is undefined, 112 users", reason: "Sentry alert" },
          { tool: "triage", text: "Triaged as a bug in checkout, value 112 users", reason: "Every checkout with a coupon fails" },
        ],
      },
      {
        at: 5,
        title: "Email: \"checkout broke, I can't pay\"",
        kind: "bug",
        district: "checkout",
        source: "inbox",
        reporter: "dana@example.com",
        linkTo: "TypeError: cart.total is undefined",
        spark: [{ tool: "get_feedback", text: "Read Dana's email: checkout broke, can't pay", reason: "Feedback inbox" }],
      },
      { at: 24, title: "Fix typo in shipping FAQ", kind: "cleanup", district: "docs" },
    ],
  },
  // Three mines feeding one factory: GitHub issues, Sentry errors (biters) and a PostHog traffic drop.
  // The drop on /checkout is the same problem as the Sentry error, so it folds in.
  mines: {
    districts: SHOP_DISTRICTS,
    harness: "claude_code",
    ores: [
      {
        at: 2,
        title: "TypeError: cart.total is undefined",
        kind: "bug",
        district: "checkout",
        source: "sentry",
        users: 112,
        spark: [{ tool: "get_sentry_issue", text: "New error on /checkout: TypeError: cart.total is undefined, 112 users", reason: "Sentry webhook" }],
      },
      {
        at: 5,
        title: "/checkout traffic dropped 70% yesterday",
        kind: "bug",
        district: "checkout",
        source: "posthog",
        users: 86,
        linkTo: "TypeError: cart.total is undefined",
        spark: [
          { tool: "read_posthog", text: "PostHog: /checkout pageviews 72 yesterday vs 240/day (−70%)", reason: "Traffic poll" },
          { tool: "link_items", text: "Same problem as the cart.total crash: same route, same day", reason: "Route + timing match" },
        ],
      },
      { at: 9, title: "Add order notes to the cart", kind: "feature", district: "cart" },
      {
        at: 14,
        title: "Error spike on /api/orders: 48 exceptions yesterday",
        kind: "bug",
        district: "api",
        source: "posthog",
        users: 31,
        failAt: "verify",
        failFirst: "CI passed, but the orders endpoint still 500s on an empty body (repro attached)",
        spark: [{ tool: "read_posthog", text: "PostHog: $exception on /api/orders 48 yesterday vs 2/day", reason: "Traffic poll" }],
      },
      { at: 20, title: "Fix typo in shipping FAQ", kind: "cleanup", district: "docs" },
    ],
  },
  // Orbit watch (docs/LOOP.md station 5): /checkout has a launch permit, a fix ships, and three hours later Sentry
  // fires the same error again. The fix rides the rework belt with an orbit scar and /checkout loses its permit.
  orbit: {
    districts: SHOP_DISTRICTS,
    harness: "claude_code",
    permits: ["checkout"],
    ores: [
      {
        at: 2,
        title: "TypeError: coupon.code is null",
        kind: "bug",
        district: "checkout",
        source: "sentry",
        users: 64,
        comeback: 'Sentry fired "TypeError: coupon.code is null" again',
        spark: [{ tool: "get_sentry_issue", text: "New error on /checkout: TypeError: coupon.code is null, 64 users", reason: "Sentry alert" }],
      },
      { at: 8, title: "Fix typo in shipping FAQ", kind: "cleanup", district: "docs" },
    ],
  },
  // The swipe check-in from docs/PRODUCT.md: you open the app and a deck is waiting.
  checkin: {
    districts: SHOP_DISTRICTS,
    harness: "claude_code",
    checkin: true,
    ores: [
      {
        at: 2,
        title: "CSV export is empty",
        kind: "bug",
        district: "api",
        ask: "3 customers asked. Found it: the export reads the wrong date column. Build it on Claude Code?",
        spark: [{ tool: "triage", text: "Triaged \"CSV export is empty\" as a bug in /api, 3 customers asked", reason: "issue + 2 emails" }],
      },
      { at: 6, title: "Fix typo in shipping FAQ", kind: "cleanup", district: "docs" },
    ],
  },
  // Onboarding from docs/PRODUCT.md: Spark reads the repo, but nothing builds until you plug in a subscription.
  "first-run": {
    unplugged: true,
    onboard: true,
    ores: [
      {
        at: 2,
        title: "Checkout button spins forever on Safari",
        kind: "bug",
        district: "web",
        ask: "Send it to your new assembler with the plan: await the payment intent before enabling the button.",
        spark: [{ tool: "triage", text: "Triaged as a bug in web: the one worth fixing first", reason: "it blocks checkout on Safari" }],
      },
      { at: 14, title: "Add dark mode toggle", kind: "feature", district: "web" },
    ],
  },
  // The welcome tour after sign-in (ui/IntroTour.tsx). A demo shop, played fast. Nothing asks: the tour's
  // cards cue each beat (station_action "intro"), and the ore keeps coming from INTRO_ORE once the line stands.
  intro: {
    districts: SHOP_DISTRICTS,
    harness: "claude_code",
    onboard: true,
    intro: true,
    ores: [],
  },
} satisfies Record<string, Scenario>;

// The tour's ore, round and round: mostly docs, so a docs permit visibly drains the pile.
const INTRO_ORE: Omit<Ore, "at">[] = [
  { title: "Fix typo in shipping FAQ", kind: "cleanup", district: "docs" },
  { title: "Cart badge shows a stale count", kind: "bug", district: "cart", users: 38 },
  { title: "Document the refund webhook", kind: "cleanup", district: "docs" },
  { title: "Tests for webhook signatures", kind: "tests", district: "api" },
  { title: "Update the README setup steps", kind: "cleanup", district: "docs" },
  { title: "Saved cards at checkout", kind: "feature", district: "checkout", users: 120 },
  { title: "Explain coupon rules in the help center", kind: "cleanup", district: "docs" },
  { title: "Rate limit docs for the API", kind: "cleanup", district: "docs" },
];
const INTRO_CATCH: Omit<Ore, "at"> = {
  title: "Coupon total off by a cent",
  kind: "bug",
  district: "cart",
  users: 64,
  failAt: "verify",
  failFirst: "passed CI, but two coupons still round the total wrong (repro attached)",
};
const INTRO_SENTRY: Omit<Ore, "at">[] = [
  { title: "TypeError: cart.total is undefined", kind: "bug", district: "checkout", source: "sentry", users: 112 },
  { title: "RangeError in the price formatter", kind: "bug", district: "cart", source: "sentry", users: 47 },
  { title: "Timeout on /api/orders", kind: "bug", district: "api", source: "sentry", users: 85 },
];
const INTRO_PILE = 6; // before docs can ship alone, the merge gate holds at most this many

export type ScenarioName = keyof typeof SCENARIOS;

const SOLAR_NAME: Partial<Record<Harness, string>> = { claude_code: "Claude", codex: "ChatGPT" };

// The stations in line order, with the panel actions from docs/loop.html. caught seeds "this week".
interface StationDef {
  id: string;
  kind: StationKind;
  name: string;
  caught: number;
  actions: Station["actions"];
}
// "AI review" stays "AI review", "Verify bay" reads "verify bay" mid-sentence
export const lc = (name: string) => (/^[A-Z]{2}/.test(name) ? name : name[0].toLowerCase() + name.slice(1));
const act = (id: string, label: string, recommended = false) => ({ id, label, recommended });
const GAUNTLET: StationDef[] = [
  { id: "ci-1", kind: "ci", name: "CI inspector", caught: 9, actions: [act("log", "Open the CI log"), act("hint", "Send back with a hint"), act("lint", "Turn this into a lint rule", true)] },
  { id: "verify-1", kind: "verify", name: "Verify bay", caught: 5, actions: [act("second", "Build a second verify bay", true), act("recipe", "Teach a /checkout verify recipe"), act("skip-docs", "Let docs PRs skip verify")] },
  { id: "review-1", kind: "review", name: "AI review", caught: 3, actions: [act("read", "Read the review"), act("overrule", "Overrule it, with a reason"), act("security", "Add a security reviewer", true)] },
  { id: "gate-1", kind: "merge", name: "Merge gate", caught: 0, actions: [act("review", "Review with receipts", true), act("merge", "Merge and launch"), act("permit", "Give docs a launch permit")] },
];
const ORBIT: StationDef = { id: "orbit-1", kind: "orbit", name: "Orbit watch", caught: 0, actions: [act("changed", "See what changed"), act("rollback", "Roll back the last launch")] };
const FOREMAN_IDLE_TICKS = 5; // quiet ticks before the drone goes back to its plant
const WATCH_TICKS = 10; // orbit watch, sim-sized: "24 hours" after a launch
const COMEBACK_TICKS = 4; // a scripted comeback trips orbit watch this long after the launch

function initialState(sc: Scenario): FactoryState {
  // Spark never writes code: without a scenario harness, the player is signed in with Claude
  const harness = sc.harness ?? "claude_code";
  // Spark's steam plant powers the brain. A subscription (solar) powers the assemblers, when there is one.
  const plant = harness === "spark" ? "steam-spark" : `solar-${harness}`;
  const machines: Machine[] = [
    { id: "ore-issues", type: "ore_deposit", x: -6, y: 0, tier: 1, state: "idle" },
    { id: "splitter-1", type: "splitter", x: -3, y: 0, harness: "spark", powerId: "steam-spark", tier: 1, state: "idle" },
    sc.unplugged
      ? { id: "assembler-1", type: "assembler", x: 0, y: 0, tier: 1, state: "blocked" }
      : { id: "assembler-1", type: "assembler", x: 0, y: 0, harness, powerId: plant, tier: 1, state: "idle" },
    // the verification gauntlet (docs/LOOP.md); each station is an inspector-type machine
    ...GAUNTLET.map((g, i): Machine => ({ id: g.id, type: "inspector", x: 3 + i * 3, y: 0, tier: 1, state: "idle" })),
    { id: "launch-pad", type: "launch_pad", x: 15, y: 0, tier: 1, state: "idle" },
    { id: "orbit-1", type: "inspector", x: 15, y: 3, tier: 1, state: "idle" },
    { id: "steam-spark", type: "steam", x: 0, y: 3, tier: 1, state: "idle" },
  ];
  const power: PowerSource[] = [{ id: "steam-spark", kind: "steam", name: "Planner", level: 1, online: true }];
  if (harness !== "spark" && !sc.unplugged) {
    machines.push({ id: plant, type: "solar", x: 3, y: 3, tier: 1, state: "idle" });
    power.push({ id: plant, kind: "solar", name: SOLAR_NAME[harness] ?? harness, level: 0.9, online: true });
  }
  if (sc.ores.some((o) => o.source === "sentry")) machines.push({ id: "ore-sentry", type: "ore_deposit", x: -6, y: -3, tier: 1, state: "idle" });
  if (sc.ores.some((o) => o.source === "inbox")) machines.push({ id: "ore-inbox", type: "ore_deposit", x: -6, y: 3, tier: 1, state: "idle" });
  if (sc.ores.some((o) => o.source === "posthog")) machines.push({ id: "ore-posthog", type: "ore_deposit", x: -6, y: sc.ores.some((o) => o.source === "inbox") ? 6 : 3, tier: 1, state: "idle" });
  const chain = ["ore-issues", "splitter-1", "assembler-1", ...GAUNTLET.map((g) => g.id), "launch-pad"];
  const belts: Belt[] = chain.slice(1).map((to, i) => ({ id: `belt-${i + 1}`, from: chain[i], to }));
  const districts = sc.districts ?? REPO_DISTRICTS;
  const mines = (["sentry", "posthog"] as const).filter((kind) => sc.ores.some((o) => o.source === kind));
  // Onboarding starts on bare rock: Spark's steam plant and the issue deposit. The scan raises the districts
  // and the starter factory is built only when the player says yes.
  const starter = sc.onboard ? machines.filter((m) => m.type === "ore_deposit" || m.type === "steam") : machines;
  return {
    repo: sc.districts ? "sim/demo-shop" : "sim/shiptorio",
    baseBranch: "main",
    districts: sc.onboard ? [] : districts,
    machines: starter,
    belts: sc.onboard ? [] : belts,
    items: [],
    power,
    science: sc.science ?? { red: 0, green: 0, grey: 0, blue: 0 },
    research: { done: [], spent: 0 },
    trust: 0.5,
    tick: 0,
    bottleneck: null,
    move: null,
    metrics: { rockets: sc.rockets ?? 0, bitersKilled: 0, escapedDefects: 0, customersAnswered: 0, usersUnblocked: 0, shipScore: 0, checkouts: sc.districts ? 1240 : undefined },
    autonomy: {
      level: "advisor",
      districts: districts.map((d) => ({ district: d.name, score: sc.permits?.includes(d.name) ? 1 : d.name === "docs" ? 0.7 : 0.3, risk: d.name === "docs" ? "low" : "medium", permit: !!sc.permits?.includes(d.name) })),
      next: { level: "floor", have: sc.onboard ? 0 : 8, need: 10, label: "suggestions approved as-is" },
      ranAlone: 0,
    },
    foreman: { thinking: false },
    brain: { model: "sim", online: true, decisions: 0, fallbacks: 0, thoughts: [] },
    // Mines this scenario's ore comes from show as plugged in, so the map doesn't offer to connect them.
    sources: mines.length ? mines.map((kind) => ({ kind, state: "connected" as const, detail: `${kind === "sentry" ? "Sentry" : "PostHog"} connected (sim)`, eventsToday: 0, setup: { steps: [] } })) : undefined,
    stations: [...GAUNTLET, ORBIT].map((g) => ({ id: g.id, kind: g.kind, name: g.name, machineId: g.id, wip: 0, caughtThisWeek: g.caught, actions: g.actions })),
  };
}

// How many ticks an item spends in each step.
const DWELL: Partial<Record<Item["state"], number>> = { ore: 2, queued: 2, working: 4, inspecting: 3, rejected: 2, on_pad: 4 };

// Where each item state sits in the bottleneck table.
const STAGE_OF: Partial<Record<Item["state"], Stage>> = { ore: "intake", queued: "build", working: "build", inspecting: "inspect", rejected: "inspect", on_pad: "pad", passed: "pad" };

const shipScore = (m: Metrics) => m.usersUnblocked + 10 * m.customersAnswered + m.rockets - 25 * m.escapedDefects;

export function connectSim(name: ScenarioName, onMessage: Listener, onStatus: StatusListener, repo?: string): Source {
  const sc: Scenario = SCENARIOS[name];
  const tickMs = sc.intro ? 450 : TICK_MS;
  const script: Ore[] = [...sc.ores];
  const s = initialState(sc);
  if (repo) s.repo = repo;
  // Ore ticks count from here. Onboarding holds the ore until the starter factory stands.
  let clock0 = sc.onboard ? Infinity : 0;
  let closed = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const later = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
  const since = new Map<string, number>(); // item id -> tick it entered its state
  const fails = new Map<string, string | undefined>(); // item id -> scripted inspector failure
  const asks = new Map<string, string>(); // item id -> the question Spark asks before building it
  const held = new Set<string>(); // queued items waiting on the player's yes
  const parked = new Set<string>(); // items the player said "not now" to
  let growthOffered = false;
  let lastSpark = 0; // tick of Spark's last tool call
  const byTitle = new Map<string, string>(); // ore title -> item id, for linking
  const onChoose = new Map<string, (optionId: string) => void>(); // move id -> what each answer does
  const pending: Move[] = []; // moves waiting behind the open card
  const undos = new Map<string, () => void>();
  const failAt = new Map<string, StationKind | undefined>(); // item id -> station that catches the scripted failure
  const failCheck = new Map<string, string | undefined>(); // item id -> researched check that would catch it first
  const builtBy = new Map<string, string | undefined>(); // item id -> assembler that built it
  const watching = new Map<string, number>(); // launched item id -> tick orbit watch stops
  const comebacks = new Map<string, string>(); // item id -> what orbit watch will catch after its first launch
  const trips = new Map<string, number>(); // launched item id -> tick its comeback lands
  const stats = new Map<string, { passed: number; failed: number; caught?: number; lastLog?: Station["lastLog"] }>();
  // ?autolaunch merges PRs on the pad by itself, for hands-off demo replays.
  const autoLaunch = new URLSearchParams(location.search).has("autolaunch");
  let pr = 140;
  let seq = 0;

  const THOUGHT_FOR: Partial<Record<string, ThoughtDecision>> = { triage: "triage", link_items: "triage", start_job: "plan", request_rework: "plan", escalate: "review", read_repo: "rank" };
  const emit = (msg: ServerToWeb) => queueMicrotask(() => { if (!closed) onMessage(msg); });
  const log = (level: "info" | "warn" | "error" | "success", text: string, itemId?: string) =>
    emit({ type: "log", level, text, at: Date.now(), itemId });

  // A line in Spark's voice. Pass undo to make it undoable from the floor log.
  const spark = (line: SparkLine, opts: { itemId?: string; target?: string; approvedBy?: "player" | "autonomy"; undo?: () => void } = {}) => {
    const actionId = opts.undo ? `act-${++seq}` : undefined;
    if (actionId && opts.undo) undos.set(actionId, opts.undo);
    emit({ type: "log", level: "info", text: line.text, at: Date.now(), itemId: opts.itemId, actor: "spark", tool: line.tool, reason: line.reason, actionId, approvedBy: opts.approvedBy });
    s.foreman = { targetId: opts.target ?? s.foreman?.targetId, tool: line.tool, thinking: false };
    lastSpark = s.tick;
    emit({ type: "patch", patch: { foreman: s.foreman } });
    // The sim's decision log mirrors the live one, tagged simulated so nobody mistakes it for a real model call.
    const decision = THOUGHT_FOR[line.tool];
    if (decision && s.brain) {
      const item = opts.itemId ? s.items.find((i) => i.id === opts.itemId) : undefined;
      s.brain = { ...s.brain, decisions: s.brain.decisions + 1, thoughts: [{ id: `t-${++seq}`, at: Date.now(), decision, by: "spark" as const, model: "sim", ms: 600 + (seq % 7) * 180, itemId: opts.itemId, title: item?.title ?? line.text, outcome: line.text, reason: line.reason ?? "From the floor state.", simulated: true }, ...s.brain.thoughts].slice(0, 40) };
      emit({ type: "patch", patch: { brain: s.brain } });
    }
  };

  const apply = (p: Patch) => {
    for (const it of p.items ?? []) {
      const i = s.items.findIndex((x) => x.id === it.id);
      if (i === -1 || s.items[i].state !== it.state) since.set(it.id, s.tick);
      if (i === -1) s.items.push(it);
      else s.items[i] = it;
    }
    for (const m of p.machines ?? []) {
      const i = s.machines.findIndex((x) => x.id === m.id);
      if (i === -1) s.machines.push(m);
      else s.machines[i] = m;
    }
    for (const b of p.belts ?? []) s.belts.push(b);
    for (const r of p.removed ?? []) {
      if (r.kind === "machine") s.machines = s.machines.filter((x) => x.id !== r.id);
      if (r.kind === "belt") s.belts = s.belts.filter((x) => x.id !== r.id);
      if (r.kind === "item") s.items = s.items.filter((x) => x.id !== r.id);
    }
    if (p.districts) s.districts = p.districts;
    if (p.science) s.science = p.science;
    if (p.trust !== undefined) s.trust = p.trust;
    if (p.metrics) s.metrics = p.metrics;
    if (p.autonomy) s.autonomy = p.autonomy;
    if (p.bottleneck !== undefined) s.bottleneck = p.bottleneck;
    if (p.research) s.research = p.research;
    emit({ type: "patch", patch: { ...p, tick: s.tick } });
  };

  const bumpMetrics = (d: Partial<Metrics>) => {
    const m = { ...s.metrics!, ...d };
    apply({ metrics: { ...m, shipScore: shipScore(m) } });
  };

  // ---------- the Next Move card ----------

  // The check-in deck is the open card plus the ones waiting behind it, at most 12.
  const dealDeck = () => {
    s.deck = [...(s.move ? [s.move] : []), ...pending].slice(0, 12);
    emit({ type: "deck", deck: s.deck });
  };
  const propose = (move: Omit<Move, "id" | "createdAt">, then: (optionId: string) => void) => {
    if (sc.intro) return; // the tour's own cards do the asking
    const m: Move = { ...move, id: `move-${++seq}`, createdAt: Date.now() };
    onChoose.set(m.id, then);
    if (s.move) pending.push(m);
    else open(m);
    dealDeck();
  };
  const open = (m: Move) => {
    s.move = m;
    emit({ type: "move", move: m });
    dealDeck();
  };
  // Take a move off the deck, wherever it sits. The next one opens right away while the player swipes.
  const pull = (moveId: string, delay: number) => {
    const i = pending.findIndex((m) => m.id === moveId);
    if (i !== -1) pending.splice(i, 1);
    if (s.move?.id === moveId) {
      s.move = null;
      const next = pending.shift();
      if (next) later(delay, () => open(next));
    }
    dealDeck();
  };
  const resolve = (moveId: string, optionId: string | undefined, actor: "player" | "spark") => {
    const then = onChoose.get(moveId);
    if (!then) return;
    onChoose.delete(moveId);
    emit({ type: "move_resolved", moveId, optionId, actor });
    pull(moveId, s.deck && s.deck.length > 1 ? 0 : 600);
    if (optionId) then(optionId);
  };
  // Swipe left: later. It goes to the back of the deck (a real server holds it for the next check-in).
  const defer = (moveId: string) => {
    const m = s.move?.id === moveId ? s.move : pending.find((x) => x.id === moveId);
    if (!m) return;
    pull(moveId, 0);
    pending.push(m);
    if (!s.move) open(pending.shift()!);
    else dealDeck();
  };
  // Swipe down: never, with one tap on why. The why is what Spark learns from.
  const NEVER_LINE = {
    once: "Dropped it.",
    kind: "Noted as a rule: no more cards like this",
    spark: "Got it: this kind gets handled on its own from now on",
    wrong: "Logged a scar: misread this one",
  } as const;
  const dismiss = (moveId: string, why: keyof typeof NEVER_LINE) => {
    const m = s.move?.id === moveId ? s.move : pending.find((x) => x.id === moveId);
    if (!m) return;
    onChoose.delete(moveId);
    emit({ type: "move_resolved", moveId, actor: "player" });
    pull(moveId, 0);
    spark({ tool: why === "kind" ? "add_rule" : why === "wrong" ? "scar" : "dismiss_move", text: `${NEVER_LINE[why]} ("${m.title}")`, reason: "you swiped never" }, { approvedBy: "player" });
    if (why === "spark") approvedAsIs();
  };

  // Each move the player approves as-is counts toward the next autonomy unlock.
  const approvedAsIs = () => {
    const a = s.autonomy!;
    if (!a.next) return;
    const have = a.next.have + 1;
    if (have < a.next.need) return apply({ autonomy: { ...a, next: { ...a.next, have } } });
    const level = a.next.level;
    const next: Autonomy["next"] = level === "floor" ? { level: "build", have: 0, need: 5, label: "PRs merged from the plan, no escaped defect" } : null;
    apply({ autonomy: { ...a, level, next } });
    emit({
      type: "autonomy_unlocked",
      level,
      text: level === "floor" ? "Floor unlocked: work gets routed and machines tuned on their own now" : `${level} unlocked`,
    });
  };

  const askToBuild = (item: Item) => {
    const asm = s.machines.find((m) => m.type === "assembler");
    const users = item.customer?.usersAffected;
    propose(
      {
        title: users ? `${item.district === "checkout" ? "Checkout crash" : item.title}, ${users} users` : item.title,
        why: asks.get(item.id) ?? "Build it?",
        stage: "build",
        kind: "build",
        focus: asm?.id,
        itemId: item.id,
        options: [
          { id: "go", label: "Go", recommended: true, actions: [{ tool: "start_job", args: { itemId: item.id, machineId: asm?.id }, reason: "highest value on the floor" }] },
          { id: "skip", label: "Not now", recommended: false, actions: [] },
        ],
      },
      (opt) => {
        held.delete(item.id);
        if (opt !== "go") {
          parked.add(item.id);
          return spark({ tool: "post_log", text: `Parked "${item.title}". Ask again when you're ready.` });
        }
        spark({ tool: "start_job", text: `Sent "${item.title}" to ${asm?.id ?? "the assembler"} with the plan`, reason: "you said go" }, { itemId: item.id, target: asm?.id, approvedBy: "player" });
        approvedAsIs();
      },
    );
  };

  const askToLaunch = (item: Item) => {
    const users = item.customer?.usersAffected;
    propose(
      {
        title: "Bottleneck: launch pad",
        why: users ? `Merging #${item.prNumber} closes the crash hitting ${users} users.` : `PR #${item.prNumber} passed the gauntlet: ${item.title}`,
        stage: "pad",
        kind: "ship",
        focus: "gate-1",
        evidence: lineNow().filter((g) => g.kind !== "merge").map((g) => ({ station: g.name, ok: true })),
        itemId: item.id,
        options: [
          { id: "launch", label: `Launch #${item.prNumber}`, recommended: true, actions: [{ tool: "request_merge", args: { pr: item.prNumber }, reason: "green and on the pad" }] },
          { id: "later", label: "Later", recommended: false, actions: [] },
        ],
      },
      (opt) => {
        const now = s.items.find((i) => i.id === item.id);
        if (opt === "launch" && now?.state === "on_pad") launch(now);
      },
    );
  };

  const askToReply = (item: Item, to: string) => {
    propose(
      {
        title: `Reply to ${to.split("@")[0]}`,
        why: `Drafted: "Thanks for the report. Checkout is fixed in #${item.prNumber}, you can pay now. Sorry about that."`,
        stage: "impact",
        kind: "ship",
        focus: "ore-inbox",
        itemId: item.id,
        options: [
          { id: "send", label: "Send", recommended: true, actions: [{ tool: "send_customer_reply", args: { to }, reason: "the fix shipped" }] },
          { id: "skip", label: "Don't send", recommended: false, actions: [] },
        ],
      },
      (opt) => {
        if (opt !== "send") return;
        spark({ tool: "send_customer_reply", text: `Replied to ${to}: fixed in #${item.prNumber}` }, { itemId: item.id, approvedBy: "player" });
        bumpMetrics({ customersAnswered: s.metrics!.customersAnswered + 1 });
        approvedAsIs();
      },
    );
  };

  // ---------- the floor ----------

  const machine = (type: Machine["type"]) => s.machines.find((m) => m.type === type);
  const setMachine = (id: string | undefined, state: Machine["state"]) => {
    const m = s.machines.find((x) => x.id === id);
    return m && m.state !== state ? [{ ...m, state }] : [];
  };

  const arrive = (o: Ore, now: number) => {
    for (const line of o.spark ?? []) spark(line, { target: o.source === "sentry" || o.source === "posthog" || o.source === "inbox" ? `ore-${o.source}` : "ore-issues" });
    const into = o.linkTo ? s.items.find((i) => i.id === byTitle.get(o.linkTo!)) : undefined;
    if (into) {
      const before = into;
      const customer = { usersAffected: 0, reporters: [], linked: [], ...into.customer };
      const merged = { ...into, customer: { ...customer, reporters: [...customer.reporters, ...(o.reporter ? [o.reporter] : [])] }, updatedAt: now };
      apply({ items: [merged] });
      spark(
        { tool: "link_items", text: `Linked ${o.reporter ?? "the report"} to "${into.title}"`, reason: "same stack trace, same route" },
        {
          itemId: into.id,
          target: "ore-inbox",
          undo: () => {
            const cur = s.items.find((i) => i.id === before.id);
            if (cur) apply({ items: [{ ...cur, customer: before.customer }] });
            log("info", `Unlinked ${o.reporter ?? "the report"}`, before.id);
          },
        },
      );
      return;
    }
    const item: Item = {
      id: `sim-${s.tick}-${++seq}`,
      kind: o.kind,
      source: o.source ?? "github_issue",
      title: o.title,
      district: o.district,
      state: "ore",
      attempts: 0,
      updatedAt: now,
      customer: o.users || o.reporter ? { usersAffected: o.users ?? 0, reporters: o.reporter ? [o.reporter] : [], linked: [] } : undefined,
      value: o.users,
    };
    fails.set(item.id, o.failFirst);
    failAt.set(item.id, o.failAt);
    if (o.comeback) comebacks.set(item.id, o.comeback);
    failCheck.set(item.id, o.failCheck);
    byTitle.set(o.title, item.id);
    if (o.ask) asks.set(item.id, o.ask);
    apply({ items: [item] });
    if (!o.spark) log("info", `Ore: ${o.title}`, item.id);
  };

  // The stage with the most value waiting, the way bottleneck.ts scores it.
  const findBottleneck = (): Bottleneck | null => {
    // the tour: a fix the verify bay caught waits on the rework belt for your new check
    const caught = sc.intro && s.items.find((i) => i.scars?.length && (i.state === "rejected" || i.state === "queued"));
    if (caught) return { stage: "inspect", stationId: "verify-1", wip: 1, ageMs: 0, throughputPerHour: 0, valueAtRisk: caught.value ?? 1, summary: `the verify bay caught a bad fix in /${caught.district}` };
    if (!s.power.some((p) => p.kind !== "steam" && p.online) && s.machines.some((m) => m.type === "assembler" && !m.powerId))
      return { stage: "resources", wip: s.items.length, ageMs: 0, throughputPerHour: 0, valueAtRisk: s.items.length, summary: "No subscription plugged in, so nothing can build" };
    const live = s.items.filter((i) => i.state !== "launched");
    if (!live.length) return null;
    const by = new Map<Stage, Item[]>();
    for (const i of live) {
      const st = held.has(i.id) ? "build" : STAGE_OF[i.state];
      if (st) by.set(st, [...(by.get(st) ?? []), i]);
    }
    let best: Bottleneck | null = null;
    let bestScore = -1;
    for (const [stage, items] of by) {
      const ageMs = Math.max(...items.map((i) => (s.tick - (since.get(i.id) ?? s.tick)) * TICK_MS));
      const valueAtRisk = items.reduce((n, i) => n + (i.value ?? 1), 0);
      const score = valueAtRisk * (1 + ageMs / 10_000);
      if (score <= bestScore) continue;
      bestScore = score;
      const what = stage === "pad" ? "waiting on review" : stage === "build" && items.some((i) => held.has(i.id)) ? "waiting on your go" : `in ${stage}`;
      best = { stage, wip: items.length, ageMs, throughputPerHour: 0, valueAtRisk, summary: `${items.length} item${items.length > 1 ? "s" : ""} ${what}` };
    }
    // point at the station where the pile is, so the map can make it glow
    if (best?.stage === "pad") best.stationId = "gate-1";
    else if (best?.stage === "inspect") {
      const piles = lineNow().map((g) => [g.id, live.filter((i) => i.machineId === g.id).length] as const).sort((a, b) => b[1] - a[1]);
      if (piles[0][1] > 0) {
        best.stationId = piles[0][0];
        const st = lineNow().find((g) => g.id === best!.stationId)!;
        best.summary = `${piles[0][1]} item${piles[0][1] > 1 ? "s" : ""} waiting at the ${lc(st.name)}`;
      }
    }
    return best;
  };

  const tick = () => {
    s.tick++;
    // Spark heads back to its plant once it's been quiet for a bit, instead of hovering on its last job
    if (s.foreman?.targetId && s.tick - lastSpark > FOREMAN_IDLE_TICKS) {
      s.foreman = { thinking: false };
      emit({ type: "patch", patch: { foreman: s.foreman } });
    }
    const now = Date.now();

    if (sc.intro && clock0 !== Infinity) introFeed(now);
    while (script.length && script[0].at + clock0 <= s.tick) arrive(script.shift()!, now);

    for (const item of [...s.items]) {
      const age = s.tick - (since.get(item.id) ?? s.tick);
      if (age < (DWELL[item.state] ?? Infinity)) continue;
      const next = { ...item, updatedAt: now };
      switch (item.state) {
        case "ore":
          if (!machine("splitter")) continue;
          apply({ items: [{ ...next, state: "queued" }] });
          log("info", `Splitter sorted "${item.title}" → ${item.district}`, item.id);
          if (asks.has(item.id)) {
            held.add(item.id);
            askToBuild(item);
          }
          break;
        case "queued": {
          // Spark's pick goes first: nothing else starts while its "fix this first" waits on your Go
          if (held.size || parked.has(item.id)) continue;
          const a = s.machines.find((m) => m.type === "assembler" && m.state === "idle" && m.powerId);
          if (!a) continue;
          apply({ items: [{ ...next, state: "working", machineId: a.id, attempts: item.attempts + 1 }], machines: setMachine(a.id, "working") });
          log("info", `${a.id} picked up "${item.title}"`, item.id);
          break;
        }
        case "working": {
          const prNumber = item.prNumber ?? ++pr;
          builtBy.set(item.id, item.machineId);
          apply({
            items: [{ ...next, state: "inspecting", machineId: GAUNTLET[0].id, prNumber, prUrl: `https://github.com/${s.repo}/pull/${prNumber}` }],
            machines: setMachine(item.machineId, "idle"),
          });
          log("info", `PR #${prNumber} heads into the gauntlet`, item.id);
          break;
        }
        case "inspecting": {
          const line = lineNow();
          const at = line.findIndex((g) => g.id === item.machineId);
          const st = line[Math.max(0, at)];
          const failure = fails.get(item.id);
          // a researched check that would catch it gets there first, before the expensive stations
          const check = failCheck.get(item.id);
          const catcher = check && line.some((g) => g.id === checkStationId(check)) ? checkStationId(check) : undefined;
          if (failure && item.attempts === 1 && (catcher ? catcher === st.id : (failAt.get(item.id) ?? "ci") === st.kind)) {
            const scar = { station: st.kind, reason: failure, strike: item.attempts, at: now, ...(st.kind === "custom" && { check: st.id.slice("check-".length) }) };
            apply({ items: [{ ...next, state: "rejected", failure, scars: [...(item.scars ?? []), scar] }] });
            record(st, false, `#${item.prNumber} ${failure}. Back to the planner on the rework belt.`);
            log("warn", `${st.name} rejected PR #${item.prNumber}: ${failure}`, item.id);
            spark({ tool: "request_rework", text: `Re-planning #${item.prNumber} with the ${lc(st.name)} scar, then back to ${builtBy.get(item.id) ?? "the assembler"}`, reason: failure }, { itemId: item.id, target: "splitter-1" });
            suggestNow();
            break;
          }
          record(st, true, `#${item.prNumber} passed.`);
          const nextSt = line[at + 1];
          if (nextSt && nextSt.kind !== "merge") {
            since.set(item.id, s.tick);
            apply({ items: [{ ...next, machineId: nextSt.id }] });
            log("info", `PR #${item.prNumber} passed ${st.name}, on to the ${lc(nextSt.name)}`, item.id);
          } else {
            apply({ items: [{ ...next, state: "on_pad", machineId: "gate-1", failure: undefined }] });
            stat("gate-1").lastLog = { who: "Gate", text: `#${item.prNumber} is ready. CI green, verified, review approved.`, ok: true };
            log("success", `PR #${item.prNumber} cleared the gauntlet. Waiting at the merge gate.`, item.id);
            if (!autoLaunch) askToLaunch(next);
          }
          break;
        }
        case "rejected":
          if (sc.intro && !s.machines.some((x) => x.type === "turret")) continue; // waits for the tour's new check
          apply({ items: [{ ...next, state: "queued", machineId: undefined }] });
          log("info", `Rework: "${item.title}" goes back to the assemblers with its scar tag`, item.id);
          break;
        case "on_pad": {
          // a folder with a launch permit ships on its own (docs/LOOP.md)
          const alone = permitted(item.district);
          if (!autoLaunch && !alone) continue;
          launch(item, alone);
          break;
        }
      }
    }

    // The demo shop's checkout counter stalls while checkout is crashing.
    const m = s.metrics!;
    const crashing = s.items.some((i) => i.source === "sentry" && i.district === "checkout" && i.state !== "launched");
    const metrics = m.checkouts !== undefined && !crashing ? { ...m, checkouts: m.checkouts + 3 } : m;
    const bottleneck = findBottleneck();
    const changed = JSON.stringify(bottleneck && { ...bottleneck, ageMs: 0 }) !== JSON.stringify(s.bottleneck && { ...s.bottleneck, ageMs: 0 });
    if (changed) s.bottleneck = bottleneck;
    s.metrics = metrics;
    // orbit watch: launched items stay watched for a while, then report all clear, unless the bug comes back
    for (const [id, at] of trips) if (s.tick >= at) comeBack(id);
    for (const [id, until] of watching) {
      if (s.tick < until) continue;
      watching.delete(id);
      const it = s.items.find((i) => i.id === id);
      if (it?.orbit) apply({ items: [{ ...it, orbit: { ...it.orbit, state: "clear", at: Date.now() } }] });
      stat("orbit-1").lastLog = { who: "Orbit watch", text: `#${it?.prNumber} held 24h: no comeback.`, ok: true };
      log("success", `Orbit watch: #${it?.prNumber} held 24h with no comeback`, id);
    }
    // Finishing the starter line should teach its next real decision, not strand the tour.
    if (sc.onboard && !growthOffered && !script.length && s.items.length && s.items.every(i => i.state === "launched") && !s.move && !pending.length) {
      const kind = ghostSpots(s)[0]?.kind;
      if (kind) {
        growthOffered = true;
        const label = kind === "sentry" ? "Sentry" : "PostHog";
        propose({ title: `Your first fixes shipped. Connect ${label} next?`, why: "The line is caught up. Add another input so future customer signals can become the next fix.", stage: "intake", kind: "input", focus: `src:${kind}`, grows: ["+1 SOURCE"], plan: [`Open the ${label} mine on this sandbox island.`, "Future signals can feed the splitter; connecting a mine does not invent a customer problem."], options: [{ id: "connect", label: `Connect ${label}`, recommended: true, actions: [{ tool: "connect_source", args: { kind }, reason: "Grow the input loop after your first shipments." }] }, { id: "later", label: "Watch the factory for now", recommended: false, actions: [] }] }, option => {
          if (option === "connect") connectMine(kind);
          else log("info", "All caught up. Watching the connected mines for the next signal.");
        });
      }
    }
    const stations = stationsNow();
    const stationsChanged = JSON.stringify(stations) !== JSON.stringify(s.stations);
    if (stationsChanged) s.stations = stations;
    emit({ type: "patch", patch: { tick: s.tick, ...(metrics !== m && { metrics }), ...(changed && { bottleneck }), ...(stationsChanged && { stations }) } });
  };

  // ---------- gauntlet stats ----------

  function stat(id: string) {
    let v = stats.get(id);
    if (!v) stats.set(id, (v = { passed: 0, failed: 0 }));
    return v;
  }
  function record(st: StationDef, ok: boolean, text: string) {
    const v = stat(st.id);
    if (ok) v.passed++;
    else {
      v.failed++;
      v.caught = (v.caught ?? 0) + 1;
    }
    v.lastLog = { who: st.name, text, ok };
  }
  // The line in order: CI, then researched checks in the order they were researched, then the rest.
  function lineNow(): StationDef[] {
    const checks = researchedChecks(s)
      .filter((id) => s.machines.some((m) => m.id === checkStationId(id)))
      .map((id): StationDef => ({ id: checkStationId(id), kind: "custom", name: techById(id)!.name, caught: 0, actions: [] }));
    return [GAUNTLET[0], ...checks, ...GAUNTLET.slice(1)];
  }
  function stationsNow(): Station[] {
    return [...lineNow(), ORBIT].map((g) => {
      const v = stat(g.id);
      const here = g.kind === "orbit" ? s.items.filter((i) => watching.has(i.id)) : s.items.filter((i) => i.machineId === g.id && (i.state === "inspecting" || i.state === "on_pad"));
      const oldest = Math.max(0, ...here.map((i) => s.tick - (since.get(i.id) ?? s.tick)));
      const runs = v.passed + v.failed;
      return {
        id: g.id,
        kind: g.kind,
        name: g.name,
        machineId: g.id,
        wip: here.length,
        oldestWaitMs: here.length ? oldest * TICK_MS : undefined,
        passRate: runs ? v.passed / runs : undefined,
        caughtThisWeek: g.caught + (v.caught ?? 0),
        lastLog: v.lastLog,
        actions: g.actions,
      };
    });
  }

  const permitted = (district: string) => !!s.autonomy?.districts.find((d) => d.district === district)?.permit;

  // ---------- the welcome tour ----------

  let introAt = 0; // next tick the tour drops ore
  let introN = 0;
  let lightsOut = false;
  const introCues = new Set<string>();
  const introFeed = (now: number) => {
    if (s.tick < introAt) return;
    const inFlight = s.items.filter((i) => i.state !== "on_pad" && i.state !== "launched").length;
    const atGate = s.items.filter((i) => i.state === "on_pad").length;
    const live = inFlight + atGate;
    // until docs can ship alone, the pile at the gate stops growing at INTRO_PILE: you get the point
    if (inFlight >= (lightsOut ? 6 : 4) || atGate >= 8 || (!permitted("docs") && live >= INTRO_PILE)) return;
    arrive({ at: 0, ...INTRO_ORE[introN++ % INTRO_ORE.length] }, now);
    introAt = s.tick + (lightsOut ? 2 : 3);
  };
  const introCue = (cue: string) => {
    if (!["build", "catch", "lights"].includes(cue) || introCues.has(cue)) return;
    introCues.add(cue);
    if (cue === "build" && clock0 === Infinity) {
      // the starter line drops in machine by machine, already plugged in, then the ore starts
      const full = initialState({ ...sc, onboard: false });
      const add = full.machines.filter((m) => !s.machines.some((x) => x.id === m.id));
      add.forEach((m, n) => later(220 * n, () => apply({ machines: [m] })));
      later(220 * add.length, () => {
        apply({ belts: full.belts, power: full.power });
        s.power = full.power;
        spark({ tool: "place_machine", text: "Line's down: Claude Code on the assembler" }, { target: "assembler-1" });
        clock0 = s.tick;
      });
    } else if (cue === "catch") arrive({ at: 0, ...INTRO_CATCH }, Date.now());
    else if (cue === "lights") {
      lightsOut = true;
      const a = s.autonomy!;
      apply({ autonomy: { ...a, level: "lights_out", next: null, districts: a.districts.map((d) => ({ ...d, permit: true })) } });
    }
  };

  // A comeback in orbit: scar it, send it back for a fresh PR, take the lane's launch permit away.
  const comeBack = (id: string) => {
    trips.delete(id);
    watching.delete(id);
    const item = s.items.find((i) => i.id === id);
    const what = comebacks.get(id);
    comebacks.delete(id);
    if (!item?.orbit || !what) return;
    const now = Date.now();
    const reason = `${what} 3h after #${item.prNumber} launched`;
    const scar = { station: "orbit" as const, reason, strike: (item.scars ?? []).filter((x) => x.station === "orbit").length + 1, at: now };
    fails.delete(id);
    apply({ items: [{ ...item, state: "rejected", failure: reason, machineId: undefined, prNumber: undefined, prUrl: undefined, scars: [...(item.scars ?? []), scar], orbit: { ...item.orbit, state: "regressed", signal: "sentry", reason, at: now }, updatedAt: now }] });
    record(ORBIT, false, `#${item.prNumber}: ${reason}`);
    log("warn", `Orbit watch: ${reason}. It's back on the rework belt with an orbit scar.`, id);
    const m = s.metrics!;
    bumpMetrics({ escapedDefects: m.escapedDefects + 1 });
    apply({ trust: Math.max(0, s.trust - 0.1) });
    const a = s.autonomy!;
    if (a.districts.some((d) => d.district === item.district && d.permit)) {
      apply({ autonomy: { ...a, districts: a.districts.map((d) => (d.district === item.district ? { ...d, permit: false, score: 0 } : d)) } });
      const text = `${item.district} lost its launch permit: #${item.prNumber} came back in orbit (Sentry). Its PRs wait for you again until the lane earns trust back.`;
      emit({ type: "autonomy_unlocked", level: a.level, district: item.district, text });
    }
    spark({ tool: "request_rework", text: `Re-planning #${item.prNumber} with the orbit scar: the fix didn't hold in production`, reason }, { itemId: id, target: "splitter-1" });
  };

  const launch = (item: Item, alone = false) => {
    const key = SCIENCE_FOR[item.kind];
    const now = Date.now();
    apply({
      items: [{ ...item, state: "launched", updatedAt: now, orbit: { since: now, until: now + 24 * 3600_000, state: "watching", prNumber: item.prNumber } }],
      science: { ...s.science, [key]: s.science[key] + 1 },
      trust: Math.min(1, s.trust + 0.05),
    });
    log("success", `Rocket launched: PR #${item.prNumber} merged`, item.id);
    watching.set(item.id, s.tick + WATCH_TICKS);
    if (comebacks.has(item.id)) trips.set(item.id, s.tick + COMEBACK_TICKS);
    record(GAUNTLET.find((g) => g.kind === "merge")!, true, `#${item.prNumber} merged and launched.`);
    const m = s.metrics!;
    const users = item.customer?.usersAffected ?? 0;
    bumpMetrics({
      rockets: m.rockets + 1,
      usersUnblocked: m.usersUnblocked + users,
      bitersKilled: m.bitersKilled + (item.source === "sentry" ? 1 : 0),
      customersAnswered: m.customersAnswered + (sc.intro && users ? 1 : 0), // the tour's fixes all had someone asking
    });
    if (item.source === "sentry") log("success", `Biters cleared: Sentry is quiet on /${item.district}`, item.id);
    for (const to of item.customer?.reporters ?? []) askToReply(item, to);
    // the automated share counts rockets that launched on a permit
    const a = s.autonomy!;
    const launches = (a.launches ?? 0) + 1;
    const automated = (Math.round((a.automated ?? 0) * (a.launches ?? 0)) + (alone ? 1 : 0)) / launches;
    apply({ autonomy: { ...a, launches, automated, next: a.next?.level === "build" ? { ...a.next, have: a.next.have + 1 } : a.next } });
  };

  // ---------- research (shared/src/research.ts) ----------

  const offered = new Set<string>();
  // Repeated scars point at a tech. The tree shows the pick; the first time it's affordable it's a card too.
  function suggestNow() {
    const suggest = suggestResearch(s);
    if (JSON.stringify(suggest) !== JSON.stringify(s.research?.suggest)) apply({ research: { ...s.research!, suggest } });
    if (!suggest || offered.has(suggest.tech) || researchBlocked(s, suggest.tech)) return;
    offered.add(suggest.tech);
    const t = techById(suggest.tech)!;
    spark({ tool: "suggest_research", text: `Same scar twice. ${t.name} would catch it right after CI`, reason: suggest.why }, { target: "ci-1" });
    propose(
      {
        title: `Research ${t.name}?`,
        why: suggest.why,
        stage: "inspect",
        kind: "verify",
        focus: "ci-1",
        grows: ["+1 CHECK", `${t.cost} SCIENCE`],
        plan: [`Spend ${t.cost} science packs`, `${t.name} joins the line right after CI`, t.what, "From then on every PR goes through it"],
        options: [
          { id: "research", label: `Research ${t.name}`, recommended: true, actions: [{ tool: "research", args: { tech: t.id }, reason: suggest.why }] },
          { id: "not_yet", label: "Not yet", recommended: false, actions: [] },
        ],
      },
      (opt) => {
        if (opt === "research") research(t.id, "card");
      },
    );
  }

  function research(tech: string, by: "tree" | "card") {
    const blocked = researchBlocked(s, tech);
    if (blocked) return log("info", blocked);
    const t = techById(tech)!;
    const line = insertCheck(s, tech);
    const done = { done: [...s.research!.done, tech], spent: s.research!.spent + t.cost };
    // the new station rises in place and the line slides along to make room
    apply({ removed: line.removed.map((id) => ({ kind: "belt" as const, id })), machines: line.machines, belts: line.belts, research: { ...done, suggest: suggestResearch({ ...s, research: done }) } });
    // a pending card for the same tech is moot now
    for (const m of [s.move, ...pending]) if (m?.options[0]?.actions[0]?.tool === "research" && m.options[0].actions[0].args.tech === tech) resolve(m.id, undefined, "player");
    emit({ type: "log", level: "success", text: `Researched: ${t.name}. It now checks every PR right after CI`, at: Date.now(), actor: "player", tool: "research", approvedBy: "player", reason: by === "card" ? "You said yes on the research card" : `You spent ${t.cost} science packs` });
    s.stations = stationsNow();
    emit({ type: "patch", patch: { stations: s.stations } });
  }

  // ---------- clicking a station ----------

  // A station panel's action, from the player. Merge actually launches; the rest is Spark
  // taking the job on, logged with undo, the way a real station action would be queued.
  const stationAction = (stationId: string, action: string) => {
    if (sc.intro && stationId === "intro") return introCue(action);
    const def = [...lineNow(), ORBIT].find((g) => g.id === stationId);
    const machine = s.machines.find((m) => m.id === stationId);
    const label = def?.actions.find((a) => a.id === action)?.label ?? actionLabel(action) ?? action;
    const target = def?.id ?? machine?.id ?? (stationId === "power" ? "steam-spark" : "splitter-1");
    if (stationId === "gate-1" && action === "merge") {
      const item = s.items.filter((i) => i.state === "on_pad").sort((a, b) => (since.get(a.id) ?? 0) - (since.get(b.id) ?? 0))[0];
      if (!item) return log("info", "Nothing at the merge gate yet");
      if (s.move?.itemId === item.id) resolve(s.move.id, "launch", "player");
      else launch(item);
      return;
    }
    if (stationId === "gate-1" && action === "permit") {
      const a = s.autonomy!;
      const before = a.districts;
      apply({ autonomy: { ...a, districts: a.districts.map((d) => (d.district === "docs" ? { ...d, permit: true } : d)) } });
      spark({ tool: "set_autonomy", text: "Docs has a launch permit now: routine docs PRs launch without the merge gate", reason: "You gave it from the merge gate" }, { target, approvedBy: "player", undo: () => apply({ autonomy: { ...s.autonomy!, districts: before } }) });
      return;
    }
    if (stationId === "rework" && action === "me") {
      const item = s.items.find((i) => i.state === "rejected" || (i.scars?.length && i.state === "queued"));
      if (!item) return log("info", "Nothing on the rework belt right now");
      spark({ tool: "escalate", text: `Sending #${item.prNumber ?? item.title} to you with its scar tags`, reason: item.scars?.at(-1)?.reason }, { itemId: item.id, target, approvedBy: "player" });
      return;
    }
    spark({ tool: "station_action", text: `On it: ${label.toLowerCase()}`, reason: `You asked from the ${def ? lc(def.name) : (machine?.type.replace("_", " ") ?? stationId)} panel` }, { target, approvedBy: "player", undo: () => log("info", `Undid: ${label.toLowerCase()}`) });
  };

  // ---------- plugging in a subscription ----------

  const plugIn = (harness: "claude_code" | "codex") => {
    const name = SOLAR_NAME[harness]!;
    const plant = `solar-${harness}`;
    const n = s.power.filter((p) => p.kind === "solar").length;
    const dark = s.machines.find((m) => m.type === "assembler" && !m.powerId);
    const asm: Machine = dark
      ? { ...dark, harness, powerId: plant, state: "idle" }
      : { id: `assembler-${harness}`, type: "assembler", x: 0, y: 2 + n * 2, harness, powerId: plant, tier: 1, state: "idle" };
    s.power = [...s.power, { id: plant, kind: "solar", name, level: 1, online: true }];
    apply({
      power: s.power,
      machines: [{ id: plant, type: "solar", x: 3 + n * 3, y: 3, tier: 1, state: "idle" }, { id: `battery-${harness}`, type: "battery", x: 4 + n * 3, y: 5, powerId: plant, tier: 1, state: "idle" }, asm],
    });
    log("success", `${name} plugged in: solar plant online, ${harness === "codex" ? "Codex" : "Claude Code"} assembler lit`);
  };

  const askForPower = () => {
    if (s.power.some((p) => p.kind === "solar")) return;
    propose(
      {
        title: "Plug in power to start building",
        why: "The repo's read and the first fix is lined up, but nothing can build yet. Your own subscriptions power the assemblers.",
        stage: "resources",
        kind: "input",
        focus: "assembler-1",
        grows: ["+1 POWER PLANT", "ASSEMBLERS ON"],
        options: [
          { id: "claude_code", label: "Sign in with Claude", recommended: true, actions: [] },
          { id: "codex", label: "Sign in with ChatGPT", recommended: false, actions: [] },
        ],
      },
      (opt) => plugIn(opt === "codex" ? "codex" : "claude_code"),
    );
  };

  // ---------- the check-in deck ----------

  // A morning's worth of Next Moves, dealt at once. Mostly loop-growers: checks, sources, autonomy.
  const dealCheckIn = () => {
    const yes = (text: string, tool: string, target: string, extra?: () => void) => () => {
      spark({ tool, text, reason: "you swiped right" }, { target, approvedBy: "player", undo: () => log("info", `Undid: ${text.toLowerCase()}`) });
      extra?.();
      approvedAsIs();
    };
    const one = (id: string, label: string, actions: Move["options"][number]["actions"] = []) => ({ id, label, recommended: true, actions });
    const alt = (id: string, label: string) => ({ id, label, recommended: false, actions: [] });
    const cards: [Omit<Move, "id" | "createdAt">, Record<string, () => void>][] = [
      [
        {
          title: "Same review note, third time. Make it a lint rule?",
          why: "AI review flagged a missing null check on cart items in #138, #140 and #143. Each one cost a rework loop.",
          kind: "verify", stage: "inspect", focus: "review-1", grows: ["+1 CHECK", "−1 REWORK LOOP"],
          plan: ["Claude Code writes the rule plus a fixture", "It lands as a PR through the same gauntlet", "AI review stops raising it, lint catches it earlier"],
          options: [one("lint", "Promote it to a lint rule", [{ tool: "promote_check", args: { layer: "lint" }, reason: "3 scars, same reason" }]), alt("turret", "Make it a test turret"), alt("keep", "Keep it as a review note")],
        },
        { lint: yes("Promoting the cart null check to a lint rule. PR incoming", "promote_check", "review-1"), turret: yes("Adding a test turret on /cart", "add_turret", "review-1") },
      ],
      [
        {
          title: "4 PRs stuck at the verify bay for 2h",
          why: "One bay, and each repro takes about 6 minutes. Everything downstream waits on it.",
          kind: "unblock", stage: "inspect", focus: "verify-1", grows: ["+1 STATION"],
          plan: ["Second bay goes on the Claude plant, it has charge left", "The pile splits across both bays", "Wait should drop from 2h to about 40m"],
          options: [one("second", "Build a second verify bay"), alt("skip-docs", "Let docs PRs skip verify")],
        },
        { second: yes("Building a second verify bay", "place_machine", "verify-1"), "skip-docs": yes("Docs PRs skip the verify bay now", "set_loadout", "verify-1") },
      ],
      [
        {
          title: "Connect PostHog to rank by real traffic",
          why: "Right now it's guessing which districts matter. With traffic, a bug on /checkout outranks /docs for the right reason.",
          kind: "input", stage: "intake", focus: "ore-issues", grows: ["+1 SOURCE", "SMARTER DECKS"],
          plan: ["Paste a read-only PostHog key", "Roads light up with traffic per district", "Cards rank by real sessions, not guesses"],
          options: [one("connect", "Connect PostHog"), alt("later", "Not this project")],
        },
        { connect: yes("PostHog connected: traffic now feeds the ranking", "connect_source", "ore-issues") },
      ],
      [
        {
          title: "#151 passed CI, but nobody proved the fix",
          why: "The verify bay has no recipe for /api, so it skipped. CI green isn't proof.",
          kind: "verify", stage: "inspect", focus: "verify-1", locked: true, grows: ["+1 CHECK", "/API VERIFIABLE"],
          evidence: [{ station: "CI inspector", ok: true }, { station: "Verify bay", ok: false, note: "no recipe" }, { station: "AI review", ok: true }],
          plan: ["Codex writes a recipe: call the endpoint, check the response", "Verify bay runs it before and after #151", "If it passes, #151 comes back as a merge card"],
          options: [one("recipe", "Write an /api verify recipe, then run it"), alt("close", "Close #151")],
        },
        { recipe: yes("Writing an /api verify recipe, #151 waits for it", "start_job", "verify-1") },
      ],
      [
        {
          title: "Launch docs PRs on their own?",
          why: "You merged the last 9 docs PRs exactly as suggested. Zero reverts.",
          kind: "automate", stage: "pad", focus: "gate-1", grows: ["+AUTONOMY", "FEWER CARDS"],
          plan: ["Docs PRs that pass every station merge on their own", "Each one still shows in the morning review card", "One revert and the permit pauses itself"],
          options: [one("permit", "Give docs a launch permit"), alt("more", "Ask me 5 more times first")],
        },
        {
          permit: yes("Docs has a launch permit now", "set_autonomy", "gate-1", () =>
            apply({ autonomy: { ...s.autonomy!, districts: s.autonomy!.districts.map((d) => (d.district === "docs" ? { ...d, permit: true } : d)) } }),
          ),
        },
      ],
      [
        {
          title: "Overnight: 6 things done alone. 1 flagged.",
          why: "Flagged: it closed #133 as a duplicate of #129. They look the same, but #133 only happens on mobile.",
          kind: "review", stage: "triage", focus: "splitter-1",
          evidence: [{ station: "5 routine", ok: true, note: "verified" }, { station: "1 flagged", ok: false }],
          plan: ["Triaged 3 issues", "Linked an email to an open bug", "Closed #133 as a duplicate (flagged)"],
          options: [one("keep", "Keep all six"), alt("reopen", "Reopen #133")],
        },
        { keep: yes("Kept overnight's six moves", "post_log", "splitter-1"), reopen: yes("Reopened #133, it's mobile only", "triage", "splitter-1") },
      ],
    ];
    for (const [move, then] of cards) propose(move, (opt) => then[opt]?.());
  };

  // ---------- onboarding: scan the repo, then propose the starter factory ----------

  const SCAN_MS = sc.intro ? 520 : 650;
  const scan = () => {
    const ds = sc.districts ?? REPO_DISTRICTS;
    const files = ds.reduce((n, d) => n + d.files, 0);
    if (sc.intro) {
      // the tour's island rises folder by folder, quietly
      ds.forEach((d, n) => later(SCAN_MS * (n + 1), () => apply({ districts: ds.slice(0, n + 1) })));
      return;
    }
    spark({ tool: "read_repo", text: `Opening ${s.repo}: reading the tree, issues and CI`, reason: "you picked this repo" }, { target: "steam-spark" });
    ds.forEach((d, n) =>
      later(SCAN_MS * (n + 1), () => {
        apply({ districts: ds.slice(0, n + 1) });
        log("info", `District ${d.name === "/" ? "/ (root)" : `/${d.name}`}: ${d.files} files`);
      }),
    );
    const t = SCAN_MS * (ds.length + 1);
    later(t, () => spark({ tool: "list_issues", text: `${sc.ores.length} open issues become ore at the deposit`, reason: "GitHub issues" }, { target: "ore-issues" }));
    later(t + SCAN_MS, () => spark({ tool: "read_ci", text: "Found GitHub Actions: that's your first inspector", reason: ".github/workflows" }));
    later(t + SCAN_MS * 2, () => {
      log("success", `Repo read: ${ds.length} districts, ${files} files, ${sc.ores.length} open issues. ${ds[0].name} carries the most risk`);
      if (!sc.intro) proposeStarter();
    });
  };

  // The splitter → assembler → inspector → launch pad line from initialState, minus what's already down.
  const proposeStarter = () => {
    const full = initialState({ ...sc, onboard: false });
    const first = sc.ores.find((o) => o.ask) ?? sc.ores[0];
    propose(
      {
        title: "Build your starter factory?",
        why: `A splitter, one assembler, an inspector and a launch pad, with belts. First job: "${first.title}".`,
        stage: "build",
        options: [
          { id: "build", label: "Build it", recommended: true, actions: [{ tool: "place_machine", args: { layout: "starter" }, reason: "smallest line that can ship a PR" }] },
          { id: "later", label: "Not yet", recommended: false, actions: [] },
        ],
      },
      (opt) => {
        if (opt !== "build") {
          spark({ tool: "post_log", text: "No rush. Say the word and I'll lay it down." });
          return later(TICK_MS * 6, proposeStarter);
        }
        approvedAsIs();
        const add = full.machines.filter((m) => !s.machines.some((x) => x.id === m.id));
        add.forEach((m, n) => later(300 * n, () => apply({ machines: [m] })));
        later(300 * add.length, () => {
          apply({ belts: full.belts });
          spark({ tool: "place_machine", text: "Starter factory down. The assembler is dark: it needs power", reason: "you said build" }, { target: "assembler-1", approvedBy: "player" });
          clock0 = s.tick;
          later(TICK_MS, askForPower);
        });
      },
    );
  };

  function connectMine(kind: string) {
          // sim: the empty mine fills in where the map showed it, and feeds the splitter
          if (kind !== "sentry" && kind !== "posthog") return;
          const id = `ore-${kind}`;
          if (s.machines.some((m) => m.id === id)) return;
          const spot = ghostSpots(s).find((g) => g.kind === kind);
          if (!spot) return;
          const splitter = s.machines.find((m) => m.type === "splitter");
          apply({
            machines: [{ id, type: "ore_deposit", x: spot.x, y: spot.y, tier: 1, state: "idle" }],
            belts: splitter ? [{ id: `belt-${id}`, from: id, to: splitter.id }] : [],
          });
          // Only the explicitly guided local demo introduces fixture errors on connection.
          if (sc.intro && kind === "sentry") INTRO_SENTRY.forEach((o, n) => script.push({ ...o, at: s.tick - clock0 + 2 + n * 5 }));
          spark({ tool: "connect_source", text: kind === "sentry" ? "Sentry mine open. Future errors can feed your line." : "PostHog mine open. Future user signals can feed your line.", reason: "You chose to grow the input loop" }, { target: id, approvedBy: "player" });
  }

  onStatus("live");
  emit({ type: "snapshot", state: structuredClone(s) });
  if (sc.checkin) later(TICK_MS, dealCheckIn);
  if (sc.onboard) later(TICK_MS, scan);
  else if (sc.unplugged) later(TICK_MS * 1.5, askForPower);
  const timer = setInterval(tick, tickMs);

  return {
    send(msg: WebToServer) {
      if (closed) return;
      switch (msg.type) {
        case "launch_pr": {
          const item = s.items.find((i) => i.id === msg.itemId);
          if (item?.state !== "on_pad") break; // in the real factory, a human merge does this
          if (s.move?.itemId === item.id) resolve(s.move.id, "launch", "player");
          else launch(item);
          break;
        }
        case "choose_move":
          resolve(msg.moveId, msg.optionId, "player");
          break;
        case "defer_move":
          defer(msg.moveId);
          break;
        case "dismiss_move":
          dismiss(msg.moveId, msg.why);
          break;
        case "station_action":
          stationAction(msg.stationId, msg.action);
          break;
        case "research":
          research(msg.tech, "tree");
          break;
        case "undo": {
          const undo = undos.get(msg.actionId);
          undos.delete(msg.actionId);
          undo?.();
          break;
        }
        case "set_autonomy": {
          const a = s.autonomy!;
          if (msg.district !== undefined && msg.permit !== undefined)
            apply({ autonomy: { ...a, districts: a.districts.map((d) => (d.district === msg.district ? { ...d, permit: msg.permit! } : d)) } });
          else if (msg.level) apply({ autonomy: { ...a, level: msg.level } });
          break;
        }
        case "set_goal":
          s.goal = msg.text;
          apply({ goal: msg.text });
          break;
        case "place_machine":
          apply({
            machines: [{ id: `${msg.machineType}-${s.tick}`, type: msg.machineType, x: msg.x, y: msg.y, district: msg.district, harness: msg.harness, powerId: msg.harness ? `solar-${msg.harness}` : undefined, tier: 1, state: "idle" }],
          });
          break;
        case "remove_machine":
          apply({ removed: [{ kind: "machine", id: msg.id }] });
          break;
        case "move_machine": {
          const m = s.machines.find((x) => x.id === msg.id);
          const taken = s.machines.some((x) => x.id !== msg.id && Math.abs(x.x - msg.x) < 2 && Math.abs(x.y - msg.y) < 2);
          if (m && !taken) apply({ machines: [{ ...m, x: msg.x, y: msg.y }] });
          break;
        }
        case "set_harness": {
          const m = s.machines.find((x) => x.id === msg.machineId);
          if (m?.type !== "assembler") break;
          const plant = s.power.find((p) => p.id === `solar-${msg.harness}`);
          apply({ machines: [{ ...m, harness: msg.harness, powerId: plant ? plant.id : m.powerId }] });
          log("info", `${m.id} now runs on ${SOLAR_NAME[msg.harness] ?? msg.harness}`, m.id);
          break;
        }
        case "connect_source":
          connectMine(msg.kind);
          break;
        case "connect_belt":
          apply({ belts: [{ id: `belt-${s.tick}-${msg.from}`, from: msg.from, to: msg.to, carries: msg.carries }] });
          break;
        default:
          break;
      }
    },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      timers.forEach(clearTimeout);
      onStatus("offline");
    },
  };
}
