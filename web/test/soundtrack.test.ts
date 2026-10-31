import { describe, expect, test } from "bun:test";
import { layersFor, MIN_HOLD_BARS, nextRole, PICKS, roleFor, TRACKS, trackById, type Bar, type LayerId } from "../src/deck2d/sound/soundtrack";
import { musicFocus } from "../src/deck2d/sound/music";

describe("Justin's soundtrack picks", () => {
  test("each moment plays the track and knobs he saved (2026-10-28)", () => {
    const k = (intensity: number, tension: number, brightness: number, space: number) => ({ tempo: 100, intensity, tension, brightness, space, volume: 80 });
    expect(PICKS).toEqual({
      idle: { track: "lullaby", knobs: k(15, 0, 20, 45) },
      working: { track: "nightshift", knobs: k(80, 0, 40, 30) },
      stuck: { track: "pressure", knobs: k(80, 38, 25, 50) },
      launch: { track: "liftoff", knobs: k(85, 0, 25, 35) },
      orbit: { track: "aether", knobs: k(70, 0, 30, 70) },
      mine: { track: "deepshaft", knobs: k(70, 0, 20, 60) },
      title: { track: "waltz", knobs: k(75, 0, 25, 35) },
      city: { track: "skyline", knobs: { ...k(100, 0, 60, 60), volume: 85 } }, // the tour's islands (2026-10-30)
    });
    expect(Object.values(PICKS).map((p) => trackById(p.track).name)).toEqual(
      ["Iron Lullaby", "Night Shift", "Pressure", "Liftoff", "Aether Drift", "Deep Shaft", "Boiler Waltz", "Skyline"]);
  });

  test("intensity turns layers on like the soundboard did", () => {
    const on = (x: number) => Object.entries(layersFor(x)).filter(([id, v]) => v && id !== "pressure").map(([id]) => id);
    expect(on(15)).toEqual(["pad", "melody"]);
    expect(on(80)).toEqual(["pad", "melody", "steam", "bass", "rhythm", "counter"]);
    expect(layersFor(80, true).counter).toBe(false);
  });
});

describe("which track plays", () => {
  const base = { state: "idle" as const, focus: null, firstRun: false, launching: false };
  test("a launch beats everything, then your close-up, then the first run, then the floor's mood", () => {
    expect(roleFor({ ...base, launching: true, focus: "orbit", firstRun: true, state: "blocked" })).toBe("launch");
    expect(roleFor({ ...base, focus: "mine", firstRun: true })).toBe("mine");
    expect(roleFor({ ...base, firstRun: true, state: "blocked" })).toBe("title");
    expect(roleFor({ ...base, state: "blocked" })).toBe("stuck");
    expect(roleFor({ ...base, state: "working" })).toBe("working");
    expect(roleFor(base)).toBe("idle");
  });

  test("the floor's mood can't flip the track every bar", () => {
    expect(nextRole("working", "stuck", 2)).toBe("working");
    expect(nextRole("working", "stuck", MIN_HOLD_BARS)).toBe("stuck");
    expect(nextRole("idle", "orbit", 0)).toBe("orbit");
    expect(nextRole("orbit", "idle", 0)).toBe("idle");
    expect(nextRole("stuck", "launch", 1)).toBe("launch");
    expect(nextRole(null, "idle", 0)).toBe("idle");
    expect(nextRole("launch", "city", 1)).toBe("city"); // the tour's islands swell in on the next bar
    expect(roleFor({ state: "idle", focus: null, firstRun: false, launching: true, city: true })).toBe("city");
  });

  test("the orbit watch and the mines have their own tracks", () => {
    expect(musicFocus({ kind: "orbit", key: "s1", busy: 0 })).toBe("orbit");
    expect(musicFocus({ kind: "ore", key: "m:ore", busy: 0 })).toBe("mine");
    expect(musicFocus({ kind: "other", key: "src:github", busy: 0 })).toBe("mine");
    expect(musicFocus({ kind: "assembler", key: "m:a", busy: 1 })).toBeNull();
    expect(musicFocus(null)).toBeNull();
  });
});

describe("the score", () => {
  test("every picked track writes real notes on every layer it uses, inside its bar", () => {
    for (const tr of TRACKS) {
      const steps = tr.meter * tr.sub, used = new Set<LayerId>();
      let notes = 0;
      for (let i = 0; i < 16; i++) {
        const B: Bar = { i, dark: false, on: () => true, n: (layer, _inst, midi, at, len, vel) => {
          used.add(layer); notes++;
          expect(at).toBeGreaterThanOrEqual(0); expect(at).toBeLessThan(steps);
          expect(len).toBeGreaterThan(0); expect(vel).toBeGreaterThan(0);
          expect(Number.isFinite(midi)).toBe(true);
        } };
        tr.bar(B);
      }
      expect(notes).toBeGreaterThan(16 * 4);
      expect(used.has("pad") && used.has("melody") && used.has("bass")).toBe(true);
    }
  });
});
