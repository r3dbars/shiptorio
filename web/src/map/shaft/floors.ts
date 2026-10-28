// The floors of the floating city (ART-PASS.md "Floors"). Every static piece of the world is tagged
// userData.floor = one of these ids (world.js, mine.js, keel...), bake.ts merges each floor on its own, and
// I.floorParts(id) hands back what to hide or animate, so a floor can be missing at the start of a first run and be
// built (floorbuild.ts) when the build-as-you-go journey reaches it (modules/growth.js, ?buildout=1).

export const FLOOR_IDS = ["mine", "build", "checks", "launch"] as const;
export type FloorId = (typeof FLOOR_IDS)[number];

export interface FloorDef {
  id: FloorId;
  /** deck top (layout tiers: mine -16, build 0, checks 11, launch 22) */
  y: number;
  /** the root y band this floor owns (bake's cells use the same cuts): its riser wall and framing up to the next deck */
  y0: number;
  y1: number;
  /** the rock, the quarry and the mine cliff are there from the start of a first run; the rest get built */
  always?: boolean;
}

export const FLOORS: readonly FloorDef[] = [
  { id: "mine", y: -16, y0: -Infinity, y1: -6, always: true },
  { id: "build", y: 0, y0: -6, y1: 6 },
  { id: "checks", y: 11, y0: 6, y1: 17 },
  { id: "launch", y: 22, y0: 17, y1: Infinity },
];

export const floorById = (id: FloorId): FloorDef => FLOORS.find((f) => f.id === id)!;

/** the floor a root y falls on (the same cuts as bake.ts's cells) */
export function floorAtY(y: number): FloorId {
  return (FLOORS.find((f) => y >= f.y0 && y < f.y1) ?? FLOORS[0]).id;
}

/**
 * Which floor each build-as-you-go step's site sits on (web/src/buildout/journey.ts STEP_IDS, in order). A step can
 * only play once its floor stands, so the next step's floor gets built first when it isn't up yet.
 */
export const STEP_FLOOR = {
  tunnel: "mine",
  boiler: "build",
  builder: "build",
  issue: "mine",
  planner: "build",
  build: "build",
  checks: "checks",
  launch: "launch",
} as const satisfies Record<string, FloorId>;
export type JourneyStepId = keyof typeof STEP_FLOOR;
/** the steps in journey order (keep in step with journey.ts STEP_IDS; web/test/shaft-floors.test.ts checks it) */
export const STEP_ORDER = Object.keys(STEP_FLOOR) as JourneyStepId[];

/**
 * The floors standing when the player is on step `next` (the first step not done yet; null or "look" = the journey is
 * over, everything stands): the always floors, plus every floor a step up to and including `next` sits on.
 * Returned in FLOOR_IDS order.
 */
export function floorsFor(next: JourneyStepId | "look" | null): FloorId[] {
  const i = next == null || next === "look" ? STEP_ORDER.length - 1 : STEP_ORDER.indexOf(next);
  const up = new Set<FloorId>(FLOORS.filter((f) => f.always).map((f) => f.id));
  for (let k = 0; k <= Math.max(0, i); k++) up.add(STEP_FLOOR[STEP_ORDER[k]]);
  return FLOOR_IDS.filter((f) => up.has(f));
}

/** the floor that has to rise before step `next` can play, if it isn't standing after `prev` */
export function floorToBuild(prev: JourneyStepId | null, next: JourneyStepId): FloorId | null {
  const had = new Set(prev ? floorsFor(prev) : FLOORS.filter((f) => f.always).map((f) => f.id));
  const f = STEP_FLOOR[next];
  return had.has(f) ? null : f;
}

/** a floor being built (floorbuild.ts): the same run shape as construct.ts's ConstructRun */
export interface FloorRun {
  /** advance by dt seconds; true once finished. The caller ticks it from its frame loop (works with ?raf=0). */
  update(dt: number): boolean;
  /** jump to the end */
  finish(): void;
  /** put the floor back as it was (hidden again) */
  cancel(): void;
  readonly done: Promise<void>;
  /** 0-1 */
  readonly progress: number;
}
