import { block, bulb, cylinder, halo, LAMP, pipeH, pipeV, plinth } from "./parts";
import type { Px } from "./px";
import type { StationDef } from "./types";

// Gate: a tall iron cabinet the line runs through, a lantern on top, a slot window down its face, and a chevron
// panel either side. Working: a bright notch slides down the slot. Auto: the slot splits open, green.

function chevronPanel(g: Px, x: number, y: number, w: number, h: number) {
  block(g, x, y, w, h, 2);
  g.rect(x + 2, y + 2, w - 4, h - 4, "iron-1");
  const cx = x + Math.floor(w / 2) - 1, cy = y + Math.floor(h / 2);
  for (let i = 0; i < 3; i++) { g.set(cx + i, cy - 2 + i, "brass-4"); g.set(cx + i, cy + 2 - i, "brass-4"); g.set(cx + i - 1, cy - 2 + i, "brass-3"); g.set(cx + i - 1, cy + 2 - i, "brass-3"); }
}

export const gate: StationDef = {
  w: 54, h: 46,
  anim: (s) => (s === "working" ? { n: 4, fps: 4 } : { n: 1, fps: 0 }),
  draw(g, s, f) {
    const X = 20, Y = 15, W = 13, H = 26, D = 3;
    chevronPanel(g, 3, 28, 17, 11);
    chevronPanel(g, 36, 28, 15, 11);
    // a copper pipe over the left shoulder
    pipeH(g, 13, 17, 7); pipeV(g, 13, 17, 11); g.set(13, 17, "copper-1");
    block(g, X, Y, W, H, D);
    // a tank box on the lit side
    g.rect(X + W + D, Y + 3, 3, 8, "iron-3"); g.vline(X + W + D + 2, Y + 3, 8, "brass-3"); g.hline(X + W + D, Y + 3, 3, "brass-4");
    // lantern on top
    const lx = X + 5;
    g.rect(lx - 1, Y - D - 2, 7, 2, "brass-2"); g.hline(lx - 1, Y - D - 2, 7, "brass-4");
    cylinder(g, lx, Y - D - 8, 5, 6, "brass");
    const on = s !== "idle", lamp = LAMP[s];
    g.rect(lx + 1, Y - D - 7, 3, 4, s === "idle" ? "iron-1" : on ? lamp[1] : lamp[0]);
    if (s !== "idle" && (on)) { g.set(lx + 3, Y - D - 7, lamp[2]); halo(g, lx + 2.5, Y - D - 5, 5, s, s === "jammed"); }
    g.rect(lx, Y - D - 10, 5, 2, "brass-2"); g.hline(lx + 1, Y - D - 11, 3, "brass-3"); g.set(lx + 2, Y - D - 12, "brass-4");
    // slot window
    const sx = X + 3, sy = Y + 4, sw = 7, sh = 17;
    g.rect(sx, sy, sw, sh, "iron-0"); g.box(sx - 1, sy - 1, sw + 2, sh + 2, "brass-2"); g.hline(sx - 1, sy - 1, sw + 2, "brass-3"); g.vline(sx + sw, sy - 1, sh + 2, "brass-3");
    if (s === "idle") { for (const yy of [sy + 3, sy + 8, sy + 13]) g.rect(sx + 2, yy, 3, 3, "steel-1"); }
    else if (s === "auto") {
      g.rect(sx, sy, 2, sh, lamp[1]); g.vline(sx + 1, sy, sh, lamp[2]);
      g.rect(sx + sw - 2, sy, 2, sh, lamp[1]); g.vline(sx + sw - 2, sy, sh, lamp[2]);
      halo(g, sx + 3.5, sy + sh / 2, 7, s);
    } else {
      g.rect(sx + 2, sy + 1, 3, sh - 2, on ? lamp[1] : lamp[0]);
      if (s === "working") g.rect(sx + 2, sy + 1 + f * 4, 3, 3, lamp[2]);
      else if (on) g.vline(sx + 3, sy + 1, sh - 2, lamp[2]);
      if (on) halo(g, sx + 3.5, sy + sh / 2, 7, s, s === "jammed");
    }
    bulb(g, X + W - 2, Y + 2.5, 0.9, s, on);
    plinth(g, X - 1, Y + H, W + 2);
    g.outline();
  },
};
