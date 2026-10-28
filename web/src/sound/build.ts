// The sound of a build moment (web/src/buildout/CONTRACT.md, slice 9). Steam and iron, to match Justin's soundboard picks
// (Crowbar, Ignite, Hammer, Gear engage, Ship's bell): ratchets and rivets while the piece goes up, a rising whine as power
// comes down the cable, an electric crackle on the burst, then a thunk and a brass bell when the ONLINE plate stamps on.
//
// One build is about 7 seconds:  chalk 0-0.5s · construct 0.5-4.5s · burst 4.5-5.5s · payoff 5.5-7s
// The scene fires shiptorio:build (BUILD_EVENT in buildout/journey.ts) with phase start, burst and done. Tapping to speed a build up just brings burst sooner,
// so the construct layer is cancelled and the burst and payoff always play in full.
//
// Calm (sound/calm.ts, Justin's "casino floor" playtest): the build itself is a big moment and always plays. The taps
// inside it are routine texture, so they stay sparse (CONSTRUCT_GAP_MS apart, at most CONSTRUCT_MAX per build) and quiet
// (each under ROUTINE_PEAK). Mute and volume follow the engine's settings. engine.ts is untouched: we only use its
// public primitives, on a bus of our own.

import { BUILD_MS, onBuild, type BuildDetail } from "../buildout/journey";
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

// Timeline, in seconds from start (BUILD_MS in web/src/buildout/journey.ts)
export const CHALK_AT = 0;
export const CONSTRUCT_FROM = BUILD_MS.chalk / 1000;
export const CONSTRUCT_TO = BUILD_MS.construct / 1000;
export const WHINE_FROM = 2.9; // the charge-up rides the last stretch of construct, into the burst
export const PAYOFF_AFTER = (BUILD_MS.burst - BUILD_MS.construct) / 1000; // burst to the plate stamping

export const CONSTRUCT_GAP_MS = 850; // between any two taps inside one build
export const CONSTRUCT_MAX = 4; // taps per build

// What the construct stretch plays: a ratchet, a rivet, a steam breath, another ratchet, spaced out and never
// more than CONSTRUCT_MAX. Pure so the calm limits can be tested.
export function constructCues(from = CONSTRUCT_FROM, to = CONSTRUCT_TO): { at: number; cue: Cue }[] {
  const order: Cue[] = ["ratchet", "rivet", "puff", "ratchet", "rivet"];
  const out: { at: number; cue: Cue }[] = [];
  let at = from + 0.15;
  for (const cue of order) {
    if (out.length >= CONSTRUCT_MAX || at > to - 0.3) break;
    out.push({ at: +at.toFixed(3), cue });
    at += Math.max(CONSTRUCT_GAP_MS / 1000, (to - from) / CONSTRUCT_MAX);
  }
  return out;
}

export const burstCue = (first: boolean): Cue => (first ? "crackle" : "crackle_small");
export const payoffCues = (first: boolean): { at: number; cue: Cue }[] =>
  first ? [{ at: 0, cue: "thunk" }, { at: 0, cue: "bell" }] : [{ at: 0, cue: "thunk" }, { at: 0, cue: "bell_small" }];

// What one shiptorio:build event should do to the build in flight. Pure: the player below turns it into sound.
// The burst brings its payoff with it (thunk + bell PAYOFF_AFTER later, when the plate stamps), because done only comes
// once the moment is over. done just makes sure a build that never sent a burst still gets both.
export interface BuildRun {
  id: string;
  burst: boolean; // the burst (and so the payoff) has played
}
export type BuildAction =
  | { k: "start" } // chalk, then construct taps, then the whine
  | { k: "burst"; first: boolean } // cut construct, crackle, then the payoff
  | { k: "catchup"; first: boolean } // done with no burst before it: crackle and payoff now
  | { k: "ignore" };

export function reduce(run: BuildRun | null, e: BuildDetail): { run: BuildRun | null; act: BuildAction } {
  const first = e.first ?? true;
  const played = !!run && run.id === e.id && run.burst;
  if (e.phase === "start") return { run: { id: e.id, burst: false }, act: { k: "start" } };
  if (e.phase === "burst") return played ? { run, act: { k: "ignore" } } : { run: { id: e.id, burst: true }, act: { k: "burst", first } };
  return { run: null, act: played ? { k: "ignore" } : { k: "catchup", first } };
}

// ---------- the player ----------

let bus: GainNode | null = null;
let run: BuildRun | null = null;
let timers: number[] = [];
let whine: { osc: OscillatorNode; gain: GainNode } | null = null;

const level = () => (sound.settings.muted ? 0 : sound.settings.volume ** 2 * 0.6);

function out(): AudioNode {
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

// The charge-up: a low whine that climbs as power comes down the cable. Its own node so a sped-up build can cut it.
function startWhine(seconds: number) {
  if (!sound.canPlay || seconds <= 0) return;
  const ctx = sound.audio;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const lp = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(140, t);
  osc.frequency.exponentialRampToValueAtTime(620, t + seconds);
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(500, t);
  lp.frequency.exponentialRampToValueAtTime(2200, t + seconds);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.022, t + seconds);
  osc.connect(lp).connect(gain).connect(out());
  osc.start(t);
  osc.stop(t + seconds + 0.6);
  whine = { osc, gain };
}

function cut() {
  timers.forEach((id) => window.clearTimeout(id));
  timers = [];
  if (whine && sound.canPlay) {
    const t = sound.now;
    whine.gain.gain.cancelScheduledValues(t);
    whine.gain.gain.setTargetAtTime(0, t, 0.04);
    try {
      whine.osc.stop(t + 0.3);
    } catch {}
  }
  whine = null;
}

const later = (s: number, f: () => void) => timers.push(window.setTimeout(f, s * 1000));

export function handleBuild(e: BuildDetail) {
  const next = reduce(run, e);
  run = next.run;
  const a = next.act;
  if (a.k === "start") {
    cut();
    play("chalk", CHALK_AT);
    for (const c of constructCues()) later(c.at, () => play(c.cue));
    later(WHINE_FROM, () => startWhine(CONSTRUCT_TO - WHINE_FROM));
  } else if (a.k === "burst" || a.k === "catchup") {
    cut();
    play(burstCue(a.first));
    // the payoff always plays, even when a tap sped the build up
    const after = a.k === "burst" ? PAYOFF_AFTER : 0.45;
    for (const c of payoffCues(a.first)) play(c.cue, after + c.at);
  }
}

/** Listen for build moments. Call once behind ?buildout=1; returns the remover. */
export function installBuildSound(): () => void {
  const off = onBuild((d) => {
    if (d && typeof d.id === "string" && (d.phase === "start" || d.phase === "burst" || d.phase === "done")) handleBuild(d);
  });
  return () => {
    off();
    cut();
    run = null;
  };
}
