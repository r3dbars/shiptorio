// The quiet construction kit: ratchets, rivets, steam, a crackle, a thunk and a ship's bell (Justin's soundboard picks:
// Crowbar, Ignite, Hammer, Gear engage, Ship's bell). The deck's build, grow and island steps ring these through juice/.
// Mute and volume follow the engine's settings; it plays on a bus of its own.

import { sound } from "./engine";

export type Cue =
  | "chalk" // the outline glows and the stakes light: a soft chalk scrape and a stake tick
  | "ratchet" // a wrench ratchets a bolt home
  | "rivet" // a rivet gun: two hard ticks and a spark
  | "puff" // a steam valve breathes
  | "crackle" // power arrives: an arc snaps, blue-white crackle, the lamps hum on
  | "crackle_small"
  | "thunk" // the brass ONLINE plate stamps on
  | "bell" // the ship's bell rings it in
  | "bell_small";

// Voices are plain data the engine plays through tone() and noise(), so levels and timing can be tested without Web Audio.
// at is seconds from the cue; vol is before the master volume (settings.volume ** 2 * 0.6).
export type Voice =
  | { k: "tone"; f: number; to?: number; dur: number; type: OscillatorType; vol: number; at: number; attack?: number }
  | { k: "noise"; dur: number; vol: number; at: number; lp?: number; hp?: number; bp?: number; sweepTo?: number; rate?: number; attack?: number };

// a struck brass bell: a hum note under it, then inharmonic partials that ring and fade at their own pace
const bell = (f: number, v: number, at: number, dur: number): Voice[] =>
  ([[0.5, 0.5], [1, 1], [1.19, 0.45], [1.5, 0.35], [2, 0.3], [2.74, 0.16], [3.76, 0.08]] as const).map(([r, g], i) => ({
    k: "tone" as const,
    f: f * r,
    dur: dur / (1 + i * 0.35),
    type: "sine" as const,
    vol: v * g,
    at,
    attack: 0.002,
  }));

export const BUILD_RECIPE: Record<Cue, Voice[]> = {
  chalk: [
    { k: "noise", dur: 0.32, vol: 0.035, bp: 3800, sweepTo: 2400, at: 0, attack: 0.08, rate: 0.6 },
    { k: "noise", dur: 0.02, vol: 0.05, bp: 2600, at: 0.34 },
    { k: "tone", f: 1760, dur: 0.05, type: "triangle", vol: 0.018, at: 0.34 },
  ],
  ratchet: [0, 0.045, 0.09, 0.135].flatMap<Voice>((d, i) => [
    { k: "noise", dur: 0.015, vol: 0.05, bp: 3000 + i * 60, at: d },
    { k: "tone", f: 1800 + i * 40, dur: 0.012, type: "square", vol: 0.006, at: d },
  ]),
  rivet: [
    { k: "noise", dur: 0.025, vol: 0.06, bp: 2200, at: 0 },
    { k: "tone", f: 140, to: 70, dur: 0.06, type: "sine", vol: 0.05, at: 0 },
    { k: "noise", dur: 0.025, vol: 0.05, bp: 2400, at: 0.11 },
    { k: "noise", dur: 0.06, vol: 0.012, hp: 6000, at: 0.12 }, // the spark
  ],
  puff: [
    { k: "tone", f: 95, to: 60, dur: 0.07, type: "sine", vol: 0.03, at: 0 },
    { k: "noise", dur: 0.45, vol: 0.035, lp: 9000, sweepTo: 2600, hp: 1800, at: 0.02, attack: 0.05 },
  ],
  crackle: [
    // the arc snaps down the cable
    { k: "tone", f: 2600, to: 320, dur: 0.16, type: "sawtooth", vol: 0.035, at: 0 },
    { k: "noise", dur: 0.05, vol: 0.08, hp: 2500, at: 0 },
    // blue-white crackle, thinning out
    ...[0.04, 0.09, 0.12, 0.18, 0.21, 0.27, 0.33, 0.36, 0.45, 0.52, 0.63, 0.74].map<Voice>((d, i) => ({
      k: "noise",
      dur: 0.022,
      vol: 0.06 * (1 - i / 14),
      hp: 2800 + (i % 3) * 900,
      at: d,
    })),
    // power settles in: a mains hum swells, the lamps click on
    { k: "tone", f: 55, to: 110, dur: 0.9, type: "sawtooth", vol: 0.03, at: 0.05, attack: 0.25 },
    { k: "tone", f: 110, dur: 0.8, type: "triangle", vol: 0.03, at: 0.2, attack: 0.2 },
    { k: "noise", dur: 0.02, vol: 0.05, bp: 3600, at: 0.5 },
    { k: "noise", dur: 0.02, vol: 0.04, bp: 3900, at: 0.58 },
  ],
  crackle_small: [
    { k: "tone", f: 2200, to: 420, dur: 0.12, type: "sawtooth", vol: 0.022, at: 0 },
    ...[0.02, 0.07, 0.13, 0.22, 0.31].map<Voice>((d, i) => ({ k: "noise", dur: 0.02, vol: 0.045 * (1 - i / 7), hp: 3200, at: d })),
    { k: "tone", f: 110, dur: 0.5, type: "triangle", vol: 0.02, at: 0.1, attack: 0.15 },
    { k: "noise", dur: 0.02, vol: 0.035, bp: 3600, at: 0.36 },
  ],
  thunk: [
    { k: "tone", f: 95, to: 40, dur: 0.3, type: "sine", vol: 0.22, at: 0 },
    { k: "noise", dur: 0.07, vol: 0.08, lp: 900, at: 0 },
    { k: "tone", f: 523, dur: 0.22, type: "triangle", vol: 0.02, at: 0.004 }, // the brass plate rings a little
  ],
  bell: [...bell(784, 0.1, 0.12, 2.2), ...bell(784, 0.045, 0.5, 1.6)],
  bell_small: bell(784, 0.045, 0.1, 1.4),
};

// A rough loudness ceiling: the sum of a cue's voice levels. Tests hold the routine taps well under the big moments.
export const recipePeak = (v: Voice[]) => v.reduce((s, x) => s + x.vol, 0);
export const ROUTINE_PEAK = 0.25;
export const ROUTINE_CUES: readonly Cue[] = ["chalk", "ratchet", "rivet", "puff"];

// ---------- the player ----------

let bus: GainNode | null = null;

const level = () => (sound.settings.muted ? 0 : sound.settings.volume ** 2 * 0.6);

export function out(): AudioNode {
  if (!bus) {
    const ctx = sound.audio;
    bus = ctx.createGain();
    bus.gain.value = level();
    bus.connect(ctx.destination);
    sound.subscribe(() => bus?.gain.setTargetAtTime(level(), ctx.currentTime, 0.03));
  }
  return bus;
}

export function play(cue: Cue, delay = 0) {
  if (!sound.canPlay) return;
  const o = out();
  const t = sound.now + delay;
  for (const v of BUILD_RECIPE[cue]) {
    if (v.k === "tone") sound.tone({ f: v.f, to: v.to, dur: v.dur, type: v.type, vol: v.vol, at: t + v.at, attack: v.attack, out: o });
    else sound.noise({ dur: v.dur, vol: v.vol, at: t + v.at, lp: v.lp, hp: v.hp, bp: v.bp, sweepTo: v.sweepTo, rate: v.rate, attack: v.attack, out: o });
  }
}
