import { deepStrictEqual } from 'node:assert/strict';

export const BUILDOUT_STEPS = ['tunnel', 'boiler', 'builder', 'issue', 'planner', 'build', 'checks', 'launch'] as const;
const OPTIONAL = new Set(['issue', 'build']);
export type BuildEvent = { id: string; phase: 'start' | 'burst' | 'done' };

// A snapshot may already include the next automatic/logical step. Validate the
// whole event stream, including unfinished steps, rather than the poller's index.
export function assertBuildEventPrefix(events: readonly BuildEvent[]) {
  const participating = BUILDOUT_STEPS.filter(id => !OPTIONAL.has(id) || events.some(event => event.id === id));
  const canonical = participating.flatMap(id => ['start', 'burst', 'done'].map(phase => ({ id, phase })));
  deepStrictEqual(events.map(({ id, phase }) => ({ id, phase })), canonical.slice(0, events.length),
    'builds run once, in order, without overlapping phases');
}
