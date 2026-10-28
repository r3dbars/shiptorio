import { expect, test } from 'bun:test';
import { assertBuildEventPrefix, type BuildEvent } from './buildout-events';
const complete = (...ids: string[]): BuildEvent[] => ids.flatMap(id => (['start', 'burst', 'done'] as const).map(phase => ({ id, phase })));

// The frozen f5e desktop trace reached planner, but the snapshot already included
// the immediately completed logical build step. That is one ordered journey.
test('a captured prefix may include the next logical step or automatic start', () => {
  const observed = complete('tunnel', 'boiler', 'builder', 'issue', 'planner', 'build');
  expect(() => assertBuildEventPrefix(observed)).not.toThrow();
  expect(() => assertBuildEventPrefix([...observed, { id: 'checks', phase: 'start' }])).not.toThrow();
});

test('logical steps with no markers are optional, but physical steps are not', () => {
  expect(() => assertBuildEventPrefix(complete('tunnel', 'boiler', 'builder', 'planner', 'checks', 'launch'))).not.toThrow();
  expect(() => assertBuildEventPrefix(complete('tunnel', 'builder'))).toThrow();
});

test('rejects duplicate, missing, overlapping and out-of-order phases', () => {
  for (const broken of [
    [{ id: 'tunnel', phase: 'start' }, { id: 'tunnel', phase: 'start' }],
    [{ id: 'tunnel', phase: 'start' }, { id: 'tunnel', phase: 'done' }],
    [{ id: 'tunnel', phase: 'start' }, { id: 'boiler', phase: 'start' }],
    [...complete('tunnel'), ...complete('tunnel')],
    [...complete('tunnel', 'boiler'), ...complete('planner')],
  ] as BuildEvent[][]) expect(() => assertBuildEventPrefix(broken)).toThrow();
});
