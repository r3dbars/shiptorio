import type { StopState } from "../contract";
import type { Color } from "./palette";
import type { Px } from "./px";

// Shared machine parts. Light comes from the upper right: top and right faces get the light end of a ramp,
// bottom and left the dark end, and right-facing metal edges get a 1px warm rim.

/** Lamp colors per state: [dark, mid, bright]. Idle lamps are unlit glass. */
export const LAMP: Record<StopState, [Color, Color, Color]> = {
  idle: ["iron-0", "steel-1", "steel-2"],
  working: ["energy-0", "energy-1", "energy-2"],
  jammed: ["jam-0", "jam-1", "jam-2"],
  auto: ["ok-0", "ok-1", "ok-2"],
};
/** What a lamp's glow is drawn with on the light layer (null = no glow). */
export const HALO: Record<StopState, Color | null> = { idle: null, working: "energy-2", jammed: "jam-2", auto: "ok-2" };

/**
 * A riveted iron block seen from the front and a little above: front face, a top face `d` rows deep and a right
 * side face `d` columns wide, sheared up-right so the back sits up and to the right.
 * (x, y) is the top-left of the front face; the top face sits above it.
 */
export function block(g: Px, x: number, y: number, w: number, h: number, d: number, trim = true) {
  // top face: iron catching the sky, brightest at its back edge
  for (let k = 0; k < d; k++) {
    const row = y - d + k, off = d - k;
    g.hline(x + off, row, w, k === 0 ? "iron-3" : "iron-2");
  }
  // right face (lit side), outer column holds the warm rim
  for (let j = 0; j < d; j++) g.vline(x + w + j, y - j, h, "iron-2");
  for (let j = 0; j < d; j++) g.set(x + w + j, y - j + h - 1, "iron-0"); // its foot in shadow
  // front face: dark iron
  g.rect(x, y, w, h, "iron-1");
  g.hline(x, y + h - 1, w, "iron-0");
  if (!trim) return;
  // brass trim around the front: dark on the shadow edges, bright on the lit ones
  g.hline(x, y, w, "brass-3");
  g.vline(x + w - 1, y, h, "brass-3");
  g.vline(x, y + 1, h - 1, "brass-1");
  g.hline(x + 1, y + h - 1, w - 1, "brass-1");
  g.set(x + w - 1, y, "brass-4"); // the corner catching the sun
  // the top face's back edge and the side's outer edge pick up the rim
  g.hline(x + d, y - d, w, "brass-2");
  g.vline(x + w + d - 1, y - d + 1, h - 1, "brass-3");
  g.set(x + w + d - 1, y - d, "brass-4");
  // corner brackets with rivets
  for (const [cx, cy, sx, sy] of [[x + 1, y + 1, 1, 1], [x + w - 2, y + 1, -1, 1], [x + 1, y + h - 2, 1, -1], [x + w - 2, y + h - 2, -1, -1]]) {
    g.set(cx, cy, "brass-4"); g.set(cx + sx, cy, "brass-2"); g.set(cx, cy + sy, "brass-2");
  }
}

/** A recessed panel on a front face. */
export function inset(g: Px, x: number, y: number, w: number, h: number, fill: Color = "iron-1") {
  g.rect(x, y, w, h, fill);
  g.hline(x, y, w, "iron-0");
  g.vline(x, y, h, "iron-0");
  g.hline(x + 1, y + h, w - 1, "iron-3"); // lower lip catches light
  g.vline(x + w, y + 1, h, "iron-3");
}

/** A vertical brass (or copper) cylinder: dark left, lit right, with a rim at the top. */
export function cylinder(g: Px, x: number, y: number, w: number, h: number, metal: "brass" | "copper" = "brass") {
  const r = metal === "brass" ? (["brass-1", "brass-2", "brass-3", "brass-4"] as Color[]) : (["copper-0", "copper-1", "copper-2", "copper-3"] as Color[]);
  for (let i = 0; i < w; i++) {
    const f = i / Math.max(1, w - 1);
    g.vline(x + i, y, h, f < 0.25 ? r[0] : f < 0.6 ? r[1] : f < 0.9 ? r[2] : r[3]);
  }
}

/** A round lamp/bulb, r ~1.5..2.5, lit from the upper right with a glint. */
export function bulb(g: Px, cx: number, cy: number, r: number, s: StopState, on = true) {
  const [dk, mid, hi] = on ? LAMP[s] : LAMP.idle;
  g.disc(cx, cy, r, dk);
  g.disc(cx + 0.35, cy - 0.35, r - 0.6, mid);
  g.set(Math.floor(cx + r * 0.35), Math.floor(cy - r * 0.45), on && s !== "idle" ? "white" : hi);
}

/** Light layer: a lamp lights the iron right around it (2px ring at 25%, stays on the machine). */
export function halo(g: Px, cx: number, cy: number, r: number, s: StopState, _strong = false) {
  const c = HALO[s]; if (!c) return;
  const R = Math.min(r, 4);
  g.glow(Math.round(cx - R), Math.round(cy - 1), Math.round(R * 2), 2, c, 0.25);
  g.glow(Math.round(cx - 1), Math.round(cy - R), 2, Math.round(R * 2), c, 0.25);
}

/** A little foot/plinth strip along the bottom so the machine sits on the deck. */
export function plinth(g: Px, x: number, y: number, w: number) {
  g.hline(x, y, w, "iron-1");
  g.hline(x, y + 1, w, "iron-0");
  for (const fx of [x, x + w - 3]) { g.rect(fx, y, 3, 2, "brass-2"); g.set(fx + 2, y, "brass-4"); g.set(fx, y + 1, "brass-1"); }
}
