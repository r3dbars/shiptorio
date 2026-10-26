// Dev-only model turntable (not in the build): one Item Lab model under the game's real
// camera, lights and pixel pass, for before/after art screenshots.
// /lab.html?item=pad&state=LAUNCH&t=1.2&zoom=1&spin=0&freeze=1
import * as THREE from "three";
import * as lab from "../map/itemlab";
import { buildDrone } from "../map/drone";
import { makeDistrict, makeIsland } from "../map/models";
import { PixelPass } from "../map/pixel";
import { applyLook, LOOK } from "../map/world";

THREE.ColorManagement.enabled = false;
const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);

const ITEMS: Record<string, () => lab.Built> = {
  pad: () => lab.buildLaunchPad(),
  assembler: () => lab.buildAssembler({ tier: num("tier", 0), variant: ["CLAUDE CODE", 0xd97757] }),
  splitter: () => lab.buildSplitter(),
  inspector: () => lab.buildInspector(),
  steam: () => lab.buildSteam({ variant: ["META API", 0x6fb2ff] }),
  geo: () => lab.buildGeo({ variant: ["3090 · LLAMA.CPP", 0x2b2f36, 0xf2a93b] }),
  turret: () => lab.buildTurret(),
  biter: () => lab.buildBiter({ variant: ["MEDIUM · ERROR", 0xff5e52, 1] }),
  battery: () => lab.buildBattery(),
  solar: () => lab.buildSolar({ variant: ["CLAUDE MAX", 0xd97757] }),
  belt: () => lab.buildBelt(),
  ore: () => lab.buildOre({ variant: ["ISSUES", 0x6fb2ff] }),
  verify: () => lab.buildVerify(),
  review: () => lab.buildReview(),
  gate: () => lab.buildGate(),
  rework: () => lab.buildRework(),
  orbit: () => lab.buildOrbit(),
  check: () => lab.buildCheck(q.get("check") ?? "leftovers"),
  district: () => { const d = makeDistrict(num("w", 5.2), num("d", 3.6), num("n", 6), q.get("name") ?? "web"); return { g: d.group, update: (t: number) => d.update(t) } as unknown as lab.Built; },
  drone: () => { const d = buildDrone(); d.g.position.y = 1.5; return d as unknown as lab.Built; },
};

const canvas = document.getElementById("c") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
const scene = new THREE.Scene();
const sun = applyLook(scene); // map/world.ts: ?world=iron or classic, same as the game
sun.position.set(...LOOK.sun.offset);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.bias = -0.0015;
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 });
scene.add(sun, sun.target);
if (q.get("island") !== "0") scene.add(makeIsland(7, 7));

const name = q.get("item") ?? "pad";
const built = (ITEMS[name] ?? ITEMS.pad)();
scene.add(built.g);
const state = q.get("state") ?? "IDLE";

const zoom = num("zoom", 1), yaw = (num("yaw", 45) * Math.PI) / 180, tilt = Math.PI / 6;
const lookY = num("y", 1);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 200);
const px = num("px", LOOK.pixel);
const pass = new PixelPass();
function size() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  pass.setSize(w, h, px);
  const half = 4 * zoom, a = w / h;
  Object.assign(camera, { left: -half * a, right: half * a, top: half, bottom: -half });
  camera.updateProjectionMatrix();
}
let spin = 0;
function place() {
  const y = yaw + spin;
  camera.position.set(Math.sin(y) * Math.cos(tilt) * 30, lookY + Math.sin(tilt) * 30, Math.cos(y) * Math.cos(tilt) * 30);
  camera.lookAt(0, lookY, 0);
}
size();
addEventListener("resize", size);

// freeze=1 steps the model to time t and holds it there (for screenshots)
const T = num("t", 0), dt = 1 / 60;
let t = 0;
if (q.get("freeze") === "1") {
  while (t < T) { built.update(t, dt, state); lab.updateFx(dt); t += dt; }
  place();
  pass.render(renderer, scene, camera);
  (window as unknown as { ready: boolean }).ready = true;
} else {
  let last = performance.now();
  const loop = () => {
    const now = performance.now(), d = Math.min(0.05, (now - last) / 1000);
    last = now; t += d;
    spin += d * num("spin", 0);
    built.update(t, d, state); lab.updateFx(d);
    place();
    pass.render(renderer, scene, camera);
    requestAnimationFrame(loop);
  };
  loop();
}
