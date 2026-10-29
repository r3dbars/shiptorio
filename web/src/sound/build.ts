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
import { out, play, type Cue } from "../deck2d/sound/kit";

// The kit itself (cues, recipes, play) moved to the deck: deck2d/sound/kit.ts.
export * from "../deck2d/sound/kit";

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

let run: BuildRun | null = null;
let timers: number[] = [];
let whine: { osc: OscillatorNode; gain: GainNode } | null = null;

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
