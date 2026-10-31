import { describe, expect, test } from 'bun:test';
import { HOLD_TICKS, PICKS, tapFor } from '../src/deck2d/sound/steamIron';

describe('machine taps (soundboard picks)', () => {
  test('each machine the shaft can fly in on has its own tap', () => {
    expect(tapFor('splitter', 'm:planner', 0)).toBe('tap_planner');
    expect(tapFor('assembler', 'm:asm-1', 1)).toBe('tap_assembler');
    for (const k of ['ci', 'verify', 'review'] as const) expect(tapFor(k, 'ci-1', 0)).toBe('tap_checks');
    expect(tapFor('merge', 'gate-1', 0)).toBe('tap_gate');
    expect(tapFor('orbit', 'orbit-1', 0)).toBe('tap_orbit');
    expect(tapFor('ore', 'm:ore-github', 0)).toBe('tap_mine');
    expect(tapFor('other', 'src:sentry', 0)).toBe('tap_mine');
  });
  test('the pad with a rocket standing on it is the rocket close-up', () => {
    expect(tapFor('pad', 'm:pad', 0)).toBe('tap_pad');
    expect(tapFor('pad', 'm:pad', 0.5)).toBe('tap_rocket');
  });
  test('things without a pick stay quiet (buttons still click)', () => {
    expect(tapFor('steam', 'power', 1)).toBeNull();
    expect(tapFor('rework', 'rework', 1)).toBeNull();
  });
  test('the picks are recorded with their soundboard take', () => {
    expect(PICKS.tap_mine).toBe('B Cart rumble');
    expect(PICKS.hold).toBe('B Countdown clank');
    expect(PICKS.merged).toBe("A Ship's bell");
    expect(HOLD_TICKS).toHaveLength(4);
  });
});
