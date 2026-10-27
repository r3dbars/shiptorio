// Message schemas, loaded on demand (they bring zod, which the sim and the first paint don't need).
export { Empire } from "@shiptorio/shared";

import { FactoryState, ServerToWeb } from "@shiptorio/shared";
// Additive socket transport metadata; gameplay payloads keep their shared schema.
const Sequence = FactoryState.shape.tick.nonnegative().max(Number.MAX_SAFE_INTEGER).optional();
export function parseLiveMessage(value: unknown) {
  const msg = ServerToWeb.parse(value);
  const seq = Sequence.parse((value as { seq?: unknown }).seq);
  return { ...msg, ...(seq === undefined ? {} : { seq }) };
}
