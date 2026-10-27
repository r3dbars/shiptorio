// The stage the shaft stands on: the scene, the root group (turned 45deg like the mockup, so root +x runs
// left to right on screen), the look (sky, fog, hemisphere, a sun whose shadow box follows the view), the
// orthographic camera with its views (framed by frame.ts), and the Black Iron finish. The dev harness (shaft.html) and the game's
// ShaftScene both draw through this, so a screenshot in the harness is what players see.

import * as THREE from "three";

import type { Iron, IronItem, Layout } from "./core";
import { FinishPass } from "./finish";
import { floorFrame, followH, isFloorView, isPhone, stationFrame } from "./frame";

export const YAW = Math.PI / 4;
export const TILT = (30 * Math.PI) / 180;
const D = 80;

export type ShaftView = "stack" | "mine" | "build" | "checks" | "launch" | "line" | "station" | "follow" | "free";

export class ShaftStage {
  readonly scene = new THREE.Scene();
  readonly root = new THREE.Group();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -300, 500);
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly finish: FinishPass;
  readonly tgt = new THREE.Vector3();
  readonly tgtGoal = new THREE.Vector3();
  viewH = 22;
  viewGoal = 22;
  zoom = 1;
  view: ShaftView = "build";
  focusId: string | null = null;
  followItem: IronItem | null = null;
  W = 2;
  H = 2;
  pixel = 1; // 1 = full resolution, 2-3 chunkier, 0 = smooth
  // where the view's center sits on screen, as a fraction of the view from the middle (+x right, +y up): the game
  // lifts it when a card or sheet covers the bottom of the screen
  bias = { x: 0, y: 0 };
  reduceMotion = false; // views snap instead of gliding
  private readonly sunDir = new THREE.Vector3(-12, 24, 16);
  private readonly cv = new THREE.Vector3();
  private shadowBox = 26;

  constructor(readonly I: Iron, readonly layout: Layout, opts: { shadowMap?: number } = {}) {
    this.root.rotation.y = YAW;
    this.scene.add(this.root);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.castShadow = true;
    const ms = opts.shadowMap ?? 2048;
    this.sun.shadow.mapSize.set(ms, ms);
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.finish = new FinishPass({});
  }

  /** after IRON.build: modules may have changed IRON.LOOK */
  applyLook() {
    const L = this.I.LOOK;
    const sky = L.sky;
    const c = document.createElement("canvas");
    c.width = 2;
    c.height = 256;
    const g = c.getContext("2d")!;
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, sky.top);
    gr.addColorStop(1, sky.bottom);
    g.fillStyle = gr;
    g.fillRect(0, 0, 2, 256);
    const bg = new THREE.CanvasTexture(c);
    bg.magFilter = bg.minFilter = THREE.LinearFilter;
    bg.generateMipmaps = false;
    const old = this.scene.background as THREE.Texture | null;
    if (old && (old as THREE.Texture).isTexture) old.dispose();
    this.scene.background = bg;
    this.scene.fog = sky.fog ? new THREE.Fog(sky.fog, sky.fogNear ?? 70, sky.fogFar ?? 140) : null;
    this.hemi.color.set(L.light.hemiSky);
    this.hemi.groundColor.set(L.light.hemiGnd);
    this.hemi.intensity = L.light.hemiI;
    this.sun.color.set(L.light.sun);
    this.sun.intensity = L.light.sunI;
    this.sunDir.fromArray(L.light.sunDir);
    this.finish.setLook(L.finish);
  }

  rootToWorld(x: number, y: number, z: number, out = new THREE.Vector3()) {
    return this.root.localToWorld(out.set(x, y, z));
  }

  get phone() {
    return isPhone(this.W);
  }

  setView(view: ShaftView, id?: string | null) {
    this.view = view;
    this.focusId = id ?? null;
    if (view !== "follow") this.followItem = null;
    this.presetGoal();
  }

  /** jump straight to the current view's goal (first frame, reduced motion, screenshots) */
  snap() {
    this.presetGoal();
    this.tgt.copy(this.tgtGoal);
    this.viewH = this.viewGoal;
  }

  presetGoal() {
    const v = this.view;
    if (isFloorView(v)) {
      const f = floorFrame(v, this.W, this.H);
      this.rootToWorld(...f.at, this.tgtGoal);
      this.viewGoal = f.h;
    } else if (v === "station" && this.focusId) {
      const st = this.I.stations[this.focusId];
      if (st) {
        const f = stationFrame(st, this.W);
        this.rootToWorld(...f.at, this.tgtGoal);
        this.viewGoal = f.h;
      }
    }
  }

  pickFollow(): IronItem | null {
    const live = this.I.items.filter((it) => !it.hidden);
    if (!live.length) return null;
    // the item furthest up the shaft keeps the camera on the action
    const rank = (it: IronItem) => it.mesh.position.y + (it.owner ? 2 : 0) - (it.kind === "reject" ? 30 : 0);
    live.sort((a, b) => rank(b) - rank(a) || a.num - b.num);
    return live[0];
  }

  /** ease the camera toward its goal */
  camStep(dt: number) {
    if (this.view === "follow") {
      if (!this.followItem || !this.I.items.includes(this.followItem) || this.followItem.hidden) this.followItem = this.pickFollow();
      if (this.followItem) {
        this.followItem.mesh.getWorldPosition(this.tgtGoal);
        this.tgtGoal.y += 0.6;
        this.viewGoal = followH(this.W);
      }
    } else if (this.view !== "free") this.presetGoal();
    const k = this.reduceMotion ? 1 : 1 - Math.exp(-dt * (this.view === "follow" ? 3 : 5));
    this.tgt.lerp(this.tgtGoal, k);
    this.viewH += (this.viewGoal - this.viewH) * k;
  }

  /** drag the view by screen pixels */
  panBy(dx: number, dy: number) {
    if (this.view !== "free") this.setView("free");
    const k = (this.viewH * this.zoom) / this.H;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    this.tgtGoal.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
    this.tgt.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
  }

  zoomBy(f: number) {
    this.zoom = Math.max(0.35, Math.min(3, this.zoom * f));
  }

  setSize(W: number, H: number) {
    this.W = Math.max(1, W);
    this.H = Math.max(1, H);
    if (this.view !== "free" && this.view !== "follow") this.presetGoal();
  }

  /** place the camera and the sun for this frame */
  aim() {
    const a = this.W / this.H, vh = this.viewH * this.zoom;
    const cam = this.camera;
    cam.left = (-vh * a) / 2;
    cam.right = (vh * a) / 2;
    cam.top = vh / 2;
    cam.bottom = -vh / 2;
    cam.updateProjectionMatrix();
    const t = this.tgt;
    cam.position.set(t.x + D * Math.cos(TILT) * Math.sin(YAW), t.y + D * Math.sin(TILT), t.z + D * Math.cos(TILT) * Math.cos(YAW));
    cam.lookAt(t);
    if (this.bias.x || this.bias.y) {
      // slide the camera so the target shows off-center (the camera never turns, so this is a pure shift)
      cam.updateMatrixWorld();
      const right = this.cv.setFromMatrixColumn(cam.matrixWorld, 0).multiplyScalar(-this.bias.x * vh * a);
      cam.position.add(right);
      const up = this.cv.setFromMatrixColumn(cam.matrixWorld, 1).multiplyScalar(-this.bias.y * vh);
      cam.position.add(up);
    }
    cam.updateMatrixWorld();
    // the sun's shadow box follows the view: the mockup's 26 around the deck, more when zoomed out
    const box = Math.max(26, Math.ceil((vh * Math.max(1, a) * 0.62) / 4) * 4);
    if (box !== this.shadowBox) {
      this.shadowBox = box;
      Object.assign(this.sun.shadow.camera, { left: -box, right: box, top: box, bottom: -box, near: 1, far: 220 });
      this.sun.shadow.camera.updateProjectionMatrix();
    }
    // snap the sun to shadow texels so shadows don't shimmer while the camera glides
    const texel = (box * 2) / this.sun.shadow.mapSize.x;
    const sx = Math.round(t.x / texel) * texel, sy = Math.round(t.y / texel) * texel, sz = Math.round(t.z / texel) * texel;
    this.sun.position.set(sx + this.sunDir.x, sy + this.sunDir.y, sz + this.sunDir.z);
    this.sun.target.position.set(sx, sy, sz);
  }

  render(renderer: THREE.WebGLRenderer) {
    this.aim();
    this.finish.setSize(this.W, this.H, this.pixel);
    this.finish.render(renderer, this.scene, this.camera);
  }

  /** root point -> screen pixels [x, y, depth] */
  project(x: number, y: number, z: number): [number, number, number] {
    const v = this.rootToWorld(x, y, z, this.cv).project(this.camera);
    return [((v.x + 1) / 2) * this.W, ((1 - v.y) / 2) * this.H, v.z];
  }

  dispose() {
    this.finish.dispose();
    const bg = this.scene.background as THREE.Texture | null;
    if (bg && bg.isTexture) bg.dispose();
  }
}
