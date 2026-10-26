// Which science pack each kind of shipped work makes. Lives outside model.ts so the web
// bundle can use it without pulling in the zod schemas (shared is sideEffects: false).
import type { ItemKind, Science } from "./model";

export const SCIENCE_FOR: Record<ItemKind, keyof Science> = {
  bug: "red",
  feature: "green",
  cleanup: "grey",
  tests: "blue",
};
