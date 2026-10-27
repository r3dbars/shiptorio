// The shaft in the game (?world=shaft): the vertical Black Iron factory driven by the real FactoryState. Same public
// API as FactoryScene (map/scene.ts), so FactoryMap can swap one for the other. The engine (core.js), the layout
// (layout.js) and the art (modules/*.js) are the dev harness's (harness.ts); this adds the real driver (driver.ts),
// a plan read off the real machines (plan.ts), the chips, item tags and pings in the mockup's style, picking, and
// the game's camera asks (focus, overview, lift).

import "./shaft.css";

import * as THREE from "three";

import type { FactoryState } from "@shiptorio/shared";

import { perf } from "../perf";
import { FrameGovernor } from "../quality";
import type { Cosmetics, Ping } from "../scene";
import type { SatelliteSpec } from "../empire";
import { bakeShaft } from "./bake";
import { createIron, type Iron, type IronItem, type IronStation } from "./core";
import { GameDriver } from "./driver";
import { LEDGE_Z, makeLayout, MINES, TIERS } from "./layout";
import { GHOST_KEY, planFromState, type ShaftPlan } from "./plan";
import { ShaftStage, type ShaftView } from "./stage";

// the mockup's art was tuned without color management (three r128); the engine's lights are patched to match
THREE.ColorManagement.enabled = false;

type Install = (I: Iron) => void;
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

const STATE_WORD: Record<string, string> = { IDLE: "IDLE", WORKING: "WORKING", BLOCKED: "NEEDS YOU" };
const SHORT: Record<string, string> = {
  planner: "PLAN", ci: "CI", verify: "VERIFY", review: "REVIEW", gate: "GATE", launch: "PAD", orbit: "ORBIT", measure: "MEASURE",
  steam: "STEAM", dynamo: "DYNAMO", battery: "BATTERY", geothermal: "GEO",
};
const MINE_NAME: Record<string, string> = { github: "GITHUB ISSUES", sentry: "SENTRY", inbox: "SUPPORT INBOX", posthog: "POSTHOG" };
const MINE_SHORT: Record<string, string> = { github: "ISSUES", sentry: "SENTRY", inbox: "INBOX", posthog: "POSTHOG" };
const MINE_OF_SOURCE: Record<string, string> = { github_issue: "github", lint: "github", sentry: "sentry", posthog: "posthog", inbox: "inbox" };
const FLOORS: { view: ShaftView; label: string }[] = [
  { view: "launch", label: "LAUNCH" },
  { view: "checks", label: "CHECKS" },
  { view: "build", label: "BUILD" },
  { view: "mine", label: "MINE" },
];

interface Chip {
  key: string; // what a click opens ("ci-1", "m:assembler-1", "src:sentry", "rework")
  el: HTMLButtonElement;
  nm: HTMLElement;
  st: HTMLElement;
  det: HTMLElement;
  sig: string;
  at: () => [number, number, number]; // root point it stands on
  always: boolean; // shown even when not hovered (line machines and mines)
  station?: IronStation;
  mine?: string;
}

interface PingEl {
  key: string;
  el: HTMLButtonElement;
  title: HTMLElement;
  join: HTMLElement;
  code: HTMLElement;
}

const clickable = (key: string) => !!key && !key.startsWith("d:") && key !== "drone";

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
  private chips: Chip[] = [];
  private readonly tags = new Map<IronItem, HTMLSpanElement>();
  private pings: PingEl[] = [];
  private readonly floors: HTMLElement;
  private readonly floorBtns = new Map<string, HTMLButtonElement>();
  // ?raf=0: no animation loop; tests step and draw it themselves (window.__shaft, dev only)
  private readonly manual = new URLSearchParams(location.search).get("raf") === "0";
  private hovered?: string;
  private selected?: string;
  private showAll = false;
  private teaching = new Set<string>();
  private lift = 0;
  private home: { view: ShaftView; id: string | null } | null = null;
  private view: { view: ShaftView; id: string | null } = { view: "stack", id: null };
  private readonly ray = new THREE.Raycaster();
  private idleText = new Map<string, string>();
  private mineWaiting = new Map<string, number>();
  private reworkCount = 0;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly labelRoot: HTMLElement,
    private readonly onPick?: (id: string) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(1);
    this.renderer.info.autoReset = false;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.shadowMap.autoUpdate = false; // the frame governor says when
    labelRoot.classList.add("shaft");

    // the elevator panel: one button per floor, the whole shaft, and follow-the-work
    this.floors = document.createElement("nav");
    this.floors.className = "shaftfloors";
    this.floors.setAttribute("aria-label", "Floors");
    const eb = document.createElement("span");
    eb.className = "eyebrow";
    eb.textContent = "FLOOR";
    eb.setAttribute("aria-hidden", "true");
    this.floors.append(eb);
    const btn = (view: ShaftView, label: string, title: string) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.title = title;
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", () => this.goTo(view));
      this.floorBtns.set(view, b);
      return b;
    };
    for (const f of FLOORS) this.floors.append(btn(f.view, f.label, `Go to the ${f.label.toLowerCase()} floor`));
    this.floors.append(document.createElement("hr"));
    this.floors.append(btn("stack", "ALL", "See the whole shaft, mine to launch"));
    this.floors.append(btn("follow", "FOLLOW", "Ride along with the work furthest up the shaft"));
    labelRoot.append(this.floors);
    this.syncFloorBtns();

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
    this.syncFloorBtns();
  }

  update(state: FactoryState) {
    this.state = state;
    if (!this.fns) return; // the art is still loading: build once it's here
    const sp = planFromState(state);
    if (!this.sp || sp.key !== this.sp.key) this.rebuild(sp);
    else this.sp = sp;
    this.driver?.sync(state);
    this.readState(state);
  }

  keyAt(clientX: number, clientY: number, rect: DOMRect): string | undefined {
    this.governor.poke();
    const I = this.I, stage = this.stage, sp = this.sp;
    if (!I || !stage || !sp) return undefined;
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
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
        return d < 6 ? this.mineKey(best) : undefined;
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
      this.hovered = this.keyAt(clientX, clientY, rect);
    }
    return !!this.hovered && clickable(this.hovered);
  }

  clearHover() {
    this.hovered = undefined;
  }

  setTeachingKeys(keys: string[]) {
    this.teaching = new Set(keys);
  }

  setShowAllLabels(on: boolean) {
    this.showAll = on;
  }

  // Pin pings to pick keys (station id, "m:<machine id>", "src:<kind>", "rework"). An empty list clears them.
  setPings(list: Ping[]) {
    while (this.pings.length > list.length) this.pings.pop()!.el.remove();
    list.forEach((p, n) => {
      let pe = this.pings[n];
      if (!pe) {
        const el = document.createElement("button");
        el.type = "button";
        const dot = document.createElement("i");
        const tag = document.createElement("span");
        const title = document.createElement("b");
        const code = document.createElement("code");
        const join = document.createElement("span");
        join.className = "sr";
        join.textContent = " in ";
        pe = { key: p.key, el, title, code, join };
        tag.append(title, join, code);
        el.append(dot, tag);
        const me = pe;
        el.addEventListener("click", () => this.onPick?.(me.key));
        this.labelRoot.appendChild(el);
        this.pings.push(pe);
      }
      pe.key = p.key;
      pe.el.className = `mapping${p.quiet ? " quiet" : ""}${p.tone === "ok" ? " ok" : ""}`;
      pe.join.hidden = !p.code;
      if (pe.title.textContent !== p.title) pe.title.textContent = p.title;
      if (pe.code.textContent !== (p.code ?? "")) pe.code.textContent = p.code ?? "";
    });
  }

  // Fly in on a picked thing (its panel is open), or back to where you were (null).
  focus(key: string | null) {
    this.selected = key ?? undefined;
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
    for (const pe of this.pings) pe.el.remove();
    this.pings = [];
    this.floors.remove();
    this.labelRoot.classList.remove("shaft");
    this.renderer.dispose();
  }

  // ---------- building ----------

  private rebuild(sp: ShaftPlan) {
    const keep = this.stage ? { zoom: this.stage.zoom } : null;
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
    const small = (window.matchMedia?.("(pointer: coarse)").matches ?? false) || (navigator.hardwareConcurrency ?? 8) <= 4;
    const stage = new ShaftStage(I, layout, { shadowMap: small ? 1024 : 2048 });
    stage.reduceMotion = this.reduceMotion;
    I.build(stage.scene, stage.root, layout, { labels: sp.labels, warm: false });
    stage.applyLook();
    bakeShaft(I, stage.root);
    this.I = I;
    this.stage = stage;
    this.driver = driver;
    this.sp = sp;
    stage.setSize(this.W, this.H);
    if (keep) stage.zoom = keep.zoom;
    this.makeChips();
    this.setView(this.view.view === "station" && this.view.id && !I.stations[this.view.id] ? "stack" : this.view.view, this.view.id, true);
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
          this.placeHud();
          return { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles };
        },
      };
  }

  private teardown() {
    for (const c of this.chips) c.el.remove();
    this.chips = [];
    for (const el of this.tags.values()) el.remove();
    this.tags.clear();
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
    this.syncFloorBtns();
  }

  private syncFloorBtns() {
    for (const [v, b] of this.floorBtns) b.setAttribute("aria-pressed", String(this.view.view === v));
  }

  // what's on screen sits higher when the bottom is covered (a card, a sheet, the phone controls)
  private applyBias() {
    if (!this.stage) return;
    const phone = this.W <= 760 || this.H <= 500;
    const focused = !!this.home;
    this.stage.bias = this.lift ? { x: 0, y: this.lift } : phone ? (this.H <= 500 && this.W > this.H ? { x: focused ? -0.22 : 0, y: 0 } : { x: 0, y: focused ? 0.22 : 0.05 }) : { x: 0, y: 0 };
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
    return undefined;
  }

  private mineKey(src: string): string | undefined {
    const id = this.sp?.mines[src];
    if (id) return `m:${id}`;
    if (this.sp && src in this.sp.mines) return undefined; // connected, no deposit machine: nothing to open
    return GHOST_KEY[src];
  }

  // ---------- chips, tags, pings ----------

  // the real numbers the chips show when a machine is idle
  private readState(state: FactoryState) {
    const idle = new Map<string, string>();
    const items = state.items;
    const n = (pred: (s: (typeof items)[number]) => boolean) => items.filter(pred).length;
    const queued = n((i) => i.state === "queued");
    if (this.sp) {
      idle.set(this.sp.plan.planner!.id, queued ? `${queued} planned · waiting for a builder` : "waiting for work");
      for (const a of state.machines.filter((m) => m.type === "assembler")) {
        if (!a.harness && !a.powerId) idle.set(a.id, "no power · sign in to build");
        else idle.set(a.id, "waiting for a plan");
      }
    }
    for (const s of state.stations ?? []) {
      if (s.kind === "orbit") idle.set(s.id, s.wip ? `watching ${s.wip} launch${s.wip > 1 ? "es" : ""}` : s.lastLog?.ok === false ? "caught a comeback" : "all clear");
      else if (s.kind === "merge") idle.set(s.id, "waiting for passed PRs");
      else idle.set(s.id, s.caughtThisWeek ? `caught ${s.caughtThisWeek} this week` : "waiting for PRs");
    }
    const pad = state.machines.find((m) => m.type === "launch_pad");
    if (pad) idle.set(pad.id, "merge = launch");
    this.idleText = idle;
    const waiting = new Map<string, number>();
    for (const i of items) if (i.state === "ore" || i.state === "queued") waiting.set(MINE_OF_SOURCE[i.source] ?? "github", (waiting.get(MINE_OF_SOURCE[i.source] ?? "github") ?? 0) + 1);
    this.mineWaiting = waiting;
    this.reworkCount = n((i) => i.state === "rejected");
  }

  private makeChip(key: string, long: string, short: string, at: () => [number, number, number], always: boolean): Chip {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "maplabel";
    el.dataset.s = "IDLE";
    const nm = document.createElement("span");
    nm.className = "nm";
    nm.innerHTML = `<i class="dot"></i><span class="long"></span><span class="short"></span><span class="st"></span>`;
    (nm.querySelector(".long") as HTMLElement).textContent = long;
    (nm.querySelector(".short") as HTMLElement).textContent = short;
    const row = document.createElement("span");
    row.className = "row2";
    const det = document.createElement("span");
    det.className = "det";
    row.append(det);
    el.append(nm, row);
    if (clickable(key)) el.addEventListener("click", () => this.onPick?.(key));
    el.style.display = "none";
    this.labelRoot.insertBefore(el, this.floors);
    return { key, el, nm, st: nm.querySelector(".st") as HTMLElement, det, sig: "", at, always };
  }

  private makeChips() {
    const I = this.I!, stage = this.stage!, sp = this.sp!;
    for (const st of I.stationList) {
      const key = sp.pick[st.id] ?? "";
      const power = !!st.layoutDef.power;
      const label = sp.labels[st.id] ?? st.label;
      const short = SHORT[st.type] ?? (st.type === "assembler" ? label.replace(/ ASSEMBLER$/, "").split(" ")[0] : label.replace(/ CHECK$/, ""));
      const c = this.makeChip(key, label, short, () => stage.chipAnchor(st), !power);
      c.station = st;
      this.chips.push(c);
    }
    for (const src of Object.keys(MINES)) {
      const m = MINES[src];
      const live = src in sp.mines;
      const key = this.mineKey(src) ?? "";
      if (!live && !key) continue;
      const c = this.makeChip(key, MINE_NAME[src], MINE_SHORT[src], () => [m.x + 0.4, m.y - 1.2, LEDGE_Z + 0.9], true);
      c.mine = src;
      if (!live) c.el.classList.add("ghost");
      this.chips.push(c);
    }
    const ck = TIERS.checks;
    const rw = this.makeChip("rework", "REWORK", "REWORK", () => [-12, ck.y + 0.1, ck.z1 + 0.6], false);
    this.chips.push(rw);
  }

  private chipText(c: Chip): { s: string; word: string; det: string } {
    if (c.station) {
      const st = c.station;
      const s = st.blocked ? "BLOCKED" : st.state;
      const q = st.M.queue();
      const idle = this.idleText.get(st.id);
      const det = st.blocked ? st.prompt ?? "" : s === "WORKING" ? (st.detail || "") + (q > 1 ? ` · ${q} waiting` : "") : idle ?? st.detail ?? "";
      return { s, word: STATE_WORD[s] ?? s, det };
    }
    if (c.mine) {
      const live = this.sp ? c.mine in this.sp.mines : false;
      if (!live) return { s: "IDLE", word: "", det: "not connected · tap to connect" };
      const n = this.mineWaiting.get(c.mine) ?? 0;
      return { s: n ? "WORKING" : "IDLE", word: "", det: n ? `${n} waiting` : "all dug out" };
    }
    const n = this.reworkCount;
    return { s: n ? "WORKING" : "IDLE", word: "", det: `back to the planner · ${n} item${n === 1 ? "" : "s"}` };
  }

  private placeHud() {
    const stage = this.stage, I = this.I;
    if (!stage || !I) return;
    const W = this.W, H = this.H;
    const phone = W <= 760;
    type Placed = { c: Chip; x: number; y: number; w: number; h: number; rank: number };
    const placed: Placed[] = [];
    for (const c of this.chips) {
      const t = this.chipText(c);
      const sig = `${t.s}|${t.word}|${t.det}`;
      if (sig !== c.sig) {
        c.sig = sig;
        c.el.dataset.s = t.s;
        c.st.textContent = t.word;
        c.det.textContent = t.det;
        const name = (c.nm.querySelector(".long") as HTMLElement).textContent ?? "";
        c.el.setAttribute("aria-label", `${name}${t.word ? `, ${t.word.toLowerCase()}` : ""}${t.det ? `: ${t.det}` : ""}`);
      }
      const hot = t.s === "BLOCKED";
      const teaching = this.teaching.has(c.key);
      const shown = c.always ? !(c.key === "rework" && !this.reworkCount) : hot || teaching || this.showAll || (!!c.key && (c.key === this.hovered || c.key === this.selected)) || (c.key === "rework" && this.reworkCount > 0);
      c.el.classList.toggle("teaching", teaching);
      c.el.classList.toggle("sel", !!c.key && c.key === this.selected);
      const [x, y] = stage.project(...c.at());
      const off = !shown || x < -120 || x > W + 120 || y < -40 || y > H + 40;
      if (off) {
        if (c.el.style.display !== "none") c.el.style.display = "none";
        continue;
      }
      if (c.el.style.display === "none") c.el.style.display = "";
      placed.push({ c, x, y, w: 0, h: 0, rank: hot ? 0 : teaching || c.key === this.selected ? 1 : t.s === "WORKING" ? 2 : 3 });
    }
    // read every size once, then write every position (no layout thrash)
    for (const p of placed) (p.w = p.c.el.offsetWidth), (p.h = p.c.el.offsetHeight);
    // chips that would overlap: the more important one stays, the other moves down under it (phones: it hides)
    placed.sort((a, b) => a.rank - b.rank || a.y - b.y);
    const kept: Placed[] = [];
    for (const p of placed) {
      let clash = kept.find((q) => Math.abs(p.x - q.x) < (p.w + q.w) / 2 + 2 && Math.abs(p.y - q.y) < (p.h + q.h) / 2 + 2);
      if (clash && phone && p.rank >= 2) {
        p.c.el.style.display = "none";
        continue;
      }
      for (let n = 0; clash && n < 4; n++) {
        p.y = clash.y + (clash.h + p.h) / 2 + 2;
        clash = kept.find((q) => q !== p && Math.abs(p.x - q.x) < (p.w + q.w) / 2 + 2 && Math.abs(p.y - q.y) < (p.h + q.h) / 2 + 2);
      }
      kept.push(p);
      p.c.el.style.transform = `translate(${Math.round(p.x - p.w / 2)}px,${Math.round(p.y - p.h / 2)}px)`;
    }

    // item tags: wide screens, close enough to read
    const tagsOn = !phone && stage.viewH * stage.zoom <= 40;
    const seen = new Set<IronItem>();
    if (tagsOn)
      for (const it of I.items) {
        if (it.hidden || it.gone) continue;
        seen.add(it);
        let el = this.tags.get(it);
        if (!el) {
          el = document.createElement("span");
          el.setAttribute("aria-hidden", "true");
          this.labelRoot.insertBefore(el, this.floors);
          this.tags.set(it, el);
        }
        const held = !!it.owner && !!I.stations[it.owner]?.blocked;
        const text = it.label();
        if (el.textContent !== text) el.textContent = text;
        const cls = `tag k-${it.kind}${held ? " held" : ""}`;
        if (el.className !== cls) el.className = cls;
        const p = it.mesh.position;
        const [x, y] = stage.project(p.x, p.y + 0.75, p.z);
        el.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px) translate(-50%,-100%)`;
      }
    for (const [it, el] of this.tags) if (!seen.has(it)) (el.remove(), this.tags.delete(it));

    // pings: over the machine they're about
    for (const pe of this.pings) {
      const c = this.chips.find((x) => x.key === pe.key);
      const st = c?.station;
      const at: [number, number, number] | undefined = st ? [st.x, st.y + 3.4, st.z] : c?.at();
      if (!at) {
        if (pe.el.style.display !== "none") pe.el.style.display = "none";
        continue;
      }
      const [x, y] = stage.project(...at);
      const off = x < -40 || x > W + 40 || y < -20 || y > H + 20;
      pe.el.style.display = off ? "none" : "flex";
      if (off) continue;
      pe.el.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
      pe.el.classList.toggle("flip", x + pe.el.offsetWidth > W - 8);
    }
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
    this.placeHud();
    perf.work(performance.now() - now);
  };
}
