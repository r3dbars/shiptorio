import { bulb, halo, LAMP } from "./parts";
import type { Px } from "./px";
import type { StationDef } from "./types";

// Planner: a wooden drafting desk with a pinned-up plan board (three steps, three lamps on top), a desk lamp on
// an arm, a lantern and a blue banner. Shippy visits; nobody sits here. Working: a highlight steps across the plan.
// Jammed: the middle step goes red with an X. Auto: it shows a green check.

const WOOD = { top: "plate-4", lit: "plate-3", mid: "plate-2", dark: "plate-1", deep: "plate-0" } as const;

function icon(g: Px, x: number, y: number, k: number) {
  const c = "steel-2", hi = "steel-1";
  if (k === 0) { g.rect(x + 1, y + 1, 3, 3, c); g.set(x + 2, y, c); g.set(x + 2, y + 4, c); g.set(x, y + 2, c); g.set(x + 4, y + 2, c); g.set(x + 2, y + 2, "haze-3"); } // gear
  if (k === 1) { g.rect(x, y + 2, 5, 3, c); g.vline(x, y + 1, 1, c); g.vline(x + 2, y + 1, 1, c); g.vline(x + 4, y, 2, hi); } // factory
  if (k === 2) { g.rect(x + 1, y, 3, 2, c); g.rect(x, y + 2, 5, 3, c); g.set(x + 2, y + 3, "haze-3"); } // rocket-ish crate
}

export const planner: StationDef = {
  w: 50, h: 42,
  anim: (s) => (s === "working" ? { n: 4, fps: 4 } : { n: 1, fps: 0 }),
  draw(g, s, f) {
    const lamp = LAMP[s];
    // plan board on two posts
    const bx = 13, by = 9, bw = 25, bh = 13;
    g.vline(bx + 2, by + bh, 5, "plate-1"); g.vline(bx + bw - 3, by + bh, 5, "plate-2");
    g.rect(bx, by, bw, bh, WOOD.mid); g.hline(bx, by, bw, WOOD.lit); g.vline(bx + bw - 1, by, bh, WOOD.lit); g.vline(bx, by, bh, WOOD.dark); g.hline(bx, by + bh - 1, bw, WOOD.dark);
    g.rect(bx + 2, by + 2, bw - 4, bh - 4, "haze-3"); g.hline(bx + 2, by + bh - 3, bw - 4, "haze-2"); g.vline(bx + 2, by + 2, bh - 4, "haze-2");
    for (const [rx, ry] of [[bx + 1, by + 1], [bx + bw - 2, by + 1], [bx + 1, by + bh - 2], [bx + bw - 2, by + bh - 2]]) g.set(rx, ry, "brass-4");
    for (let k = 0; k < 3; k++) {
      const ix = bx + 4 + k * 6, iy = by + 4;
      if (k === 1 && (s === "jammed" || s === "auto")) {
        g.rect(ix - 1, iy - 1, 7, 7, s === "jammed" ? "jam-0" : "ok-0");
        if (s === "jammed") for (let i = 0; i < 5; i++) { g.set(ix + i, iy + i, "jam-2"); g.set(ix + 4 - i, iy + i, "jam-2"); }
        else { g.set(ix, iy + 2, "ok-2"); g.set(ix + 1, iy + 3, "ok-2"); g.set(ix + 2, iy + 4, "ok-2"); g.set(ix + 3, iy + 3, "ok-2"); g.set(ix + 4, iy + 2, "ok-2"); g.set(ix + 4, iy + 1, "ok-1"); }
        continue;
      }
      if (s === "working" && k === f % 3 && f < 3) { g.box(ix - 1, iy - 1, 7, 7, "sun-4"); }
      icon(g, ix, iy, k);
      if (k < 2) g.hline(ix + 5, iy + 2, 1, "steel-1");
    }
    // three lamps on top of the board
    for (let k = 0; k < 3; k++) {
      const lx = bx + 6 + k * 6.5;
      g.rect(Math.round(lx) - 1, by - 1, 3, 1, "brass-2");
      bulb(g, lx + 0.5, by - 2.5, 1.4, s, s !== "idle");
    }
    // desk lamp on an arm, top-left, aimed at the papers
    g.vline(6, 11, 13, "brass-2"); g.vline(7, 11, 13, "brass-3");
    for (let i = 0; i < 5; i++) g.set(7 + i, 10 - i, "brass-3");
    g.disc(6.5, 10.5, 1.2, "brass-4");
    g.rect(11, 4, 5, 3, "brass-2"); g.hline(11, 4, 5, "brass-4"); g.hline(12, 7, 3, s === "idle" ? "iron-1" : "sun-6");
    if (s !== "idle") g.glow(11, 8, 6, 3, "sun-6", 0.25);
    // desk: top surface, front with drawers
    const dx = 3, dy = 24, dw = 44;
    g.hline(dx + 2, dy - 2, dw - 2, WOOD.top); g.hline(dx + 1, dy - 1, dw - 1, WOOD.lit);
    g.rect(dx, dy, dw, 2, WOOD.lit); g.hline(dx, dy, dw, WOOD.top); g.vline(dx + dw - 1, dy - 2, 4, "brass-3");
    g.rect(dx + 1, dy + 2, dw - 2, 12, WOOD.mid); g.vline(dx + 1, dy + 2, 12, WOOD.deep); g.vline(dx + dw - 2, dy + 2, 12, WOOD.lit);
    for (const [x0, w] of [[dx + 3, 12], [dx + 29, 12]]) {
      for (let r = 0; r < 2; r++) {
        g.rect(x0, dy + 3 + r * 5, w, 4, WOOD.dark); g.hline(x0, dy + 3 + r * 5, w, WOOD.deep); g.hline(x0, dy + 6 + r * 5, w, WOOD.lit);
        g.rect(x0 + w / 2 - 1, dy + 4 + r * 5, 2, 1, "brass-4");
      }
    }
    g.rect(dx + 16, dy + 3, 12, 9, WOOD.deep); g.hline(dx + 16, dy + 11, 12, WOOD.dark); // kneehole
    // feet
    for (const fx of [dx + 1, dx + dw - 4]) { g.rect(fx, dy + 14, 3, 2, "brass-2"); g.set(fx + 2, dy + 14, "brass-4"); g.set(fx, dy + 15, "brass-1"); }
    g.hline(dx + 4, dy + 14, dw - 8, WOOD.deep);
    // papers + an inkpot on the desk
    g.rect(15, dy - 2, 6, 2, "haze-3"); g.hline(16, dy - 2, 4, "white"); g.rect(23, dy - 3, 5, 2, "haze-2"); g.hline(23, dy - 3, 5, "haze-3");
    g.rect(31, dy - 4, 3, 3, "steel-1"); g.hline(31, dy - 4, 3, "steel-2"); g.vline(33, dy - 5, 2, "haze-3");
    // lantern on the right corner
    g.rect(41, 14, 5, 7, "brass-1"); g.rect(42, 15, 3, 5, s === "idle" ? "iron-1" : lamp[1]); if (s !== "idle") g.set(44, 15, lamp[2]);
    g.rect(41, 13, 5, 1, "brass-3"); g.hline(42, 12, 3, "brass-2"); g.set(43, 11, "brass-4"); g.rect(41, 21, 5, 1, "brass-2");
    if (s !== "idle") halo(g, 43.5, 17.5, 4, s);
    // blue banner hanging off the front
    g.rect(37, dy + 3, 5, 11, "steel-2"); g.vline(41, dy + 3, 11, "steel-3"); g.vline(37, dy + 3, 11, "steel-1");
    g.set(38, dy + 14, "steel-2"); g.set(40, dy + 14, "steel-2");
    g.rect(38, dy + 6, 3, 3, "brass-3"); g.set(39, dy + 7, "brass-1");
    g.outline();
  },
};
