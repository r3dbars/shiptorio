import { describe, expect, test } from 'bun:test';
import type { FactoryState, Item, ItemState, Machine } from '@shiptorio/shared';
import {
  ACCENT_BUDGET, ACCENT_GAP_MS, ACCENT_RECIPE, ACCENT_WINDOW_MS, accentsFor, floorOf, freshAccentMemory,
  LAUNCH_IRON_DELAY_S, limitAccents, recipePeak, type Accent, type AccentMemory,
} from '../src/deck2d/sound/accents';

const item = (id: string, state: ItemState) => ({ id, state, title: id }) as unknown as Item;
const machine = (id: string, state: Machine['state']) => ({ id, state, type: 'assembler' }) as unknown as Machine;
const factory = (items: Item[], machines: Machine[] = []) => ({ items, machines }) as unknown as FactoryState;
const step = (from: ItemState, to: ItemState) => accentsFor(factory([item('a', from)]), factory([item('a', to)]));

describe('event to accent', () => {
  test('floors follow the shaft: mine, build, checks, launch', () => {
    expect(['ore', 'queued'].map((s) => floorOf(s as ItemState))).toEqual(['mine', 'mine']);
    expect(floorOf('working')).toBe('build');
    expect(floorOf('inspecting')).toBe('checks');
    expect(floorOf('rejected')).toBe('checks');
    expect(floorOf('passed')).toBe('launch');
  });
  test('a build starting hisses, and lifting onto the build floor clanks', () => {
    expect(step('queued', 'working')).toEqual(['steam_hiss', 'iron_clank']);
  });
  test('a rework build hisses but does not clank: it went down, not up', () => {
    expect(step('rejected', 'working')).toEqual(['steam_hiss']);
  });
  test('reaching checks or the launch floor clanks', () => {
    expect(step('working', 'inspecting')).toEqual(['iron_clank']);
    expect(step('inspecting', 'passed')).toEqual(['iron_clank']);
  });
  test('moves within a floor are silent', () => {
    expect(step('ore', 'queued')).toEqual([]);
    expect(step('inspecting', 'rejected')).toEqual([]);
    expect(step('passed', 'on_pad')).toEqual([]);
  });
  test('the launch accent waits for the launched state, never earlier', () => {
    expect(step('on_pad', 'launched')).toEqual(['launch_iron']);
    for (const s of ['ore', 'queued', 'working', 'inspecting', 'passed', 'on_pad'] as ItemState[]) {
      expect(step('passed', s)).not.toContain('launch_iron');
    }
  });
  test('new items and unchanged items make no accent', () => {
    expect(accentsFor(factory([]), factory([item('n', 'ore'), item('m', 'working')]))).toEqual([]);
    expect(accentsFor(factory([item('a', 'working')]), factory([item('a', 'working')]))).toEqual([]);
  });
  test('a machine spinning up hisses', () => {
    expect(accentsFor(factory([], [machine('m', 'idle')]), factory([], [machine('m', 'working')]))).toEqual(['steam_hiss']);
    expect(accentsFor(factory([], [machine('m', 'working')]), factory([], [machine('m', 'idle')]))).toEqual([]);
  });
  test('a crowded tick still gives one of each at most', () => {
    const prev = factory(['a', 'b', 'c', 'd'].map((id) => item(id, 'queued')), [machine('m', 'idle')]);
    const next = factory(['a', 'b', 'c', 'd'].map((id) => item(id, 'working')), [machine('m', 'working')]);
    expect(accentsFor(prev, next)).toEqual(['steam_hiss', 'iron_clank']);
  });
});

describe('rate limit', () => {
  const run = (ticks: [number, Accent[]][]) => {
    let mem: AccentMemory = freshAccentMemory();
    return ticks.map(([t, want]) => {
      const r = limitAccents(want, t, mem);
      mem = r.mem;
      return r.play;
    });
  };
  test('the same accent waits out its gap', () => {
    const g = ACCENT_GAP_MS.iron_clank;
    expect(run([[0, ['iron_clank']], [g - 1, ['iron_clank']], [g, ['iron_clank']]])).toEqual([['iron_clank'], [], ['iron_clank']]);
  });
  test('duplicates in one tick play once', () => {
    expect(run([[0, ['steam_hiss', 'steam_hiss']]])).toEqual([['steam_hiss']]);
  });
  test('a busy factory stays under the shared budget', () => {
    // something wants both accents every 100ms for a minute
    const ticks: [number, Accent[]][] = Array.from({ length: 600 }, (_, i) => [i * 100, ['steam_hiss', 'iron_clank']]);
    const played = run(ticks).flatMap((p, i) => p.map(() => ticks[i][0]));
    for (const t of played) expect(played.filter((x) => x > t - ACCENT_WINDOW_MS && x <= t).length).toBeLessThanOrEqual(ACCENT_BUDGET);
    expect(played.length).toBeGreaterThan(30); // still alive, just not a drum roll
    expect(played.length).toBeLessThanOrEqual(Math.ceil(60_000 / ACCENT_WINDOW_MS) * ACCENT_BUDGET);
  });
  test('a launch is never eaten by the budget', () => {
    const play = run([[0, ['steam_hiss', 'iron_clank']], [700, ['iron_clank']], [1500, ['steam_hiss', 'iron_clank']], [1600, ['launch_iron']]]);
    expect(play.at(-1)).toEqual(['launch_iron']);
  });
  test('memory is not mutated', () => {
    const mem = freshAccentMemory();
    limitAccents(['iron_clank'], 0, mem);
    expect(mem).toEqual({ last: {}, recent: [] });
  });
});

describe('levels', () => {
  test('accents stay under the existing building thunk and far under the launch roar', () => {
    const place = 0.22 + 0.18; // engine.ts "place"
    expect(recipePeak(ACCENT_RECIPE.steam_hiss)).toBeLessThan(place / 3);
    expect(recipePeak(ACCENT_RECIPE.iron_clank)).toBeLessThan(place / 2);
    expect(recipePeak(ACCENT_RECIPE.launch_iron)).toBeLessThan(place);
  });
  test('accents are short', () => {
    for (const r of Object.values(ACCENT_RECIPE)) for (const v of r) expect(v.at + v.dur).toBeLessThanOrEqual(1.2);
  });
  test('the launch accent lands with the clamps, after the launched state and before ignition', () => {
    expect(LAUNCH_IRON_DELAY_S).toBeGreaterThan(0);
    expect(LAUNCH_IRON_DELAY_S).toBeLessThan(0.7); // SHIP_TIMING.ignitionMs
  });
});
