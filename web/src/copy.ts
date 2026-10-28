// Every word the player reads, in one place. Change copy here, not in the components.
//
// Voice: a game, not a dashboard. Short, punchy, plain words. Say what happened and what to do next.
// Rules (docs/VISION.md principles 8 and 9):
//   - No "Spark" or any named character in player copy. The recommended option just says "Suggested".
//   - The one credit is CREDIT below. web/test/copy.test.ts fails on "Spark" anywhere else.
//   - Same word, same thing, everywhere:
//       Build   = an agent makes the change and opens a PR ("Build it", "Ready to build", the Build autonomy level).
//       Place   = you put a machine on the map.
//       Launch  = merge a PR. Shipped = merged. A rocket is one shipped PR.
//       Check   = one station in the gauntlet (CI, verify bay, AI review, merge gate, orbit watch, researched ones).
//       Folder  = a part of the codebase (a district on the map). Players see "folder", never "district".
//       Planner = the brain that sorts, plans and reviews. It never writes code.
//       Ore     = incoming work (issues, errors, emails). Biters = live errors.
//   - Keep the intro's story: verify, then automate, then it runs itself.

import type { AutonomyLevel, Bottleneck, Harness, Item, Machine, Move, StationKind, Tech, ThoughtDecision } from "@shiptorio/shared";

/** The only place the planner model is credited (VISION principle 8). */
export const CREDIT = "powered by Meta Muse Spark";

// ---------- shared words ----------

export const WORDS = {
  suggested: "Suggested",
  close: "Close",
  yourRepo: "your repo",
  openPr: "Open PR",
  onGithub: "Open on GitHub ↗",
  prLink: "PR ↗",
  on: "On",
  off: "Off",
};

/** Who's at an assembler, by harness. */
export const HARNESS_NAME: Record<Harness, string> = { spark: "Planner", claude_code: "Claude Code", codex: "Codex", cursor: "Cursor", grok: "Grok", local: "Local model" };

export const LEVEL_LABEL: Record<AutonomyLevel, string> = { advisor: "Advisor", floor: "Floor", build: "Build", lights_out: "Lights out" };

/** An item's state, as a short pill on the line list. */
export const STATE_LABEL: Record<Item["state"], string> = {
  ore: "in the mine",
  queued: "next up",
  working: "building",
  inspecting: "in checks",
  rejected: "sent back",
  passed: "passed",
  on_pad: "on the pad",
  launched: "shipped",
};

/** An item's state, as the word beside a job in a machine's panel. */
export const STATE_WORD: Record<Item["state"], string> = {
  ore: "waiting in the mine",
  queued: "next up",
  working: "building",
  inspecting: "in checks",
  rejected: "riding the rework belt",
  passed: "passed",
  on_pad: "waiting on you",
  launched: "shipped",
};

// ---------- the map ----------

export const MAP = {
  captionTitle: "A little play. A lot shipped.",
  captionSub: "drag to pan · pinch or scroll to zoom",
  /** The ping on the thing that needs you, by where the work is stuck. */
  ping: {
    intake: "New ore",
    triage: "Sorting",
    build: "Ready to build",
    inspect: "Needs a look",
    pad: "Ready to launch",
    release: "Shipping",
    impact: "Watching impact",
    power: "Needs power",
    resources: "Needs power",
  } as Record<NonNullable<Move["stage"]>, string>,
  pingSentBack: "Sent back",
  pingNeedsYou: "Needs you",
  /** Quiet tags on busy machines. */
  busy: { working: "Building", inspecting: "Checking", rejected: "Reworking" } as Partial<Record<Item["state"], string>>,
};

// ---------- the HUD ----------

const SCORE_FORMULA = "users helped + 10 × customers answered + rockets − 25 × bugs that got out";

export const HUD = {
  menuLabel: "Menu: tools, views and activity",
  menuTitle: "Menu (tools, views, activity)",
  shipped: "shipped",
  shippedTitle: "PRs shipped",
  automated: "automated",
  automatedOn: (folders: string) => `Ships on its own in ${folders}. The rest waits for you.`,
  automatedNone: "Every PR waits for you. Clean ships earn launch permits.",
  trustTo: (have: number, need: number, label: string, level: string) => `${have}/${need} ${label} to unlock ${level}`,
  trustTop: "Top level",
  trustAdvisor: "Advisor: the planner suggests, you decide. Clean ships earn launch permits.",
  trust: "trust",
  toLevel: (level: string) => `to ${level}`,
  score: "score",
  scoreTitle: SCORE_FORMULA,
  checkinChip: (n: number) => `Check in · ${n}`,
  checkinLabel: (n: number) => `Check in: ${n} cards waiting on you`,
  guideLabel: (n: number) => `Field guide, ${n} found`,
  guideTitle: (n: number) => `Field guide · ${n} found`,
  researchLabel: "Research new checks",
  researchTitle: "Research · spend science on new checks",
  activityLabel: (n: number) => `Activity, ${n} waiting on you`,
  view: "View",
  checkin: "Check in",
  factory: "Factory",
  tour: "Tour",
  dock: {
    label: "Actions",
    line: "Line",
    yours: "Yours",
    power: "Power",
    launch: "Launch",
    launchLabel: "Launch the PR on the pad",
    launchTitle: "Launch (B)",
    checkinLabel: (n: number) => `Check in: ${n} waiting on you`,
    place: "Place",
    placeLabel: (who: string) => `Place another ${who} assembler`,
    placeTitle: (who: string) => `Place another ${who} assembler (A)`,
    placeNeedsPower: "Plug in Claude or ChatGPT to place builders",
    placeNeedsPowerTitle: "Plug in Claude or ChatGPT first",
    tools: "TOOLS",
  },
  /** The floor card, top left: the factory's numbers in one row, then what the colored items are. */
  floor: {
    eyebrow: "THE FACTORY FLOOR",
    label: "Factory floor numbers",
    mined: "MINED",
    minedTitle: "Everything the mines have dug up so far",
    onLine: "ON LINE",
    onLineTitle: "Work on the belts and in the machines right now",
    shipped: "SHIPPED",
    rework: "REWORK",
    reworkTitle: "Sent back by a check, riding the rework belt",
    needs: "WAITING ON YOU",
    needsTitle: "Cards and machines waiting on you",
    score: "SCORE",
    keyLabel: "What the items are",
    key: { issue: "ISSUE", cards: "CARDS", pr: "PR", ships: "SHIPS", rework: "REWORK" },
  },
  /** The ticker, bottom left: the last lines of the floor log. */
  ticker: {
    label: "Floor log",
    idle: "The line is running. Drag to pan, scroll or pinch to zoom.",
  },
  /** The needs-you tray, top center (above the controls on a phone). */
  needs: {
    label: "Needs you",
    nextMove: "NEXT MOVE",
    blocked: (name: string) => `${name.toUpperCase()} NEEDS YOU`,
    blockedWhy: "Stopped. Open it to see what it's waiting on.",
    open: "OPEN",
    checkin: (n: number) => `CHECK IN · ${n} CARDS`,
    checkinWhy: (n: number) => `${n} more cards are waiting on you in the deck.`,
    checkinGo: "CHECK IN",
    more: "MORE",
    less: "LESS",
    moreLabel: "Show the why and the plan",
    lessLabel: "Hide the why and the plan",
  },
};

export const LINE = {
  title: "The line",
  onPad: "On the pad",
  padEmpty: "Nothing ready to launch yet.",
  onBelt: "On the belt",
  beltEmpty: "The line is quiet.",
  permits: (folders: string) => `Ships on its own in ${folders}`,
};

export const POWER = {
  title: "Power",
  intro: "Your Claude and ChatGPT sign-ins are the power. More sign-ins, more builders. The planner picks what they build.",
  introGeo: "Your sign-ins and your own computer power the builders. The planner decides what each one builds.",
  planner: "Planner",
  plannerTag: "steam plant",
  offline: "offline",
  howItThinks: "See how the planner thinks",
  unplug: "Unplug the runner",
  unplugFailed: "Couldn't unplug the runner. Try again.",
  notSignedIn: "not signed in",
  signIn: "Sign in",
  useDemo: "Use it (demo)", // the demo shop can't sign in to anything real
  pair: "pair the runner",
  pairTitle: "Run ~/.local/bin/shiptorio-runner pair on your machine to plug it in",
  slots: [
    { harness: "claude_code", name: "Claude Code" },
    { harness: "codex", name: "Codex" },
  ] as const,
};

/** The stats block in the activity tray. */
export const STATS = {
  score: { label: "ship score", title: SCORE_FORMULA },
  users: { label: "users helped", title: "Real users hit by the bugs you fixed" },
  customers: { label: "customers answered", title: "Customer threads closed with a shipped fix" },
  errors: { label: "biters killed", title: "Live Sentry errors your fixes killed" },
  lead: { label: "issue → ship", title: "Typical time from issue to merged" },
  science: { red: "bug fixes", green: "features", grey: "cleanups", blue: "tests" } as const,
  scienceShipped: (kind: string) => `${kind} shipped`,
};

export const SETTINGS = {
  howItThinks: "How it thinks",
  labels: "Labels on every machine (L)",
  scenarios: "Scenarios",
  art: "art",
  sound: "SOUND",
  mute: "Mute (M)",
  soundOn: "ON",
  soundOff: "OFF",
  music: "Music",
  musicVolume: "Music volume",
  musicOn: "MUSIC ON",
  musicOff: "MUSIC OFF",
  volume: "Volume",
};

export const ACTIVITY = {
  title: "Activity",
  close: "Close activity",
  yourMove: "Your move",
  checkin: (n: number) => `Check in · ${n} cards`,
  nothing: "Nothing needs you. The factory's got it.",
  showOnMap: "Show on map",
  launchRow: (pr: string, title: string) => `Launch ${pr} ${title}`,
  launchWhy: "Passed every check. Launch to merge it.",
  launch: "Launch",
  feed: "On the floor",
  feedEmpty: "Quiet so far.",
  why: (reason: string) => `Why: ${reason}`,
  onItsOwn: "Done on its own, with trust you earned.",
  undo: "Undo",
  stats: "Stats",
  settings: "Settings",
  sim: (scenario: string) => `sandbox · ${scenario}`,
};

// ---------- the Next Move card ----------

export const STAGE_LABEL: Record<Bottleneck["stage"], string> = {
  intake: "new ore",
  triage: "sorting",
  build: "build",
  inspect: "checks",
  pad: "launch pad",
  release: "shipping",
  impact: "after launch",
  power: "power",
  resources: "no power",
};

export const NEXT_MOVE = {
  label: "Next move",
  bottleneck: "Bottleneck",
  bottleneckAt: (where: string) => `Bottleneck · ${where}`,
  open: (station: string) => `Open the ${station}`,
  plan: "See the plan and files",
};

// ---------- the check-in deck ----------

export const CHECKIN = {
  label: "Check-in",
  left: (n: number) => `${n} left`,
  allClear: "All clear",
  close: "Close the check-in",
  zoomed: "ZOOMED IN · TAP THE CARD TO COME BACK",
  zoomedNoSpot: "TAP THE CARD TO COME BACK",
  locked: "NOT PROVEN YET · SWIPE RUNS THE CHECK",
  pick: "SUGGESTED · SWIPE RIGHT",
  or: (alts: string) => `or: ${alts}`,
  stamp: { right: "DO IT", left: "LATER", down: "NEVER", up: "DETAILS" },
  buttons: { never: "Never ↓", later: "Later ←", details: "Details ↑", doIt: "Do it →" },
  never: [
    { why: "once", label: "JUST THIS ONE", text: "Drop it, no rule." },
    { why: "kind", label: "NOT THIS KIND", text: "Stop dealing cards like this. It's saved as a rule." },
    { why: "spark", label: "HANDLE THESE FOR ME", text: "Do this kind without asking. Counts as trust." },
    { why: "wrong", label: "WRONG CALL", text: "Misread. It becomes a scar, so the next read is better." },
  ] as const,
  neverTitle: "Never: why? One tap.",
  neverLabel: "Never show this",
  details: "Details",
  onYes: "WHAT HAPPENS ON YES",
  pickOne: "PICK ONE",
  closeSheet: "CLOSE",
  cancel: "CANCEL",
  toast: {
    changed: "That card just changed. Take another look.",
    yes: (label?: string) => (label ? `${label}. On it.` : "On it."),
    later: "Later. It'll come back around.",
    never: { once: "Gone.", kind: "Rule saved. No more cards like it.", spark: "Handled without asking from now on.", wrong: "Noted. The planner will weigh it next time." },
  },
  doneWhy: (n: number) => `${n} calls. The factory's moving without you now.`,
  emptyWhy: "Nothing needs you right now. A card shows up when something does.",
  tally: { yes: "pushed forward", later: "back later", checks: "checks added", rules: "rules taught" },
  autonomy: (level: string) => `AUTONOMY → ${level}`,
  quote: "The score isn't how many you cleared. It's how few need you tomorrow.",
  back: "Back to the floor",
};

// ---------- panels ----------

export const PANEL = {
  closeLabel: "Close and zoom back out",
  bottleneck: "bottleneck",
  rightNow: "Right now",
  idle: "Nothing on it right now.",
  more: (n: number) => `+${n} more`,
  in: "IN",
  out: "OUT",
  lately: "Lately",
  // a quiet machine says what it's waiting on, never "idle" (map/shaft/waiting.ts)
  machine: { IDLE: "Ready", WORKING: "Working", BLOCKED: "Needs you" },
  quiet: { next: "Next up", you: "Waiting on you" },
  stats: {
    onBelt: "On the belt",
    topScar: "Top scar",
    noScar: "none yet",
    strikes: "Strikes",
    watching: "Watching",
    held: "Held 24h",
    caught: "Caught this week",
    inLine: "In line",
    longestWait: "Longest wait",
    passRate: "Pass rate",
    planner: "Planner",
    left: (name: string) => `${name} left`,
    powers: "Powers",
    state: "State",
    oreWaiting: "Ore waiting",
    weight: "Total weight",
    upNext: "Up next",
    tier: "Tier",
    power: "Power",
    noPower: "none, sign in",
    waitingOnYou: "Waiting on you",
    rockets: "Rockets",
    guards: "Guards",
    everywhere: "every folder",
    offline: "offline",
  },
  orbit: { reverted: "reverted", redOnMain: "red on main", cameBack: "came back", hoursLeft: (h: number) => `${h}h left`, minutesLeft: (m: number) => `${m}m left` },
  reworkLast: (ref: string, check: string, reason: string) => `${ref} came back from the ${check}: ${reason}`,
  rework: "Rework",
  check: "check",
  power: "Power",
  lowPower: (name: string) => `${name} is under 40%. Low-value work waits until it refills.`,
  plant: (type: string) => `${type} plant`,
  assembler: (who?: string) => (who ? `${who} assembler` : "assembler"),
  launchNext: "Launch the next one",
  factory: "Factory",
  // a cart: one piece of work riding the shaft (docs/GAMEPLAY-PICKS.md r3-rush)
  cart: {
    zone: "Cart",
    folder: "Folder",
    tries: "Tries",
    rushed: "rushed",
    parked: "parked",
    waiting: "Rush moves it to the front of the line. Park sets it aside until you unpark it.",
    isRushed: "Rushed. It goes to the next free builder.",
    isParked: "Parked. It stays off the line until you unpark it.",
    onLine: "Already on the line. Rush and Park are for work still waiting.",
    choice: { rush: "Rush", park: "Park", none: "Unpark" },
  },
};

export interface PanelCopy {
  zone: string;
  name: string;
  tag: [color: "green" | "amber" | "blue" | "red" | "steel", text: string];
  what: string;
  actions?: { id: string; label: string; recommended: boolean }[]; // for panels with no Station behind them
}

// Panel copy for every clickable thing on the line (from docs/loop.html). The numbers come from the factory state.
export const STATION_COPY: Record<StationKind, PanelCopy> = {
  ci: {
    zone: "3 · Gauntlet · check 1",
    name: "CI inspector",
    tag: ["green", "cheap + fast"],
    what: "The first and cheapest check: lint, types, unit tests. It catches the boring breaks fast, so nothing expensive runs on broken code.",
  },
  verify: {
    zone: "3 · Gauntlet · check 2",
    name: "Verify bay",
    tag: ["amber", "done means proof"],
    what: "Done means proof. The PR has to add a test, and the runner on your machine runs it both ways: on the old code it fails, on the new code it passes. No proof, no pass.",
  },
  review: {
    zone: "3 · Gauntlet · check 3",
    name: "AI review",
    tag: ["blue", "second opinion"],
    what: "A second opinion before it reaches you. The planner reads the diff against the plan and tries to break it. It hunts what tests miss: the wrong approach, swallowed errors, security holes, scope creep.",
  },
  merge: {
    zone: "3 · Gauntlet · check 4",
    name: "Merge gate",
    tag: ["amber", "you"],
    what: "You. Everything here passed every check, and the card shows the receipts: CI, verify, review. Merge and the rocket launches. Folders that keep shipping clean earn launch permits, so routine PRs launch on their own.",
  },
  orbit: {
    zone: "4 · Shipped · after the launch",
    name: "Orbit watch",
    tag: ["green", "real world"],
    what: "Checks don't stop at merge. For 24 hours after a launch, orbit watch checks the real world: Sentry stays quiet, nobody reverts it, main stays green. If the bug comes back, it rides the rework belt with an orbit scar and that folder loses its launch permit.",
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
    what: "A check you researched. It runs on every PR in the folders that need it.",
  },
};

export const RESEARCHED = {
  zone: "3 · Gauntlet · researched",
  tag: "runs after CI",
  what: (what: string, catches: string) => `${what} Catches ${catches}.`,
};

export const REWORK_COPY: PanelCopy = {
  zone: "The loop back",
  name: "Rework belt",
  tag: ["red", "fails go back"],
  what: "Anything that fails a check comes back with a scar: what failed and the proof. You get a card: send it back to the builder with the scar, look later, or overrule. Three scars from one check and it can't go back again: it's yours. Same scar again and again? A check should move up a layer.",
  actions: [
    { id: "turret", label: "Add a test turret on the top scar's folder", recommended: true },
    { id: "scars", label: "See all scars", recommended: false },
    { id: "me", label: "Send the oldest to me now", recommended: false },
  ],
};

export const POWER_COPY: PanelCopy = {
  zone: "Power · AI compute",
  name: "Power plants",
  tag: ["green", "your sign-ins"],
  what: "Your Claude and ChatGPT sign-ins are power plants. Each subscription plant shows whether its agent is signed in and ready; your plan’s usage limits still apply. Every check spends power, so more checks cost more. Heavy checks go where mistakes are expensive; docs stay cheap. A model on your own computer is geothermal: free, but small and capped. The planner runs on its own steam plant.",
  actions: [
    { id: "sign-in", label: "Sign in with another plan", recommended: false },
    { id: "hold", label: "Hold low-value work", recommended: false },
    { id: "balance", label: "Balance power for me", recommended: true },
  ],
};

// A local model on the player's computer (Ollama or any OpenAI-compatible endpoint the runner finds).
export const GEO_COPY: PanelCopy = {
  zone: "Power · your computer",
  name: "Geothermal plant",
  tag: ["amber", "free, capped"],
  what: "A model running on your own computer. It costs nothing, but it's small and only as fast as your machine, so it gets the small jobs.",
  actions: POWER_COPY.actions,
};

// Every other machine on the map opens a panel too (Justin's playtest: click anything, see what it's doing).
export const MACHINE_COPY: Partial<Record<Machine["type"], PanelCopy>> = {
  ore_deposit: {
    zone: "1 · Ore · work comes in",
    name: "Ore mine",
    tag: ["amber", "work comes in"],
    what: "Every source is a mine: GitHub issues, Sentry errors, customer email. Duplicates merge into one heavy chunk, so 40 crash reports about one bug ride the belt as one chunk weighing 40.",
    actions: [{ id: "connect", label: "Connect another source", recommended: true }],
  },
  splitter: {
    zone: "Brain · planner",
    name: "Planner",
    tag: ["blue", "reads, plans, routes"],
    what: "Reads each chunk, says the problem in plain words, scores who it hurts, picks a machine and writes the plan. It never writes code. It runs on the steam plant.",
    actions: [{ id: "replan", label: "Re-plan the queue by value", recommended: true }],
  },
  assembler: {
    zone: "2 · Build",
    name: "Assembler",
    tag: ["amber", "your subscription"],
    what: "Your Claude Code or Codex, on your own subscription, builds what the planner planned and opens a PR. It has to bring proof, not just say done.",
    actions: [
      { id: "upgrade", label: "Upgrade to MK2 (more jobs at once)", recommended: true },
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
    tag: ["red", "guards a folder"],
    what: "Tests guarding one folder. Every PR into that folder has to get past it, and it fires while Sentry errors attack the folder.",
  },
};

/** Short names for machines in lists (Make it yours). */
export const MACHINE_NAME: Partial<Record<Machine["type"], string>> = {
  splitter: "Splitter",
  assembler: "Assembler",
  inspector: "Check",
  launch_pad: "Launch pad",
  solar: "Solar",
  battery: "Battery",
  turret: "Test turret",
  steam: "Planner",
};

// ---------- sheets ----------

export const THINKS = {
  title: "How it thinks",
  intro: "One model sorts your work, plans every job, reviews every PR and picks your next card. Your Claude or ChatGPT sign-ins build what it plans. It never writes code or skips a check.",
  decisions: "decisions",
  byModel: "made by the model",
  fallbacks: "backup rules",
  noPower: "The planner has no power right now, so backup rules are standing in.",
  latest: (sim: boolean) => `Latest calls${sim ? " · sandbox" : ""}`,
  empty: "Nothing yet. Decisions show up here as work comes in.",
  rule: "rule",
  scorecard: "Scorecard",
  plansShipped: "plans shipped",
  reviewCatches: "reviews caught a problem",
  ruleShare: "calls a backup rule made",
  ofTotal: (n: number, total: number) => `${n} of ${total}`,
  /** The one-line why on every card. */
  why: "Why:",
  /** The credit, linked to the judge page on how the planner runs the factory. */
  credit: (model?: string) => `${CREDIT}${model ? ` · ${model}` : ""} · see how it runs Shiptorio →`,
  verb: {
    triage: "Sorted",
    scope: "Picked files",
    plan: "Planned",
    review: "Reviewed",
    next_move: "Chose your next card",
    rank: "Ranked your cards",
    orbit: "Judged a comeback",
    research: "Picked a check",
    permit: "Weighed a permit",
    support: "Read a customer message",
    route: "Picked the power plant",
    growth: "Picked an experiment",
    diagnose: "Found what's holding you back",
    goal: "Guessed what you want",
  } as Record<ThoughtDecision, string>,
};

export const RESEARCH = {
  title: "Research",
  packs: (n: number) => `science pack${n === 1 ? "" : "s"}`,
  packsSub: "Every PR you ship earns one. Spend them on new checks.",
  tier: { 1: "Tier 1 · instant checks", 2: "Tier 2 · stricter gates", 3: "Tier 3 · real-world checks" } as Record<Tech["tier"], string>,
  catches: (what: string) => `Catches ${what}`,
  go: "Research",
  running: "Running",
  /** the eyebrow over the board */
  board: "Schematic board",
};

/** Your machine (ui/RunnerConnection.tsx): the local runner, drawn as a power cable into the factory's socket. */
export const RUNNER = {
  title: "Connect your machine",
  state: { online: "Connected", offline: "Idle", unpaired: "Unplugged", unknown: "Checking", error: "Blocked" } as Record<"online" | "offline" | "unpaired" | "unknown" | "error", string>,
  agent: { codex: "Codex", claude_code: "Claude Code", local: "Local model" } as Record<string, string>,
  job: { planning: "Planning", awaiting_approval: "Waiting for your approval", ready: "Ready to build", running: "Building", completed: "PR opened", failed: "Stopped" } as Record<string, string>,
  unknownJob: "Unknown",
  /** The HUD light (ui/MachineLight.tsx): one line, is your machine on and what is it doing. */
  light: {
    label: "Your machine",
    unplugged: "Not connected",
    offline: "Offline",
    signIn: "Sign in to Codex or Claude",
    idle: "Connected · nothing to do",
    yourTurn: "Connected · waiting on your OK",
    planning: (n: string) => `Planning ${n}`,
    planReady: (n: string) => `Plan ${n} ready · your OK`,
    starting: (n: string) => `Starting ${n}`,
    building: (n: string) => `Working on ${n}`,
    aJob: "a job",
    open: "Open your machine's connection",
  },
  noAgents: "no agents detected",
  online: (agents: string) => `Online · ${agents}`,
  offline: "Offline · start your runner to connect",
  unpaired: "Your Claude or Codex sign-in powers this factory.",
  checking: "Checking your machine…",
  noAccess: "Sign in with write access to this repo to see your machine.",
  unreachable: "Couldn't reach your machine status.",
  disconnectFailed: "Couldn't disconnect. Refresh and try again.",
  disconnectFailedShort: "Couldn't disconnect.",
  lastSeen: (when: string) => `Last seen ${when}`,
  lastJob: (what: string, id: string) => `Last job: ${what} · ${id}`,
  runThis: "Run this on your computer, then compare the pairing code in your browser:",
  pasteThis: "Paste this into a terminal on your computer. That's the whole setup:",
  waiting: "Waiting for your computer…",
  signIn: "Connected. Sign in to Claude Code or Codex in that terminal to finish.",
  copy: "Copy",
  copied: "Copied",
  joinNote: "macOS · Linux · Windows via WSL2. Works once, for 10 minutes. Keep the terminal open. The planner asks before any build starts.",
  platforms: "macOS · Linux · Windows via WSL2. Keep the terminal open. The planner asks before any build starts.",
  more: "Add a repo, troubleshoot or uninstall",
  addRepo: ["Already installed? Run ", " to add this repo. One runner serves all paired repos."] as const,
  offlineHelp: ["Offline? Run ", ". Check sign-ins with "] as const,
  uninstall: "Stop with Ctrl-C. Remove the runner and local credentials with ",
  docs: "Runner setup and troubleshooting",
  disconnect: "Disconnect this machine",
  confirmDisconnect: "Confirm disconnect from this repo",
};

/** Achievements (ui/Achievements.tsx): the sheet of medallions and the unlock toast. */
export const ACHIEVE = {
  title: "Achievements",
  earned: (total: number) => `of ${total} earned`,
  earnedSub: "Each one is something that really happened in your repo.",
  eyebrow: "Foundry medals",
  tier: { bronze: "Bronze", silver: "Silver", gold: "Gold" } as Record<"bronze" | "silver" | "gold", string>,
  unlocked: "Achievement unlocked",
  more: (n: number) => `And ${n} more`,
  moreSub: "Tap to see every badge you've earned.",
  xp: (n: number) => `+${n} XP`,
};

export const GUIDE = {
  title: "Field guide",
  locked: "???",
  chapters: {
    first: "First rocket",
    bottlenecks: "Bottlenecks",
    ore: "More ore",
    automate: "Verify, then automate",
  },
  /** How to find each entry while it's still ??? */
  hint: {
    island: "Pick a repo",
    machines: "Set up your starter line",
    power: "Plug in Claude or ChatGPT",
    ore: "Wait for work to arrive",
    inspect: "Build your first PR",
    pad: "Pass every check",
    rocket: "Launch a PR",
    bottleneck: "Ship once",
    checkin: "Let a few things wait on you",
    autonomy: "Take suggestions as-is",
  } as Record<string, string>,
  /** Entries no lesson teaches yet. */
  extra: {
    sentry: { title: "Biters", text: "Sentry errors attack the folder they hit. Fixes that kill biters score big.", hint: "Connect Sentry" },
    feedback: { title: "Feedback", text: "Customer emails arrive as ore, linked to the errors they describe.", hint: "Connect your support inbox" },
    users: { title: "Users", text: "PostHog shows how many real users each fix reached.", hint: "Connect PostHog" },
    station: { title: "Checks", text: "Add checks to the gauntlet. Every check makes a yes safer.", hint: "Ship a few PRs" },
    permit: { title: "Launch permits", text: "A folder that keeps shipping clean earns the right to ship on its own.", hint: "Earn trust in one folder" },
    lights: { title: "Lights out", text: "The factory runs overnight inside your budget. You get a morning review.", hint: "Earn permits on most folders" },
  },
};

export const YOURS = {
  title: "Make it yours",
  goal: "Your goal",
  goalWhy: (guessed: boolean) => guessed ? "The factory guessed this. Tap the one that matters most and it hunts for what blocks it." : "The factory hunts for whatever blocks this first.",
  goalPick: "Pick your goal",
  whoBuilds: "Who builds",
  noAssemblers: "No assemblers yet.",
  anyFolder: "any folder",
  agentFor: (id: string) => `Agent for ${id}`,
  notPlugged: (name: string) => `${name} isn't plugged in yet: pair the runner`,
  level: "Autonomy",
  levelNow: (level: string) => `The planner is at ${level}. Turn it down and it asks first again. Going back up is earned on a card.`,
  levelDown: (level: string) => `Down to ${level}`,
  permits: "Launch permits",
  permitsWhy: "These folders ship on their own once every check passes. Turn one off and its PRs wait for you again.",
  permitOff: "Turn off",
  permitOffFor: (folder: string) => `Turn off the launch permit for /${folder}`,
  addCheck: "Add a check",
  addCheckWhy: "A test turret makes every PR in that folder pass its tests before it reaches you.",
  turret: "Test turret",
  add: "+ Add",
  move: "Move a machine",
  moveWhich: "Machine to move",
  moveGroup: "Move",
  moveLeft: "Move left",
  moveUp: "Move up",
  moveDown: "Move down",
  moveRight: "Move right",
  agents: [
    { harness: "claude_code", name: "Claude Code" },
    { harness: "codex", name: "Codex" },
  ] as const,
};

/** An empty mine, tapped: what connecting it adds. */
export const SOURCE = {
  sentry: { name: "Sentry", adds: "Errors land as ore the moment they happen, and biters show which folder they hit. Fixes that kill biters score big." },
  posthog: { name: "PostHog", adds: "See what users really do. User signals decide what gets built first, and your score counts the users each fix reached." },
  email: { name: "support", adds: "Customer emails and Intercom chats come up at the support well. Each one is sorted, linked to the work it's about, and gets a reply drafted. You read it and tap Send; nothing goes out on its own. When a fix ships, you get an “it's fixed” reply to send." },
  connected: (name: string) => `${name} is connected`,
  connect: (name: string) => `Connect ${name}`,
  open: (name: string) => `Open ${name}`,
} as const;

// ---------- the ship celebration ----------

export const SHIP = {
  title: "SHIPPED!",
  firstTry: "FIRST TRY",
  streak: (n: number) => `STREAK ×${n}`,
  score: (n: number) => `+${n} SHIP SCORE`,
  level: { advisor: "ADVISOR", floor: "FLOOR", build: "BUILD", lights_out: "LIGHTS OUT" } as Record<AutonomyLevel, string>,
  unlocked: (level: string) => `${level} UNLOCKED`,
  toLevel: (level: string, have: number, need: number) => `→ ${level} ${have}/${need}`,
  close: "Click to close",
  sr: (pr: number | null | undefined, title: string, firstTry: boolean, streak: number) =>
    `Shipped ${pr != null ? `PR ${pr}, ` : ""}${title}.${firstTry ? " First try." : ""}${streak >= 2 ? ` Streak of ${streak}.` : ""}`,
};

// ---------- first run: the coach ----------

/** The coach card's one-liners, in the order a new player meets them. {repo} is filled in. */
export const LESSON_COPY: Record<string, { title: string; text: string }> = {
  island: { title: "Your factory", text: "This shaft is {repo}. One factory, one codebase. Work is mined at the bottom, built and checked on the way up, and launches from the top." },
  machines: { title: "Machines", text: "Machines do the work. The splitter sorts what comes in, the assembler builds the fix, the checks test it, the pad ships it." },
  power: { title: "Power", text: "Assemblers run on power, and power is your own Claude or ChatGPT sign-in. More sign-ins, more machines." },
  ore: { title: "Ore", text: "That's ore: each open issue is one chunk. It rides the belt in, and the Line list shows where every chunk is." },
  inspect: { title: "Checks", text: "Nothing ships unchecked. Every PR runs the gauntlet: CI, proof, AI review. A fail rides the red belt back with the reason, for another try." },
  pad: { title: "Launch pad", text: "It passed and it's on the pad. Launching means you merge the PR. That's always your call." },
  rocket: { title: "Rocket", text: "Rocket! Each one is a merged PR. The score counts what shipping did for people, not how busy the factory looks." },
  bottleneck: { title: "Bottleneck", text: "There's always a bottleneck: the one spot where work piles up. The Next Move card points at it. Clear it and the factory grows." },
  autonomy: { title: "Autonomy", text: "Every suggestion you take as-is builds trust. Earn enough and the factory gets to do the small stuff on its own." },
  checkin: { title: "Check-in", text: "When a few things wait on you, check in: swipe through them in one go. Right does it, left is later, down is never." },
};

export const COACH = {
  eyebrow: "New concept",
  step: (n: number, of: number) => `Lesson ${n} of ${of}`,
  gotIt: "Got it",
  skip: "skip the tour",
};

// ---------- first run: the welcome tour ----------

export interface BeatCopy {
  kick: string;
  title: string; // the phrase in *stars* is the amber one
  body: string;
  after?: string; // replaces body once the player's move lands
}

/** The welcome tour's eight beats, for someone who has never heard of Shiptorio (Justin's playtest, 2026-10-27):
 * a game that ships real things, agents build, you just say yes or no, checks make the yes easy, then let safe work
 * ship itself, a helper learns your calls and finds the slow spot, more sources, and it runs itself. Keep it general. */
export const BEAT_COPY: BeatCopy[] = [
  {
    kick: "Welcome",
    title: "A game that ships *real things*.",
    body: "Shiptorio is a factory game. Your GitHub repo is the factory, and what you do here ships for real. This first run is practice, so nothing real changes yet.",
  },
  {
    kick: "The builders",
    title: "AI agents do the *building*.",
    body: "Agents like Claude and Codex write the fixes. Each crate you see is one change being built.",
  },
  {
    kick: "Your job",
    title: "You just say *yes or no*.",
    body: "Every finished change waits for your thumbs up before it ships. Today, that wait is the slow part.",
  },
  {
    kick: "Step 1 · Check",
    title: "Checks make yes *easy*.",
    body: "Before a change reaches you, it gets tested, proven and reviewed. You see the results, not the code.",
    after: "One tap. The checks did the hard part. The more you check, the less you have to look.",
  },
  {
    kick: "Step 2 · Hand off",
    title: "Then let it *ship itself*.",
    body: "This kind of change keeps passing every check. You can let it ship without asking you.",
    after: "Now the safe stuff ships on its own, and only the risky changes wait for you. A bit more runs alone every week.",
  },
  {
    kick: "Your helper",
    title: "It finds the *slow spot*.",
    body: "A helper learns from every yes and no you give, and keeps looking for what slows you down. Right now: a change passed its tests but still has a bug.",
    after: "Now a check catches that bug every time. Fix one slow spot and the next one shows up. The helper finds it and suggests a fix.",
  },
  {
    kick: "More to fix",
    title: "Every source is a *new mine*.",
    body: "GitHub brings issues. Sentry brings errors your users hit. Tap the Sentry mine to connect it.",
    after: "Errors now come in as ore, ready to fix. More sources, more to fix, more to hand off.",
  },
  {
    kick: "Where you're headed",
    title: "It runs *itself*.",
    body: "Checked, handed off, always getting better. You set the direction and give a thumbs up when it asks. That's the game.",
  },
];

export const TOUR = {
  label: "Welcome tour",
  stamps: ["Tested ✓", "Proven ✓", "Reviewed ✓"],
  kicker: (beat: string) => `Practice · ${beat}`,
  welcome: (login: string) => `Welcome, @${login}`,
  ship: (pr?: number) => (pr ? `Ship #${pr}` : "Ship it"),
  permit: "Let these ship on their own",
  turret: (folder: string) => `Add a check on /${folder}`,
  sentry: "Connect Sentry",
  watchVerify: "Finding the slow spot...",
  start: "Start your factory",
  next: "Next",
  wait: "Working...",
  step: (n: number, of: number) => `Step ${n} of ${of}`,
  pile: "waiting for your thumbs up",
  askLead: "5 changes like this",
  askRest: " shipped clean this week.",
  statShipped: "shipped",
  statUsers: "users helped",
  statAuto: "automated",
  autoTitle: "Changes that shipped on their own",
  skip: "Skip",
};

// ---------- sign in and pick a repo ----------

/** Play first, sign in later: the sandbox is the front door, and your own repo is an unlock you reach in play. */
export const PLAY = {
  chip: "Demo shop",
  chipCta: "Use your repo ›",
  chipLabel: "You're playing a demo shop. Sign in with GitHub to run your own repo",
  kicker: "Unlocked · your repo",
  title: "That was a demo shop. Run your own repo next",
  why: "Sign in with GitHub and your real issues come up the shaft, built by your own agents.",
  cta: "Sign in with GitHub",
};

export const ONBOARD = {
  label: "Welcome to Shiptorio",
  steps: ["WELCOME", "SIGN IN", "PICK A REPO", "PLAY"],
  brand: "SHIPTORIO",
  tagline: "A little play. A lot shipped.",
  hello: "Your codebase is the factory. Every change goes through four stations:",
  signIn: "SIGN IN WITH GITHUB",
  replay: "Watch the intro again",
  simNote: "Sandbox tour · sample repo and issues · no real sign-in",
  pickTitle: "PICK A REPO",
  pickHey: (login: string) => `Hey ${login}. `,
  pickAsk: "Which repo is the factory? ",
  pickLive: "We'll read its tree, open issues and CI, then suggest a starter line.",
  pickSim: "This sandbox runs a demo shop with sample issues; your real repo stays untouched.",
  looking: "Looking for repos…",
  issues: (n: number) => ` · ${n} open issue${n === 1 ? "" : "s"}`,
  repoLabel: "Repo, as owner/name",
  open: "OPEN",
  notThere: "Not there? ",
  install: "Install the Shiptorio app",
  onRepo: " on the repo",
  then: ", then ",
  refresh: "refresh",
  first: " first",
  skip: "skip to the sandbox",
  simRepoBlurb: "Demo shop · sample issues",
  journeyLabel: "Four stations",
  journey: [
    { k: "MINE", d: "issues arrive" },
    { k: "BUILD", d: "agents build" },
    { k: "VERIFY", d: "checks prove" },
    { k: "LAUNCH", d: "you ship" },
  ],
  pickEyebrow: "PICK YOUR REPO",
  installCta: "INSTALL SHIPTORIO ON A REPO",
  installHelp: "Opens GitHub in a new tab. Pick one repo to start; you can add more later. Your repo shows up here by itself once it's installed.",
  installWaiting: "WAITING FOR GITHUB",
  find: "Find a repo",
  findPlaceholder: "filter by name",
  noMatch: (q: string) => `No repo matches "${q}".`,
  failed: "Couldn't load your repos from GitHub.",
  failedHelp: "Try again, or type the repo by hand.",
  retry: "TRY AGAIN",
  lampOpen: (n: number) => (n ? `${n} OPEN` : "CLEAR"),
  lampUnknown: "READY",
};

// ---------- your empire: every repo is an island ----------

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export const EMPIRE = {
  title: "Your empire",
  eyebrow: "Map room",
  notOpened: "not opened yet",
  auto: (pct: number) => ` · ${pct}% auto`,
  waiting: (n: number, auto: string) => `${n} waiting on you${auto}`,
  clear: (rockets: number, auto: string) => `all clear · ${rockets} shipped${auto}`,
  island: "island",
  chipLabel: (name: string, total: number, waitingElsewhere: number) =>
    `Your islands: on ${name}, ${total} in all${waitingElsewhere ? `, ${waitingElsewhere} waiting on other islands` : ""}`,
  islands: "islands",
  shipped: "shipped",
  automated: "automated",
  onYou: "on you",
  mostStuck: "Most stuck",
  cardsWaiting: (n: number) => `${plural(n, "card")} waiting on you`,
  here: "Here",
  go: "Go",
  youreHere: "you're here",
  permits: (folders: string) => `Ships on its own in ${folders}`,
  waitingOnYou: "waiting on you",
  checksElsewhere: (n: number) => ` ${plural(n, "check")} researched on your other islands ${n === 1 ? "isn't" : "aren't"} running here yet.`,
  connect: "Connect another repo",
  connectLive: "Every repo you add becomes a new island.",
  connectSim: "In the live game, every repo you add becomes a new island.",
};

// ---------- progression: level, streak, morning brief ----------
// Unlock names and level titles live with the rules in shared/src/progression.ts.

const daysAgo = (n: number) => plural(n, "day");

export const PROGRESS = {
  chipLabel: (streak: number) => `${streak}-day streak. Open progress`,
  chipTitle: (streak: number) => `${streak}-day streak`,
  days: (n: number) => (n === 1 ? "day" : "days"),
  lv: (level: number) => `Lv ${level}`,
  xp: (n: number) => `+${n} XP`,
  levelUp: (level: number, title: string) => `Level ${level} · ${title}`,
  unlocked: (name: string) => `Unlocked: ${name}`,
  today: "today",
  trendEmpty: "Cards waiting on you each morning. Play a few days and watch it shrink as trust grows.",
  trendDown: (n: number, days: number) => `${n} fewer card${n === 1 ? "" : "s"} waiting on you than ${daysAgo(days)} ago. Trust is growing.`,
  trendUp: (n: number, days: number) => `${n} more than ${daysAgo(days)} ago. New work came in. Clean ships and new checks shrink it.`,
  trendSame: "Same as before. Clean ships, new checks and launch permits shrink it.",
  tally: { ships: "shipped", cards: "cards answered", xp: "XP today" },
  hello: (hour: number) => (hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"),
  briefLabel: "Today",
  streak: (n: number) => `${n}-day streak`,
  streakSuffix: "-day streak",
  nothing: "Nothing is waiting on you. The factory's running.",
  cardsToday: (n: number) => `${plural(n, "card")} waiting on you today.`,
  lastTime: (ships: number, cards: number, autoPct: number) =>
    `Last time: ${ships} shipped, ${cards} cards answered${autoPct ? `, ${autoPct}% launched on their own` : ""}.`,
  keepStreak: (n: number) => ` One move today keeps your streak at ${n}.`,
  startStreak: "Answer a card or ship a PR every day to start a streak. Streaks unlock things for your factory.",
  checkin: (n: number) => `Check in · ${n}`,
  twoMinutes: "about two minutes",
  later: "Later",
  back: "Back to the floor",
  sheet: "Progress",
  /** the eyebrow over the level gauge */
  gauge: "Boiler pressure",
  sheetTitle: (level: number, title: string) => `Level ${level} · ${title}`,
  toLevel: (have: number, need: number, next: number) => `${have}/${need} XP to level ${next}`,
  best: (n: number) => `Best ${n}`,
  shields: (n: number) => ` · ${plural(n, "shield")}`,
  week: "This week",
  todayHead: "Today",
  waitingEachDay: "Waiting on you each day",
  unlocks: "Unlocks",
  yours: "Yours",
  needLevel: (n: number) => `Level ${n}`,
  needStreak: (n: number) => `${n}-day streak`,
  next: (name: string, gap: string) => `Next: ${name} at ${gap}.`,
  nudges: "Nudges",
  nudgeAsk: "Tell me when I'm the bottleneck",
  nudge: { on: "On", off: "Off", blocked: "Blocked", unsupported: "n/a" },
  nudgeBlocked: "Notifications are blocked for this site in your browser settings.",
  nudgeUnsupported: "This browser can't show notifications. On iPhone, add Shiptorio to your home screen first.",
  nudgeWhat: "One quiet notification when new cards land and you're not looking. Never more than one every 15 minutes.",
  xpRule: "XP only comes from real results: ships, clean ships, launches that hold, checks you add, cards you answer.",
  notifyTitle: (n: number) => `${plural(n, "card")} waiting on you`,
  notifyBody: "The factory needs a decision.",
};

// The crash screen (ErrorBoundary): a blown boiler plate with one way back.
export const CRASH = {
  eyebrow: "Boiler room · fault",
  state: "Blocked",
  title: "Boiler blew",
  body: "Something in this screen overheated and the gauges went dark. Your repo, its PRs and every card you answered are untouched.",
  hint: "Restart relights the furnace and puts you back on the map.",
  restart: "Restart",
  ref: (id: string) => `Fault ${id.slice(0, 8)}`,
};

// Brand art alt text (web/src/ui/Logo.tsx).
export const BRAND = {
  wordmarkAlt: "Shiptorio",
  markAlt: "Shiptorio",
};

// Public, explicitly simulated 90-second judge replay.
export const JUDGE = {
  badge: "Judge mode · simulation",
  title: "A factory that ships fixes",
  intro: "Follow a checkout crash from customer signal to verified fix in about 90 seconds. The replay runs itself; you can try the launch permit card along the way.",
  disclosure: "Scripted simulation. No live AI calls, GitHub changes, or customer messages.",
  credit: CREDIT,
  play: "Play the 90-second story", replay: "Replay", docs: "Explore the docs",
  captionLabel: "Judge story", progress: "Story progress", inputs: "Simulation inputs", results: "Simulation results",
  permitTitle: "Docs launch permit", permitText: "Low-risk docs earned trust through clean reviews. Allow docs to launch after every required check passes. Checkout still waits for a human.",
  permitAction: "Grant docs permit", permitGranted: "Permit granted", autoPermit: "The simulated player grants this automatically at 65 seconds.",
  receipts: "Gauntlet receipts", passed: "PASS", waiting: "WAITING",
  rework: "CAUGHT: the empty-cart repro failed. A scar tag sends the fix back to the planner; the assembler builds again.",
  checking: "CI → verify bay → independent AI review. Each station checks the assembler's work.",
  rockets: "Rockets", users: "Users unblocked", autonomy: "Autonomy", floor: "Floor", advisor: "Advisor",
  done: "Story complete. Two launches. One stronger factory.",
  beats: [
    { title: "A little play. A lot shipped.", text: "Your codebase becomes a factory. Customer signals are ore. Your subscriptions power the machines." },
    { title: "Three signals, one floor", text: "Sentry reports a checkout crash affecting 112 users. An inbox report joins the same problem. A GitHub docs issue enters its own lane." },
    { title: "The planner picks the next move", text: "The foreman ranks the crash first, links the customer report, and plans a guarded total plus an empty-cart regression test. You approve the plan." },
    { title: "Build, prove, rework", text: "Your Claude Code assembler builds the PR. CI checks it, the verify bay reproduces the bug, and a separate reviewer attacks the fix. Failed proof goes back with a scar." },
    { title: "Trust comes with receipts", text: "The repaired PR clears CI, proof, and independent review. The merge gate still needs you. A narrow docs permit can remove a routine bottleneck." },
    { title: "A permit launches the docs", text: "The docs PR passed its checks and launches under its permit. The high-risk checkout fix stays at the human merge gate." },
    { title: "Merge means liftoff", text: "The simulated player merges the verified checkout fix. A rocket launches, Sentry clears, and 112 users are unblocked." },
    { title: "Autonomy is earned", text: "The customer reply is approved. Two accepted suggestions unlock Floor: the foreman can route and tune work. Launch permits stay scoped to their folder." },
    { title: "More trust. More factory.", text: "Signals became plans, plans became verified PRs, and merges became rockets. In a connected factory these are real changes. The more you play, the more it can run itself." },
  ],
} as const;

/** docs/ATTENTION.md: one card shape, three kinds, Continue or Later. */
export const ATTENTION = {
  kind: { approve: "Approve", steer: "Steer", suggest: "Suggested" } as const,
  continue: "Continue",
  later: "Later",
  details: "Details",
  hide: "Hide",
  /** Tap to see the planner's one plain reason for this card. */
  whyAsk: "Why?",
  others: "Other options",
  swipeHint: "Swipe right to continue, left for later",
  laterAsk: "Why later? (optional)",
  teach: "OR TELL THE PLANNER",
  why: [
    { why: "defer", label: "Not now" },
    { why: "kind", label: "Stop showing these" },
    { why: "spark", label: "You decide these" },
    { why: "wrong", label: "Wrong call" },
  ] as const,
  parked: "Parked for a day.",
  more: (approve: number, steer: number, suggest: number) => [steer && `${steer} steer`, approve && `${approve} approve`, suggest && `${suggest} suggested`].filter(Boolean).join(" · "),
  checkin: "Check in ›",
  go: "Go",
  hold: "Hold",
  holdLaunch: "Hold to launch",
  confirmLaunch: "Activate again to launch",
  again: "Again",
  moreWaiting: (n: number) => `${n} more waiting`,
  pushTitle: (approve: number, steer: number) => [steer && `${steer} to steer`, approve && `${approve} to approve`].filter(Boolean).join(", ") + " in Shiptorio",
};

/** Coming back (docs/GAMEPLAY-PICKS.md r3-return): what really shipped while you were gone. */
export const AWAY = {
  line: (n: number) => `${n} shipped while you were away`,
  skip: "Tap to skip",
  skipLabel: "Skip the replay of what shipped while you were away",
};

/** The simple screen (?simple=1): the slow-spot line and the one task tray. */
export const TASKS = {
  slow: "Slow spot",
  you: (n: number) => `You · ${n} waiting`,
  stage: (stage: string, summary: string) => `${stage[0].toUpperCase()}${stage.slice(1)} · ${summary}`,
  clear: "Nothing · all clear",
  open: "Open",
  hide: "Hide",
  ideas: (n: number) => `${n} idea${n === 1 ? "" : "s"}`,
  label: "Tasks",
  lineLabel: (line: string) => `Slow spot: ${line}. Open the tasks`,
  kind: { approve: "Approve", steer: "Stuck", suggest: "Idea" } as const,
  of: (i: number, n: number) => `${i} of ${n}`,
  prev: "Previous task",
  next: "Next task",
  later: "Later",
  edit: "Edit",
  more: "More",
  less: "Less",
  others: "Or do this instead",
  does: (label: string) => `Continue: ${label}`,
  earn: (left: number, label: string) => `${left} more ${label}, then the factory stops asking`,
  swipeHint: "Swipe to see the next task",
  done: "All clear. Nothing needs you right now.",
};
