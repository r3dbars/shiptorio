// The sky behind the line and city zooms (city/DIRECTION.md, camera 2-5). Pure numbers: engine.ts draws them.
//
// sky.webp (2172 x 724) is drawn at a whole-number scale only, so its pixels are the same size as every other pixel on the
// screen (n = 1 on a desktop and a phone). It hangs so that its own skyline stands behind the line wherever the camera
// framed the ring. A tall screen gets bands of the picture's upper sky stacked upward and its cloud sea run on downward,
// with the cloud strips drifting over the bottom. At city zoom the sky follows the camera at 0.08 of its move and the
// strips at 0.2, in whole px, so a phone's pans have depth; under reduced motion the sky stays put.
//
// The picture is drawn from row 52 down: above row 52 the dimmed zenith is near-flat. A phone shows 700 px and more of sky
// above the picture, and one 32-row band tiled up it read as wallpaper, the same streaks again every 128 and 256 rows. So
// the bands above are cut from three windows of the picture's upper sky (SKY_WINDOWS: rows 52-84, 40-64 and 64-84) in a
// seeded order that never settles into a period, each from anywhere along the picture's width, and each band SKY_DEEPEN px
// higher is one ramp step darker (skyDarken): the zenith deepens, through the haze to plate and brass brown, like the dark
// reference, and keeps its streaks. The first band is rows 52-84 upside down, unshifted and as bright as the picture, as
// it always was, so the one band a desktop shows is unchanged.
//
// The picture paints floating islands of its own, and next to the five real ones each reads as a sixth or seventh. Each
// layout shifts the picture by a whole number of px (SKY_OFFSET, found by a search over dx -220..220 and dy -40..40) so its
// skyline and its sun sit well, and paints its islands out of that layout's copy of the sky (SKY_PAINTED, SKY_FILLS): from
// the cloud rows under one when it hangs in the cloud sea, else from the same rows beside it, mirrored, down to the foot of
// the skyline so the towers that take its place stand whole; E, which hangs in open sky, from the open sky round it. The
// sun stays, with its glow mirrored round it where an island hid part of it.
import { PALETTE } from "../contract";

/** sky.webp and clouds.webp, px. */
export const SKY = { w: 2172, h: 724 } as const;
export const CLOUDS = { w: 2172, h: 287 } as const;
/** The sky row that stands behind the line's top edge at the ring framing (before SKY_OFFSET): the middle of the skyline. */
export const SKY_ANCHOR = 194;
/** The picture is drawn from row `from` down, and the first band above it is its rows [from, to) upside down, so the two
 *  meet on the same row and the join is seamless. */
export const SKY_BAND = { from: 52, to: 84 } as const;
/** The picture's rows [from, to) the bands above it are cut from: SKY_BAND, the hazier sky over it (rows the picture itself
 *  never shows), and the warm streaks just over the spires. Below row 84 the spires begin. */
export const SKY_WINDOWS: readonly (readonly [number, number])[] = [[SKY_BAND.from, SKY_BAND.to], [40, 64], [64, 84]];
/** The picture's top rows [0, SKY_TOP) hold every window: what engine.ts keeps a darkened copy of for each step. */
export const SKY_TOP = Math.max(...SKY_WINDOWS.map(([, to]) => to));
/** A band above the picture is drawn one ramp step darker (skyDarken) for every SKY_DEEPEN px, times the scale, its foot
 *  hangs above the picture's top row, down to SKY_DEEPEST steps: there the zenith is brass[0] with plate[0] and iron[2]
 *  streaks, and one step more would leave it plate[0] and brass[0] alone, near flat. */
export const SKY_DEEPEN = 128;
export const SKY_DEEPEST = 4;
/** The seed of the bands' order, shifts and mirrors, so the sky is the same on every load and in every shot. */
export const SKY_SEED = 1029;
/** Rows of the picture's foot (its cloud sea) run on downward, mirrored, where the screen is taller than the picture. */
export const SKY_FOOT = 96;
/** How far the sky and the cloud strips follow a city camera move (the islands follow it all the way). */
export const SKY_PARALLAX = 0.08;
export const STRIP_PARALLAX = 0.2;

/** A box in sky.webp px: [x0, y0, x1, y1), right and bottom exclusive. */
export type SkyBox = readonly [number, number, number, number];
/** sky.webp's own floating islands (A to H, left to right), the two long smoke plumes, and the sun disc, by hand. The big
 *  island G is three boxes stepping in as its pyramid narrows, so the sun beside its tip is never inside one; the small
 *  island E is two, its spires and body, then its narrower rock, which hangs to row 199. */
export const SKY_BOXES = {
  A: [292, 105, 386, 208],
  B: [621, 75, 710, 172],
  "B smoke": [660, 0, 760, 75],
  C: [63, 340, 150, 420],
  D: [728, 297, 860, 400],
  E: [1133, 152, 1180, 184],
  "E tip": [1138, 184, 1176, 200],
  F: [1486, 118, 1566, 224],
  G: [1630, 92, 1820, 200],
  "G waist": [1665, 200, 1790, 233],
  "G tip": [1681, 233, 1790, 270],
  "G smoke": [1728, 0, 1880, 92],
  H: [1970, 277, 2085, 377],
  sun: [1650, 233, 1680, 262],
} as const satisfies Record<string, SkyBox>;
export type SkyBoxId = keyof typeof SKY_BOXES;

export type SkyLayout = "landscape" | "portrait";
/** The picture's whole-px shift per layout, [dx, dy] (deck2d-city-camera.test.ts re-runs the clearance check). Landscape:
 *  the sun stands just right of Marketing, wholly on a 1280 screen; portrait: every listed box is 24 px clear. */
export const SKY_OFFSET: Record<SkyLayout, readonly [number, number]> = { landscape: [34, -37], portrait: [-89, -34] };
/** What is painted out of each layout's copy of the sky: every island and plume, both layouts, the sun never. Landscape:
 *  no shift clears B, D, F and G with the sun wholly on a 1280 screen beside Marketing; A, C and H are clear but cut by
 *  the edge of a 1440 or a 1920 one; E is clear by 24 px but hangs right over the line's right end (the round 2 critics:
 *  no sky island within 60 px of the line or a label). Portrait: a phone at the ring shows E over the line's right end and
 *  D and F cut by its edges, and its bands above the picture are cut from anywhere along the picture's width, where B's
 *  rock and the two plumes stand in the windows' rows. */
const ISLANDS: readonly SkyBoxId[] = ["D", "C", "H", "A", "B", "B smoke", "E", "E tip", "F", "G", "G waist", "G tip", "G smoke"];
export const SKY_PAINTED: Record<SkyLayout, readonly SkyBoxId[]> = { landscape: ISLANDS, portrait: ISLANDS };
/** One fill of a painted box: a region of sky.webp and where its pixels come from. "below": the same columns of the rows
 *  right under it (the cloud sea runs on); "left" / "right": the same rows mirrored about the region's left / right edge;
 *  "sides": each row's left part from the left and its right part from the right, split where the two mirrors meet on the
 *  nearest colours, with a 4 px checker across the split (so no streak ends on a straight seam); a number: the same rows
 *  mirrored about that column (the sun's glow round the sun's own axis). */
export interface SkyFill { box: SkyBox; from: "below" | "left" | "right" | "sides" | number }
/** How each painted box is filled, in SKY_PAINTED's order (D before B: B's right half mirrors the columns D stood in). The
 *  sky islands' fills run down to row 330, the foot of the skyline. G's fills cover its waist and tip too: the sky above the
 *  sun's glow from the left, its right side and tip from the right, and the part of the glow it hid mirrored round the sun's
 *  own axis (column 1664.5), above the disc and right of it. E hangs in open sky between two towers, which must stay out of
 *  it: its left half is the sky beside it, mirrored, its right half that sky again, mirrored round the middle, and its rock
 *  is the open sky under it. */
export const SKY_FILLS: Partial<Record<SkyBoxId, readonly SkyFill[]>> = {
  A: [{ box: [292, 105, 386, 330], from: "sides" }],
  C: [{ box: [63, 340, 150, 420], from: "below" }],
  D: [{ box: [728, 297, 860, 400], from: "below" }],
  H: [{ box: [1970, 277, 2085, 377], from: "below" }],
  B: [{ box: [621, 75, 710, 330], from: "sides" }],
  "B smoke": [{ box: [660, 0, 760, 75], from: "sides" }],
  E: [{ box: [1133, 152, 1156, 184], from: "left" }, { box: [1156, 152, 1180, 184], from: 1155.5 }],
  "E tip": [{ box: [1138, 184, 1176, 200], from: "below" }],
  F: [{ box: [1486, 118, 1566, 330], from: "sides" }],
  G: [
    { box: [1630, 92, 1716, 200], from: "left" },
    { box: [1716, 92, 1820, 330], from: "right" },
    { box: [1665, 200, 1716, 233], from: 1664.5 },
    { box: [1681, 233, 1716, 272], from: 1664.5 },
  ],
  "G smoke": [{ box: [1728, 0, 1880, 92], from: "sides" }],
};
/** The fills that paint a layout's boxes out, in order (G's fills cover "G waist" and "G tip"). */
export const skyFills = (layout: SkyLayout): SkyFill[] => SKY_PAINTED[layout].flatMap((id) => SKY_FILLS[id] ?? []);

/** The picture's scale: 1, unless a buffer is wider than the picture less its widest shift either side. */
const MAX_DX = Math.max(...Object.values(SKY_OFFSET).map(([dx]) => Math.abs(dx)));
export const skyScale = (bw: number) => Math.max(1, Math.ceil(bw / (SKY.w - 2 * MAX_DX)));

/** The buffer row of the line's top edge if the camera were framing the ring: the line's top is city y `lineTop` (city
 *  px), the ring's centre is city y `ringY`, and the buffer is `bh` rows, origin rounded the way pixel.ts rounds it. */
export const ringLineRow = (bh: number, ringY: number, lineTop: number) => lineTop - Math.round(ringY - bh / 2);

/** How far the sky and the strips sit from where they would at the ring, buffer px: the camera is `dy` city px below the
 *  ring's centre. Constant (0) under reduced motion. */
export function skyLift(dy: number, still: boolean) {
  return still ? { sky: 0, strips: 0 } : { sky: Math.round(dy * SKY_PARALLAX), strips: Math.round(dy * STRIP_PARALLAX) };
}

/** One band of rows drawn above or below the picture: its top row in the buffer, the picture's rows it is cut from
 *  [from, from + rows), whether it is upside down (flip) and turned left for right (mirror), how many sky px its columns are
 *  shifted (never past either edge of the picture), and how many ramp steps darker it is drawn (skyDarken). */
export interface SkyBand { y: number; from: number; rows: number; flip: boolean; mirror: boolean; shift: number; dark: number }
export interface SkyPlan {
  n: number; // the picture's scale, a whole number
  x: number; y: number; // where the picture's top-left would be, buffer px (it is drawn from row SKY_BAND.from down)
  above: SkyBand[]; // from the picture's row SKY_BAND.from up to the buffer's top, `rows` (one of SKY_WINDOWS) each
  below: SkyBand[]; // SKY_FOOT rows each, from the picture's foot down to the buffer's bottom
  strips: number[]; // cloud strips' top rows, buffer px (each CLOUDS.h * n tall)
}
/** Column shifts of the cloud sea's bands below the picture, sky px: a little each, every other one mirrored. */
const SHIFTS = [0, 97, 41, 149, 13, 121, 67, 173];
/** The sky columns a buffer bw wide shows with the picture at x (scale n): [c0, c1). */
export const skyColumns = (bw: number, x: number, n: number) => [Math.max(0, Math.floor(-x / n)), Math.min(SKY.w, Math.ceil((bw - x) / n))] as const;
/** A small seeded generator (mulberry32): numbers in [0, 1), the same run for the same seed. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Where everything of the sky goes in a buffer bw x bh, for a layout, with the line's top at buffer row `lineRow` at the
 *  ring framing and `lift` from skyLift. Every row of the buffer is covered: bands above, the picture, the sea below. The
 *  bands above are laid from the picture's top row up, so a taller screen or a lift only adds bands at the top and every
 *  band keeps its place on the picture. */
export function skyPlan(bw: number, bh: number, lineRow: number, layout: SkyLayout, lift = { sky: 0, strips: 0 }): SkyPlan {
  const n = skyScale(bw), [dx, dy] = SKY_OFFSET[layout], w = SKY.w * n, h = SKY.h * n;
  const x = Math.round((bw - w) / 2) + dx * n, y = lineRow - SKY_ANCHOR * n + dy * n - lift.sky;
  const [c0, c1] = skyColumns(bw, x, n), top = y + SKY_BAND.from * n, rnd = seeded(SKY_SEED);
  const above: SkyBand[] = [], below: SkyBand[] = [];
  // The first band is SKY_BAND upside down. Each next one draws a window picked at random, the more likely the nearer one of
  // its edge rows is to the row under it (so most joins meet on like rows) and a third as likely when it is the window the
  // band under it drew; it hangs upside down when that puts the nearer edge row at the join, its columns come from anywhere
  // along the picture (shifted over the whole width the screen does not show), and it is turned left for right half the time.
  for (let i = 0, k = 0, foot = top, under: number = SKY_BAND.from; foot > 0; i++) {
    if (i) {
      const odds = SKY_WINDOWS.map(([f, t], j) => Math.exp(-Math.min(Math.abs(f - under), Math.abs(t - 1 - under)) / 6) * (j === k ? 1 / 3 : 1));
      let r = rnd() * odds.reduce((a, b) => a + b, 0);
      for (k = 0; k < odds.length - 1 && r >= odds[k]; k++) r -= odds[k];
    }
    const [from, to] = SKY_WINDOWS[k], rows = to - from, flip = Math.abs(from - under) <= Math.abs(to - 1 - under);
    const shift = i ? Math.floor(rnd() * (SKY.w - (c1 - c0) + 1)) - c0 : 0, mirror = i > 0 && rnd() < 0.5;
    const dark = Math.min(SKY_DEEPEST, Math.floor((top - foot) / (SKY_DEEPEN * n)));
    above.push({ y: foot - rows * n, from, rows, flip, mirror, shift, dark });
    foot -= rows * n;
    under = flip ? to - 1 : from;
  }
  // Below, the cloud sea runs on: every other band upside down, so each join lands on the same row, and a little shifted.
  const shift = (i: number) => Math.max(-c0, Math.min(SKY.w - c1, SHIFTS[(i - 1) % SHIFTS.length]));
  for (let i = 1, t = y + h; t < bh; i++, t += SKY_FOOT * n) {
    below.push({ y: t, from: SKY.h - SKY_FOOT, rows: SKY_FOOT, flip: i % 2 === 1, mirror: (i >> 1) % 2 === 1, shift: shift(i), dark: 0 });
  }
  // The strips drift over the bottom of the frame: a desktop keeps one, low (0.86 of the height, the critics' spectacle-16);
  // a tall screen stacks them from just above the picture's foot down to its bottom edge.
  const strips: number[] = [];
  if (layout === "landscape") strips.push(Math.round(bh * 0.86) - lift.strips);
  else for (let t = y + h - Math.round(CLOUDS.h * n * 0.4); t < bh; t += Math.round(CLOUDS.h * n * 0.7)) strips.push(t + lift.sky - lift.strips);
  return { n, x, y, above, below, strips };
}

type PaletteId = `${keyof typeof PALETTE}.${number}`;
const rgb = (id: PaletteId) => {
  const [ramp, i] = id.split(".") as [keyof typeof PALETTE, string];
  return parseInt((PALETTE[ramp] as readonly string[])[Number(i)].slice(1), 16);
};
/** One ramp step deeper for the colours of the sky's upper rows, as chains from light to dark: each colour steps to the
 *  next one, the shorter chains join the first, and its last colour, plate[0], is the floor. Copper deepens into the haze,
 *  the haze into plate brown, then iron, then brass[0]; the sun's dark streaks deepen into brass[0] too. Every colour moves
 *  one place a step, so a band keeps its streaks, a step darker, instead of running together into a flat fill. Colours on
 *  no chain stay as they are. */
export const SKY_DEEPER: readonly (readonly PaletteId[])[] = [
  ["copper.2", "copper.1", "copper.0", "haze.0", "plate.1", "iron.2", "brass.0", "plate.0"],
  ["sun.2", "sun.1", "sun.0", "brass.0"],
  ["haze.1", "copper.0"],
];
const STEP = new Map<number, number>();
for (const chain of SKY_DEEPER) chain.forEach((id, i) => { if (i + 1 < chain.length) STEP.set(rgb(id), rgb(chain[i + 1])); });
/** The zenith's dark iron[2] clouds fray into loose specks where a window's top edge cuts them, in rows the picture itself
 *  never shows (above SKY_BAND.from): in a band they are haze, like the sky round them. */
const FRINGE = rgb("iron.2"), HAZE = rgb("haze.0");

/** Darkens the picture's top rows in place (RGBA, `w` px wide, from row 0) by `steps` ramp steps: SKY_DEEPER, that many
 *  times. Above SKY_BAND.from the iron[2] fringe turns to haze first; rows from SKY_BAND.from down change only by the steps,
 *  so 0 steps leaves them exactly as they were. */
export function skyDarken(d: Uint8ClampedArray, w: number, steps: number) {
  const done = new Map<number, number>(), fringe = SKY_BAND.from * w * 4;
  let lastKey = -1, last = 0; // runs of one colour are long: look each up once
  for (let i = 0; i < d.length; i += 4) {
    const was = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2], key = i < fringe && was === FRINGE ? HAZE : was;
    if (key !== lastKey) {
      let c = done.get(key);
      if (c === undefined) {
        c = key;
        for (let s = 0; s < steps; s++) c = STEP.get(c) ?? c;
        done.set(key, c);
      }
      lastKey = key; last = c;
    }
    if (last !== was) { d[i] = last >> 16; d[i + 1] = (last >> 8) & 255; d[i + 2] = last & 255; }
  }
}

/** Paints regions of an RGBA picture w x h over with other pixels of it, fill by fill, in order (SkyFill). Mirroring keeps
 *  every join seamless: the sky's bands run straight through, and a tower beside a region stands on the same rows in it. */
export function paintOut(d: Uint8ClampedArray, w: number, h: number, fills: readonly SkyFill[]) {
  const col = (x: number) => Math.max(0, Math.min(w - 1, x));
  const diff = (y: number, a: number, b: number) => {
    const i = (y * w + col(a)) * 4, j = (y * w + col(b)) * 4;
    return Math.abs(d[i] - d[j]) + Math.abs(d[i + 1] - d[j + 1]) + Math.abs(d[i + 2] - d[j + 2]);
  };
  for (const { box: [x0, y0, x1, y1], from } of fills) {
    const mid = x0 + Math.floor((x1 - x0) / 2), rows = y1 - y0;
    for (let y = Math.max(0, y0); y < Math.min(h, y1); y++) {
      // "sides": this row's split, where the left mirror's last px and the right mirror's first px match best (nearest mid)
      let split = mid;
      if (from === "sides") {
        let best = Infinity;
        for (let s = x0 + 1; s < x1; s++) {
          const cost = diff(y, 2 * x0 - s, 2 * x1 - 1 - s) * 1000 + Math.abs(s - mid);
          if (cost < best) { best = cost; split = s; }
        }
      }
      for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) {
        let sx = x, sy = y;
        if (from === "below") sy = Math.min(h - 1, y + rows);
        else if (typeof from === "number") sx = Math.round(2 * from - x);
        else {
          const right = from === "right" || (from === "sides" && (Math.abs(x - split + 0.5) < 2 ? (x + y) % 2 === 1 : x >= split));
          sx = right ? 2 * x1 - 1 - x : 2 * x0 - 1 - x;
        }
        const to = (y * w + x) * 4, src = (sy * w + col(sx)) * 4;
        d[to] = d[src]; d[to + 1] = d[src + 1]; d[to + 2] = d[src + 2]; d[to + 3] = d[src + 3];
      }
    }
  }
}
