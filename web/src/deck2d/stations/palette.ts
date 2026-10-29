// Black Iron 48 (art/palette/black-iron-48.json, docs/PIXEL-PLAN.md): every station pixel is one of these.
// Ramps go dark to light. One meaning per color: brass-4 glow = waiting on you, jam = actually stuck,
// ok = done/automatic, energy = powered and running (and Shippy). Brass trim is jewelry, never a signal.
// When the hub's contract exports the palette, import it from there instead and drop this copy.

export const HEX = {
  soot: "#0a0604",
  "iron-0": "#181211", "iron-1": "#291b17", "iron-2": "#432f29", "iron-3": "#6b5360", "iron-4": "#8f6f62",
  "steel-0": "#121e2b", "steel-1": "#273349", "steel-2": "#3d4d6a", "steel-3": "#7d8ea3",
  "copper-0": "#713e30", "copper-1": "#a04430", "copper-2": "#cd4f27", "copper-3": "#e28059", "copper-4": "#f2b48c",
  "brass-0": "#422616", "brass-1": "#6d370c", "brass-2": "#a36915", "brass-3": "#c98115", "brass-4": "#fdc727", "brass-5": "#fdec9a",
  "plate-0": "#351705", "plate-1": "#5a3521", "plate-2": "#834621", "plate-3": "#ae6237", "plate-4": "#b48254",
  "sun-0": "#652203", "sun-1": "#bc3c0b", "sun-2": "#e44e1b", "sun-3": "#f6601f", "sun-4": "#fc8717", "sun-5": "#fdad1e", "sun-6": "#f9c47a",
  "haze-0": "#623a3a", "haze-1": "#82525a", "haze-2": "#c0988e", "haze-3": "#eed3c5",
  white: "#fdfaec",
  "energy-0": "#28545a", "energy-1": "#0ea0ac", "energy-2": "#41f3f7", "energy-3": "#bcf6f6",
  "ok-0": "#1c450f", "ok-1": "#1ab004", "ok-2": "#81f381",
  "jam-0": "#6a0d0d", "jam-1": "#c8231b", "jam-2": "#ff5b4a",
} as const;

export type Color = keyof typeof HEX;
export const NAMES = Object.keys(HEX) as Color[];
/** Palette index of a color name; 255 means "no pixel". */
export const IDX = Object.fromEntries(NAMES.map((n, i) => [n, i])) as Record<Color, number>;
export const RGB: [number, number, number][] = NAMES.map((n) => {
  const h = HEX[n];
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
});
