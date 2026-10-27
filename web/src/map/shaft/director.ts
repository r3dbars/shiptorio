// Build as you go, slice 5 (web/src/buildout/CONTRACT.md): the camera parks on what's being built. A framing per
// build site read from the layout, a slow breathing drift, a 1 s swoop to the next site, nothing under reduced
// motion. Free look stays locked until the first rocket.
// STUB from slice 1: does nothing and never locks. Slice 5 fills it in; keep the signature.

import type { Layout } from "./layout";
import type { ShaftStage } from "./stage";

/** station id(s) from the layout ("planner", "asm-1", "steam", "ci", "gate", "pad"), "mine:<id>", or a floor view
 * ("build"). An array frames them together. journey.ts cameraFor(step, layout) gives one per step. */
export type CamTarget = string | string[];

export class Director {
  constructor(
    readonly stage: ShaftStage,
    protected layout: Layout,
    protected opts: { reduceMotion?: boolean } = {},
  ) {}
  /** 1 s swoop, then hold with a gentle drift */
  park(_target: CamTarget, _opts: { snap?: boolean } = {}): void {}
  /** call every frame before stage.camStep */
  step(_t: number, _dt: number): void {}
  /** true until unlock(): the scene ignores drag, zoom and hover labels */
  get locked(): boolean {
    return false;
  }
  /** first rocket: free look on, the camera goes back to the stage */
  unlock(): void {}
  setLayout(layout: Layout): void {
    this.layout = layout;
  }
}
