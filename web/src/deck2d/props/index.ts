// props/ (thread "Push the 2D deck art further"): in pixel mode (?px=1) the deck itself is drawn in code: the hull
// (hull.ts: floor, rails, lanterns, skirt, rocks, the core orb, the vents) plus the moving bits here: slow steam out
// of the two vents and the twin boiler (bakeoff/boiler2d.ts) on the back of the floor. The platform's width follows
// view.deck (small / medium / large); while it grows, the hull is re-rendered a column at a time out to the new edge.
// ?px=0 keeps the old picture deck: this layer then replaces nothing and draws nothing.
import { ART_PX, DECK_DX, HULL, PALETTE, snap, type CreateLayer, type DeckLayer, type DeckView, type LayerSlot } from "../contract";
import { pixelOn } from "../../flags";
import { BOILER_H, BOILER_W, boilerFrame } from "../../bakeoff/boiler2d";
import { PAD, TOP, VENT_MOUTH, hullCanvas, ventXs } from "./hull";

type Size = "small" | "medium" | "large";
/** Built width per size, world units: each size ends just past its last station (small: Builder, medium: Review);
 * large is the whole HULL. grow/ bounds() should report the same, so the camera and the hull agree. */
const WIDTH: Record<Size, number> = DECK_DX ? { small: 1700, medium: 2450, large: HULL.x1 } : { small: 1000, medium: 1700, large: 2039 };
const NEXT: Record<Size, Size> = { small: "medium", medium: "large", large: "large" };
/** The twin boiler stands on the back of the floor behind Repo and Planner (same spot as engine's BOILER). */
const BOILER = { x: DECK_DX ? 280 : 240, base: 182 };
const STEAM = [PALETTE.iron[4], PALETTE.haze[2], PALETTE.haze[3], PALETTE.white[0], PALETTE.white[0]];
const COL = 16; // art px: the hull grows one plate-ish column at a time

export const createLayer: CreateLayer = () => {
  if (!pixelOn()) return { update() {}, draw() {} };
  let t = 0, size: Size = "large", growing = 0;

  function width(): number {
    const a = WIDTH[size], b = WIDTH[NEXT[size]];
    if (!growing || a === b) return a / ART_PX;
    const k = 1 - (1 - growing) ** 3; // eases out as the last plates land
    return Math.floor(((a + (b - a) * k) / ART_PX) / COL) * COL || a / ART_PX;
  }

  function steam(ctx: CanvasRenderingContext2D, w: number) {
    // slow puffs out of each mouth, sinking and drifting a little left, swelling and fraying as they go (no fades)
    const P = ART_PX;
    ventXs(w).forEach((vx, i) => {
      for (let k = 0; k < 4; k++) {
        const q = (t / 5.5 + k / 4 + i * 0.37) % 1, r = 3 + q * 6;
        const cx = vx - 0.5 - q * 4 + Math.sin(q * 6 + i) * 1.2, cy = VENT_MOUTH + q * 30;
        for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
          const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / r, d = dx * dx + dy * dy;
          if (d > 0.85 + 0.15 * Math.sin(Math.atan2(dy, dx) * 3 + k)) continue;
          if (q > 0.65 && d > 0.35 && ((x + y) & 1)) continue; // older puffs fray to a checker at the edge, then they're gone
          if (q > 0.88 && ((x + y) & 1)) continue;
          const v = 0.55 + 0.35 * (dx * 0.5 - dy * 0.6) - d * 0.15 - q * 0.2;
          ctx.fillStyle = STEAM[Math.max(0, Math.min(4, Math.round(v * 4)))];
          ctx.fillRect(x * P, y * P, P, P);
        }
      }
    });
  }

  const layer: DeckLayer = {
    replaces: ["deck", "boiler", "orb"],
    update(dt: number, v: DeckView) {
      t += dt;
      size = v.deck?.size ?? "large";
      growing = v.deck?.growing ?? 0;
    },
    draw(ctx: CanvasRenderingContext2D, slot: LayerSlot) {
      if (slot !== "deck") return;
      const w = width(), cv = hullCanvas(w), was = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(cv, -PAD * ART_PX, -TOP * ART_PX, cv.width * ART_PX, cv.height * ART_PX);
      steam(ctx, w);
      const b = boilerFrame(t);
      ctx.drawImage(b, snap(BOILER.x - (BOILER_W * ART_PX) / 2), snap(BOILER.base - BOILER_H * ART_PX), BOILER_W * ART_PX, BOILER_H * ART_PX);
      ctx.imageSmoothingEnabled = was;
    },
  };
  return layer;
};
