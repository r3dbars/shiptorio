// What the 2D deck sounds like. Every deck event (contract.ts DeckEvent) maps to sounds that already exist (Justin's
// soundboard picks in sound/steamIron.ts, the older synth in sound/engine.ts), so the deck adds no new noise of its
// own. Calm pass (Justin 2026-10-28, "flashing and pinging all over"): one cue per beat, and nothing while the deck
// is just running (crates, machines starting, Shippy walking are silent). Your swipes always play; a build rings
// once when it's done; launch and automated are the big moments. What's left still goes through the calm floor.

import { calmSounds, freshCalm, type CalmMemory } from "../../sound/calm";
import type { Cue as BuildCue } from "../../sound/build";
import type { Sfx } from "../../sound/engine";
import type { DeckEvent as ContractEvent, ShippyPose, StopId, StopState } from "../contract";

// The build/grow/launch layers' events. Declared here too so juice compiles before and after they reach the contract.
type GrowPhase = "beams" | "plates" | "rails" | "glow" | "rocks" | "done";
type BuildStage = "plot" | "scaffold" | "frame" | "panels" | "top" | "burst" | "check";
type LaunchStage = "island-rising" | "island-up" | "bridge" | "bridge-done" | "tower" | "rocket-lowering" | "rocket-seated";
export type DeckEvent =
  | ContractEvent
  | { type: "build-start"; stop: StopId }
  | { type: "deck-grow"; size: "small" | "medium" | "large"; phase: GrowPhase }
  | { type: "build-stage"; stop: StopId; stage: BuildStage }
  | { type: "launch-stage"; stage: LaunchStage };

/** Seconds after the event each sound starts. sfx = the engine's sounds; build = the quiet construction kit (sound/build.ts). */
export type Cue = { sfx: Sfx; at: number } | { build: BuildCue; at: number };

const STATE: Record<StopState, Cue[]> = {
  idle: [],
  working: [], // machines just running are silent
  jammed: [], // the jam event and Shippy's alarm carry it; three sounds for one jam is too many
  auto: [], // the automated event carries it
};

const SHIPPY: Record<ShippyPose, Cue[]> = {
  folded: [],
  peek: [],
  unfold: [{ sfx: "think", at: 0 }],
  walking: [],
  lever: [{ sfx: "arm", at: 0 }],
  happy: [{ sfx: "chirp", at: 0 }],
  alarmed: [{ sfx: "caught", at: 0 }],
  weld: [], // build poses: the construction kit below already carries those sounds
  carry: [],
  inspect: [], poke: [], skid: [], idle: [], // tap-to-walk poses (pixel plan): juice picks their sounds
};

// Construction uses the quiet build kit (sound/build.ts). Each build, grow or island step rings once, when it's done;
// the steps on the way there are silent.
const STAGE: Record<BuildStage, BuildCue | null> = {
  plot: null, scaffold: null, frame: null, panels: null, top: null, burst: null, check: "bell",
};
const GROW: Record<GrowPhase, BuildCue | null> = { beams: null, plates: null, rails: null, glow: null, rocks: null, done: "bell_small" };
const LAUNCH_STAGE: Record<LaunchStage, Cue[]> = {
  "island-rising": [],
  "island-up": [{ build: "thunk", at: 0 }],
  bridge: [],
  "bridge-done": [],
  tower: [],
  "rocket-lowering": [],
  "rocket-seated": [{ sfx: "dock", at: 0 }],
};
const kit = (c: BuildCue | null): Cue[] => (c ? [{ build: c, at: 0 }] : []);

export function cuesFor(e: DeckEvent): Cue[] {
  switch (e.type) {
    case "build-start": return [];
    case "build-stage": return kit(STAGE[e.stage]);
    case "deck-grow": return kit(GROW[e.phase]);
    case "launch-stage": return LAUNCH_STAGE[e.stage];
    case "station-state": return STATE[e.state];
    // a staged build already rang its bell (build-stage check); a station that just appears gets the drop
    case "station-built": return [{ sfx: "station_drop", at: 0 }];
    case "crate-arrive": return [];
    // your own swipes: straight to the speakers, never thinned
    case "approve": return [{ sfx: "card_go", at: 0 }];
    case "later": return [{ sfx: "card_later", at: 0 }];
    // a jam is news, not an emergency: one stamp-and-buzz
    case "jam": return [{ sfx: "stamp_fail", at: 0 }];
    // the big moments
    case "launch": return [{ sfx: "launch", at: 0 }];
    case "automated": return [{ sfx: "permit_grant", at: 0 }];
    case "shippy": return SHIPPY[e.pose];
    default: return []; // tap / shippy-arrive / interact: not wired yet
  }
}

// Alarms aren't routine (you should hear a jam), but a pile-up that flickers shouldn't buzz on every flicker.
export const ALARM_GAP_MS = 8000;
const ALARMS = new Set<Sfx>(["stamp_fail", "caught"]);

/** The deck's own calm memory, so a busy belt can't drown out a swipe. */
const isSfx = (c: Cue): c is { sfx: Sfx; at: number } => "sfx" in c;
const STAGED_MS = 20_000; // how long a staged build counts as "already rang"

export class DeckSound {
  private mem: CalmMemory = freshCalm();
  private alarmAt = -Infinity;
  private staged = new Map<StopId, number>();
  constructor(
    private play: (s: Sfx, delaySeconds: number) => void,
    private now: () => number = () => performance.now(),
    private playBuild: (c: BuildCue, delaySeconds: number) => void = () => {},
  ) {}

  /** Plays what's due for this event and returns it. */
  fire(e: DeckEvent): Cue[] {
    const now = this.now();
    if (e.type === "build-stage") this.staged.set(e.stop, now);
    if (e.type === "station-built" && now - (this.staged.get(e.stop) ?? -Infinity) < STAGED_MS) return [];
    const cues = cuesFor(e);
    const keep = new Set(calmSounds(cues.filter(isSfx).map((c) => c.sfx), now, this.mem));
    let out = cues.filter((c) => !isSfx(c) || keep.has(c.sfx));
    if (out.some((c) => isSfx(c) && ALARMS.has(c.sfx))) {
      if (now - this.alarmAt < ALARM_GAP_MS) out = out.filter((c) => !(isSfx(c) && ALARMS.has(c.sfx)));
      else this.alarmAt = now;
    }
    for (const c of out) {
      if (isSfx(c)) this.play(c.sfx, c.at);
      else this.playBuild(c.build, c.at);
    }
    return out;
  }
}
