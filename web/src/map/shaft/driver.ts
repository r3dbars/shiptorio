// The game's driver: the shaft follows the real factory. Every ore lump, deck of punch cards and capsule on the line
// is a real item (a GitHub issue, a Sentry error, a PR), and every machine holds its item exactly as long as the
// real work takes. The planner hands a lump to a builder when the real factory starts building it, the assembler
// keeps punching until the real PR is open, a check keeps scanning until CI (or the verify bay, or the review)
// really answers, and the gate waits on your merge. When the line is behind (the page just opened, the server moved
// fast), items ride faster to catch up. They never jump.

import type { FactoryState, Item, Move, ScarTag } from "@shiptorio/shared";

import { SOURCE_OF, type Driver, type Iron, type IronItem, type IronStation, type Verdict } from "./core";
import type { Layout } from "./layout";

const PASS: Verdict = { pass: true, reason: null };
// how far along the line each real state is (0 mine, 1 planner, 2 builders, 3 checks, 4 launch floor, 5 the pad)
const REAL_STAGE: Record<Item["state"], number> = { ore: 0, queued: 1, working: 2, inspecting: 3, rejected: 3, passed: 4, on_pad: 4, launched: 5 };
const UPSTREAM_CAP = 6; // lumps on their way up to the planner at once; the rest wait in the mine
const BLOCKING_KINDS = new Set(["ship", "build", "unblock"]);
const BLOCKING_STAGES = new Set(["pad", "build", "power", "resources"]);
const SORTED = 0x7af0d8; // the flash on a lump the planner has read (ore -> queued)

const WORD: Record<string, string> = { sentry: "ERROR", posthog: "SIGNAL", inbox: "MAIL", lint: "LINT", github_issue: "ISSUE" };

// what the item's tag says: the PR number once there is one, the issue number before, else what it is
export function tagText(r: Item): string {
  if (r.prNumber) return `#${r.prNumber}`;
  const gh = /^gh-(\d+)$/.exec(r.id);
  return gh ? `#${gh[1]}` : WORD[r.source] ?? "ITEM";
}

function stageOfPath(name: string): number {
  if (name.startsWith("cart-") || name.startsWith("chute-") || name === "collector" || name === "lift") return 0;
  if (name === "ore" || name === "rw-in" || name === "rw-drop" || name === "rework" || name.startsWith("drop-") || name.startsWith("gate-")) return 1;
  if (name.startsWith("feed-") || name.startsWith("spur-")) return 2;
  if (name.startsWith("tube-") || name === "header" || name === "ci-feed" || name.startsWith("lane-")) return 3;
  return 4; // to-lift, freight, to-gate, to-pad
}
const STAGE_OF_TYPE: Record<string, number> = { planner: 1, assembler: 2, ci: 3, check: 3, verify: 3, review: 3, gate: 4, launch: 5 };

export class GameDriver implements Driver {
  readonly name = "game";
  private state: FactoryState | null = null;
  private real = new Map<string, Item>();
  private prev = new Map<string, Item["state"]>();
  private shown = new Map<string, number>(); // scars the line has already played out, per real item
  private lastAsm = new Map<string, string>(); // the assembler each item was last built on
  private launched = new Set<string>(); // shipped on the map (a later comeback rides back down from the gate)
  private verdicts = new WeakMap<IronItem, Map<string, Verdict>>(); // one verdict per visit to a station
  private decisions = new Map<string, string>();
  private warmed = false;
  private tick = 0;
  private readonly line: string[]; // check station ids, in line order
  private readonly asms: string[];

  constructor(
    private readonly I: Iron,
    private readonly layout: Layout,
  ) {
    this.line = layout.checks.map((c) => c.id);
    this.asms = layout.assemblers.map((a) => a.id);
    I.on("reject", ({ item, station }: { item: IronItem; station: string }) => {
      const memo = this.verdicts.get(item)?.get(station);
      // a reject the line played for a real scar uses that scar up
      if (memo && !memo.pass && item.ref && (memo as Verdict & { scar?: boolean }).scar) this.shown.set(item.ref, (this.shown.get(item.ref) ?? 0) + 1);
    });
    I.on("take", ({ item }: { item: IronItem }) => this.verdicts.delete(item));
    I.on("ship", ({ item }: { item: IronItem }) => item.ref && this.launched.add(item.ref));
  }

  /** a new FactoryState: remember it, work out who is waiting on the player, place the line on the first one */
  sync(state: FactoryState) {
    this.state = state;
    this.real = new Map(state.items.map((r) => [r.id, r]));
    for (const r of state.items) if (r.state === "working" && r.machineId && this.asms.includes(r.machineId)) this.lastAsm.set(r.id, r.machineId);
    this.decisions = this.findDecisions(state);
    for (const it of [...this.I.items]) {
      if (!it.ref) continue;
      const r = this.real.get(it.ref);
      if (!r) {
        // the real item is gone: a lump that never got built just vanishes (closed); anything further along carries on
        if (it.kind === "issue" && !it.owner) this.I.removeItem(it);
        continue;
      }
      const text = tagText(r);
      if (it.label() !== text || it.title !== r.title) this.I.relabel(it, { title: r.title, label: () => text });
      if (this.prev.get(r.id) === "ore" && r.state === "queued" && it.kind === "issue") it.flash(SORTED);
    }
    this.prev = new Map(state.items.map((r) => [r.id, r.state]));
    if (!this.warmed) {
      this.warmed = true;
      this.warm();
    }
  }

  // ---------- the hooks the engine asks ----------

  intake(dt: number) {
    if (!this.state) return;
    this.tick += dt;
    if (this.tick < 0.25) return;
    this.tick = 0;
    const have = new Set(this.I.items.map((it) => it.ref));
    let upstream = this.I.items.filter((it) => this.stageOf(it) <= 1 && it.kind === "issue").length;
    const order = (r: Item) => (r.state === "working" ? 0 : r.state === "rejected" ? 1 : r.state === "queued" ? 3 : r.state === "ore" ? 4 : 2);
    const todo = this.state.items
      .filter((r) => !have.has(r.id) && r.state !== "launched")
      .sort((a, b) => order(a) - order(b) || a.updatedAt - b.updatedAt);
    for (const r of todo) {
      if (this.launched.has(r.id) && r.state === "rejected") {
        // a comeback after launch: it rides back down from the gate on the rework line
        const it = this.I.put(this.mineOf(r), "gate-reject", 0, "reject", this.ident(r));
        if (it) (this.launched.delete(r.id), this.shown.set(r.id, r.scars?.length ?? 0), it.flash(0xff3a2a));
        continue;
      }
      if ((r.state === "ore" || r.state === "queued") && upstream >= UPSTREAM_CAP) continue;
      const it = this.I.spawnItem(this.mineOf(r), this.ident(r));
      if (!it) continue; // that mine's cart is still busy: next time
      this.shown.set(r.id, r.scars?.length ?? 0);
      this.I.relabel(it, { label: tagTextFn(r) });
      upstream++;
    }
  }

  step() {
    if (!this.state) return;
    for (const it of this.I.items) {
      const r = it.ref ? this.real.get(it.ref) : undefined;
      if (!r) {
        it.boost = 1;
        continue;
      }
      const vs = this.stageOf(it);
      const goingBack = r.state === "rejected" || this.pending(r) > 0;
      const gap = goingBack && vs >= 3 ? 0 : REAL_STAGE[r.state] - vs;
      it.boost = gap >= 2 ? 3 : gap >= 1 ? 1.8 : 1;
    }
    this.unjam();
  }

  admit(st: IronStation, it: IronItem): boolean {
    if (st.type !== "planner") return true;
    const r = it.ref ? this.real.get(it.ref) : undefined;
    if (!r) return true;
    // the planner hands work to a builder when the real factory starts building it; until then it waits in line
    if (this.pending(r) > 0) return true;
    return r.state !== "ore" && r.state !== "queued" && r.state !== "rejected";
  }

  route(it: IronItem): string | null {
    const r = it.ref ? this.real.get(it.ref) : undefined;
    const want = r?.machineId && this.asms.includes(r.machineId) ? r.machineId : r ? this.lastAsm.get(r.id) : undefined;
    if (want) return want;
    if (r?.state === "working") return this.asms[this.asms.length - 1] ?? null; // a builder the shaft has no room for
    const idle = this.I.stationList.filter((s) => s.type === "assembler").sort((a, b) => (a.item ? 1 : 0) - (b.item ? 1 : 0) || a.M.queue() - b.M.queue());
    return idle[0]?.id ?? null;
  }

  ready(st: IronStation, it: IronItem): boolean {
    const r = it.ref ? this.real.get(it.ref) : undefined;
    if (!r || st.type !== "assembler") return true;
    // a rejection the line hasn't played yet: send it up to be caught
    if (this.pending(r) > 0) return true;
    return r.state !== "working" && r.state !== "queued" && r.state !== "ore";
  }

  judge(st: IronStation, it: IronItem): Verdict | null {
    let memo = this.verdicts.get(it);
    const had = memo?.get(st.id);
    if (had) return had;
    const v = this.verdict(st, it);
    if (v) {
      if (!memo) this.verdicts.set(it, (memo = new Map()));
      memo.set(st.id, v);
    }
    return v;
  }

  decision(st: IronStation): string | null {
    return this.decisions.get(st.id) ?? null;
  }

  power(st: IronStation) {
    const p = this.state?.power.find((x) => x.id === st.id);
    return p ? { level: p.level, online: p.online } : { level: 1, online: true };
  }

  // ---------- inside ----------

  // the line counts rejections (a scar tag on the capsule), the factory counts builds
  private ident(r: Item) {
    return { ref: r.id, title: r.title, attempts: r.scars?.length ?? Math.max(0, r.attempts - 1), num: r.prNumber ?? numOf(r) };
  }

  private mineOf(r: Item): string {
    const m = SOURCE_OF[r.source] ?? "github";
    return this.I.paths["cart-" + m] ? m : "github";
  }

  private stageOf(it: IronItem): number {
    if (it.emerge) return 0;
    if (it.owner) return STAGE_OF_TYPE[this.I.stations[it.owner]?.type ?? ""] ?? 4;
    return it.path ? stageOfPath(it.path.name) : 0;
  }

  // scars the real item has that the line hasn't played yet
  private pending(r: Item) {
    return Math.max(0, (r.scars?.length ?? 0) - (this.shown.get(r.id) ?? 0));
  }

  private stationOfScar(s: ScarTag): string | null {
    const st = this.I.stationList;
    if (s.station === "custom") return s.check && this.line.includes(`check-${s.check}`) ? `check-${s.check}` : null;
    if (s.station === "merge") return this.layout.gate?.id ?? null;
    if (s.station === "orbit" || s.station === "measure") return null;
    const type = s.station === "ci" ? "ci" : s.station === "verify" ? "verify" : "review";
    return st.find((x) => x.type === type)?.id ?? null;
  }

  private verdict(st: IronStation, it: IronItem): Verdict | null {
    const r = it.ref ? this.real.get(it.ref) : undefined;
    if (!r) return PASS; // the real item is gone: let it finish its trip
    const at = this.line.indexOf(st.id);
    // play the scars in order: the next one says where this capsule gets caught
    for (;;) {
      if (this.pending(r) === 0) break;
      const scar = r.scars![this.shown.get(r.id) ?? 0];
      const where = this.stationOfScar(scar);
      if (where === st.id) return { pass: false, reason: scar.reason, scar: true } as Verdict;
      const wi = where ? this.line.indexOf(where) : -1;
      const later = where === this.layout.gate?.id ? st.type !== "gate" : wi > at && at >= 0;
      if (where && later) return PASS; // it gets caught further up
      this.shown.set(r.id, (this.shown.get(r.id) ?? 0) + 1); // a scar from somewhere the line can't show (orbit): history
    }
    const gate = st.type === "gate";
    switch (r.state) {
      case "inspecting": {
        if (gate) return null;
        const ri = this.line.indexOf(r.machineId ?? "");
        return ri > at || (ri < 0 && r.machineId === this.layout.gate?.id) ? PASS : null;
      }
      case "rejected": {
        // caught at its station (a failed build is caught by the first check)
        const ri = this.line.indexOf(r.machineId ?? "");
        if (gate || ri < 0 || ri === at) return { pass: false, reason: r.failure ?? "sent back" };
        return ri > at ? PASS : { pass: false, reason: r.failure ?? "sent back" };
      }
      case "passed":
      case "on_pad":
        return gate ? null : PASS;
      case "launched":
        return PASS;
      default:
        // the real item went back for another try without a scar the line could show
        return { pass: false, reason: r.failure ?? "sent back for another try" };
    }
  }

  // The real factory picked work in a different order than it sits on the belt: the lump at the front of the
  // planner's tray takes the identity of the one really being built (they look alike), so the planner isn't stuck.
  private unjam() {
    const pl = this.layout.planner;
    for (const trayName of ["ore", "rw-in"]) {
      const tray = this.I.paths[trayName];
      const front = tray?.items.find((x) => x.atEnd);
      if (!front || !front.ref || this.admit(this.I.stations[pl.id], front)) continue;
      const chain = trayName === "ore" ? (n: string) => stageOfPath(n) === 0 || n === "ore" : (n: string) => stageOfPath(n) === 1 && n !== "ore";
      const building = this.state!.items.filter((r) => r.state === "working").sort((a, b) => a.updatedAt - b.updatedAt);
      for (const r of building) {
        const v = this.I.items.find((x) => x.ref === r.id);
        if (v && !(v.emerge ? trayName === "ore" : v.path && chain(v.path.name))) continue; // already past, or on the other tray
        if (v && v.kind !== front.kind) continue;
        const a = { ref: front.ref, title: front.title, attempts: front.attempts, num: front.num, src: front.src, label: front.label };
        const fr = this.real.get(front.ref);
        if (v) {
          this.I.relabel(front, { ref: v.ref ?? undefined, title: v.title, attempts: v.attempts, num: v.num, src: v.src, label: v.label });
          this.I.relabel(v, a);
        } else {
          this.I.relabel(front, { ...this.ident(r), src: this.mineOf(r), label: tagTextFn(r) });
          if (fr) this.shown.set(fr.id, fr.scars?.length ?? 0);
        }
        this.shown.set(r.id, this.shown.get(r.id) ?? r.scars?.length ?? 0);
        break;
      }
    }
  }

  // Who is waiting on the player: machines the real factory reports blocked, and the open cards that hold a machine
  // (a merge waits at the gate, "build this first?" at the planner).
  private findDecisions(state: FactoryState): Map<string, string> {
    const out = new Map<string, string>();
    const ids = new Set(this.I.stationList.map((s) => s.id));
    const gate = this.layout.gate?.id;
    const planner = this.layout.planner.id;
    const moves = [state.move, ...(state.deck ?? [])].filter((m): m is Move => !!m);
    const seen = new Set<string>();
    for (const m of moves) {
      if (seen.has(m.id) || !(BLOCKING_KINDS.has(m.kind ?? "") || BLOCKING_STAGES.has(m.stage ?? ""))) continue;
      seen.add(m.id);
      const focus = m.focus?.replace(/^m:/, "");
      let at = focus && ids.has(focus) ? focus : undefined;
      if (!at) at = m.kind === "ship" || m.stage === "pad" ? gate : m.kind === "build" || m.stage === "build" ? planner : m.stage === "power" || m.stage === "resources" ? this.asms[0] : undefined;
      if (!at || out.has(at)) continue;
      const rec = m.options.find((o) => o.recommended);
      out.set(at, rec && /#\d/.test(rec.label) ? rec.label : m.title);
    }
    const stationOfMachine = new Map((state.stations ?? []).filter((s) => s.machineId).map((s) => [s.machineId!, s.id]));
    for (const mc of state.machines) {
      if (mc.state !== "blocked") continue;
      const id = ids.has(mc.id) ? mc.id : stationOfMachine.get(mc.id);
      if (!id || out.has(id)) continue;
      const b = state.bottleneck;
      const about = b && (b.stationId === id || b.stationId === mc.id) ? b.summary : undefined;
      out.set(id, about ?? (mc.type === "assembler" && !mc.harness && !mc.powerId ? "Needs power: sign in to build" : mc.type === "assembler" ? "The builder stopped: needs a look" : "Stopped: needs a look"));
    }
    return out;
  }

  // the first state: put every real item where it really is, so the line looks right from the first frame
  private warm() {
    const I = this.I;
    const items = [...this.state!.items].sort((a, b) => REAL_STAGE[b.state] - REAL_STAGE[a.state] || a.updatedAt - b.updatedAt);
    const intoStation = (id: string) => I.pathList.find((p) => p.port === id + ".in" && !p.rework)?.name;
    let ore = 0;
    for (const r of items) {
      const src = this.mineOf(r);
      const o = this.ident(r);
      const tries = (path: string | undefined, fracs: number[], kind?: Parameters<Iron["put"]>[3]) => {
        if (!path) return null;
        for (const f of fracs) {
          const it = I.put(src, path, f, kind, o);
          if (it) return it;
        }
        return null;
      };
      let it: IronItem | null = null;
      switch (r.state) {
        case "working": {
          const a = r.machineId && this.asms.includes(r.machineId) ? r.machineId : this.asms[0];
          it = a ? tries("spur-" + a, [0.92, 0.7, 0.5]) : null;
          if (it) it.dest = a;
          break;
        }
        case "inspecting":
          it = tries(intoStation(r.machineId && this.line.includes(r.machineId) ? r.machineId : this.line[0]), [0.85, 0.6, 0.35], "capsule");
          break;
        case "passed":
        case "on_pad":
          it = tries("to-gate", [0.92, 0.75, 0.55, 0.35], "pass");
          break;
        case "rejected":
          it = tries("rework", [0.5, 0.3, 0.7, 0.15], "reject");
          break;
        case "queued":
        case "ore":
          if (ore >= 4) break;
          it = tries("ore", [0.96, 0.78, 0.6, 0.42]) ?? tries("lift", [0.6, 0.2]);
          if (it) ore++;
          break;
        default:
          break;
      }
      if (it) {
        this.shown.set(r.id, r.scars?.length ?? 0);
        I.relabel(it, { label: tagTextFn(r) });
      }
    }
  }
}

function numOf(r: Item): number | undefined {
  const gh = /^gh-(\d+)$/.exec(r.id);
  return gh ? Number(gh[1]) : undefined;
}

function tagTextFn(r: Item) {
  const t = tagText(r);
  return () => t;
}
