import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { emitBuild } from '../src/buildout/journey';
import { createIron, type Iron } from '../src/map/shaft/core';
import { defaultPlan, makeLayout } from '../src/map/shaft/layout';
import installGrowth, { FLOOR_EVENT } from '../src/map/shaft/modules/growth.js';

type TestIron = Iron & {
  world(fn: (kit: unknown, group: THREE.Group) => void): void;
  part(name: string, fn: () => { update(t: number, dt: number, renderElapsed?: number): void }, order: number): void;
};

test('the real growth controller uses elapsed floor time while the line keeps its physics step', () => {
  const originals = Object.fromEntries(['window', 'location', 'matchMedia'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const target = new EventTarget();
  Object.defineProperties(globalThis, {
    window: { value: target, configurable: true },
    location: { value: { search: '?artpass=1&buildout=1' }, configurable: true },
    matchMedia: { value: () => ({ matches: false }), configurable: true },
  });
  const events: { phase: string; floor?: string; floors?: string[] }[] = [];
  target.addEventListener(FLOOR_EVENT, e => events.push((e as CustomEvent).detail));
  const physics: number[] = [], observed: { dt: number; elapsed?: number }[] = [];
  const driver = { name: 'fixture', state: { items: [], power: [], machines: [], sources: [], metrics: { rockets: 0 } }, step(dt: number) { physics.push(dt); } };
  const I = createIron({ driver }) as TestIron;
  const parts = new Map<string, THREE.Group>();
  try {
    I.world((_kit, group) => {
      for (const id of ['build', 'checks', 'launch']) {
        const floor = new THREE.Group(); floor.userData.floor = id;
        floor.add(new THREE.Mesh(new THREE.BoxGeometry(2, 0.4, 2), new THREE.MeshPhongMaterial()));
        group.add(floor); parts.set(id, floor);
      }
    });
    I.floorParts = id => parts.has(id) ? [parts.get(id)!] : [];
    installGrowth(I);
    I.part('non-growth observer', () => ({ update(_t, dt, elapsed) { observed.push({ dt, elapsed }); } }), 10);
    const layout = makeLayout(defaultPlan());
    layout.stations = []; layout.paths = []; layout.sources = [];
    const root = new THREE.Group();
    I.build(new THREE.Scene(), root, layout, { warm: false });
    I.step(0, 0.05);
    expect(events).toEqual([{ phase: 'stand', floors: ['mine'] }]);
    emitBuild({ id: 'tunnel', phase: 'burst' });
    expect(events).toHaveLength(1);
    emitBuild({ id: 'tunnel', phase: 'done' });
    expect(events.at(-1)).toEqual({ phase: 'start', floor: 'build' });
    for (let i = 1; i <= 7; i++) I.step(i * 0.05, 0.05, 0.75);
    expect(events.some(e => e.phase === 'done')).toBe(false); // 5.25 elapsed seconds
    I.step(0.4, 0.05, 0.75); // original six-second build, only eight sparse frames
    expect(events.at(-1)).toEqual({ phase: 'done', floor: 'build' });
    expect(root.getObjectByName('floorbuild:build')).toBeUndefined();
    expect(physics.every(dt => dt === 0.05)).toBe(true);
    expect(observed.every(sample => sample.dt === 0.05)).toBe(true);
    expect(observed.at(-1)?.elapsed).toBe(0.75);

    emitBuild({ id: 'build', phase: 'done' });
    I.step(0.45, 0.05, 0.75);
    emitBuild({ id: 'checks', phase: 'start' }); // the next real build needs its floor now
    I.step(0.5, 0.05, 0.75);
    I.step(0.55, 0.05, 0.75);
    expect(root.getObjectByName('floorbuild:checks')).toBeUndefined();
    expect(events.filter(e => e.phase === 'done' && e.floor === 'checks')).toHaveLength(1);

    emitBuild({ id: 'checks', phase: 'done' });
    for (let i = 0; i < 119; i++) I.step(0.6 + i * 0.05, 0.05); // legacy two-argument callers
    expect(events.some(e => e.phase === 'done' && e.floor === 'launch')).toBe(false);
    I.step(6.6, 0.1); // 6.05s: avoid floating-point rounding at precisely 6.0
    expect(observed.at(-1)).toEqual({ dt: 0.1, elapsed: 0.1 });
    expect(events.filter(e => e.floor)).toEqual([
      { phase: 'start', floor: 'build' }, { phase: 'done', floor: 'build' },
      { phase: 'start', floor: 'checks' }, { phase: 'done', floor: 'checks' },
      { phase: 'start', floor: 'launch' }, { phase: 'done', floor: 'launch' },
    ]);
    expect(root.children.some(o => o.name.startsWith('floorbuild:'))).toBe(false);
    I.policy.speed = 2;
    I.debug.advance(0.1, 0.05); // manual advancement keeps its prior policy scaling
    expect(observed.at(-1)).toEqual({ dt: 0.1, elapsed: 0.1 });
    I.step(7, 0.05, 0.75);
    expect(observed.at(-1)).toEqual({ dt: 0.1, elapsed: 0.75 });
    expect(physics.at(-1)).toBe(0.1);
    expect(events.filter(e => e.phase === 'done')).toHaveLength(3);
  } finally {
    I.dispose();
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
