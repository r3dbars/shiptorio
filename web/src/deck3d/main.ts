// @ts-nocheck -- time-boxed spike, kept loose on purpose
// /deck3d.html: the Black Iron deck in real 3D, rendered as pixel art. Low-poly code geometry (scene.ts and friends)
// renders into a tiny target (~640 px on the long side); post.ts adds t3ssel8r-style outlines and snaps every pixel to
// the Black Iron 48 palette; the canvas is upscaled by a whole number with nearest-neighbor.
// Play: tap a machine to fly to it and run it, tap the sky to come back, drag to orbit, wheel/pinch to zoom.
// ?focus=<repo|planner|builder|checks|review|gate|rocket|shippy> opens on one.
import * as THREE from "three";
import { buildScene } from "./scene";
import { makePost } from "./post";

const canvas = document.getElementById("view") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(1);

const world = buildScene();
const camera = new THREE.PerspectiveCamera(20, 16 / 9, 4, 400);
const post = makePost();
const params = new URLSearchParams(location.search);

// --- low-res target sized so one art pixel = k device pixels (k a whole number) ---
let lowW = 480, lowH = 270, k = 2;
const LONG = new URLSearchParams(location.search).get("res") ? Number(new URLSearchParams(location.search).get("res")) : 640;
let pixels = true;
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const devW = Math.round(innerWidth * dpr), devH = Math.round(innerHeight * dpr);
  // portrait phones get a finer grid (short side ~400 px) so the machines still read
  k = pixels ? Math.max(2, Math.round(devW < devH ? devW / 400 : Math.max(devW, devH) / LONG)) : 1;
  lowW = Math.ceil(devW / k); lowH = Math.ceil(devH / k);
  renderer.setSize(lowW, lowH, false);
  canvas.style.width = `${(lowW * k) / dpr}px`;
  canvas.style.height = `${(lowH * k) / dpr}px`;
  post.setSize(lowW, lowH);
  camera.aspect = lowW / lowH;
  camera.updateProjectionMatrix();
  const r = restFor(camera.aspect);
  if (r.yaw !== REST.yaw) { Object.assign(REST, r); cam.yaw = r.yaw; cam.pitch = r.pitch; }
}
addEventListener("resize", resize);

// --- camera: fixed 3/4 view; drag orbits a little and springs home; tap flies to a machine ---
// landscape: straight-on 3/4 like the mockups; portrait: turn the deck so the line runs corner to corner
const restFor = (aspect) => (aspect < 0.85 ? { yaw: 0.95, pitch: 0.62 } : { yaw: 0, pitch: 0.4 });
const REST = { yaw: 0, pitch: 0.4, zoom: 1 };
const cam = { ...REST };
const B = world.bounds;
const WIDE = new THREE.Vector3((B.x0 + B.x1) / 2, -0.5, 0);
const target = WIDE.clone(), want = WIDE.clone();
let focused = null;
function focusOn(f) {
  focused = f ? f.key : null;
  want.copy(f ? f.focus : WIDE);
  REST.zoom = f ? f.zoom : 1;
}
const start = params.get("focus") && world.focusFor(params.get("focus"));
if (start) { focusOn(start); target.copy(want); cam.zoom = REST.zoom; }

let drag = null, down = null;
const pointers = new Map();
let pinch0 = 0, zoom0 = 1;
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) { drag = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch }; down = { x: e.clientX, y: e.clientY, t: performance.now() }; }
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = cam.zoom; drag = null; down = null; }
});
canvas.addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; cam.zoom = clamp(zoom0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch0, 0.8, 5); return; }
  if (!drag) return;
  cam.yaw = clamp(drag.yaw - (e.clientX - drag.x) * 0.004, REST.yaw - 0.7, REST.yaw + 0.7);
  cam.pitch = clamp(drag.pitch + (e.clientY - drag.y) * 0.003, 0.15, 1.1);
});
const up = (e) => {
  pointers.delete(e.pointerId);
  if (!pointers.size) {
    drag = null;
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8 && performance.now() - down.t < 500) tap(e.clientX, e.clientY);
    down = null;
  }
};
canvas.addEventListener("pointerup", up);
canvas.addEventListener("pointercancel", (e) => { down = null; up(e); });
canvas.addEventListener("wheel", (e) => { e.preventDefault(); cam.zoom = clamp(cam.zoom * Math.exp(-e.deltaY * 0.0015), 0.8, 5); wheelT = 1.5; }, { passive: false });
let wheelT = 0;
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function tap(x, y) {
  const r = canvas.getBoundingClientRect();
  const hit = world.pick(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
  if (!hit) { focusOn(null); return; }
  focusOn(hit);
  world.poke(hit.key);
}
addEventListener("keydown", (e) => { if (e.key === "Escape") focusOn(null); });

function placeCamera(dt) {
  const held = pointers.size > 0 || wheelT > 0;
  wheelT = Math.max(0, wheelT - dt);
  const s = 1 - Math.exp(-dt * 2.2);
  if (!held) { cam.yaw += (REST.yaw - cam.yaw) * s; cam.pitch += (REST.pitch - cam.pitch) * s; cam.zoom += (REST.zoom - cam.zoom) * s; }
  target.lerp(want, 1 - Math.exp(-dt * 2.5));
  // fit the whole deck, bridge and island on screen at this angle, then zoom in from there
  const dist = Math.max(5, fitDistance(cam.yaw, cam.pitch) / cam.zoom);
  aim(target, cam.yaw, cam.pitch, dist);
}
const BOUNDS = [B.x0, B.x1].flatMap((x) => [B.y0, B.y1].flatMap((y) => [B.z0, B.z1].map((z) => new THREE.Vector3(x, y, z))));
const v = new THREE.Vector3();
function aim(at, yaw, pitch, dist) {
  camera.position.set(at.x + Math.sin(yaw) * Math.cos(pitch) * dist, at.y + Math.sin(pitch) * dist, at.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  camera.lookAt(at);
  camera.updateMatrixWorld();
}
const fitCache = new Map();
function fitDistance(yaw, pitch) {
  const key = `${yaw.toFixed(3)}:${pitch.toFixed(3)}:${camera.aspect.toFixed(3)}`;
  if (fitCache.has(key)) return fitCache.get(key);
  let lo = 5, hi = 400;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    aim(WIDE, yaw, pitch, mid);
    const fits = BOUNDS.every((p) => { v.copy(p).project(camera); return Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.82; });
    if (fits) hi = mid; else lo = mid;
  }
  if (fitCache.size > 500) fitCache.clear();
  fitCache.set(key, hi);
  return hi;
}

resize();

// --- toggles so Justin can see what each step buys ---
function toggle(id, get, set) {
  const b = document.getElementById(id);
  b.addEventListener("click", () => { set(!get()); b.setAttribute("aria-pressed", String(get())); });
}
toggle("t-px", () => pixels, (v) => { pixels = v; resize(); });
toggle("t-pal", () => post.palette, (v) => (post.palette = v));
toggle("t-line", () => post.lines, (v) => (post.lines = v));

// --- loop ---
const clock = new THREE.Clock();
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  placeCamera(dt);
  world.step(reduce ? dt * 0.6 : dt);
  post.render(renderer, world.scene, camera, cam.yaw - REST.yaw, cam.pitch - REST.pitch);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// for screenshot scripts: jump the story clock
(window as any).__deck3d = { seek: (t: number) => world.seek(t), cam, focus: (k) => focusOn(k && world.focusFor(k)), poke: (k) => world.poke(k) };
