// The shaft's in-world HUD, in the mockup's style (docs/black-iron.html .chip and .tag): a chip over every station and
// mine (name, state, what it's doing), the issue or PR number riding over each item, the game's pings over whatever
// needs you, and the floor buttons. ShaftScene owns the world and the camera; it hands this the shaft it built
// (build), the real factory (read), and calls place() after every frame it draws. Styles: shaft.css.

import type { FactoryState } from "@shiptorio/shared";

import type { Ping } from "../scene";
import type { Iron, IronItem, IronStation } from "./core";
import { chipAnchor, cover, isLandscapePhone, isPhone } from "./frame";
import { LEDGE_Z, MINES, TIERS } from "./layout";
import { clickable, mineKey, type ShaftPlan } from "./plan";
import type { ShaftStage, ShaftView } from "./stage";
import { lineOrder, quietWord, WORDS, workOnLine, type Work } from "./waiting";

export interface HudHost {
  pick(key: string): void; // a chip or ping was clicked: open that thing's panel
  goTo(view: ShaftView): void; // a floor button was pressed
  reframe?(): void; // the plates covering the map changed size: aim the camera again (frame.ts cover)
}

// the game's fixed plates over the map (App.tsx): the floor card and icons, the needs tray, the ticker, the controls
const PLATES = [".hudtop", ".needs-slot", ".ticker", ".ctrl", ".judge-header", ".judge-caption"];

// a quiet machine never says IDLE: it says what it's waiting on (waiting.ts)
const STATE_WORD: Record<string, string> = { WORKING: "WORKING", BLOCKED: "NEEDS YOU" };
const SHORT: Record<string, string> = {
  planner: "PLAN", ci: "CI", verify: "VERIFY", review: "REVIEW", gate: "GATE", launch: "PAD", orbit: "ORBIT", measure: "MEASURE",
  steam: "STEAM", dynamo: "DYNAMO", battery: "BATTERY", geothermal: "GEO",
};
const MINE_NAME: Record<string, string> = { github: "GITHUB ISSUES", sentry: "SENTRY", inbox: "SUPPORT INBOX", posthog: "POSTHOG" };
const MINE_SHORT: Record<string, string> = { github: "ISSUES", sentry: "SENTRY", inbox: "INBOX", posthog: "POSTHOG" };
// the mine a real item came out of, by its source
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

export class ShaftHud {
  hovered?: string; // the key under the pointer
  selected?: string; // the key whose panel is open
  showAll = false; // every label on (the keyboard is on the map, or the player asked)
  teaching = new Set<string>(); // labels the tour pins
  private world: { I: Iron; stage: ShaftStage; sp: ShaftPlan } | null = null;
  private chips: Chip[] = [];
  private readonly tags = new Map<IronItem, HTMLSpanElement>();
  private pings: PingEl[] = [];
  private readonly floors: HTMLElement;
  private readonly floorBtns = new Map<string, HTMLButtonElement>();
  private idleText = new Map<string, string>();
  private lineAt = new Map<string, number>(); // each line machine's place, planner up to orbit
  private work: Work[] = []; // where the real items stand on the line
  private watching = new Set<string>(); // orbit watches with launches to watch
  private mineWaiting = new Map<string, number>();
  private reworkCount = 0;
  private measuredAt = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly host: HudHost,
  ) {
    // a dev StrictMode remount can build the next hud before the last one is disposed, so count them on the root
    root.dataset.shaftHuds = String(Number(root.dataset.shaftHuds ?? 0) + 1);
    root.classList.add("shaft");
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
      b.addEventListener("click", () => this.host.goTo(view));
      this.floorBtns.set(view, b);
      return b;
    };
    for (const f of FLOORS) this.floors.append(btn(f.view, f.label, `Go to the ${f.label.toLowerCase()} floor`));
    this.floors.append(document.createElement("hr"));
    this.floors.append(btn("stack", "ALL", "See the whole shaft, mine to launch"));
    this.floors.append(btn("follow", "FOLLOW", "Ride along with the work furthest up the shaft"));
    root.append(this.floors);
  }

  /** a new shaft was built: a chip for each of its stations and mines */
  build(I: Iron, stage: ShaftStage, sp: ShaftPlan) {
    this.clear();
    this.world = { I, stage, sp };
    for (const st of I.stationList) {
      const key = sp.pick[st.id] ?? "";
      const power = !!st.layoutDef.power;
      const label = sp.labels[st.id] ?? st.label;
      const short = SHORT[st.type] ?? (st.type === "assembler" ? label.replace(/ ASSEMBLER$/, "").split(" ")[0] : label.replace(/ CHECK$/, ""));
      const c = this.makeChip(key, label, short, () => chipAnchor(st), !power);
      c.station = st;
      this.chips.push(c);
    }
    for (const src of Object.keys(MINES)) {
      const m = MINES[src];
      const live = src in sp.mines;
      const key = mineKey(sp, src) ?? "";
      if (!live && !key) continue;
      const c = this.makeChip(key, MINE_NAME[src], MINE_SHORT[src], () => [m.x + 0.4, m.y - 1.2, LEDGE_Z + 0.9], true);
      c.mine = src;
      if (!live) c.el.classList.add("ghost");
      this.chips.push(c);
    }
    const ck = TIERS.checks;
    this.chips.push(this.makeChip("rework", "REWORK", "REWORK", () => [-12, ck.y + 0.1, ck.z1 + 0.6], false));
  }

  /** the shaft is gone (rebuilding, or the map closed) */
  clear() {
    for (const c of this.chips) c.el.remove();
    this.chips = [];
    for (const el of this.tags.values()) el.remove();
    this.tags.clear();
    this.world = null;
  }

  /** the real numbers the chips show: what an idle machine is waiting on, ore waiting at each mine, rework */
  read(state: FactoryState, sp: ShaftPlan) {
    if (this.world) this.world.sp = sp;
    const idle = new Map<string, string>();
    const items = state.items;
    const n = (pred: (s: (typeof items)[number]) => boolean) => items.filter(pred).length;
    const queued = n((i) => i.state === "queued");
    idle.set(sp.plan.planner!.id, queued ? `${queued} planned · waiting for a builder` : "waiting for work");
    for (const a of state.machines.filter((m) => m.type === "assembler")) {
      if (!a.harness && !a.powerId) idle.set(a.id, "no power · sign in to build");
      else idle.set(a.id, "waiting for a plan");
    }
    for (const s of state.stations ?? []) {
      if (s.kind === "orbit") idle.set(s.id, s.wip ? `watching ${s.wip} launch${s.wip > 1 ? "es" : ""}` : s.lastLog?.ok === false ? "caught a comeback" : "all clear");
      else if (s.kind === "merge") idle.set(s.id, "waiting for passed PRs");
      else idle.set(s.id, s.caughtThisWeek ? `caught ${s.caughtThisWeek} this week` : "waiting for PRs");
    }
    const pad = state.machines.find((m) => m.type === "launch_pad");
    if (pad) idle.set(pad.id, "merge = launch");
    this.idleText = idle;
    this.lineAt = lineOrder(sp.plan);
    this.work = workOnLine(items, sp.plan, this.lineAt);
    this.watching = new Set((state.stations ?? []).filter((s) => s.kind === "orbit" && s.wip).map((s) => s.id));
    const waiting = new Map<string, number>();
    for (const i of items) {
      if (i.state !== "ore" && i.state !== "queued") continue;
      const mine = MINE_OF_SOURCE[i.source] ?? "github";
      waiting.set(mine, (waiting.get(mine) ?? 0) + 1);
    }
    this.mineWaiting = waiting;
    this.reworkCount = n((i) => i.state === "rejected");
  }

  /** Pin pings to pick keys (station id, "m:<machine id>", "src:<kind>", "rework"). An empty list clears them. */
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
        el.addEventListener("click", () => this.host.pick(me.key));
        this.root.appendChild(el);
        this.pings.push(pe);
      }
      pe.key = p.key;
      pe.el.className = `mapping${p.quiet ? " quiet" : ""}${p.tone === "ok" ? " ok" : ""}`;
      pe.join.hidden = !p.code;
      if (pe.title.textContent !== p.title) pe.title.textContent = p.title;
      if (pe.code.textContent !== (p.code ?? "")) pe.code.textContent = p.code ?? "";
    });
  }

  /** light the floor button for the view the camera is on */
  syncFloors(view: ShaftView) {
    for (const [v, b] of this.floorBtns) b.setAttribute("aria-pressed", String(view === v));
  }

  /** after every frame: move the chips, tags and pings onto what they're about */
  place(W: number, H: number) {
    const w = this.world;
    if (!w) return;
    const { I, stage } = w;
    const phone = isPhone(W);
    this.measureCover(W, H);
    const pinged = new Set(this.pings.map((p) => p.key));
    const floorView = stage.view !== "stack" && stage.view !== "follow" && stage.view !== "free";
    // a chip or ping under a plate can't be read or tapped, so it waits until the camera brings it out
    const top = cover.top + 4, bottom = H - cover.bottom - 4;
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
      // Quiet by default: a chip speaks up only when its machine has work in hand, is stuck, has a ping, or its mine
      // has ore waiting. Idle ones come back when asked for (hover, keyboard on the map, selected, the tour), and
      // as a faint name when the camera is down on one floor.
      const busy = c.station ? hot || (t.s === "WORKING" && !!c.station.item) : t.s === "WORKING";
      const asked = teaching || this.showAll || (!!c.key && (c.key === this.hovered || c.key === this.selected));
      const loud = busy || pinged.has(c.key) || asked;
      const faint = !loud && floorView && (c.always || !!c.station) && !(c.key === "rework" && !this.reworkCount);
      const shown = loud || faint;
      c.el.classList.toggle("faint", faint);
      c.el.classList.toggle("teaching", teaching);
      c.el.classList.toggle("sel", !!c.key && c.key === this.selected);
      const [x, y] = stage.project(...c.at());
      const off = !shown || x < 0 || x > W || y < top || y > bottom;
      if (off) {
        if (c.el.style.display !== "none") c.el.style.display = "none";
        continue;
      }
      if (c.el.style.display === "none") c.el.style.display = "";
      placed.push({ c, x, y, w: 0, h: 0, rank: hot ? 0 : teaching || c.key === this.selected ? 1 : faint ? 4 : t.s === "WORKING" ? 2 : 3 });
    }
    // read every size once, then write every position (no layout thrash)
    for (const p of placed) (p.w = p.c.el.offsetWidth), (p.h = p.c.el.offsetHeight);
    // a chip whose machine is on screen stays whole: slide it in from the edge rather than cut it off
    for (const p of placed) p.x = Math.min(Math.max(p.x, p.w / 2 + 4), W - p.w / 2 - 4);
    // chips that would overlap: the more important one stays, the other moves down under it (phones: it hides)
    placed.sort((a, b) => a.rank - b.rank || a.y - b.y);
    const kept: Placed[] = [];
    for (const p of placed) {
      let clash = kept.find((q) => Math.abs(p.x - q.x) < (p.w + q.w) / 2 + 2 && Math.abs(p.y - q.y) < (p.h + q.h) / 2 + 2);
      if (clash && (p.rank === 4 || (phone && p.rank >= 2))) {
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
          this.root.insertBefore(el, this.floors);
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
      const off = x < -40 || x > W + 40 || y < top + 12 || y > bottom;
      pe.el.style.display = off ? "none" : "flex";
      if (off) continue;
      pe.el.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
      pe.el.classList.toggle("flip", x + pe.el.offsetWidth > W - 8);
    }
  }

  /**
   * Every quarter second: how much of the map's top and bottom the game's plates hide. A band counts when the plates
   * in it span most of the width together (a phone's stacked plates, a landscape phone's ticker plus controls), not
   * for a desktop's corner cards. On a change the camera reframes so the floor sits in what's left.
   */
  private measureCover(W: number, H: number) {
    const now = performance.now();
    if (now - this.measuredAt < 250) return;
    this.measuredAt = now;
    const box = this.root.getBoundingClientRect();
    const bands = { top: { px: 0, span: 0 }, bottom: { px: 0, span: 0 } };
    const els: Element[] = PLATES.map((q) => document.querySelector(q)).filter((e): e is Element => !!e);
    if (isPhone(W) && !isLandscapePhone(W, H)) els.push(this.floors);
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const t = r.top - box.top, b = r.bottom - box.top;
      const span = Math.min(r.right, box.right) - Math.max(r.left, box.left);
      if (span <= 0 || b <= 0 || t >= H) continue;
      if (t < H * 0.4) (bands.top.px = Math.max(bands.top.px, b)), (bands.top.span += span);
      else if (b > H * 0.6) (bands.bottom.px = Math.max(bands.bottom.px, H - t)), (bands.bottom.span += span);
    }
    const q = (n: number) => Math.round(n / 4) * 4;
    const topPx = bands.top.span > W * 0.55 ? q(bands.top.px) : 0;
    const bottomPx = bands.bottom.span > W * 0.55 ? q(bands.bottom.px) : 0;
    if (topPx === cover.top && bottomPx === cover.bottom) return;
    cover.top = topPx;
    cover.bottom = bottomPx;
    this.host.reframe?.();
  }

  dispose() {
    this.clear();
    for (const pe of this.pings) pe.el.remove();
    this.pings = [];
    this.floors.remove();
    cover.top = cover.bottom = 0;
    const left = Number(this.root.dataset.shaftHuds ?? 1) - 1;
    this.root.dataset.shaftHuds = String(left);
    if (left <= 0) this.root.classList.remove("shaft");
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
    if (clickable(key)) el.addEventListener("click", () => this.host.pick(key));
    el.style.display = "none";
    this.root.insertBefore(el, this.floors);
    return { key, el, nm, st: nm.querySelector(".st") as HTMLElement, det, sig: "", at, always };
  }

  private chipText(c: Chip): { s: string; word: string; det: string } {
    if (c.station) {
      const st = c.station;
      const s = st.blocked ? "BLOCKED" : st.state;
      const q = st.M.queue();
      const idle = this.idleText.get(st.id);
      if (s === "IDLE") {
        // what it's waiting on: the next real item up the line, or you, when that item is parked on your card
        const at = this.lineAt.get(st.id);
        const I = this.world?.I;
        const w = at === undefined || this.watching.has(st.id) ? null : quietWord(at, this.work, (id) => !!I?.stations[id]?.blocked, st.id);
        if (w) return { s, word: w.word, det: w.det };
        return { s, word: this.watching.has(st.id) ? WORDS.watch : WORDS.ready, det: idle ?? st.detail ?? "" };
      }
      const det = st.blocked ? st.prompt ?? "" : (st.detail || "") + (q > 1 ? ` · ${q} waiting` : "");
      return { s, word: STATE_WORD[s] ?? s, det };
    }
    if (c.mine) {
      const live = this.world ? c.mine in this.world.sp.mines : false;
      if (!live) return { s: "IDLE", word: "", det: "not connected · tap to connect" };
      const n = this.mineWaiting.get(c.mine) ?? 0;
      return { s: n ? "WORKING" : "IDLE", word: "", det: n ? `${n} waiting` : "all dug out" };
    }
    const n = this.reworkCount;
    return { s: n ? "WORKING" : "IDLE", word: "", det: `back to the planner · ${n} item${n === 1 ? "" : "s"}` };
  }
}
