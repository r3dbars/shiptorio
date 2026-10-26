// The Foreman drone: Spark on the map. It flies to whatever Spark is touching
// (machine or ore) and hovers there; a scan beam shows while it works.
// Original model, built in the Item Lab's style: chunky boxes, one accent color.
// Built like a small survey quadcopter: a hull with a face screen, four ducted rotors on
// arms, a camera gimbal that looks around, landing skids, and nav lights (red left, green
// right, white strobe). It leans into its flight and the gimbal locks down while it scans.

import * as THREE from "three";
import { basic, box, cyl, group, mesh, own } from "./kit";

export const SPARK_BLUE = 0x6fb2ff;

export type DroneMode = "IDLE" | "FLYING" | "WORKING" | "THINKING";

export interface Drone {
  g: THREE.Group;
  update(t: number, dt: number, mode: DroneMode): void;
}

export function buildDrone(): Drone {
  const g = new THREE.Group();
  const body = group(g);
  body.scale.setScalar(1.5);
  // hull: dark plate with a Spark-blue band, a raised spine and a face screen
  box(0.7, 0.26, 0.7, 0x2b3150, 0, 0, 0, body);
  box(0.74, 0.08, 0.74, SPARK_BLUE, 0, 0.06, 0, body);
  box(0.5, 0.16, 0.5, 0x3a4268, 0, 0.21, 0, body);
  box(0.12, 0.06, 0.56, 0x22273f, 0, 0.31, 0, body); // spine
  for (const sx of [-1, 1]) box(0.04, 0.08, 0.22, 0x16192a, sx * 0.2, 0.22, -0.15, body); // cooling vents
  box(0.36, 0.14, 0.04, 0x16192a, 0, 0.02, 0.36, body); // screen bezel
  const eye = own(SPARK_BLUE, SPARK_BLUE);
  const face = box(0.3, 0.1, 0.04, eye, 0, 0.02, 0.37, body);
  // battery pack slung under the hull
  box(0.34, 0.08, 0.4, 0x3a3f47, 0, -0.17, -0.04, body);
  // antenna with a light that blinks while Spark thinks
  cyl(0.02, 0.02, 0.3, 0x8a94a3, 6, 0.12, 0.44, -0.16, body);
  const tip = own(0xf2a93b, 0xf2a93b);
  box(0.08, 0.08, 0.08, tip, 0.12, 0.62, -0.16, body);
  // four arms with motor pods and ducted rotors
  const rotors: THREE.Object3D[] = [];
  for (const [x, z] of [
    [-0.5, -0.5],
    [0.5, -0.5],
    [-0.5, 0.5],
    [0.5, 0.5],
  ]) {
    box(0.42, 0.06, 0.08, 0x8a94a3, x / 2, 0.02, z / 2, body).rotation.y = Math.atan2(z, -x);
    cyl(0.07, 0.06, 0.14, 0x2b3150, 8, x, 0.06, z, body);
    cyl(0.04, 0.04, 0.03, SPARK_BLUE, 8, x, 0.14, z, body);
    mesh(new THREE.TorusGeometry(0.27, 0.035, 4, 16), 0x3a4268, x, 0.13, z, body).rotation.x = Math.PI / 2; // duct
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      box(0.2, 0.025, 0.025, 0x8a94a3, x + Math.cos(a) * 0.14, 0.13, z + Math.sin(a) * 0.14, body).rotation.y = -a; // duct struts
    }
    const r = group(body, x, 0.15, z);
    box(0.46, 0.02, 0.08, 0xd6dbe3, 0, 0, 0, r);
    box(0.08, 0.02, 0.46, 0xd6dbe3, 0, 0, 0, r);
    rotors.push(r);
  }
  // landing skids
  for (const sx of [-1, 1]) {
    box(0.04, 0.04, 0.6, 0x2b3150, sx * 0.24, -0.33, 0, body);
    for (const sz of [-0.18, 0.18]) box(0.03, 0.16, 0.03, 0x8a94a3, sx * 0.22, -0.24, sz, body).rotation.z = sx * 0.25;
  }
  // camera gimbal under the nose: yoke, ball, lens
  const yaw = group(body, 0, -0.2, 0.24);
  box(0.04, 0.12, 0.04, 0x3a3f47, 0, -0.04, 0, yaw);
  const pitch = group(yaw, 0, -0.12, 0);
  box(0.16, 0.12, 0.16, 0xd6dbe3, 0, 0, 0, pitch);
  const lens = own(0x10305f, 0x10305f);
  cyl(0.045, 0.045, 0.05, lens, 8, 0, 0, 0.09, pitch).rotation.x = Math.PI / 2;
  // nav lights: red on the left, green on the right, a white strobe on the tail
  const port = own(0x3a0c08), star = own(0x0f3a22), strobe = own(0x30343c);
  box(0.06, 0.05, 0.06, port, -0.78, 0.06, 0.5, body);
  box(0.06, 0.05, 0.06, star, 0.78, 0.06, 0.5, body);
  box(0.06, 0.05, 0.06, strobe, 0, 0.1, -0.38, body);
  // scan beam under the drone, shown while it works on something
  const beam = cyl(0.12, 0.7, 2.6, basic(SPARK_BLUE, 0.22), 10, 0, -1.4, 0.24, body);
  beam.castShadow = beam.receiveShadow = false;
  beam.visible = false;
  let lean = 0;

  return {
    g,
    update(t, dt, mode) {
      const spin = mode === "IDLE" ? 18 : mode === "FLYING" ? 40 : 30;
      for (const r of rotors) r.rotation.y += dt * spin;
      body.position.y = Math.sin(t * 2.2) * 0.12;
      // lean forward into the flight, with a little wobble, and settle when it arrives
      lean += ((mode === "FLYING" ? 0.22 : 0) - lean) * Math.min(1, dt * 4);
      body.rotation.x = lean + Math.sin(t * 1.7) * 0.02;
      body.rotation.z = mode === "FLYING" ? Math.sin(t * 3) * 0.06 : Math.sin(t * 1.3) * 0.015;
      // the gimbal looks around while idle, stays level in flight, locks straight down to scan
      const look = mode === "WORKING" ? 0 : mode === "IDLE" ? Math.sin(t * 0.6) * 0.8 : Math.sin(t * 2.5) * 0.25;
      yaw.rotation.y += (look - yaw.rotation.y) * Math.min(1, dt * 3);
      const tilt = mode === "WORKING" ? 1.4 : mode === "FLYING" ? -lean + 0.2 : 0.35;
      pitch.rotation.x += (tilt - pitch.rotation.x) * Math.min(1, dt * 4);
      lens.emissive.setHex(mode === "WORKING" ? SPARK_BLUE : 0x10305f);
      beam.visible = mode === "WORKING";
      if (beam.visible) (beam.material as THREE.MeshBasicMaterial).opacity = 0.16 + Math.abs(Math.sin(t * 5)) * 0.14;
      const blink = mode === "THINKING" ? Math.sin(t * 14) > 0 : true;
      tip.emissiveIntensity = blink ? 1 : 0.1;
      eye.emissiveIntensity = mode === "THINKING" ? 0.6 + Math.abs(Math.sin(t * 6)) * 0.4 : 1;
      face.scale.y = Math.sin(t * 0.9) > 0.97 ? 0.2 : 1; // it blinks
      port.emissive.setHex(0xff5e52);
      star.emissive.setHex(0x5bd18b);
      strobe.emissive.setHex(t % 1.2 < 0.08 ? 0xffffff : 0);
    },
  };
}
