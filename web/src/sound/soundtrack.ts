// Justin's soundtrack picks from the soundboard (2026-10-28, https://claude.ai/artifact/EdGMjvx9LP9xTfzNv9Cwe3).
// Seven composed tracks, one per moment of the game, each with the knob settings he dialed in. All original,
// all made from code: this file is the score (pure, unit tested in web/test/soundtrack.test.ts) and
// soundtrackPlayer.ts plays it with Web Audio. No samples, nothing to license.
//
//   which track: roleFor() picks the moment (launch > orbit/mines close-up > first run > stuck > working > idle)
//                and nextRole() holds a track for a while so the music never flips back and forth.
//   the knobs:   intensity turns layers on (LAYERS), tension adds the pressure layer, brightness is a low-pass,
//                space is the reverb send, volume is the track's level, tempo scales its bpm.

import type { MusicState } from "./music";

export type TrackId = "lullaby" | "nightshift" | "waltz" | "pressure" | "liftoff" | "aether" | "deepshaft";
export type Role = "idle" | "working" | "stuck" | "launch" | "orbit" | "mine" | "title";
export type LayerId = "pad" | "melody" | "steam" | "bass" | "rhythm" | "counter" | "pressure";
export type Inst =
  | "harmonium" | "pad" | "bowed" | "spic" | "brass" | "pluck" | "harp" | "musicbox" | "celesta" | "bell" | "choir" | "glass"
  | "accordion" | "sub" | "kick" | "piston" | "clank" | "hat" | "hatO" | "anvil" | "tick" | "timp" | "heart" | "steam" | "chain"
  | "drip" | "sonar" | "pick";
export interface Knobs { tempo: number; intensity: number; tension: number; brightness: number; space: number; volume: number }

// Exactly what Justin saved for each moment.
export const PICKS: Record<Role, { track: TrackId; knobs: Knobs }> = {
  idle: { track: "lullaby", knobs: { tempo: 100, intensity: 15, tension: 0, brightness: 20, space: 45, volume: 80 } },
  working: { track: "nightshift", knobs: { tempo: 100, intensity: 80, tension: 0, brightness: 40, space: 30, volume: 80 } },
  stuck: { track: "pressure", knobs: { tempo: 100, intensity: 80, tension: 38, brightness: 25, space: 50, volume: 80 } },
  launch: { track: "liftoff", knobs: { tempo: 100, intensity: 85, tension: 0, brightness: 25, space: 35, volume: 80 } },
  orbit: { track: "aether", knobs: { tempo: 100, intensity: 70, tension: 0, brightness: 30, space: 70, volume: 80 } },
  mine: { track: "deepshaft", knobs: { tempo: 100, intensity: 70, tension: 0, brightness: 20, space: 60, volume: 80 } },
  title: { track: "waltz", knobs: { tempo: 100, intensity: 75, tension: 0, brightness: 25, space: 35, volume: 80 } },
};

// A layer plays once intensity reaches its threshold. Pressure is separate: its level is the tension knob.
export const LAYERS: [LayerId, number][] = [["pad", 0], ["melody", 0.1], ["steam", 0.2], ["bass", 0.3], ["rhythm", 0.45], ["counter", 0.7]];
export function layersFor(intensity: number, low = false): Record<LayerId, boolean> {
  const on = Object.fromEntries(LAYERS.map(([id, th]) => [id, intensity / 100 >= th])) as Record<LayerId, boolean>;
  if (low) on.counter = on.steam = false; // ?quality=2: fewer voices
  on.pressure = true;
  return on;
}

export const brightnessHz = (k: Knobs) => 400 * 2 ** ((k.brightness / 100) * 5.2) * (k.tension >= 50 ? 0.7 : 1);
export const reverbSend = (k: Knobs) => (k.space / 100) * 0.7;

// ---------- which track plays ----------

export interface RoleInput { state: MusicState; focus: "orbit" | "mine" | null; firstRun: boolean; launching: boolean }
export function roleFor(i: RoleInput): Role {
  if (i.launching) return "launch";
  if (i.focus) return i.focus;
  if (i.firstRun) return "title";
  if (i.state === "blocked") return "stuck";
  return i.state === "working" ? "working" : "idle";
}

// Calm rule: a track plays at least this many bars before the floor's mood can change it. Your own moves
// (zooming in on the orbit watch or the mines, zooming back out, a launch) switch on the next bar.
export const MIN_HOLD_BARS = 8;
const YOURS = new Set<Role>(["launch", "orbit", "mine"]);
export function nextRole(current: Role | null, wanted: Role, barsHeld: number): Role {
  if (!current || current === wanted) return wanted;
  if (YOURS.has(wanted) || YOURS.has(current)) return wanted;
  return barsHeld >= MIN_HOLD_BARS ? wanted : current;
}

// ---------- the score ----------

export interface Bar { i: number; dark: boolean; on(layer: LayerId): boolean; n(layer: LayerId, inst: Inst, midi: number, step: number, len: number, vel: number): void }
export interface Track { id: TrackId; name: string; mood: string; bpm: number; meter: number; sub: number; key: string; root: number; dark: number[]; echo: number; knobs: Partial<Knobs>; bar(B: Bar): void }

function slots(B: Bar, layer: LayerId, inst: Inst, arr: number[], vel: number, tr = 0, cap = 8) {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] < 0) continue;
    let j = i + 1; while (j < arr.length && arr[j] < 0) j++;
    B.n(layer, inst, arr[i] + tr, i, Math.min(cap, j - i), vel);
  }
}
const evs = (B: Bar, layer: LayerId, inst: Inst, list: number[][], vel = 0.7, tr = 0) => list.forEach(([s, m, l, v]) => B.n(layer, inst, m + tr, s, l, v ?? vel));

const LUL = { CH: [{ pad: [50,57,60,64], bass: 38, ctr: [53,57] }, { pad: [50,55,59,62], bass: 43, ctr: [55,59] }, { pad: [46,53,57,62], bass: 34, ctr: [53,58] }, { pad: [48,55,60,64], bass: 36, ctr: [55,52] }],
  MEL: [[74,-1,-1,72,69,-1,-1,-1],[67,-1,69,-1,72,-1,-1,-1],[74,-1,-1,77,76,-1,74,-1],[71,-1,-1,-1,-1,-1,-1,-1],[70,-1,-1,69,65,-1,-1,-1],[62,-1,65,-1,69,-1,-1,-1],[72,-1,-1,74,76,-1,79,-1],[76,-1,-1,-1,74,-1,-1,-1]] };

const NS = { CH: [{ r: 45, th: 3, pad: [57,60,64] }, { r: 41, th: 4, pad: [57,60,65] }, { r: 48, th: 4, pad: [55,60,64] }, { r: 43, th: 4, pad: [55,59,62] }, { r: 45, th: 3, pad: [57,60,64] }, { r: 41, th: 4, pad: [57,60,65] }, { r: 43, th: 4, pad: [55,59,62] }, { r: 40, th: 4, pad: [56,59,64] }],
  OST: [0,2,1,2, 0,2,1,3, 0,2,1,2, 0,3,1,2],
  MEL: [[[0,69,4],[4,72,2],[6,71,2],[8,69,4],[12,64,4]], [[0,65,4],[4,69,2],[6,72,2],[8,74,6],[14,72,2]], [[0,72,4],[4,76,4],[8,74,2],[10,72,2],[12,67,4]], [[0,71,6],[6,74,2],[8,71,4],[12,67,4]],
        [[0,69,4],[4,72,2],[6,71,2],[8,69,4],[12,76,4]], [[0,77,4],[4,76,2],[6,74,2],[8,72,6],[14,74,2]], [[0,74,4],[4,71,4],[8,67,2],[10,71,2],[12,74,4]], [[0,68,8],[8,71,4],[12,74,2],[14,76,2]]] };

const WZ = { CH: ["F","F","C7","C7","F","F","Bb","Bb","F","Dm","Gm","C7","F","C7","F","F"],
  V: <Record<string, { r: number; ch: number[] }>>{ F: { r: 41, ch: [57,60,65] }, C7: { r: 36, ch: [55,58,64] }, Bb: { r: 34, ch: [58,62,65] }, Dm: { r: 38, ch: [57,62,65] }, Gm: { r: 43, ch: [58,62,67] } },
  MEL: [[72,-1,77,-1,76,74],[72,-1,69,-1,-1,-1],[70,-1,76,-1,74,72],[70,-1,67,-1,-1,-1],[69,-1,72,-1,77,-1],[81,-1,-1,79,77,-1],[74,-1,77,-1,74,70],[74,-1,-1,-1,72,-1],[72,-1,69,-1,72,-1],[74,-1,77,-1,74,-1],[79,-1,77,-1,74,70],[72,-1,76,-1,79,-1],[77,-1,76,77,79,77],[76,-1,72,-1,70,67],[65,-1,-1,-1,-1,-1],[-1,-1,72,-1,74,76]],
  CTR: [57,57,58,58,60,60,62,62,60,62,62,64,65,64,60,60] };

const PR = { CH: [{ r: 36, ch: [48,51,55] }, { r: 32, ch: [48,51,56] }, { r: 36, ch: [48,51,55] }, { r: 37, ch: [49,53,56] }],
  MEL: [[[0,79,16]], [[0,80,12],[12,79,4]], [[0,79,8],[8,78,8]], [[0,77,16]], [[0,84,16]], [[0,85,8],[8,84,8]], [[0,83,12],[12,84,4]], [[0,80,16]]] };

const LO = { CH: [{ r: 48, ch: [60,64,67] }, { r: 43, ch: [59,62,67] }, { r: 45, ch: [60,64,69] }, { r: 41, ch: [60,65,69] }, { r: 48, ch: [60,64,67] }, { r: 43, ch: [59,62,67] }, { r: 41, ch: [60,65,69] }, { r: 43, ch: [59,62,67] }],
  MEL: [[[0,67,2],[2,72,2],[4,76,4],[8,79,6],[14,76,2]], [[0,74,4],[4,71,2],[6,74,2],[8,79,8]], [[0,76,2],[2,77,2],[4,79,4],[8,81,4],[12,79,4]], [[0,77,4],[4,76,4],[8,74,4],[12,72,4]],
        [[0,67,2],[2,72,2],[4,76,4],[8,79,6],[14,81,2]], [[0,83,4],[4,81,2],[6,79,2],[8,74,8]], [[0,77,4],[4,81,4],[8,84,8]], [[0,83,8],[8,79,4],[12,74,4]]] };

const AE = { CH: [{ r: 38, ch: [50,54,57,61] }, { r: 38, ch: [52,56,59,62] }, { r: 35, ch: [50,54,57,59] }, { r: 31, ch: [50,54,59,61] }],
  MEL: [[[0,81,12]], [[0,80,8],[8,78,8]], [[0,74,16]], [[0,76,8],[8,73,8]]] };

const DS = { CH: [{ r: 40, ch: [52,59] }, { r: 40, ch: [52,59] }, { r: 36, ch: [48,55] }, { r: 38, ch: [50,57] }],
  MEL: [[[0,64,4],[4,67,4],[8,69,6],[14,67,2]], [[0,64,8],[8,62,4],[12,59,4]], [[0,60,4],[4,64,4],[8,67,6],[14,69,2]], [[0,71,8],[8,69,4],[12,66,4]]],
  DROPS: [76,79,81,83,86,88] };

export const TRACKS: Track[] = [
  { id: "lullaby", name: "Iron Lullaby", mood: "Soft foundry hum. A slow music-box tune over a breathing harmonium, with steam and distant iron on top.",
    bpm: 70, meter: 4, sub: 2, key: "D dorian", root: 50, dark: [2, 9], echo: 3,
    knobs: { intensity: 45, brightness: 70, space: 45 },
    bar(B) {
      const ch = LUL.CH[Math.floor(B.i / 2) % 4], bi = B.i % 8;
      if (B.i % 2 === 0) ch.pad.forEach(m => B.n("pad", "harmonium", m, 0, 16, 0.55));
      B.n("bass", "pluck", ch.bass, 0, 6, 0.9); B.n("bass", "pluck", ch.bass + 7, 4, 4, 0.45);
      slots(B, "melody", "musicbox", LUL.MEL[bi], 0.6);
      B.n("rhythm", "piston", 0, 0, 1, 0.5); B.n("rhythm", "piston", 0, 4, 1, 0.32);
      [1,3,5,7].forEach(s => B.n("rhythm", "hat", 0, s, 1, 0.22));
      if (bi % 2 === 1) B.n("rhythm", "anvil", 86, 6, 4, 0.3);
      B.n("counter", "bowed", ch.ctr[B.i % 2], 0, 8, 0.4);
      if (B.i % 4 === 0) B.n("steam", "steam", 0, 2, 10, 0.6);
      if (B.i % 4 === 2) B.n("steam", "chain", 0, 5, 1, 0.35);
    } },
  { id: "nightshift", name: "Night Shift", mood: "The working groove. Plucked low strings pump like pistons, an anvil backbeat, and a horn tune you'll hum later.",
    bpm: 108, meter: 4, sub: 4, key: "A minor", root: 57, dark: [2], echo: 6,
    knobs: { intensity: 80, brightness: 75, space: 30 },
    bar(B) {
      const bi = B.i % 8, ch = NS.CH[bi], r = ch.r + 12, tones = [r, r + 7, r + 12, r + ch.th + 12];
      ch.pad.forEach(m => B.n("pad", "pad", m, 0, 16, 0.5));
      NS.OST.forEach((k, s) => B.n("bass", "pluck", tones[k], s, 1, s % 4 === 0 ? 0.95 : 0.6));
      B.n("bass", "sub", ch.r - 12, 0, 15, 0.55);
      [0, 7, 8].forEach(s => B.n("rhythm", "piston", 0, s, 1, s === 7 ? 0.45 : 0.8));
      [4, 12].forEach(s => B.n("rhythm", "clank", 0, s, 1, 0.6));
      for (let s = 0; s < 16; s++) if (s !== 14) B.n("rhythm", "hat", 0, s, 1, s % 2 ? 0.5 : 0.22);
      B.n("rhythm", "hatO", 0, 14, 1, 0.5);
      if (bi === 7) B.n("rhythm", "anvil", 81, 14, 2, 0.4);
      evs(B, "melody", "brass", NS.MEL[bi], 0.75);
      if (B.i % 2 === 1) [0, 2, 4, 6, 8, 10, 12, 14].forEach((s, k) => B.n("counter", "celesta", ch.pad[k % 3] + 12 + (k > 3 ? 12 : 0), s, 2, 0.5));
      if (B.i % 4 === 0) B.n("steam", "steam", 0, 0, 12, 0.6);
      if (B.i % 4 === 2) B.n("steam", "chain", 0, 8, 1, 0.45);
    } },
  { id: "waltz", name: "Boiler Waltz", mood: "Playful 3/4 for the first run and the repairs. Accordion oom-pah-pah, a music-box tune, a cello under it.",
    bpm: 138, meter: 3, sub: 2, key: "F major", root: 53, dark: [4, 9, 11], echo: 3,
    knobs: { intensity: 75, brightness: 70, space: 35 },
    bar(B) {
      const bi = B.i % 16, v = WZ.V[WZ.CH[bi]];
      B.n("bass", "pluck", v.r, 0, 2, 0.95);
      [2, 4].forEach(s => v.ch.forEach(m => B.n("pad", "accordion", m, s, 1.4, 0.55)));
      slots(B, "melody", "musicbox", WZ.MEL[bi], 0.65);
      slots(B, "melody", "glass", WZ.MEL[bi].map(m => m < 0 ? m : m - 12), 0.25);
      B.n("rhythm", "tick", 0, 0, 1, 0.7);
      [2, 4].forEach(s => B.n("rhythm", "hat", 0, s, 1, 0.45));
      if (bi % 4 === 3) B.n("rhythm", "anvil", 89, 4, 2, 0.22);
      B.n("counter", "bowed", WZ.CTR[bi] - 12, 0, 6, 0.45);
      if (bi % 8 === 0) B.n("steam", "steam", 0, 0, 5, 0.5);
      if (bi % 8 === 4) B.n("steam", "chain", 0, 3, 1, 0.3);
    } },
  { id: "pressure", name: "Pressure", mood: "For when the line is stuck. Clock ticks, a heartbeat, low brass leaning on you. Tense, never an alarm.",
    bpm: 84, meter: 4, sub: 4, key: "C minor", root: 48, dark: [2], echo: 3,
    knobs: { intensity: 80, brightness: 55, space: 50 },
    bar(B) {
      const bi = B.i % 8, ch = PR.CH[Math.floor(B.i / 2) % 4];
      if (B.i % 2 === 0) ch.ch.forEach(m => B.n("pad", "brass", m - 12, 0, 32, 0.6));
      for (let s = 0; s < 16; s += 2) B.n("bass", "spic", ch.r, s, 1, s % 4 ? 0.8 : 1.25);
      for (let s = 0; s < 16; s++) B.n("rhythm", "tick", 0, s, 1, s % 4 ? 0.18 : 0.42);
      B.n("rhythm", "heart", 0, 0, 1, 0.8); B.n("rhythm", "kick", 0, 10, 1, 0.35);
      evs(B, "melody", "bowed", PR.MEL[bi], 0.8);
      if (B.i % 2 === 1) { B.n("counter", "glass", 87, 4, 4, 0.35); B.n("counter", "glass", 86, 8, 8, 0.3); }
      if (B.i % 2 === 0) B.n("steam", "steam", 0, 8, 16, 0.55);
      if (B.i % 4 === 3) B.n("steam", "anvil", 62, 12, 4, 0.3);
    } },
  { id: "liftoff", name: "Liftoff", mood: "Celebration after a launch. Four-on-the-floor pistons, a brass fanfare, a choir lifting under it.",
    bpm: 132, meter: 4, sub: 4, key: "C major", root: 60, dark: [4, 9, 11], echo: 6,
    knobs: { intensity: 85, brightness: 85, space: 35 },
    bar(B) {
      const bi = B.i % 8, ch = LO.CH[bi];
      ch.ch.forEach(m => B.n("pad", "choir", m, 0, 16, 0.5));
      for (let s = 0; s < 16; s += 2) B.n("bass", "pluck", s % 4 ? ch.r : ch.r - 12, s, 2, 0.85);
      [0, 4, 8, 12].forEach(s => B.n("rhythm", "kick", 0, s, 1, 0.8));
      [4, 12].forEach(s => B.n("rhythm", "clank", 0, s, 1, 0.55));
      [2, 6, 10].forEach(s => B.n("rhythm", "hatO", 0, s, 1, 0.45));
      [1, 3, 5, 7, 9, 11, 13, 15].forEach(s => B.n("rhythm", "hat", 0, s, 1, 0.25));
      if (bi === 7) [12, 13, 14, 15].forEach((s, k) => B.n("rhythm", "timp", 43, s, 1, 0.4 + k * 0.12));
      if (bi % 4 === 0) B.n("rhythm", "anvil", 84, 0, 4, 0.35);
      evs(B, "melody", "brass", LO.MEL[bi], 0.85);
      [0, 6, 10].forEach(s => ch.ch.forEach(m => B.n("counter", "brass", m - 12, s, 1.5, 0.4)));
      if (bi === 0) B.n("steam", "steam", 0, 0, 16, 0.7);
      if (bi % 2 === 1) B.n("steam", "celesta", ch.ch[2] + 24, 14, 2, 0.5);
    } },
  { id: "aether", name: "Aether Drift", mood: "Orbit watch. Glassy arpeggios turning slowly, a sonar ping each bar, a quiet choir. Calm, a bit uncanny.",
    bpm: 76, meter: 4, sub: 4, key: "D lydian", root: 62, dark: [4, 8, 11], echo: 3,
    knobs: { intensity: 70, brightness: 75, space: 70 },
    bar(B) {
      const bi = B.i % 4, ch = AE.CH[bi];
      ch.ch.forEach(m => B.n("pad", "choir", m + 12, 0, 16, 0.32));
      ch.ch.forEach(m => B.n("pad", "pad", m, 0, 16, 0.35));
      B.n("bass", "sub", ch.r, 0, 16, 0.6);
      B.n("bass", "bowed", ch.r + 12, 0, 16, 0.25);
      const arp = [0, 1, 2, 3, 2, 1, 2, 3];
      arp.forEach((k, j) => B.n("counter", "celesta", ch.ch[k] + 24, j * 2, 2, j % 4 ? 0.4 : 0.6));
      evs(B, "melody", "glass", AE.MEL[bi], 0.7);
      B.n("rhythm", "sonar", 86, 0, 8, 0.6);
      B.n("rhythm", "tick", 0, 8, 1, 0.3); B.n("rhythm", "kick", 0, 0, 1, 0.3);
      if (B.i % 2 === 1) B.n("steam", "drip", 93, 6 + (B.i % 3) * 2, 1, 0.5);
    } },
  { id: "deepshaft", name: "Deep Shaft", mood: "Down in the mines. A work song: pick strikes as the beat, a low drone, water dripping in the dark.",
    bpm: 96, meter: 4, sub: 4, key: "E minor", root: 52, dark: [2], echo: 4,
    knobs: { intensity: 70, brightness: 60, space: 60 },
    bar(B) {
      const bi = B.i % 4, ch = DS.CH[bi];
      ch.ch.forEach(m => B.n("pad", "harmonium", m, 0, 16, 0.45));
      B.n("bass", "bowed", ch.r - 12, 0, 16, 0.55); B.n("bass", "pluck", ch.r, 0, 4, 0.9); B.n("bass", "pluck", ch.r, 10, 4, 0.6);
      [0, 6].forEach(s => B.n("rhythm", "pick", 0, s, 1, 0.75));
      [0, 8].forEach(s => B.n("rhythm", "kick", 0, s, 1, 0.55));
      B.n("rhythm", "chain", 0, 12, 1, 0.5);
      evs(B, "melody", "bowed", DS.MEL[bi], 0.6, 0);
      ch.ch.forEach(m => B.n("counter", "choir", m + 12, 0, 16, 0.25));
      [3, 11].forEach(s => B.n("steam", "drip", DS.DROPS[(B.i * 3 + s) % DS.DROPS.length], s, 1, 0.45));
    } },
];
export const trackById = (id: TrackId) => TRACKS.find((t) => t.id === id)!;
