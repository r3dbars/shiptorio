// The bottleneck, drawn in the world (docs/BRAIN.md, "Map"): the ONE thing holding the player back shows up where it
// lives in the shaft, as stuff piling up, never as a label. Slow CI = crates backing up at the CI inspector; errors
// piling = glowing red ore heaped at the Sentry tunnel; unanswered feedback = letters spilling out of the inbox tunnel;
// nobody using what ships = the sky over the launch floor goes dark and quiet; work stuck in the line = crates at the
// station it's stuck at. The pile grows with severity, one piece at a time, and when the bottleneck clears (the player
// acted and it worked, or a new one took its place) it sinks away with a short green glow. Calm (#358): no marker, no
// sound, slow light; reduced motion gets no drops and no breathing.
//
// What it reads: the brain's bottleneck (BrainBottleneck, shared/src/signals.ts) once FactoryState carries it, and
// until then the queue-jam Bottleneck the server already sends. Both go through clogOf(), the one adapter.

import * as THREE from "three";

import type { FactoryState } from "@shiptorio/shared";

import type { Iron, IronStation } from "./core";
import { LEDGE_Z, MINES } from "./layout";

/** BottleneckArea in shared/src/signals.ts (#379): what kind of thing is holding the player back. */
export type ClogArea = "ship" | "speed" | "quality" | "users" | "feedback" | "focus";

/** What the map needs to draw a bottleneck. */
export interface Clog {
  id: string; // a new id is a new bottleneck: the old pile clears first
  area: ClogArea;
  signal?: string; // the main signal id, `${source}:${kind}:${scope}`
  severity: number; // 0..1, how big the pile is
  stationId?: string; // a jam at one station (the queue-jam engine knows which)
}

/** Where and how a clog shows in this shaft. */
export type ClogLook =
  | { kind: "ore"; mine: string; color: number } // glowing chunks heaped at a tunnel mouth
  | { kind: "mail"; mine: string } // letters spilling out of a tunnel
  | { kind: "crates"; at: string } // work backing up in front of a station
  | { kind: "sky" }; // the launch sky goes dark

const clamp = (v: number) => Math.max(0, Math.min(1, v));

// queue-jam stage -> area (the factory collector's mapping, BRAIN.md step 2)
const STAGE_AREA: Record<string, ClogArea | null> = { intake: "ship", triage: "focus", build: "ship", inspect: "ship", pad: "ship", release: "users", impact: "users", power: null, resources: null };

/** The bottleneck to draw, or null when nothing is holding the player back. The one adapter: the brain's
 *  bottleneck when FactoryState carries one, else the queue jam. A ?clog=<area>[:severity] preview wins (dev, Justin). */
export function clogOf(state: FactoryState, preview: string | null = previewParam()): Clog | null {
  if (preview) {
    if (preview === "0") return null;
    const [area, sev] = preview.split(":");
    if (AREAS.has(area)) return { id: `preview:${area}`, area: area as ClogArea, severity: clamp(Number(sev ?? 0.7) || 0.7) };
  }
  // the brain's pick (FactoryState.holdingBack, #388), read structurally so this works on either side of that merge;
  // null there means the brain is quiet or off, and the queue jam below still speaks
  const hb = (state as { holdingBack?: { id: string; area: ClogArea; signalIds: string[]; severity: number } | null }).holdingBack;
  if (hb && AREAS.has(hb.area)) {
    const severity = clamp(hb.severity);
    return severity < SHOW_AT ? null : { id: hb.id, area: hb.area, signal: hb.signalIds[0], severity };
  }
  const b = state.bottleneck;
  if (!b) return null;
  const area = STAGE_AREA[b.stage];
  if (!area) return null; // no power, no agent: the builders already stand dark and BLOCKED
  // a couple of items for a few minutes is just the line working; a long or old queue is a jam, and fills the pile
  const severity = clamp(b.wip * 0.1 + Math.min(0.5, (b.ageMs / 3_600_000) * 0.15));
  if (severity < SHOW_AT) return null;
  return { id: `factory:queue_jam:${b.stage}:${b.stationId ?? ""}`, area, signal: `factory:queue_jam:${b.stage}`, severity, stationId: b.stationId };
}

/** Below this the map stays quiet (the brain's own floor for a card is 0.2: a card can come before a pile). */
export const SHOW_AT = 0.35;

const AREAS = new Set<string>(["ship", "speed", "quality", "users", "feedback", "focus"]);

function previewParam(): string | null {
  try {
    return new URLSearchParams(globalThis.location?.search ?? "").get("clog");
  } catch {
    return null;
  }
}

/** Where a clog shows, given what stands in this shaft (station ids and types). Null: nothing to draw. */
export function lookOf(c: Clog, stations: { id: string; type: string }[], mines: Record<string, unknown> = MINES): ClogLook | null {
  const byType = (t: string) => stations.find((s) => s.type === t)?.id;
  const has = (id?: string) => !!id && stations.some((s) => s.id === id);
  const kind = c.signal?.split(":")[1] ?? "";
  switch (c.area) {
    case "quality":
      return "sentry" in mines ? { kind: "ore", mine: "sentry", color: 0xff3a2a } : null;
    case "feedback":
      return "inbox" in mines ? { kind: "mail", mine: "inbox" } : null;
    case "users":
      return { kind: "sky" };
    case "speed": {
      const at = byType("ci") ?? byType("check");
      return at ? { kind: "crates", at } : null;
    }
    case "focus": {
      const at = byType("planner");
      return at ? { kind: "crates", at } : null;
    }
    case "ship": {
      if (has(c.stationId)) return { kind: "crates", at: c.stationId! };
      if (c.signal?.endsWith(":intake") || kind === "issues_untriaged") return { kind: "ore", mine: "github", color: 0xffb040 };
      if (c.signal?.endsWith(":build") || kind === "no_power" || kind === "no_agent") {
        const at = byType("assembler");
        return at ? { kind: "crates", at } : null;
      }
      if (kind === "rework_loop") {
        const at = byType("review") ?? byType("verify");
        return at ? { kind: "crates", at } : null;
      }
      // stale PRs, a jam at the merge: the PRs stack up at the gate
      const at = byType("gate") ?? byType("launch");
      return at ? { kind: "crates", at } : null;
    }
  }
  return null;
}

const MAX = 16;
const pieces = (sev: number) => Math.round(3 + clamp(sev) * (MAX - 3));
const AMBER = 0xffa030;
const CLEAR = 0x46ff8a;
const FALL = 0.55; // seconds a new piece takes to drop onto the pile
const SINK = 0.9; // seconds a piece takes to sink away when it clears

interface Piece {
  mesh: THREE.Mesh;
  mat: THREE.MeshLambertMaterial;
  rest: THREE.Vector3;
  born: number; // when it started falling (-1: not yet)
  gone: number; // when it started sinking (-1: still here)
  glow: number; // its own emissive base
  color: THREE.Color; // and its own emissive color (the green clear glow paints over it)
}

/** One pile in the world (a clog), growing and clearing. */
class Pile {
  readonly group = new THREE.Group();
  readonly pieces: Piece[] = [];
  clearing = -1;
  constructor(
    readonly look: ClogLook,
    readonly slots: THREE.Vector3[],
    readonly make: (i: number) => { mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; glow: number },
  ) {}

  /** n pieces on the pile: new ones drop on top, and when it shrinks (the player made a dent) the top ones sink away */
  size(n: number, t: number, calm: boolean) {
    n = Math.min(n, this.slots.length);
    this.pieces.forEach((p, i) => {
      if (i >= n && p.gone < 0) p.gone = t + (this.pieces.length - i) * 0.06;
      else if (i < n && p.gone >= 0) {
        p.gone = -1;
        p.born = calm ? t - FALL : t;
        p.mesh.scale.setScalar(1);
        p.mat.emissive.copy(p.color);
      }
    });
    const from = this.pieces.length;
    while (this.pieces.length < n) {
      const i = this.pieces.length;
      const { mesh, mat, glow } = this.make(i);
      const rest = this.slots[i].clone();
      mesh.position.copy(rest);
      mesh.userData.noBake = true;
      // later pieces land a beat after each other, so a pile that appears at once still reads as stacking up
      const p: Piece = { mesh, mat, rest, born: calm ? t - FALL : t + (i - from) * 0.12, gone: -1, glow, color: mat.emissive.clone() };
      if (!calm) mesh.visible = false;
      this.pieces.push(p);
      this.group.add(mesh);
    }
  }

  clear(t: number) {
    if (this.clearing >= 0) return;
    this.clearing = t;
    // top of the pile first
    [...this.pieces].sort((a, b) => b.rest.y - a.rest.y).forEach((p, i) => (p.gone = t + i * 0.06));
  }

  /** false once it's all gone */
  step(t: number, calm: boolean): boolean {
    let alive = false;
    for (const p of this.pieces) {
      const m = p.mesh;
      if (p.gone >= 0 && t >= p.gone) {
        const k = calm ? 1 : Math.min(1, (t - p.gone) / SINK);
        if (k >= 1) {
          m.visible = false;
          continue;
        }
        alive = true;
        m.visible = true;
        m.position.set(p.rest.x, p.rest.y - k * 0.6, p.rest.z);
        m.scale.setScalar(1 - k * k);
        p.mat.emissive.setHex(CLEAR);
        p.mat.emissiveIntensity = 0.9 * (1 - k);
        continue;
      }
      alive = true;
      if (t < p.born) continue;
      const k = calm ? 1 : Math.min(1, (t - p.born) / FALL);
      m.visible = true;
      m.position.set(p.rest.x, p.rest.y + (1 - k * k) * 1.6, p.rest.z);
      // a slow breath, out of step piece to piece: alive, not blinking
      p.mat.emissiveIntensity = calm ? p.glow : p.glow * (0.8 + 0.2 * Math.sin(t * 1.3 + p.rest.x * 2.1 + p.rest.y * 3.7));
    }
    return alive;
  }

  dispose() {
    for (const p of this.pieces) p.mat.dispose();
    this.group.clear();
  }
}

// a little seeded jitter, so a pile looks heaped by hand and is the same every time
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const SPOT: Record<string, [number, number, number]> = { planner: [1, 2.8, 3.4], assembler: [-1, 2.6, 3.4] };

/** Crates stacked in a 3 x 2 grid, three high, on the upstream side of a station (where the line comes in). */
function crateSlots(st: IronStation): THREE.Vector3[] {
  // the checks floor runs right to left, the build and launch floors left to right; the pile sits behind the
  // intake, clear of the belt that feeds it (on the build floor, out front, where the floor is open)
  const [up, dx, dz] = SPOT[st.type] ?? [st.tier === "checks" ? 1 : -1, 3.4, -2.2];
  const x0 = st.x + up * dx;
  const z0 = st.z + dz;
  const out: THREE.Vector3[] = [];
  const r = rng(st.x * 31 + st.z * 7);
  for (let layer = 0; layer < 3; layer++)
    for (let row = 0; row < 2; row++)
      for (let col = 0; col < 3; col++) {
        if (layer === 2 && row === 1) continue; // a stepped top
        out.push(new THREE.Vector3(x0 + up * col * 0.62 + (r() - 0.5) * 0.08, st.y + 0.1 + 0.27 + layer * 0.54, z0 - row * 0.62 + (r() - 0.5) * 0.08));
      }
  return out.slice(0, MAX);
}

/** A mound on the ledge beside a tunnel mouth (left of the cart track), widest at the bottom. */
function moundSlots(mine: string, spread = 1): THREE.Vector3[] {
  const m = MINES[mine];
  const out: THREE.Vector3[] = [];
  const r = rng(m.x * 13 + 5);
  const rows = [6, 5, 3, 2];
  const w = 0.56 * spread;
  const floor = m.y - 0.32; // the ledge under the cart
  rows.forEach((n, layer) => {
    for (let i = 0; i < n; i++) {
      const x = m.x - 1.4 - (i - (n - 1) / 2) * w - layer * 0.06;
      out.push(new THREE.Vector3(x + (r() - 0.5) * 0.14, floor + 0.22 + layer * 0.38, LEDGE_Z + 0.4 + (r() - 0.5) * 0.3));
    }
  });
  return out.slice(0, MAX);
}

export class ClogView {
  readonly group = new THREE.Group();
  private pile: Pile | null = null;
  private old: Pile[] = [];
  private clog: Clog | null = null;
  private key = "";
  private t = 0;
  // the dark sky: the sky dims, and a veil drops over the city behind the shaft (in front of the skyline and the
  // district towers, behind the chimneys): the factory stays lit, the world around it goes quiet
  private readonly veilMat = new THREE.MeshBasicMaterial({ color: 0x030408, transparent: true, opacity: 0, depthWrite: false, fog: false });
  private readonly veil = new THREE.Mesh(new THREE.PlaneGeometry(420, 240), this.veilMat);
  /** the shaft's scene, for its sky */
  scene: THREE.Scene | null = null;
  private sky = 0;
  private skyGoal = 0;
  private readonly crateG = new THREE.BoxGeometry(0.52, 0.52, 0.52);
  private readonly oreG = new THREE.DodecahedronGeometry(0.28, 0);
  private readonly mailG = new THREE.BoxGeometry(0.56, 0.09, 0.4);

  constructor() {
    this.group.name = "clog";
    this.veil.position.set(0, 0, -33.5);
    this.veil.frustumCulled = false;
    this.veil.renderOrder = -1;
    this.veil.visible = false;
    this.veil.userData.noBake = true;
    this.group.add(this.veil);
  }

  /** a fresh shaft: draw the current clog again on the next set */
  reset() {
    for (const p of [this.pile, ...this.old]) if (p) (p.group.removeFromParent(), p.dispose());
    this.pile = null;
    this.old = [];
    this.key = "";
  }

  get current() {
    return this.clog;
  }

  // a vertical alpha ramp for the veil: lighter down in the pit, full over the skyline
  private ramp(): THREE.Texture {
    const c = document.createElement("canvas");
    c.width = 2;
    c.height = 64;
    const g = c.getContext("2d")!;
    const gr = g.createLinearGradient(0, 64, 0, 0);
    gr.addColorStop(0, "#555");
    gr.addColorStop(0.45, "#fff");
    gr.addColorStop(1, "#fff");
    g.fillStyle = gr;
    g.fillRect(0, 0, 2, 64);
    return new THREE.CanvasTexture(c);
  }

  set(I: Iron, clog: Clog | null, calm: boolean) {
    const look = clog ? lookOf(clog, I.stationList, MINES) : null;
    const key = clog && look ? `${clog.id}|${JSON.stringify(look)}` : "";
    this.clog = clog;
    if (key !== this.key) {
      // the old bottleneck clears (sinks away, glowing green) before the new one piles up
      if (this.pile) (this.pile.clear(this.t), this.old.push(this.pile));
      this.pile = null;
      this.skyGoal = 0;
      this.key = key;
      if (look && look.kind !== "sky") this.pile = this.build(I, look);
      if (this.pile) this.group.add(this.pile.group);
    }
    if (!clog || !look) return;
    if (look.kind === "sky") {
      this.veilMat.alphaMap ??= this.ramp();
      this.skyGoal = 0.5 + 0.35 * clamp(clog.severity);
    }
    else this.pile?.size(pieces(clog.severity), this.t + (this.old.length ? SINK : 0), calm);
  }

  // a work crate in the kit's pixel style: iron-bound planks with a hazard band, and only the band glows
  private tex: [THREE.Texture, THREE.Texture] | null = null;
  private crateTex(): [THREE.Texture, THREE.Texture] {
    if (this.tex) return this.tex;
    const draw = (glow: boolean) => {
      const c = document.createElement("canvas");
      c.width = c.height = 16;
      const g = c.getContext("2d")!;
      g.fillStyle = glow ? "#000" : "#1a1410";
      g.fillRect(0, 0, 16, 16);
      if (!glow)
        for (let y = 1; y < 15; y += 3) {
          g.fillStyle = y % 2 ? "#5a3e22" : "#4c341c";
          g.fillRect(1, y, 14, 2);
        }
      g.fillStyle = "#e0a018";
      for (let i = -16; i < 32; i += 6) {
        g.beginPath();
        g.moveTo(i, 6);
        g.lineTo(i + 3, 6);
        g.lineTo(i + 3 - 4, 10);
        g.lineTo(i - 4, 10);
        g.fill();
      }
      if (!glow) {
        g.fillStyle = "#8a7a64"; // the iron corners
        for (const [x, y] of [[0, 0], [14, 0], [0, 14], [14, 14]]) g.fillRect(x, y, 2, 2);
      }
      const t = new THREE.CanvasTexture(c);
      t.magFilter = t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      return t;
    };
    return (this.tex = [draw(false), draw(true)]);
  }

  private build(I: Iron, look: ClogLook): Pile | null {
    if (look.kind === "crates") {
      const st = I.stations[look.at];
      if (!st) return null;
      const r = rng(7);
      const [map, band] = this.crateTex();
      return new Pile(look, crateSlots(st), () => {
        const mat = new THREE.MeshLambertMaterial({ map, emissive: AMBER, emissiveMap: band, emissiveIntensity: 0.5 });
        const mesh = new THREE.Mesh(this.crateG, mat);
        mesh.rotation.y = (r() - 0.5) * 0.25;
        return { mesh, mat, glow: 0.5 };
      });
    }
    if (look.kind === "ore") {
      const r = rng(3);
      return new Pile(look, moundSlots(look.mine), () => {
        // dark rock, lit from inside: the facets still read
        const mat = new THREE.MeshLambertMaterial({ color: 0x4a2a20, emissive: look.color, emissiveIntensity: 0.45 });
        const mesh = new THREE.Mesh(this.oreG, mat);
        mesh.rotation.set(r() * 3, r() * 3, r() * 3);
        mesh.scale.setScalar(0.85 + r() * 0.4);
        return { mesh, mat, glow: 0.45 };
      });
    }
    if (look.kind === "mail") {
      const r = rng(11);
      return new Pile(look, moundSlots(look.mine, 1.15), (i) => {
        // pale letters, every few with the inbox's blue seal lit
        const lit = i % 3 === 0;
        const mat = new THREE.MeshLambertMaterial({ color: 0xf2ead2, emissive: lit ? MINES.inbox.color : 0x6a6250, emissiveIntensity: lit ? 0.7 : 0.5 });
        const mesh = new THREE.Mesh(this.mailG, mat);
        mesh.rotation.set((r() - 0.5) * 0.9, r() * Math.PI, (r() - 0.5) * 0.9);
        return { mesh, mat, glow: lit ? 0.7 : 0.5 };
      });
    }
    return null;
  }

  step(t: number, dt: number, calm: boolean) {
    this.t = t;
    if (this.pile) this.pile.step(t, calm);
    this.old = this.old.filter((p) => {
      if (p.step(t, calm)) return true;
      p.group.removeFromParent();
      p.dispose();
      return false;
    });
    if (this.sky !== this.skyGoal) {
      const k = calm ? 1 : Math.min(1, dt / 2.5); // the light goes and comes back slowly
      this.sky += (this.skyGoal - this.sky) * k;
      if (Math.abs(this.sky - this.skyGoal) < 0.005) this.sky = this.skyGoal;
    }
    this.veilMat.opacity = this.sky;
    this.veil.visible = this.sky > 0.002;
    if (this.scene) this.scene.backgroundIntensity = 1 - this.sky * 0.75;
  }

  dispose() {
    this.reset();
    this.group.clear();
    for (const r of [this.veilMat, this.veilMat.alphaMap, this.veil.geometry, this.crateG, this.oreG, this.mailG, ...(this.tex ?? [])]) r?.dispose();
  }
}
