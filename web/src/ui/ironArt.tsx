// Black Iron pixel art for the feature sheets (docs/art/IRON-STYLE.md §7): cast-iron medallions, a pressure
// gauge, a brass map pin and the runner's power plug. Every piece is drawn on an integer grid as SVG rects with
// crispEdges, so it stays pixel-sharp at any size. All of it is decoration: aria-hidden, the words carry meaning.

import type { ReactElement } from "react";
import { Icon, type IconName } from "./icons";

type Px = [x: number, y: number, fill: string];

/** Merge horizontal runs of one color into one rect: a 16×16 medallion is ~40 rects, not 256. */
function rects(px: Px[], key: string) {
  const rows = new Map<number, Px[]>();
  for (const p of px) rows.set(p[1], [...(rows.get(p[1]) ?? []), p]);
  const out: ReactElement[] = [];
  for (const [y, row] of rows) {
    row.sort((a, b) => a[0] - b[0]);
    let start = row[0];
    let w = 1;
    for (let i = 1; i <= row.length; i++) {
      const p = row[i];
      if (p && p[0] === start[0] + w && p[2] === start[2]) {
        w++;
        continue;
      }
      out.push(<rect key={`${key}${start[0]}-${y}`} x={start[0]} y={y} width={w} height={1} fill={start[2]} />);
      if (p) {
        start = p;
        w = 1;
      }
    }
  }
  return out;
}

// ---------- achievement medallions ----------

export type Tier = "bronze" | "silver" | "gold";
const METAL: Record<Tier | "locked", { hi: string; rim: string; lo: string; mark: string; face: string }> = {
  bronze: { hi: "#f0a868", rim: "#c06a3a", lo: "#6a2e14", mark: "#ffc890", face: "#2a1a12" },
  silver: { hi: "#f2f4f8", rim: "#a8b0bc", lo: "#4e5662", mark: "#f2f6fa", face: "#1e2026" },
  gold: { hi: "#ffe08a", rim: "#d0a24e", lo: "#6e4a12", mark: "#ffd66a", face: "#2a1e0c" },
  locked: { hi: "#6a5444", rim: "#4a3a2e", lo: "#1a1410", mark: "#8a7a68", face: "#17110d" },
};

const medalCache = new Map<string, Px[]>();
const MS = 20; // the medallion's pixel grid
/** A 20×20 cast-iron disc: black ink outline, a lit/shaded rim in the tier's metal, four brass rivets, a sooty face. */
function medalPixels(m: (typeof METAL)[Tier]): Px[] {
  const hit = medalCache.get(m.rim);
  if (hit) return hit;
  const px: Px[] = [];
  const c0 = (MS - 1) / 2;
  for (let y = 0; y < MS; y++)
    for (let x = 0; x < MS; x++) {
      const dx = x - c0;
      const dy = y - c0;
      const d = Math.max(Math.abs(dx), Math.abs(dy), (Math.abs(dx) + Math.abs(dy)) / 1.36);
      if (d > 9.9) continue;
      const lit = dx + dy < -1;
      const shade = dx + dy > 1;
      let c = m.face;
      if (d > 9) c = "#000";
      else if (d > 7.4) c = lit ? m.hi : shade ? m.lo : m.rim;
      else if (d > 6.6) c = "#0a0604"; // the groove between rim and face
      else if (shade && d > 5.6) c = "#0e0a08"; // face shading, lower right
      else if (lit && d > 5.6) c = m.lo; // a thin lip of metal catching the light
      px.push([x, y, c]);
    }
  // rivets on the rim at the four diagonals
  for (const [x, y] of [[4, 4], [15, 4], [4, 15], [15, 15]] as const) px.push([x, y, "#ffd27a"]);
  medalCache.set(m.rim, px);
  return px;
}

/** A cast-iron badge medallion with the achievement's mark embossed in the middle; padlocked until earned. */
export function Medallion({ tier, icon, got, size = 40 }: { tier: Tier; icon: IconName; got: boolean; size?: number }) {
  const m = METAL[got ? tier : "locked"];
  const mark = got ? icon : "lock";
  return (
    <svg className={`iron-medal ${got ? tier : "locked"}`} width={size} height={size} viewBox={`0 0 ${MS} ${MS}`} shapeRendering="crispEdges" aria-hidden="true">
      {rects(medalPixels(m), "m")}
      <g transform="translate(7 7)">
        <Icon name={mark} size={8} color="#000" />
      </g>
      <g transform="translate(6 6)">
        <Icon name={mark} size={8} color={m.mark} />
      </g>
    </svg>
  );
}

// ---------- the pressure gauge (level + XP) ----------

const GW = 44;
const GH = 26;
/** A brass-bezel pressure gauge. `into` (0..1) is how far the needle has swung toward the next level. */
export function PressureGauge({ into, size = 132 }: { into: number; size?: number }) {
  const v = Math.max(0, Math.min(1, into));
  const cx = 21.5;
  const cy = 22.5;
  const px: Px[] = [];
  const needle = Math.PI * (1 - v); // 180° (empty, left) → 0° (full, right)
  const nx = Math.cos(needle);
  const ny = -Math.sin(needle);
  for (let y = 0; y < GH; y++)
    for (let x = 0; x < GW; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.hypot(dx, dy);
      if (dy > 1.5) {
        // the base plate under the dial
        if (y >= GH - 3 && Math.abs(dx) < 19) px.push([x, y, y === GH - 1 ? "#000" : y === GH - 3 ? "#8a6a4c" : "#2a211b"]);
        continue;
      }
      if (r > 21.4) continue;
      const a = Math.atan2(-dy, dx); // 0 right, π left
      let c: string | null = null;
      if (r > 20.4) c = "#000";
      else if (r > 18.4) c = a > Math.PI * 0.55 ? "#ffd27a" : a > Math.PI * 0.25 ? "#d0a24e" : "#7a5418"; // brass bezel, lit top left
      else if (r > 17.4) c = "#0a0604";
      else {
        c = "#1e1814"; // the dial face
        // the pressure band: lit amber up to the needle, dark iron after
        if (r > 13.2 && r < 16.4) c = a >= needle - 0.02 ? (a > Math.PI * 0.85 ? "#ff7a2a" : "#ffb020") : "#3a2e26";
        // ticks every 22.5°, red zone at the top end
        const t = (a / Math.PI) * 8;
        if (r >= 16.4 && Math.abs(t - Math.round(t)) < 0.09 * (18 / r) * 4) c = Math.round(t) <= 1 ? "#ff4a32" : "#b8a48a";
        // needle: within half a pixel of the ray from the hub
        const along = dx * nx + dy * ny;
        const off = Math.abs(dx * ny - dy * nx);
        if (along > 0 && along < 15 && off < 0.62) c = "#f4ead8";
        if (r < 2.4) c = r < 1.2 ? "#ffd27a" : "#000";
      }
      if (c) px.push([x, y, c]);
    }
  return (
    <svg className="iron-gauge" width={size} height={(size * GH) / GW} viewBox={`0 0 ${GW} ${GH}`} shapeRendering="crispEdges" aria-hidden="true">
      {rects(px, "g")}
    </svg>
  );
}

// ---------- brass map pin (empire) ----------

const PIN = ["..oooo..", ".ohhbbo.", "ohhbbbbo", "obbbbbdo", "obbbbddo", ".obddo..", "..oso...", "...s...."];
const PIN_C: Record<string, string> = { o: "#000", h: "#ffe08a", b: "#d0a24e", d: "#7a5418", s: "#b8a48a" };
export function BrassPin({ size = 16, hot = false }: { size?: number; hot?: boolean }) {
  const px: Px[] = [];
  PIN.forEach((row, y) => [...row].forEach((ch, x) => ch !== "." && px.push([x, y, hot && ch === "b" ? "#ff4a32" : hot && ch === "h" ? "#ff9a80" : hot && ch === "d" ? "#8a1e10" : PIN_C[ch]])));
  return (
    <svg className="iron-pin" width={size} height={size} viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden="true">
      {rects(px, "p")}
    </svg>
  );
}

// ---------- the runner's power cable and wall socket ----------

export type PlugState = "online" | "offline" | "unpaired" | "unknown";
/**
 * A copper cable running into a riveted wall socket. Online: the plug is seated and an aether pulse runs down the
 * cable (CSS animates `.pulse`). Paired but offline: seated, no pulse, lamp idle. Not paired: the plug hangs loose.
 */
export function PowerPlug({ state }: { state: PlugState }) {
  const seated = state === "online" || state === "offline";
  const px: Px[] = [];
  const plugX = seated ? 40 : 30; // the plug head's left edge
  // cable: 2px copper with a dark underside, from the left edge to the plug
  for (let x = 0; x < plugX; x++) px.push([x, 9, "#c06a3a"], [x, 10, "#6a2e14"]);
  // plug head: iron body with a brass collar
  for (let y = 6; y < 14; y++)
    for (let x = plugX; x < plugX + 8; x++) {
      const edge = y === 6 || y === 13 || x === plugX || x === plugX + 7;
      px.push([x, y, edge ? "#000" : x < plugX + 2 ? "#d0a24e" : y === 7 ? "#5a4434" : "#2a211b"]);
    }
  // prongs
  if (!seated) for (const y of [8, 11]) for (let x = plugX + 8; x < plugX + 11; x++) px.push([x, y, "#d0a24e"]);
  // the wall socket: a riveted iron box with two holes and a status lamp
  for (let y = 2; y < 18; y++)
    for (let x = 48; x < 62; x++) {
      const edge = y === 2 || y === 17 || x === 48 || x === 61;
      px.push([x, y, edge ? "#000" : y === 3 ? "#8a6a4c" : y === 16 ? "#140e0a" : "#3a2e26"]);
    }
  for (const [x, y] of [[50, 4], [59, 4], [50, 15], [59, 15]] as const) px.push([x, y, "#d0a24e"]);
  for (const y of [8, 11]) for (let x = 49; x < 53; x++) px.push([x, y, seated ? "#d0a24e" : "#000"]);
  const lamp = state === "online" ? "#7af0d8" : state === "offline" ? "#8fa2c8" : "#5a4434";
  for (let y = 7; y < 13; y++) for (let x = 55; x < 59; x++) px.push([x, y, y === 7 || y === 12 || x === 55 || x === 58 ? "#000" : lamp]);
  return (
    <svg className={`iron-plug ${state}`} width={128} height={40} viewBox="0 0 64 20" shapeRendering="crispEdges" aria-hidden="true">
      {rects(px, "c")}
      {state === "online" && (
        <g className="pulse">
          <rect x={0} y={9} width={3} height={2} fill="#7af0d8" />
          <rect x={-1} y={9} width={1} height={2} fill="#2a8a78" />
        </g>
      )}
    </svg>
  );
}
