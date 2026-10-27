// The factory grows (Justin's pick r4-reward B): every PR that shipped leaves a green lamp on the build floor, in front
// of the assembler that built it. Read off the real launched items, so the lamps are your own history, never decoration.
// A launched item sits at the gate, so the builder is remembered while it's in an assembler; one that shipped before
// this page saw it build stands in front of the first assembler.

import * as THREE from "three";

import type { FactoryState } from "@shiptorio/shared";

import type { Iron } from "./core";

const PER_ROW = 8;
const MAX_PER_STATION = 24; // three rows; past that the floor is simply full
const GAP = 0.5;

export class Trophies {
  readonly group = new THREE.Group();
  private key = "";
  private readonly builtBy = new Map<string, string>(); // item id -> the assembler it was seen in
  private readonly glow = new THREE.MeshBasicMaterial({ color: 0x46ff8a });
  private readonly iron = new THREE.MeshLambertMaterial({ color: 0x1a1410 });
  private readonly head = new THREE.BoxGeometry(0.28, 0.28, 0.28);
  private readonly post = new THREE.BoxGeometry(0.08, 0.6, 0.08);

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
      for (let i = 0; i < Math.min(n, MAX_PER_STATION); i++) {
        const x = st.x - ((PER_ROW - 1) * GAP) / 2 + (i % PER_ROW) * GAP;
        const z = st.z + 3.4 + Math.floor(i / PER_ROW) * GAP;
        const post = new THREE.Mesh(this.post, this.iron);
        post.position.set(x, st.y + 0.3, z);
        const lamp = new THREE.Mesh(this.head, this.glow);
        lamp.position.set(x, st.y + 0.74, z);
        for (const m of [post, lamp]) {
          m.userData.noBake = true;
          this.group.add(m);
        }
      }
    }
  }

  dispose() {
    this.group.clear();
    for (const r of [this.glow, this.iron, this.head, this.post]) r.dispose();
  }
}
