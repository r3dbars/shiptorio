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
function rig(reduced: boolean, boiler = false) {
  const root = new THREE.Group();
  const bo = new Buildout({ park() {}, light() {}, bake() {}, poke() {} }, reduced);
  const holder = new THREE.Group(), material = new THREE.MeshBasicMaterial({ color: 0x997744 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), material); holder.add(mesh);
  const station = { id: "steam-spark", holder, inst: { update() {} } };
  if (boiler) root.add(holder);
  bo.attach({ stations: boiler ? { "steam-spark": station } : {}, stationList: boiler ? [station] : [] } as unknown as Iron,
    root, makeLayout(boiler ? { power: [{ id: "steam-spark", type: "steam" }] } : {}));
  const github = { ...empty, sources: [{ kind: "github", state: "connected" }] } as FactoryState;
  bo.afterBake(); bo.sync(boiler ? github : empty);
  bo.sync(boiler ? { ...github, power: [{ online: true }] } as FactoryState : github);
  let t = 0;
  return { bo, holder, mesh, material, step: (dt: number) => bo.tick(t += dt, dt), close: () => { bo.tick(t += 30, 30); bo.dispose(); mesh.geometry.dispose(); material.dispose(); } };
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

test("real holder construction restores materials and has one ordered burst on slow frames", () => {
  for (const reduced of [true, false]) {
    events.length = 0;
    const r = rig(reduced, true);
    try {
      for (let i = 0; i < (reduced ? 4 : 7); i++) r.step(1);
      expect(events).toEqual(["start", "burst", "done"].map(phase => ({ id: "boiler", phase, first: true })));
      expect(r.bo.busy).toBe(false);
      expect(r.mesh.material).toBe(r.material);
      expect(r.holder.visible).toBe(true);
      expect(r.holder.children).toEqual([r.mesh]);
    } finally { r.close(); }
  }
});

test("a large elapsed frame cannot spend its remainder on a newly queued build", () => {
  const r = rig(false);
  try {
    r.bo.sync({ ...empty, sources: [{ kind: "github", state: "connected" }], power: [{ online: true }] } as FactoryState);
    r.step(30);
    expect(events.map(e => [e.id, e.phase])).toEqual([["tunnel", "start"], ["tunnel", "burst"], ["tunnel", "done"], ["boiler", "start"]]);
    expect(r.bo.busy).toBe(true);
  } finally { r.close(); }
});

test("hurrying skips construction but preserves the complete burst and payoff", () => {
  const r = rig(false);
  try {
    r.step(1); r.bo.hurry(); r.step(1);
    expect(events.map(e => e.phase)).toEqual(["start", "burst"]);
    r.step(1); expect(r.bo.busy).toBe(true);
    r.step(0.5); expect(events.map(e => e.phase)).toEqual(["start", "burst", "done"]);
  } finally { r.close(); }
});
