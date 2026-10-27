// The floating city's rock underside (ART-PASS.md "Keel profile"): one shared shape so the keel (modules/keel.js),
// the aether engine (modules/engine.js), the falls (modules/falls.js) and the camera (frame.ts) agree on where the
// rock is. Root coords (+x right, +y up, +z toward the camera). Pure numbers, no three.js.
//
// The rock hangs under the quarry floor (tiers.mine: y -16, x -19.5..19.5, front z 11.5) and tapers to a blunt tip
// under the middle of the island. Each band steps back (-z) as it narrows, so the 30deg camera sees its front faces.

/** the quarry floor's underside, where the rock starts */
export const TOP = -16.3;
/** the tip's bottom */
export const TIP_Y = -36;
/** the rock's center line */
export const CX = 0.4;
/** front face z at the top and at the tip */
export const FRONT_TOP = 11.4;
export const FRONT_TIP = 4.6;
/** half-widths at the top and the blunt tip */
export const R_TOP = 19.5;
export const R_TIP = 1.6;

const k = (y) => Math.max(0, Math.min(1, (y - TIP_Y) / (TOP - TIP_Y))); // 1 at the top, 0 at the tip

/** half-width of the rock at height y (0 above TOP or below the tip) */
export function radius(y) {
  if (y > TOP || y < TIP_Y) return 0;
  return R_TIP + (R_TOP - R_TIP) * Math.pow(k(y), 0.85);
}

/** the front face's z at height y (the rock steps back as it narrows) */
export function front(y) {
  return FRONT_TIP + (FRONT_TOP - FRONT_TIP) * Math.pow(k(y), 1.3);
}

/** is root point (x, y) inside the rock's silhouette? */
export const inside = (x, y) => Math.abs(x - CX) <= radius(y);

/** the blunt tip: bottom center of the rock */
export const TIP = [CX, TIP_Y, FRONT_TIP - 1.6];

/** where the aether engine hangs: its cage's top center, just under the tip */
export const SOCKET = [CX, TIP_Y - 1.2, FRONT_TIP - 1.6];

/** the band tops (y) the strata step at, top to bottom; keel.js cuts its faces on these */
export const BANDS = [TOP, -18.4, -21.2, -24.4, -28, -32, TIP_Y];

/**
 * Cracks on the visible front faces where the engine's teal veins glow (engine.js), and keel.js leaves a dark seam:
 * at = the crack's lower end on the face, dir = unit direction it runs up the face (x, y), len = its length.
 */
export const CRACKS = [
  [-1.2, -34.2, 0.35, 1, 5.5],
  [2.0, -33.6, -0.3, 1, 4.8],
  [-4.6, -29.4, -0.55, 1, 4.2],
  [5.4, -28.6, 0.5, 1, 4.6],
  [-9.2, -23.8, -0.4, 1, 3.6],
  [10.6, -22.6, 0.45, 1, 3.2],
  [-0.4, -26.6, 0.1, 1, 5.0],
].map(([x, y, dx, dy, len]) => {
  const n = Math.hypot(dx, dy);
  return { at: [x, y, front(y) + 0.05], dir: [dx / n, dy / n], len };
});

/**
 * Lips where falls pour off the island (falls.js): at = the pipe mouth / rock lip, side = which way it faces
 * (-1 left, 1 right, 0 front), kind = 'water' | 'slag'. The fall drops straight down from at.
 */
export const LIPS = [
  { at: [-17.2, -17.6, front(-17.6) - 0.4], side: -1, kind: "water" },
  { at: [15.4, -19.2, front(-19.2) - 0.4], side: 1, kind: "water" },
  { at: [6.8, -25.2, front(-25.2) + 0.1], side: 0, kind: "slag" },
];

/** the smog sea's top (smog.js); everything below it melts into haze */
export const SMOG_TOP = -46;

/** the profile as [y, halfWidth, frontZ] samples, top to tip (n + 1 of them) */
export function profile(n = 24) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const y = TOP + ((TIP_Y - TOP) * i) / n;
    out.push([y, radius(y), front(y)]);
  }
  return out;
}

export const KEEL = { TOP, TIP_Y, CX, TIP, SOCKET, BANDS, CRACKS, LIPS, SMOG_TOP, radius, front, inside, profile };
export default KEEL;
