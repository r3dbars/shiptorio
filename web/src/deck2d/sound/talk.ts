// Shippy's voice in the tutorial card, plus the card's page turn and the station spotlight. All tiny and soft: a robot
// murmur, not a chatterbox. Shippy never talks out loud; each word gets one quiet two-tone blip (a few per line at
// most), pitched from the word itself so the same line always "sounds" the same. Mute and volume follow the engine.
//
// Hooks for the tutorial (import from "../sound/talk" or "../sound"):
//   shippySays(text, seconds?)  call once when a line starts typing; spreads the blips over the line
//   talkBlip(char?)             or call per typed letter from your own typewriter; it keeps every 4th, 90ms apart
//   cardAdvance()               the card moves to its next line or page: a soft paper-and-brass tick
//   spotlight(stop?)            the light lands on a station: one quiet glass shimmer

import type { StopId } from "../contract";
import { sound } from "./engine";
import { out } from "./kit";

export const MAX_BLIPS = 6; // per line, however long it is
export const BLIP_GAP_S = 0.09; // never closer than this
const VOL = 0.03;

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
// a pentatonic-ish set around 560 Hz: soft, friendly, never shrill
const PITCHES = [494, 523, 587, 659, 698];
export const pitchFor = (word: string) => PITCHES[hash(word.toLowerCase()) % PITCHES.length];

/** When each blip of a line plays (seconds from the start) and at what pitch. Pure, so it's tested without audio. */
export function blipsFor(text: string, seconds = Math.max(0.6, text.length * 0.035)): { at: number; f: number }[] {
  const words = text.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}']/gu, "")).filter(Boolean);
  if (!words.length) return [];
  const n = Math.min(MAX_BLIPS, words.length);
  const step = Math.max(BLIP_GAP_S, (seconds * 0.85) / n);
  // pick n words evenly across the line so a long line still sounds like the whole sentence
  return Array.from({ length: n }, (_, i) => ({ at: +(i * step).toFixed(3), f: pitchFor(words[Math.floor((i * words.length) / n)]) }));
}

function blip(f: number, delay = 0) {
  if (!sound.canPlay) return;
  const o = out(), t = sound.now + delay;
  // a short triangle "bo" that tips up a little, then a fainter echo a fifth above: a tiny robot syllable
  sound.tone({ f, to: f * 1.12, dur: 0.06, type: "triangle", vol: VOL, at: t, attack: 0.006, out: o });
  sound.tone({ f: f * 1.5, dur: 0.04, type: "sine", vol: VOL * 0.4, at: t + 0.03, attack: 0.004, out: o });
}

let lineTimers: number[] = [];
/** Shippy starts a line. Replaces any line still murmuring, so two lines never talk over each other. */
export function shippySays(text: string, seconds?: number) {
  lineTimers.forEach((id) => window.clearTimeout(id));
  lineTimers = [];
  if (!sound.canPlay) return;
  for (const b of blipsFor(text, seconds)) {
    if (b.at === 0) blip(b.f);
    else lineTimers.push(window.setTimeout(() => blip(b.f), b.at * 1000));
  }
}

let letters = 0, lastBlip = -Infinity;
/** For a letter-by-letter typewriter: call per letter; spaces and punctuation stay silent. */
export function talkBlip(char = "a") {
  if (!/[\p{L}\p{N}]/u.test(char)) return;
  const now = performance.now();
  if (letters++ % 4 !== 0 || now - lastBlip < BLIP_GAP_S * 1000) return;
  lastBlip = now;
  blip(pitchFor(char));
}

/** The card turns to its next line: a soft tick and a tiny brass ping. */
export function cardAdvance() {
  if (!sound.canPlay) return;
  const o = out(), t = sound.now;
  letters = 0;
  sound.noise({ dur: 0.03, vol: 0.025, bp: 2400, at: t, out: o });
  sound.tone({ f: 1046, dur: 0.12, type: "sine", vol: 0.025, at: t + 0.01, out: o });
}

/** The spotlight lands on a station: one quiet glass shimmer, a bit lower toward the end of the line. */
export function spotlight(stop?: StopId) {
  if (!sound.canPlay) return;
  const o = out(), t = sound.now;
  const base = stop === "gate" || stop === "launch" ? 659 : 784;
  [1, 1.5, 2].forEach((r, i) => sound.tone({ f: base * r, dur: 0.5 - i * 0.1, type: "sine", vol: 0.022 / (i + 1), at: t + i * 0.05, attack: 0.02, out: o }));
}
