// Types for itemlab.js, the builders copied from docs/item-lab.html.
import type * as THREE from "three";

export interface Built {
  g: THREE.Group;
  update(t: number, dt: number, state: string): void;
}

// variant is the Item Lab's [name, color, extra?] tuple; tier is 0 (MK1) to 2 (MK3).
export interface BuildOpts {
  tier?: number;
  variant?: [string, number, number?] | null;
}

export function setNight(on: boolean): void;
export function updateFx(dt: number): void;
export function getSeed(): number;
export function setSeed(s: number): void;

export function buildAssembler(o: BuildOpts): Built; // IDLE · WORKING · BLOCKED
export function buildSplitter(): Built; // IDLE · SORTING
export function buildInspector(): Built; // SCANNING · PASS · REJECT · BACKED UP
export function buildCheck(id: string): Built; // a researched check: the inspector plus its own device; same states
export function buildSteam(o: BuildOpts): Built; // IDLE · RUNNING · OVERLOAD
export function buildGeo(o: BuildOpts): Built; // IDLE · INFERENCE · OVERHEAT
export function buildTurret(): Built; // SCANNING · FIRING
export function buildBiter(o: BuildOpts): Built; // WALK · ATTACK · DIE
export function buildBattery(): Built; // CHARGING · FULL · DRAINING · EMPTY
export function buildLaunchPad(): Built; // IDLE · COUNTDOWN · LAUNCH
export function buildSolar(o: BuildOpts): Built; // SUNNY · CAPPED
export function buildBelt(): Built; // RUNNING · JAMMED
export function buildOre(o: BuildOpts): Built; // RICH · DEPLETED

// The verification gauntlet (docs/LOOP.md), art round 2
export function buildVerify(): Built; // IDLE · VERIFYING · PASS · FAIL · BACKED UP
export function buildReview(): Built; // IDLE · REVIEWING · APPROVED · CHANGES · BACKED UP
export function buildGate(): Built; // WAITING · APPROVED · BACKED UP · REJECTED
export function buildRework(): Built; // FLOWING · CLOGGED
export function buildOrbit(): Built; // WATCHING · ALL CLEAR · ALERT
export function buildMeasure(): Built; // MEASURING · LIFT · NO LIFT · HURT · IDLE (the growth loop)
