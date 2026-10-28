import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';

export const RISES_AFTER: Record<string, string> = { tunnel: 'build', build: 'checks', checks: 'launch' };
export type FloorEvent = { kind: 'build' | 'floor'; phase: string; id?: string; floor?: string; at: number };

// Later automatic builds may already have triggered a floor when a slow poller
// inspects this step. Only the interval before the next legitimate trigger is quiet.
export function floorStartsBeforeNextTrigger(events: readonly FloorEvent[], id: string) {
  const done = events.findIndex(e => e.kind === 'build' && e.id === id && e.phase === 'done');
  ok(done >= 0, `${id} completed before inspecting its floor interval`);
  const next = events.findIndex((e, i) => i > done && e.kind === 'build' && e.phase === 'done' && RISES_AFTER[e.id ?? '']);
  return events.slice(done + 1, next < 0 ? events.length : next).filter(e => e.kind === 'floor' && e.phase === 'start');
}

export function assertFloorChronology(events: readonly FloorEvent[]) {
  const actual = events.filter(e => e.kind === 'floor' && e.phase !== 'stand').map(({ floor, phase }) => ({ floor, phase }));
  const canonical = ['build', 'checks', 'launch'].flatMap(floor => ['start', 'done'].map(phase => ({ floor, phase })));
  deepStrictEqual(actual, canonical.slice(0, actual.length), 'floors start and finish once, bottom up, without overlap');
  let lastDone: string | undefined;
  for (const e of events) {
    if (e.kind === 'build' && e.phase === 'done') lastDone = e.id;
    if (e.kind === 'floor' && e.phase === 'start')
      strictEqual(e.floor, RISES_AFTER[lastDone ?? ''], `${e.floor} starts after its own triggering build`);
  }
}
