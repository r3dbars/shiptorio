import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { CITY_ISLANDS, PALETTE, PALETTE_48, type CityIsland } from "../src/deck2d/contract";
import { EXPECTED_SIZE, ISLAND_FORM, fallbackManifest, parseManifest } from "../src/deck2d/city/manifest";

// The city reveal's island sprites: ten lossless webps and one manifest.json in web/public/deck/art/city/, made by
// scripts/city-art.py from five painting crops on five drawn bases (web/src/deck2d/city/DIRECTION.md section A); the
// 1536x1024 paintings never enter the tree. The structure checks read the files directly. The pixel checks decode each
// webp with Bun.Image, which Bun has had since 1.4; on a Bun without it they are skipped (the manifest's own colour audit,
// checked below, still pins the palette) instead of pulling an image library into the repo.

const DIR = join(import.meta.dir, "../public/deck/art/city");
const SCRIPT = join(import.meta.dir, "../../scripts/city-art.py");
const KB = 1024;

type XY = [number, number];
type Kind = "signal" | "pad" | "thruster" | "window" | "crack";
interface Entry {
  lit: string; dark: string; w: number; h: number; form: string;
  anchors: Partial<Record<"n" | "e" | "s" | "w", XY>>;
  lamp: XY | null; label: XY; pad: XY | null; beacon: XY | null;
  lights: { at: XY; kind: Kind }[]; opaque: number;
  colors: { lit: string[]; dark: string[] }; bytes: { lit: number; dark: number };
}
interface Manifest { version: number; unit: string; islands: Record<CityIsland, Entry> }

const manifest: Manifest = JSON.parse(readFileSync(join(DIR, "manifest.json"), "utf8"));
const entries = CITY_ISLANDS.map((id) => [id, manifest.islands[id]] as const);
/** Section A: each island's form, its size (width exact, height within 3) and its height class. No two share a class. */
const FORM: Record<CityIsland, string> = { errors: "caldera", traffic: "rail-slab", inbox: "post-tower", customers: "landing-disc", marketing: "beacon-rock" };
const SIZE: Record<CityIsland, [number, number]> = { errors: [156, 128], traffic: [200, 88], inbox: [64, 176], customers: [196, 96], marketing: [76, 148] };
const HEIGHT_CLASS: Record<CityIsland, [number, number]> = { traffic: [80, 88], customers: [92, 100], errors: [124, 132], marketing: [144, 152], inbox: [172, 180] };
/** The lights each island carries, by kind. */
const LIGHTS: Record<CityIsland, Partial<Record<Kind, number>>> = { errors: { crack: 3 }, traffic: { signal: 8 }, inbox: { window: 4 }, customers: { pad: 12, thruster: 3 }, marketing: { signal: 4, window: 4 } };
/** No island outweighs the line: at most 200 wide, at most 12,500 opaque px (0.38 of the line's 399 x 83 box). */
const MAX_W = 200, MAX_OPAQUE = 12500;
/** The line keeps the brightest colours: at most 16 px of white[0] + brass[5] per lit island (its lamp, pad or beacon). */
const MAX_BRIGHT = 16;
/** Errors' crack is the island's identity: at least 350 lava px lit, hot to cool from its core to the rock (sun[5], sun[3],
 *  jam[1]). In the dark sprite its core goes jam[1] and its edges jam[0]. */
const MIN_CRACK = 350;
const lava = new Set<string>([PALETTE.sun[5], PALETTE.sun[3], PALETTE.jam[1]]);
const LAVA_DARK: Record<string, string> = {
  [PALETTE.sun[5]]: PALETTE.jam[1], [PALETTE.sun[3]]: PALETTE.jam[0], [PALETTE.jam[1]]: PALETTE.jam[0], [PALETTE.jam[2]]: PALETTE.jam[1], [PALETTE.jam[0]]: PALETTE.jam[0],
};
/** A dark island keeps its relief: at most 40% of its px soot (soot is the outline only), at least 25% iron[1] + iron[2],
 *  and no tone (the crack's reds aside) brighter than L* 36, below iron[3], so it still reads as dark. */
const MAX_DARK_SOOT = 0.4, MIN_DARK_MID = 0.25, MAX_DARK_L = 36;

const soot = PALETTE.soot[0], iron0 = PALETTE.iron[0], iron1 = PALETTE.iron[1], iron2 = PALETTE.iron[2], copper0 = PALETTE.copper[0], plate3 = PALETTE.plate[3];
const jam = new Set<string>(PALETTE.jam);
const bright = new Set<string>([PALETTE.white[0], PALETTE.brass[5]]);
const palette = new Set<string>(PALETTE_48);
/** What the dark sprite may use: the soot outline, three iron tones and a copper[0] rim light (the last of the sunset on its
 *  upper right), plus the Errors crack's two reds. */
const darkColors = (id: CityIsland) => new Set<string>(id === "errors" ? [soot, iron0, iron1, iron2, copper0, PALETTE.jam[0], PALETTE.jam[1]] : [soot, iron0, iron1, iron2, copper0]);
const files = (e: Entry) => [e.lit, e.dark];

/** CIELAB L of an sRGB hex (D65), as city-art.py computes it. */
function lightness(hex: string) {
  const lin = (i: number) => { const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const y = 0.2126729 * lin(0) + 0.7151522 * lin(1) + 0.072175 * lin(2);
  return 116 * (y > 216 / 24389 ? Math.cbrt(y) : (24389 / 27 * y + 16) / 116) - 16;
}
/** The dark rule for one lit colour (before the rim light, and away from the soot outline): L < 20 iron[0], L < 40 iron[1],
 *  else iron[2], never soot; Errors' lava keeps an ember (sun[5] -> jam[1], sun[3] and jam[1] -> jam[0]). */
const darkOf = (id: CityIsland, hex: string) => {
  if (id === "errors" && LAVA_DARK[hex]) return LAVA_DARK[hex];
  const l = lightness(hex);
  return l < 20 ? iron0 : l < 40 ? iron1 : iron2;
};

describe("the island art on disk", () => {
  test("the manifest names the five islands in reveal order, in city px, each with its own form", () => {
    expect(manifest.version).toBe(1);
    expect(manifest.unit).toBe("city-px");
    expect(Object.keys(manifest.islands)).toEqual([...CITY_ISLANDS]);
    for (const [id, e] of entries) {
      expect(e.lit).toBe(`${id}-lit.webp`);
      expect(e.dark).toBe(`${id}-dark.webp`);
      expect(e.form, id).toBe(FORM[id]);
    }
    expect(new Set(entries.map(([, e]) => e.form)).size, "five different forms").toBe(5);
  });

  test("the folder holds the manifest and the ten webps, and nothing else (the 1536x1024 paintings stay out of the tree)", () => {
    const expected = ["manifest.json", ...entries.flatMap(([, e]) => files(e))].sort();
    expect(readdirSync(DIR).filter((f) => !f.startsWith(".")).sort()).toEqual(expected);
  });

  test("every file is a lossless webp of exactly the size the manifest says, under 80 KB, the folder under 1 MB", () => {
    let total = statSync(join(DIR, "manifest.json")).size;
    for (const [id, e] of entries) {
      for (const [kind, file] of [["lit", e.lit], ["dark", e.dark]] as const) {
        const bytes = readFileSync(join(DIR, file));
        total += bytes.length;
        expect(bytes.length, `${file} is ${bytes.length} bytes`).toBeLessThan(80 * KB);
        expect(e.bytes[kind], `${file}: the manifest's byte audit`).toBe(bytes.length);
        // RIFF....WEBPVP8L....<0x2f><14 bits width-1><14 bits height-1>: a lossless (VP8L) simple-format file
        expect(bytes.toString("latin1", 0, 4), file).toBe("RIFF");
        expect(bytes.toString("latin1", 8, 16), `${file} is not lossless`).toBe("WEBPVP8L");
        expect(bytes[20], file).toBe(0x2f);
        const bits = bytes.readUInt32LE(21);
        expect([(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1], `${id}: ${file} header size`).toEqual([e.w, e.h]);
      }
    }
    expect(total, "the folder").toBeLessThan(1024 * KB);
  });

  test("sizes follow section A: width exact and at most 200, height within 3 and in the island's own height class", () => {
    for (const [id, e] of entries) {
      expect(e.w, id).toBe(SIZE[id][0]);
      expect(e.w, id).toBeLessThanOrEqual(MAX_W);
      expect(Math.abs(e.h - SIZE[id][1]), `${id} is ${e.w}x${e.h}`).toBeLessThanOrEqual(3);
      expect(e.h >= HEIGHT_CLASS[id][0] && e.h <= HEIGHT_CLASS[id][1], `${id} h ${e.h} in ${HEIGHT_CLASS[id].join("-")}`).toBe(true);
    }
    // five height classes, so no two islands stand the same height
    const classes = Object.values(HEIGHT_CLASS).sort((a, b) => a[0] - b[0]);
    classes.slice(1).forEach((c, i) => expect(c[0], "height classes overlap").toBeGreaterThan(classes[i][1]));
  });

  test("no island outweighs the line: at most 12,500 opaque px each", () => {
    for (const [id, e] of entries) {
      expect(Number.isInteger(e.opaque) && e.opaque > 0, `${id}.opaque`).toBe(true);
      expect(e.opaque, id).toBeLessThanOrEqual(MAX_OPAQUE);
      expect(e.opaque, `${id}: opaque fits the sprite`).toBeLessThanOrEqual(e.w * e.h);
    }
  });

  test("every audited color is one of the 48; dark is soot, iron[0..2] and a copper[0] rim (Errors also keeps jam[0] and jam[1]), none brighter than L* 36", () => {
    for (const [id, e] of entries) {
      expect(e.colors.lit.filter((c) => !palette.has(c)), `${id} lit`).toEqual([]);
      expect(e.colors.dark.filter((c) => !darkColors(id).has(c)), `${id} dark`).toEqual([]);
      expect([...e.colors.lit].sort(), `${id}: audit is sorted and unique`).toEqual([...new Set(e.colors.lit)].sort());
      // jam red means stuck on this deck: only the Errors crack may use it
      if (id !== "errors") expect(e.colors.lit.filter((c) => jam.has(c)), `${id} lit`).toEqual([]);
      // the dark sprite keeps relief: all four tones, not just the outline's soot
      expect(e.colors.dark, `${id} dark colours`).toEqual(expect.arrayContaining([soot, iron0, iron1, iron2]));
      // and stays dark: no tone but the crack's reds brighter than L* 36, and none as bright as iron[3]
      for (const c of e.colors.dark) if (!jam.has(c)) expect(lightness(c), `${id} dark ${c}`).toBeLessThanOrEqual(MAX_DARK_L);
      for (const c of e.colors.dark) if (!jam.has(c)) expect(lightness(c), `${id} dark ${c}`).toBeLessThan(lightness(PALETTE.iron[3]));
    }
    // the crack: hot to cool lit (a sun[5] core, sun[3], jam[1] where it meets the rock; no other red), a jam[1] core with
    // jam[0] edges dark
    expect(manifest.islands.errors.colors.lit).toEqual(expect.arrayContaining([...lava]));
    expect(manifest.islands.errors.colors.lit).not.toContain(PALETTE.jam[0]);
    expect(manifest.islands.errors.colors.lit).not.toContain(PALETTE.jam[2]);
    expect(manifest.islands.errors.colors.dark).toEqual(expect.arrayContaining([soot, iron0, PALETTE.jam[0], PALETTE.jam[1]]));
  });

  test("every anchor, lamp, pad, beacon and light is inside its sprite, the label just under it, each only where it belongs", () => {
    for (const [id, e] of entries) {
      const inside = ([x, y]: XY, what: string, below = 0) => {
        expect(Number.isInteger(x) && Number.isInteger(y), `${id}.${what} is whole px`).toBe(true);
        expect(x >= 0 && x < e.w && y >= 0 && y < e.h + below, `${id}.${what} ${x},${y} in ${e.w}x${e.h}`).toBe(true);
      };
      for (const [side, at] of Object.entries(e.anchors)) inside(at as XY, `anchors.${side}`);
      if (e.lamp) inside(e.lamp, "lamp");
      if (e.pad) inside(e.pad, "pad");
      if (e.beacon) inside(e.beacon, "beacon");
      for (const light of e.lights) inside(light.at, `light ${light.kind}`);
      inside(e.label, "label", 5); // the label hangs 4 px under the lowest pixel, so it may sit up to 4 px past h
      expect(Object.keys(e.anchors).sort(), `${id} anchors`).toEqual(id === "marketing" ? [] : ["e", "n", "s", "w"]);
      expect(e.lamp === null, `${id} lamp`).toBe(id === "marketing");
      expect(e.pad !== null, `${id} pad`).toBe(id === "customers");
      expect(e.beacon !== null, `${id} beacon`).toBe(id === "marketing");
      const kinds: Partial<Record<Kind, number>> = {};
      for (const light of e.lights) kinds[light.kind] = (kinds[light.kind] ?? 0) + 1;
      expect(kinds, `${id} lights`).toEqual(LIGHTS[id]);
    }
  });

  test("manifest.ts agrees with the files: the same sizes and forms, and the shipped points within 2 px of its stand-ins", () => {
    const parsed = parseManifest(manifest), stand = fallbackManifest();
    expect(parsed).not.toBeNull();
    for (const [id, e] of entries) {
      expect(EXPECTED_SIZE[id].w, id).toBe(e.w);
      expect(Math.abs(EXPECTED_SIZE[id].h - e.h), id).toBeLessThanOrEqual(3);
      expect(ISLAND_FORM[id], id).toBe(e.form as typeof ISLAND_FORM[CityIsland]);
      expect(parsed!.islands[id].lights, id).toEqual(e.lights);
      expect(parsed!.islands[id].opaque, id).toBe(e.opaque);
      const near = (a: XY | null, b: XY | null, what: string) => {
        expect(a === null, `${id}.${what}`).toBe(b === null);
        if (a && b) expect(Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])), `${id}.${what} ${a} vs ${b}`).toBeLessThanOrEqual(2);
      };
      const s = stand.islands[id];
      expect(Object.keys(s.anchors).sort(), id).toEqual(Object.keys(e.anchors).sort());
      for (const side of Object.keys(e.anchors) as (keyof Entry["anchors"])[]) near(e.anchors[side]!, s.anchors[side]!, `anchors.${side}`);
      near(e.lamp, s.lamp, "lamp"); near(e.pad, s.pad, "pad"); near(e.beacon, s.beacon, "beacon"); near(e.label, s.label, "label");
    }
  });

  test("parseManifest defaults form, opaque and lights when an older file leaves them out, and refuses them malformed", () => {
    const strip = JSON.parse(JSON.stringify(manifest));
    for (const id of CITY_ISLANDS) { delete strip.islands[id].form; delete strip.islands[id].opaque; delete strip.islands[id].lights; }
    const old = parseManifest(strip)!;
    expect(old).not.toBeNull();
    for (const id of CITY_ISLANDS) expect([old.islands[id].form, old.islands[id].opaque, old.islands[id].lights], id).toEqual([ISLAND_FORM[id], 0, []]);
    const mutate = (f: (m: any) => void) => { const m = JSON.parse(JSON.stringify(manifest)); f(m); return parseManifest(m); };
    expect(mutate(() => {})).not.toBeNull();
    expect(mutate((m) => { m.islands.errors.form = "volcano"; })).toBeNull();
    expect(mutate((m) => { m.islands.traffic.opaque = -1; })).toBeNull();
    expect(mutate((m) => { m.islands.traffic.opaque = "lots"; })).toBeNull();
    expect(mutate((m) => { m.islands.inbox.lights = "four"; })).toBeNull();
    expect(mutate((m) => { m.islands.inbox.lights[0].kind = "lamp"; })).toBeNull();
    expect(mutate((m) => { m.islands.customers.lights[0].at = [1]; })).toBeNull();
    expect(mutate((m) => { m.islands.marketing.lights = []; })).not.toBeNull();
  });

  test("scripts/city-art.py carries the same 48 colors as contract.ts", () => {
    const script = readFileSync(SCRIPT, "utf8");
    const block = /^PALETTE = \{([\s\S]*?)^\}/m.exec(script)?.[1] ?? "";
    expect(block.match(/#[0-9a-f]{6}/gi)?.map((c) => c.toLowerCase())).toEqual([...PALETTE_48]);
  });
});

// ---------- pixels (Bun.Image: webp -> png, then a tiny png reader) ----------

interface Pixels { w: number; h: number; rgba: Uint8Array }
const BunImage = (Bun as unknown as { Image?: new (bytes: Uint8Array) => { png(): { bytes(): Promise<Uint8Array> }; metadata(): Promise<unknown> } }).Image;
const bytesOf = (file: string) => new Uint8Array(readFileSync(join(DIR, file)));
const canDecode = await (async () => {
  if (!BunImage) return false;
  try { await new BunImage(bytesOf(manifest.islands.errors.lit)).metadata(); return true; } catch { return false; }
})();

/** 8-bit RGB / RGBA, not interlaced: what Bun.Image writes. Anything else is an error rather than a silent skip. */
function readPng(png: Uint8Array): Pixels {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let at = 8, w = 0, h = 0, color = 0;
  const idat: Buffer[] = [];
  while (at < png.length) {
    const length = view.getUint32(at), type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    if (type === "IHDR") {
      w = view.getUint32(at + 8); h = view.getUint32(at + 12); color = png[at + 17];
      if (png[at + 16] !== 8 || png[at + 20] !== 0 || (color !== 6 && color !== 2)) throw new Error("png: expected 8-bit RGB(A), not interlaced");
    } else if (type === "IDAT") idat.push(Buffer.from(png.subarray(at + 8, at + 8 + length)));
    at += 12 + length;
  }
  const bpp = color === 6 ? 4 : 3, stride = w * bpp, raw = inflateSync(Buffer.concat(idat)), out = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[dst + i - bpp] : 0, b = y ? out[dst - stride + i] : 0, c = y && i >= bpp ? out[dst - stride + i - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const guess = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      out[dst + i] = (raw[src + i] + guess) & 255;
    }
  }
  if (bpp === 4) return { w, h, rgba: out };
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { rgba.set(out.subarray(i * 3, i * 3 + 3), i * 4); rgba[i * 4 + 3] = 255; }
  return { w, h, rgba };
}

async function decode(file: string): Promise<Pixels> {
  return readPng(await new BunImage!(bytesOf(file)).png().bytes());
}
const hexAt = (p: Pixels, x: number, y: number) => {
  const i = (y * p.w + x) * 4;
  return p.rgba[i + 3] ? `#${[0, 1, 2].map((k) => p.rgba[i + k].toString(16).padStart(2, "0")).join("")}` : null;
};
const opaqueAt = (p: Pixels, x: number, y: number) => x >= 0 && y >= 0 && x < p.w && y < p.h && p.rgba[(y * p.w + x) * 4 + 3] > 0;

describe.skipIf(!canDecode)("the island pixels (decoded with Bun.Image)", () => {
  for (const [id, e] of entries) {
    test(`${id}: palette only, no partial alpha, the audited colors, a soot outline, dark posterized from lit with a rim light, at most 40% soot`, async () => {
      const lit = await decode(e.lit), dark = await decode(e.dark);
      for (const p of [lit, dark]) expect([p.w, p.h], id).toEqual([e.w, e.h]);
      const seen = { lit: new Set<string>(), dark: new Set<string>() };
      let opaque = 0, shine = 0, red = 0, hot = 0, night = 0, relief = 0;
      for (let y = 0; y < e.h; y++) {
        for (let x = 0; x < e.w; x++) {
          const a = lit.rgba[(y * e.w + x) * 4 + 3], b = dark.rgba[(y * e.w + x) * 4 + 3];
          if ((a !== 0 && a !== 255) || a !== b) expect.unreachable(`${id}: alpha ${a} / ${b} at ${x},${y}`);
          const l = hexAt(lit, x, y), d = hexAt(dark, x, y);
          if (!l || !d) continue;
          opaque++;
          if (bright.has(l)) shine++;
          if (jam.has(l)) red++;
          if (lava.has(l)) hot++;
          if (d === soot) night++;
          if (d === iron1 || d === iron2) relief++;
          seen.lit.add(l); seen.dark.add(d);
          if (!palette.has(l)) expect.unreachable(`${id}: ${l} at ${x},${y} is not one of the 48`);
          if (!darkColors(id).has(d)) expect.unreachable(`${id}: dark ${d} at ${x},${y} is not an allowed dark colour`);
          // dark = lit posterized by CIELAB L, except the upper-right edge (the lit sun rim, plate[3], is the dark rim light,
          // copper[0]) and the outline (soot in both); soot is never a dark tone of its own
          const outline = l === soot && d === soot;
          if (d === soot && l !== soot) expect.unreachable(`${id}: dark soot at ${x},${y} where lit is ${l}: soot is the outline only`);
          if (!outline && d !== darkOf(id, l) && !(l === plate3 && d === copper0)) expect.unreachable(`${id}: dark ${d} at ${x},${y}, lit ${l}, wanted ${darkOf(id, l)}`);
          // a 1 px soot outline: a pixel with a see-through 4-neighbour is on the edge, and the edge is soot, lit and dark
          if ((l !== soot || d !== soot) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !opaqueAt(lit, x + dx, y + dy))) expect.unreachable(`${id}: edge pixel ${x},${y} is ${l} / ${d}, not soot`);
        }
      }
      expect([...seen.lit].sort(), `${id} lit colors vs the manifest's audit`).toEqual(e.colors.lit);
      expect([...seen.dark].sort(), `${id} dark colors vs the manifest's audit`).toEqual(e.colors.dark);
      expect(opaque, `${id}: opaque px vs the manifest`).toBe(e.opaque);
      expect(shine, `${id}: white[0] + brass[5] px`).toBeLessThanOrEqual(MAX_BRIGHT);
      // the dark island keeps its relief: soot is its outline, and the rest of it reads in three iron tones
      expect(night / opaque, `${id}: dark soot share`).toBeLessThanOrEqual(MAX_DARK_SOOT);
      expect(relief / opaque, `${id}: dark iron[1] + iron[2] share`).toBeGreaterThanOrEqual(MIN_DARK_MID);
      if (id === "errors") expect(hot, "errors: lava px in the crack (sun[5], sun[3], jam[1])").toBeGreaterThanOrEqual(MIN_CRACK);
      else expect(red, `${id}: jam px`).toBe(0);
    });

    test(`${id}: every anchor, lamp, pad, beacon and light is on an opaque pixel, the label hangs 4 px under the lowest pixel`, async () => {
      const lit = await decode(e.lit);
      const points: [string, XY][] = [...Object.entries(e.anchors) as [string, XY][]];
      for (const key of ["lamp", "pad", "beacon"] as const) if (e[key]) points.push([key, e[key]!]);
      for (const light of e.lights) points.push([`light ${light.kind}`, light.at]);
      for (const [what, [x, y]] of points) expect(opaqueAt(lit, x, y), `${id}.${what} ${x},${y}`).toBe(true);
      // the steady part of each light (city/draw.ts drawLight: a 2 x 2 lamp, a 3 x 2 thruster core) lands on the island, never
      // on the sky beside it
      for (const { at: [x, y], kind } of e.lights) {
        const cells = kind === "thruster" ? [[-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] : kind === "crack" ? [] : [[0, 0], [1, 0], [0, 1], [1, 1]];
        for (const [dx, dy] of cells) expect(opaqueAt(lit, x + dx, y + dy), `${id}: ${kind} light at ${x},${y} covers ${x + dx},${y + dy}`).toBe(true);
      }
      let lowest = e.h - 1;
      while (lowest > 0 && !Array.from({ length: e.w }, (_, x) => x).some((x) => opaqueAt(lit, x, lowest))) lowest--;
      expect(e.label[1], `${id}.label y`).toBe(lowest + 4);
      expect(e.label[0], `${id}.label x`).toBeGreaterThan(e.w * 0.3);
      expect(e.label[0], `${id}.label x`).toBeLessThan(e.w * 0.7);
    });
  }

  test("Marketing stands on one round boulder, a U and never a V: 72-76 wide over rows 110-130, widest at 122, 44 or more at 140, flat underneath", async () => {
    const lit = await decode(manifest.islands.marketing.lit);
    // the 8-connected pieces of the sprite: the island (boulder, plate, ring, mast, wires) and the loose pebbles
    const piece = new Map<string, number>(), sizes: number[] = [];
    for (let y = 0; y < lit.h; y++) for (let x = 0; x < lit.w; x++) {
      if (!opaqueAt(lit, x, y) || piece.has(`${x},${y}`)) continue;
      const id = sizes.length, stack: XY[] = [[x, y]];
      piece.set(`${x},${y}`, id); sizes.push(0);
      while (stack.length) {
        const [px, py] = stack.pop()!;
        sizes[id]++;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const k = `${px + dx},${py + dy}`;
          if (opaqueAt(lit, px + dx, py + dy) && !piece.has(k)) { piece.set(k, id); stack.push([px + dx, py + dy]); }
        }
      }
    }
    const island = piece.get("37,122")!;
    const span = (y: number) => {
      const xs = Array.from({ length: lit.w }, (_, x) => x).filter((x) => piece.get(`${x},${y}`) === island);
      return { w: xs.length ? xs.at(-1)! - xs[0] + 1 : 0, gaps: xs.length ? xs.at(-1)! - xs[0] + 1 - xs.length : 0 };
    };
    for (let y = 110; y <= 130; y++) expect(span(y).w, `row ${y}`).toBeGreaterThanOrEqual(72);
    const widest = Math.max(...Array.from({ length: 41 }, (_, i) => span(104 + i).w));
    expect(widest, "the widest row").toBeLessThanOrEqual(76);
    expect(span(122).w, "row 122 is the widest").toBe(widest);
    expect(span(140).w, "row 140").toBeGreaterThanOrEqual(44);
    // under its widest row it only narrows (no lobe, no hanging point) down to a flat bottom 28-36 wide, all one run
    let bottom = 122;
    while (span(bottom + 1).w > 0) {
      expect(span(bottom + 1).w, `row ${bottom + 1} is no wider than the row above`).toBeLessThanOrEqual(span(bottom).w);
      bottom++;
    }
    expect(bottom, "the boulder's lowest row").toBeGreaterThanOrEqual(144);
    expect(span(bottom).gaps, "flat underneath").toBe(0);
    expect(span(bottom).w, "its flat bottom").toBeGreaterThanOrEqual(28);
    expect(span(bottom).w, "its flat bottom").toBeLessThanOrEqual(36);
    // two loose pebbles under it, each with 2 px of air or more from the island all round
    const loose = sizes.map((n, id) => id).filter((id) => id !== island);
    expect(loose, "two pebbles").toHaveLength(2);
    for (const [k, id] of piece) {
      if (id === island) continue;
      const [x, y] = k.split(",").map(Number);
      expect(y, "a pebble hangs below the boulder's widest row").toBeGreaterThan(130);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) expect(piece.get(`${x + dx},${y + dy}`) === island, `pebble px ${x},${y} within 2 px of the boulder`).toBe(false);
    }
    // the foot plate sits inside the boulder's crown, not on it like a lid: the stone runs past both its ends
    const plate = manifest.islands.marketing.lights.filter((l) => l.kind === "signal").map((l) => l.at[1]);
    expect(new Set(plate).size, "the four signal lamps sit on one row: the plate").toBe(1);
    for (let y = plate[0] - 1; y <= plate[0] + 1; y++) expect(span(y).w, `row ${y}, the plate's`).toBeGreaterThan(42);
  });

  test("Inbox's window is an envelope: a 9 x 7 soot frame round a haze[3] envelope with a brass[2] V flap and a white[0] glint", async () => {
    const lit = await decode(manifest.islands.inbox.lit);
    const frame = (x0: number, y0: number) => {
      for (let y = y0; y < y0 + 7; y++) for (let x = x0; x < x0 + 9; x++) {
        const edge = x === x0 || y === y0 || x === x0 + 8 || y === y0 + 6;
        if (edge !== (hexAt(lit, x, y) === soot)) return false;
      }
      return true;
    };
    const found: XY[] = [];
    for (let y = 0; y + 7 <= manifest.islands.inbox.anchors.n![1]; y++) for (let x = 0; x + 9 <= lit.w; x++) if (frame(x, y)) found.push([x, y]);
    expect(found, "one envelope window above the plinth").toHaveLength(1);
    const [x0, y0] = found[0], body: string[] = [];
    for (let y = y0 + 1; y < y0 + 6; y++) for (let x = x0 + 1; x < x0 + 8; x++) body.push(hexAt(lit, x, y)!);
    expect(new Set(body)).toEqual(new Set([PALETTE.haze[3], PALETTE.brass[2], PALETTE.white[0]]));
    // the flap: a V of brass[2] from the envelope's two top corners down to its middle
    for (const [dx, dy] of [[0, 0], [1, 1], [2, 2], [3, 3], [4, 2], [5, 1], [6, 0]]) expect(hexAt(lit, x0 + 1 + dx, y0 + 1 + dy), `the V at ${dx},${dy}`).toBe(PALETTE.brass[2]);
  });
});
