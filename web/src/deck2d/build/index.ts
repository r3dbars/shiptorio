import type { CreateLayer, DeckLayer } from "../contract";
import { createBuild, type Build } from "./build";

export { createBuild, BUILD_SPRITES, STAGE_AT, type Build, type ShippyAct } from "./build";

/** The engine's entry: a DeckLayer that owns a stop while it's locked or under construction. */
export const createLayer: CreateLayer = (art, bus) => {
  const b: Build = createBuild(art, bus);
  const layer: DeckLayer & { build: Build } = {
    build: b,
    update: (dt, view) => b.update(dt, view),
    draw(ctx, slot) { if (slot === "line" || slot === "stations" || slot === "front") b.draw(ctx, slot); },
    owns: (stop) => b.owns(stop),
  };
  return layer;
};
