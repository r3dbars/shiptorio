// The Foreman drone: Spark on the map. It flies to whatever Spark is touching
// (machine or ore) and hovers there; a scan beam shows while it works.
// Original model, built in the Item Lab's style: chunky boxes, one accent color.

import * as THREE from "three";
import { basic, box, cyl, group, own } from "./kit";

export const SPARK_BLUE = 0x6fb2ff;

export type DroneMode = "IDLE" | "FLYING" | "WORKING" | "THINKING";

export interface Drone {
  g: THREE.Group;
  update(t: number, dt: number, mode: DroneMode): void;
}

export function buildDrone(): Drone {
  const g = new THREE.Group();
  const body = group(g);
  // hull: dark plate with a Spark-blue band and a face screen
  box(0.7, 0.26, 0.7, 0x2b3150, 0, 0, 0, body);
  box(0.74, 0.08, 0.74, SPARK_BLUE, 0, 0.06, 0, body);
  box(0.5, 0.16, 0.5, 0x3a4268, 0, 0.21, 0, body);
  const eye = own(SPARK_BLUE, SPARK_BLUE);
  box(0.3, 0.1, 0.04, eye, 0, 0.02, 0.37, body);
  // antenna with a light that blinks while Spark thinks
  cyl(0.02, 0.02, 0.3, 0x8a94a3, 6, 0, 0.44, 0, body);
  const tip = own(0xf2a93b, 0xf2a93b);
  box(0.08, 0.08, 0.08, tip, 0, 0.62, 0, body);
  // four arms with rotors
  const rotors: THREE.Object3D[] = [];
  for (const [x, z] of [
    [-0.5, -0.5],
    [0.5, -0.5],
    [-0.5, 0.5],
    [0.5, 0.5],
  ]) {
    box(0.42, 0.06, 0.08, 0x8a94a3, x / 2, 0.02, z / 2, body).rotation.y = Math.atan2(z, -x);
    cyl(0.06, 0.06, 0.12, 0x2b3150, 6, x, 0.06, z, body);
    const r = group(body, x, 0.14, z);
    box(0.46, 0.02, 0.08, 0xd6dbe3, 0, 0, 0, r);
    rotors.push(r);
  }
  // scan beam under the drone, shown while it works on something
  const beam = cyl(0.12, 0.7, 2.6, basic(SPARK_BLUE, 0.22), 10, 0, -1.4, 0, body);
  beam.castShadow = beam.receiveShadow = false;
  beam.visible = false;

  return {
    g,
    update(t, dt, mode) {
      const spin = mode === "IDLE" ? 18 : 30;
      for (const r of rotors) r.rotation.y += dt * spin;
      body.position.y = Math.sin(t * 2.2) * 0.12;
      body.rotation.z = mode === "FLYING" ? Math.sin(t * 3) * 0.06 : 0;
      beam.visible = mode === "WORKING";
      if (beam.visible) (beam.material as THREE.MeshBasicMaterial).opacity = 0.16 + Math.abs(Math.sin(t * 5)) * 0.14;
      const blink = mode === "THINKING" ? Math.sin(t * 14) > 0 : true;
      tip.emissiveIntensity = blink ? 1 : 0.1;
    },
  };
}
