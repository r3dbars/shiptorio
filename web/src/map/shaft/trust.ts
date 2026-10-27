// Trust lamps up the launch lift's tower (Justin's picks trust B and r3-trust B): the factory's real trust, 0 to 1,
// as small amber lamps in four levels of five. Filling a level lights that level's big brass lamp.

import * as THREE from "three";

import type { FactoryState } from "@shiptorio/shared";

import { TIERS } from "./layout";

export const LEVELS = 4;
export const PER_LEVEL = 5;
const X = -15.5 + 1.15; // beside the lift cage (layout.js FL_X), on the side facing the camera
const Z = -14.6 + 0.95;
const Y0 = TIERS.checks.y + 1.8;
const STEP = 0.46;
const LEVEL_H = PER_LEVEL * STEP + 0.5;

/** how many small lamps are lit, and how many levels are full */
export function trustLamps(trust: number) {
  const lit = Math.round(Math.min(1, Math.max(0, trust || 0)) * LEVELS * PER_LEVEL);
  return { lit, levels: Math.floor(lit / PER_LEVEL) };
}

export class TrustLamps {
  readonly group = new THREE.Group();
  private shown = -1;
  private readonly small: THREE.Mesh[] = [];
  private readonly big: THREE.Mesh[] = [];
  private readonly off = new THREE.MeshLambertMaterial({ color: 0x2a1d14 });
  private readonly on = new THREE.MeshBasicMaterial({ color: 0xffb020 });
  private readonly brassOff = new THREE.MeshLambertMaterial({ color: 0x5a4020 });
  private readonly brassOn = new THREE.MeshBasicMaterial({ color: 0xffe08a });
  private readonly iron = new THREE.MeshLambertMaterial({ color: 0x1a1410 });
  private readonly lamp = new THREE.BoxGeometry(0.22, 0.22, 0.22);
  private readonly bulb = new THREE.BoxGeometry(0.46, 0.46, 0.46);
  private readonly rail = new THREE.BoxGeometry(0.08, LEVELS * LEVEL_H, 0.08);
  private readonly plate = new THREE.BoxGeometry(1.1, 0.34, 0.05);
  private label: THREE.Material | null = null;

  constructor() {
    this.group.name = "trust-lamps";
    const rail = new THREE.Mesh(this.rail, this.iron);
    rail.position.set(X - 0.2, Y0 + (LEVELS * LEVEL_H) / 2 - 0.3, Z);
    this.keep(rail);
    // a small brass plate under the column says what it counts
    const plate = new THREE.Mesh(this.plate, (this.label = plateFace()));
    plate.position.set(X, Y0 - 0.5, Z + 0.05);
    this.keep(plate);
    for (let l = 0; l < LEVELS; l++) {
      for (let i = 0; i < PER_LEVEL; i++) {
        const m = new THREE.Mesh(this.lamp, this.off);
        m.position.set(X, Y0 + l * LEVEL_H + i * STEP, Z);
        this.small.push(this.keep(m));
      }
      const b = new THREE.Mesh(this.bulb, this.brassOff);
      b.position.set(X, Y0 + l * LEVEL_H + PER_LEVEL * STEP + 0.12, Z);
      this.big.push(this.keep(b));
    }
  }

  private keep(m: THREE.Mesh) {
    m.userData.noBake = true;
    this.group.add(m);
    return m;
  }

  sync(state: FactoryState) {
    const { lit, levels } = trustLamps(state.trust);
    if (lit === this.shown) return;
    this.shown = lit;
    this.small.forEach((m, i) => (m.material = i < lit ? this.on : this.off));
    this.big.forEach((m, l) => (m.material = l < levels ? this.brassOn : this.brassOff));
  }

  /** a fresh shaft: paint the lamps again on the next sync */
  reset() {
    this.shown = -1;
  }

  dispose() {
    this.group.clear();
    for (const r of [this.off, this.on, this.brassOff, this.brassOn, this.iron, this.lamp, this.bulb, this.rail, this.plate]) r.dispose();
    (this.label as THREE.MeshBasicMaterial | null)?.map?.dispose();
    this.label?.dispose();
  }
}

/** "TRUST" on brass; plain brass where there's no canvas to paint on (tests) */
function plateFace(): THREE.Material {
  const c = typeof document === "undefined" ? null : document.createElement("canvas");
  const g = c?.getContext("2d");
  if (!c || !g) return new THREE.MeshBasicMaterial({ color: 0xb8863b });
  c.width = 110;
  c.height = 34;
  g.fillStyle = "#b8863b";
  g.fillRect(0, 0, 110, 34);
  g.fillStyle = "#1c1008";
  g.font = "bold 22px monospace";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("TRUST", 55, 18);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: tex });
}
