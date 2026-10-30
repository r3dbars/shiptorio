// props/ (thread "Push the 2D deck art further"): in pixel mode (?px=1) the deck itself is drawn in code: the hull
// (hull.ts: floor, rails, lanterns; underside.ts: rim band, boulders, crystals, the engine at the middle) plus the
// moving bits here: the engine core's light, slow light in the crystals, a few loose stones drifting under the rock
// (same as the launch island's) and the twin boiler (props/boiler2d.ts) on the back of the floor. The platform's width follows
// view.deck (small / medium / large); while it grows, the hull is re-rendered a column at a time out to the new edge.
// ?px=0 keeps the old picture deck: this layer then replaces nothing and draws nothing.
import { ART_PX, DECK_DX, HULL, PALETTE, snap, type CreateLayer, type DeckLayer, type DeckView, type LayerSlot } from "../contract";
import { pixelOn } from "../../flags";
import { BOILER_H, BOILER_W, boilerFrame } from "./boiler2d";
import { A, CORE, PAD, TOP, coreAt, coreLight, hullCanvas, hullHighlights, rockBottom } from "./hull";
import { stone } from "./underside";
import { COL, hullCols, type Size } from "./width";
export { hullCols } from "./width";

/** The twin boiler stands on the back of the floor behind Repo and Planner (same spot as engine's BOILER). */
const BOILER = { x: DECK_DX ? 280 : 240, base: 182 };
/** Loose stones: [fraction along the deck, size, art px below the rock] */
const STONES = [[0.05, 4, 9], [0.13, 5, 18], [0.21, 3, 8], [0.3, 4, 15], [0.39, 3, 10], [0.61, 4, 11], [0.68, 3, 18], [0.76, 5, 10], [0.85, 3, 14], [0.93, 4, 9]] as const;

// While the deck grows (Justin 2026-10-30: "have it get constructed and have some sound effects"), a steel scaffold
// stands where the next column goes, sparks fly at the seam, and every column that lands rings a ratchet or a rivet.
const BUILD_CUES = ["ratchet", "rivet", "rivet", "puff"] as const;
// the sound kit loads with the deck's sound (main.ts), after the first frame: never in the startup bundle
let kit: typeof import("../sound/kit") | null = null;
const playBuild = (cue: (typeof BUILD_CUES)[number]) => {
  if (kit) kit.play(cue);
  else void import("../sound/kit").then((m) => { kit = m; m.play(cue); }).catch(() => undefined);
};

export const createLayer: CreateLayer = () => {
  if (!pixelOn()) return { update() {}, draw() {} };
  let t = 0, size: Size = "large", growing = 0, lastCols = 0, lastCue = -1, cue = 0;
  let blocked = false, boiler = 1;
  const still = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  const width = () => hullCols(size, growing);

  /** The scaffold for the next column past the edge (x0, in art px): girders, struts, a brace, and sparks at the seam. */
  function scaffold(ctx: CanvasRenderingContext2D, x0: number) {
    const { soot, steel, brass, white } = PALETTE;
    const px = (c: string, x: number, y: number, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(x * ART_PX, y * ART_PX, w * ART_PX, h * ART_PX); };
    const top = A.back, bot = A.front + 2;
    for (const y of [top, A.front - 1]) { px(soot[0], x0, y - 1, COL + 1, 3); px(steel[2], x0, y, COL, 1); px(steel[3], x0 + COL - 3, y, 3, 1); }
    for (let x = x0 + 3; x < x0 + COL; x += 6) { px(soot[0], x - 1, top, 3, bot - top); px(steel[1], x, top + 1, 1, bot - top - 2); px(steel[3], x, top + 1, 1, 1); px(brass[3], x, top + 1, 1, 1); }
    for (let i = 0; i < Math.min(COL, bot - top); i += 2) px(steel[1], x0 + Math.round((i / (bot - top)) * COL), top + i, 1, 1); // the brace
    if (still) return;
    const f = Math.floor(t * 14);
    for (let i = 0; i < 4; i++) {
      const h = Math.sin(f * 12.9898 + i * 78.233) * 43758.5453, r = h - Math.floor(h);
      px(i % 2 ? brass[4] : white[0], x0 - 1 + Math.round(r * 3), top + 4 + Math.round(r * (A.front - top - 8)));
    }
  }

  const stones = STONES.map(([, size], i) => stone(size, i));

  const layer: DeckLayer = {
    replaces: ["deck", "boiler", "orb"],
    update(dt: number, v: DeckView) {
      t += dt;
      size = v.deck?.size ?? "large";
      growing = v.deck?.growing ?? 0;
      const cols = width();
      if (growing > 0 && cols !== lastCols && lastCols && t - lastCue > 0.16) { playBuild(BUILD_CUES[cue++ % BUILD_CUES.length]); lastCue = t; }
      lastCols = cols;
      boiler = v.deck?.boiler ?? 1;
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
      if (growing > 0 && growing < 1) scaffold(ctx, w);
      if (boiler > 0) {
        // The steam engine pops up out of the floor (first run), clipped at the floor line, in whole art px.
        const b = boilerFrame(t), drop = Math.round((1 - boiler) ** 3 * BOILER_H) * ART_PX; // eases out as it lands
        ctx.save(); ctx.beginPath(); ctx.rect(BOILER.x - BOILER_W * ART_PX, BOILER.base - BOILER_H * ART_PX - 40, BOILER_W * ART_PX * 2, BOILER_H * ART_PX + 40); ctx.clip();
        ctx.drawImage(b, snap(BOILER.x - (BOILER_W * ART_PX) / 2), snap(BOILER.base - BOILER_H * ART_PX) + drop, BOILER_W * ART_PX, BOILER_H * ART_PX);
        ctx.restore();
      }
      ctx.imageSmoothingEnabled = was;
    },
  };
  return layer;
};
