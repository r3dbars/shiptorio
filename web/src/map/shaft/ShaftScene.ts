// The shaft in the game (?world=shaft): the vertical Black Iron factory driven by the real FactoryState. Same public
// API as FactoryScene (map/scene.ts), so FactoryMap can swap one for the other. The engine (core.js), the layout
// (layout.js) and the art (modules/*.js) are the dev harness's (harness.ts); this adds the real driver (driver.ts),
// a plan read off the real machines (plan.ts), the in-world HUD (hud.ts: chips, item tags, pings, floor buttons),
// picking, and the game's camera asks (focus, overview, lift), framed by frame.ts.

import "./shaft.css";

import * as THREE from "three";

import type { FactoryState } from "@shiptorio/shared";

import { perf } from "../perf";
import { FrameGovernor } from "../quality";
import type { Cosmetics, Ping } from "../scene";
import type { SatelliteSpec } from "../empire";
import { bakeShaft } from "./bake";
import { createIron, type Iron } from "./core";
import { GameDriver } from "./driver";
import { biasFor } from "./frame";
import { ShaftHud } from "./hud";
import { makeLayout, MINES } from "./layout";
import { cartAt, clickable, mineKey, planFromState, type ShaftPlan } from "./plan";
import { ShaftStage, type ShaftView } from "./stage";

// the mockup's art was tuned without color management (three r128); the engine's lights are patched to match
THREE.ColorManagement.enabled = false;

type Install = (I: Iron) => void;

export interface Timelapse {
  refs: string[]; // launched item ids, oldest first
  onStart: (placed: string[]) => void; // the ones that found room on the line (none: nothing to show)
  onShip: (ref: string) => void; // one of them just launched
  onOver: () => void; // the replay ran its full length
}
const LAPSE_SPEED = 8; // the whole factory runs this much faster while the replay plays
const LAPSE_MAX_S = 9; // and never longer than this
const MODS = import.meta.glob("./modules/*.js");
let installs: Promise<Install[]> | null = null;
function loadModules(): Promise<Install[]> {
  installs ??= Promise.all(
    Object.entries(MODS)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, load]) =>
        load()
          .then((m) => (m as { default?: Install }).default ?? null)
          .catch((e) => {
            console.error(`[SHAFT] module ${file} failed to load:`, e);
            return null;
          }),
      ),
  ).then((fns) => fns.filter((f): f is Install => !!f));
  return installs;
}

export class ShaftScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly governor = new FrameGovernor(window.matchMedia?.("(pointer: coarse)").matches ?? false);
  private readonly reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  private I: Iron | null = null;
  private stage: ShaftStage | null = null;
  private driver: GameDriver | null = null;
  private sp: ShaftPlan | null = null;
  private fns: Install[] | null = null;
  private state: FactoryState | null = null;
  private W = 1;
  private H = 1;
  private raf = 0;
  private last = performance.now();
  private t = 0;
  private tier = -1;
  private disposed = false;
  private readonly hud: ShaftHud;
  // ?raf=0: no animation loop; tests step and draw it themselves (window.__shaft, dev only)
  private readonly manual = new URLSearchParams(location.search).get("raf") === "0";
  private lift = 0;
  private home: { view: ShaftView; id: string | null } | null = null;
  private view: { view: ShaftView; id: string | null } = { view: "stack", id: null };
  private readonly ray = new THREE.Raycaster();
  // the coming-back time-lapse (ui/away.ts): asked for before the shaft may be built, started on the first sync
  private lapse: Timelapse | null = null;
  private lapsing = false;
  private asked: string | null = null; // the last focus asked for, kept for a shaft that wasn't built yet

  constructor(
    canvas: HTMLCanvasElement,
    labelRoot: HTMLElement,
    private readonly onPick?: (id: string) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(1);
    this.renderer.info.autoReset = false;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.shadowMap.autoUpdate = false; // the frame governor says when
    this.hud = new ShaftHud(labelRoot, {
      pick: (key) => this.onPick?.(key),
      goTo: (view) => this.goTo(view),
      // the plates over the map changed: the floor views refit on their own each frame (frame.ts), the bias doesn't
      reframe: () => (this.governor.poke(), this.applyBias()),
    });
    this.hud.syncFloors(this.view.view);

    void loadModules().then((fns) => {
      if (this.disposed) return;
      this.fns = fns;
      if (this.state) this.update(this.state);
    });
    this.loop();
  }

  // ---------- the game's asks (same as FactoryScene) ----------

  setSize(width: number, height: number) {
    this.W = Math.max(1, width);
    this.H = Math.max(1, height);
    this.renderer.setSize(this.W, this.H, false);
    if (this.stage) {
      this.stage.setSize(this.W, this.H);
      this.applyBias();
    }
  }

  setLift(y: number) {
    this.lift = y;
    this.applyBias();
  }

  zoomBy(factor: number) {
    this.governor.poke();
    this.stage?.zoomBy(factor);
  }

  panBy(dx: number, dy: number) {
    this.governor.poke();
    if (!this.stage) return;
    this.stage.panBy(dx, dy);
    this.view = { view: "free", id: null };
    this.hud.syncFloors("free");
  }

  /** A drag ended. On a phone showing about one floor, the view settles on the nearest floor instead of stopping between two. */
  settle() {
    const stage = this.stage;
    if (!stage || this.view.view !== "free" || !stage.phone) return;
    const floor = stage.snapFloor();
    if (floor) this.setView(floor, null);
  }

  update(state: FactoryState) {
    this.state = state;
    if (!this.fns) return; // the art is still loading: build once it's here
    const sp = planFromState(state);
    if (!this.sp || sp.key !== this.sp.key) this.rebuild(sp);
    else this.sp = sp;
    this.driver?.sync(state);
    this.hud.read(state, this.sp!);
    this.startLapse();
  }

  /** Fly these launched items up the shaft again, fast: what really shipped while the player was away. */
  timelapse(lapse: Timelapse) {
    this.lapse = lapse;
    this.lapsing = false;
    this.startLapse();
  }

  /** The replay is over or skipped: back to real time, and the PR waiting at the gate is back on it. */
  endTimelapse() {
    this.lapse = null;
    this.lapsing = false;
    this.driver?.endLapse();
    if (this.I) this.I.policy.speed = 1;
  }

  private startLapse() {
    const lapse = this.lapse, I = this.I, driver = this.driver;
    if (!lapse || this.lapsing || !I || !driver?.state) return;
    this.lapsing = true;
    const placed = driver.beginLapse(lapse.refs, LAPSE_MAX_S * LAPSE_SPEED, () => lapse.onOver());
    I.policy.speed = LAPSE_SPEED;
    this.governor.poke();
    this.setView("launch", null, true); // the rockets go up from the top floor
    lapse.onStart(placed);
  }

  keyAt(clientX: number, clientY: number, rect: DOMRect): string | undefined {
    this.governor.poke();
    const I = this.I, stage = this.stage, sp = this.sp;
    if (!I || !stage || !sp) return undefined;
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    // a cart riding the shaft first: it's small and moving, so it gets a finger's reach around it
    const at = new THREE.Vector3();
    const carts = I.items
      .filter((it) => it.ref && !it.owner && !it.gone && !it.hidden && it.mesh.visible) // inside a machine, the machine answers
      .map((it) => {
        it.mesh.getWorldPosition(at).project(stage.camera);
        return { ref: it.ref!, x: rect.left + ((at.x + 1) / 2) * rect.width, y: rect.top + ((1 - at.y) / 2) * rect.height, z: at.z };
      })
      .filter((c) => c.z > -1 && c.z < 1);
    const cart = cartAt(carts, clientX, clientY);
    if (cart) return cart;
    this.ray.setFromCamera(ndc, stage.camera);
    const mine = stage.root.getObjectByName("part:mine");
    const targets: THREE.Object3D[] = I.stationList.map((s) => s.holder);
    if (mine) targets.push(mine);
    const hit = this.ray.intersectObjects(targets, true).find((h) => h.object.visible && !(h.object.userData.noBake && (h.object as THREE.Mesh).material && ((h.object as THREE.Mesh).material as THREE.Material).transparent));
    if (!hit) return undefined;
    for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
      if (o.name.startsWith("station:")) return sp.pick[o.name.slice(8)];
      if (o === mine) {
        // the nearest mine mouth to the hit
        const p = stage.root.worldToLocal(hit.point.clone());
        let best = "", d = Infinity;
        for (const src of Object.keys(MINES)) {
          const m = MINES[src];
          const dd = Math.hypot(p.x - m.x, (p.y - m.y) * 0.7);
          if (dd < d) (d = dd), (best = src);
        }
        return d < 6 ? mineKey(sp, best) : undefined;
      }
    }
    return undefined;
  }

  pick(clientX: number, clientY: number, rect: DOMRect): string | undefined {
    const key = this.keyAt(clientX, clientY, rect);
    return key && clickable(key) ? key : undefined;
  }

  private hoverAt = 0;
  hover(clientX: number, clientY: number, rect: DOMRect): boolean {
    const now = performance.now();
    if (now - this.hoverAt > 60) {
      this.hoverAt = now;
      this.hud.hovered = this.keyAt(clientX, clientY, rect);
    }
    return !!this.hud.hovered && clickable(this.hud.hovered);
  }

  clearHover() {
    this.hud.hovered = undefined;
  }

  setTeachingKeys(keys: string[]) {
    this.hud.teaching = new Set(keys);
  }

  setShowAllLabels(on: boolean) {
    this.hud.showAll = on;
  }

  // Pin pings to pick keys (station id, "m:<machine id>", "src:<kind>", "rework"). An empty list clears them.
  setPings(list: Ping[]) {
    this.hud.setPings(list);
  }

  // Fly in on a picked thing (its panel is open), or back to where you were (null).
  focus(key: string | null) {
    this.asked = key;
    this.hud.selected = key ?? undefined;
    const id = key ? this.stationOfKey(key) : undefined;
    if (key && (id || this.floorOfKey(key))) {
      this.home ??= { ...this.view };
      if (id) this.setView("station", id);
      else this.setView(this.floorOfKey(key)!, null);
    } else if (!key && this.home) {
      const h = this.home;
      this.home = null;
      this.setView(h.view, h.id);
    }
    this.applyBias();
  }

  setSatellites(specs: SatelliteSpec[]) {
    void specs; // other repos aren't drawn in the shaft yet
  }

  backToLine() {
    this.setView("stack", null);
  }

  empireView() {
    this.setView("stack", null);
  }

  overview(scale = 1) {
    void scale;
    this.setView("stack", null);
  }

  setCosmetics(c: Cosmetics | undefined) {
    void c; // progression unlocks come to the shaft later
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.teardown();
    this.hud.dispose();
    this.renderer.dispose();
  }

  // ---------- building ----------

  private rebuild(sp: ShaftPlan) {
    const keep = this.stage ? { zoom: this.stage.zoom } : null;
    const carried = this.driver?.carry() ?? null; // the work on the line stays where it is
    this.teardown();
    const I = createIron();
    for (const f of this.fns ?? []) {
      try {
        f(I);
      } catch (e) {
        console.error("[SHAFT] module install failed:", e);
      }
    }
    const layout = makeLayout(sp.plan);
    const driver = new GameDriver(I, layout);
    I.setDriver(driver);
    I.on("ship", ({ item }: { item: { ref: string | null } }) => {
      if (this.lapsing && item.ref && this.lapse?.refs.includes(item.ref)) this.lapse.onShip(item.ref);
    });
    const small = (window.matchMedia?.("(pointer: coarse)").matches ?? false) || (navigator.hardwareConcurrency ?? 8) <= 4;
    const stage = new ShaftStage(I, layout, { shadowMap: small ? 1024 : 2048 });
    stage.reduceMotion = this.reduceMotion;
    I.calm = this.reduceMotion; // core.js steadies the item halos
    I.build(stage.scene, stage.root, layout, { labels: sp.labels, warm: false });
    stage.applyLook();
    bakeShaft(I, stage.root);
    if (carried && this.state) driver.restore(carried, this.state);
    this.I = I;
    this.stage = stage;
    this.driver = driver;
    this.sp = sp;
    stage.setSize(this.W, this.H);
    if (keep) stage.zoom = keep.zoom;
    this.hud.build(I, stage, sp);
    this.setView(this.view.view === "station" && this.view.id && !I.stations[this.view.id] ? "stack" : this.view.view, this.view.id, true);
    if (this.asked && !this.home) this.focus(this.asked); // asked before the shaft stood (coming back parks on a launch)
    this.applyBias();
    this.renderer.shadowMap.needsUpdate = true;
    if (import.meta.env.DEV)
      (window as unknown as { __shaft?: unknown }).__shaft = {
        I, stage, layout, sp, driver, renderer: this.renderer,
        advance: (sec: number) => {
          I.debug.advance(sec);
          this.t = I._t ?? this.t;
          stage.camStep(sec);
        },
        view: (v: ShaftView, id?: string) => (this.setView(v, id ?? null, true), this.applyBias()),
        render: () => {
          this.renderer.info.reset();
          this.renderer.shadowMap.needsUpdate = true;
          stage.render(this.renderer);
          this.hud.place(this.W, this.H);
          return { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles };
        },
      };
  }

  private teardown() {
    this.hud.clear();
    if (this.I) this.I.dispose();
    this.stage?.dispose();
    this.I = null;
    this.stage = null;
    this.driver = null;
  }

  // ---------- views ----------

  private goTo(view: ShaftView) {
    this.governor.poke();
    this.home = null;
    this.setView(view, null);
  }

  private setView(view: ShaftView, id: string | null, snap = false) {
    this.view = { view, id };
    if (this.stage) {
      if (view === "free") this.stage.view = "free";
      else this.stage.setView(view, id);
      if (snap || this.reduceMotion) this.stage.snap();
    }
    this.hud.syncFloors(view);
  }

  // what's on screen sits higher when the bottom is covered (a card, a sheet, the phone controls)
  private applyBias() {
    if (this.stage) this.stage.bias = biasFor(this.W, this.H, this.lift, !!this.home);
  }

  private stationOfKey(key: string): string | undefined {
    const sp = this.sp;
    if (!sp) return undefined;
    for (const [id, k] of Object.entries(sp.pick)) if (k === key) return id;
    const bare = key.replace(/^m:/, "");
    return this.I?.stations[bare] ? bare : undefined;
  }

  private floorOfKey(key: string): ShaftView | undefined {
    if (key.startsWith("src:") || (key.startsWith("m:") && this.sp && Object.values(this.sp.mines).includes(key.slice(2)))) return "mine";
    if (key === "rework") return "checks";
    // machines the shaft doesn't draw on their own yet: a test turret guards the checks, a fourth builder builds
    const m = key.startsWith("m:") ? this.state?.machines.find((x) => x.id === key.slice(2)) : undefined;
    if (m?.type === "turret") return "checks";
    if (m?.type === "assembler") return "build";
    return undefined;
  }

  // ---------- loop ----------

  private loop = () => {
    if (this.manual) return;
    this.raf = requestAnimationFrame(this.loop);
    const I = this.I, stage = this.stage;
    if (!I || !stage) return;
    const now = performance.now();
    const moving = stage.view === "follow" || stage.tgt.distanceToSquared(stage.tgtGoal) > 1e-4 || Math.abs(stage.viewH - stage.viewGoal) > 1e-3;
    if (!this.governor.draw(now, moving)) return;
    perf.frame(now, this.renderer.info, this.governor.tier);
    if (this.governor.tier !== this.tier) {
      this.tier = this.governor.tier;
      stage.finish.setBloomTaps(this.tier === 0 ? 12 : this.tier === 1 ? 8 : 0);
    }
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.t += dt;
    I.step(this.t, dt);
    stage.camStep(dt);
    this.renderer.shadowMap.needsUpdate = this.governor.shadows();
    stage.render(this.renderer);
    this.hud.place(this.W, this.H);
    perf.work(performance.now() - now);
  };
}
