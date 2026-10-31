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

import type { AutonomyLevel, Machine, Move } from "@shiptorio/shared";

/** The only place the planner model is credited (VISION principle 8). */
export const CREDIT = "powered by Meta Muse Spark";

// ---------- the map ----------

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

export interface PanelCopy {
  zone: string;
  name: string;
  tag: [color: "green" | "amber" | "blue" | "red" | "steel", text: string];
  what: string;
  actions?: { id: string; label: string; recommended: boolean }[]; // for panels with no Station behind them
}

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

export const LEARN = {
  line: (left: number) => `Approve ${left} more like this and then it's automatic.`,
  aria: (have: number, need: number, left: number) => `${have} of ${need} approved. Approve ${left} more like this and then it's automatic.`,
  title: "The factory does these for you",
  why: "You said yes to these 3 times in a row. Launching still waits for you.",
  stop: "Ask me again",
  stopFor: (label: string) => `Ask me again about ${label}`,
  // The climax: the next one of a learned kind starts with no card, and the deck says so.
  ranItself: (badge: string) => `Shippy's got these now. ${badge} started with no card.`,
};

