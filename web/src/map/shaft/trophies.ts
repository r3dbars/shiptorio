// The factory grows (Justin's pick r4-reward B): every PR that shipped leaves a green lamp on the build floor, in front
// of the assembler that built it. Read off the real launched items, so the lamps are your own history, never decoration.
// A launched item sits at the gate, so the builder is remembered while it's in an assembler; one that shipped before
// this page saw it build stands in front of the first assembler.
// Every 10 lamps fold into one brass banner with the count (r5-lamps A), so the floor stays tidy at 100 ships.

import * as THREE from "three";

import type { FactoryState } from "@shiptorio/shared";

import type { Iron } from "./core";

const PER_ROW = 8;
const GAP = 0.5;
const PER_BANNER = 10;
const BANNERS_PER_ROW = 5;
const MAX_BANNERS = 10; // two rows; past that the last banner carries the whole count
const BANNER_GAP = 1.9;

export class Trophies {
  readonly group = new THREE.Group();
  private key = "";
  private readonly builtBy = new Map<string, string>(); // item id -> the assembler it was seen in
  private readonly glow = new THREE.MeshBasicMaterial({ color: 0x46ff8a });
  private readonly iron = new THREE.MeshLambertMaterial({ color: 0x1a1410 });
  private readonly head = new THREE.BoxGeometry(0.28, 0.28, 0.28);
  private readonly post = new THREE.BoxGeometry(0.08, 0.6, 0.08);
  private readonly plate = new THREE.BoxGeometry(1.7, 0.6, 0.06);
  private readonly brass = new Map<number, THREE.Material>(); // a banner's face, by the count it reads

  constructor() {
    this.group.name = "trophies";
  }

  /** a fresh shaft: lay the lamps again on the next sync */
  reset() {
    this.key = "";
  }

  sync(I: Iron, state: FactoryState) {
    const builders = state.machines.filter((m) => m.type === "assembler" && I.stations[m.id]).map((m) => m.id);
    const per = new Map<string, number>();
    for (const it of state.items) {
      if (it.machineId && builders.includes(it.machineId)) this.builtBy.set(it.id, it.machineId);
      if (it.state !== "launched") continue;
      const at = this.builtBy.get(it.id) ?? builders[0];
      if (at) per.set(at, (per.get(at) ?? 0) + 1);
    }
    const key = [...per].sort().map(([id, n]) => `${id}:${n}`).join("|");
    if (key === this.key) return;
    this.key = key;
    this.group.clear();
    for (const [id, n] of per) {
      const st = I.stations[id];
      const folded = Math.floor(n / PER_BANNER);
      const banners = Math.min(folded, MAX_BANNERS);
      for (let b = 0; b < banners; b++) {
        const count = b === banners - 1 ? folded * PER_BANNER : (b + 1) * PER_BANNER;
        const x = st.x - ((BANNERS_PER_ROW - 1) * BANNER_GAP) / 2 + (b % BANNERS_PER_ROW) * BANNER_GAP;
        const z = st.z + 3.4 + Math.floor(b / BANNERS_PER_ROW) * GAP * 1.6;
        for (const dx of [-0.75, 0.75]) this.add(new THREE.Mesh(this.post, this.iron), x + dx, st.y + 0.3, z, "post");
        const face = new THREE.Mesh(this.plate, this.face(count));
        face.userData.count = count;
        this.add(face, x, st.y + 0.9, z, "banner");
      }
      const rowsUsed = Math.ceil(banners / BANNERS_PER_ROW);
      for (let i = 0; i < n % PER_BANNER; i++) {
        const x = st.x - ((PER_ROW - 1) * GAP) / 2 + (i % PER_ROW) * GAP;
        const z = st.z + 3.4 + rowsUsed * GAP * 1.6 + Math.floor(i / PER_ROW) * GAP;
        this.add(new THREE.Mesh(this.post, this.iron), x, st.y + 0.3, z, "post");
        this.add(new THREE.Mesh(this.head, this.glow), x, st.y + 0.74, z, "lamp");
      }
    }
  }

  private add(m: THREE.Mesh, x: number, y: number, z: number, kind: string) {
    m.position.set(x, y, z);
    m.userData.noBake = true;
    m.userData.kind = kind;
    this.group.add(m);
  }

  /** a brass plate reading "★ 10"; plain brass where there's no canvas to paint on (tests) */
  private face(count: number) {
    let mat = this.brass.get(count);
    if (mat) return mat;
    const c = typeof document === "undefined" ? null : document.createElement("canvas");
    const g = c?.getContext("2d");
    if (c && g) {
      c.width = 140;
      c.height = 50;
      g.fillStyle = "#b8863b";
      g.fillRect(0, 0, 140, 50);
      g.strokeStyle = "#3a2410";
      g.lineWidth = 4;
      g.strokeRect(2, 2, 136, 46);
      g.fillStyle = "#1c1008";
      g.font = "bold 28px monospace";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(`\u2605 ${count}`, 70, 27);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      mat = new THREE.MeshBasicMaterial({ map: tex });
    } else mat = new THREE.MeshBasicMaterial({ color: 0xb8863b });
    this.brass.set(count, mat);
    return mat;
  }

  dispose() {
    this.group.clear();
    for (const r of [this.glow, this.iron, this.head, this.post, this.plate]) r.dispose();
    for (const m of this.brass.values()) {
      (m as THREE.MeshBasicMaterial).map?.dispose();
      m.dispose();
    }
    this.brass.clear();
  }
}
