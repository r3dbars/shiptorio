// Shippy as real pixel art, drawn in code (contract: the pixel canvas, ?px=1). Every frame is built from parts on a
// grid of art px: the box (lantern on the left, eye slit, brass trim, handle), four brass legs, one arm, props.
// Then a 1 art px soot outline goes around the whole shape. Palette only, light from the upper right.
//
// Grid coordinates: x right from the body's middle column, y up from the feet (feet sit on row -1).
import { PALETTE } from "../contract";

const P = PALETTE;
/** One letter per palette color, so the parts below read like little drawings. */
const INK: Record<string, string> = {
  O: P.soot[0],
  s: P.steel[0], t: P.steel[1], u: P.steel[2], v: P.steel[3],
  k: P.iron[1], i: P.iron[3],
  b: P.brass[1], c: P.brass[2], d: P.brass[3], e: P.brass[4], f: P.brass[5],
  r: P.copper[0], R: P.copper[2],
  g: P.energy[0], G: P.energy[1], E: P.energy[2], F: P.energy[3],
  K: P.ok[1], L: P.ok[2],
  J: P.jam[1], j: P.jam[2],
  S: P.sun[5], h: P.haze[2],
};

export type PxEye = "off" | "on" | "ok" | "jam" | "wide";
export type PxFrame =
  | "box0" | "box1" | "unfold2" | "unfold3" | "stand" | "armout" | "peek"
  | `walk${0 | 1 | 2 | 3 | 4 | 5}` | `carry${0 | 1 | 2 | 3 | 4 | 5}`
  | "lever0" | "lever1" | "happy" | "alarm" | "weld0" | "weld1" | "inspect0" | "inspect1"
  | "poke0" | "poke1" | "skid" | "idle0" | "idle1";

type Cells = Map<string, string>;
export interface PxGrid { cells: Cells; minX: number; maxX: number; minY: number; maxY: number }

// The box in 3/4 view, 17 columns x 10 rows: a caged lantern (0-2), the box (3-16) with brass corner caps.
// Rows: 0-1 handle, 2-3 top face (catches the light), 4 the lid seam, 5-8 front face, 9 brass base band.
// Rivets are a light px over a dark one; rust and a grime dither sit low and left, away from the light.
// The eye slit is row 6 ("#####").
const BODY = [
  "........bdef.....",
  "........b..e.....",
  ".cfdtuvuuuuuuuvve",
  "bGEctttuuuuuuvuvd",
  "bGFbssssssssssssd",
  "bgEbttvtttttttvtu",
  "bGEbtts#####ssttu",
  "bgEbtrtRttrtttutu",
  ".cdbkrktrRrtktutu",
  "...bcccccccccccde",
];
const EYE: Record<PxEye, string> = { off: "sssss", on: "GEEEF", ok: "KKKLL", jam: "JJjjj", wide: "EFFFF" };
const EYE_COL = 7, EYE_ROW = 6;
const MID = 10; // grid column of x = 0
const LID = 4; // rows 0-3 lift off when he peeks
// walk: each pair lifts its feet for three of six frames (1, 2, 1 art px), the body dips on the hand-over
const LIFT_A = [2, 1, 0, 0, 0, 1], LIFT_B = [0, 0, 1, 2, 1, 0], BOB = [0, 0, 1, 0, 0, 1];

function grid(): PxGrid { return { cells: new Map(), minX: 0, maxX: 0, minY: 0, maxY: 0 }; }
function put(g: PxGrid, x: number, y: number, ch: string) { if (ch !== ".") g.cells.set(`${x},${y}`, ch); }

/** Box with its bottom trim on row `by` (feet row is -1). lift = rows the lid floats above the box (peek). */
function body(g: PxGrid, by: number, eye: PxEye, dx = 0, lid = 0) {
  BODY.forEach((row, r) => {
    const y = by - (BODY.length - 1 - r) - (r < LID && lid ? lid : 0);
    [...row].forEach((ch, c) => put(g, c - MID + dx, y, ch === "#" ? EYE[eye][c - EYE_COL] : ch));
  });
  // peek: the gap under the lifted lid is dark, with the eye looking out of it
  for (let l = 1; l <= lid; l++) for (let c = 3; c <= 16; c++)
    put(g, c - MID + dx, by - (BODY.length - LID) - l + 1, l === 1 && (c === 8 || c === 12) ? "E" : "O");
}

/**
 * A jointed brass leg: out from the hip to a knee, straight down to a chunky 3 px foot on row footY.
 * side = which way the knee points, reach = how far out, back = the far pair, a shade darker.
 */
function leg(g: PxGrid, hx: number, hipY: number, side: -1 | 1, reach: number, footY: number, fwd: number, back: boolean) {
  const [upper, knee, lower] = back ? ["c", "d", "b"] : ["d", side > 0 ? "e" : "d", "c"];
  let x = hx;
  for (let y = hipY; y < footY; y++) {
    const r = y - hipY;
    x = hx + side * Math.min(r, reach) + (r >= reach ? fwd : 0);
    put(g, x, y, r === 0 ? "k" : r === reach ? knee : r < reach ? upper : lower);
    if (!back && r > 0) put(g, x - side, y, r === reach ? "c" : "b"); // the shadow side of a 2 px thick leg
  }
  put(g, x - 1, footY, "k"); put(g, x, footY, back ? "k" : "b"); put(g, x + 1, footY, "k");
}

/** Four legs under a box whose bottom trim is on row by: the far pair first, then the near pair over them. */
function legs(g: PxGrid, by: number, liftA = 0, liftB = 0, fwd = 0) {
  const n = -1 - (by + 1); // leg rows above the feet
  const reach = Math.max(0, Math.min(3, n - 2));
  // far pair (inner columns), near pair (outer columns); A = back-left + front-right, B = the other two
  leg(g, 7 - MID, by + 1, -1, Math.min(1, reach), -1 - liftB, liftB + fwd, true);
  leg(g, 12 - MID, by + 1, 1, Math.min(1, reach), -1 - liftA, liftA + fwd, true);
  leg(g, 4 - MID, by + 1, -1, reach, -1 - liftA, liftA + fwd, false);
  leg(g, 15 - MID, by + 1, 1, reach, -1 - liftB, liftB + fwd, false);
}

/** Arm parts attach at the box's right side, eye height. */
const ARMS: Record<string, [number, number, string][]> = {
  out: [[0, 0, "k"], [1, 0, "d"], [2, 0, "d"], [3, 0, "e"], [4, -1, "c"], [4, 1, "c"], [4, 0, "b"]],
  lever0: [[0, 0, "k"], [1, 1, "d"], [2, 2, "d"], [3, 3, "e"], [3, 4, "c"], [4, 4, "c"]],
  lever1: [[0, 0, "k"], [1, 1, "d"], [2, 2, "d"], [3, 3, "d"], [3, 4, "e"], [3, 5, "c"], [4, 5, "c"]],
  weld: [[0, 0, "k"], [1, 1, "d"], [2, 2, "d"], [3, 3, "R"], [4, 4, "r"]],
  poke0: [[0, 0, "k"], [1, 0, "d"], [2, 0, "d"], [3, 0, "d"], [4, 0, "e"], [5, 0, "c"]],
  poke1: [[0, 0, "k"], [1, 0, "d"], [2, 0, "d"], [3, 0, "d"], [4, 0, "d"], [5, 0, "e"], [6, 0, "c"], [6, -1, "c"], [6, 1, "c"]],
};
function arm(g: PxGrid, by: number, name: keyof typeof ARMS, dx = 0) {
  for (const [ax, ay, ch] of ARMS[name]) put(g, 17 - MID + ax + dx, by - (BODY.length - 1 - EYE_ROW) + ay, ch);
}

function finish(g: PxGrid): PxGrid {
  // 1 art px soot outline around everything, then the bounds
  const out: [number, number][] = [];
  for (const key of g.cells.keys()) {
    const [x, y] = key.split(",").map(Number);
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) if (!g.cells.has(`${nx},${ny}`)) out.push([nx, ny]);
  }
  for (const [x, y] of out) g.cells.set(`${x},${y}`, "O");
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const key of g.cells.keys()) {
    const [x, y] = key.split(",").map(Number);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return Object.assign(g, { minX, maxX, minY, maxY });
}

/** Little extras drawn after the outline (sparks, marks, dust) so they float free. */
function extra(g: PxGrid, pts: [number, number, string][]) { for (const [x, y, ch] of pts) g.cells.set(`${x},${y}`, ch); }

function build(name: PxFrame): PxGrid {
  const g = grid();
  const STAND = -7; // bottom trim row when standing: 5 rows of legs + feet on -1
  const walk = /^(walk|carry)(\d)$/.exec(name);
  if (walk) {
    const i = Number(walk[2]), by = STAND + BOB[i];
    body(g, by, "on");
    legs(g, by, LIFT_A[i], LIFT_B[i]);
    if (walk[1] === "carry") beam(g, by);
    return finish(g);
  }
  switch (name) {
    case "box0": body(g, -1, "off"); break;
    case "box1": body(g, -1, "on"); break;
    case "peek": body(g, -1, "off", 0, 2); break;
    case "unfold2": body(g, -3, "on"); legs(g, -3); break;
    case "unfold3": body(g, -5, "on"); legs(g, -5); break;
    case "stand": case "idle0": body(g, STAND, "on"); legs(g, STAND); break;
    case "idle1": body(g, STAND, "off"); legs(g, STAND); break; // a blink
    case "armout": body(g, STAND, "on"); legs(g, STAND); arm(g, STAND, "out"); break;
    case "lever0": body(g, STAND, "on"); legs(g, STAND); arm(g, STAND, "lever0"); break;
    case "lever1": body(g, STAND + 1, "on"); legs(g, STAND + 1); arm(g, STAND + 1, "lever1"); break;
    case "happy": body(g, STAND, "ok"); legs(g, STAND, 0, 0); break;
    case "alarm": {
      body(g, STAND, "jam"); legs(g, STAND);
      // a red beacon on the handle
      put(g, 9 - MID, STAND - 10, "J"); put(g, 10 - MID, STAND - 10, "j"); put(g, 9 - MID, STAND - 11, "j"); put(g, 10 - MID, STAND - 11, "f");
      break;
    }
    case "weld0": case "weld1": body(g, STAND, "on"); legs(g, STAND); arm(g, STAND, "weld"); break;
    case "inspect0": case "inspect1": body(g, STAND + 1, "wide"); legs(g, STAND + 1); arm(g, STAND + 1, "out"); break;
    case "poke0": body(g, STAND, "on"); legs(g, STAND); arm(g, STAND, "poke0"); break;
    case "poke1": body(g, STAND, "on"); legs(g, STAND); arm(g, STAND, "poke1"); break;
    case "skid": body(g, STAND + 1, "on", -1); legs(g, STAND + 1, 0, 0, 2); break;
  }
  finish(g);
  const tip = 17 - MID + 4, ty = STAND - (BODY.length - 1 - EYE_ROW) + 5; // the torch tip
  if (name === "weld0") extra(g, [[tip, ty, "S"], [tip + 1, ty, "e"], [tip + 2, ty - 1, "f"], [tip - 1, ty + 1, "e"]]);
  if (name === "weld1") extra(g, [[tip, ty, "f"], [tip + 1, ty - 1, "S"], [tip + 2, ty + 1, "e"], [tip + 1, ty + 1, "e"]]);
  if (name === "happy") extra(g, [[5, STAND - 11, "L"], [6, STAND - 12, "L"], [7, STAND - 10, "L"]]);
  if (name === "inspect1") g.cells.set(`${EYE_COL + 1 - MID},${STAND + 1 - (BODY.length - 1 - EYE_ROW)}`, "F");
  if (name === "skid") extra(g, [[-13, -1, "h"], [-14, -2, "h"], [-15, -1, "h"]]);
  return g;
}

/** A steel I-beam slung under the box across the legs, brass clamps where it hangs. */
function beam(g: PxGrid, by: number) {
  for (let x = -12; x <= 12; x++) {
    const end = x === -12 || x === 12;
    g.cells.set(`${x},${by + 2}`, end ? "u" : "v");
    g.cells.set(`${x},${by + 3}`, end ? "s" : "t");
    g.cells.set(`${x},${by + 4}`, end ? "s" : "u");
  }
  for (const x of [-4, 4]) { g.cells.set(`${x},${by + 1}`, "d"); g.cells.set(`${x},${by + 2}`, "c"); }
}

const cache = new Map<PxFrame, PxGrid>();
export function pxFrame(name: PxFrame): PxGrid {
  let g = cache.get(name);
  if (!g) cache.set(name, (g = build(name)));
  return g;
}

/**
 * Draw a frame with its feet at (x, y). unit = size of one art px in ctx units (ART_PX in the world buffer, a whole
 * number of screen px in the corner). flip mirrors around x.
 */
export function drawPx(ctx: CanvasRenderingContext2D, name: PxFrame, x: number, y: number, unit: number, flip = false) {
  const g = pxFrame(name);
  for (const [key, ch] of g.cells) {
    const [gx, gy] = key.split(",").map(Number);
    ctx.fillStyle = INK[ch];
    ctx.fillRect(x + (flip ? -gx - 1 : gx) * unit, y + gy * unit, unit, unit);
  }
}
export const PX_INK = INK;
export const PX_FRAMES: PxFrame[] = [
  "box0", "box1", "peek", "unfold2", "unfold3", "stand", "armout",
  "walk0", "walk1", "walk2", "walk3", "walk4", "walk5",
  "lever0", "lever1", "happy", "alarm", "weld0", "weld1",
  "carry0", "carry1", "carry2", "carry3", "carry4", "carry5",
  "inspect0", "inspect1", "poke0", "poke1", "skid", "idle0", "idle1",
];
