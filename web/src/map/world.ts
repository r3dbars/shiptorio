// Which world the map draws. The shaft (SHAFT below) is the map. The island it replaced stays for one release so
// anyone can compare: ?world=iron in Black Iron (docs/art/IRON-STYLE.md §9, the oily foundry look from PR #204),
// ?world=classic as the sunny moss island before that. Then the island, this file's looks and the classic branches go.

import * as THREE from "three";
import type { Finish } from "./pixel";

export type WorldStyle = "iron" | "classic";
const DEFAULT_WORLD: WorldStyle = "iron";

function pick(): WorldStyle {
  try {
    const w = new URLSearchParams(globalThis.location?.search ?? "").get("world");
    if (w === "iron" || w === "classic") return w;
  } catch { /* no location (tests) */ }
  return DEFAULT_WORLD;
}

export const WORLD: WorldStyle = pick();
export const IRON = WORLD === "iron";

// The shaft: the vertical mine-to-launch factory (map/shaft/), the map everyone gets (Justin, 2026-10-27).
// ?world=iron or ?world=classic shows the island for one more release (that page load only), then it goes.
function pickShaft(): boolean {
  try {
    const w = new URLSearchParams(globalThis.location?.search ?? "").get("world");
    return w !== "iron" && w !== "classic";
  } catch {
    return true; // no location (tests)
  }
}
export const SHAFT = pickShaft();

// Lights: three r155+ is physically based, so the reference's r128 intensities are × π.
const L = Math.PI;

export interface Look {
  sky: { top: number; bottom: number } | number;
  fog: { color: number; near: number; far: number } | null;
  hemi: { sky: number; ground: number; i: number };
  sun: { color: number; i: number; offset: [number, number, number] };
  under: { color: number; i: number; pos: [number, number, number] };
  finish: Finish;
  pixel: number; // render scale at zoom 1 (1 = full resolution)
}

// Black Iron, from docs/art/black-iron/modules/world.js: furnace sky, warm sun, brown hemi,
// and furnace light from below so the underside reads. Albedos are lifted in the models.
export const IRON_LOOK: Look = {
  sky: { top: 0x1c120c, bottom: 0x7a3a16 },
  fog: { color: 0x3a2416, near: 52, far: 120 },
  hemi: { sky: 0xbcb4b0, ground: 0x46362a, i: 0.8 * L },
  sun: { color: 0xffc48e, i: 0.95 * L, offset: [6, 26, 16] },
  under: { color: 0xff7a2a, i: 0.42 * L, pos: [8, -10, 12] },
  finish: {
    levels: 52, dither: 0.06, outline: 0.42, threshold: 0.1, ink: 0x100806, saturation: 1.02, contrast: 1.04,
    bloom: 0.7, bloomThresh: 0.64, vignette: 0.2, grade: 0.28, shadow: 0x2a1c40, high: 0xffd6a0,
  },
  pixel: 1,
};

export const CLASSIC_LOOK: Look = {
  sky: 0x1b2448,
  fog: null,
  hemi: { sky: 0xd6deff, ground: 0x40344a, i: 0.6 * L },
  sun: { color: 0xfff0d2, i: 0.95 * L, offset: [14, 26, 8] },
  under: { color: 0x9fb2ff, i: 0.45 * L, pos: [10, -6, 14] },
  finish: {
    levels: 32, dither: 0, outline: 0.35, threshold: 0.12, ink: 0x000000, saturation: 1.05, contrast: 1.05,
    bloom: 0, bloomThresh: 1, vignette: 0, grade: 0, shadow: 0x808080, high: 0x808080,
  },
  pixel: 2,
};

export const LOOK = IRON ? IRON_LOOK : CLASSIC_LOOK;

// The scene background: a flat color, or the furnace gradient as a tall 2px texture.
export function skyBackground(look: Look = LOOK): THREE.Color | THREE.Texture {
  if (typeof look.sky === "number") return new THREE.Color(look.sky);
  const { top, bottom } = look.sky;
  const c = document.createElement("canvas");
  c.width = 2;
  c.height = 256;
  const g = c.getContext("2d")!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, `#${top.toString(16).padStart(6, "0")}`);
  gr.addColorStop(1, `#${bottom.toString(16).padStart(6, "0")}`);
  g.fillStyle = gr;
  g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

// Hemisphere + under light + fog onto a scene; returns the sun for the caller to aim.
export function applyLook(scene: THREE.Scene, look: Look = LOOK) {
  scene.background = skyBackground(look);
  scene.fog = look.fog ? new THREE.Fog(look.fog.color, look.fog.near, look.fog.far) : null;
  scene.add(new THREE.HemisphereLight(look.hemi.sky, look.hemi.ground, look.hemi.i));
  const under = new THREE.DirectionalLight(look.under.color, look.under.i);
  under.position.set(...look.under.pos);
  scene.add(under);
  return new THREE.DirectionalLight(look.sun.color, look.sun.i);
}
