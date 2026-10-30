// The quiet construction kit: ratchets, rivets, steam, a crackle, a thunk and a ship's bell (Justin's soundboard picks:
// Crowbar, Ignite, Hammer, Gear engage, Ship's bell). The deck's build, grow and island steps ring these through juice/.
// The city reveal rings three more, all quieter than bell_small: a lamp tick, a brass tap and a thud.
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
  | "bell_small"
  // the city reveal (city/SPEC.md section 5). Quiet, and no louder than bell_small: they sit under the music.
  | "city_tick" // a runway lamp comes on: 880 Hz, play() lifts it a semitone per lamp
  | "city_tap" // an island lights: a soft brass tap on C4, play() lifts it up the chord
  | "city_thud"; // an island goes dark: a soft low thud

// Voices are plain data the engine plays through tone() and noise(), so levels and timing can be tested without Web Audio.
// at is seconds from the cue; vol is before the master volume (settings.volume ** 2 * 0.6).
export type Voice =
  | { k: "tone"; f: number; to?: number; dur: number; type: OscillatorType; vol: number; at: number; attack?: number }
  | { k: "noise"; dur: number; vol: number; at: number; lp?: number; hp?: number; bp?: number; sweepTo?: number; rate?: number; attack?: number };

// a struck brass bell: a hum note under it, then inharmonic partials that ring and fade at their own pace
// (attack: a low bell needs a few ms to get its first wave up to level; the ship's bell strikes at 2 ms)
const bell = (f: number, v: number, at: number, dur: number, attack = 0.002): Voice[] =>
  ([[0.5, 0.5], [1, 1], [1.19, 0.45], [1.5, 0.35], [2, 0.3], [2.74, 0.16], [3.76, 0.08]] as const).map(([r, g], i) => ({
    k: "tone" as const,
    f: f * r,
    dur: dur / (1 + i * 0.35),
    type: "sine" as const,
    vol: v * g,
    at,
    attack,
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
  // A runway lamp: one short triangle pip, its octave, and a hair of click. Under 40 ms, so twelve of them 60 ms apart
  // stay twelve separate ticks.
  city_tick: [
    { k: "tone", f: 880, dur: 0.036, type: "triangle", vol: 0.075, at: 0, attack: 0.002 },
    { k: "tone", f: 1760, dur: 0.022, type: "sine", vol: 0.022, at: 0, attack: 0.001 },
    { k: "noise", dur: 0.01, vol: 0.028, bp: 4200, at: 0, attack: 0.001 },
  ],
  // A knuckle on a small brass bell: a short, low ring on C4 (play() climbs it up the chord as the islands light), a
  // triangle for body and a muffled tap. Warm: even the highest partial stays near 1 kHz on the first island.
  city_tap: [
    ...bell(262, 0.03, 0, 0.45, 0.008),
    { k: "tone", f: 262, dur: 0.3, type: "triangle", vol: 0.02, at: 0, attack: 0.008 },
    { k: "noise", dur: 0.02, vol: 0.02, bp: 1800, at: 0 },
  ],
  // A heavy lamp going out: a short sine drop, a triangle so small speakers hear it, a muffled knock.
  city_thud: [
    { k: "tone", f: 170, to: 78, dur: 0.2, type: "sine", vol: 0.07, at: 0, attack: 0.004 },
    { k: "tone", f: 340, to: 156, dur: 0.09, type: "triangle", vol: 0.025, at: 0 },
    { k: "noise", dur: 0.05, vol: 0.03, lp: 700, at: 0 },
  ],
};

// A rough loudness ceiling: the sum of a cue's voice levels. Tests hold the routine taps well under the big moments.
export const recipePeak = (v: Voice[]) => v.reduce((s, x) => s + x.vol, 0);
/** How long a cue sounds, in seconds: the end of its last voice. */
export const recipeLength = (v: Voice[]) => v.reduce((s, x) => Math.max(s, x.at + x.dur), 0);
/** A cue's voices lifted by `semitones` (negative = down). Tones move, noise keeps its colour. Returns the recipe itself at 0. */
export function voicesFor(cue: Cue, semitones = 0): Voice[] {
  const voices = BUILD_RECIPE[cue];
  if (!Number.isFinite(semitones) || semitones === 0) return voices;
  const k = 2 ** (semitones / 12);
  return voices.map((v) => (v.k === "tone" ? { ...v, f: v.f * k, ...(v.to === undefined ? {} : { to: v.to * k }) } : v));
}
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

export function play(cue: Cue, delay = 0, semitones = 0) {
  if (!sound.canPlay) return;
  const o = out();
  const t = sound.now + delay;
  for (const v of voicesFor(cue, semitones)) {
    if (v.k === "tone") sound.tone({ f: v.f, to: v.to, dur: v.dur, type: v.type, vol: v.vol, at: t + v.at, attack: v.attack, out: o });
    else sound.noise({ dur: v.dur, vol: v.vol, at: t + v.at, lp: v.lp, hp: v.hp, bp: v.bp, sweepTo: v.sweepTo, rate: v.rate, attack: v.attack, out: o });
  }
}
