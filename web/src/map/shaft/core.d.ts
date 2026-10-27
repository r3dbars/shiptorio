// Types for core.js, the shaft's engine (the Black Iron line stood on its end). Only what TypeScript calls.
import type * as THREE from "three";
import type { Layout, StationDef } from "./layout";

export type { Layout, StationDef } from "./layout";

export type ItemKind = "issue" | "cards" | "capsule" | "pass" | "reject";
export type StationState = "IDLE" | "WORKING" | "BLOCKED";

export interface IronItem {
  id: number;
  num: number;
  ref: string | null; // the real item's id (game driver)
  src: string;
  title: string;
  kind: ItemKind;
  attempts: number;
  stage: string;
  reason: string | null;
  owner: string | null; // station id holding it
  path: IronPath | null;
  s: number;
  atEnd: boolean;
  dest: string | null; // the assembler it's routed to
  boost: number; // speed multiplier (the game driver uses it to catch up)
  hidden: boolean;
  gone: boolean; // removed from the world (shipped or vanished)
  emerge: unknown;
  mesh: THREE.Group;
  setKind(kind: ItemKind, silent?: boolean): void;
  flash(color?: number): void;
  label(): string;
  hide(): void;
  show(): void;
}

export interface IronPath {
  name: string;
  kind: "belt" | "rail" | "lift" | "tube" | "chute";
  label: string;
  points: [number, number, number][];
  L: number;
  items: IronItem[];
  speed: number;
  gap: number;
  flow: number;
  jammed: boolean;
  port?: string;
  rework?: boolean;
  ghost?: boolean;
  mine?: string;
  at(s: number, out: THREE.Vector3): unknown;
}

export interface IronStation {
  id: string;
  type: string;
  tier: string;
  x: number;
  y: number;
  z: number;
  def: Record<string, unknown>;
  layoutDef: StationDef;
  label: string;
  state: "IDLE" | "WORKING";
  detail: string;
  blocked: boolean;
  prompt: string | null;
  external: boolean;
  fallback?: boolean;
  holder: THREE.Group;
  item: IronItem | null;
  M: { queue(): number; stateShown: StationState };
}

export interface Verdict {
  pass: boolean;
  reason: string | null;
}

export interface Driver {
  name: string;
  intake?(dt: number): void;
  route?(item: IronItem, st: IronStation): string | null;
  ready?(st: IronStation, item: IronItem): boolean;
  judge?(st: IronStation, item: IronItem): Verdict | null;
  decision?(st: IronStation): string | null;
  admit?(st: IronStation, item: IronItem): boolean;
  hurry?(st: IronStation, item: IronItem): number; // how much faster a machine works on this item (default: its boost)
  power?(st: IronStation): { level: number; online: boolean };
  step?(dt: number, t: number): void;
}

export interface Look {
  sky: { top: string; bottom: string; fog?: string; fogNear?: number; fogFar?: number };
  light: { sun: number; sunI: number; sunDir: [number, number, number]; hemiSky: number; hemiGnd: number; hemiI: number };
  finish: import("./finish").FinishLook;
}

export interface Iron {
  LOOK: Look;
  CFG: Record<string, unknown>;
  policy: { intake: boolean; autoResolve: boolean; autoResolveAfter: number; speed: number; events: boolean };
  counters: { mined: number; shipped: number; rework: number; decisions: number };
  items: IronItem[];
  paths: Record<string, IronPath>;
  pathList: IronPath[];
  stations: Record<string, IronStation>;
  stationList: IronStation[];
  log: { text: string; kind: string; t: number }[];
  layout: Layout;
  root: THREE.Group;
  itemsRoot: THREE.Group;
  driver: Driver;
  AUTO: Driver;
  failed?: string[];
  perf?: { shadowCulled: number; lights: number };
  _t?: number;
  build(scene: THREE.Scene, root: THREE.Group, layout: Layout, opts?: { warm?: boolean; labels?: Record<string, string> }): void;
  step(t: number, dt: number): void;
  setDriver(d: Driver | null): void;
  on(ev: string, fn: (d: any) => void): void; // eslint-disable-line @typescript-eslint/no-explicit-any
  resolve(id: string): void;
  stall(id: string): void;
  spawnItem(src: string, o?: { ref?: string; num?: number; title?: string; kind?: ItemKind; attempts?: number }): IronItem | null;
  put(src: string, path: string, frac: number, kind?: ItemKind, o?: { ref?: string; num?: number; title?: string; attempts?: number }): IronItem | null;
  removeItem(it: IronItem): void;
  relabel(it: IronItem, o: { ref?: string; num?: number; title?: string; attempts?: number; src?: string; label?: () => string }): void;
  queueFor(id: string): number;
  debug: { advance(sec: number, step?: number): void; stats(): Record<string, unknown> };
  dispose(): void;
}

export function patchLegacyLights(): boolean;
export function createIron(opts?: { driver?: Driver; lightCap?: number; fxCap?: number }): Iron;
export const SOURCE_OF: Record<string, string>;
