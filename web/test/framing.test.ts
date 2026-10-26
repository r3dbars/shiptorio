import { expect, test } from 'bun:test';
import { lineFrame } from '../src/map/framing';
import { lessonFocus } from '../src/ui/tutorial';
import type { FactoryState } from '@shiptorio/shared';
test('frames both coordinates of a growing line and fits portrait width', () => {
  const machines = [{x:-6,y:0},{x:6,y:0},{x:6,y:6}];
  const portrait = lineFrame(machines, 390, 844, 40)!;
  expect(portrait.x).toBe(0); expect(portrait.z).toBeCloseTo(5.4);
  const horizontal = machines.map(m => (m.x-m.y)*1.8/Math.sqrt(2));
  const needed = Math.max(...horizontal)-Math.min(...horizontal)+6;
  expect(40 * portrait.zoom * ((390-32)/844)).toBeGreaterThanOrEqual(needed);
  expect(lineFrame([],390,844,40)).toBeNull();
  expect(lineFrame([{x:0,y:0}],390,844,40)!.zoom).toBeLessThan(1);
});
test('tour pins the actual district and inspection labels, and clears them afterward', () => {
  const state = { districts:[{name:'web'}], machines:[{id:'ci-machine',type:'inspector'},{id:'pad',type:'launch_pad'}], stations:[{id:'ci-station',machineId:'ci-machine',kind:'ci'},{id:'verify-station',kind:'verify'},{id:'review-station',kind:'review'}] } as unknown as FactoryState;
  expect(lessonFocus(state,'island')).toEqual(['d:web']);
  expect(lessonFocus(state,'inspect')).toEqual(['ci-station','verify-station','review-station']);
  expect(lessonFocus(state,'machines')).toEqual(['ci-station','m:pad']);
  expect(lessonFocus(state)).toEqual([]);
});
