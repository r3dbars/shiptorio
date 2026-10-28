// How the camera frames the shaft on each screen: what each view centers on and how much of it shows on a wide
// screen and on a phone, how close a picked station and the follow cam sit, where a station's chip stands, and where
// on screen the view's center sits when a card covers part of it. The stage (stage.ts) reads it every frame.

import { artPass } from "./backdrop-kit.js";
import type { IronStation } from "./core";

export type FloorView = "stack" | "mine" | "build" | "checks" | "launch" | "line";

// a phone, for the camera and the chips (shaft.css switches at the same width)
export const isPhone = (W: number) => W <= 760;
// a phone on its side: short and wide (the HUD's plates sit top and bottom, the floor panel on the right)
export const isLandscapePhone = (W: number, H: number) => H <= 500 && W > H;

/**
 * How many pixels the game's fixed plates hide at the top and bottom of the map, when they span most of its width (a
 * phone: the floor card, the needs tray, the ticker and the controls). The HUD measures it every few frames (hud.ts),
 * and the floor views frame what's left, so a floor never sits under a plate.
 */
export const cover = { top: 0, bottom: 0 };

/** the screen height the plates leave free, and the factor that grows a view so its content fits in it */
function freeBand(H: number) {
  const free = Math.max(H * 0.4, H - cover.top - cover.bottom);
  return { free, grow: H / free };
}

// [root x, y, z the view centers on, view height on a wide screen, the width it must fit]
type Preset = { at: [number, number, number]; h: number; w: number; phone: { at: [number, number, number]; h: number } };
const PRESETS: Record<FloorView, Preset> = {
  stack: { at: [0, 5, -8.4], h: 62, w: 42, phone: { at: [0, 5, -8.4], h: 74 } },
  mine: { at: [0, -10.5, 8.5], h: 18, w: 41, phone: { at: [-3, -10.5, 8.5], h: 22 } },
  build: { at: [0, 2.2, 0.8], h: 14, w: 39, phone: { at: [-4, 2.2, 0.8], h: 18 } },
  checks: { at: [1, 13.2, -9.4], h: 13, w: 38, phone: { at: [4, 13.2, -9.4], h: 18 } },
  launch: { at: [0, 26, -21], h: 17, w: 32, phone: { at: [0, 26, -21], h: 22 } },
  line: { at: [0, -4.5, 3.5], h: 30, w: 41, phone: { at: [-2, -4.5, 3.5], h: 36 } },
};

// the floating city (?artpass=1, ART-PASS.md): the ALL view reaches down past the rock's tip to the aether engine's
// cage and finial (keel-shape.js TIP y -36, the engine to about -43), so the island reads as floating
if (artPass()) PRESETS.stack = { at: [0, -5.7, -8.4], h: 81, w: 42, phone: { at: [0, -5.7, -8.4], h: 92 } };

export const isFloorView = (v: string): v is FloorView => v in PRESETS;

/** a floor view on a W x H screen: the root point it centers on and the view height */
export function floorFrame(view: FloorView, W: number, H: number): { at: [number, number, number]; h: number } {
  const P = PRESETS[view];
  // frame the floor into the band the plates leave free, then grow the view so that band shows all of it
  const { free, grow } = freeBand(H);
  const a = W / free;
  // a phone shows the floor's middle up close, as the mockup's phone does, and the player pans for the rest
  const h = isPhone(W) ? Math.max(P.phone.h, (P.w * 0.4) / a) : Math.max(P.h, P.w / a);
  return { at: isPhone(W) ? P.phone.at : P.at, h: h * grow };
}

/** a picked station: the root point the view centers on and the view height */
export function stationFrame(st: IronStation, W: number): { at: [number, number, number]; h: number } {
  const small = st.type === "check" || st.type === "battery" || st.type === "dynamo";
  const grow = typeof window === "undefined" ? 1 : freeBand(window.innerHeight).grow;
  return { at: [st.x, st.y + (small ? 1.6 : 2.6), st.z + 0.6], h: (small ? 7.5 : 11) * (isPhone(W) ? 1.3 : 1) * grow };
}

/** the follow cam's view height (it rides the item furthest up the shaft) */
export const followH = (W: number) => (isPhone(W) ? 11 : 9);

/** where a station's name chip stands: on the floor in front of it */
export function chipAnchor(st: IronStation): [number, number, number] {
  const small = st.type === "check";
  return [st.x, st.y + 0.1, st.z + (small ? 2.4 : 4.6)];
}

/**
 * Where the view's center sits on screen, as a fraction of the view from the middle (+x right, +y up): higher when
 * a card or sheet covers the bottom (lift, from the game), and out of the way of the panel on a phone.
 */
export function biasFor(W: number, H: number, lift: number, focused: boolean): { x: number; y: number } {
  if (lift) return { x: 0, y: lift };
  // the middle of the band the plates leave free, as a fraction of the view up from the screen's middle
  const band = (cover.bottom - cover.top) / (2 * H);
  if (isLandscapePhone(W, H)) return { x: focused ? -0.22 : -0.04, y: band }; // the floor panel sits on the right
  if (isPhone(W)) return { x: 0, y: band + (focused ? 0.12 : 0) };
  return { x: 0, y: band };
}
