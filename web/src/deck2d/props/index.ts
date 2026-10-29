// props/ (thread "Push the 2D deck art further"): in pixel mode (?px=1) the deck itself is drawn in code: the hull
// (hull.ts: floor, rails, lanterns; underside.ts: rim band, boulders, crystals, the engine at the middle) plus the
// moving bits here: the engine core's light, slow light in the crystals, a few loose stones drifting under the rock
// (same as the launch island's) and the twin boiler (props/boiler2d.ts) on the back of the floor. The platform's width follows
// view.deck (small / medium / large); while it grows, the hull is re-rendered a column at a time out to the new edge.
// ?px=0 keeps the old picture deck: this layer then replaces nothing and draws nothing.
import { ART_PX, DECK_DX, HULL, PALETTE, snap, type CreateLayer, type DeckLayer, type DeckView, type LayerSlot } from "../contract";
import { pixelOn } from "../../flags";
import { BOILER_H, BOILER_W, boilerFrame } from "./boiler2d";
import { CORE, PAD, TOP, coreAt, coreLight, hullCanvas, hullHighlights, rockBottom } from "./hull";
import { stone } from "./underside";

type Size = "small" | "medium" | "large";
/** Built width per size, world units: each size ends just past its last station (small: Builder, medium: Review);
 * large is the whole HULL. grow/ bounds() should report the same, so the camera and the hull agree. */
const WIDTH: Record<Size, number> = DECK_DX ? { small: 1700, medium: 2450, large: HULL.x1 } : { small: 1000, medium: 1700, large: 2039 };
const NEXT: Record<Size, Size> = { small: "medium", medium: "large", large: "large" };
/** The twin boiler stands on the back of the floor behind Repo and Planner (same spot as engine's BOILER). */
const BOILER = { x: DECK_DX ? 280 : 240, base: 182 };
/** Loose stones: [fraction along the deck, size, art px below the rock] */
const STONES = [[0.05, 4, 9], [0.13, 5, 18], [0.21, 3, 8], [0.3, 4, 15], [0.39, 3, 10], [0.61, 4, 11], [0.68, 3, 18], [0.76, 5, 10], [0.85, 3, 14], [0.93, 4, 9]] as const;
const COL = 16; // art px: the hull grows one plate-ish column at a time

export const createLayer: CreateLayer = () => {
  if (!pixelOn()) return { update() {}, draw() {} };
  let t = 0, size: Size = "large", growing = 0;
  let blocked = false;
  const still = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  function width(): number {
    const a = WIDTH[size], b = WIDTH[NEXT[size]];
    if (!growing || a === b) return a / ART_PX;
    const k = 1 - (1 - growing) ** 3; // eases out as the last plates land
    return Math.floor(((a + (b - a) * k) / ART_PX) / COL) * COL || a / ART_PX;
  }

  const stones = STONES.map(([, size], i) => stone(size, i));

  const layer: DeckLayer = {
    replaces: ["deck", "boiler", "orb"],
    update(dt: number, v: DeckView) {
      t += dt;
      size = v.deck?.size ?? "large";
      growing = v.deck?.growing ?? 0;
      blocked = v.jam !== null || v.stops.some((stop) => stop.built && stop.state === "jammed");
    },
    draw(ctx: CanvasRenderingContext2D, slot: LayerSlot) {
      if (slot !== "deck") return;
      const w = width(), cv = hullCanvas(w), was = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(cv, -PAD * ART_PX, -TOP * ART_PX, cv.width * ART_PX, cv.height * ART_PX);
      // Light travels slowly through the existing cyan fractures; stone stays still.
      for (const seam of hullHighlights(w)) {
        const light = still ? 2 : 1 + Math.round((Math.sin(t * 0.9 - seam.y * 0.12 + seam.x * 0.025) + 1));
        ctx.fillStyle = PALETTE.energy[light];
        ctx.fillRect(seam.x * ART_PX, seam.y * ART_PX, ART_PX, ART_PX);
      }
      // A few loose stones float just under the rock, bobbing a px or two, like the launch island's.
      STONES.forEach(([at, , below], i) => {
        const im = stones[i], x = Math.round(w * at), bob = still ? 0 : Math.round(Math.sin(t * 0.45 + i * 1.7) * 1.5);
        const y = rockBottom(x, w) + below + bob;
        ctx.drawImage(im, (x - (im.width >> 1)) * ART_PX, (y - (im.height >> 1)) * ART_PX, im.width * ART_PX, im.height * ART_PX);
      });
      const phase = still ? 3 : Math.floor(t * (blocked ? 4 : 2)) % 8;
      const core = coreLight(blocked, phase), at = coreAt(w);
      ctx.drawImage(core, (at.x - CORE / 2) * ART_PX, (at.y - CORE / 2) * ART_PX, CORE * ART_PX, CORE * ART_PX);
      const b = boilerFrame(t);
      ctx.drawImage(b, snap(BOILER.x - (BOILER_W * ART_PX) / 2), snap(BOILER.base - BOILER_H * ART_PX), BOILER_W * ART_PX, BOILER_H * ART_PX);
      ctx.imageSmoothingEnabled = was;
    },
  };
  return layer;
};
