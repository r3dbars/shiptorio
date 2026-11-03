// The city's island sprites are pictures (the one allowed use of pictures here: static scenery). The art builder ships ten
// lossless webps and one manifest.json in web/public/deck/art/city/ (DIRECTION.md section A, SPEC.md section 4). This file
// mirrors that schema, validates what comes off the network, and supplies the sizes and points section A promises so
// layout, connectors and labels work before the manifest has loaded (islands themselves are simply not drawn until the
// pictures arrive).
import { ART_BASE, CITY_ISLANDS, type CityIsland } from "../contract";

/** Whole sprite px from the sprite's top-left. 1 sprite px = 1 city px = CITY_PX world units. */
export type XY = [number, number];
export type Side = "n" | "e" | "s" | "w";
/** Each island's own silhouette (section A): no two share an underside, a deck outline or a height class. */
export type IslandForm = "caldera" | "rail-slab" | "post-tower" | "landing-disc" | "beacon-rock";
/** A steady light the runtime draws on a lit island: signal and pad lamps, thruster throats, windows, the crack's glow. */
export type LightKind = "signal" | "pad" | "thruster" | "window" | "crack";
export interface IslandLight { at: XY; kind: LightKind }

export interface IslandArt {
  lit: string; dark: string; // file names next to manifest.json
  w: number; h: number; // exact webp size
  form: IslandForm;
  anchors: Partial<Record<Side, XY>>; // foot points where a pylon, lift or span end stands; all four but on marketing ({})
  lamp: XY | null; // the glass of the island's own lamp post; null for marketing
  label: XY; // top-centre of the DOM label: x = the island's middle, y = lowest opaque px + 4
  pad: XY | null; // customers only: centre of the landing ring on the deck top
  beacon: XY | null; // marketing only: centre of the mast-tip ball
  lights: IslandLight[]; // where the runtime puts a steady light once the island is lit
  opaque: number; // the lit sprite's opaque px (audit: no island outweighs the line)
  colors: { lit: string[]; dark: string[] }; // audit only
  bytes: { lit: number; dark: number }; // audit only
}
export interface CityManifest { version: 1; unit: "city-px"; islands: Record<CityIsland, IslandArt> }

export const ISLAND_FORM: Record<CityIsland, IslandForm> = {
  errors: "caldera", traffic: "rail-slab", inbox: "post-tower", customers: "landing-disc", marketing: "beacon-rock",
};
const FORMS = new Set<string>(Object.values(ISLAND_FORM));
const KINDS = new Set<string>(["signal", "pad", "thruster", "window", "crack"] satisfies LightKind[]);

/** Section A's size table: the width is exact, the height is what the art builder expects (+-3). Traffic grew from 78 to 88
 *  rows when its legs got K braces, a tie and 12 x 8 boulders under their feet (height class 80-88). */
export const EXPECTED_SIZE: Record<CityIsland, { w: number; h: number }> = {
  errors: { w: 156, h: 128 }, traffic: { w: 200, h: 88 }, inbox: { w: 64, h: 176 }, customers: { w: 196, h: 96 }, marketing: { w: 76, h: 148 },
};

/** Section A's points (with the second art pass: Errors' hut ledge 3 rows lower, Traffic's s on its slab's underside and
 *  its label under the boulders, Marketing's ball at the top of a mast that now stands on a ledge), which the shipped
 *  manifest lands within 2 px of. */
const POINTS: Record<CityIsland, Pick<IslandArt, "anchors" | "lamp" | "pad" | "beacon" | "label">> = {
  errors: { anchors: { n: [44, 47], e: [151, 60], s: [84, 120], w: [4, 60] }, lamp: [70, 22], pad: null, beacon: null, label: [78, 131] },
  traffic: { anchors: { n: [126, 58], e: [197, 64], s: [100, 68], w: [2, 64] }, lamp: [68, 35], pad: null, beacon: null, label: [100, 91] },
  inbox: { anchors: { n: [54, 69], e: [62, 72], s: [32, 172], w: [1, 72] }, lamp: [5, 58], pad: null, beacon: null, label: [32, 179] },
  customers: { anchors: { n: [40, 30], e: [193, 60], s: [98, 92], w: [3, 60] }, lamp: [146, 20], pad: [164, 43], beacon: null, label: [98, 99] },
  marketing: { anchors: {}, lamp: null, pad: null, beacon: [38, 12], label: [38, 151] },
};

export const MANIFEST_URL = `${ART_BASE}city/manifest.json`;
/** The ArtLoader name of one sprite file: `city/errors-lit.webp` is loaded as art("city/errors-lit"). */
export const spriteName = (file: string) => `city/${file.replace(/\.webp$/, "")}`;

const isXY = (v: unknown): v is XY => Array.isArray(v) && v.length === 2 && v.every((n) => Number.isFinite(n));
const isXYOrNull = (v: unknown): v is XY | null => v === null || isXY(v);
const copy = (p: XY | null): XY | null => (p ? [p[0], p[1]] : null);

/** Section A's sizes and points, used only until the real manifest loads (or if it never does). No lights: those come
 *  with the pictures. */
export function fallbackManifest(): CityManifest {
  const islands = {} as Record<CityIsland, IslandArt>;
  for (const id of CITY_ISLANDS) {
    const { w, h } = EXPECTED_SIZE[id], p = POINTS[id];
    const anchors: Partial<Record<Side, XY>> = {};
    for (const [side, at] of Object.entries(p.anchors) as [Side, XY][]) anchors[side] = [at[0], at[1]];
    islands[id] = {
      lit: `${id}-lit.webp`, dark: `${id}-dark.webp`, w, h, form: ISLAND_FORM[id],
      anchors, lamp: copy(p.lamp), label: [p.label[0], p.label[1]], pad: copy(p.pad), beacon: copy(p.beacon),
      lights: [], opaque: 0, colors: { lit: [], dark: [] }, bytes: { lit: 0, dark: 0 },
    };
  }
  return { version: 1, unit: "city-px", islands };
}

/** The lights list, or null if anything in it is off. Missing means none (older manifests had no lights). */
function parseLights(v: unknown): IslandLight[] | null {
  if (v === undefined) return [];
  if (!Array.isArray(v)) return null;
  const out: IslandLight[] = [];
  for (const l of v as Partial<IslandLight>[]) {
    if (!l || typeof l !== "object" || !isXY(l.at) || typeof l.kind !== "string" || !KINDS.has(l.kind)) return null;
    out.push({ at: [l.at[0], l.at[1]], kind: l.kind });
  }
  return out;
}

/** Checks a parsed manifest.json against the schema; null if anything is off, so a bad file never reaches the layout.
 *  form, opaque and lights default (the island's own form, 0, none) when an older file leaves them out. */
export function parseManifest(json: unknown): CityManifest | null {
  const m = json as Partial<CityManifest> | null;
  if (!m || m.version !== 1 || m.unit !== "city-px" || !m.islands || typeof m.islands !== "object") return null;
  const islands = {} as Record<CityIsland, IslandArt>;
  for (const id of CITY_ISLANDS) {
    const a = (m.islands as Record<string, Partial<IslandArt> | undefined>)[id];
    if (!a || typeof a.lit !== "string" || typeof a.dark !== "string" || !(a.w! > 0) || !(a.h! > 0) || !Number.isFinite(a.w) || !Number.isFinite(a.h)) return null;
    if (!isXY(a.label) || !isXYOrNull(a.lamp ?? null) || !isXYOrNull(a.pad ?? null) || !isXYOrNull(a.beacon ?? null)) return null;
    if (a.form !== undefined && (typeof a.form !== "string" || !FORMS.has(a.form))) return null;
    if (a.opaque !== undefined && !(typeof a.opaque === "number" && Number.isFinite(a.opaque) && a.opaque >= 0)) return null;
    const lights = parseLights(a.lights);
    if (!lights) return null;
    const anchors: Partial<Record<Side, XY>> = {};
    for (const side of ["n", "e", "s", "w"] as const) {
      const at = a.anchors?.[side];
      if (at === undefined) continue;
      if (!isXY(at)) return null;
      anchors[side] = at;
    }
    if (id !== "marketing" && (["n", "e", "s", "w"] as const).some((side) => !anchors[side])) return null;
    islands[id] = {
      lit: a.lit, dark: a.dark, w: a.w!, h: a.h!, form: a.form ?? ISLAND_FORM[id], anchors, lamp: a.lamp ?? null, label: a.label,
      pad: a.pad ?? null, beacon: a.beacon ?? null, lights, opaque: a.opaque ?? 0,
      colors: a.colors ?? { lit: [], dark: [] }, bytes: a.bytes ?? { lit: 0, dark: 0 },
    };
  }
  return { version: 1, unit: "city-px", islands };
}

/** Fetches and validates manifest.json. Resolves null (never rejects): the city then keeps the expected sizes and draws
 *  no island pictures. The webps themselves come through the deck's shared ArtLoader (spriteName). */
export async function loadManifest(url: string = MANIFEST_URL, request: typeof fetch = fetch): Promise<CityManifest | null> {
  try {
    const response = await request(url);
    if (!response.ok) return null;
    return parseManifest(await response.json());
  } catch {
    return null;
  }
}
