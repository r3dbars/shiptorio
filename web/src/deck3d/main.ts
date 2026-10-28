// @ts-nocheck -- time-boxed spike, kept loose on purpose
// /deck3d.html: can real 3D read as the Black Iron pixel deck? One deck section, two stations, a belt, a crate
// and Shippy as a box, all low-poly code geometry. The scene renders into a tiny target (~480 px on the long side),
// a post pass adds t3ssel8r-style outlines (dark where depth jumps, light on creases) and snaps every pixel to the
// Black Iron 48 palette, then the canvas is upscaled by a whole number with nearest-neighbor.
// Calm rule: one thing moves at a time (crate on belt, then Builder, then Checks, then Shippy).
import * as THREE from "three";
import { buildScene } from "./scene";
import { makePost } from "./post";

const canvas = document.getElementById("view") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(1);

const world = buildScene();
const camera = new THREE.PerspectiveCamera(20, 16 / 9, 8, 300);
const post = makePost();

// --- low-res target sized so one art pixel = k device pixels (k a whole number) ---
let lowW = 480, lowH = 270, k = 2;
const LONG = new URLSearchParams(location.search).get("res") ? Number(new URLSearchParams(location.search).get("res")) : 480;
let pixels = true;
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const devW = Math.round(innerWidth * dpr), devH = Math.round(innerHeight * dpr);
  k = pixels ? Math.max(2, Math.round(Math.max(devW, devH) / LONG)) : 1;
  lowW = Math.ceil(devW / k); lowH = Math.ceil(devH / k);
  renderer.setSize(lowW, lowH, false);
  canvas.style.width = `${(lowW * k) / dpr}px`;
  canvas.style.height = `${(lowH * k) / dpr}px`;
  post.setSize(lowW, lowH);
  camera.aspect = lowW / lowH;
  camera.updateProjectionMatrix();
  const r = restFor(camera.aspect);
  if (r.yaw !== REST.yaw || r.zoom !== REST.zoom) { Object.assign(REST, r); Object.assign(cam, r); }
}
addEventListener("resize", resize);

// --- camera: fixed 3/4 view, drag to orbit a little, wheel/pinch to zoom; springs home on release ---
// landscape: straight-on 3/4 like the mockups; portrait: turn the deck so the line runs corner to corner
const REST = { yaw: 0, pitch: 0.4, zoom: 1 };
const restFor = (aspect) => (aspect < 0.85 ? { yaw: FOCUS ? 0.35 : 0.78, pitch: 0.62, zoom: ZOOM } : { yaw: 0, pitch: 0.4, zoom: ZOOM });
const cam = { ...REST };
const target = new THREE.Vector3(0, -0.7, 0.2);
// ?focus=builder: frame the Builder up close (same pixel size, just nearer)
const FOCUS = new URLSearchParams(location.search).get("focus") === "builder";
if (FOCUS) target.set(-2.2, 1.0, -0.6);
const ZOOM = FOCUS ? 3.4 : 1;
let drag = null as null | { x: number; y: number; yaw: number; pitch: number };
const pointers = new Map<number, { x: number; y: number }>();
let pinch0 = 0, zoom0 = 1;
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch };
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = cam.zoom; drag = null; }
});
canvas.addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; cam.zoom = clamp(zoom0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch0, 0.8 * ZOOM, 1.6 * ZOOM); return; }
  if (!drag) return;
  cam.yaw = clamp(drag.yaw - (e.clientX - drag.x) * 0.004, REST.yaw - 0.55, REST.yaw + 0.55);
  cam.pitch = clamp(drag.pitch + (e.clientY - drag.y) * 0.003, 0.3, 0.95);
});
const up = (e) => { pointers.delete(e.pointerId); if (!pointers.size) drag = null; };
canvas.addEventListener("pointerup", up);
canvas.addEventListener("pointercancel", up);
canvas.addEventListener("wheel", (e) => { e.preventDefault(); cam.zoom = clamp(cam.zoom * Math.exp(-e.deltaY * 0.0015), 0.8 * ZOOM, 1.6 * ZOOM); wheelT = 1.2; }, { passive: false });
let wheelT = 0;
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function placeCamera(dt) {
  const held = pointers.size > 0 || wheelT > 0;
  wheelT = Math.max(0, wheelT - dt);
  if (!held) { const s = 1 - Math.exp(-dt * 2.2); cam.yaw += (REST.yaw - cam.yaw) * s; cam.pitch += (REST.pitch - cam.pitch) * s; cam.zoom += (REST.zoom - cam.zoom) * s; }
  // fit the whole deck (rails to orb) on screen at this angle: binary search the distance
  const dist = fitDistance(cam.yaw, cam.pitch) / cam.zoom;
  aim(cam.yaw, cam.pitch, dist);
}
const BOUNDS = [-8.3, 8.3].flatMap((x) => [-3.4, 2.6].flatMap((y) => [-3.6, 3.6].map((z) => new THREE.Vector3(x, y, z))));
const v = new THREE.Vector3();
function aim(yaw, pitch, dist) {
  camera.position.set(
    target.x + Math.sin(yaw) * Math.cos(pitch) * dist,
    target.y + Math.sin(pitch) * dist,
    target.z + Math.cos(yaw) * Math.cos(pitch) * dist,
  );
  camera.lookAt(target);
  camera.updateMatrixWorld();
}
function fitDistance(yaw, pitch) {
  let lo = 10, hi = 250;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    aim(yaw, pitch, mid);
    const fits = BOUNDS.every((p) => { v.copy(p).project(camera); return Math.abs(v.x) < 0.94 && Math.abs(v.y) < 0.8; });
    if (fits) hi = mid; else lo = mid;
  }
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
(window as any).__deck3d = { seek: (t: number) => world.seek(t), cam };
