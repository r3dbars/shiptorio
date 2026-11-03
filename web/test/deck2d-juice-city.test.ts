import { expect, spyOn, test } from "bun:test";

import { cityEvents } from "../src/deck2d/city/timeline";
import { CITY_COPY, CITY_ISLANDS, CITY_TIMING, type CityIsland, type CityView, type CityZoom, type DeckEvent } from "../src/deck2d/contract";
import { CITY_CHORD_SEMITONES, CITY_TAP_SEMITONES, CITY_THUD_SEMITONES, cuesFor, DeckSound } from "../src/deck2d/juice/sounds";
import { MIN_GAP_MS, sound } from "../src/deck2d/sound/engine";
import { BUILD_RECIPE, play as playKit, recipeLength, recipePeak, voicesFor, type Cue as KitCue } from "../src/deck2d/sound/kit";
import { SteamKit } from "../src/deck2d/sound/steamIron";
import { REVEAL_SECONDS, revealAt } from "../src/deck2d/story/reveal";

// The city reveal's sounds (city/SPEC.md section 5): a quiet rising tick per runway lamp, one warm brass tap when an
// island lights, the shipped chord an octave down when all are lit, a soft thud per island on dim; a zoom step is
// silent. All of it under the music, and mute silences all of it.

const ZOOMS: CityZoom[] = ["station", "line", "city"];
const LAMPS = CITY_TIMING.lamps;
const lamp = (k: number, island: CityIsland = "errors"): DeckEvent => ({ type: "city-lamp", island, lamp: k, of: LAMPS });
/** Every event the city can send, once per island / lamp / zoom level. */
const everyCityEvent = (): DeckEvent[] => [
  ...CITY_ISLANDS.flatMap((island) => [...Array(LAMPS).keys()].map((k) => lamp(k, island))),
  ...CITY_ISLANDS.map((island): DeckEvent => ({ type: "city-lit", island })),
  { type: "city-all-lit" },
  ...CITY_ISLANDS.map((island): DeckEvent => ({ type: "city-dim", island })),
  ...ZOOMS.map((level): DeckEvent => ({ type: "city-zoom", level })),
];

/** A DeckSound on a fake clock that records every call the way the engine would get it. */
function deck() {
  let now = 0;
  const sfx: unknown[][] = [];
  const kit: unknown[][] = [];
  const d = new DeckSound((...a) => sfx.push(a), () => now, (...a) => kit.push(a));
  return { d, sfx, kit, at: (ms: number) => (now = ms) };
}

test("each city event is one cue: a tick, a brass tap, the shipped chord an octave down, a thud; a zoom step is silent", () => {
  expect(cuesFor(lamp(0))).toEqual([{ build: "city_tick", at: 0, semitones: 0 }]);
  expect(cuesFor({ type: "city-lit", island: "errors" })).toEqual([{ build: "city_tap", at: 0, semitones: 0 }]);
  expect(cuesFor({ type: "city-all-lit" })).toEqual([{ sfx: "shipped", at: 0, semitones: -12 }]);
  expect(cuesFor({ type: "city-dim", island: "marketing" })).toEqual([{ build: "city_thud", at: 0, semitones: 0 }]);
  expect(cuesFor({ type: "city-zoom", level: "city" })).toEqual([]);
});

test("every city beat is exactly one cue, except a zoom step, which is silent", () => {
  for (const e of everyCityEvent()) expect(cuesFor(e).length, JSON.stringify(e)).toBe(e.type === "city-zoom" ? 0 : 1);
});

test("runway ticks rise one semitone per lamp from 880 Hz", () => {
  const hz = [...Array(LAMPS).keys()].map((k) => {
    const [cue] = cuesFor(lamp(k));
    expect(cue).toMatchObject({ build: "city_tick", semitones: k });
    return voicesFor("city_tick", cue.semitones).find((v) => v.k === "tone");
  });
  expect(hz[0]).toMatchObject({ f: 880 });
  for (let k = 1; k < LAMPS; k++) expect((hz[k] as { f: number }).f / (hz[k - 1] as { f: number }).f).toBeCloseTo(2 ** (1 / 12), 9);
  expect((hz[LAMPS - 1] as { f: number }).f).toBeLessThan(1700); // the top lamp is still a tick, not a squeal
  // a lamp number that is out of range or not a number can't reach the speakers as a squeal or a NaN
  expect((cuesFor(lamp(40))[0] as { semitones: number }).semitones).toBe(LAMPS - 1);
  expect((cuesFor(lamp(-3))[0] as { semitones: number }).semitones).toBe(0);
  expect((cuesFor(lamp(Number.NaN))[0] as { semitones: number }).semitones).toBe(0);
});

test("a tick is under 40 ms, so ticks 60 ms apart stay separate", () => {
  expect(recipeLength(BUILD_RECIPE.city_tick)).toBeLessThanOrEqual(0.04);
  expect(recipeLength(BUILD_RECIPE.city_tick)).toBeLessThan(CITY_TIMING.lamp);
});

test("twelve ticks in 0.66 s all play: kit cues are held to neither the 90 ms same-sound gap nor the calm floor", () => {
  // the reason they are kit cues: sound.play() would drop every tick that follows another within MIN_GAP_MS
  expect(CITY_TIMING.lamp * 1000).toBeLessThan(MIN_GAP_MS);
  expect(CITY_TIMING.lamp * (LAMPS - 1)).toBeCloseTo(0.66, 9);
  const { d, sfx, kit, at } = deck();
  for (let k = 0; k < LAMPS; k++) {
    at(5000 + Math.round(k * CITY_TIMING.lamp * 1000));
    d.fire(lamp(k, "traffic"));
  }
  expect(kit).toEqual([...Array(LAMPS).keys()].map((k) => ["city_tick", 0, k]));
  expect(sfx).toEqual([]);
  // five runways back to back, and two lamps in the same frame, all still play
  const busy = deck();
  for (const [i, island] of CITY_ISLANDS.entries()) for (let k = 0; k < LAMPS; k++) { busy.at(i * 2200 + k * 60); busy.d.fire(lamp(k, island)); }
  busy.at(30_000);
  busy.d.fire(lamp(3));
  busy.d.fire(lamp(4));
  expect(busy.kit.length).toBe(CITY_ISLANDS.length * LAMPS + 2);
  expect(busy.sfx).toEqual([]);
});

test("the brass tap climbs the chord as the islands light: C E G C E", () => {
  const notes = CITY_ISLANDS.map((island) => (cuesFor({ type: "city-lit", island })[0] as { build: string; semitones: number }));
  expect(notes.every((n) => n.build === "city_tap")).toBe(true);
  expect(notes.map((n) => n.semitones)).toEqual([0, 4, 7, 12, 16]);
  expect(CITY_ISLANDS.map((island) => CITY_TAP_SEMITONES[island])).toEqual([0, 4, 7, 12, 16]);
  for (const n of notes) expect([0, 4, 7]).toContain(n.semitones % 12); // C, E or G: a note of the shipped chord
});

test("all lit rings the shipped chord an octave down, once", () => {
  expect(CITY_CHORD_SEMITONES).toBe(-12);
  const { d, sfx, kit } = deck();
  d.fire({ type: "city-all-lit" });
  expect(sfx).toEqual([["shipped", 0, -12]]);
  expect(kit).toEqual([]);
});

test("a thud per island on dim, a whole tone lower each as the lights go out, Marketing first", () => {
  const { d, kit, at } = deck();
  [...CITY_ISLANDS].reverse().forEach((island, j) => { at(j * 150); d.fire({ type: "city-dim", island }); });
  expect(kit).toEqual([["city_thud", 0, 0], ["city_thud", 0, -2], ["city_thud", 0, -4], ["city_thud", 0, -6], ["city_thud", 0, -8]]);
  expect(CITY_ISLANDS.map((island) => CITY_THUD_SEMITONES[island])).toEqual([-8, -6, -4, -2, 0]);
});

test("a zoom step is silent: the button's own click and the camera carry it", () => {
  for (const level of ZOOMS) expect(cuesFor({ type: "city-zoom", level })).toEqual([]);
});

test("older sounds are called exactly as before: no pitch argument", () => {
  const { d, sfx, kit } = deck();
  d.fire({ type: "approve", cardId: "c" });
  d.fire({ type: "build-stage", stop: "checks", stage: "check" });
  expect(sfx).toEqual([["card_go", 0]]);
  expect(kit).toEqual([["bell", 0]]);
});

test("under the music: the city's kit cues are no louder than bell_small, and every voice is well formed", () => {
  const ceiling = recipePeak(BUILD_RECIPE.bell_small);
  const city: KitCue[] = ["city_tick", "city_tap", "city_thud"];
  for (const cue of city) {
    expect(recipePeak(BUILD_RECIPE[cue]), cue).toBeLessThanOrEqual(ceiling);
    for (const v of BUILD_RECIPE[cue]) {
      expect(v.dur).toBeGreaterThan(0);
      expect(v.vol).toBeGreaterThan(0);
      expect(v.at).toBeGreaterThanOrEqual(0);
      expect(v.attack ?? 0).toBeLessThan(v.dur);
      if (v.k === "tone") expect(v.f).toBeGreaterThan(0);
    }
  }
  // the quiet ones are also short: nothing rings longer than the bell they sit under
  for (const cue of city) expect(recipeLength(BUILD_RECIPE[cue]), cue).toBeLessThan(recipeLength(BUILD_RECIPE.bell_small));
});

test("a cue can be lifted: tones move by semitones, noise keeps its colour", () => {
  expect(voicesFor("city_thud")).toBe(BUILD_RECIPE.city_thud); // no pitch, no copy
  expect(voicesFor("city_thud", Number.NaN)).toBe(BUILD_RECIPE.city_thud);
  const up = voicesFor("city_thud", 12);
  BUILD_RECIPE.city_thud.forEach((v, i) => {
    if (v.k === "tone") expect(up[i]).toMatchObject({ k: "tone", f: v.f * 2, to: (v.to ?? 0) * 2, dur: v.dur, vol: v.vol });
    else expect(up[i]).toEqual(v);
  });
  expect(voicesFor("city_tap", -12).map((v) => (v.k === "tone" ? v.f : 0))).toEqual(BUILD_RECIPE.city_tap.map((v) => (v.k === "tone" ? v.f / 2 : 0)));
});

// ---- the whole reveal: the story's timeline -> the city's events (+ the engine's zoom events) -> the deck's sound ----

/** Lamps on each bridge (Marketing has no bridge). The city's layout decides this for real; any 12 or fewer will do. */
const RUNWAYS: Record<CityIsland, number> = { errors: 12, traffic: 9, inbox: 7, customers: 12, marketing: 0 };

/** Plays the reveal frame by frame the way main.ts does and returns what the player hears, and when (seconds). */
function playReveal(reduced: boolean, fps: number) {
  let now = 0;
  const heard: { t: number; cue: string; semitones?: number }[] = [];
  const d = new DeckSound(
    (s, _at, semitones) => heard.push({ t: now / 1000, cue: s, semitones }),
    () => now,
    (c, _at, semitones) => heard.push({ t: now / 1000, cue: c, semitones }),
  );
  let before: CityView | undefined;
  let zoom: CityZoom = "station";
  const end = (reduced ? REVEAL_SECONDS.reduced : REVEAL_SECONDS.normal) + 1;
  for (let f = 0; f / fps <= end; f++) {
    now = (f / fps) * 1000;
    const { city } = revealAt(f / fps, reduced, CITY_COPY.repo);
    const level = city?.zoom ?? "station";
    if (level !== zoom) { zoom = level; d.fire({ type: "city-zoom", level }); } // the engine's job: the effective zoom changed
    for (const e of cityEvents(before, city, (island) => RUNWAYS[island])) d.fire(e);
    before = city;
  }
  return heard;
}

const T = CITY_TIMING;
const FIRST_ISLAND = T.rocket + T.move + T.line + T.move + T.city; // 7.9: Errors' turn begins
const TURN = T.move + T.light; // 2.2 s per island
const GROW = FIRST_ISLAND + CITY_ISLANDS.length * TURN + T.move; // 19.5: all lit
const DIM = GROW + T.grow; // 22.0: the islands step to dark
const RUNWAY_LAMPS = Object.values(RUNWAYS).reduce((a, b) => a + b, 0);

test("the whole reveal at 60 fps sounds as the brief says, in the spec's order and on the spec's clock", () => {
  const heard = playReveal(false, 60);
  const frame = 1.5 / 60;
  expect(heard.length).toBe(RUNWAY_LAMPS + CITY_ISLANDS.length + 1 + CITY_ISLANDS.length);
  // each island in turn: its runway ticks 60 ms apart, a semitone higher each, then one brass tap
  let n = 0;
  CITY_ISLANDS.forEach((island, i) => {
    const light = FIRST_ISLAND + i * TURN + T.move; // the light step begins
    for (let k = 0; k < RUNWAYS[island]; k++, n++) {
      expect(heard[n], `${island} lamp ${k}`).toMatchObject({ cue: "city_tick", semitones: k });
      expect(Math.abs(heard[n].t - (light + k * T.lamp)), `${island} lamp ${k} time`).toBeLessThan(frame);
    }
    expect(heard[n], `${island} tap`).toMatchObject({ cue: "city_tap", semitones: CITY_TAP_SEMITONES[island] });
    expect(Math.abs(heard[n].t - (light + T.lit)), `${island} tap time`).toBeLessThan(frame);
    n++;
  });
  // all lit: the shipped chord an octave down, once
  expect(heard[n]).toMatchObject({ cue: "shipped", semitones: CITY_CHORD_SEMITONES });
  expect(Math.abs(heard[n].t - GROW)).toBeLessThan(frame);
  n++;
  // the dim: a thud per island, 150 ms apart, Marketing first, each lower than the last
  [...CITY_ISLANDS].reverse().forEach((island, j, order) => {
    expect(heard[n + j], `${island} thud`).toMatchObject({ cue: "city_thud", semitones: CITY_THUD_SEMITONES[island] });
    expect(Math.abs(heard[n + j].t - (DIM + j * T.dimGap)), `${island} thud time`).toBeLessThan(frame);
    if (j) expect(CITY_THUD_SEMITONES[island]).toBeLessThan(CITY_THUD_SEMITONES[order[j - 1]]);
  });
  expect(n + CITY_ISLANDS.length).toBe(heard.length);
});

test("at 30 and 20 fps every tick, tap, thud and the chord still play", () => {
  for (const fps of [30, 20]) {
    const count = (cue: string) => playReveal(false, fps).filter((h) => h.cue === cue).length;
    expect(count("city_tick"), `${fps} fps ticks`).toBe(RUNWAY_LAMPS);
    expect(count("city_tap"), `${fps} fps taps`).toBe(CITY_ISLANDS.length);
    expect(count("city_thud"), `${fps} fps thuds`).toBe(CITY_ISLANDS.length);
    expect(count("shipped"), `${fps} fps chord`).toBe(1);
  }
});

test("the reveal with reduced motion is the chord when everything lights and one thud when it dims", () => {
  const heard = playReveal(true, 60);
  expect(heard.map((h) => h.cue)).toEqual(["shipped", "city_thud"]);
  const grow = T.rocket + T.line + T.city + 5 * T.reducedIsland; // 21.7: after the five caption cuts
  expect(Math.abs(heard[0].t - grow)).toBeLessThan(0.05);
  expect(Math.abs(heard[1].t - (grow + T.grow))).toBeLessThan(0.05);
});

// ---- the engine side: the real SteamKit and SoundEngine on a stand-in audio context ----

class Param {
  value = 0;
  peak = 0;
  private see(v: number) {
    this.peak = Math.max(this.peak, Math.abs(v));
    return this;
  }
  setValueAtTime(v: number) { return this.see(v); }
  linearRampToValueAtTime(v: number) { return this.see(v); }
  exponentialRampToValueAtTime(v: number) { return this.see(v); }
  setTargetAtTime(v: number) { return this.see(v); }
}
class Node {
  type = "";
  frequency = new Param();
  gain = new Param();
  detune = new Param();
  Q = new Param();
  onended: (() => void) | null = null;
  connect<T>(to: T): T { return to; }
  disconnect() {}
  start() {}
  stop() {}
}
function fakeContext() {
  const oscillators: Node[] = [];
  const gains: Node[] = [];
  // currentTime just past the end of the chord (2.78 s), so the kit's tidy-up timers fire almost at once
  const ctx = {
    currentTime: 2.9,
    state: "running",
    destination: new Node(),
    createOscillator: () => { const n = new Node(); oscillators.push(n); return n; },
    createGain: () => { const n = new Node(); gains.push(n); return n; },
    createBiquadFilter: () => new Node(),
    createBufferSource: () => new Node(),
  };
  return { ctx, oscillators, gains };
}

test("the chord is the shipped chord, every partial an octave down, at the same level", () => {
  const rung = (semitones: number) => {
    const { ctx, oscillators, gains } = fakeContext();
    new SteamKit(ctx as unknown as BaseAudioContext, {} as AudioBuffer, new Node() as unknown as AudioNode).play("merged", 0, undefined, semitones);
    // the bells' FM depth is a gain in Hz (hundreds), not a level: leave it out
    const level = Math.max(...gains.map((g) => g.gain.peak).filter((p) => p < 10));
    return { hz: oscillators.map((o) => o.frequency.value), level };
  };
  const plain = rung(0);
  const low = rung(CITY_CHORD_SEMITONES);
  expect(plain.hz.length).toBe(14); // three bells (carrier + modulator each) over four brass notes (saw + square each)
  expect(plain.hz[0]).toBe(784); // the shipped bell, untouched when nothing is lifted
  low.hz.forEach((f, i) => expect(f).toBeCloseTo(plain.hz[i] / 2, 9));
  expect(low.level).toBe(plain.level); // no louder than shipped
  expect(plain.level).toBeGreaterThan(0.1); // and it is the big moment: louder than any quiet cue
});

test("mute silences every city sound; unmuted they play, lifted", () => {
  const { ctx } = fakeContext();
  const priv = sound as unknown as Record<string, unknown>;
  const saved = { ctx: priv.ctx, master: priv.master, floor: priv.floor, near: priv.near, kit: priv.kit, steamBus: priv.steamBus, last: priv.last, settings: sound.settings };
  const g = globalThis as { window?: unknown };
  const hadWindow = "window" in g;
  const chord: unknown[][] = [];
  const tone = spyOn(sound, "tone").mockImplementation(() => {});
  const noise = spyOn(sound, "noise").mockImplementation(() => {});
  try {
    const floor = new Node();
    Object.assign(priv, {
      ctx, master: new Node(), floor, near: new Node(), steamBus: { ui: new Node(), floor, near: new Node() },
      kit: { play: (...a: unknown[]) => chord.push(a) }, last: new Map([["shipped", -1e9]]),
    });
    if (!hadWindow) g.window = new EventTarget(); // sound.play() tells the caption listeners first
    const everything = () => {
      playKit("city_tick", 0, 3);
      playKit("city_tap", 0, 7);
      playKit("city_thud", 0, -4);
      sound.play("shipped", 0, false, CITY_CHORD_SEMITONES);
    };
    sound.settings = { ...saved.settings, muted: true };
    everything();
    expect(tone).not.toHaveBeenCalled();
    expect(noise).not.toHaveBeenCalled();
    expect(chord).toEqual([]);
    sound.settings = { ...saved.settings, muted: false, volume: 0.5 };
    everything();
    expect(tone.mock.calls[0][0].f).toBeCloseTo(880 * 2 ** (3 / 12), 9); // lamp 3's tick
    expect(noise).toHaveBeenCalled();
    expect(chord).toEqual([["merged", ctx.currentTime, floor, CITY_CHORD_SEMITONES]]);
  } finally {
    tone.mockRestore();
    noise.mockRestore();
    Object.assign(priv, saved);
    if (!hadWindow) delete g.window;
  }
});
