// Steam and iron: short accents layered over the soft foundry hum (docs/GAMEPLAY-PICKS.md, r3-sound).
// The hum and the score stay the base; these only mark real moments:
//   steam_hiss  a build starts (an item starts working, or a machine spins up)
//   iron_clank  an item lands on a higher floor of the shaft (mine -> build -> checks -> launch)
//   launch_iron the pad clamps let go and vent steam, on the server's launched state (never earlier)
// Everything here is pure so the mapping, the rate limit and the levels can be tested without Web Audio.

import type { FactoryState, ItemState } from "@shiptorio/shared";

export type Accent = "steam_hiss" | "iron_clank" | "launch_iron";
export type Floor = "mine" | "build" | "checks" | "launch";

const FLOOR_OF: Record<ItemState, Floor> = {
  ore: "mine",
  queued: "mine",
  working: "build",
  inspecting: "checks",
  rejected: "checks",
  passed: "launch",
  on_pad: "launch",
  launched: "launch",
};
const RANK: Record<Floor, number> = { mine: 0, build: 1, checks: 2, launch: 3 };

export const floorOf = (s: ItemState): Floor => FLOOR_OF[s];

// The accents one state change earns, at most one of each, in play order.
export function accentsFor(prev: FactoryState, next: FactoryState): Accent[] {
  let hiss = false;
  let clank = false;
  let launch = false;
  const before = new Map(prev.items.map((i) => [i.id, i.state]));
  for (const item of next.items) {
    const was = before.get(item.id);
    if (!was || was === item.state) continue; // a new item is ore arriving; the ore sound covers it
    if (item.state === "launched") {
      launch = true;
      continue;
    }
    if (item.state === "working") hiss = true;
    if (RANK[FLOOR_OF[item.state]] > RANK[FLOOR_OF[was]]) clank = true;
  }
  const machines = new Map(prev.machines.map((m) => [m.id, m.state]));
  for (const m of next.machines) {
    const was = machines.get(m.id);
    if (was && was !== "working" && m.state === "working") hiss = true;
  }
  const out: Accent[] = [];
  if (hiss) out.push("steam_hiss");
  if (clank) out.push("iron_clank");
  if (launch) out.push("launch_iron");
  return out;
}

// A busy factory must not machine-gun: each accent has its own breather, and all of them share a small budget.
export const ACCENT_GAP_MS: Record<Accent, number> = { steam_hiss: 1400, iron_clank: 600, launch_iron: 1500 };
export const ACCENT_WINDOW_MS = 4000;
export const ACCENT_BUDGET = 4; // accents per window; a launch always gets its own

export interface AccentMemory {
  last: Partial<Record<Accent, number>>;
  recent: number[]; // when the budgeted accents played
}
export const freshAccentMemory = (): AccentMemory => ({ last: {}, recent: [] });

export function limitAccents(want: Accent[], now: number, mem: AccentMemory): { play: Accent[]; mem: AccentMemory } {
  const last = { ...mem.last };
  const recent = mem.recent.filter((t) => now - t < ACCENT_WINDOW_MS);
  const play: Accent[] = [];
  for (const a of want) {
    if (play.includes(a)) continue;
    const at = last[a];
    if (at !== undefined && now - at < ACCENT_GAP_MS[a]) continue;
    if (a !== "launch_iron") {
      if (recent.length >= ACCENT_BUDGET) continue;
      recent.push(now);
    }
    last[a] = now;
    play.push(a);
  }
  return { play, mem: { last, recent } };
}

// The launch accent lands on ignition, when the clamps let go, so it rides the existing launch sound
// (sound/ship.ts SHIP_TIMING.ignitionMs) instead of jumping ahead of it.
export const LAUNCH_IRON_DELAY_S = 0.62;

// How each accent is built, as plain data the engine plays through its tone() and noise() primitives.
// at is seconds from the start; vol is before the master volume (settings.volume ** 2 * 0.6).
export type Voice =
  | { k: "tone"; f: number; to?: number; dur: number; type: OscillatorType; vol: number; at: number; attack?: number }
  | { k: "noise"; dur: number; vol: number; at: number; lp?: number; hp?: number; bp?: number; sweepTo?: number; rate?: number; attack?: number };

export const ACCENT_RECIPE: Record<Accent, Voice[]> = {
  // a valve cracks open: a soft thump, then a short airy hiss that darkens as it dies
  steam_hiss: [
    { k: "tone", f: 95, to: 60, dur: 0.07, type: "sine", vol: 0.05, at: 0 },
    { k: "noise", dur: 0.5, vol: 0.05, lp: 9000, sweepTo: 2600, hp: 1800, at: 0.02, attack: 0.04 },
  ],
  // iron on iron: a low knock and a few inharmonic partials ringing out briefly
  iron_clank: [
    { k: "tone", f: 120, to: 70, dur: 0.09, type: "sine", vol: 0.07, at: 0 },
    { k: "noise", dur: 0.035, vol: 0.06, bp: 2600, at: 0 },
    { k: "tone", f: 523, dur: 0.28, type: "triangle", vol: 0.03, at: 0.005 },
    { k: "tone", f: 1187, dur: 0.2, type: "sine", vol: 0.02, at: 0.005 },
    { k: "tone", f: 1871, dur: 0.14, type: "sine", vol: 0.012, at: 0.005 },
  ],
  // the pad clamps let go: a heavy clank, a deeper ring, then a big steam vent under the engine
  launch_iron: [
    { k: "tone", f: 80, to: 40, dur: 0.32, type: "sine", vol: 0.12, at: 0 },
    { k: "noise", dur: 0.1, vol: 0.1, lp: 1100, at: 0 },
    { k: "tone", f: 196, dur: 0.5, type: "triangle", vol: 0.035, at: 0.01 },
    { k: "tone", f: 431, dur: 0.38, type: "sine", vol: 0.022, at: 0.01 },
    { k: "noise", dur: 1.1, vol: 0.065, lp: 8000, sweepTo: 1800, hp: 1200, at: 0.08, attack: 0.06 },
  ],
};

// A rough loudness ceiling: the sum of a recipe's voice levels. Tests hold accents under the sounds they sit beside.
export const recipePeak = (v: Voice[]) => v.reduce((s, x) => s + x.vol, 0);
