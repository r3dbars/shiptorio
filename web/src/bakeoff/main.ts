// @ts-nocheck -- bake-off spike, kept loose like src/deck3d/
// /bakeoff.html: one hard target per round, three ways side by side: Justin's mockup art, the 2D code-drawn pixel
// version, and the 3D low-poly version rendered tiny. Both pixel sides draw on the same art grid and are blown up by
// the same whole number, so the comparison is fair. Drag a 3D panel to turn it.
//   ?t=1.2  freeze the clock (screenshots)   ?k=6  force the pixel scale
import * as THREE from "three";
import { stationFrame } from "../deck2d/stations";
import { buildBuilderHD } from "../deck3d/builder";
import { BOILER_H, BOILER_W, boilerFrame } from "./boiler2d";
import { buildBoiler3D } from "./boiler3d";
import { glow, mountView, toon } from "./view3d";

const params = new URLSearchParams(location.search);
const frozen = params.has("t") ? Number(params.get("t")) : null;

function gear(r, teeth, mat) {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.1, 14), mat); disc.rotation.x = Math.PI / 2; g.add(disc);
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.1), mat); t.position.set(Math.cos(a) * (r + 0.05), Math.sin(a) * (r + 0.05), 0); t.rotation.z = a; g.add(t);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 6), toon(0x3d4d6a)); hub.rotation.x = Math.PI / 2; g.add(hub);
  return g;
}
function buildBuilder3D() {
  const scene = new THREE.Scene();
  const key = new THREE.DirectionalLight(0xfff0d8, 2.4); key.position.set(4, 6, 5); scene.add(key);
  scene.add(new THREE.HemisphereLight(0x8090b0, 0x2a1408, 0.7));
  const b = buildBuilderHD(scene, { toon, glow, gear });
  let tt = 0;
  return { scene, target: new THREE.Vector3(0, 1.45, 0), radius: 1.75, step(dt) { tt += dt; b.gear.rotation.z = -tt * 0.8; } };
}

const ROUNDS = [
  {
    id: "boiler", title: "Round 2: the twin boiler", w: BOILER_W, h: BOILER_H, mock: "/deck/art/boiler-on.webp",
    why: "The stress test. Round tanks, copper pipes that bend, rivets that follow the curve, rust, fire, and big soft smoke. Nobody had drawn this one in code yet.",
    d2: (t) => boilerFrame(t), d3: buildBoiler3D, cam: { yaw: 0, pitch: 0.42 },
  },
  {
    id: "builder", title: "Round 1: the Builder", w: 52, h: 66, mock: "/deck/art/builder-working.webp",
    why: "The station both sides already drew today (2D in drawStation, 3D in the deck spike), shown at the same size for reference.",
    d2: (t) => stationFrame("builder", "working", t), d3: buildBuilder3D, cam: { yaw: 0.35, pitch: 0.38 },
  },
];

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const out = document.getElementById("rounds");
const live = [];

for (const r of ROUNDS) {
  const c2 = el("canvas", { width: r.w, height: r.h, className: "px", ariaLabel: `${r.id} drawn in 2D code` });
  const c3 = el("canvas", { width: r.w, height: r.h, className: "px grab", ariaLabel: `${r.id} rendered in 3D; drag to turn it` });
  const img = el("img", { src: r.mock, alt: `Justin's ${r.id} mockup art` });
  const panel = (tag, name, note, media) => el("figure", { className: "panel" }, el("div", { className: "stage" }, media), el("figcaption", {}, el("b", { className: tag, textContent: name }), el("span", { textContent: note })));
  out.append(el("section", { className: "round", id: r.id },
    el("h2", { textContent: r.title }), el("p", { className: "why", textContent: r.why }),
    el("div", { className: "trio" },
      panel("mock", "Mockup", "Justin's painted art: the target.", img),
      panel("two", "A · 2D", `Code-drawn pixel art, ${r.w}x${r.h} art px. Every pixel placed by shading rules.`, c2),
      panel("three", "B · 3D", `Low-poly 3D rendered at ${r.w}x${r.h}, outlined, snapped to the 48 colors. Drag it.`, c3))));
  const v3 = mountView(c3, r.w, r.h, r.d3(), r.cam);
  live.push({ r, c2, v3 });
}

// blow both pixel canvases up by the same whole number that fits the panel
function fit() {
  for (const { r, c2 } of live) {
    const stage = c2.parentElement, avail = stage.clientWidth - 8;
    const k = Number(params.get("k")) || Math.max(1, Math.floor(Math.min(avail / r.w, 420 / r.h)));
    for (const c of stage.closest(".trio").querySelectorAll("canvas.px")) { c.style.width = `${r.w * k}px`; c.style.height = `${r.h * k}px`; }
    for (const s of stage.closest(".trio").querySelectorAll(".stage")) s.style.height = `${r.h * k + 8}px`;
  }
}
addEventListener("resize", fit);
fit();

let last = performance.now();
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const t = frozen ?? now / 1000;
  for (const { c2, v3 } of live) {
    const cx = c2.getContext("2d");
    cx.clearRect(0, 0, c2.width, c2.height);
    const f = live.find((l) => l.c2 === c2).r.d2(t);
    cx.drawImage(f, Math.floor((c2.width - f.width) / 2), c2.height - f.height);
    v3.render(frozen !== null ? 0 : dt, t);
  }
  document.body.dataset.ready = "1";
  requestAnimationFrame(tick);
}
if (frozen !== null) for (const { v3 } of live) for (let i = 0; i < Math.round(frozen * 30); i++) v3.render(1 / 30, i / 30);
requestAnimationFrame(tick);
