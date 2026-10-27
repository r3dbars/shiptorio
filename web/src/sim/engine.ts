// A fake factory that speaks the same protocol as the server, so the UI never waits on
// the backend. Scenarios are scripted and double as demo replays.
//
// The sim also plays Spark the Foreman (docs/PRODUCT.md): it logs tool calls in Spark's
// voice, asks before building (autonomy starts at Advisor), puts the bottleneck on the
// Next Move card, and keeps the HUD metrics. Spark never writes code; the assemblers do.

import { ghostSpots } from "../map/ghosts";
import { actionLabel } from "../ui/stationCopy";
import { mineUnlocked } from "../ui/whatsNext";
import {
  SCIENCE_FOR,
  findFunnelDrop,
  MEASURE_DAYS,
  updateExperiment,
  type Experiment,
  type FunnelStep,
  type FunnelWindow,
  canSetPriority,
  checkStationId,
  insertCheck,
  lineOrder,
  withPriority,
  researchBlocked,
  researchedChecks,
  suggestResearch,
  techById,
  type Autonomy,
  type Belt,
  type Brain,
  type Bottleneck,
  type District,
  type FactoryState,
  type Harness,
  type HoldingBack,
  type Item,
  type ItemKind,
  type Machine,
  type Metrics,
  type Move,
  type MoveKind,
  type OreSource,
  type Patch,
  type PowerSource,
  type ServerToWeb,
  type Stage,
  type Station,
  type StationKind,
  type ThoughtDecision,
  type WebToServer,
  GOALS,
  goalMove,
  goalsFromPick,
  goalText,
  inferGoals,
  type Goals,
} from "@shiptorio/shared";
import type { Listener, Source, StatusListener } from "../source";
import { simSupport, SUPPORT_MAIL, type SimMail } from "./support";

const TICK_MS = 1400; // a calm floor: one beat every 1.4s (was 0.9s, Justin's playtest 2026-10-27: "slow everything down")

interface SparkLine {
  tool: string;
  text: string;
  reason?: string;
  outcome?: string; // the decision log's short outcome, when the floor log line says more
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
  route?: { to: Harness; why: string }; // the planner's pick of power plant for it, and why (geothermal scenario)
}

// The growth loop (shared/src/growth.ts): a funnel step drops in PostHog, the planner proposes an experiment,
// it ships through the gauntlet, and the measure station calls it. `after` is the step's real rate once it ships.
interface GrowthDrop {
  at: number;
  step: FunnelStep;
  district: string;
  entered: number; // people/day into the step
  before: number; // the step's rate the week before
  dropped: number; // the rate since the drop
  after: number; // the rate once the experiment ships
  title: string;
  hypothesis: string;
  change: Experiment["change"];
  why: string; // the card's line: what dropped and who it costs
  spark: SparkLine[];
}

// The bottleneck brain (docs/BRAIN.md): one diagnosis at a time, each a Continue/Later card. Mirrors the eval
// cases in server/scripts/brain-eval/cases.ts, so ?source=sim&scenario=brain plays what the eval grades.
interface BrainBeat {
  area: "ship" | "speed" | "quality" | "users" | "feedback" | "focus";
  reads: SparkLine[]; // the signals the brain reads before naming it
  title: string; // the bottleneck, plain words
  why: string; // who it hurts, with the number
  card: string; // the unlock's headline
  because: string; // under 20 words, cites the number
  kind: MoveKind;
  cleared: string; // what the floor log says once the unlock worked
}
// The demo shop's README, as the goal guess reads it: a live store whose customers hit checkout bugs.
const SIM_README = "# Demo shop\nA small online store. Customers report checkout errors and crashes on Safari; we fix bugs fast and keep it stable. Support: email us.";

interface Scenario {
  ores: Ore[];
  brain?: { beats: BrainBeat[]; quiet: string }; // the bottleneck brain deals these in order, then goes quiet
  growth?: GrowthDrop[]; // funnel drops from the PostHog mine, each one an experiment card
  districts?: District[];
  harness?: Harness; // who builds; the player's subscription
  unplugged?: boolean; // first run: no subscription yet, so the assembler sits dark until you sign in
  checkin?: boolean; // deal a full check-in deck on start (docs/PRODUCT.md "Check-in")
  onboard?: boolean; // first run from the start: Spark scans the repo, then proposes the starter factory
  intro?: boolean; // the welcome tour (ui/IntroTour.tsx): fast and quiet, and the tour cues each beat
  permits?: string[]; // lanes that start with a launch permit
  science?: FactoryState["science"]; // packs already shipped, so the research tree has something to spend
  rockets?: number; // PRs already shipped
  support?: SimMail[]; // customer mail at the support well (sim/support.ts)
  geothermal?: boolean; // the runner found a local model: a free, capped geothermal plant runs small, low-risk jobs
  overnight?: Shipped[]; // PRs that shipped before you opened the app, with when (the comeback time-lapse replays them)
  waiting?: Omit<Shipped, "hoursAgo">; // a PR that passed every check overnight and waits on the pad for your launch
  brain?: BrainStep[]; // the bottleneck brain's picks, one at a time (docs/BRAIN.md): the map piles each one up
}

// One bottleneck the brain names (FactoryState.holdingBack) and the one unlock card it deals. It gets worse while it
// waits; Continue works it off and it clears; Later parks it. Then the next one, round and round.
interface BrainStep {
  area: HoldingBack["area"];
  signal: string;
  title: string;
  why: string;
  unlock: string;
  because: string;
  kind: Move["kind"];
}

// A PR that already shipped when the scenario opens: real launch times, so "while you were away" can count them.
interface Shipped {
  hoursAgo: number;
  pr: number;
  title: string;
  kind: ItemKind;
  district: string;
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

// the demo shop plus its marketing site: the growth loop's district
const GROWTH_DISTRICTS: District[] = [...SHOP_DISTRICTS.slice(0, 3), { name: "landing", x: 22, y: 0, w: 5, h: 4, files: 18 }, { name: "docs", x: 29, y: 0, w: 3, h: 2, files: 6 }];

export const SCENARIOS = {
  // Judge replay uses the ordinary protocol and gauntlet; captions live outside the map.
  judge: {
    districts: SHOP_DISTRICTS,
    harness: "claude_code",
    ores: [
      { at: 2, title: "TypeError: cart.total is undefined", kind: "bug", district: "checkout", source: "sentry", users: 112,
        ask: "Guard cart.total and prove coupon checkout works with an empty cart.",
        failAt: "verify", failFirst: "Empty-cart checkout still crashes: reproduce before, prove after",
        spark: [{ tool: "get_sentry_issue", text: "Sentry: checkout crash affects 112 users" }, { tool: "triage", text: "Checkout is the highest-value repair" }] },
      { at: 4, title: "Email: checkout broke", kind: "bug", district: "checkout", source: "inbox", reporter: "dana@example.com",
        linkTo: "TypeError: cart.total is undefined", spark: [{ tool: "get_feedback", text: "Inbox: Dana cannot check out" }] },
      { at: 6, title: "Clarify the shipping FAQ", kind: "cleanup", district: "docs", source: "github_issue" },
    ],
  },
  "quiet-morning": {
    ores: [
      { at: 2, title: "Checkout button spins forever on Safari", kind: "bug", district: "web" },
      { at: 6, title: "Add dark mode toggle", kind: "feature", district: "web", failAt: "review", failFirst: "swallows the theme load error instead of handling it" },
      { at: 11, title: "Missing tests for webhook signatures", kind: "tests", district: "server" },
      { at: 16, title: "Remove dead map cache code", kind: "cleanup", district: "server" },
    ],
  },
  // The bottleneck brain, beat by beat: red CI, a crash spike, an unanswered inbox, a feature nobody found,
  // then nothing worth a card. Continue clears each one; Later moves on without nagging.
  brain: {
    districts: SHOP_DISTRICTS,
    harness: "claude_code",
    // One late ore, once the brain has dealt its cards: an earlier one's launch card would jump the brain's.
    ores: [{ at: 45, title: "Clarify the shipping FAQ", kind: "cleanup", district: "docs" }],
    brain: {
      quiet: "Everything's under the bar: CI 6 min, 8 quiet errors, inbox clear. Staying quiet.",
      beats: [
        { area: "speed", kind: "unblock", title: "Main has been red for 5 hours", why: "4 PRs can't merge until checkout.test.ts passes again.",
          card: "Get main green again", because: "Nothing ships while main is red; 4 PRs wait on it.", cleared: "Main is green. 4 PRs moving again.",
          reads: [{ tool: "read_signal", text: "CI: main red 5 h, run #4812 failed in checkout.test.ts", reason: "Heaviest signal" }, { tool: "read_signal", text: "Sentry: 8 open errors, flat", reason: "Is production burning too?" }] },
        { area: "quality", kind: "unblock", title: "A new crash hit 331 users overnight", why: "TypeError: cart.total is undefined, 2,180 events since last night.",
          card: "Chase down the checkout crash", because: "331 people hit it overnight; nothing else is close.", cleared: "Crash gone: 0 events in the last hour.",
          reads: [{ tool: "read_signal", text: "Sentry: cart.total is undefined, 331 users, first seen 14 h ago", reason: "New spike" }] },
        { area: "feedback", kind: "reply", title: "23 people wrote in, no reply", why: "Oldest has waited 4 days; 9 are about CSV export.",
          card: "Answer the people who wrote in", because: "23 customers waiting, oldest 4 days.", cleared: "Inbox answered. Oldest wait now 2 h.",
          reads: [{ tool: "read_signal", text: "Inbox: 23 unanswered, oldest 96 h", reason: "Customers waiting" }, { tool: "read_signal", text: "PostHog: 420 a day, steady", reason: "Is usage the bigger problem?" }] },
        { area: "users", kind: "input", title: "Saved cards: 3 of 420 used it", why: "It shipped 14 days ago and almost nobody has found it.",
          card: "Tell people about saved cards", because: "3 of 420 people found it in two weeks.", cleared: "62 people used saved cards today.",
          reads: [{ tool: "read_signal", text: "PostHog: saved_card_used 3 users in 14 days", reason: "Shipped but unused" }] },
      ],
    },
  },
  // A busy morning: issues land faster than one builder can take them, so work waits on it and a card offers a
  // second builder (docs/GAMEPLAY-PICKS.md r5-second).
  pileup: {
    ores: [
      { at: 2, title: "Coupon field rejects lowercase codes", kind: "bug", district: "web" },
      { at: 3, title: "Order emails show the wrong currency", kind: "bug", district: "server" },
      { at: 4, title: "Add a loading state to the cart drawer", kind: "feature", district: "web" },
      { at: 5, title: "Missing tests for refund webhooks", kind: "tests", district: "server" },
      { at: 6, title: "Remove the old promo banner", kind: "cleanup", district: "web" },
      { at: 7, title: "Search ignores product tags", kind: "bug", district: "server" },
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
  // The support mine (docs/context/support-mine.md): customer email and Intercom chats come up the support well.
  // Dana's checkout bug links to the Sentry crash on the floor, Rio's coupon bug gets filed as an issue, Lee's
  // question and Sam's feature ask get answers, spam is closed. Every reply waits on your tap, and each fix that
  // launches drafts an "it's fixed" reply.
  support: {
    districts: SHOP_DISTRICTS,
    harness: "claude_code",
    rockets: 3,
    support: SUPPORT_MAIL,
    ores: [
      { at: 1, title: "Add order notes to the cart", kind: "feature", district: "cart" },
      {
        at: 2,
        title: "TypeError: cart.total is undefined",
        kind: "bug",
        district: "checkout",
        source: "sentry",
        users: 112,
        spark: [{ tool: "get_sentry_issue", text: "New error on /checkout: TypeError: cart.total is undefined, 112 users", reason: "Sentry webhook" }],
      },
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
  // The growth loop (docs/context/growth-loop.md): the first loop past code. PostHog shows /cart → /checkout
  // falling off, the planner proposes a clearer checkout button, it ships through the gauntlet, and the measure
  // station calls a lift. Then /pricing → /signup slips, the planner tries shorter signup copy, and it's a wash.
  growth: {
    districts: GROWTH_DISTRICTS,
    harness: "claude_code",
    ores: [{ at: 12, title: "Fix typo in shipping FAQ", kind: "cleanup", district: "docs" }],
    growth: [
      {
        at: 2,
        step: { from: "/cart", to: "/checkout", label: "/cart → /checkout" },
        district: "checkout",
        entered: 420,
        before: 0.45,
        dropped: 0.31,
        after: 0.37,
        change: "cta",
        title: "Experiment: \"Pay $42 now\" button on the cart",
        hypothesis: "The new cart button just says Continue. Putting the total and \"Pay now\" on it should win back a chunk of the /cart → /checkout drop.",
        why: "/cart → /checkout fell from 45% to 31% since Thursday. About 59 people a day leave at the cart.",
        spark: [
          { tool: "read_posthog", text: "PostHog: /cart → /checkout 31% yesterday vs 45% the week before (−31%)", reason: "Funnel poll" },
          { tool: "propose_experiment", text: "Proposed a test: put the total and \"Pay now\" on the cart button", reason: "The drop started the day the button copy changed to Continue" },
        ],
      },
      {
        at: 40,
        step: { from: "/pricing", to: "/signup", label: "/pricing → /signup" },
        district: "landing",
        entered: 300,
        before: 0.22,
        dropped: 0.16,
        after: 0.161,
        change: "copy",
        title: "Experiment: shorter signup copy on pricing",
        hypothesis: "Cutting the pricing page's three paragraphs to one line should get more people to click Sign up.",
        why: "/pricing → /signup slipped from 22% to 16%. About 18 people a day stop at pricing.",
        spark: [
          { tool: "read_posthog", text: "PostHog: /pricing → /signup 16% yesterday vs 22% the week before (−27%)", reason: "Funnel poll" },
          { tool: "propose_experiment", text: "Proposed a test: one-line pricing copy above the Sign up button", reason: "Scroll depth on /pricing dropped with the step" },
        ],
      },
    ],
  },
  // The swipe check-in from docs/PRODUCT.md: you open the app and a deck is waiting.
  // The bottleneck brain (docs/BRAIN.md): the factory runs, and the one thing holding you back shows up where it lives in
  // the shaft, piling up until you act on its card.
  brain: {
    ores: [
      // every source the brain reads is plugged in, so each pile lands on a live mine
      { at: 2, title: "TypeError: cart.total is undefined", kind: "bug", district: "web", source: "sentry", users: 230 },
      { at: 9, title: "Email: dark mode, please", kind: "feature", district: "web", source: "inbox", reporter: "sam@example.com" },
      { at: 16, title: "Pricing page: nobody clicks Start", kind: "feature", district: "web", source: "posthog" },
      { at: 24, title: "Missing tests for webhook signatures", kind: "tests", district: "server" },
    ],
    brain: [
      { area: "quality", signal: "sentry:errors_piling:repo", title: "Errors are piling up", why: "14 checkout errors hit 230 users this week, none triaged.", unlock: "Triage the 14 new errors", because: "14 errors, 230 users, none triaged yet.", kind: "verify" },
      { area: "speed", signal: "ci:ci_slow:repo", title: "CI is clogging the line", why: "CI went from 6 to 14 min, and every PR waits on it.", unlock: "Cache installs in CI", because: "Runs take 14 min, up from 6 last week.", kind: "automate" },
      { area: "feedback", signal: "feedback:feedback_unanswered:repo", title: "People wrote in, nobody answered", why: "11 people wrote this week and 9 got no reply.", unlock: "Reply to the 9 waiting", because: "9 of 11 messages this week have no reply.", kind: "reply" },
      { area: "users", signal: "posthog:usage_flat:repo", title: "Nobody is using what ships", why: "You shipped 6 PRs this week; daily users stayed at 3.", unlock: "Ask 5 users what they need", because: "6 PRs shipped, daily users flat at 3.", kind: "input" },
      { area: "ship", signal: "repo:prs_stale:repo", title: "PRs are going stale", why: "4 PRs have waited 3+ days to merge.", unlock: "Review the oldest PR", because: "4 PRs waiting, the oldest for 3 days.", kind: "review" },
    ],
  },
  checkin: {
    districts: SHOP_DISTRICTS,
    harness: "claude_code",
    checkin: true,
    // the night before you opened the app: four PRs shipped, and #143 cleared the gauntlet and waits on you
    rockets: 12,
    overnight: [
      { hoursAgo: 9.5, pr: 138, title: "Null cart items crash the cart badge", kind: "bug", district: "cart" },
      { hoursAgo: 7, pr: 140, title: "Coupon field keeps trailing spaces", kind: "bug", district: "checkout" },
      { hoursAgo: 4.5, pr: 141, title: "Document the refund webhook", kind: "cleanup", district: "docs" },
      { hoursAgo: 1.5, pr: 142, title: "Tests for webhook signatures", kind: "tests", district: "api" },
    ],
    waiting: { pr: 143, title: "Guard empty carts at checkout", kind: "bug", district: "checkout" },
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
  // Geothermal power (docs/PRODUCT.md power table): the runner found a local model on your computer, so a free,
  // capped geothermal plant sits next to the Claude solar plant. The planner routes the small, low-risk docs fix
  // to it and the bigger bug to Claude. Both ride the whole gauntlet to a rocket.
  geothermal: {
    harness: "claude_code",
    geothermal: true,
    ores: [
      {
        at: 2,
        title: "Fix typo in README setup steps",
        kind: "cleanup",
        district: "docs",
        route: { to: "local", why: "small docs job, 1 file, low risk, so it runs on free local power" },
      },
      {
        at: 4,
        title: "Checkout total ignores the coupon after a refresh",
        kind: "bug",
        district: "web",
        users: 42,
        route: { to: "claude_code", why: "a bug across 4 files with 42 users waiting, too big and risky for the local model" },
      },
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
const GEO_PLANT = "geo-local"; // the runner's local model, same id the live server uses

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
const MEASURE: StationDef = { id: "measure-1", kind: "measure", name: "Measure station", caught: 0, actions: [act("next", "Suggest the next experiment", true), act("rollback", "Roll back the last experiment")] };
const DAY_TICKS = 2; // the measure station's "day", sim-sized
const ORBIT: StationDef = { id: "orbit-1", kind: "orbit", name: "Orbit watch", caught: 0, actions: [act("changed", "See what changed"), act("rollback", "Roll back the last launch")] };
// The rest of the repo's open issues: what "pull in more" brings onto the belt once the scripted ore runs out.
const BACKLOG: { title: string; kind: Item["kind"]; docs?: boolean }[] = [
  { title: "Search shows stale results after an edit", kind: "bug" },
  { title: "Fix the broken link in the setup guide", kind: "cleanup", docs: true },
  { title: "Add a keyboard shortcut to save", kind: "feature" },
  { title: "Flaky test: session expiry", kind: "tests" },
  { title: "Error toast hides the retry button on phones", kind: "bug" },
  { title: "Remove the unused beta flag", kind: "cleanup" },
  { title: "Explain the env vars in the README", kind: "cleanup", docs: true },
  { title: "Cover the empty cart with a test", kind: "tests" },
];
const QUIET_TICKS = 12; // after "not now", how long the planner waits before asking again
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
  if (sc.geothermal) {
    // the local model gets its own assembler under the Claude one, and the plants line up in a row below them
    const at = (id: string, x: number, y: number) => Object.assign(machines.find((m) => m.id === id)!, { x, y });
    at("steam-spark", -3, 6);
    if (harness !== "spark" && !sc.unplugged) at(plant, 3, 6);
    machines.push(
      { id: GEO_PLANT, type: "geothermal", x: 0, y: 6, tier: 1, state: "idle" },
      { id: "assembler-local", type: "assembler", x: 0, y: 3, harness: "local", powerId: GEO_PLANT, tier: 1, state: "idle" },
    );
    power.push({ id: GEO_PLANT, kind: "geothermal", name: "Your computer", level: 0.75, online: true });
  }
  if (sc.ores.some((o) => o.source === "sentry")) machines.push({ id: "ore-sentry", type: "ore_deposit", x: -6, y: -3, tier: 1, state: "idle" });
  if (sc.ores.some((o) => o.source === "inbox") || sc.support) machines.push({ id: "ore-inbox", type: "ore_deposit", x: -6, y: 3, tier: 1, state: "idle" });
  if (sc.growth) machines.push({ id: "measure-1", type: "inspector", x: 18, y: 3, tier: 1, state: "idle" });
  if (sc.growth || sc.ores.some((o) => o.source === "posthog")) machines.push({ id: "ore-posthog", type: "ore_deposit", x: -6, y: sc.ores.some((o) => o.source === "inbox") || sc.support ? 6 : 3, tier: 1, state: "idle" });
  const chain = ["ore-issues", "splitter-1", "assembler-1", ...GAUNTLET.map((g) => g.id), "launch-pad"];
  const belts: Belt[] = chain.slice(1).map((to, i) => ({ id: `belt-${i + 1}`, from: chain[i], to }));
  if (sc.geothermal) belts.push({ id: "belt-local-in", from: "splitter-1", to: "assembler-local" }, { id: "belt-local-out", from: "assembler-local", to: GAUNTLET[0].id });
  const districts = sc.districts ?? REPO_DISTRICTS;
  const mines = (["sentry", "posthog"] as const).filter((kind) => sc.ores.some((o) => o.source === kind) || (kind === "posthog" && sc.growth));
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
    brain: { model: "sim", online: true, decisions: 0, fallbacks: 0, thoughts: [], score: { plans: 0, shipped: 0, reviews: 0, catches: 0, open: [] } },
    // Mines this scenario's ore comes from show as plugged in, so the map doesn't offer to connect them.
    sources: mines.length || sc.support ? [...mines.map((kind) => ({ kind, state: "connected" as const, detail: `${kind === "sentry" ? "Sentry" : "PostHog"} connected (sim)`, eventsToday: 0, setup: { steps: [] } })), ...(sc.support ? [{ kind: "email" as const, state: "connected" as const, detail: "Support mine connected (sim)", eventsToday: 0, setup: { steps: [] } }] : [])] : undefined,
    support: sc.support ? [] : undefined,
    experiments: sc.growth ? [] : undefined,
    // A brand-new factory has caught nothing yet, so its first second doesn't hand out "Caught it".
    stations: [...GAUNTLET, ORBIT, ...(sc.growth ? [MEASURE] : [])].map((g) => ({ id: g.id, kind: g.kind, name: g.name, machineId: g.id, wip: 0, caughtThisWeek: sc.onboard ? 0 : g.caught, actions: g.actions })),
  };
}

// How many ticks an item spends in each step.
const DWELL: Partial<Record<Item["state"], number>> = { ore: 2, queued: 2, working: 4, inspecting: 3, rejected: 2, on_pad: 4 };

// Where each item state sits in the bottleneck table.
const STAGE_OF: Partial<Record<Item["state"], Stage>> = { ore: "intake", queued: "build", working: "build", inspecting: "inspect", rejected: "inspect", on_pad: "pad", passed: "pad" };

const shipScore = (m: Metrics) => m.usersUnblocked + 10 * m.customersAnswered + m.rockets - 25 * m.escapedDefects;

export function connectSim(name: ScenarioName, onMessage: Listener, onStatus: StatusListener, repo?: string): Source {
  const sc: Scenario = SCENARIOS[name];
  // The public judge story promises 100 ticks in 90 seconds; ordinary play stays slower.
  const tickMs = name === "judge" ? 900 : sc.intro ? 700 : TICK_MS;
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
  const offeredMines = new Set<string>(); // empty mines the planner already suggested
  let quietUntil = 0; // tick the planner may ask again after a "not now"
  let backlogAt = 0; // next open issue to pull from the backlog
  // more open issues, in this repo's own folders
  const backlogOre = (n: number): Ore => {
    const b = BACKLOG[n % BACKLOG.length];
    const names = (sc.districts ?? REPO_DISTRICTS).map((d) => d.name).filter((d) => d !== "/");
    const district = b.docs && names.includes("docs") ? "docs" : names.filter((d) => d !== "docs")[n % Math.max(1, names.length - 1)] ?? names[0];
    return { at: 0, title: b.title, kind: b.kind, district };
  };
  let lastSpark = 0; // tick of Spark's last tool call
  const byTitle = new Map<string, string>(); // ore title -> item id, for linking
  const onChoose = new Map<string, (optionId: string) => void>(); // move id -> what each answer does
  const pending: Move[] = []; // moves waiting behind the open card
  const undos = new Map<string, () => void>();
  const failAt = new Map<string, StationKind | undefined>(); // item id -> station that catches the scripted failure
  const failCheck = new Map<string, string | undefined>(); // item id -> researched check that would catch it first
  const builtBy = new Map<string, string | undefined>(); // item id -> assembler that built it
  const routes = new Map<string, NonNullable<Ore["route"]>>(); // item id -> the scripted routing pick
  const routed = new Map<string, Harness>(); // item id -> the harness (and so the power plant) the planner picked
  const watching = new Map<string, number>(); // launched item id -> tick orbit watch stops
  const comebacks = new Map<string, string>(); // item id -> what orbit watch will catch after its first launch
  const trips = new Map<string, number>(); // launched item id -> tick its comeback lands
  const stats = new Map<string, { passed: number; failed: number; caught?: number; lastLog?: Station["lastLog"] }>();
  // ?autolaunch merges PRs on the pad by itself, for hands-off demo replays.
  const autoLaunch = new URLSearchParams(location.search).has("autolaunch");
  let pr = 140;
  let seq = 0;
  // what already shipped before this visit, at its real launch time, and the PR left waiting on the pad
  const opened = Date.now();
  const shippedItem = (x: Omit<Shipped, "hoursAgo">, at: number, state: Item["state"]): Item => ({
    id: `pr-${x.pr}`, kind: x.kind, source: "github_issue", title: x.title, district: x.district, state,
    prNumber: x.pr, prUrl: `https://github.com/${s.repo}/pull/${x.pr}`, attempts: 1, updatedAt: at,
    ...(state === "launched" ? { orbit: { since: at, until: at + 24 * 3600_000, state: "clear" as const, at: at + 3600_000, prNumber: x.pr } } : { machineId: "gate-1" }),
  });
  for (const x of sc.overnight ?? []) s.items.push(shippedItem(x, opened - x.hoursAgo * 3600_000, "launched"));
  if (sc.waiting) (s.items.push(shippedItem(sc.waiting, opened - 20 * 60_000, "on_pad")), since.set(`pr-${sc.waiting.pr}`, 0));
  pr = Math.max(pr, ...s.items.map((i) => i.prNumber ?? 0));

  const THOUGHT_FOR: Partial<Record<string, ThoughtDecision>> = { read_feedback: "support", draft_customer_reply: "support", triage: "triage", link_items: "triage", start_job: "plan", request_rework: "plan", escalate: "review", read_repo: "rank", set_autonomy: "permit", route: "route", propose_experiment: "growth", diagnose: "diagnose" };
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
    if (line.tool === "start_job" && opts.itemId) planned(opts.itemId);
    if (decision && s.brain) {
      const item = opts.itemId ? s.items.find((i) => i.id === opts.itemId) : undefined;
      s.brain = { ...s.brain, decisions: s.brain.decisions + 1, thoughts: [{ id: `t-${++seq}`, at: Date.now(), decision, by: "spark" as const, model: "sim", ms: 600 + (seq % 7) * 180, itemId: opts.itemId, title: item?.title ?? line.text, outcome: line.outcome ?? line.text, reason: line.reason ?? "From the floor state.", simulated: true }, ...s.brain.thoughts].slice(0, 40) };
      emit({ type: "patch", patch: { brain: s.brain } });
    }
  };

  // The scorecard, same rules as the live one (server/src/brain.ts): plans opened, shipped, reviews and catches.
  const score = (fn: (sc: NonNullable<Brain["score"]>) => NonNullable<Brain["score"]>) => {
    if (!s.brain) return;
    s.brain = { ...s.brain, score: fn(s.brain.score ?? { plans: 0, shipped: 0, reviews: 0, catches: 0, open: [] }) };
    emit({ type: "patch", patch: { brain: s.brain } });
  };

  const planned = (id: string) => score((sc) => (sc.open.includes(id) ? sc : { ...sc, plans: sc.plans + 1, open: [id, ...sc.open].slice(0, 50) }));

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
    if (p.holdingBack !== undefined) s.holdingBack = p.holdingBack;
    if (p.research) s.research = p.research;
    if (p.support) s.support = p.support;
    if (p.experiments) s.experiments = p.experiments;
    if (p.goals) s.goals = p.goals;
    if (p.goal !== undefined) s.goal = p.goal;
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
  const propose = (move: Omit<Move, "id" | "createdAt">, then: (optionId: string) => void): string => {
    if (sc.intro) return ""; // the tour's own cards do the asking
    const m: Move = { ...move, id: `move-${++seq}`, createdAt: Date.now() };
    onChoose.set(m.id, then);
    if (s.move) pending.push(m);
    else open(m);
    dealDeck();
    return m.id;
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
      // A card retracted while it waited to open (a sent reply clears its ticket's other cards) stays closed.
      if (next) later(delay, () => {
        if (s.move) { if (onChoose.has(next.id)) pending.unshift(next); dealDeck(); }
        else if (onChoose.has(next.id)) open(next);
        else if (pending.length) open(pending.shift()!);
        else dealDeck();
      });
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
  // Swipe left: later. It goes to the back of the deck (a real server holds it for the next check-in),
  // unless the card parks itself on Later (the brain's unlock cards): then it leaves the deck.
  const onLater = new Map<string, () => void>();
  const defer = (moveId: string) => {
    const park = onLater.get(moveId);
    if (park) {
      onLater.delete(moveId);
      onChoose.delete(moveId);
      emit({ type: "move_resolved", moveId, optionId: "later", actor: "player" });
      pull(moveId, 0);
      return park();
    }
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
          { id: "go", label: "Go", recommended: true, actions: [{ tool: "start_job", args: { itemId: item.id, machineId: asm?.id }, reason: "It's the most useful thing waiting." }] },
          { id: "skip", label: "Not now", recommended: false, actions: [] },
        ],
      },
      (opt) => {
        held.delete(item.id);
        if (opt !== "go") {
          const cur = s.items.find((i) => i.id === item.id);
          if (cur) apply({ items: [withPriority(cur, "park")] }); // the cart's callout offers Unpark
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
        title: `Launch #${item.prNumber}: ${item.title}`, // same card the live gauntlet deals (server/src/gauntlet.ts)
        why: users ? `Merging #${item.prNumber} closes the crash hitting ${users} users.` : "Tested, proven and reviewed. Hold to launch it.",
        stage: "pad",
        kind: "ship",
        focus: "gate-1",
        evidence: lineNow().filter((g) => g.kind !== "merge").map((g) => ({ station: g.name, ok: true })),
        itemId: item.id,
        options: [
          { id: "launch", label: `Launch #${item.prNumber}`, recommended: true, actions: [{ tool: "request_merge", args: { pr: item.prNumber }, reason: "Every check passed, so it's safe to ship." }] },
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
          { id: "send", label: "Send", recommended: true, actions: [{ tool: "send_customer_reply", args: { to }, reason: "The fix is live, so they'll want to know." }] },
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

  // ---------- the support well (sim/support.ts) ----------

  const support = sc.support
    ? simSupport(sc.support, {
        tick: () => s.tick - (clock0 === Infinity ? s.tick : clock0),
        state: () => s,
        setSupport: (tickets) => apply({ support: tickets }),
        itemId: (title) => byTitle.get(title),
        think: (tool, text, reason, opts) => spark({ tool, text, reason }, { itemId: opts.itemId, target: "ore-inbox" }),
        log,
        propose,
        retract: (moveId) => {
          if (!onChoose.delete(moveId)) return;
          emit({ type: "move_resolved", moveId, actor: "player" });
          pull(moveId, 0);
        },
        fileIssue: (title, district) => {
          arrive({ at: 0, title, kind: "bug", district }, Date.now());
          return byTitle.get(title)!;
        },
        answered: () => bumpMetrics({ customersAnswered: s.metrics!.customersAnswered + 1 }),
      })
    : null;

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
    if (o.route) routes.set(item.id, o.route);
    failCheck.set(item.id, o.failCheck);
    byTitle.set(o.title, item.id);
    if (o.ask) asks.set(item.id, o.ask);
    apply({ items: [item] });
    if (!o.spark) log("info", `Ore: ${o.title}`, item.id);
  };

  // The planner picks a power plant for each job: small, low-risk work goes to the free geothermal plant,
  // bigger or riskier work to a subscription. Either way it rides the full gauntlet.
  const routeItem = (item: Item) => {
    const route = routes.get(item.id);
    if (!route || routed.has(item.id)) return;
    const asm = s.machines.find((m) => m.type === "assembler" && m.harness === route.to && m.powerId);
    const plant = asm && s.power.find((p) => p.id === asm.powerId);
    if (!asm || !plant) return;
    routed.set(item.id, route.to);
    const where = plant.kind === "geothermal" ? `${plant.name.toLowerCase()} (geothermal)` : `${plant.name} (solar)`;
    spark({ tool: "route", text: `Routed "${item.title}" to ${where}: ${route.why}`, reason: route.why, outcome: `${item.kind} in /${item.district} → ${where}` }, { itemId: item.id, target: plant.id });
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
    support?.tick();
    while (growthScript.length && growthScript[0].at + clock0 <= s.tick) funnelDrop(growthScript.shift()!, now);
    measureTick(now);

    // rushed work moves first; parked work sits where it is until Unpark (shared/src/priority.ts)
    for (const item of lineOrder(s.items)) {
      const age = s.tick - (since.get(item.id) ?? s.tick);
      if (age < (DWELL[item.state] ?? Infinity)) continue;
      const next = { ...item, updatedAt: now };
      switch (item.state) {
        case "ore":
          if (!machine("splitter")) continue;
          apply({ items: [{ ...next, state: "queued" }] });
          log("info", `Splitter sorted "${item.title}" → ${item.district}`, item.id);
          routeItem(item);
          if (asks.has(item.id)) {
            held.add(item.id);
            askToBuild(item);
          }
          break;
        case "queued": {
          // Spark's pick goes first: nothing else starts while its "fix this first" waits on your Go
          if (held.size || item.priority === "park") continue;
          // the local model only takes what the planner routed to it; routed work waits for its own plant
          const want = routed.get(item.id);
          const a = s.machines.find((m) => m.type === "assembler" && m.state === "idle" && m.powerId && (want ? m.harness === want : m.harness !== "local"));
          if (!a) {
            if (!want) offerBuilder(item.id);
            continue;
          }
          apply({ items: [{ ...next, state: "working", machineId: a.id, attempts: item.attempts + 1 }], machines: setMachine(a.id, "working") });
          log("info", `${a.id} picked up "${item.title}"`, item.id);
          planned(item.id);
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
            if (st.kind === "review") score((sc) => ({ ...sc, reviews: sc.reviews + 1, catches: sc.catches + 1 }));
            record(st, false, `#${item.prNumber} ${failure}. Back to the planner on the rework belt.`);
            log("warn", `${st.name} rejected PR #${item.prNumber}: ${failure}`, item.id);
            spark({ tool: "request_rework", text: `Re-planning #${item.prNumber} with the ${lc(st.name)} scar, then back to ${builtBy.get(item.id) ?? "the assembler"}`, reason: failure }, { itemId: item.id, target: "splitter-1" });
            suggestNow();
            break;
          }
          record(st, true, `#${item.prNumber} passed.`);
          if (st.kind === "review") score((sc) => ({ ...sc, reviews: sc.reviews + 1 }));
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
    const won = s.experiments?.filter((e) => e.state === "won").reduce((k, e) => k * (1 + (e.lift ?? 0)), 1) ?? 1;
    const metrics = m.checkouts !== undefined && !crashing ? { ...m, checkouts: m.checkouts + Math.round(3 * won) } : m;
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
    // The line is caught up: the planner always deals the next real decision, so the game never goes quiet (#105).
    // First an empty mine to connect, then more open issues to pull in. "Not now" waits a while before asking again.
    const caughtUp = s.items.length > 0 && s.items.every((i) => i.state === "launched" || i.priority === "park");
    if (!sc.intro && clock0 !== Infinity && !script.length && caughtUp && !s.move && !pending.length && s.tick >= quietUntil) {
      // Mines unlock slowly (one per 3 rockets), so a new player isn't asked for two integrations after one win.
      const kind = mineUnlocked(s) ? ghostSpots(s)[0]?.kind : undefined;
      if (kind && !offeredMines.has(kind)) {
        offeredMines.add(kind);
        const label = kind === "sentry" ? "Sentry" : "PostHog";
        propose({ title: `Your fixes shipped. Connect ${label} next?`, why: "The line is caught up. Add another input so future customer signals can become the next fix.", stage: "intake", kind: "input", focus: `src:${kind}`, grows: ["+1 SOURCE"], plan: [`Open the ${label} mine on this sandbox island.`, "Future signals can feed the splitter; connecting a mine does not invent a customer problem."], options: [{ id: "connect", label: `Connect ${label}`, recommended: true, actions: [{ tool: "connect_source", args: { kind }, reason: "Grow the input loop after your first shipments." }] }, { id: "later", label: "Watch the factory for now", recommended: false, actions: [] }] }, option => {
          if (option === "connect") connectMine(kind);
          else quietUntil = s.tick + QUIET_TICKS;
        });
      } else {
        const batch = Array.from({ length: 3 }, (_, k) => backlogOre(backlogAt + k));
        propose({ title: `${batch.length} more open issues in ${s.repo}. Pull them in?`, why: `The line is idle. Next up: "${batch[0].title}", plus ${batch.length - 1} more.`, stage: "intake", kind: "input", focus: "ore-issues", grows: [`+${batch.length} ORE`], plan: batch.map((o) => `${o.title} (${o.kind}, /${o.district})`), options: [{ id: "pull", label: "Pull them in", recommended: true, actions: [{ tool: "list_issues", args: { limit: batch.length }, reason: "Keep the line fed." }] }, { id: "later", label: "Not now", recommended: false, actions: [] }] }, option => {
          if (option !== "pull") {
            quietUntil = s.tick + QUIET_TICKS;
            return;
          }
          backlogAt += batch.length;
          batch.forEach((o, k) => script.push({ ...o, at: s.tick - clock0 + 1 + k * 3 }));
          spark({ tool: "list_issues", text: `${batch.length} more open issues become ore at the deposit`, reason: "the line was idle" }, { target: "ore-issues" });
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
    return [...lineNow(), ORBIT, ...(sc.growth ? [MEASURE] : [])].map((g) => {
      const v = stat(g.id);
      const here = g.kind === "measure" ? s.items.filter((i) => s.experiments?.some((e) => e.itemId === i.id && e.state === "measuring")) : g.kind === "orbit" ? s.items.filter((i) => watching.has(i.id)) : s.items.filter((i) => i.machineId === g.id && (i.state === "inspecting" || i.state === "on_pad"));
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
    if (s.brain?.score?.open.includes(item.id)) score((sc) => ({ ...sc, shipped: sc.shipped + 1, open: sc.open.filter((x) => x !== item.id) }));
    log("success", `Rocket launched: PR #${item.prNumber} merged`, item.id);
    // any card still asking about this PR is answered now; a stale "Launch #N" would strand the player (#105)
    for (const m of [s.move, ...pending].filter((x) => x?.itemId === item.id)) {
      onChoose.delete(m!.id);
      emit({ type: "move_resolved", moveId: m!.id, optionId: "launch", actor: alone ? "spark" : "player" });
      pull(m!.id, 0);
    }
    startMeasuring(item, now);
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
    offerGoal();
    // the automated share counts rockets that launched on a permit
    const a = s.autonomy!;
    const launches = (a.launches ?? 0) + 1;
    const automated = (Math.round((a.automated ?? 0) * (a.launches ?? 0)) + (alone ? 1 : 0)) / launches;
    apply({ autonomy: { ...a, launches, automated, next: a.next?.level === "build" ? { ...a.next, have: a.next.have + 1 } : a.next } });
  };

  // ---------- player goals (shared/src/goals.ts) ----------

  // Earned after the first rocket: one card with the factory's guess, the same card the live server deals.
  let goalAsked = false;
  const setGoals = (goals: Goals) => {
    apply({ goals, goal: goalText(goals) });
    log("success", `Goal set: ${goals.picks.map((id) => GOALS[id].label).join(", ")}. The factory hunts for what blocks it.`);
  };
  const offerGoal = () => {
    if (goalAsked || sc.intro || s.goals?.by === "player") return;
    const guesses = inferGoals({ readme: SIM_README, sources: (s.sources ?? []).filter((x) => x.state === "connected").map((x) => x.kind) });
    const move = goalMove(s, s.goals, guesses, Date.now());
    if (!move) return;
    goalAsked = true;
    apply({ goals: { picks: guesses.slice(0, 3).map((g) => g.id), by: "inferred", at: Date.now(), why: guesses[0].why } });
    const { id: _id, createdAt: _at, ...card } = move;
    propose(card, (optionId) => {
      const goals = goalsFromPick(move.options.find((o) => o.id === optionId)?.actions[0]?.args.picks, Date.now(), s.metrics?.rockets);
      if (goals) setGoals(goals);
    });
  };
  // ---------- the bottleneck brain (docs/BRAIN.md) ----------

  // One pick at a time: it gets heavier while it waits (the pile on the map grows), Continue works it off until it
  // clears, Later parks it. Then the brain names the next one.
  const brainSteps = sc.brain ?? [];
  let brainAt = 0;
  const holding = (h: HoldingBack | null) => apply({ holdingBack: h });
  const brainNext = (ms: number) => brainSteps.length && later(ms, () => brainPick(brainSteps[brainAt++ % brainSteps.length]));
  const brainPick = (b: BrainStep) => {
    let h: HoldingBack = { id: b.signal, area: b.area, title: b.title, why: b.why, signalIds: [b.signal], confidence: 0.8, by: "spark", decidedAt: Date.now(), severity: 0.45 };
    let working = false;
    holding(h);
    spark({ tool: "diagnose", text: `${b.title}. ${b.why}`, reason: "the heaviest fresh signal, against your goal" });
    const worse = () => later(3000, () => {
      if (working || s.holdingBack?.id !== h.id) return;
      if (h.severity < 1) holding((h = { ...h, severity: Math.min(1, h.severity + 0.07) }));
      worse();
    });
    worse();
    const ease = () => later(1200, () => {
      const severity = h.severity - 0.15;
      if (severity < 0.35) {
        holding(null);
        log("info", `Cleared: ${b.title.toLowerCase()}`);
        brainNext(4000);
      } else {
        holding((h = { ...h, severity }));
        ease();
      }
    });
    propose(
      {
        title: b.unlock,
        why: b.why,
        because: b.because,
        kind: b.kind,
        attention: "suggest",
        options: [
          { id: "continue", label: "Continue", recommended: true, actions: [] },
          { id: "later", label: "Later", recommended: false, actions: [] },
        ],
      },
      (opt) => {
        if (opt === "continue") {
          working = true;
          ease();
        } else {
          holding(null);
          brainNext(4000);
        }
      },
    );
  };
  brainNext(3000);

  // ---------- the growth loop (shared/src/growth.ts) ----------

  const growthScript: GrowthDrop[] = [...(sc.growth ?? [])];
  const growthOf = new Map<string, GrowthDrop>(); // experiment id -> its script
  const measuringSince = new Map<string, number>(); // experiment id -> tick it launched
  const setExp = (e: Experiment) => apply({ experiments: [e, ...(s.experiments ?? []).filter((x) => x.id !== e.id)] });
  const expOf = (itemId: string) => s.experiments?.find((e) => e.itemId === itemId);

  // Explicit synthetic ordered cohorts; route traffic is never treated as conversion evidence.
  const funnelRows = (g: GrowthDrop, now: number): FunnelWindow[] => [
    { from: g.step.from, to: g.step.to, startsOn: new Date(now - 8 * 86400000).toISOString().slice(0, 10), endsOn: new Date(now - 2 * 86400000).toISOString().slice(0, 10), entered: g.entered * 7, converted: Math.round(g.entered * 7 * g.before), days: 7, ordered: true, unit: "unique_persons", evidence: "simulation", conversionWindowHours: 24 },
    { from: g.step.from, to: g.step.to, startsOn: new Date(now - 86400000).toISOString().slice(0, 10), endsOn: new Date(now - 86400000).toISOString().slice(0, 10), entered: g.entered, converted: Math.round(g.entered * g.dropped), days: 1, ordered: true, unit: "unique_persons", evidence: "simulation", conversionWindowHours: 24 },
  ];

  const funnelDrop = (g: GrowthDrop, now: number) => {
    const drop = findFunnelDrop(funnelRows(g, now), g.step, now);
    if (!drop) return;
    for (const line of g.spark) spark(line, { target: "ore-posthog" });
    const exp: Experiment = {
      id: `exp-${++seq}`,
      step: g.step,
      title: g.title,
      hypothesis: g.hypothesis,
      change: g.change,
      district: g.district,
      state: "proposed",
      // measured against the week at the dropped rate: did the change win people back?
      baseline: { entered: g.entered * 7, converted: Math.round(g.entered * 7 * g.dropped), days: 7 },
      windowDays: MEASURE_DAYS,
      proposedAt: now,
    };
    growthOf.set(exp.id, g);
    setExp(exp);
    propose(
      {
        title: `${g.step.label} fell ${drop.dropPct}%. Run an experiment?`,
        why: g.why,
        stage: "intake",
        kind: "build",
        focus: "ore-posthog",
        grows: ["+1 EXPERIMENT", "MEASURED"],
        plan: [g.hypothesis, "It ships as a normal PR through every station", `After the launch the measure station watches ${g.step.label} for ${MEASURE_DAYS} days and calls it`],
        options: [
          { id: "go", label: "Run it", recommended: true, actions: [{ tool: "start_experiment", args: { experiment: exp.id }, reason: `${g.step.label} −${drop.dropPct}%` }] },
          { id: "skip", label: "Not now", recommended: false, actions: [] },
        ],
      },
      (opt) => {
        const cur = s.experiments!.find((e) => e.id === exp.id)!;
        if (opt !== "go") {
          setExp({ ...cur, state: "dropped" });
          return spark({ tool: "post_log", text: `Parked the ${g.step.label} experiment` });
        }
        approvedAsIs();
        arrive({ at: 0, title: g.title, kind: "feature", district: g.district, source: "posthog", users: drop.lostPerDay }, Date.now());
        const itemId = byTitle.get(g.title)!;
        setExp({ ...cur, state: "building", itemId });
        spark({ tool: "start_job", text: `Sent "${g.title}" to the assembler with the plan`, reason: "you said run it" }, { itemId, target: "assembler-1", approvedBy: "player" });
      },
    );
  };

  function startMeasuring(item: Item, now: number) {
    const exp = expOf(item.id);
    if (!exp || exp.state !== "building") return;
    measuringSince.set(exp.id, s.tick);
    setExp({ ...exp, state: "measuring", prNumber: item.prNumber, launchedAt: now, daysWatched: 0 });
    stat("measure-1").lastLog = { who: "Measure", text: `#${item.prNumber} is live. Watching ${exp.step.label} for ${exp.windowDays} days.`, ok: true };
    log("info", `Measure station: watching ${exp.step.label} after #${item.prNumber}`, item.id);
  }

  // Every sim "day" the measure station adds that day's people and re-runs the test.
  function measureTick(now: number) {
    for (const [id, t0] of measuringSince) {
      const exp = s.experiments?.find((e) => e.id === id);
      const g = growthOf.get(id);
      if (!exp || !g) continue;
      const days = Math.floor((s.tick - t0) / DAY_TICKS);
      if (days === (exp.daysWatched ?? 0) || days < 1) continue;
      // a little day-to-day wobble, the same every replay
      const entered = g.entered * days;
      const wobble = 1 + Math.sin(days * 2.3) * 0.015;
      const after = { entered, converted: Math.round(entered * g.after * wobble), days };
      const next = updateExperiment(exp, after, days, now);
      if (next === exp) continue;
      setExp(next);
      if (next.state === "measuring") continue;
      measuringSince.delete(id);
      if (next.state === "inconclusive") {
        log("info", next.line!, exp.itemId);
        continue; // No pass/fail trophy or rollback recommendation without evidence.
      }
      const ok = next.state !== "lost";
      record(MEASURE, ok, next.line!);
      spark({ tool: "measure_experiment", text: next.line!, reason: `${after.entered} people through ${exp.step.label} since #${exp.prNumber}, two-proportion test p = ${next.p!.toFixed(3)}` }, { itemId: exp.itemId, target: "measure-1" });
      if (next.state === "won") {
        log("success", `Experiment won: ${exp.title}. It stays.`, exp.itemId);
        bumpMetrics({ usersUnblocked: s.metrics!.usersUnblocked + Math.round((next.lift ?? 0) * g.dropped * g.entered) });
      } else offerRollback(next);
    }
  }

  const offerRollback = (exp: Experiment) => {
    const hurt = exp.state === "lost";
    propose(
      {
        title: hurt ? `${exp.title.replace(/^Experiment: /, "")} made it worse` : `No lift from ${exp.title.replace(/^Experiment: /, "")}`,
        why: exp.line!,
        stage: "impact",
        kind: "review",
        focus: "measure-1",
        itemId: exp.itemId,
        plan: hurt ? ["A revert PR goes through the gauntlet like any other", "The step should come back to where it was"] : ["Keep it: it didn't hurt, and it's simpler", "Or roll it back and try a different idea"],
        options: [
          { id: hurt ? "rollback" : "keep", label: hurt ? "Roll it back" : "Keep it, try another idea", recommended: true, actions: [] },
          { id: hurt ? "keep" : "rollback", label: hurt ? "Keep it anyway" : "Roll it back", recommended: false, actions: [] },
        ],
      },
      (opt) => {
        approvedAsIs();
        if (opt === "rollback") spark({ tool: "start_job", text: `Rolling back #${exp.prNumber}: a revert PR heads into the gauntlet`, reason: exp.line }, { itemId: exp.itemId, target: "assembler-1", approvedBy: "player" });
        else spark({ tool: "post_log", text: `Kept #${exp.prNumber}. Next time ${exp.step.label} slips there's a fresh idea to try`, reason: "you kept it" }, { target: "measure-1", approvedBy: "player" });
      },
    );
  };

  // ---------- a second builder (Justin's pick r5-second A) ----------

  // Work piling up at the one builder is the first time the factory grows sideways: once 3 PRs have waited on it,
  // a card asks. Continue bolts a second assembler in next to the first, on the same plant.
  const waitedOnBuilder = new Set<string>();
  let builderOffered = false;
  function offerBuilder(itemId: string) {
    const builders = s.machines.filter((m) => m.type === "assembler" && m.powerId && m.harness !== "local");
    if (builderOffered || builders.length !== 1) return;
    waitedOnBuilder.add(itemId);
    if (waitedOnBuilder.size < 3) return;
    builderOffered = true;
    const first = builders[0];
    propose(
      {
        title: "Add a second builder?",
        attention: "suggest", // an idea: nothing is parked on it, so it never pings
        why: `${waitedOnBuilder.size} PRs waited on the builder today. A second one next to it takes the next job while the first is busy.`,
        stage: "build",
        kind: "build",
        focus: first.id,
        grows: ["+1 ASSEMBLER"],
        options: [
          { id: "add", label: "Add a second builder", recommended: true, actions: [{ tool: "place_machine", args: { type: "assembler" }, reason: "work keeps waiting on one builder" }] },
          { id: "later", label: "Not yet", recommended: false, actions: [] },
        ],
      },
      (opt) => {
        if (opt !== "add") return;
        const id = `${first.id}-2`;
        apply({ machines: [{ ...first, id, y: first.y + 2, state: "idle" }] });
        spark({ tool: "place_machine", text: "Second builder bolted in next to the first", reason: "you said yes" }, { target: id, approvedBy: "player" });
      },
    );
  }

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
        // The demo shop can't really sign in to anything, so it says so: on your own repo this is your real subscription.
        why: "The repo's read and the first fix is lined up, but nothing can build yet. On your own repo, your Claude or ChatGPT subscription powers the builders. Here in the demo, just pick one.",
        stage: "resources",
        kind: "input",
        focus: "assembler-1",
        grows: ["+1 POWER PLANT", "ASSEMBLERS ON"],
        options: [
          { id: "claude_code", label: "Use Claude (demo)", recommended: true, actions: [] },
          { id: "codex", label: "Use ChatGPT (demo)", recommended: false, actions: [] },
        ],
      },
      (opt) => plugIn(opt === "codex" ? "codex" : "claude_code"),
    );
  };

  // ---------- the check-in deck ----------

  // A morning's worth of Next Moves, dealt at once. Mostly loop-growers: checks, sources, autonomy.
  // ---------- the bottleneck brain (docs/BRAIN.md) ----------

  // Reads the signals, names the one bottleneck, deals one Continue/Later card. Continue runs the unlock and
  // the next diagnosis waits until it clears; Later parks it and the brain moves on, never re-raising it.
  const brainBeats = [...(sc.brain?.beats ?? [])];
  const nextDiagnosis = () => {
    const beat = brainBeats.shift();
    if (!beat) {
      spark({ tool: "diagnose", text: "Nothing worth a card right now", outcome: "Quiet: nothing worth a card", reason: sc.brain!.quiet });
      return;
    }
    beat.reads.forEach((r, n) => later(TICK_MS * n, () => spark(r)));
    later(TICK_MS * beat.reads.length, () => {
      spark({ tool: "diagnose", text: `Bottleneck: ${beat.title}`, outcome: `${beat.area}: ${beat.title} → ${beat.card}`, reason: beat.because });
      const park = () => {
        log("info", `Parked "${beat.card}" for a day. It comes back only if it gets worse.`);
        later(TICK_MS * 2, nextDiagnosis);
      };
      const id = propose({ title: beat.card, why: beat.why, because: beat.because, kind: beat.kind, attention: "suggest",
        options: [{ id: "continue", label: "Continue", recommended: true, actions: [] }, { id: "later", label: "Later", recommended: false, actions: [] }] },
      (choice) => {
        onLater.delete(id);
        if (choice !== "continue") return park();
        log("info", `On it: ${beat.card}`);
        later(TICK_MS * 4, () => {
          log("success", `Unlocked: ${beat.cleared}`);
          later(TICK_MS * 2, nextDiagnosis);
        });
      });
      onLater.set(id, park);
    });
  };

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
          { id: "build", label: "Build it", recommended: true, actions: [{ tool: "place_machine", args: { layout: "starter" }, reason: "The smallest setup that can ship something." }] },
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
          if (kind !== "sentry" && kind !== "posthog" && kind !== "email") return;
          const id = kind === "email" ? "ore-inbox" : `ore-${kind}`;
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
          spark({ tool: "connect_source", text: kind === "sentry" ? "Sentry mine open. Future errors can feed your line." : kind === "email" ? "Support mine open. Customer mail comes up the well, with a reply drafted for you to send." : "PostHog mine open. Future user signals can feed your line.", reason: "You chose to grow the input loop" }, { target: id, approvedBy: "player" });
  }

  onStatus("live");
  emit({ type: "snapshot", state: structuredClone(s) });
  // the PR left on the pad asks first: the launch is what you came back to (docs/GAMEPLAY-PICKS.md r4-pull)
  const onPad = s.items.find((i) => i.state === "on_pad");
  if (onPad) askToLaunch(onPad);
  if (sc.checkin) later(TICK_MS, dealCheckIn);
  if (sc.brain) later(TICK_MS * 3, nextDiagnosis);
  // a player who already has rockets but no goal gets the goal card soon after they come back, like the live tick
  if ((sc.rockets ?? 0) > 0) later(TICK_MS * 4, offerGoal);
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
        case "set_priority": {
          // a cart's callout (shared/src/priority.ts), the same rules the live factory uses
          const item = s.items.find((i) => i.id === msg.itemId);
          if (!item || !canSetPriority(item, msg.priority)) break;
          if (msg.priority === "park") held.delete(item.id); // set aside: the rest of the line stops waiting on it
          apply({ items: [{ ...withPriority(item, msg.priority), updatedAt: Date.now() }] });
          log("info", msg.priority === "rush" ? `Rushed "${item.title}" to the front of the line` : msg.priority === "park" ? `Parked "${item.title}"` : `Unparked "${item.title}"`, item.id);
          break;
        }
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
        case "set_goals": {
          const goals = goalsFromPick(msg.picks, Date.now(), s.metrics?.rockets);
          if (!goals) break;
          for (const m of [s.move, ...pending].filter((x) => x?.kind === "automate" && x.grows?.includes("+1 GOAL"))) { onChoose.delete(m!.id); pull(m!.id, 0); }
          setGoals(goals);
          break;
        }
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
        case "send_reply":
          support?.send(msg.ticketId, msg.draftHash);
          break;
        case "edit_reply":
          support?.edit(msg.ticketId, msg.text);
          break;
        case "file_issue":
          support?.file(msg.ticketId);
          break;
        case "close_ticket":
          support?.close(msg.ticketId);
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
