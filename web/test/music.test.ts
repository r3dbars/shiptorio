import { describe, expect, test } from 'bun:test';
import {
  arpNotes, bottleneckTension, CADENCE, CALM, catchTension, CATCH_FADE_MS, chordFor, ease, intensityFor,
  layerCount, layersFor, padCutoff, STEPS_PER_BAR, TENSE, tensionFor, type MusicInput,
} from '../src/sound/music';
import { musicInput } from '../src/sound/useFactorySound';
import type { FactoryState } from '@shiptorio/shared';

const idle: MusicInput = { moving: 0, working: 0, stationsBusy: 0, rejected: 0, bottleneck: null };
const busy = (moving: number): MusicInput => ({ ...idle, moving, working: Math.ceil(moving / 3), stationsBusy: Math.min(5, Math.ceil(moving / 2)) });

describe('intensity', () => {
  test('idle floor is silent but for the pad', () => {
    expect(intensityFor(idle)).toBe(0);
    const l = layersFor(0, 0);
    expect(l.pad).toBe(true);
    expect(layerCount(l)).toBe(0);
  });
  test('more items moving means more layers, never fewer', () => {
    let last = -1;
    let lastLayers = 0;
    for (let n = 0; n <= 20; n++) {
      const i = intensityFor(busy(n));
      expect(i).toBeGreaterThanOrEqual(last);
      const layers = layerCount(layersFor(i, 0));
      expect(layers).toBeGreaterThanOrEqual(lastLayers);
      last = i;
      lastLayers = layers;
    }
    expect(layerCount(layersFor(intensityFor(busy(1)), 0))).toBeLessThanOrEqual(1);
    expect(layerCount(layersFor(intensityFor(busy(20)), 0))).toBe(4);
  });
  test('saturates below 1 instead of blowing up on a huge queue', () => {
    expect(intensityFor(busy(500))).toBeLessThanOrEqual(1);
    expect(intensityFor(busy(500))).toBeGreaterThan(0.99);
  });
  test('layers have hysteresis so they do not chatter at a threshold', () => {
    const on = layersFor(0.41, 0);
    expect(on.arp).toBe(true);
    expect(layersFor(0.36, 0, on).arp).toBe(true); // just under: stays on
    expect(layersFor(0.36, 0).arp).toBe(false); // from cold: stays off
    expect(layersFor(0.3, 0, on).arp).toBe(false);
  });
  test('ease approaches the target and lands on it', () => {
    let x = 0;
    for (let i = 0; i < 30; i++) x = ease(x, 1);
    expect(x).toBe(1);
    expect(ease(0, 1)).toBeCloseTo(0.35);
  });
});

describe('tension', () => {
  test('a single waiting item is not a jam', () => {
    expect(bottleneckTension({ stage: 'inspect', wip: 1, ageMs: 0 })).toBe(0);
  });
  test('a pile-up builds tension with wip and age', () => {
    const a = bottleneckTension({ stage: 'inspect', wip: 2, ageMs: 0 });
    const b = bottleneckTension({ stage: 'inspect', wip: 5, ageMs: 0 });
    const c = bottleneckTension({ stage: 'inspect', wip: 5, ageMs: 9 * 3_600_000 });
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBe(1);
  });
  test('"nothing plugged in" only nudges', () => {
    expect(bottleneckTension({ stage: 'resources', wip: 6, ageMs: 0 })).toBeLessThan(0.4);
  });
  test('a catch spikes tension and fades over 20s', () => {
    expect(catchTension(null)).toBe(0);
    expect(catchTension(0)).toBeCloseTo(0.9);
    expect(catchTension(CATCH_FADE_MS / 2)).toBeLessThan(0.9);
    expect(catchTension(CATCH_FADE_MS)).toBe(0);
    expect(layersFor(0, tensionFor(idle, 0)).pulse).toBe(true);
    expect(layersFor(0, tensionFor(idle, CATCH_FADE_MS)).pulse).toBe(false);
  });
  test('the rework belt filling up tenses things a bit', () => {
    expect(tensionFor({ ...idle, rejected: 4 }, null)).toBeCloseTo(0.4);
  });
  test('tension darkens the pad, busy opens it', () => {
    expect(padCutoff(1, 0)).toBeGreaterThan(padCutoff(0, 0));
    expect(padCutoff(0.5, 1)).toBeLessThan(padCutoff(0.5, 0));
  });
});

describe('harmony', () => {
  test('calm cycles I vi IV V, tense switches progressions', () => {
    expect(chordFor(0, 0, null)).toEqual(CALM[0]);
    expect(chordFor(5, 0, null)).toEqual(CALM[1]);
    expect(chordFor(3, 0.8, null)).toEqual(TENSE[3]);
  });
  test('a launch resolves V → I regardless of tension', () => {
    expect(chordFor(7, 1, 0)).toEqual(CADENCE[0]);
    expect(chordFor(7, 1, 1)).toEqual(CALM[0]); // home
  });
  test('arp fills a bar with chord tones', () => {
    for (const c of [...CALM, ...TENSE]) {
      const notes = arpNotes(c);
      expect(notes.length).toBe(STEPS_PER_BAR);
      for (const n of notes) expect(c.map((x) => x % 12)).toContain(n % 12);
    }
  });
});

describe('musicInput', () => {
  const state = {
    items: [{ state: 'working' }, { state: 'inspecting' }, { state: 'rejected' }, { state: 'launched' }],
    machines: [{ state: 'working' }, { state: 'idle' }],
    stations: [{ wip: 0 }, { wip: 3 }],
  } as unknown as FactoryState;
  test('reads the factory state', () => {
    expect(musicInput(state)).toEqual({ moving: 3, working: 1, stationsBusy: 1, rejected: 1, bottleneck: { stage: 'inspect', wip: 3, ageMs: 0 } });
  });
  test('prefers the real bottleneck when the engine has one', () => {
    const b = { stage: 'pad', wip: 2, ageMs: 5, throughputPerHour: 0, valueAtRisk: 0, summary: '' };
    expect(musicInput({ ...state, bottleneck: b } as FactoryState).bottleneck).toBe(b);
  });
});
