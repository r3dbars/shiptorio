import { expect, test } from "bun:test";

import {
  BUILD_RECIPE,
  CONSTRUCT_FROM,
  CONSTRUCT_GAP_MS,
  CONSTRUCT_MAX,
  CONSTRUCT_TO,
  ROUTINE_CUES,
  ROUTINE_PEAK,
  burstCue,
  constructCues,
  payoffCues,
  recipePeak,
  reduce,
  type Cue,
  PAYOFF_AFTER,
} from "../src/sound/build";
import { BUILD_MS } from "../src/buildout/journey";

test("construct taps stay sparse: inside the construct window, spaced out, capped", () => {
  const cues = constructCues();
  expect(cues.length).toBeGreaterThan(0);
  expect(cues.length).toBeLessThanOrEqual(CONSTRUCT_MAX);
  for (const c of cues) {
    expect(c.at).toBeGreaterThanOrEqual(CONSTRUCT_FROM);
    expect(c.at).toBeLessThan(CONSTRUCT_TO);
  }
  for (let i = 1; i < cues.length; i++) expect((cues[i].at - cues[i - 1].at) * 1000).toBeGreaterThanOrEqual(CONSTRUCT_GAP_MS - 1);
  // the ratchets and rivets the soundboard picks asked for are both in there
  expect(cues.map((c) => c.cue)).toContain("ratchet");
  expect(cues.map((c) => c.cue)).toContain("rivet");
});

test("a short construct window still never machine-guns", () => {
  const cues = constructCues(0.5, 1.6);
  expect(cues.length).toBeLessThanOrEqual(2);
  expect(constructCues(0.5, 0.6)).toEqual([]);
});

test("routine taps are quiet; the burst and the payoff are the big moment", () => {
  for (const c of ROUTINE_CUES) expect(recipePeak(BUILD_RECIPE[c])).toBeLessThan(ROUTINE_PEAK);
  const loudestRoutine = Math.max(...ROUTINE_CUES.map((c) => recipePeak(BUILD_RECIPE[c])));
  expect(recipePeak(BUILD_RECIPE.crackle)).toBeGreaterThan(loudestRoutine);
  expect(recipePeak(BUILD_RECIPE.bell)).toBeGreaterThan(recipePeak(BUILD_RECIPE.bell_small));
  expect(recipePeak(BUILD_RECIPE.crackle)).toBeGreaterThan(recipePeak(BUILD_RECIPE.crackle_small));
  // nothing in a build is louder than a launch-sized moment
  for (const c of Object.keys(BUILD_RECIPE) as Cue[]) expect(recipePeak(BUILD_RECIPE[c])).toBeLessThan(1.2);
});

test("every voice is well formed", () => {
  for (const [cue, voices] of Object.entries(BUILD_RECIPE)) {
    expect(voices.length, cue).toBeGreaterThan(0);
    for (const v of voices) {
      expect(v.dur).toBeGreaterThan(0);
      expect(v.vol).toBeGreaterThan(0);
      expect(v.at).toBeGreaterThanOrEqual(0);
      if (v.k === "tone") expect(v.f).toBeGreaterThan(0);
    }
  }
});

test("first time a kind comes online is big; repeats are smaller", () => {
  expect(burstCue(true)).toBe("crackle");
  expect(burstCue(false)).toBe("crackle_small");
  expect(payoffCues(true).map((c) => c.cue)).toEqual(["thunk", "bell"]);
  expect(payoffCues(false).map((c) => c.cue)).toEqual(["thunk", "bell_small"]);
});

test("start, burst, done plays each part once", () => {
  let s = reduce(null, { id: "boiler", phase: "start" });
  expect(s.act).toEqual({ k: "start" });
  s = reduce(s.run, { id: "boiler", phase: "burst", first: true });
  expect(s.act).toEqual({ k: "burst", first: true });
  expect(reduce(s.run, { id: "boiler", phase: "burst" }).act).toEqual({ k: "ignore" });
  s = reduce(s.run, { id: "boiler", phase: "done", first: true });
  expect(s.act).toEqual({ k: "ignore" }); // the payoff already rode in with the burst
  expect(s.run).toBeNull();
});

test("a build that never sent a burst still gets the full payoff", () => {
  const started = reduce(null, { id: "tunnel", phase: "start" }).run;
  expect(reduce(started, { id: "tunnel", phase: "done", first: false }).act).toEqual({ k: "catchup", first: false });
  expect(reduce(null, { id: "pad", phase: "done" }).act).toEqual({ k: "catchup", first: true });
});

test("the payoff lands when the plate stamps", () => {
  expect(PAYOFF_AFTER).toBeCloseTo((BUILD_MS.burst - BUILD_MS.construct) / 1000);
  expect(CONSTRUCT_FROM).toBe(BUILD_MS.chalk / 1000);
  expect(CONSTRUCT_TO).toBe(BUILD_MS.construct / 1000);
});
