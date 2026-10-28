// @ts-nocheck -- time-boxed spike, kept loose on purpose
// Kept for other pages that import from here (web/src/bakeoff/): the Builder and the plate texture now live in
// stations.ts and kit.ts. buildBuilderHD ignores its old material helpers and returns { gear, win, group }.
import { plateTexture } from "./kit";
import { builder } from "./stations";

export { plateTexture };
export function buildBuilderHD(parent, _helpers?) {
  const b = builder(parent);
  return { group: b.group, act: b.act, gear: b.gear, win: b.win };
}
