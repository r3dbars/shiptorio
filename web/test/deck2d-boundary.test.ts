import { expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// The deck and the shared code it runs (sim, source, store) never import the old app (map/, ui/, buildout/, App),
// so the old app can be deleted without touching the deck.
const src = join(import.meta.dir, "../src");
const walk = (dir: string): string[] => readdirSync(dir).flatMap(f => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|js)$/.test(f) && !/\.d\.ts$/.test(f) ? [p] : [];
});
const DECK = [...walk(join(src, "deck2d")), ...walk(join(src, "sim")), ...walk(join(src, "source")), join(src, "store.ts")];
const LEGACY = /^(map|ui|buildout|judge)\/|^App(\.tsx)?$/;

test("the deck imports nothing from the old app", () => {
  const hits: string[] = [];
  for (const file of DECK) {
    for (const m of readFileSync(file, "utf8").matchAll(/(?:from\s+|import\s*\(\s*)["'](\.{1,2}\/[^"']+)["']/g)) {
      const target = relative(src, resolve(file, "..", m[1]));
      if (LEGACY.test(target)) hits.push(`${relative(src, file)} -> ${target}`);
    }
  }
  expect(hits).toEqual([]);
});
