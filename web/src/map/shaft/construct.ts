// Build as you go, slice 3 (web/src/buildout/CONTRACT.md): any machine group rises over about 4 s. Scaffold poles
// go up, the real parts drop in bottom up, rivet sparks, steam. Reduced motion: a 1 s fade.
// STUB from slice 1: finishes at once and leaves the target as it is. Slice 3 fills it in; keep the signature.

import type * as THREE from "three";

export const CONSTRUCT_SECONDS = 4;

export interface ConstructOpts {
  reduced?: boolean;
  seconds?: number;
  speed?: number;
}

export interface ConstructRun {
  /** advance by dt seconds; true once finished. The caller ticks it from its frame loop (works with ?raf=0). */
  update(dt: number): boolean;
  /** jump to the end (tap to speed up) */
  finish(): void;
  /** put the target back as it was */
  cancel(): void;
  readonly done: Promise<void>;
  /** 0-1 */
  readonly progress: number;
}

export function construct(_target: THREE.Object3D, _opts: ConstructOpts = {}): ConstructRun {
  return { update: () => true, finish() {}, cancel() {}, done: Promise.resolve(), progress: 1 };
}
