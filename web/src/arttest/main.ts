// @ts-nocheck -- throwaway comparison page, kept loose on purpose
// /arttest.html: the same Builder + belt + Shippy drawn three ways on one clock.
// A = Justin's image sprites as the deck draws them now, B = 100% code (src/arttest/codeart.ts), C = hybrid:
// his deck art + code for everything that moves, all rendered onto one 320x200 pixel grid.
import * as PIXI from "pixi.js";
import * as CodeArt from "./codeart";
// One shared simulation drives both scenes so they stay in lockstep: station state, belt, crates, Shippy.
const { W, H } = CodeArt;
const S = {
  t: 0, state: "idle", gear: 0, belt: 0, crates: [], spawn: 0, puffs: [], sparks: [], steam: 0, smokeT: 0,
  sh: { x: 52, f: 1, u: 0, want: 0, walk: false, ph: 0, hop: 0 },
  loop: true, loopT: 0,
};
const LOOP = [ // [seconds, what happens]
  [0, () => { setState("idle"); S.sh.want = 0; S.sh.walk = false; }],
  [1.6, () => { S.sh.want = 1; S.sh.hop = 1; }],
  [2.8, () => { S.sh.walk = true; }],
  [3.6, () => setState("working")],
  [10, () => setState("jammed")],
  [14, () => setState("done")],
  [19, () => { S.sh.walk = false; }],
  [20, () => { S.sh.want = 0; }],
  [22.5, null],
];
const INTAKE = 120, OUTLET = 214;
function setState(s) { S.state = s; ui(); }
function step(dt) {
  S.t += dt; const t = S.t, st = S.state;
  if (S.loop) { const prev = S.loopT; S.loopT += dt; const end = LOOP[LOOP.length - 1][0]; for (const [at, fn] of LOOP) if (fn && prev < at && S.loopT >= at) fn(); if (S.loopT >= end) S.loopT = 0, LOOP[0][1](); }
  // gear
  if (st === "working") S.gear += dt * 2.6; else if (st === "done") S.gear += dt * 3.6;
  else if (st === "jammed") S.gear += Math.sin(t * 34) * 0.05 * ((t % 1.1) < 0.35 ? 1 : 0.2);
  // belt + crates
  const v = st === "working" ? 22 : st === "done" ? 34 : st === "jammed" ? 22 : 0;
  S.belt += v * dt * (st === "jammed" ? 0.25 : 1);
  if (v) { S.spawn -= dt; const queued = S.crates.filter((c) => c.x < INTAKE).length; if (S.spawn <= 0 && queued < 6) { S.crates.push({ x: 4, built: false }); S.spawn = st === "done" ? 1.0 : 1.5; } }
  S.crates.sort((a, b) => b.x - a.x);
  let limit = Infinity;
  for (const c of S.crates) {
    if (!v) break;
    if (c.x < INTAKE) { const stop = st === "jammed" ? Math.min(limit, INTAKE - 13) : limit; c.x = Math.min(stop, c.x + v * dt); limit = c.x - 15; }
    else if (st !== "jammed" || c.x >= OUTLET) { c.x += v * dt; if (c.x >= OUTLET) c.built = true; }
  }
  S.crates = S.crates.filter((c) => c.x < 300);
  // chimney smoke, sparks, steam
  S.smokeT -= dt;
  const rate = st === "working" ? 0.32 : st === "jammed" ? 0.14 : st === "done" ? 0.9 : 99;
  if (S.smokeT <= 0 && rate < 99) { S.smokeT = rate; const dark = st === "jammed"; S.puffs.push({ x: 169 + Math.random() * 4, y: 44, vx: 5 + Math.random() * 4, vy: dark ? -16 : -11, r0: dark ? 3 : 2, grow: dark ? 5 : 3.4, age: 0, life: dark ? 1.8 : 2.2, dark }); }
  S.steam -= dt; if (S.steam <= 0) { S.steam = 0.45; for (const px of [242, 266]) S.puffs.push({ x: px, y: 183, vx: (Math.random() - 0.5) * 3, vy: 12, r0: 2, grow: 4, age: 0, life: 1.4, dark: false }); }
  if (st === "jammed" && Math.random() < dt * 22) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4; S.sparks.push({ x: 155 + Math.cos(a) * 13, y: 110 + Math.sin(a) * 13, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60 - 20, age: 0, life: 0.5 + Math.random() * 0.3 }); }
  for (const p of S.puffs) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  for (const s of S.sparks) { s.age += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 160 * dt; }
  S.puffs = S.puffs.filter((p) => p.age < p.life); S.sparks = S.sparks.filter((s) => s.age < s.life);
  // Shippy: unfold/fold, then walk back and forth in front of the line
  const sh = S.sh;
  sh.hop = Math.max(0, sh.hop - dt * 2.2);
  const want = sh.walk ? 1 : sh.want;
  sh.u += Math.sign(want - sh.u) * Math.min(Math.abs(want - sh.u), dt * 1.8);
  if (sh.walk && sh.u >= 1) { sh.x += sh.f * 20 * dt; sh.ph += dt * 10; if (sh.x > 284) sh.f = -1; if (sh.x < 40) sh.f = 1; }
}

// ---- scene 1: pure code ----------------------------------------------------------------------------------
function codeScene(app, deckImg = null) {
  // deckImg set = hybrid: the deck/rocks come from Justin's art, shrunk onto the same 320x200 grid; everything else is code.
  const R0 = new CodeArt.Raster(W, H), R1 = new CodeArt.Raster(W, H), R2 = new CodeArt.Raster(W, H), R3 = new CodeArt.Raster(W, H);
  CodeArt.drawSky(R0); CodeArt.drawCity(R0); R0.flush();
  if (!deckImg) CodeArt.drawDeck(R2);
  CodeArt.drawBeltFrame(R2); R2.flush();
  const root = new PIXI.Container(), grid = new PIXI.Container(); root.addChild(grid); app.stage.addChild(root);
  const tex = (R) => canvasTex(R.c, "nearest");
  const T = [R0, R1, R2, R3].map(tex);
  grid.addChild(new PIXI.Sprite(T[0]), new PIXI.Sprite(T[1]));
  if (deckImg) { const s = new PIXI.Sprite(canvasTex(shrink(deckImg, 336), "nearest")); s.position.set(-8, 100); grid.addChild(s); }
  grid.addChild(new PIXI.Sprite(T[2]), new PIXI.Sprite(T[3]));
  let rt = null;
  if (deckImg) { // render the mixed scene into one low-res texture so image and code share the exact pixel grid
    rt = PIXI.RenderTexture.create({ width: W, height: H, scaleMode: "nearest" });
    root.removeChild(grid); root.addChild(new PIXI.Sprite(rt));
  }
  const glows = new PIXI.Container(); root.addChild(glows);
  const pool = []; let used = 0;
  const glow = (x, y, rad, tint, alpha) => { let s = pool[used]; if (!s) { s = new PIXI.Sprite(GLOW()); s.anchor.set(0.5); s.blendMode = "add"; glows.addChild(s); pool.push(s); } used++; s.visible = true; s.position.set(x, y); s.scale.set(rad / 32); s.tint = tint; s.alpha = alpha; };
  return {
    root,
    draw() {
      used = 0; const F = { state: S.state, gear: S.gear, belt: S.belt, glow };
      R1.clear(); CodeArt.drawClouds(R1, S.t); CodeArt.drawCityLights(R1, S.t); R1.flush(); T[1].source.update();
      R3.clear();
      if (!deckImg) CodeArt.drawDeckLive(R3, S.t, F);
      CodeArt.drawBeltLive(R3, F);
      for (const c of S.crates) if (c.x < INTAKE || c.x >= OUTLET) CodeArt.drawCrate(R3, c.x, 118, c.built);
      for (const p of S.puffs) if (p.y > 150 && !deckImg) CodeArt.drawPuff(R3, p);
      CodeArt.drawBuilder(R3, S.t, F);
      for (const p of S.puffs) if (p.y <= 150) CodeArt.drawPuff(R3, p);
      for (const s of S.sparks) CodeArt.drawSpark(R3, s);
      CodeArt.drawShippy(R3, S.t, S.sh, F);
      R3.flush(); T[3].source.update();
      for (let i = used; i < pool.length; i++) pool[i].visible = false;
      if (rt) app.renderer.render({ container: grid, target: rt, clear: true });
    },
  };
}
// Explicit CanvasSource: the ESM build doesn't pick the right source for a bare canvas the way the UMD build does.
function canvasTex(c, scaleMode = "linear") { return new PIXI.Texture({ source: new PIXI.CanvasSource({ resource: c, scaleMode }) }); }
function shrink(img, w) {
  const c = document.createElement("canvas"); c.width = w; c.height = Math.round(img.height * w / img.width);
  const x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(img, 0, 0, c.width, c.height); return c;
}
let glowTex = null;
function GLOW() {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d");
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.35, "rgba(255,255,255,.35)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); return (glowTex = canvasTex(c));
}

// ---- scene 2: Justin's image art, moved the way the current deck moves it -------------------------------
function imageScene(app, IMG) {
  const root = new PIXI.Container(); app.stage.addChild(root);
  const T = Object.fromEntries(Object.entries(IMG).map(([k, im]) => [k, canvasTex(shrink(im, im.width))]));
  const put = (name, x, y, w) => { const s = new PIXI.Sprite(T[name]); s.position.set(x, y); s.scale.set(w / T[name].width); root.addChild(s); return s; };
  const sky = put("sky", -140, 0, 600); sky.height = 200; sky.scale.x = sky.scale.y;
  const clouds = [put("clouds", 0, 22, 520), put("clouds", 520, 22, 520)];
  put("deck", -8, 100, 336);
  for (let i = 0; i < 3; i++) put("belt", 14 + i * 97, 120, 98);
  const crateLayer = new PIXI.Container(); root.addChild(crateLayer);
  const builder = put("builder-idle", 125, 44, 92);
  const shippy = new PIXI.Sprite(T["shippy-0"]); shippy.anchor.set(0.52, 1); root.addChild(shippy);
  const crates = [];
  return {
    root,
    draw() {
      const t = S.t, st = S.state;
      clouds.forEach((c, i) => { c.x = ((i * 520 - t * 4) % 1040 + 1040) % 1040 - 520; });
      builder.texture = T["builder-" + (st === "done" ? "auto" : st)];
      builder.y = 44 + (st === "working" && Math.sin(t * 20) > 0.5 ? -1.5 : 0);
      const vis = S.crates.filter((c) => c.x < INTAKE || c.x >= OUTLET);
      while (crates.length < vis.length) { const s = new PIXI.Sprite(T.crate); s.scale.set(15 / T.crate.width); crateLayer.addChild(s); crates.push(s); }
      crates.forEach((s, i) => { s.visible = i < vis.length; if (s.visible) s.position.set(vis[i].x, 113); });
      // Shippy: same rules as deck2d/shippy (unfold strip, 2-frame walk + bob)
      const sh = S.sh, U = ["shippy-0", "shippy-1", "shippy-2", "shippy-3", "shippy-4", "shippy-5"];
      let frame = U[Math.min(5, Math.floor(sh.u * 5.99))], y = 151, rot = 0;
      if (sh.walk && sh.u >= 1) { const ph = (t % 0.13) / 0.13; frame = Math.floor(t / 0.13) % 2 ? "shippy-3" : "shippy-5"; y -= Math.abs(Math.sin(ph * Math.PI)) * 1.5; rot = Math.sin(t * Math.PI * 2 / 0.26) * 0.04 * sh.f; }
      else if (sh.u >= 1) frame = Math.sin(t * 3) > 0 ? "shippy-3" : "shippy-4";
      else if (sh.u <= 0) frame = Math.sin(t * 1.6) > 0.3 ? "shippy-1" : "shippy-0";
      shippy.texture = T[frame]; const k = 30 / T["shippy-0"].height; shippy.scale.set(k * sh.f, k); shippy.position.set(sh.x, y + 2); shippy.rotation = rot;
    },
  };
}

// ---- wiring ------------------------------------------------------------------------------------------------
const scenes = [];
async function mount(el, make) {
  const app = new PIXI.Application();
  await app.init({ width: 320, height: 200, backgroundAlpha: 0, antialias: false, resolution: Math.min(3, devicePixelRatio || 1), autoDensity: true, autoStart: false });
  el.appendChild(app.canvas);
  const sc = make(app);
  const fit = () => { const w = el.clientWidth; app.renderer.resize(w, w * H / W); sc.root.scale.set(w / W); };
  new ResizeObserver(fit).observe(el); fit();
  scenes.push({ app, sc });
}
function frame(now) {
  const dt = Math.min(0.05, (now - (frame.last ?? now)) / 1000); frame.last = now;
  step(dt);
  for (const { app, sc } of scenes) { sc.draw(); app.render(); }
  requestAnimationFrame(frame);
}
function ui() {
  document.querySelectorAll("[data-state]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.state === S.state)));
  const sh = S.sh, now = sh.walk ? "walk" : sh.want ? "unfold" : "fold";
  document.querySelectorAll("[data-shippy]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.shippy === now)));
  const lp = document.getElementById("loop"); lp.setAttribute("aria-pressed", String(S.loop)); lp.textContent = S.loop ? "Pause the loop" : "Play the loop";
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.id === "loop") { S.loop = !S.loop; if (S.loop) S.loopT = 0, LOOP[0][1](); return ui(); }
  if (b.dataset.state) { S.loop = false; setState(b.dataset.state); }
  if (b.dataset.shippy) { S.loop = false; const v = b.dataset.shippy; S.sh.walk = v === "walk"; S.sh.want = v === "fold" ? 0 : 1; if (v === "unfold") S.sh.hop = 1; ui(); }
});
const ART = ["sky", "clouds", "deck", "belt", "crate-plain", "builder-idle", "builder-working", "builder-jammed", "builder-auto", "shippy-0", "shippy-1", "shippy-2", "shippy-3", "shippy-4", "shippy-5"];
(async () => {
  const IMG = {};
  await Promise.all(ART.map((k) => new Promise((done) => { const im = new Image(); im.onload = im.onerror = () => done(); im.src = `/deck/art/${k}.webp`; IMG[k === "crate-plain" ? "crate" : k] = im; })));
  await mount(document.getElementById("img"), (app) => imageScene(app, IMG));
  await mount(document.getElementById("code"), (app) => codeScene(app));
  await mount(document.getElementById("hybrid"), (app) => codeScene(app, IMG.deck));
  LOOP[0][1](); ui(); requestAnimationFrame(frame);
})();
