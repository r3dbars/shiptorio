// The launch build as one pure timeline: islandProgress 0..1 -> what's on screen. No drawing, no state, so the
// story can drive it with any curve, the preview can scrub it, and tests can check it.
//
//   rise    the island comes up out of the clouds: tip -> half up shedding rocks -> fully up, dark -> ring lights
//   bridge  a stub juts out from the deck, a crane swings in deck plates, the last beam goes down, lanterns light
//   tower   the launch tower goes up in three lifts: pad, pillars, gantry
//   rocket  a rocket comes down from the sky on the gantry's hook and is lowered onto the pad

export const LAUNCH_BUILD_SECONDS = 12; // the whole build at speed 1 (story: islandProgress += dt / this); keep it short, the bottleneck is the point

export type Phase = "none" | "rise" | "bridge" | "tower" | "rocket" | "done";
export const PHASES: { phase: Exclude<Phase, "none" | "done">; from: number; to: number }[] = [
  { phase: "rise", from: 0, to: 0.22 },
  { phase: "bridge", from: 0.22, to: 0.55 },
  { phase: "tower", from: 0.55, to: 0.74 },
  { phase: "rocket", from: 0.74, to: 1 },
];

export type LaunchStageName = "island-rising" | "island-up" | "bridge" | "bridge-done" | "tower" | "rocket-lowering" | "rocket-seated";
/** Where each launch-stage event fires (tower fires once per lift). Juice keys sounds off these. */
export const CUES: { at: number; stage: LaunchStageName }[] = [
  { at: 0.0001, stage: "island-rising" },
  { at: 0.22 * 0.86, stage: "island-up" },
  { at: 0.22, stage: "bridge" },
  { at: 0.22 + 0.33 * 0.84, stage: "bridge-done" },
  { at: 0.55, stage: "tower" },
  { at: 0.55 + 0.19 / 3, stage: "tower" },
  { at: 0.55 + (0.19 * 2) / 3, stage: "tower" },
  { at: 0.74 + 0.26 * 0.66, stage: "rocket-lowering" },
  { at: 0.74 + 0.26 * 0.86, stage: "rocket-seated" },
];

/** The phase at progress p, and how far through it (0..1). */
export function phaseAt(p: number): { phase: Phase; u: number } {
  if (p <= 0) return { phase: "none", u: 0 };
  if (p >= 1) return { phase: "done", u: 1 };
  for (const s of PHASES) if (p < s.to) return { phase: s.phase, u: (p - s.from) / (s.to - s.from) };
  return { phase: "done", u: 1 };
}
/** 0..1 through phase `ph` at progress p (0 before it, 1 after). */
export function through(p: number, ph: Exclude<Phase, "none" | "done">): number {
  const s = PHASES.find((x) => x.phase === ph)!;
  return Math.max(0, Math.min(1, (p - s.from) / (s.to - s.from)));
}
/** The cues crossed going from a to b (forward only). */
export const crossed = (a: number, b: number) => (b > a ? CUES.filter((c) => c.at > a && c.at <= b) : []);

// ---------- easing ----------
export const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
/** Lands past the target and settles, for heavy things clunking into place. */
export const easeBack = (x: number) => { const c = 1.9; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
