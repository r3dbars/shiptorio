// A fake factory that speaks the same protocol as the server, so the UI never waits on
// the backend. Scenarios are scripted and double as demo replays.

import {
  SCIENCE_FOR,
  type Belt,
  type FactoryState,
  type Item,
  type ItemKind,
  type Machine,
  type Patch,
  type ServerToWeb,
  type WebToServer,
} from "@shiptorio/shared";
import type { Listener, Source, StatusListener } from "../source";

const TICK_MS = 900;

interface Ore {
  at: number; // tick it arrives
  title: string;
  kind: ItemKind;
  district: string;
  failFirst?: string; // inspector rejects the first attempt with this
}

export const SCENARIOS = {
  "quiet-morning": [
    { at: 2, title: "Checkout button spins forever on Safari", kind: "bug", district: "web" },
    { at: 6, title: "Add dark mode toggle", kind: "feature", district: "web" },
    { at: 11, title: "Missing tests for webhook signatures", kind: "tests", district: "server" },
    { at: 16, title: "Remove dead map cache code", kind: "cleanup", district: "server" },
  ],
  "rework-loop": [
    { at: 2, title: "Retry sync when the app comes back online", kind: "bug", district: "server", failFirst: "vitest: 2 failing (sync.test.ts)" },
    { at: 8, title: "Show PR status on the launch pad", kind: "feature", district: "web" },
  ],
} satisfies Record<string, Ore[]>;

export type ScenarioName = keyof typeof SCENARIOS;

const DISTRICTS = [
  { name: "web", x: 0, y: 0, w: 7, h: 6, files: 40 },
  { name: "server", x: 9, y: 0, w: 6, h: 5, files: 30 },
  { name: "shared", x: 17, y: 0, w: 3, h: 3, files: 8 },
  { name: "docs", x: 22, y: 0, w: 3, h: 2, files: 5 },
  { name: "/", x: 27, y: 0, w: 3, h: 3, files: 9 },
];

function initialState(): FactoryState {
  const machines: Machine[] = [
    { id: "ore-issues", type: "ore_deposit", x: -6, y: 0, tier: 1, state: "idle" },
    { id: "splitter-1", type: "splitter", x: -3, y: 0, harness: "spark", powerId: "steam-spark", tier: 1, state: "idle" },
    { id: "assembler-1", type: "assembler", x: 0, y: 0, harness: "spark", powerId: "steam-spark", tier: 1, state: "idle" },
    { id: "inspector-1", type: "inspector", x: 3, y: 0, tier: 1, state: "idle" },
    { id: "launch-pad", type: "launch_pad", x: 6, y: 0, tier: 1, state: "idle" },
    { id: "steam-spark", type: "steam", x: 0, y: 3, tier: 1, state: "idle" },
  ];
  const chain = ["ore-issues", "splitter-1", "assembler-1", "inspector-1", "launch-pad"];
  const belts: Belt[] = chain.slice(1).map((to, i) => ({ id: `belt-${i + 1}`, from: chain[i], to }));
  return {
    repo: "sim/shiptorio",
    baseBranch: "main",
    districts: DISTRICTS,
    machines,
    belts,
    items: [],
    power: [{ id: "steam-spark", kind: "steam", name: "Muse Spark", level: 1, online: true }],
    science: { red: 0, green: 0, grey: 0, blue: 0 },
    trust: 0.5,
    tick: 0,
  };
}

// How many ticks an item spends in each step.
const DWELL: Partial<Record<Item["state"], number>> = { ore: 2, queued: 2, working: 4, inspecting: 3, rejected: 2, on_pad: 4 };

export function connectSim(name: ScenarioName, onMessage: Listener, onStatus: StatusListener): Source {
  const script: Ore[] = [...SCENARIOS[name]];
  const s = initialState();
  const since = new Map<string, number>(); // item id -> tick it entered its state
  const fails = new Map<string, string | undefined>(); // item id -> scripted inspector failure
  // ?autolaunch merges PRs on the pad by itself, for hands-off demo replays.
  const autoLaunch = new URLSearchParams(location.search).has("autolaunch");
  let pr = 140;

  const emit = (msg: ServerToWeb) => queueMicrotask(() => onMessage(msg));
  const log = (level: "info" | "warn" | "error" | "success", text: string, itemId?: string) =>
    emit({ type: "log", level, text, at: Date.now(), itemId });

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
    emit({ type: "patch", patch: { ...p, tick: s.tick } });
  };

  const machine = (type: Machine["type"]) => s.machines.find((m) => m.type === type);
  const setMachine = (id: string | undefined, state: Machine["state"]) => {
    const m = s.machines.find((x) => x.id === id);
    return m && m.state !== state ? [{ ...m, state }] : [];
  };

  const tick = () => {
    s.tick++;
    const now = Date.now();

    while (script.length && script[0].at <= s.tick) {
      const o = script.shift()!;
      const item: Item = { id: `sim-${s.tick}`, kind: o.kind, source: "github_issue", title: o.title, district: o.district, state: "ore", attempts: 0, updatedAt: now };
      fails.set(item.id, o.failFirst);
      apply({ items: [item] });
      log("info", `Ore: ${o.title}`, item.id);
    }

    for (const item of [...s.items]) {
      const age = s.tick - (since.get(item.id) ?? s.tick);
      if (age < (DWELL[item.state] ?? Infinity)) continue;
      const next = { ...item, updatedAt: now };
      switch (item.state) {
        case "ore":
          if (!machine("splitter")) continue;
          apply({ items: [{ ...next, state: "queued" }] });
          log("info", `Splitter sorted "${item.title}" → ${item.district}`, item.id);
          break;
        case "queued": {
          const a = s.machines.find((m) => m.type === "assembler" && m.state === "idle");
          if (!a) continue;
          apply({ items: [{ ...next, state: "working", machineId: a.id, attempts: item.attempts + 1 }], machines: setMachine(a.id, "working") });
          log("info", `${a.id} picked up "${item.title}"`, item.id);
          break;
        }
        case "working": {
          const prNumber = item.prNumber ?? ++pr;
          apply({
            items: [{ ...next, state: "inspecting", prNumber, prUrl: `https://github.com/sim/shiptorio/pull/${prNumber}` }],
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
          } else {
            apply({ items: [{ ...next, state: machine("launch_pad") ? "on_pad" : "passed", failure: undefined }] });
            log("success", `PR #${item.prNumber} passed. On the pad.`, item.id);
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
    emit({ type: "patch", patch: { tick: s.tick } });
  };

  const launch = (item: Item) => {
    const key = SCIENCE_FOR[item.kind];
    apply({
      items: [{ ...item, state: "launched", updatedAt: Date.now() }],
      science: { ...s.science, [key]: s.science[key] + 1 },
      trust: Math.min(1, s.trust + 0.05),
    });
    log("success", `Rocket launched: PR #${item.prNumber} merged`, item.id);
  };

  onStatus("live");
  emit({ type: "snapshot", state: structuredClone(s) });
  const timer = setInterval(tick, TICK_MS);

  return {
    send(msg: WebToServer) {
      switch (msg.type) {
        case "launch_pr": {
          const item = s.items.find((i) => i.id === msg.itemId);
          if (item?.state === "on_pad") launch(item); // in the real factory, a human merge does this
          break;
        }
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
