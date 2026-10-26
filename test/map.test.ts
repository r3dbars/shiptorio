import { describe, expect, it } from "vitest";
import { layoutMap, zoneOf } from "../src/map";

const blob = (path: string) => ({ path, type: "blob" as const, size: 10 });

describe("layoutMap", () => {
  it("groups files by top-level folder", () => {
    expect(zoneOf("README.md")).toBe("/");
    expect(zoneOf("src/a/b.ts")).toBe("src");
  });

  it("gives every file its own tile and skips folders", () => {
    const entries = [
      blob("README.md"),
      { path: "src", type: "tree" as const },
      ...Array.from({ length: 10 }, (_, i) => blob(`src/f${i}.ts`)),
      blob("docs/a.md"),
    ];
    const map = layoutMap(entries);
    expect(map.tiles).toHaveLength(12);
    expect(map.zones.map((z) => z.name)).toEqual(["src", "/", "docs"]);
    const keys = new Set(map.tiles.map((t) => `${t.x},${t.y}`));
    expect(keys.size).toBe(12);
  });

  it("keeps tiles inside their zone and zones apart", () => {
    const entries = Array.from({ length: 300 }, (_, i) => blob(`z${i % 7}/file${i}.ts`));
    const map = layoutMap(entries, 40);
    for (const t of map.tiles) {
      const z = map.zones.find((z) => z.name === zoneOf(t.path))!;
      expect(t.x).toBeGreaterThanOrEqual(z.x);
      expect(t.x).toBeLessThan(z.x + z.w);
      expect(t.y).toBeGreaterThanOrEqual(z.y);
      expect(t.y).toBeLessThan(z.y + z.h);
    }
    for (const a of map.zones)
      for (const b of map.zones)
        if (a !== b) {
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          expect(overlap).toBe(false);
        }
  });

  it("handles an empty repo", () => {
    expect(layoutMap([])).toEqual({ width: 0, height: 0, zones: [], tiles: [] });
  });
});
