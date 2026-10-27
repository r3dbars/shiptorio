// A new floor of the floating city being built (ART-PASS.md "Floor build"; floating-city slice 9 fills this in):
// ~6 s, a crane on the floor below swings girders up, scaffold climbs, the slab slides in, the riser wall lifts into
// place, sparks run along the seams, the arched windows light last. Moves only I.floorParts(id) plus temporary props
// (removed after). Reduced motion: a 1 s fade.
// STUB from slice 1: shows the floor at once. Keep the signature.

import type { Iron } from "./core";
import type { FloorId, FloorRun } from "./floors";

export const FLOOR_BUILD_SECONDS = 6;

export interface FloorBuildOpts {
  reduced?: boolean;
  seconds?: number;
  speed?: number;
}

/** show every part of a floor (or hide them): the end state of a build, and what cancel() undoes */
export function showFloor(I: Iron, id: FloorId, on = true) {
  for (const o of I.floorParts?.(id) ?? []) o.visible = on;
}

export function buildFloor(I: Iron, id: FloorId, _opts: FloorBuildOpts = {}): FloorRun {
  showFloor(I, id, true);
  return { update: () => true, finish() {}, cancel: () => showFloor(I, id, false), done: Promise.resolve(), progress: 1 };
}
