// The adaptive score's brain: pure functions that turn how the factory is doing into how the
// music should feel. No Web Audio in here, so it's unit tested (web/test/music.test.ts) and the
// player (musicPlayer.ts) just reads these numbers each bar.
//
//   intensity (0..1): how much work is moving. More items on the belts → more layers.
//   tension   (0..1): something's wrong. A bottleneck piling up, or a station just caught a bad fix.
//   resolve:          a PR launched. The next bars cadence home (V → I) and tension clears.

export type Layer = "pad" | "bass" | "arp" | "drums" | "snare" | "pulse";
export type Layers = Record<Layer, boolean>;

export interface MusicInput {
  moving: number; // items riding the line (queued, working, inspecting, rejected)
  working: number; // assemblers building right now
  stationsBusy: number; // gauntlet stations with work in them
  rejected: number; // items on the rework belt
  bottleneck?: { stage: string; wip: number; ageMs: number } | null;
}

export const BPM = 92;
export const EIGHTH = 60 / BPM / 2; // seconds per eighth note
export const STEPS_PER_BAR = 8;

const clamp = (x: number) => Math.max(0, Math.min(1, x));

// A saturating curve: the first few items matter most, a huge queue doesn't blow it past 1.
export function intensityFor(i: MusicInput): number {
  const load = i.moving * 0.16 + i.working * 0.14 + i.stationsBusy * 0.1;
  return clamp(1 - Math.exp(-load));
}

// Stages where a pile-up means real work is stuck. "resources" (nothing plugged in) is a setup
// state, not a crisis, so it only nudges.
const STUCK_STAGES = new Set(["build", "inspect", "pad", "release", "impact"]);
const HOUR = 3_600_000;

// Tension from the bottleneck alone: needs at least 2 waiting to register, ramps with wip and age.
export function bottleneckTension(b: MusicInput["bottleneck"]): number {
  if (!b || b.wip < 2) return 0;
  const weight = STUCK_STAGES.has(b.stage) ? 1 : 0.35;
  const pile = clamp((b.wip - 1) / 4); // 2 → 0.25, 5+ → 1
  const age = clamp(b.ageMs / (6 * HOUR)); // waiting 6h+ maxes it
  return clamp(weight * (pile * 0.7 + age * 0.3));
}

// A catch (verify bay, CI buzz, orbit alarm) spikes tension, which fades over about 20 seconds.
export const CATCH_FADE_MS = 20_000;
export function catchTension(msSinceCatch: number | null): number {
  if (msSinceCatch == null || msSinceCatch < 0 || msSinceCatch >= CATCH_FADE_MS) return 0;
  return 0.9 * (1 - msSinceCatch / CATCH_FADE_MS) ** 1.5;
}

export function tensionFor(i: MusicInput, msSinceCatch: number | null): number {
  const rework = clamp(i.rejected / 4) * 0.4;
  return clamp(Math.max(bottleneckTension(i.bottleneck), catchTension(msSinceCatch), rework));
}

// Ease the playing value toward the target once per bar, so layers swell in instead of flickering.
export function ease(current: number, target: number, rate = 0.35): number {
  const next = current + (target - current) * rate;
  return Math.abs(next - target) < 0.005 ? target : next;
}

// Thresholds a layer turns on at. It turns off a bit lower (hysteresis) so it doesn't chatter.
export const LAYER_ON: Record<Exclude<Layer, "pad" | "pulse">, number> = { bass: 0.15, arp: 0.4, drums: 0.62, snare: 0.82 };
const HYST = 0.08;

export function layersFor(intensity: number, tension: number, prev?: Layers): Layers {
  const on = (l: keyof typeof LAYER_ON) => intensity >= LAYER_ON[l] || (!!prev?.[l] && intensity >= LAYER_ON[l] - HYST);
  return {
    pad: true, // the bed always plays (quietly) while music is on
    bass: on("bass"),
    arp: on("arp"),
    drums: on("drums"),
    snare: on("snare"),
    pulse: tension >= 0.4 || (!!prev?.pulse && tension >= 0.32), // the heartbeat under a jam
  };
}

export function layerCount(l: Layers): number {
  return (["bass", "arp", "drums", "snare"] as const).filter((k) => l[k]).length;
}

// Chords as MIDI notes. Calm: I vi IV V in C. Tense: the relative minor walking down to E major,
// which leans hard back toward A minor, so it feels unresolved until something ships.
const C = [60, 64, 67];
const Am = [57, 60, 64];
const F = [53, 57, 60];
const G = [55, 59, 62];
const Dm = [50, 53, 57];
const E = [52, 56, 59];
export const CALM = [C, Am, F, G];
export const TENSE = [Am, F, Dm, E];
export const CADENCE = [G, C, C]; // what a launch plays: dominant, then home, held

// resolveBar: how many bars into a launch resolve we are (0, 1, 2), or null when not resolving.
export function chordFor(bar: number, tension: number, resolveBar: number | null): number[] {
  if (resolveBar != null && resolveBar < CADENCE.length) return CADENCE[resolveBar];
  const prog = tension >= 0.5 ? TENSE : CALM;
  return prog[((bar % prog.length) + prog.length) % prog.length];
}

export const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

// One bar of the arp: chord tones up then down, an octave up from the pad.
export function arpNotes(chord: number[]): number[] {
  const tones = [...chord, chord[0] + 12];
  return [0, 1, 2, 3, 2, 1, 0, 1].map((i) => tones[i] + 12);
}

// Low-pass cutoff for the pad: opens up as the floor gets busy, darkens under tension.
export function padCutoff(intensity: number, tension: number): number {
  return Math.round(500 + intensity * 1700 - tension * 300);
}

// Foundry score v2: arrangement decisions stay independent of the audio clock.
export type MusicState = "idle" | "working" | "blocked" | "launch";
export const BAR_SECONDS = EIGHTH * STEPS_PER_BAR;
export const FADE_SECONDS = 0.48;
export const MUSIC_BUDGET = { payloadBytes: 3_000_000, firstSetBytes: 600_000, decodedBytes: 40_000_000,
  actualPayloadBytes: 0, actualDecodedBytes: 0 } as const; // oscillator score; no stems

export function stateFor(intensity: number, tension: number, launch: boolean, previous: MusicState = "idle"): MusicState {
  if (launch) return "launch";
  if (tension >= 0.5 || (previous === "blocked" && tension >= 0.38)) return "blocked";
  return intensity >= (previous === "working" ? 0.1 : 0.15) ? "working" : "idle";
}

export interface Arrangement { rhythm: boolean; bass: boolean; counter: boolean; theme: boolean }
export function arrangementFor(intensity: number, previous?: Arrangement): Arrangement {
  const on = (key: keyof Arrangement, threshold: number) => intensity >= threshold || (!!previous?.[key] && intensity >= threshold - 0.08);
  return { rhythm: on("rhythm", 0.15), bass: on("bass", 0.28), counter: on("counter", 0.46), theme: on("theme", 0.65) };
}

export function nextBarTime(time: number, origin = 0): number {
  return origin + Math.ceil(Math.max(0, time - origin) / BAR_SECONDS - 1e-9) * BAR_SECONDS;
}

export function crossfadeGains(progress: number): [number, number] {
  const angle = clamp(progress) * Math.PI / 2;
  return [Math.cos(angle), Math.sin(angle)];
}
