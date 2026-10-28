import { block, bulb, cylinder, halo, LAMP, plinth } from "./parts";
import type { StationDef } from "./types";

// Checks: a domed iron cabinet with one big glass porthole, a brass tank on the left, lanterns either side of the
// glass and three bulbs underneath. Working: the bulbs count across, one lit at a time.

export const checks: StationDef = {
  w: 44, h: 46,
  anim: (s) => (s === "working" ? { n: 4, fps: 4 } : { n: 1, fps: 0 }),
  draw(g, s, f) {
    const X = 10, Y = 17, W = 24, H = 24, D = 3;
    // tank on the left, behind
    cylinder(g, 3, 19, 8, 19); g.rect(3, 18, 8, 1, "brass-4"); for (const yy of [23, 31]) g.hline(3, yy, 8, "brass-1");
    g.rect(4, 16, 6, 2, "brass-2"); g.hline(4, 16, 6, "brass-4");
    block(g, X, Y, W, H, D);
    // dome cap + knob post
    const cx = X + W / 2 + 1.5;
    for (let yy = 0; yy < 6; yy++) {
      const half = Math.round(Math.sqrt(36 - (6 - yy) ** 2) * 1.6);
      g.hline(Math.round(cx - half), Y - D - 6 + yy, half * 2, yy < 2 ? "iron-3" : "iron-2");
      g.set(Math.round(cx - half), Y - D - 6 + yy, "iron-1"); g.set(Math.round(cx + half) - 1, Y - D - 6 + yy, "brass-3");
    }
    g.rect(cx - 3, Y - D - 8, 6, 2, "brass-2"); g.hline(cx - 3, Y - D - 8, 6, "brass-4");
    g.vline(cx - 1, Y - D - 11, 3, "iron-3"); g.vline(cx, Y - D - 11, 3, "iron-4");
    const top = { x: cx - 0.5, y: Y - D - 12.5 };
    if (s === "idle") { g.disc(top.x, top.y, 1.8, "iron-1"); g.set(top.x + 0.5, top.y - 0.5, "iron-4"); }
    else bulb(g, top.x, top.y, 1.8, s);
    const on = s !== "idle", lamp = LAMP[s];
    if (on) halo(g, top.x, top.y, 5, s);
    // porthole
    const px = X + 12, py = Y + 9.5;
    g.disc(px, py, 7.6, "brass-1"); g.disc(px + 0.4, py - 0.4, 7, "brass-3"); g.disc(px, py, 6.2, "brass-2");
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; g.set(px + Math.cos(a) * 6.8 - 0.5, py + Math.sin(a) * 6.8 - 0.5, "brass-4"); }
    g.disc(px, py, 5.2, "steel-0"); g.disc(px + 0.3, py - 0.3, 4.6, "steel-1"); g.disc(px + 0.8, py - 0.8, 3.2, "steel-2");
    g.set(px + 1.5, py - 3.5, "steel-3"); g.set(px + 2.5, py - 2.5, "steel-3"); g.set(px + 2.5, py - 3.5, "white");
    // lanterns either side of the glass
    for (const lx of [X + 2, X + W - 4]) {
      g.rect(lx, Y + 6, 3, 6, "iron-0"); g.hline(lx, Y + 5, 3, "brass-3"); g.hline(lx, Y + 12, 3, "brass-1");
      g.rect(lx + 1, Y + 7, 1, 4, s === "idle" ? "iron-2" : on ? lamp[2] : lamp[0]);
    }
    // three bulbs underneath
    for (let i = 0; i < 3; i++) {
      const bx = X + 8 + i * 4, lit = s === "working" ? i === f : on;
      g.rect(bx - 1, Y + 18, 3, 3, "iron-0");
      bulb(g, bx + 0.5, Y + 19.5, 1.2, s, lit);
      if (lit && s !== "idle") halo(g, bx + 0.5, Y + 19.5, 3, s);
    }
    // small grid panel on the lit side
    g.rect(X + W, Y + 12, 2, 6, "iron-1");
    for (let k = 0; k < 3; k++) g.set(X + W + 1, Y + 13 + k * 2, s === "idle" ? "iron-3" : on ? lamp[1] : lamp[0]);
    plinth(g, X - 1, Y + H, W + 2);
    g.outline();
  },
};
