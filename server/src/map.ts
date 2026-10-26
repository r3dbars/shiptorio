// Turns a repo tree into a Factorio-style map: each top-level folder is a zone,
// each file is one tile inside it. Pure function so it can be tested and cached.

import type { TreeEntry } from "./github";

export interface Tile {
  path: string;
  x: number;
  y: number;
  ext: string;
  size: number;
}

export interface Zone {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  files: number;
}

export interface GameMap {
  width: number;
  height: number;
  zones: Zone[];
  tiles: Tile[];
}

const ROOT_ZONE = "/";
const GAP = 2; // empty tiles between zones, room for belts later

export function zoneOf(path: string): string {
  const i = path.indexOf("/");
  return i === -1 ? ROOT_ZONE : path.slice(0, i);
}

function extOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function layoutMap(entries: TreeEntry[], maxRowWidth = 96): GameMap {
  const byZone = new Map<string, TreeEntry[]>();
  for (const e of entries) {
    if (e.type !== "blob") continue;
    const z = zoneOf(e.path);
    if (!byZone.has(z)) byZone.set(z, []);
    byZone.get(z)!.push(e);
  }

  // Biggest zones first so the shelf packing stays tidy.
  const zoneNames = [...byZone.keys()].sort((a, b) => byZone.get(b)!.length - byZone.get(a)!.length || a.localeCompare(b));

  const zones: Zone[] = [];
  const tiles: Tile[] = [];
  let cursorX = 0;
  let cursorY = 0;
  let shelfH = 0;
  let width = 0;

  for (const name of zoneNames) {
    const files = byZone.get(name)!.sort((a, b) => a.path.localeCompare(b.path));
    const w = Math.max(1, Math.ceil(Math.sqrt(files.length)));
    const h = Math.ceil(files.length / w);

    if (cursorX > 0 && cursorX + w > maxRowWidth) {
      cursorX = 0;
      cursorY += shelfH + GAP;
      shelfH = 0;
    }

    zones.push({ name, x: cursorX, y: cursorY, w, h, files: files.length });
    files.forEach((f, i) => {
      tiles.push({ path: f.path, x: cursorX + (i % w), y: cursorY + Math.floor(i / w), ext: extOf(f.path), size: f.size ?? 0 });
    });

    cursorX += w + GAP;
    shelfH = Math.max(shelfH, h);
    width = Math.max(width, cursorX - GAP);
  }

  return { width, height: zones.length ? cursorY + shelfH : 0, zones, tiles };
}
