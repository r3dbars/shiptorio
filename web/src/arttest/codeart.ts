// @ts-nocheck -- drawing code, ported as-is from the pure-code art test page
// 100% code: every pixel below is drawn by these functions. No image files.
// One pixel grid (320x200), one palette, Pixi only scales it up crisp and adds soft light.
const W = 320, H = 200;
const hex = (h) => { const n = parseInt(h.slice(1), 16); return (255 << 24) | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255); };
const C = Object.fromEntries(Object.entries({
  o: "#120a0e", oo: "#08050a",
  ironD: "#1b1b22", iron: "#2a2b34", ironL: "#3c3e4a", ironH: "#565a68",
  rustD: "#4a2212", rust: "#7c3a16", rustL: "#a8561e",
  brD: "#5c3a0e", br: "#966418", brL: "#cc922a", brH: "#f4d068",
  cuD: "#5a220e", cu: "#9c441c", cuL: "#d06c2c", cuH: "#f4a462",
  stD: "#4c4e56", st: "#7e8089", stL: "#a9abb3", stH: "#dcdde0",
  nvD: "#141a2c", nv: "#222e4a", nvL: "#32446a", nvH: "#4a6290",
  cyD: "#0c5268", cy: "#26bce0", cyL: "#86eeff", cyH: "#e8feff",
  wD: "#9c3a0a", w: "#ff861a", wL: "#ffbe48", wH: "#fff2b8",
  rD: "#7a1210", r: "#d42a1c", rL: "#ff5c3a", rH: "#ffc0a8",
  gD: "#145c22", g: "#22a83c", gL: "#56ea5e", gH: "#d0ffb8",
  wdD: "#4a240c", wd: "#7a4018", wdL: "#a4602a", wdH: "#c88440",
  plD: "#4c2814", pl: "#6e3c20", plM: "#84502c", plL: "#a06838", plH: "#bc844a",
  rkD: "#141018", rk: "#251c26", rkL: "#382a34", rkH: "#4c3842",
  smH: "#e6dcd6", sm: "#aaa09e", smD: "#706668", dsH: "#6a6266", ds: "#433c42", dsD: "#26212a",
  clH: "#ffc27a", clL: "#f08a52", cl: "#b8544a", clD: "#7a3448", clS: "#46223e",
  city: "#2a1634", cityD: "#1e1028",
}).map(([k, v]) => [k, hex(v)]));
const SKY = ["#120c24", "#1a1030", "#24143a", "#341a44", "#4a2046", "#682a46", "#8c3640", "#b04a34", "#d0662c", "#ea8a34", "#f8b04c"].map(hex);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const dith = (x, y, a) => a * 16 > BAYER[((y & 3) << 2) | (x & 3)] + 0.5;
const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const fl = Math.floor;

class Raster {
  constructor(w, h) { this.w = w; this.h = h; this.c = document.createElement("canvas"); this.c.width = w; this.c.height = h; this.x = this.c.getContext("2d"); this.id = this.x.createImageData(w, h); this.b = new Uint32Array(this.id.data.buffer); }
  clear() { this.b.fill(0); }
  p(x, y, c) { x = fl(x); y = fl(y); if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; this.b[y * this.w + x] = c; }
  r(x, y, w, h, c) { x = fl(x); y = fl(y); w = fl(w); h = fl(h); const x1 = Math.min(this.w, x + w), y1 = Math.min(this.h, y + h); for (let j = Math.max(0, y); j < y1; j++) { const o = j * this.w; for (let i = Math.max(0, x); i < x1; i++) this.b[o + i] = c; } }
  // fill a disc, colour picked per pixel by fn(dx, dy, d) (return 0 to skip)
  disc(cx, cy, rad, fn) { for (let y = fl(cy - rad - 1); y <= cy + rad + 1; y++) for (let x = fl(cx - rad - 1); x <= cx + rad + 1; x++) { const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy); if (d <= rad) { const c = fn(dx, dy, d, x, y); if (c) this.p(x, y, c); } } }
  line(x0, y0, x1, y1, c, th = 1) { const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))); for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n; this.r(x - (th - 1) / 2, y - (th - 1) / 2, th, th, c); } }
  flush() { this.x.putImageData(this.id, 0, 0); }
}

// --- shading kit -------------------------------------------------------------------------------------------
const RAMP = {
  iron: [C.o, C.ironD, C.iron, C.ironL, C.ironH], brass: [C.o, C.brD, C.br, C.brL, C.brH], copper: [C.o, C.cuD, C.cu, C.cuL, C.cuH],
  navy: [C.o, C.nvD, C.nv, C.nvL, C.nvH], steel: [C.o, C.stD, C.st, C.stL, C.stH], wood: [C.o, C.wdD, C.wd, C.wdL, C.wdH],
};
function box(R, x, y, w, h, [o, d, m, l, hi]) {
  R.r(x, y, w, h, o); R.r(x + 1, y + 1, w - 2, h - 2, m);
  R.r(x + 1, y + 1, w - 2, 1, l); R.r(x + 1, y + 1, 1, h - 2, l);
  R.r(x + 1, y + h - 2, w - 2, 1, d); R.r(x + w - 2, y + 2, 1, h - 3, d); R.p(x + 1, y + 1, hi);
}
function rivet(R, x, y) { R.p(x, y, C.brH); R.p(x + 1, y, C.brL); R.p(x, y + 1, C.brL); R.p(x + 1, y + 1, C.brD); }
function rust(R, x, y, w, h, dens, seed) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const n = hash(fl((x + i) / 3), fl((y + j) / 3), seed) * 0.6 + hash(x + i, y + j, seed + 1) * 0.4; // blotchy, not salt-and-pepper
    if (n < dens) R.p(x + i, y + j, n < dens * 0.4 ? C.rustL : n < dens * 0.75 ? C.rust : C.rustD);
  }
}
const cylCol = (ramp, t) => { const [o, d, m, l, hi] = ramp; return t < 0.08 || t > 0.92 ? o : t < 0.22 ? m : t < 0.34 ? l : t < 0.44 ? hi : t < 0.62 ? l : t < 0.8 ? m : d; };
function cylV(R, x, y, w, h, ramp) { for (let i = 0; i < w; i++) R.r(x + i, y, 1, h, cylCol(ramp, (i + 0.5) / w)); R.r(x, y + h - 1, w, 1, C.o); }
function cylH(R, x, y, w, h, ramp) { for (let j = 0; j < h; j++) R.r(x, y + j, w, 1, cylCol(ramp, (j + 0.5) / h)); }
// lit sphere-ish shading: light from the top left
const lit = (dx, dy, d, rad, [o, dk, m, l, hi]) => { if (d > rad - 1) return o; const k = (-dx - dy) / (rad * 1.41); return k > 0.55 ? hi : k > 0.2 ? l : k > -0.35 ? m : dk; };

// --- sky, city, clouds ---------------------------------------------------------------------------------------
function drawSky(R) {
  for (let y = 0; y < H; y++) {
    const f = Math.min(SKY.length - 1.001, Math.max(0, (y - 4) / 168 * (SKY.length - 1)));
    const i = fl(f), a = f - i;
    for (let x = 0; x < W; x++) R.p(x, y, dith(x, y, a) ? SKY[i + 1] : SKY[i]);
  }
  for (let i = 0; i < 70; i++) { const x = fl(hash(i, 1) * W), y = fl(hash(i, 2) * 70); if (hash(i, 3) > 0.5) R.p(x, y, hex("#6a5a8a")); else R.p(x, y, hex("#9a8ab8")); }
  // a far-off sun disc sinking behind everything
  R.disc(250, 104, 15, (dx, dy, d, x, y) => d > 13 ? (dith(x, y, 0.5) ? hex("#ffd27a") : 0) : hex(d < 9 ? "#fff0c0" : "#ffd88a"));
}
const CITY = [];
for (let x = 0, i = 0; x < W; i++) { const w = 8 + fl(hash(i, 9) * 14), h = 10 + fl(hash(i, 8) * 26); CITY.push({ x, w, h, stack: hash(i, 7) > 0.6 }); x += w + fl(hash(i, 6) * 3); }
function drawCity(R) {
  const base = 112;
  for (const b of CITY) {
    R.r(b.x, base - b.h, b.w, b.h, C.city);
    R.r(b.x, base - b.h, b.w, 1, hex("#3e2248"));
    if (b.stack) { R.r(b.x + 2, base - b.h - 8, 3, 8, C.cityD); }
  }
}
function drawCityLights(R, t) {
  const base = 112;
  CITY.forEach((b, i) => { for (let wy = base - b.h + 3; wy < base - 2; wy += 4) for (let wx = b.x + 2; wx < b.x + b.w - 2; wx += 3) {
    const h = hash(wx, wy, 5); if (h > 0.32) continue;
    const on = hash(wx, wy, fl(t * 0.5 + h * 9)) > 0.15; if (on) R.p(wx, wy, h < 0.08 ? C.wL : C.w);
  } if (b.stack) { const s = (t * 6 + i * 3) % 20; R.disc(b.x + 3.5, base - b.h - 9 - s, 1 + s * 0.15, (dx, dy, d, x, y) => dith(x, y, 0.6 - s / 34) ? hex("#5a3a5a") : 0); } });
}
const PUFFS = [];
for (let c = 0; c < 9; c++) { const cx = c * 46 + hash(c, 1) * 20, cy = 34 + hash(c, 2) * 46, n = 4 + fl(hash(c, 3) * 4); for (let k = 0; k < n; k++) PUFFS.push({ x: cx + (k - n / 2) * 8 + hash(c, k + 9) * 6, y: cy - Math.sin(k / (n - 1) * Math.PI) * 7 + hash(c, k + 19) * 4, r: 6 + hash(c, k + 29) * 7, sp: 2 + c % 3 }); }
function drawClouds(R, t) {
  for (const p of PUFFS) {
    const span = W + 60; let x = ((p.x - t * p.sp) % span + span) % span - 30;
    R.disc(x, p.y, p.r, (dx, dy, d, px, py) => {
      const k = (-dx * 0.5 - dy) / p.r; // lit from above by the sunset
      if (d > p.r - 1.2) return dith(px, py, 0.5) ? C.clD : 0;
      return k > 0.55 ? C.clH : k > 0.18 ? C.clL : k > -0.3 ? C.cl : k > -0.6 ? C.clD : C.clS;
    });
  }
}

// --- the deck ----------------------------------------------------------------------------------------------
const DECK = { top: 112, bot: 156, rim: 168 };
const edgeL = (y) => 26 - (y - DECK.top) * 0.33, edgeR = (y) => 294 + (y - DECK.top) * 0.33;
const ROCKS = [];
for (let i = 0; i < 46; i++) ROCKS.push({ x: 20 + hash(i, 40) * 280, y: 172 + hash(i, 41) * 22 + Math.abs(i % 23 - 11) * 0.4, r: 5 + hash(i, 42) * 8 });
ROCKS.sort((a, b) => a.y - b.y);
const CRACKS = [[60, 170], [210, 172], [168, 171]].map(([x, y], k) => { const pts = [[x, y]]; for (let i = 0; i < 6; i++) { const [px, py] = pts[pts.length - 1]; pts.push([px + (hash(k, i, 3) - 0.5) * 8, py + 3 + hash(k, i, 4) * 3]); } return pts; });
const BELT = { x: 16, y: 120, w: 288, h: 15 };
const LAMPS = [{ x: 30, y: 82 }, { x: 290, y: 82 }, { x: 12, y: 146 }, { x: 306, y: 146 }];
function drawDeck(R) {
  // back railing: copper rail on brass posts
  for (let x = 30; x <= 290; x += 26) { box(R, x - 2, 96, 5, 17, RAMP.brass); R.r(x - 2, 95, 5, 2, C.brH); R.r(x - 3, 94, 7, 1, C.o); }
  cylH(R, 28, 98, 264, 3, RAMP.copper); cylH(R, 28, 105, 264, 2, RAMP.copper);
  for (let x = 30; x <= 290; x += 26) { box(R, x - 2, 96, 5, 17, RAMP.brass); rivet(R, x - 1, 99); rivet(R, x - 1, 106); }
  // lamp posts (glass is drawn live)
  for (const L of LAMPS.slice(0, 2)) { box(R, L.x - 2, L.y + 8, 5, 24, RAMP.brass); box(R, L.x - 4, L.y - 2, 9, 3, RAMP.brass); box(R, L.x - 4, L.y + 7, 9, 3, RAMP.brass); }
  // the plate floor
  for (let y = DECK.top; y < DECK.bot; y++) for (let x = fl(edgeL(y)); x < edgeR(y); x++) {
    const n = hash(fl(x / 4), fl(y / 3), 11) * 0.7 + hash(x, y, 12) * 0.3;
    let c = n < 0.18 ? C.pl : n < 0.7 ? C.plM : n < 0.92 ? C.plL : C.plH;
    if (hash(fl(x / 7), fl(y / 5), 13) < 0.12 && hash(x, y, 14) < 0.6) c = C.rust;
    const gx = (x - 14) % 22, gy = (y - DECK.top) % 11;
    if (gx === 0 || gy === 0) c = C.plD; else if (gx === 1 || gy === 1) c = C.plL;
    if (y < DECK.top + 2) c = C.plH;
    R.p(x, y, c);
  }
  for (let y = DECK.top + 11; y < DECK.bot; y += 11) for (let x = 14 + 22; x < 300; x += 22) if (x > edgeL(y) + 2 && x < edgeR(y) - 2) { R.p(x, y, C.brL); R.p(x + 1, y + 1, C.o); }
  for (let y = DECK.top; y < DECK.bot; y++) { R.p(edgeL(y) - 1, y, C.o); R.p(edgeR(y), y, C.o); }
  // under the rim: rock, pipes, the orb
  for (const k of ROCKS) R.disc(k.x, k.y, k.r, (dx, dy, d, x, y) => {
    if (d > k.r - 1) return C.rkD; const s = (-dx - dy) / (k.r * 1.4);
    if (hash(x, y, 21) < 0.05) return C.rustD;
    return s > 0.45 ? C.rkH : s > 0.05 ? C.rkL : s > -0.45 ? C.rk : C.rkD;
  });
  for (const ax of [56, 106, 204, 254]) for (let a = 0; a <= Math.PI; a += 0.04) { const x = ax + Math.cos(a) * 14, y = DECK.rim - 1 + Math.sin(a) * 9; R.r(x, y, 2, 2, C.cu); R.p(x, y, C.cuL); }
  box(R, 130, 166, 6, 10, RAMP.copper); R.r(131, 176, 4, 4, C.cuD);
  // steam pipes on the right
  for (const px of [238, 262]) { cylV(R, px, 166, 8, 12, RAMP.copper); box(R, px - 1, 177, 10, 4, RAMP.copper); }
  // front rim beam
  box(R, 10, DECK.bot, 300, 12, RAMP.brass); rust(R, 12, DECK.bot + 3, 296, 7, 0.16, 31);
  R.r(11, DECK.bot + 1, 298, 1, C.brH);
  for (let x = 16; x < 306; x += 10) rivet(R, x, DECK.bot + 6);
  for (let x = 34; x < 300; x += 50) { box(R, x, DECK.bot - 2, 8, 16, RAMP.brass); rivet(R, x + 3, DECK.bot + 2); rivet(R, x + 3, DECK.bot + 9); }
  for (const L of LAMPS.slice(2)) { box(R, L.x - 3, L.y + 8, 7, 16, RAMP.brass); box(R, L.x - 4, L.y - 3, 9, 3, RAMP.brass); box(R, L.x - 4, L.y + 6, 9, 3, RAMP.brass); }
}
function drawBeltFrame(R) {
  // belt frame (chevrons are drawn live)
  const { x, y, w, h } = BELT;
  box(R, x, y, w, 4, RAMP.iron); box(R, x, y + h - 4, w, 4, RAMP.iron);
  R.r(x, y + 4, w, h - 8, C.oo);
  rust(R, x + 1, y + 1, w - 2, 2, 0.22, 41); rust(R, x + 1, y + h - 3, w - 2, 2, 0.22, 42);
  for (let bx = x; bx < x + w; bx += 48) { box(R, bx, y - 1, 7, 6, RAMP.brass); box(R, bx, y + h - 5, 7, 6, RAMP.brass); rivet(R, bx + 3, y + 1); rivet(R, bx + 3, y + h - 3); }
  box(R, x + w - 7, y - 1, 7, 6, RAMP.brass); box(R, x + w - 7, y + h - 5, 7, 6, RAMP.brass);
}
function drawBeltLive(R, F) {
  // belt chevrons slide along
  const { x, y, w, h } = BELT, off = F.belt % 24;
  for (let cx = x + 2 - 24 + off; cx < x + w; cx += 24) for (let j = 0; j < 7; j++) {
    const yy = y + 4 + j, dx = 3 - Math.abs(3 - j);
    for (let k = 0; k < 3; k++) { const px = fl(cx + dx + k); if (px > x && px < x + w - 1) R.p(px, yy, k === 2 ? C.brD : C.wL); }
  }
  for (let sx = x + 1 + (F.belt % 12); sx < x + w - 1; sx += 12) R.r(sx, y + 4, 1, h - 8, hex("#1a1418"));
}
function drawDeckLive(R, t, F) {
  // lamp glass flickers
  LAMPS.forEach((L, i) => { const fk = 0.75 + 0.25 * Math.sin(t * 11 + i * 2) * Math.sin(t * 3.7 + i); R.r(L.x - 3, L.y + 1, 7, 6, fk > 0.8 ? C.wL : C.w); R.r(L.x - 1, L.y + 2, 2, 3, C.wH); R.r(L.x, L.y + 1, 1, 6, C.brD); F.glow(L.x + 0.5, L.y + 4, 22, 0xffa040, 0.32 * fk); });
  // cyan cracks pulse under the deck
  CRACKS.forEach((pts, k) => { const a = 0.5 + 0.5 * Math.sin(t * 2.2 + k * 1.7); for (let i = 1; i < pts.length; i++) R.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], a > 0.55 ? C.cyL : C.cy); F.glow(pts[3][0], pts[3][1], 18, 0x40e0ff, 0.12 + 0.12 * a); });
  // the hanging orb
  const a = 0.5 + 0.5 * Math.sin(t * 2);
  R.disc(133, 186, 8, (dx, dy, d) => d > 7 ? C.brD : d > 6 ? C.brL : (-dx - dy) > 6 ? C.cyH : d < 3 + a ? C.cyL : C.cy);
  for (const bx of [-4, 0, 4]) R.r(133 + bx, 179, 1, 15, C.br); R.r(126, 186, 15, 1, C.br);
  F.glow(133, 186, 34, 0x40e0ff, 0.35 + 0.2 * a);
}

// --- the Builder ---------------------------------------------------------------------------------------------
const B = { x: 130, y: 72, w: 76, h: 58, gx: 155, gy: 110 };
function drawGear(R, cx, cy, rot) {
  const OUT = 13, ROOT = 10, N = 10;
  R.disc(cx, cy, OUT + 0.5, (dx, dy, d) => {
    const a = Math.atan2(dy, dx) - rot, tooth = Math.cos(a * N) > -0.05;
    const edge = tooth ? OUT : ROOT;
    if (d > edge) return 0;
    if (d < 1.8) return C.oo;
    if (d < 4.6) return d > 3.6 ? C.stD : lit(dx, dy, d + 2.4, 4.6 + 2.4, RAMP.steel);
    if (d > edge - 1) return C.o;
    const k = (-dx - dy) / (d * 1.41);
    if (d > edge - 2.2) return k > 0.3 ? C.stH : k < -0.35 ? C.stD : C.stL;
    if (d < 5.8) return C.stD;
    return k > 0.5 ? C.stL : C.st;
  });
}
function drawBuilder(R, t, F) {
  const st = F.state;
  let ox = 0, oy = 0;
  if (st === "working" && Math.sin(t * 22) > 0.6) oy = -1;
  if (st === "jammed" && (t % 1.1) < 0.35) ox = Math.sin(t * 60) > 0 ? 1 : -1;
  const X = B.x + ox, Y = B.y + oy;
  // shadow
  R.disc(168, 133, 46, (dx, dy, d, x, y) => Math.abs(dy) < 4 && Math.hypot(dx / 46, dy / 4) < 1 ? C.oo : 0);
  // left intake pipe
  cylH(R, X - 16, Y + 28, 18, 12, RAMP.iron); box(R, X - 19, Y + 26, 5, 16, RAMP.brass); rivet(R, X - 18, Y + 29); rivet(R, X - 18, Y + 37);
  // feet
  box(R, X + 2, Y + 54, 15, 10, RAMP.brass); box(R, X + 60, Y + 54, 15, 10, RAMP.brass); rivet(R, X + 5, Y + 58); rivet(R, X + 12, Y + 58); rivet(R, X + 63, Y + 58); rivet(R, X + 70, Y + 58);
  // chimney
  box(R, X + 22, Y - 4, 34, 8, RAMP.brass);
  cylV(R, X + 28, Y - 20, 22, 18, RAMP.brass);
  box(R, X + 25, Y - 26, 28, 8, RAMP.brass); R.r(X + 28, Y - 25, 22, 3, C.oo); R.r(X + 29, Y - 22, 20, 1, C.brD);
  rivet(R, X + 26, Y - 1); rivet(R, X + 51, Y - 1);
  // body: brass frame round an iron panel
  box(R, X, Y, B.w, B.h, RAMP.brass);
  R.r(X + 1, Y + 1, B.w - 2, 2, C.brH);
  box(R, X + 4, Y + 5, B.w - 8, B.h - 9, RAMP.iron);
  rust(R, X + 5, Y + 6, B.w - 10, B.h - 11, 0.2, 51);
  rust(R, X + 1, Y + 3, B.w - 2, B.h - 4, 0.06, 52);
  for (let i = X + 4; i < X + B.w - 4; i += 7) { rivet(R, i, Y + 2); rivet(R, i, Y + B.h - 3); }
  for (let j = Y + 9; j < Y + B.h - 4; j += 7) { rivet(R, X + 1, j); rivet(R, X + B.w - 3, j); }
  // vents + latch, top left
  box(R, X + 7, Y + 9, 15, 15, RAMP.iron); for (let i = 0; i < 3; i++) R.r(X + 10 + i * 4, Y + 11, 2, 11, C.oo);
  box(R, X + 26, Y + 12, 10, 6, RAMP.brass); R.r(X + 28, Y + 14, 6, 2, C.brD);
  // window: 3x3 lamp grid
  box(R, X + 46, Y + 8, 22, 20, RAMP.brass); R.r(X + 48, Y + 10, 18, 16, C.oo);
  const blink = Math.sin(t * 8) > -0.2;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    let a = C.ironL, b = C.ironH;
    if (st === "working") { const h = hash(i, j, fl(t * 9)); a = h > 0.75 ? C.wH : h > 0.25 ? C.wL : C.w; b = C.wH; }
    if (st === "jammed") { a = blink ? C.rL : C.rD; b = blink ? C.rH : C.r; }
    if (st === "done") { a = (Math.sin(t * 3 + i + j) > 0.6) ? C.gH : C.gL; b = C.gH; }
    const cx = X + 49 + i * 6, cy = Y + 11 + j * 5;
    R.r(cx, cy, 5, 4, a); R.p(cx, cy, b);
  }
  if (st === "working") F.glow(X + 57, Y + 18, 30, 0xff9a30, 0.55);
  if (st === "jammed" && blink) F.glow(X + 57, Y + 18, 34, 0xff3020, 0.6);
  if (st === "done") F.glow(X + 57, Y + 18, 30, 0x50ff60, 0.45);
  // gear housing ring + gear
  const gx = B.gx + ox, gy = B.gy + oy;
  R.disc(gx, gy, 18.5, (dx, dy, d) => d > 15 ? lit(dx, dy, d, 18.5, RAMP.brass) : d > 14 ? C.brD : C.oo);
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + 0.39; rivet(R, gx + Math.cos(a) * 16.6 - 0.5, gy + Math.sin(a) * 16.6 - 0.5); }
  drawGear(R, gx, gy, F.gear);
  // copper pipes up the right side
  for (const [px, py, pw, ph] of [[X + B.w - 1, Y + 10, 8, 46], [X + B.w + 6, Y + 16, 7, 38]]) { cylV(R, px, py, pw, ph, RAMP.copper); box(R, px - 1, py - 3, pw + 2, 4, RAMP.copper); for (let j = py + 8; j < py + ph - 2; j += 9) { R.r(px, j, pw, 1, C.cuD); R.r(px + 2, j - 1, pw - 4, 1, C.cuH); } }
  cylH(R, X + B.w + 12, Y + 30, 8, 12, RAMP.iron); box(R, X + B.w + 18, Y + 28, 5, 16, RAMP.brass);
  // antenna lamp
  R.r(X + 12, Y - 13, 2, 14, C.brD); R.r(X + 12, Y - 13, 1, 14, C.brL); box(R, X + 8, Y - 2, 10, 4, RAMP.brass);
  const ball = st === "jammed" ? (blink ? [C.o, C.rD, C.r, C.rL, C.rH] : [C.o, C.oo, C.rD, C.r, C.rL]) : st === "done" ? [C.o, C.gD, C.g, C.gL, C.gH] : [C.o, C.ironD, C.ironL, C.stD, C.st];
  R.disc(X + 13, Y - 17, 4.6, (dx, dy, d) => lit(dx, dy, d, 4.6, ball));
  if (st === "jammed" && blink) F.glow(X + 13, Y - 17, 24, 0xff3020, 0.7);
  if (st === "done") F.glow(X + 13, Y - 17, 20, 0x50ff60, 0.5);
}

// --- crates --------------------------------------------------------------------------------------------------
function drawCrate(R, x, y, built) {
  x = fl(x); y = fl(y);
  box(R, x, y, 13, 12, RAMP.wood);
  R.r(x + 1, y + 1, 11, 2, C.wdH); R.r(x + 2, y + 5, 9, 1, C.wdD); R.r(x + 2, y + 8, 9, 1, C.wdD);
  R.r(x + 6, y + 3, 1, 8, C.wdD);
  for (const [cx, cy] of [[x, y], [x + 9, y], [x, y + 8], [x + 9, y + 8]]) { R.r(cx, cy, 4, 4, C.brL); R.p(cx + 1, cy + 1, C.brD); R.r(cx, cy + 3, 4, 1, C.brD); }
  if (built) { R.r(x + 4, y + 4, 5, 4, C.cyD); R.r(x + 5, y + 5, 3, 2, C.cyL); }
}

// --- Shippy --------------------------------------------------------------------------------------------------
function drawLeg(R, hx, hy, fx, fy, len, side, far) {
  let dx = fx - hx, dy = fy - hy, d = Math.hypot(dx, dy) || 0.01;
  if (d > len * 2) { fx = hx + dx / d * len * 2; fy = hy + dy / d * len * 2; dx = fx - hx; dy = fy - hy; d = len * 2; }
  const h = Math.sqrt(Math.max(0, len * len - d * d / 4));
  let px = -dy / d, py = dx / d; if (px * side < 0) { px = -px; py = -py; }
  const kx = hx + dx / 2 + px * h, ky = hy + dy / 2 + py * h;
  const dark = far ? C.ironD : C.ironL, lite = far ? C.brD : C.br;
  R.line(hx, hy, kx, ky, C.o, 3); R.line(hx, hy, kx, ky, dark, 2);
  R.line(kx, ky, fx, fy, C.o, 3); R.line(kx, ky, fx, fy, lite, 2);
  R.disc(kx, ky, 2.2, (ddx, ddy, dd) => far ? C.brD : lit(ddx, ddy, dd + 0.5, 2.7, RAMP.brass));
  const fxr = fl(fx) - 3, fyr = fl(fy) - 2; R.r(fxr, fyr, 7, 3, C.o); R.r(fxr + 1, fyr, 5, 2, far ? C.brD : C.brL); R.p(fxr + 1, fyr, far ? C.br : C.brH);
}
function drawShippy(R, t, S, F) {
  const f = S.f, u = S.u, gy = 153, cx = fl(S.x);
  const walk = S.walk && u >= 1;
  const bob = walk ? Math.abs(Math.sin(S.ph)) * 1.2 : Math.sin(t * 2.4) * 0.4 * u;
  const hop = S.hop > 0 ? Math.sin((1 - S.hop) * Math.PI) * 4 : 0;
  const lift = 3 + u * 11, by = fl(gy - lift - bob - hop), top = by - 17;
  const lr = (x, y, w, h, c) => R.r(f > 0 ? cx + x : cx - x - w, y, w, h, c);
  const lp = (x, y, c) => R.p(f > 0 ? cx + x : cx - x - 1, y, c);
  // shadow
  R.disc(cx, gy, 15, (dx, dy, d, x, y) => Math.abs(dy) < 2 && Math.hypot(dx / 15, dy / 2) < 1 ? C.pl : 0);
  const legs = [[-9, 0, 1], [9, Math.PI, 1], [-9, Math.PI, 0], [9, 0, 0]]; // [x, phase, far]
  const len = 2 + u * 6.5;
  const leg = ([lx, lph, far]) => {
    const hx = cx + f * (lx + (far ? 2 : 0)), hy = by - 1;
    const ph = S.ph + lph;
    const fx = hx + f * (walk ? Math.cos(ph) * 4 : 1.5) + (lx < 0 ? -f : f) * 2 * u;
    const fy = gy - (walk ? Math.max(0, Math.sin(ph)) * 3 : 0);
    if (u < 0.15) { R.r(hx - 3, by, 7, 3, C.o); R.r(hx - 2, by, 5, 2, far ? C.brD : C.brL); return; }
    drawLeg(R, hx, hy, fx, fy, len, (lx < 0 ? -f : f), far);
  };
  legs.filter((l) => l[2]).forEach(leg);
  // lantern on his back + cable
  const ly = top + 3;
  lr(-21, ly, 7, 3, C.o); lr(-20, ly, 5, 2, C.brL);
  lr(-21, ly + 2, 7, 10, C.o);
  const pulse = 0.5 + 0.5 * Math.sin(t * 3);
  lr(-20, ly + 3, 5, 8, pulse > 0.5 ? C.cyL : C.cy); lr(-19, ly + 4, 2, 4, C.cyH); lr(-18, ly + 3, 1, 8, C.brD);
  lr(-21, ly + 11, 7, 3, C.o); lr(-20, ly + 11, 5, 2, C.br);
  for (const [x, y] of [[-17, ly - 1], [-16, ly - 2], [-15, ly - 3], [-13, ly - 3], [-12, ly - 2]]) lp(x, y, C.cuL);
  F.glow(cx + f * -17.5, ly + 7, 16, 0x40e0ff, 0.25 + 0.2 * pulse);
  // the box body
  const bx = f > 0 ? cx - 14 : cx - 14;
  box(R, bx, top, 28, 18, RAMP.navy);
  rust(R, bx + 1, top + 2, 26, 15, 0.32, 61);
  lr(-14, top, 28, 1, C.o); lr(-13, top + 1, 26, 3, C.nvL); lr(-13, top + 1, 26, 1, C.nvH); rust(R, bx + 2, top + 2, 24, 2, 0.18, 62);
  lr(-13, top + 6, 26, 1, C.brD); lr(-13, top + 5, 26, 1, C.brL); // lid seam
  for (const x of [-14, 11]) { lr(x, top, 3, 18, C.brD); lr(x, top + 1, 3, 1, C.brH); lr(x + 1, top + 1, 1, 16, C.brL); }
  lr(-14, top + 16, 28, 2, C.brD); lr(-13, top + 16, 26, 1, C.br);
  rivet(R, cx + f * -12 - (f < 0 ? 1 : 0), top + 2); rivet(R, cx + f * 12 - (f < 0 ? 1 : 0), top + 2); rivet(R, cx + f * -12 - (f < 0 ? 1 : 0), top + 13); rivet(R, cx + f * 12 - (f < 0 ? 1 : 0), top + 13);
  // handle
  lr(-5, top - 4, 10, 1, C.o); lr(-5, top - 3, 10, 1, C.brL); lr(-5, top - 3, 1, 3, C.br); lr(4, top - 3, 1, 3, C.br); lr(-6, top - 3, 1, 3, C.o); lr(5, top - 3, 1, 3, C.o);
  // visor: the face
  const awake = u > 0.5;
  lr(1, top + 9, 11, 4, C.o);
  if (awake) { const blinkEye = (t % 3.4) < 0.12; lr(2, top + 10, 9, blinkEye ? 1 : 2, C.cyL); if (!blinkEye) lr(3, top + 10, 4, 1, C.cyH); F.glow(cx + f * 6.5, top + 11, 10, 0x40e0ff, 0.3); }
  else { lr(4, top + 11, 4, 1, C.cyD); }
  legs.filter((l) => !l[2]).forEach(leg);
}

// --- particles -----------------------------------------------------------------------------------------------
function drawPuff(R, p) {
  const a = 1 - p.age / p.life, rad = p.r0 + p.age * p.grow;
  const [hi, m, lo] = p.dark ? [C.dsH, C.ds, C.dsD] : [C.smH, C.sm, C.smD];
  R.disc(p.x, p.y, rad, (dx, dy, d, x, y) => { if (!dith(x, y, Math.min(1, a * 2.2) * (d > rad - 1 ? 0.5 : 1))) return 0; const k = (-dx - dy) / rad; return k > 0.35 ? hi : k > -0.4 ? m : lo; });
}
function drawSpark(R, s) { const k = s.age / s.life; R.p(s.x, s.y, k < 0.25 ? C.wH : k < 0.5 ? C.wL : k < 0.8 ? C.w : C.wD); if (k < 0.4) R.p(s.x - s.vx * 0.012, s.y - s.vy * 0.012, C.w); }

export { W, H, Raster, drawSky, drawCity, drawCityLights, drawClouds, drawDeck, drawBeltFrame, drawBeltLive, drawDeckLive, drawBuilder, drawCrate, drawShippy, drawPuff, drawSpark, B, BELT };
