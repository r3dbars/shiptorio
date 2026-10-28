import { block, bulb, LAMP } from "./parts";
import type { StopState } from "../contract";
import type { Px } from "./px";
import type { StationDef } from "./types";

// Review: a low iron inspection bench with a crate on it, two jointed brass arms holding lamps over the crate,
// and warning bulbs on the front corners. Working: a scan line walks down the crate under the lamps.
// (The lever beside it is the engine's.)

function arm(g: Px, base: number, dir: 1 | -1, s: StopState) {
  // post, elbow up and out, forearm back in, lamp head aimed at the crate
  const post = base, elbowX = base + dir * 3, headX = base + dir * 9;
  g.rect(post - 1, 17, 3, 9, "iron-1"); g.vline(post + (dir > 0 ? 1 : -1), 17, 9, "iron-3");
  for (let i = 0; i < 8; i++) { g.set(post, 16 - i, "brass-2"); g.set(post + dir * (i > 4 ? 1 : 0) + (dir > 0 ? 1 : -1), 16 - i, "brass-3"); }
  g.disc(elbowX - dir * 2.5 + 0.5, 8.5, 1.6, "brass-1"); g.set(elbowX - dir * 2.5 + 0.5, 8, "brass-4");
  for (let i = 0; i < 6; i++) { g.set(post + dir * (i + 1), 7 - (i < 3 ? 0 : 0), "brass-3"); g.set(post + dir * (i + 1), 8, "brass-1"); }
  // lamp shade (opens down toward the crate)
  const hx = headX - (dir > 0 ? 2 : 2);
  g.rect(hx, 7, 5, 2, "brass-2"); g.hline(hx, 7, 5, "brass-4");
  g.rect(hx - 1, 9, 7, 2, "brass-3"); g.hline(hx - 1, 10, 7, "brass-1");
  const [, mid, hi] = LAMP[s];
  g.hline(hx, 11, 5, s === "idle" ? "iron-0" : mid);
  if (s !== "idle") g.set(hx + 2, 11, hi);
}

export const review: StationDef = {
  w: 54, h: 36,
  anim: (s) => (s === "working" ? { n: 4, fps: 4 } : { n: 1, fps: 0 }),
  draw(g, s, f) {
    // bench
    block(g, 4, 25, 42, 7, 3);
    for (let x = 7; x < 44; x += 6) g.set(x, 28, "brass-4");
    g.hline(5, 29, 40, "iron-1");
    // stubby legs
    for (const lx of [6, 40]) { g.rect(lx, 32, 4, 2, "iron-1"); g.hline(lx, 32, 4, "brass-2"); g.set(lx + 3, 32, "brass-4"); }
    // the crate on the bench
    const cx = 19, cy = 13, cw = 13, ch = 11;
    g.rect(cx, cy, cw, ch, "plate-2"); g.hline(cx, cy, cw, "plate-4"); g.vline(cx + cw - 1, cy, ch, "plate-3"); g.vline(cx, cy, ch, "plate-1"); g.hline(cx, cy + ch - 1, cw, "plate-1");
    g.box(cx + 1, cy + 1, cw - 2, ch - 2, "plate-1");
    for (let i = 0; i < ch - 4; i++) { g.set(cx + 2 + Math.round(i * (cw - 5) / (ch - 5)), cy + 2 + i, "plate-3"); g.set(cx + cw - 3 - Math.round(i * (cw - 5) / (ch - 5)), cy + 2 + i, "plate-1"); }
    g.hline(cx + 1, cy - 1, cw, "plate-3"); g.hline(cx + 2, cy - 2, cw - 1, "plate-4"); g.vline(cx + cw, cy - 1, ch, "plate-2");
    if (s === "jammed") { g.hline(cx, cy + 3, cw, "jam-1"); g.hline(cx, cy + ch - 4, cw, "jam-1"); }
    if (s === "working") g.hline(cx + 1, cy + 1 + f * 2 + 1, cw - 2, "sun-6");
    // light on the crate from the lamps (light layer)
    if (s !== "idle") {
      const c = s === "working" ? "sun-6" : s === "jammed" ? "jam-2" : "ok-2";
      g.glow(cx, cy - 2, cw + 1, ch + 2, c, 0.25);
    }
    arm(g, 9, 1, s);
    arm(g, 42, -1, s);
    // corner warning bulbs
    for (const bx of [5.5, 44.5]) bulb(g, bx, 23.5, 1.4, s, s !== "idle");
    g.outline();
  },
};
