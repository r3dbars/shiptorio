// A calm floor (Justin's playtest, 2026-10-27: "so many bings and bongs ... sounds like a casino floor"). The big
// moments always play: a launch, a catch, a permit, a level up, a PR docking at the pad. Routine sounds (ore
// dropping, a stamp, a machine spinning up, the foreman's chirps) become a sparse texture: at most one per beat,
// a few seconds apart, and the same one not again for a while. Your own taps are never thinned.

import type { Sfx } from "./engine";

const ROUTINE = new Set<Sfx>([
  "ore",
  "machine_start",
  "stamp_pass",
  "verify_pop",
  "verify_ram",
  "review_stamp",
  "ai_pass",
  "gate_clank",
  "orbit_clear",
  "rework",
  "chirp",
  "think",
  "suggest",
]);
export const ROUTINE_GAP_MS = 3000; // between any two routine sounds
export const SAME_GAP_MS = 9000; // before the same routine sound plays again

export interface CalmMemory {
  any: number;
  each: Map<Sfx, number>;
}
export const freshCalm = (): CalmMemory => ({ any: -Infinity, each: new Map() });

/** One beat's sounds, thinned. Keeps every big moment and at most one routine sound that's due. */
export function calmSounds(sfx: Sfx[], now: number, mem: CalmMemory): Sfx[] {
  const out: Sfx[] = [];
  for (const s of sfx) {
    if (!ROUTINE.has(s)) {
      out.push(s);
      continue;
    }
    if (now - mem.any < ROUTINE_GAP_MS || now - (mem.each.get(s) ?? -Infinity) < SAME_GAP_MS) continue;
    mem.any = now;
    mem.each.set(s, now);
    out.push(s);
  }
  return out;
}
