import { beforeAll, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import type { FactoryState } from "@shiptorio/shared";
import { GameDriver } from "../src/map/shaft/driver";
import { RecoveryMaterials } from "../src/map/shaft/recoveryMaterials";
import type { Iron, IronItem } from "../src/map/shaft/core";
import type { Layout } from "../src/map/shaft/layout";
import type { Timelapse } from "../src/map/shaft/ShaftScene";

// Load the actual scene methods, without constructing WebGL. Vite's art glob is the only transformed
// expression; the lifecycle methods and real GameDriver are not mocked. All build output stays in memory.
let Scene: typeof import("../src/map/shaft/ShaftScene").ShaftScene;
beforeAll(async () => {
  const result = await Bun.build({
    entrypoints: [fileURLToPath(new URL("../src/map/shaft/ShaftScene.ts", import.meta.url))], target: "bun", write: false,
    plugins: [{ name: "scene-test-art-glob", setup(build) {
      build.onLoad({ filter: /ShaftScene\.ts$/ }, async ({ path }) => ({
        contents: (await Bun.file(path).text()).replace('import.meta.glob("./modules/*.js")', "({})"), loader: "ts",
      }));
    } }],
  });
  if (!result.success) throw new Error(result.logs.map(String).join("\n"));
  const descriptors = new Map(["window", "location"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const url = URL.createObjectURL(new Blob([await result.outputs[0].text()], { type: "text/javascript" }));
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    Object.defineProperty(globalThis, "location", { configurable: true, value: { search: "" } });
    Scene = (await import(url)).ShaftScene;
  } finally {
    URL.revokeObjectURL(url);
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

const state = {
  items: [{ id: "shipped", state: "launched", source: "github_issue", attempts: 1 },
    { id: "waiting", state: "on_pad", source: "github_issue", attempts: 1 }],
  machines: [], deck: [], power: [],
} as unknown as FactoryState;
const layout = { checks: [], assemblers: [], planner: { id: "planner" }, gate: { id: "gate" } } as unknown as Layout;
function iron() {
  const paths = Object.fromEntries(["to-lift", "to-gate"].map((name) => [name, { name, L: 1 }]));
  return {
    items: [] as IronItem[], paths, pathList: [], stations: {}, stationList: [], policy: { speed: 1 },
    on() {}, relabel() {},
    removeItem(item: IronItem) { this.items = this.items.filter((candidate) => candidate !== item); },
    put(src: string, path: string, s: number, kind: string, identity: object) {
      const item = { ...identity, src, path: paths[path], s, kind, owner: null } as IronItem;
      this.items.push(item); return item;
    },
  } as unknown as Iron;
}
const STOP = new Error("test stops after real carry, before GPU teardown/build");
function fixture() {
  const I = iron(), driver = new GameDriver(I, layout);
  driver.sync(state);
  let completions = 0, holding = true;
  const lapse: Timelapse = { refs: ["shipped"], onStart: () => {}, onShip: () => {}, onOver: () => { completions++; holding = false; } };
  const scene = Object.assign(Object.create(Scene.prototype), {
    I, driver, recovery: new RecoveryMaterials(), lapse: null, lapsing: false, stage: null, governor: { poke() {} }, setView() {},
    teardown() { throw STOP; },
  });
  let carried: ReturnType<GameDriver["carry"]> | undefined;
  const carry = driver.carry.bind(driver);
  driver.carry = () => (carried = carry());
  scene.timelapse(lapse);
  const staleCap = (driver as unknown as { lapse: { over: () => void } }).lapse.over;
  const rebuild = () => { try { scene.rebuild({}); } catch (error) { if (error !== STOP) throw error; } };
  return { I, driver, scene, staleCap, rebuild, carried: () => carried, completions: () => completions, holding: () => holding };
}

test("rebuilding during replay ends it before carry, restores the waiting line and releases the overlay once", () => {
  const f = fixture();
  expect(f.I.policy.speed).toBe(8);
  expect(f.I.items.map((item) => item.ref)).toEqual(["shipped"]);
  f.rebuild();
  expect(f.completions()).toBe(1);
  expect(f.holding()).toBe(false);
  expect(f.I.policy.speed).toBe(1);
  expect(f.carried()!.items.map((item) => item.ref)).toEqual(["waiting"]);
  const replacement = new GameDriver(iron(), layout);
  replacement.restore(f.carried()!, state);
  replacement.step(80); // the replacement needs no lost replay timer to release the player
  f.staleCap();
  f.rebuild();
  expect(f.completions()).toBe(1);
});

test("the normal replay cap also finishes once if a stale cap and a rebuild follow it", () => {
  const f = fixture();
  f.driver.step(80);
  expect(f.completions()).toBe(1);
  expect(f.holding()).toBe(false);
  expect(f.I.policy.speed).toBe(1);
  f.staleCap();
  f.rebuild();
  expect(f.completions()).toBe(1);
});
