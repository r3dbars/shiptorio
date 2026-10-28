import { block, bulb, cylinder, halo, inset, LAMP, pipeH, pipeV, plinth } from "./parts";
import type { StationDef } from "./types";

// Repo: a tall iron safe with a brass chimney, copper pipes looping over the top into an outlet box on the right,
// a brass tank and gear on the left, a three-bar readout and a door with the branch mark.
// Working: one readout bar steps along at a time.

export const repo: StationDef = {
  w: 42, h: 46,
  anim: (s) => (s === "working" ? { n: 4, fps: 4 } : { n: 1, fps: 0 }),
  draw(g, s, f) {
    const X = 9, Y = 15, W = 22, H = 26, D = 3;
    // pipes behind: left riser + run into the chimney, right run down into the outlet box
    pipeV(g, 4, 10, 16); pipeH(g, 4, 9, 14); g.set(4, 9, "copper-1");
    pipeH(g, 24, 9, 10); pipeV(g, 32, 9, 18); g.set(34, 9, "copper-3");
    // outlet box on the right
    g.rect(31, 26, 8, 8, "iron-2"); g.box(31, 26, 8, 8, "brass-2"); g.hline(31, 26, 8, "brass-3"); g.vline(38, 26, 8, "brass-3");
    g.rect(33, 28, 4, 4, "iron-0"); g.set(37, 27, "brass-4");
    block(g, X, Y, W, H, D);
    // chimney
    cylinder(g, 16, 6, 7, 6); g.rect(15, 3, 9, 3, "brass-2"); g.hline(15, 3, 9, "brass-4"); g.hline(16, 4, 7, "iron-0"); g.hline(15, 11, 9, "brass-1");
    // brass tank + gear, left
    cylinder(g, 3, 24, 7, 14); for (const yy of [26, 33]) g.hline(3, yy, 7, "brass-1");
    g.rect(3, 23, 7, 1, "brass-4");
    g.disc(6.5, 37.5, 3.4, "brass-1"); g.disc(6.9, 37.1, 2.4, "brass-3"); g.disc(6.5, 37.5, 1, "iron-0");
    for (const [tx, ty] of [[6, 33], [2, 37], [10, 37], [6, 41], [3, 34], [9, 34], [3, 40], [9, 40]]) g.set(tx, ty, "brass-2");
    // readout: three bars + a lamp
    inset(g, X + 3, Y + 3, 16, 6, "iron-0");
    const lamp = LAMP[s], on = s !== "idle";
    for (let i = 0; i < 3; i++) {
      const bright = s === "working" ? i === f : on;
      const c = s === "idle" ? "iron-2" : bright ? lamp[2] : lamp[1];
      g.rect(X + 4 + i * 3, Y + 4, 2, 4, s === "jammed" && !on ? lamp[0] : c);
    }
    bulb(g, X + 16, Y + 5.6, 1.6, s, on);
    if (on) halo(g, X + 10, Y + 6, 9, s, s === "jammed");
    // the door with the branch mark
    const dx = X + 3, dy = Y + 11, dw = 16, dh = 12;
    g.rect(dx, dy, dw, dh, "iron-1"); g.box(dx, dy, dw, dh, "brass-2");
    g.hline(dx, dy, dw, "brass-3"); g.vline(dx + dw - 1, dy, dh, "brass-3"); g.set(dx + dw - 1, dy, "brass-4");
    const bx = dx + 5, by = dy + 3;
    g.vline(bx, by, 7, "brass-3");
    g.rect(bx - 1, by - 1, 3, 2, "brass-4"); g.rect(bx - 1, by + 6, 3, 2, "brass-4");
    g.rect(bx + 5, by, 3, 2, "brass-4");
    for (let i = 0; i < 4; i++) g.set(bx + 5 - i, by + 2 + i, "brass-3");
    plinth(g, X - 1, Y + H, W + 2);
    g.outline();
  },
};
