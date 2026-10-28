import { expect, test } from "bun:test";
import * as THREE from "three";
import { Buildout } from "../src/map/shaft/buildout";
import type { Iron } from "../src/map/shaft/core";
import { makeLayout } from "../src/map/shaft/layout";

const hooks = { park() {}, light() {}, bake() {}, poke() {} };

test("a factory without hidden stations does not render warm-up extras", () => {
  const bo = new Buildout(hooks, true);
  let draws = 0;
  bo.precompile(() => draws++);
  expect(draws).toBe(0);
});

test("a failed precompile draw restores hidden holders and their culling flags", () => {
  const layout = makeLayout({ planner: { id: "planner" } });
  const root = new THREE.Group(), holder = new THREE.Group();
  const child = new THREE.Group();
  const alreadyUnculled = new THREE.Group();
  alreadyUnculled.frustumCulled = false;
  holder.add(child, alreadyUnculled); root.add(holder);
  const station = { id: "planner", holder, inst: { update() {} } };
  const iron = { stations: { planner: station }, stationList: [station] } as unknown as Iron;
  const bo = new Buildout(hooks, true);
  bo.attach(iron, root, layout);
  holder.visible = false;
  expect(() => bo.precompile(holders => {
    expect(holders).toEqual([holder]);
    expect(holder.visible).toBe(true);
    expect(child.frustumCulled).toBe(false);
    throw new Error("draw failed");
  })).toThrow("draw failed");
  expect(holder.visible).toBe(false);
  expect(holder.frustumCulled).toBe(true);
  expect(child.frustumCulled).toBe(true);
  expect(alreadyUnculled.frustumCulled).toBe(false);
});
