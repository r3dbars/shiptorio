import { afterEach, beforeEach, expect, test } from "bun:test";
import * as THREE from "three";
import { Buildout } from "../src/map/shaft/buildout";
import type { Iron } from "../src/map/shaft/core";
import { makeLayout } from "../src/map/shaft/layout";
import { BUILD_EVENT, type BuildDetail } from "../src/buildout/journey";
import type { FactoryState } from "@shiptorio/shared";

const saved = new Map<string, PropertyDescriptor | undefined>();
let events: BuildDetail[];
beforeEach(() => {
  for (const key of ["window", "document"]) saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  const target = new EventTarget(); events = [];
  target.addEventListener(BUILD_EVENT, e => events.push((e as CustomEvent<BuildDetail>).detail));
  Object.defineProperty(globalThis, "window", { configurable: true, value: target });
  // Canvas pixels are irrelevant to this real controller/Three resource test.
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }),
  } });
});
afterEach(() => {
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});
const empty = { items: [], sources: [], machines: [], power: [], metrics: { rockets: 0 } } as unknown as FactoryState;
function rig(reduced: boolean) {
  const root = new THREE.Group();
  const bo = new Buildout({ park() {}, light() {}, bake() {}, poke() {} }, reduced);
  bo.attach({ stations: {}, stationList: [] } as unknown as Iron, root, makeLayout({}));
  bo.afterBake(); bo.sync(empty);
  bo.sync({ ...empty, sources: [{ kind: "github", state: "connected" }] } as FactoryState);
  let t = 0;
  return { bo, step: (dt: number) => bo.tick(t += dt, dt), close: () => { bo.tick(t += 30, 30); bo.dispose(); } };
}

test("reduced construction keeps elapsed time across phase boundaries on one-second frames", () => {
  const r = rig(true);
  try {
    for (let i = 0; i < 4; i++) r.step(1);
    expect(events.map(e => e.phase)).toEqual(["start", "burst", "done"]);
    expect(r.bo.busy).toBe(false);
    r.step(1); expect(events).toHaveLength(3);
  } finally { r.close(); }
});

test("normal construction stays ordered and finishes at seven seconds despite phase overshoot", () => {
  const r = rig(false);
  try {
    for (let i = 0; i < 6; i++) r.step(1);
    expect(events.map(e => e.phase)).toEqual(["start", "burst"]);
    expect(r.bo.busy).toBe(true);
    r.step(1);
    expect(events.map(e => e.phase)).toEqual(["start", "burst", "done"]);
    expect(r.bo.busy).toBe(false);
    r.step(5); expect(events).toHaveLength(3);
  } finally { r.close(); }
});
