import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { existsSync, readFileSync as readText } from "node:fs";
import { resolve } from "node:path";
import { FIRST_FRAME_ART } from "../src/deck2d/main";

// A stranger's first seconds on shiptorio.dev (Justin 2026-10-29: "load fast and never show a blank").
const web = resolve(import.meta.dir, "..");
const read = (path: string) => readFileSync(resolve(web, path));
const html = read("deck.html").toString();

test("deck.html preloads exactly the pictures the first frame waits for", () => {
  const preloaded = [...html.matchAll(/<link rel="preload" href="\/deck\/art\/([\w-]+)\.webp" as="image"/g)].map((m) => m[1]);
  expect(preloaded).toEqual([...FIRST_FRAME_ART]);
});

test("the page shows the dimmed sky before any script runs, and no button until the deck is up", () => {
  expect(html).toContain('<body class="deck-page">');
  expect(read("src/deck2d/deck.css").toString()).toMatch(/body\.deck-page \{\s*background: url\("\/deck\/art\/sky-dim\.webp"\)/);
  expect(html).toMatch(/<button id="zoom"[^>]* hidden>/);
});

test("the baked dim pictures match their sources (re-run python3 scripts/art/dim-sky.py)", () => {
  const baked = JSON.parse(read("public/deck/art/dim-sources.json").toString());
  const palette = read("src/deck2d/contract.ts").toString().match(/export const PALETTE = \{(.*?)\} as const;/s)![1];
  const dimSource = ["src/deck2d/engine/dim.ts", "src/deck2d/engine/engine.ts"].map((f) => resolve(web, f)).filter(existsSync).map((f) => readText(f, "utf8")).find((t) => /const DIM = \d+;/.test(t))!;
  expect(baked.dim).toBe(Number(dimSource.match(/const DIM = (\d+);/)![1]));
  expect(baked.palette).toBe(createHash("sha256").update(palette).digest("hex"));
  for (const name of ["sky", "clouds"]) {
    expect(baked.sources[name]).toBe(createHash("sha256").update(read(`public/deck/art/${name}.webp`)).digest("hex"));
    expect(read(`public/deck/art/${name}-dim.webp`).length).toBeGreaterThan(0);
  }
});
