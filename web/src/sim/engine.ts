// A fake factory that speaks the same protocol as the server, so the UI never waits on
// the backend. Scenarios are scripted and double as demo replays.
//
// The sim also plays Spark the Foreman (docs/PRODUCT.md): it logs tool calls in Spark's
// voice, asks before building (autonomy starts at Advisor), puts the bottleneck on the
// Next Move card, and keeps the HUD metrics. Spark never writes code; the assemblers do.

import {
  SCIENCE_FOR,
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
  failFirst?: string; // inspector rejects the first attempt with this
  users?: number; // usersAffected, from Sentry
  reporter?: string; // who reported it (email sender, issue author)
  linkTo?: string; // title of an earlier ore this is the same problem as; merges into it
  ask?: string; // Spark asks before building it; this is the card's question
  spark?: SparkLine[]; // what Spark logs when it reads this ore
}

interface Scenario {
  ores: Ore[];
  districts?: District[];
  harness?: Harness; // who builds; the player's subscription
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
      { at: 6, title: "Add dark mode toggle", kind: "feature", district: "web" },
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
        failFirst: "vitest: 1 failing (checkout.test.ts › applies coupon to empty cart)",
        ask: "Send it to your Claude Code assembler with Spark's plan: guard cart.total, add a coupon-on-empty-cart test.",
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
} satisfies Record<string, Scenario>;

export type ScenarioName = keyof typeof SCENARIOS;

const SOLAR_NAME: Partial<Record<Harness, string>> = { claude_code: "Claude", codex: "ChatGPT" };

function initialState(sc: Scenario): FactoryState {
  const harness = sc.harness ?? "spark";
  // Spark's steam plant powers the brain. A subscription (solar) powers the assemblers, when there is one.
  const plant = harness === "spark" ? "steam-spark" : `solar-${harness}`;
  const machines: Machine[] = [
    { id: "ore-issues", type: "ore_deposit", x: -6, y: 0, tier: 1, state: "idle" },
    { id: "splitter-1", type: "splitter", x: -3, y: 0, harness: "spark", powerId: "steam-spark", tier: 1, state: "idle" },
    { id: "assembler-1", type: "assembler", x: 0, y: 0, harness, powerId: plant, tier: 1, state: "idle" },
    { id: "inspector-1", type: "inspector", x: 3, y: 0, tier: 1, state: "idle" },
    { id: "launch-pad", type: "launch_pad", x: 6, y: 0, tier: 1, state: "idle" },
    { id: "steam-spark", type: "steam", x: 0, y: 3, tier: 1, state: "idle" },
  ];
  const power: PowerSource[] = [{ id: "steam-spark", kind: "steam", name: "Muse Spark", level: 1, online: true }];
  if (harness !== "spark") {
    machines.push({ id: plant, type: "solar", x: 3, y: 3, tier: 1, state: "idle" });
    power.push({ id: plant, kind: "solar", name: SOLAR_NAME[harness] ?? harness, level: 0.9, online: true });
  }
  if (sc.ores.some((o) => o.source === "sentry")) machines.push({ id: "ore-sentry", type: "ore_deposit", x: -6, y: -3, tier: 1, state: "idle" });
  if (sc.ores.some((o) => o.source === "inbox")) machines.push({ id: "ore-inbox", type: "ore_deposit", x: -6, y: 3, tier: 1, state: "idle" });
  const chain = ["ore-issues", "splitter-1", "assembler-1", "inspector-1", "launch-pad"];
  const belts: Belt[] = chain.slice(1).map((to, i) => ({ id: `belt-${i + 1}`, from: chain[i], to }));
  const districts = sc.districts ?? REPO_DISTRICTS;
  return {
    repo: sc.districts ? "sim/demo-shop" : "sim/shiptorio",
    baseBranch: "main",
    districts,
    machines,
    belts,
    items: [],
    power,
    science: { red: 0, green: 0, grey: 0, blue: 0 },
    trust: 0.5,
    tick: 0,
    bottleneck: null,
    move: null,
    metrics: { rockets: 0, bitersKilled: 0, escapedDefects: 0, customersAnswered: 0, usersUnblocked: 0, shipScore: 0, checkouts: sc.districts ? 1240 : undefined },
    autonomy: {
      level: "advisor",
      districts: districts.map((d) => ({ district: d.name, score: d.name === "docs" ? 0.7 : 0.3, risk: d.name === "docs" ? "low" : "medium", permit: false })),
      next: { level: "floor", have: 8, need: 10, label: "Spark moves approved as-is" },
      ranAlone: 0,
    },
    foreman: { thinking: false },
  };
}

// How many ticks an item spends in each step.
const DWELL: Partial<Record<Item["state"], number>> = { ore: 2, queued: 2, working: 4, inspecting: 3, rejected: 2, on_pad: 4 };

// Where each item state sits in the bottleneck table.
const STAGE_OF: Partial<Record<Item["state"], Stage>> = { ore: "intake", queued: "build", working: "build", inspecting: "inspect", rejected: "inspect", on_pad: "pad", passed: "pad" };

const shipScore = (m: Metrics) => m.usersUnblocked + 10 * m.customersAnswered + m.rockets - 25 * m.escapedDefects;

export function connectSim(name: ScenarioName, onMessage: Listener, onStatus: StatusListener): Source {
  const sc: Scenario = SCENARIOS[name];
  const script: Ore[] = [...sc.ores];
  const s = initialState(sc);
  const since = new Map<string, number>(); // item id -> tick it entered its state
  const fails = new Map<string, string | undefined>(); // item id -> scripted inspector failure
  const asks = new Map<string, string>(); // item id -> the question Spark asks before building it
  const held = new Set<string>(); // queued items waiting on the player's yes
  const byTitle = new Map<string, string>(); // ore title -> item id, for linking
  const onChoose = new Map<string, (optionId: string) => void>(); // move id -> what each answer does
  const pending: Move[] = []; // moves waiting behind the open card
  const undos = new Map<string, () => void>();
  // ?autolaunch merges PRs on the pad by itself, for hands-off demo replays.
  const autoLaunch = new URLSearchParams(location.search).has("autolaunch");
  let pr = 140;
  let seq = 0;

  const emit = (msg: ServerToWeb) => queueMicrotask(() => onMessage(msg));
  const log = (level: "info" | "warn" | "error" | "success", text: string, itemId?: string) =>
    emit({ type: "log", level, text, at: Date.now(), itemId });

  // A line in Spark's voice. Pass undo to make it undoable from the floor log.
  const spark = (line: SparkLine, opts: { itemId?: string; target?: string; approvedBy?: "player" | "autonomy"; undo?: () => void } = {}) => {
    const actionId = opts.undo ? `act-${++seq}` : undefined;
    if (actionId && opts.undo) undos.set(actionId, opts.undo);
    emit({ type: "log", level: "info", text: line.text, at: Date.now(), itemId: opts.itemId, actor: "spark", tool: line.tool, reason: line.reason, actionId, approvedBy: opts.approvedBy });
    s.foreman = { targetId: opts.target ?? s.foreman?.targetId, tool: line.tool, thinking: false };
    emit({ type: "patch", patch: { foreman: s.foreman } });
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
    if (p.science) s.science = p.science;
    if (p.trust !== undefined) s.trust = p.trust;
    if (p.metrics) s.metrics = p.metrics;
    if (p.autonomy) s.autonomy = p.autonomy;
    if (p.bottleneck !== undefined) s.bottleneck = p.bottleneck;
    emit({ type: "patch", patch: { ...p, tick: s.tick } });
  };

  const bumpMetrics = (d: Partial<Metrics>) => {
    const m = { ...s.metrics!, ...d };
    apply({ metrics: { ...m, shipScore: shipScore(m) } });
  };

  // ---------- the Next Move card ----------

  const propose = (move: Omit<Move, "id" | "createdAt">, then: (optionId: string) => void) => {
    const m: Move = { ...move, id: `move-${++seq}`, createdAt: Date.now() };
    onChoose.set(m.id, then);
    if (s.move) pending.push(m);
    else open(m);
  };
  const open = (m: Move) => {
    s.move = m;
    emit({ type: "move", move: m });
  };
  const resolve = (moveId: string, optionId: string | undefined, actor: "player" | "spark") => {
    const then = onChoose.get(moveId);
    if (!then || s.move?.id !== moveId) return;
    onChoose.delete(moveId);
    s.move = null;
    emit({ type: "move_resolved", moveId, optionId, actor });
    if (optionId) then(optionId);
    const next = pending.shift();
    if (next) setTimeout(() => open(next), 600);
  };

  // Each move the player approves as-is counts toward the next autonomy unlock.
  const approvedAsIs = () => {
    const a = s.autonomy!;
    if (!a.next) return;
    const have = a.next.have + 1;
    if (have < a.next.need) return apply({ autonomy: { ...a, next: { ...a.next, have } } });
    const level = a.next.level;
    const next: Autonomy["next"] = level === "floor" ? { level: "build", have: 0, need: 5, label: "PRs merged from Spark's plans, no escaped defect" } : null;
    apply({ autonomy: { ...a, level, next } });
    emit({
      type: "autonomy_unlocked",
      level,
      text: level === "floor" ? "Spark earned Floor: it routes work and tunes machines on its own now" : `Spark earned ${level}`,
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
        itemId: item.id,
        options: [
          { id: "go", label: "Go", recommended: true, actions: [{ tool: "start_job", args: { itemId: item.id, machineId: asm?.id }, reason: "highest value on the floor" }] },
          { id: "skip", label: "Not now", recommended: false, actions: [] },
        ],
      },
      (opt) => {
        if (opt !== "go") return spark({ tool: "post_log", text: `Parked "${item.title}". Ask again when you're ready.` });
        held.delete(item.id);
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
        why: users ? `Merging #${item.prNumber} closes the crash hitting ${users} users.` : `PR #${item.prNumber} passed the inspector: ${item.title}`,
        stage: "pad",
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
        why: `Spark drafted: "Thanks for the report. Checkout is fixed in #${item.prNumber}, you can pay now. Sorry about that."`,
        stage: "impact",
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
    for (const line of o.spark ?? []) spark(line, { target: o.source === "sentry" ? "ore-sentry" : o.source === "inbox" ? "ore-inbox" : "ore-issues" });
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
      id: `sim-${s.tick}`,
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
    byTitle.set(o.title, item.id);
    if (o.ask) asks.set(item.id, o.ask);
    apply({ items: [item] });
    if (!o.spark) log("info", `Ore: ${o.title}`, item.id);
  };

  // The stage with the most value waiting, the way bottleneck.ts scores it.
  const findBottleneck = (): Bottleneck | null => {
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
    return best;
  };

  const tick = () => {
    s.tick++;
    const now = Date.now();

    while (script.length && script[0].at <= s.tick) arrive(script.shift()!, now);

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
          if (held.has(item.id)) continue;
          const a = s.machines.find((m) => m.type === "assembler" && m.state === "idle");
          if (!a) continue;
          apply({ items: [{ ...next, state: "working", machineId: a.id, attempts: item.attempts + 1 }], machines: setMachine(a.id, "working") });
          log("info", `${a.id} picked up "${item.title}"`, item.id);
          break;
        }
        case "working": {
          const prNumber = item.prNumber ?? ++pr;
          apply({
            items: [{ ...next, state: "inspecting", prNumber, prUrl: `https://github.com/${s.repo}/pull/${prNumber}` }],
            machines: setMachine(item.machineId, "idle"),
          });
          log("info", `PR #${prNumber} heads to the inspector`, item.id);
          break;
        }
        case "inspecting": {
          const failure = fails.get(item.id);
          if (failure && item.attempts === 1) {
            apply({ items: [{ ...next, state: "rejected", failure }] });
            log("warn", `Inspector rejected PR #${item.prNumber}: ${failure}`, item.id);
            spark({ tool: "request_rework", text: `Told ${item.machineId ?? "the assembler"} what broke on #${item.prNumber}`, reason: failure }, { itemId: item.id, target: item.machineId });
          } else {
            const pad = machine("launch_pad");
            apply({ items: [{ ...next, state: pad ? "on_pad" : "passed", failure: undefined }] });
            log("success", `PR #${item.prNumber} passed. On the pad.`, item.id);
            if (pad && !autoLaunch) askToLaunch(next);
          }
          break;
        }
        case "rejected":
          apply({ items: [{ ...next, state: "queued" }] });
          log("info", `Rework: "${item.title}" goes back to the assemblers`, item.id);
          break;
        case "on_pad":
          if (!autoLaunch) continue;
          launch(item);
          break;
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
    emit({ type: "patch", patch: { tick: s.tick, ...(metrics !== m && { metrics }), ...(changed && { bottleneck }) } });
  };

  const launch = (item: Item) => {
    const key = SCIENCE_FOR[item.kind];
    apply({
      items: [{ ...item, state: "launched", updatedAt: Date.now() }],
      science: { ...s.science, [key]: s.science[key] + 1 },
      trust: Math.min(1, s.trust + 0.05),
    });
    log("success", `Rocket launched: PR #${item.prNumber} merged`, item.id);
    const m = s.metrics!;
    const users = item.customer?.usersAffected ?? 0;
    bumpMetrics({ rockets: m.rockets + 1, usersUnblocked: m.usersUnblocked + users, bitersKilled: m.bitersKilled + (item.source === "sentry" ? 1 : 0) });
    if (item.source === "sentry") log("success", `Biters cleared: Sentry is quiet on /${item.district}`, item.id);
    for (const to of item.customer?.reporters ?? []) askToReply(item, to);
    const a = s.autonomy!;
    if (a.next?.level === "build") apply({ autonomy: { ...a, next: { ...a.next, have: a.next.have + 1 } } });
  };

  onStatus("live");
  emit({ type: "snapshot", state: structuredClone(s) });
  const timer = setInterval(tick, TICK_MS);

  return {
    send(msg: WebToServer) {
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
            machines: [{ id: `${msg.machineType}-${s.tick}`, type: msg.machineType, x: msg.x, y: msg.y, harness: msg.harness, tier: 1, state: "idle" }],
          });
          break;
        case "remove_machine":
          apply({ removed: [{ kind: "machine", id: msg.id }] });
          break;
        case "connect_belt":
          apply({ belts: [{ id: `belt-${s.tick}-${msg.from}`, from: msg.from, to: msg.to, carries: msg.carries }] });
          break;
        default:
          break;
      }
    },
    close() {
      clearInterval(timer);
      onStatus("offline");
    },
  };
}
