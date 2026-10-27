// Build as you go (docs/GAMEPLAY-PICKS.md, "Build as you go"; plan https://claude.ai/artifact/T6puBBYVnZiFaBiqephirN).
// The first run starts in the dark with nothing built. Eight builds, in order, raise the pieces the app needs while a
// real first issue rides through them. This file is the contract every slice reads (CONTRACT.md): the steps, what
// each one reveals, the coach line, where the camera parks, and stepFrom(state), which says where the player is,
// read off real factory state, never a timer.

import type { FactoryState, Item } from "@shiptorio/shared";

import type { Layout } from "../map/shaft/layout";

export const STEP_IDS = ["tunnel", "boiler", "builder", "issue", "planner", "build", "checks", "launch"] as const;
export type StepId = (typeof STEP_IDS)[number];
/** after the last build: the "Look around" card, then free camera and the two counters */
export const LOOK = "look" as const;
export type JourneyId = StepId | typeof LOOK;

/** hold: press and hold (holdLaunch); tap: one tap; continue: the card's Continue; auto: it builds itself */
export type Trigger = "hold" | "tap" | "continue" | "auto";

/** A piece of the shaft, named by role so it resolves on any plan (layout ids move with the player's factory). */
export type Piece =
  | { mine: string } // a tunnel mouth, its cart rail and chute
  | { path: string } // one path by name (collector, lift, ore, header, freight, ...)
  | { station: "planner" | "gate" | "pad" | "ci" }
  | { station: "assembler" } // the first assembler and its spur and tube
  | { power: "first" }; // the first power plant feeding the first assembler

export interface Step {
  id: StepId;
  trigger: Trigger;
  /** the card's button text ("Pry the planks off"); auto steps have none */
  action?: string;
  /** the coach line, one at a time, plain words */
  line: string;
  /** the line on the player's own repo when it differs from the demo shop */
  repoLine?: string;
  /** what rises in this build */
  reveals: Piece[];
  /** where the camera parks while it builds (director.ts frames it) */
  camera: Piece;
  /** the floor that lights the moment this build finishes, if any */
  lights?: "mine" | "build" | "checks" | "launch";
  /** has the factory got past this step? */
  done: (s: FactoryState) => boolean;
}

/** One build moment, in ms from its start (CONTRACT.md). Tap speeds the first two up; the payoff always plays. */
export const BUILD_MS = { chalk: 500, construct: 4500, burst: 5500, payoff: 7000 } as const;
export type BuildPhase = "chalk" | "construct" | "burst" | "payoff" | "done";
export function phaseAt(ms: number): BuildPhase {
  if (ms < BUILD_MS.chalk) return "chalk";
  if (ms < BUILD_MS.construct) return "construct";
  if (ms < BUILD_MS.burst) return "burst";
  if (ms < BUILD_MS.payoff) return "payoff";
  return "done";
}

/** The demo shop's scripted first issue; the starter issue filed on a real repo (only on the player's tap) is the same. */
export const STARTER_ISSUE = {
  title: 'Add a "Run it locally" section to the README',
  label: "shiptorio-starter",
} as const;

const PLANNED: ReadonlySet<Item["state"]> = new Set(["working", "inspecting", "rejected", "passed", "on_pad", "launched"]);
const CHECKED: ReadonlySet<Item["state"]> = new Set(["rejected", "passed", "on_pad", "launched"]);

const github = (s: FactoryState) =>
  s.sources?.some((x) => x.kind === "github" && x.state === "connected") || s.items.some((i) => i.source === "github_issue");
const planned = (i: Item) => PLANNED.has(i.state) || i.attempts > 0;
const prOpen = (i: Item) => i.prNumber != null || i.state === "inspecting" || CHECKED.has(i.state);
const ciReported = (i: Item) =>
  CHECKED.has(i.state) || !!i.scars?.length || !!i.inspection?.stages.some((g) => g.gate === "ci" && g.state !== "pending");
const shipped = (s: FactoryState) =>
  (s.metrics?.rockets ?? 0) > 0 || s.items.some((i) => i.state === "launched" || !!i.orbit);

export const STEPS: readonly Step[] = [
  {
    id: "tunnel",
    trigger: "hold",
    action: "Pry the planks off",
    line: "This is your repo. Work comes up from here.",
    repoLine: "This is your repo. Pry it open to pick which one.",
    reveals: [{ mine: "github" }, { path: "collector" }, { path: "lift" }],
    camera: { mine: "github" },
    lights: "mine",
    done: github,
  },
  {
    id: "boiler",
    trigger: "hold",
    action: "Light it",
    line: "Your AI is the power. Nothing builds without it.",
    repoLine: "Your AI is the power. Pair Claude Code or Codex to light it.",
    reveals: [{ power: "first" }],
    camera: { power: "first" },
    done: (s) => s.power.some((p) => p.online),
  },
  {
    id: "builder",
    trigger: "tap",
    action: "Build it",
    line: "The builder writes code, using your AI.",
    reveals: [{ station: "assembler" }, { path: "ore" }],
    camera: { station: "assembler" },
    lights: "build",
    done: (s) => s.machines.some((m) => m.type === "assembler"),
  },
  {
    id: "issue",
    trigger: "hold",
    action: "Re-rail the cart",
    line: `Your first job: #1, ${STARTER_ISSUE.title.replace(/^Add/, "add")}. Small and safe.`,
    repoLine: "Your first job: the smallest, safest issue in your repo.",
    reveals: [],
    camera: { mine: "github" },
    done: (s) => s.items.length > 0,
  },
  {
    id: "planner",
    trigger: "continue",
    action: "Approve the plan",
    line: "First, a plan. Three steps. Look right?",
    reveals: [{ station: "planner" }],
    camera: { station: "planner" },
    done: (s) => s.items.some(planned),
  },
  {
    id: "build",
    trigger: "auto",
    line: "Your AI is writing it now. You can leave, we'll ping you.",
    reveals: [],
    camera: { station: "assembler" },
    done: (s) => s.items.some(prOpen),
  },
  {
    id: "checks",
    trigger: "auto",
    line: "Every change passes checks before it ships.",
    reveals: [{ path: "header" }, { station: "ci" }],
    camera: { station: "ci" },
    lights: "checks",
    done: (s) => s.items.some(ciReported),
  },
  {
    id: "launch",
    trigger: "hold",
    action: "Launch",
    line: "It passed every check. Hold to launch.",
    reveals: [{ path: "freight" }, { station: "gate" }, { station: "pad" }],
    camera: { station: "pad" },
    lights: "launch",
    done: shipped,
  },
];

export const stepById = (id: StepId): Step => STEPS.find((s) => s.id === id)!;

export interface Where {
  /** the step being worked on, or "look" once every build is done */
  id: JourneyId;
  index: number; // 0-7, 8 for look
  step: Step | null;
  /** the steps already built, in order */
  built: StepId[];
}

/**
 * Where the player is. A later step done means every earlier one is too (a shipped rocket needed a tunnel), so a
 * returning factory with partial data never lands on an early step.
 */
export function stepFrom(s: FactoryState): Where {
  let index = 0;
  STEPS.forEach((step, i) => {
    if (step.done(s)) index = i + 1;
  });
  return {
    id: index < STEPS.length ? STEPS[index].id : LOOK,
    index,
    step: STEPS[index] ?? null,
    built: STEPS.slice(0, index).map((x) => x.id),
  };
}

/** The coach line for a step, in the demo shop or on the player's repo. */
export const lineFor = (step: Step, repo: boolean) => (repo && step.repoLine) || step.line;

export interface Resolved {
  mines: string[];
  stations: string[];
  paths: string[];
}

/** Turn pieces into the layout's own ids (CONTRACT.md: positions come from layout.js, never hard-coded). */
export function resolve(pieces: Piece[], L: Pick<Layout, "stations" | "paths" | "assemblers" | "planner" | "gate" | "pad">): Resolved {
  const out: Resolved = { mines: [], stations: [], paths: [] };
  const has = (name: string) => L.paths.some((p) => p.name === name);
  for (const p of pieces) {
    if ("mine" in p) {
      out.mines.push(p.mine);
      for (const name of [`cart-${p.mine}`, `chute-${p.mine}`]) if (has(name)) out.paths.push(name);
    } else if ("path" in p) {
      if (has(p.path)) out.paths.push(p.path);
    } else if ("power" in p) {
      const asm = L.assemblers[0];
      const plant = L.stations.find((s) => s.power && (s.def as { feeds?: string[] }).feeds?.includes(asm?.id ?? "")) ?? L.stations.find((s) => s.power);
      if (plant) out.stations.push(plant.id);
    } else if (p.station === "assembler") {
      const asm = L.assemblers[0];
      if (asm) {
        out.stations.push(asm.id);
        for (const name of [`spur-${asm.id}`, `tube-${asm.id}`]) if (has(name)) out.paths.push(name);
      }
    } else {
      // gate, pad and planner come straight off the layout (their ids follow the plan); ci is found by type
      const st = p.station === "gate" ? L.gate : p.station === "pad" ? L.pad : p.station === "planner" ? L.planner : L.stations.find((s) => s.type === p.station);
      if (st) out.stations.push(st.id);
    }
  }
  return out;
}

/** Where the camera parks for a step, as director.ts takes it: station ids and "mine:<id>", framed together. */
export function cameraFor(step: Step, L: Pick<Layout, "stations" | "paths" | "assemblers" | "planner" | "gate" | "pad">): string[] {
  const r = resolve([step.camera], L);
  return [...r.mines.map((m) => `mine:${m}`), ...r.stations];
}

// ---------- the shiptorio:build event ----------

/** Fired on window by the scene (slice 2) as each build moves through its moment. Sound, card and tests listen. */
export const BUILD_EVENT = "shiptorio:build";
export interface BuildDetail {
  /** the step being built (later unlocks use their own ids) */
  id: StepId | string;
  phase: "start" | "burst" | "done";
  /** true the first time this kind of piece bursts online (big burst, full bell); false for repeats */
  first?: boolean;
}
export const emitBuild = (detail: BuildDetail) => window.dispatchEvent(new CustomEvent<BuildDetail>(BUILD_EVENT, { detail }));
/** Listen for builds. Returns the remover. */
export function onBuild(fn: (d: BuildDetail) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<BuildDetail>).detail);
  window.addEventListener(BUILD_EVENT, h);
  return () => window.removeEventListener(BUILD_EVENT, h);
}
