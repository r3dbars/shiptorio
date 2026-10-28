// What the 2D deck sounds like. Every deck event (contract.ts DeckEvent) maps to sounds that already exist (Justin's
// soundboard picks in sound/steamIron.ts, the older synth in sound/engine.ts), so the deck adds no new noise of its
// own. Routine events go through the calm floor (sound/calm.ts): a crate landing or Shippy walking is a sparse
// texture, never a casino. Your swipes always play. The two big moments, launch and automated, always play in full.

import { calmSounds, freshCalm, type CalmMemory } from "../../sound/calm";
import type { Sfx } from "../../sound/engine";
import type { DeckEvent, ShippyPose, StopState } from "../contract";

/** Seconds after the event each sound starts. */
export type Cue = { sfx: Sfx; at: number };

const STATE: Record<StopState, Cue[]> = {
  idle: [],
  working: [{ sfx: "machine_start", at: 0 }],
  jammed: [], // the jam event and Shippy's alarm carry it; three sounds for one jam is too many
  auto: [], // the automated event carries it
};

const SHIPPY: Record<ShippyPose, Cue[]> = {
  folded: [{ sfx: "gate_clank", at: 0 }],
  peek: [],
  unfold: [{ sfx: "think", at: 0 }],
  walking: [{ sfx: "chirp", at: 0 }],
  lever: [{ sfx: "arm", at: 0 }],
  happy: [{ sfx: "chirp", at: 0 }],
  alarmed: [{ sfx: "caught", at: 0 }],
};

export function cuesFor(e: DeckEvent): Cue[] {
  switch (e.type) {
    case "station-state": return STATE[e.state];
    case "station-built": return [{ sfx: "station_drop", at: 0 }];
    case "crate-arrive": return [{ sfx: "ore", at: 0 }];
    // your own swipes: straight to the speakers, never thinned
    case "approve": return [{ sfx: "card_go", at: 0 }];
    case "later": return [{ sfx: "card_later", at: 0 }];
    // a jam is news, not an emergency: one stamp-and-buzz
    case "jam": return [{ sfx: "stamp_fail", at: 0 }];
    // the big moments
    case "launch": return [{ sfx: "launch", at: 0 }, { sfx: "launch_iron", at: 0.62 }];
    case "automated": return [{ sfx: "permit_grant", at: 0 }, { sfx: "level_up", at: 0.55 }];
    case "shippy": return SHIPPY[e.pose];
  }
}

// Alarms aren't routine (you should hear a jam), but a pile-up that flickers shouldn't buzz on every flicker.
export const ALARM_GAP_MS = 8000;
const ALARMS = new Set<Sfx>(["stamp_fail", "caught"]);

/** The deck's own calm memory, so a busy belt can't drown out a swipe. */
export class DeckSound {
  private mem: CalmMemory = freshCalm();
  private alarmAt = -Infinity;
  constructor(private play: (s: Sfx, delaySeconds: number) => void, private now: () => number = () => performance.now()) {}

  /** Plays what's due for this event and returns it. */
  fire(e: DeckEvent): Cue[] {
    const cues = cuesFor(e);
    const now = this.now();
    const keep = new Set(calmSounds(cues.map((c) => c.sfx), now, this.mem));
    let out = cues.filter((c) => keep.has(c.sfx));
    if (out.some((c) => ALARMS.has(c.sfx))) {
      if (now - this.alarmAt < ALARM_GAP_MS) out = out.filter((c) => !ALARMS.has(c.sfx));
      else this.alarmAt = now;
    }
    for (const c of out) this.play(c.sfx, c.at);
    return out;
  }
}
