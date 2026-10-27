import { describe, expect, test } from 'bun:test';
import type { FactoryState, Item, Machine, Station } from '@shiptorio/shared';
import { HOLD_TICKS, PICKS, tapFor } from '../src/sound/steamIron';
import { focusFor, moodOf } from '../src/sound/useFactorySound';

const item = (id: string, state: Item['state'], machineId?: string) => ({ id, state, title: id, machineId }) as unknown as Item;
const machine = (id: string, type: Machine['type'], state: Machine['state'] = 'idle') => ({ id, type, state }) as unknown as Machine;
const station = (id: string, kind: Station['kind'], wip = 0, machineId?: string) => ({ id, kind, wip, machineId }) as unknown as Station;
const factory = (o: Partial<FactoryState>) => ({ items: [], machines: [], stations: [], power: [], ...o }) as unknown as FactoryState;

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

describe('close-up mood', () => {
  test('an assembler with work is working, without work is idle', () => {
    const busy = factory({ machines: [machine('a1', 'assembler', 'working')] });
    expect(focusFor('m:a1', busy)?.mood).toBe('working');
    const quiet = factory({ machines: [machine('a1', 'assembler', 'idle')] });
    expect(focusFor('m:a1', quiet)?.mood).toBe('idle');
  });
  test('a blocked machine, the bottleneck station, or the card focus is stuck', () => {
    expect(focusFor('m:a1', factory({ machines: [machine('a1', 'assembler', 'blocked')] }))?.mood).toBe('stuck');
    const jam = factory({ stations: [station('ci-1', 'ci', 3)], bottleneck: { stage: 'inspect', wip: 3, ageMs: 0, stationId: 'ci-1' } as FactoryState['bottleneck'] });
    expect(focusFor('ci-1', jam)?.mood).toBe('stuck');
    const asked = factory({ machines: [machine('a1', 'assembler', 'working')], move: { id: 'mv', focus: 'a1' } as unknown as FactoryState['move'] });
    expect(focusFor('m:a1', asked)?.mood).toBe('stuck');
  });
  test('a rocket waiting on the pad is waiting on you', () => {
    const s = factory({ machines: [machine('pad', 'launch_pad')], items: [item('i', 'on_pad', 'pad')] });
    expect(focusFor('m:pad', s)?.mood).toBe('stuck');
  });
  test('work sent back from a station is rework, and the rework belt is rework while it holds anything', () => {
    const s = factory({ stations: [station('v-1', 'verify', 1, 'vm')], items: [item('i', 'rejected', 'vm')] });
    expect(focusFor('v-1', s)?.mood).toBe('rework');
    expect(moodOf({ kind: 'rework', key: 'rework', busy: 0.3 }, s)).toBe('rework');
    expect(moodOf({ kind: 'rework', key: 'rework', busy: 0 }, s)).toBe('idle');
  });
});
