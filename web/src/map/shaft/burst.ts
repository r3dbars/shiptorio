// Build as you go, slice 4 (web/src/buildout/CONTRACT.md): power arrives. An arc runs down the cable, the piece
// crackles aether blue-white, its lamps snap on (about 1 s). Big the first time a kind comes online, smaller after.
// The brass ONLINE plate is DOM (web/src/ui/BuildStamp.tsx), not here.
// STUB from slice 1: finishes at once. Slice 4 fills it in; keep the signature.

import type * as THREE from "three";

export const BURST_SECONDS = 1;

export interface BurstOpts {
  /** the first time this kind of piece comes online: the big burst */
  first?: boolean;
  reduced?: boolean;
  /** where the arc starts, in the target's parent frame (the power plant feeding it); none = it crackles in place */
  from?: THREE.Vector3;
}

export interface BurstRun {
  update(dt: number): boolean;
  finish(): void;
  cancel(): void;
  readonly done: Promise<void>;
  readonly progress: number;
}

export function burst(_target: THREE.Object3D, _opts: BurstOpts = {}): BurstRun {
  return { update: () => true, finish() {}, cancel() {}, done: Promise.resolve(), progress: 1 };
}
