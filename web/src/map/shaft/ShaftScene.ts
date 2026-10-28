// The shaft in the game (?world=shaft): the vertical Black Iron factory driven by the real FactoryState. Same public
// API as FactoryScene (map/scene.ts), so FactoryMap can swap one for the other. The engine (core.js), the layout
// (layout.js) and the art (modules/*.js) are the dev harness's (harness.ts); this adds the real driver (driver.ts),
// a plan read off the real machines (plan.ts), the in-world HUD (hud.ts: chips, item tags, pings, floor buttons),
// picking, and the game's camera asks (focus, overview, lift), framed by frame.ts.
//
// ?buildout=1 (web/src/buildout/CONTRACT.md): the first run builds the factory in front of you. The whole first-run
// shaft is built once (buildout.fullPlan), what isn't built yet is gone (buildout.ts), each build plays its moment
// here (construct.ts, burst.ts, the shiptorio:build event), and the camera is the director's (director.ts) until the
// first rocket.

import "./shaft.css";

import * as THREE from "three";

import type { FactoryState } from "@shiptorio/shared";

import { buildoutOn } from "../../flags";
import { perf } from "../perf";
import { FrameGovernor } from "../quality";
import type { Cosmetics, Ping } from "../scene";
import type { SatelliteSpec } from "../empire";
import { bakeShaft } from "./bake";
import { type Clog, clogOf, ClogView } from "./clog";
import { Buildout, fullPlan } from "./buildout";
import { createIron, type Iron } from "./core";
import { Director } from "./director";
import { GameDriver } from "./driver";
import { FirstRunLight, LIT_LINE, litFloors } from "./firstRun";
import { biasFor } from "./frame";
import { ShaftHud } from "./hud";
import { makeLayout, MINES } from "./layout";
import { cartAt, clickable, mineKey, planFromState, type ShaftPlan } from "./plan";
import { burst, burstWarmups } from "./burst";
import { construct, constructWarmups } from "./construct";
import { ShaftStage, type ShaftView } from "./stage";
import { Trophies } from "./trophies";
import { TrustLamps } from "./trust";

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
  // a factory that never shipped starts dark and lights floor by floor (firstRun.ts)
  private readonly firstRun = new FirstRunLight();
  private readonly said: HTMLElement;
  // the coming-back time-lapse (ui/away.ts): asked for before the shaft may be built, started on the first sync
  private lapse: Timelapse | null = null;
  private lapsing = false;
  private asked: string | null = null; // the last focus asked for, kept for a shaft that wasn't built yet
  private readonly trophies = new Trophies(); // a green lamp per shipped PR, by the assembler that built it
  private readonly clogs = new ClogView(); // the bottleneck, piling up where it lives (clog.ts)
  // build as you go (?buildout=1): what's built stands, the rest is gone, and the camera is the director's
  private readonly bo: Buildout | null;
  private director: Director | null = null;
  private readonly trust = new TrustLamps(); // trust in levels up the launch lift's tower

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
    this.bo = buildoutOn()
      ? new Buildout(
          {
            park: (target) => this.director?.park(target),
            light: (n) => this.litBy(n),
            bake: (holder) => this.bakeOne(holder),
            poke: () => (this.governor.poke(), (this.renderer.shadowMap.needsUpdate = true)),
          },
          this.reduceMotion,
        )
      : null;
    if (this.bo) this.firstRun.bindRise(this.bo.rise);
    this.said = document.createElement("div");
    this.said.className = "sr";
    this.said.setAttribute("aria-live", "polite");
    labelRoot.appendChild(this.said);

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
    if (this.director?.locked) return; // the first run's camera is parked on what's being built
    this.stage?.zoomBy(factor);
  }

  panBy(dx: number, dy: number) {
    this.governor.poke();
    if (!this.stage || this.director?.locked) return;
    this.stage.panBy(dx, dy);
    this.view = { view: "free", id: null };
    this.hud.syncFloors("free");
  }

  /** A drag ended. On a phone showing about one floor, the view settles on the nearest floor instead of stopping between two. */
  settle() {
    const stage = this.stage;
    if (!stage || this.view.view !== "free" || !stage.phone || this.director?.locked) return;
    const floor = stage.snapFloor();
    if (floor) this.setView(floor, null);
  }

  update(state: FactoryState) {
    this.state = state;
    this.bo?.sync(state); // before a rebuild, so the new shaft stands as built
    if (!this.fns) return; // the art is still loading: build once it's here
    // build as you go: the whole first-run shaft stands from the start (unbuilt parts gone), so builds never rebuild it
    const sp = this.bo ? fullPlan(planFromState(state)) : planFromState(state);
    if (!this.sp || sp.key !== this.sp.key) this.rebuild(sp);
    else this.sp = sp;
    this.driver?.sync(state);
    if (this.I) this.trophies.sync(this.I, state);
    if (this.I) this.clogs.set(this.I, clogOf(state), this.reduceMotion);
    this.trust.sync(state);
    this.hud.read(state, this.sp!);
    if (!this.bo) this.light(state);
    // every build done: free look (director.ts never touches the camera again)
    else if (!this.bo.step && !this.bo.busy && this.director?.locked) this.director.unlock();
    this.startLapse();
  }

  // Build as you go: a build finished and its floor lights (no swoop, the director has the camera).
  private litBy(n: number) {
    const floor = this.firstRun.set(n, this.reduceMotion);
    this.governor.poke();
    if (floor) this.said.textContent = LIT_LINE[floor];
  }

  // A machine finished rising: merge it like the rest of the shaft was (bake.ts), on its own.
  private bakeOne(holder: THREE.Object3D) {
    const root = this.stage?.root, I = this.I;
    if (!root || !I) return;
    const one = {
      children: [holder],
      updateMatrixWorld: (force?: boolean) => root.updateMatrixWorld(force),
      traverse: (fn: (o: THREE.Object3D) => void) => holder.traverse(fn),
      worldToLocal: (v: THREE.Vector3) => root.worldToLocal(v),
    };
    bakeShaft(I, one as unknown as THREE.Group);
    this.renderer.shadowMap.needsUpdate = true;
  }

  // A floor lit up: a quick swoop to it (a snap under reduced motion), unless you're looking somewhere yourself.
  private light(state: FactoryState) {
    const floor = this.firstRun.set(litFloors(state), this.reduceMotion);
    if (!floor) return;
    this.governor.poke();
    this.said.textContent = LIT_LINE[floor];
    if (!this.home && this.view.view !== "free" && this.view.view !== "station") this.setView(floor, null);
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

  private finishLapse() {
    const lapse = this.lapse;
    this.endTimelapse();
    lapse?.onOver();
  }

  private startLapse() {
    const lapse = this.lapse, I = this.I, driver = this.driver;
    if (!lapse || this.lapsing || !I || !driver?.state) return;
    this.lapsing = true;
    const placed = driver.beginLapse(lapse.refs, LAPSE_MAX_S * LAPSE_SPEED, () => this.finishLapse());
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
      if (o.name.startsWith("station:")) return this.bo?.hidden(o.name.slice(8)) ? undefined : sp.pick[o.name.slice(8)];
      if (o === mine) {
        // the nearest mine mouth to the hit
        const p = stage.root.worldToLocal(hit.point.clone());
        let best = "", d = Infinity;
        for (const src of Object.keys(MINES)) {
          const m = MINES[src];
          const dd = Math.hypot(p.x - m.x, (p.y - m.y) * 0.7);
          if (dd < d) (d = dd), (best = src);
        }
        return d < 6 && !this.bo?.mineHidden(best) ? mineKey(sp, best) : undefined;
      }
    }
    return undefined;
  }

  pick(clientX: number, clientY: number, rect: DOMRect): string | undefined {
    // a tap while something's being built hurries it along (the payoff always plays)
    if (this.bo?.busy) {
      this.bo.hurry();
      return undefined;
    }
    const key = this.keyAt(clientX, clientY, rect);
    return key && clickable(key) ? key : undefined;
  }

  private hoverAt = 0;
  hover(clientX: number, clientY: number, rect: DOMRect): boolean {
    if (this.director?.locked) return false;
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
    this.trophies.dispose();
    this.clogs.dispose();
    this.bo?.dispose();
    this.trust.dispose();
    this.hud.dispose();
    this.said.remove();
    this.renderer.dispose();
  }

  // ---------- building ----------

  // Build as you go: on the first frame of a new shaft, draw once more with every hidden machine showing, each one
  // mid-construct and mid-burst, then the real frame over it, so every shader a build uses compiles and links now and
  // revealing a piece never stalls the frame (and the player's hold) on a compile. One of each throwaway material a
  // build makes (sparks, arcs, flash) stays in the scene, hidden, so those programs are never dropped between builds.
  private warmPending = false;
  private warm(stage: ShaftStage, holders: THREE.Object3D[]) {
    const r = this.renderer;
    const reduced = this.reduceMotion;
    const extras = [...constructWarmups(), ...burstWarmups()];
    for (const o of extras) (o.frustumCulled = false), stage.root.add(o);
    const runs: (ReturnType<typeof construct> | ReturnType<typeof burst>)[] = [];
    const unculled = (): THREE.Object3D[] => {
      const out: THREE.Object3D[] = [];
      for (const h of holders)
        h.traverse((o) => {
          if (o.frustumCulled) (o.frustumCulled = false), out.push(o);
        });
      return out;
    };
    // three looks, each drawn with its shadows: early in a build, late in it (every part landed), and as it stands
    const look = () => {
      const culled = unculled();
      r.shadowMap.needsUpdate = true;
      try { stage.render(r); }
      finally { for (const o of culled) o.frustumCulled = true; }
    };
    try {
      for (const h of holders) {
        const c = construct(h, { reduced });
        runs.push(c);
        c.update(reduced ? 0.5 : 1.5); // register cleanup before any update can fail
        const b = burst(h, { first: true, reduced });
        runs.push(b);
        b.update(0.3);
      }
      look();
      if (!reduced) for (const run of runs) run.update(2);
      look();
      for (const run of runs.reverse()) run.cancel();
      runs.length = 0;
      look();
      for (const p of r.info.programs ?? []) p.getUniforms(); // finish linking now, not on first use
    } finally {
      for (const run of runs) run.cancel();
      for (const o of extras) o.visible = false;
      r.shadowMap.needsUpdate = true; // the real shadows, without the hidden machines
    }
  }

  private rebuild(sp: ShaftPlan) {
    // A new shaft cannot carry the old driver's replay timer. End it before carrying the real line.
    if (this.lapsing) this.finishLapse();
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
    this.bo?.attach(I, stage.root, layout); // what isn't built stays out of the bake
    bakeShaft(I, stage.root);
    const bo = this.bo;
    if (bo) {
      bo.afterBake();
      this.director = new Director(stage, layout, { reduceMotion: this.reduceMotion });
      if (!bo.step && !bo.busy) this.director.unlock();
      else bo.repark();
    }
    if (this.firstRun.level < 0 && this.state) this.firstRun.set(bo ? bo.litFloors : litFloors(this.state), this.reduceMotion); // the first look: no swoop
    this.firstRun.patch(stage.root, !!bo && !bo.complete);
    this.warmPending = !!bo;
    this.trophies.reset();
    stage.root.add(this.trophies.group);
    this.clogs.reset();
    this.clogs.scene = stage.scene;
    stage.root.add(this.clogs.group);
    this.trust.reset();
    stage.root.add(this.trust.group);
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
          this.buildStep(sec);
          stage.camStep(sec);
          this.firstRun.step(this.t, sec, this.reduceMotion);
          this.clogs.step(this.t, sec, this.reduceMotion);
        },
        clogs: this.clogs,
        clog: (c: Clog | null) => this.clogs.set(I, c, this.reduceMotion),
        firstRun: this.firstRun,
        buildout: this.bo,
        director: this.director,
        scene: this, // tests feed it states of their own (scripts/shots)
        trophies: this.trophies,
        view: (v: ShaftView, id?: string) => (this.setView(v, id ?? null, true), this.applyBias()),
        render: () => {
          this.renderer.info.reset();
          this.renderer.shadowMap.needsUpdate = true;
          stage.render(this.renderer);
          this.hud.place(this.W, this.H);
          this.quietChips();
          return { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles };
        },
      };
  }

  private teardown() {
    this.hud.clear();
    this.trophies.group.removeFromParent(); // its meshes outlive the shaft; I.dispose frees what's under the root
    this.clogs.group.removeFromParent();
    this.trust.group.removeFromParent();
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
    // the first run's camera is the director's: the game's own asks (a panel's focus, the welcome's wide shot) wait
    if (this.stage && !this.director?.locked) {
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
    const elapsed = Math.max(0, (now - this.last) / 1000);
    const dt = Math.min(0.05, elapsed);
    this.last = now;
    this.t += dt;
    I.step(this.t, dt);
    this.buildStep(dt, elapsed);
    stage.camStep(dt);
    this.firstRun.step(this.t, dt, this.reduceMotion);
    this.clogs.step(this.t, dt, this.reduceMotion);
    const shadows = this.governor.shadows();
    this.renderer.shadowMap.needsUpdate ||= shadows; // a build may have asked for one too
    if (this.warmPending && this.bo) {
      this.warmPending = false;
      this.bo.precompile((holders) => this.warm(stage, holders));
    }
    stage.render(this.renderer);
    this.hud.place(this.W, this.H);
    this.quietChips();
    perf.work(performance.now() - now);
  };

  // Build as you go, each frame: the build playing, the pool of light on the next site, the director's camera.
  private buildStep(dt: number, buildElapsed = dt) {
    const bo = this.bo;
    if (!bo) return;
    // Construction follows elapsed time; the camera and movement keep the physics clamp.
    bo.tick(this.t, buildElapsed);
    this.firstRun.spotAt(bo.spot());
    this.director?.step(this.t, dt);
    if (bo.busy) this.governor.poke();
  }

  // No chip names a machine or mine that isn't built (hud.ts places them; this only takes the unbuilt ones away).
  private quietChips() {
    const bo = this.bo;
    if (!bo || bo.complete) return;
    const chips = (this.hud as unknown as { chips: { el: HTMLElement; station?: { id: string }; mine?: string; key?: string }[] }).chips;
    for (const c of chips ?? []) {
      const gone = c.station ? bo.hidden(c.station.id) : c.mine ? bo.mineHidden(c.mine) : c.key === "rework" && !bo.shown.has("checks");
      if (gone && c.el.style.display !== "none") c.el.style.display = "none";
    }
  }
}
