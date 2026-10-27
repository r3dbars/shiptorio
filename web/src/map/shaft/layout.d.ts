// Types for layout.js, where everything in the shaft stands.
export type Vec3 = [number, number, number];

export interface Tier {
  y: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  label: string;
}

export interface MineDef {
  x: number;
  y: number;
  color: number;
  label: string;
  row: number;
}

export interface PortDef {
  p: Vec3;
  out: [number, number];
}

export interface StationDef {
  id: string;
  type: string;
  tier: string;
  x: number;
  y: number;
  z: number;
  def: Record<string, unknown>;
  power?: boolean;
  rot?: number;
  aura?: number;
  label?: string;
}

export interface PathDef {
  name: string;
  kind: string;
  label: string;
  pts: Vec3[];
  speed?: number;
  gap?: number;
  carrier?: string;
  next?: unknown;
  port?: string;
  smooth?: boolean;
  rework?: boolean;
  ghost?: boolean;
  mine?: string;
  junction?: boolean;
}

export interface Plan {
  planner?: { id: string };
  assemblers?: { id: string; harness?: string }[];
  checks?: { id: string; kind: string; check?: string }[];
  gate?: { id: string } | null;
  pad?: { id: string } | null;
  orbit?: { id: string } | null;
  measure?: { id: string } | null;
  sources?: string[];
  power?: { id: string; type: string; feeds?: string[]; harness?: string }[];
}

export interface Layout {
  stations: StationDef[];
  paths: PathDef[];
  portOut: Record<string, string | null>;
  tiers: Record<string, Tier>;
  mines: Record<string, MineDef>;
  sources: string[];
  planner: StationDef;
  assemblers: StationDef[];
  checks: StationDef[];
  gate: StationDef | null;
  pad: StationDef | null;
}

export const C45: number;
export const TIERS: Record<string, Tier>;
export const MINES: Record<string, MineDef>;
export const PORTS: Record<string, Record<string, PortDef>>;
export const KIND_TYPE: Record<string, string>;
export const DECK_TOP: number;
export const SLAB: number;
export const BELT: number;
export const MINE_FACE_Z: number;
export const LEDGE_Z: number;
export const TUNNEL_DEPTH: number;
export const COLLECTOR_Y: number;
export const LIFT_X: number;
export const LIFT_Z: number;
export const RW_X: number;
export const RW_Z: number;
export function toRootAt(st: { x: number; y: number; z: number }, x: number, y: number, z: number, out?: Vec3): Vec3;
export function defaultPlan(): Plan;
export function makeLayout(plan: Plan): Layout;
