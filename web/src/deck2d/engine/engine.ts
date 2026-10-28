import {
  BELT_Y, FLOOR_Y, LAUNCH_Y, LOOK, STOPS, STOP_X,
  type ArtLoader, type DeckBus, type DeckLayer, type DeckView, type LayerSlot, type ShippyModule, type StopId,
} from "../contract";

// The deck renderer: sky, clouds, deck, bridge + rocket island, belt, stations, crates, rocket, camera.
// It draws whatever DeckView it's handed and animates the in-between (crates sliding stop to stop by item id,
// stations dropping in, the rocket going up), and emits DeckEvents for juice/ by diffing views.

const PAD = { x: 1905, y: -50, s: 0.72 }; // bridge + rocket island sprite; its bridge meets the deck's right edge
const BRIDGE_Y = PAD.y + PAD.s * 560;
const ORB = { x: 1043, y: 578 };
const BOUNDS = { x0: -20, x1: PAD.x + 1533 * PAD.s + 20, y0: -30, y1: 670 };
const SPEED = 170, GAP = 50, CRATE = 42;
const LEVER = { x: STOP_X.review + 92, base: FLOOR_Y + 48, h: 78 };

// The belt: along the deck, down onto the bridge, out to the launch circle.
const PATH: [number, number][] = [[STOP_X.repo + 60, BELT_Y], [1915, BELT_Y], [1995, BRIDGE_Y], [STOP_X.launch - 130, BRIDGE_Y], [STOP_X.launch - 34, LAUNCH_Y]];
const SEGS: { ax: number; ay: number; bx: number; by: number; len: number; at: number; a: number }[] = [];
let PATH_LEN = 0;
for (let i = 1; i < PATH.length; i++) {
  const [ax, ay] = PATH[i - 1], [bx, by] = PATH[i], len = Math.hypot(bx - ax, by - ay);
  SEGS.push({ ax, ay, bx, by, len, at: PATH_LEN, a: Math.atan2(by - ay, bx - ax) });
  PATH_LEN += len;
}
const at = (d: number): [number, number] => {
  for (const g of SEGS) if (d <= g.at + g.len) { const t = (d - g.at) / g.len; return [g.ax + (g.bx - g.ax) * t, g.ay + (g.by - g.ay) * t]; }
  const g = SEGS[SEGS.length - 1]; return [g.bx, g.by];
};
const stopD = (s: StopId) => (s === "launch" ? PATH_LEN : STOP_X[s] - PATH[0][0]);

interface Crate { id: string; d: number; look: string; stop: StopId; fade: number }
interface Puff { x: number; y: number; vx: number; vy: number; t: number; life: number; r: number }

export interface Engine {
  frame(view: DeckView, dt: number): void;
  where(stop: StopId): { x: number; y: number }; // CSS pixels on screen
  focus(stop: StopId | null): void; // fly the camera there (null: back to automatic)
  seeAll(on: boolean): void;
  readonly portrait: boolean;
}

export function createEngine(cv: HTMLCanvasElement, art: ArtLoader, bus: DeckBus, shippy: ShippyModule, layers: DeckLayer[] = []): Engine {
  const owned = new Set(layers.flatMap((l) => l.replaces ?? []));
  const slot = (s: LayerSlot) => { for (const l of layers) l.draw(cx, s); };
  const cx = cv.getContext("2d")!;
  let W = 0, H = 0, DPR = 1, t = 0;
  const resize = () => { DPR = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); };
  addEventListener("resize", resize); resize();

  const crates = new Map<string, Crate>();
  const drop: Record<StopId, number> = Object.fromEntries(STOPS.map((s) => [s, 0])) as never;
  const puffs: Puff[] = [];
  const rocket = { y: 0, v: 0, mode: "ready" as "ready" | "count" | "up" | "away" | "down", t: 0 };
  let prev: DeckView | null = null, lever = 0;

  let deckW = 2039, islandUp = true, islandIn = true; // how much platform is built (deck.size / deck.island)

  // ---------- camera ----------
  const cam = { x: 1400, y: 300, s: 0.3, manual: 0, all: false, pin: null as StopId | null };
  const portrait = () => W / H <= 1.2;
  const grow = layers.find((l) => l.bounds);
  const builder = layers.find((l) => l.build)?.build;
  const right = () => grow?.bounds?.().x1 ?? (islandUp ? BOUNDS.x1 : islandIn ? BOUNDS.x1 + 170 : deckW + 40); // the camera frames only what's been built (plus the crane while the island builds)
  const fitAll = () => {
    const bw = right() - BOUNDS.x0, bh = BOUNDS.y1 - BOUNDS.y0;
    return { x: (BOUNDS.x0 + right()) / 2, y: (BOUNDS.y0 + BOUNDS.y1) / 2 + 30, s: Math.min(W / bw, (H * 0.9) / bh, 1.1) };
  };
  // A tall phone would show the whole line tiny, so the camera parks on whatever matters (plan pick: left to right,
  // park on the bottleneck, one tap to see it all).
  function focusX(v: DeckView) {
    const pin = cam.pin ?? v.card?.stop ?? v.jam;
    if (pin) return STOP_X[pin] + (pin === "launch" ? -200 : 60);
    if (v.shippy.at !== "corner") return STOP_X[v.shippy.at] + 120;
    if (rocket.mode === "count" || rocket.mode === "up") return STOP_X.launch - 200;
    const fresh = STOPS.find((s) => s !== "launch" && drop[s] > 0 && drop[s] < 1);
    if (fresh) return STOP_X[fresh];
    let lead = 0; crates.forEach((c) => { lead = Math.max(lead, c.d); });
    return PATH[0][0] + lead;
  }
  function target(v: DeckView) {
    const all = fitAll();
    if (cam.all) return all;
    // Desktop fits everything, except it leans in on a station while it's being built (construction reads small otherwise).
    const site = !portrait() && !v.card ? v.stops.find((x) => x.id !== "launch" && (x.building !== undefined || (x.built && layers.some((l) => l.owns?.(x))))) : undefined;
    if (!portrait() && !site) return all;
    const s = Math.max(all.s, W / (site ? 1300 : 1050)), half = W / 2 / s;
    if (site) return { x: Math.max(BOUNDS.x0 + half, Math.min(right() - half, STOP_X[site.id])), y: 230, s };
    return { x: Math.max(BOUNDS.x0 + half, Math.min(right() - half, focusX(v))), y: 250, s };
  }
  { const f = fitAll(); Object.assign(cam, f); }
  let first = true;

  // drag to pan, pinch or wheel to zoom
  const ptrs = new Map<number, [number, number]>(); let pinch = 0, moved = 0;
  cv.addEventListener("pointerdown", (e) => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; });
  cv.addEventListener("pointermove", (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    moved += Math.abs(e.clientX - p[0]) + Math.abs(e.clientY - p[1]);
    if (moved < 6) return;
    cam.manual = performance.now() + 6000;
    if (ptrs.size === 1) { cam.x -= (e.clientX - p[0]) / cam.s; cam.y -= (e.clientY - p[1]) / cam.s; }
    else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / pinch);
      pinch = d;
    }
  });
  const up = (e: PointerEvent) => {
    ptrs.delete(e.pointerId); pinch = 0;
    if (moved < 6 && e.clientX < 110 && e.clientY < 110) { cam.manual = 0; cam.pin = null; } // tap Shippy: fly to what he's looking at
  };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", (e) => { e.preventDefault(); cam.manual = performance.now() + 6000; zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  function zoomAt(px: number, py: number, f: number) {
    const wx = cam.x + (px - W / 2) / cam.s, wy = cam.y + (py - H / 2) / cam.s;
    cam.s = Math.max(fitAll().s * 0.8, Math.min(1.6, cam.s * f));
    cam.x = wx - (px - W / 2) / cam.s; cam.y = wy - (py - H / 2) / cam.s;
  }

  // ---------- views -> motion + events ----------
  function take(v: DeckView, dt: number) {
    const p = prev;
    for (const s of v.stops) {
      const was = p?.stops.find((x) => x.id === s.id);
      if (s.built && !was?.built) { if (p) bus.emit({ type: "station-built", stop: s.id }); else drop[s.id] = 1; }
      if (p && was && was.state !== s.state) bus.emit({ type: "station-state", stop: s.id, state: s.state });
      if (p && s.automated && !was?.automated) bus.emit({ type: "automated", stop: s.id });
      if (s.built && drop[s.id] < 1) {
        drop[s.id] = Math.min(1, drop[s.id] + dt * 2.2);
        if (drop[s.id] === 1 && s.id !== "launch") for (let i = 0; i < 10; i++) puffs.push({ x: STOP_X[s.id] + (Math.random() - 0.5) * 130, y: FLOOR_Y - 6, vx: (Math.random() - 0.5) * 90, vy: -10 - Math.random() * 30, t: 0, life: 0.9, r: 12 + Math.random() * 10 });
      }
    }
    if (p && v.jam && v.jam !== p.jam) bus.emit({ type: "jam", stop: v.jam });
    if (p && v.shippy.pose !== p.shippy.pose) bus.emit({ type: "shippy", pose: v.shippy.pose });
    if (p && islandUp && v.shipped > p.shipped && (rocket.mode === "ready" || rocket.mode === "down")) { rocket.mode = "count"; rocket.t = 0; }

    // crates: every item has a spot (its stop, minus its place in the queue); crates only ever slide forward
    const seen = new Set<string>();
    for (const s of v.stops) s.items.forEach((it, k) => {
      seen.add(it.id);
      let c = crates.get(it.id);
      if (!c) { c = { id: it.id, d: 0, look: it.look, stop: s.id, fade: 1 }; crates.set(it.id, c); }
      if (c.stop !== s.id) { c.stop = s.id; }
      c.look = it.look;
      const want = stopD(s.id) - k * GAP;
      const before = c.d;
      if (c.d < want) c.d = Math.min(want, c.d + SPEED * dt);
      if (before < want - 0.5 && c.d >= want - 0.5 && k === 0) bus.emit({ type: "crate-arrive", stop: s.id, id: it.id });
    });
    crates.forEach((c, id) => {
      if (seen.has(id)) return;
      if (c.stop === "launch" || c.d >= PATH_LEN - 60) { crates.delete(id); return; } // it went up with the rocket
      c.fade -= dt * 3; if (c.fade <= 0) crates.delete(id);
    });
    prev = v;
  }

  function rocketStep(dt: number) {
    rocket.t += dt;
    if (rocket.mode === "count" && rocket.t > 0.6) { rocket.mode = "up"; rocket.t = 0; rocket.v = 0; bus.emit({ type: "launch" }); }
    else if (rocket.mode === "up") {
      rocket.v += 820 * dt; rocket.y -= rocket.v * dt;
      if (rocket.y > -400) for (let i = 0; i < 2; i++) puffs.push({ x: STOP_X.launch + (Math.random() - 0.5) * 60, y: LAUNCH_Y - 4, vx: (Math.random() - 0.5) * 140, vy: -10 - Math.random() * 20, t: 0, life: 1.3, r: 14 + Math.random() * 14 });
      if (rocket.y < -1500) { rocket.mode = "away"; rocket.t = 0; }
    } else if (rocket.mode === "away" && rocket.t > 0.7) { rocket.mode = "down"; rocket.y = -600; }
    else if (rocket.mode === "down") { rocket.y += -rocket.y * Math.min(1, dt * 5); if (Math.abs(rocket.y) < 1) { rocket.y = 0; rocket.mode = "ready"; } }
  }

  // ---------- drawing ----------
  const img = (n: string) => art.get(n);
  function put(name: string, x: number, base: number, h: number) {
    const im = img(name); if (!im) return 0;
    const w = im.naturalWidth * h / im.naturalHeight;
    cx.drawImage(im, x - w / 2, base - h, w, h);
    return w;
  }
  function glow(x: number, y: number, r: number, rgb: string, a: number, add = false) {
    const g = cx.createRadialGradient(x, y, 2, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
    if (add) cx.globalCompositeOperation = "lighter";
    cx.fillStyle = g; cx.fillRect(x - r, y - r, r * 2, r * 2);
    cx.globalCompositeOperation = "source-over";
  }
  function sky() {
    const sk = img("sky"); if (!sk) return;
    const s = Math.max(W / sk.naturalWidth, H / sk.naturalHeight) * 1.1, w = sk.naturalWidth * s, h = sk.naturalHeight * s;
    const ox = Math.max(-(w - W) / 2, Math.min((w - W) / 2, -(cam.x - 1400) * 0.04 * cam.s));
    cx.drawImage(sk, (W - w) / 2 + ox, (H - h) / 2, w, h);
  }
  function clouds(y: number, scale: number, speed: number, alpha: number) {
    const c = img("clouds"); if (!c) return;
    const w = c.naturalWidth * scale, h = c.naturalHeight * scale, off = ((t * speed) % (2 * w) + 2 * w) % (2 * w);
    cx.globalAlpha = alpha;
    let i = 0;
    for (let x = BOUNDS.x0 - 2 * w - off; x < BOUNDS.x1 + w * 2; x += w - 1, i++) {
      if (i % 2) { cx.save(); cx.translate(x + w, y); cx.scale(-1, 1); cx.drawImage(c, 0, 0, w, h); cx.restore(); } // mirror every other tile so seams meet
      else cx.drawImage(c, x, y, w, h);
    }
    cx.globalAlpha = 1;
  }
  function belt() {
    const b = img("belt"); if (!b) return;
    const segs = islandUp ? SEGS : SEGS.slice(0, 1);
    const bh = 34, bw = b.naturalWidth * bh / b.naturalHeight, step = bw / 5; // the strip holds 5 chevron panels
    const off = (t * SPEED * 0.35) % step;
    for (const g of segs) {
      const len = islandUp ? g.len : Math.min(g.len, deckW - 60 - g.ax);
      cx.save(); cx.translate(g.ax, g.ay); cx.rotate(g.a);
      cx.beginPath(); cx.rect(0, -bh / 2, len, bh); cx.clip();
      for (let x = off - step - bw; x < g.len; x += bw - 1) cx.drawImage(b, x, -bh / 2, bw, bh);
      cx.restore();
    }
  }
  function crate(c: Crate) {
    const [x, y] = at(c.d);
    if (c.look === "wait") glow(x, y - 18, 46, "255,70,50", 0.25 + 0.2 * Math.sin(t * 6));
    cx.globalAlpha = c.fade;
    put("crate-" + c.look, x, y + 12, CRATE);
    cx.globalAlpha = 1;
  }
  function station(v: DeckView, id: StopId) {
    const s = v.stops.find((x) => x.id === id)!;
    if (!s.built || id === "launch") return;
    if (layers.some((l) => l.owns?.(s))) return;
    const e = 1 - drop[id], fall = -420 * e * e; // drops in from the sky
    const bob = s.state === "working" && Math.sin(t * 20) > 0.5 ? -1.5 : 0;
    const L = LOOK[id];
    cx.globalAlpha = Math.min(1, drop[id] * 3);
    put(`${id}-${s.state}`, STOP_X[id], BELT_Y + L.drop + fall + bob, L.h);
    cx.globalAlpha = 1;
    if (s.state === "jammed") {
      const x = STOP_X[id], top = BELT_Y + L.drop - L.h, blink = Math.sin(t * 8) > -0.2;
      glow(x, top, 130, "255,60,40", blink ? 0.35 : 0.12);
      if (blink) put("beacon", x, top + 18, 54);
      if (s.waiting && put("plate", x - 6, BELT_Y + 106, 52)) {
        cx.fillStyle = "#2b1a0a"; cx.textAlign = "center"; cx.textBaseline = "middle"; cx.font = "15px Silkscreen, monospace";
        const [a, b] = s.waiting.split(" ");
        cx.fillText(a, x - 6, BELT_Y + 71); if (b) cx.fillText(b, x - 6, BELT_Y + 88);
      }
    }
  }
  function leverDraw(v: DeckView) {
    const rv = v.stops.find((x) => x.id === "review")!;
    if (!rv.built) return;
    const e = 1 - drop.review, fall = -420 * e * e;
    if (prev && v.shippy.pose === "lever") lever = 0.4;
    put(lever > 0 ? "lever-down" : rv.state === "jammed" ? "lever-glow" : "lever-up", LEVER.x, LEVER.base + fall, LEVER.h);
  }
  function rocketDraw() {
    const rk = img("rocket"), fl = img("flame");
    if (!rk || rocket.mode === "away" || !islandUp || owned.has("rocket")) return;
    const h = 220, w = rk.naturalWidth * h / rk.naturalHeight, y = LAUNCH_Y - h + 20 + rocket.y;
    if ((rocket.mode === "up" || rocket.mode === "count") && fl) {
      const fh = (rocket.mode === "count" ? 56 : 150) * (0.85 + Math.random() * 0.3), fw = fl.naturalWidth * 150 / fl.naturalHeight;
      cx.drawImage(fl, STOP_X.launch - fw / 2, y + h - 24, fw, fh);
    }
    cx.drawImage(rk, STOP_X.launch - w / 2 + (rocket.mode === "count" ? (Math.random() - 0.5) * 3 : 0), y, w, h);
  }
  function puffsDraw(dt: number) {
    for (const p of puffs) {
      p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt;
      const k = p.t / p.life, r = p.r * (1 + k * 1.5);
      cx.fillStyle = `rgba(225,210,195,${0.6 * Math.max(0, 1 - k)})`;
      cx.fillRect(Math.round(p.x - r / 2), Math.round(p.y - r / 2), Math.round(r), Math.round(r));
    }
    for (let i = puffs.length - 1; i >= 0; i--) if (puffs[i].t >= puffs[i].life) puffs.splice(i, 1);
  }

  function frame(v: DeckView, dt: number) {
    t += dt; lever = Math.max(0, lever - dt);
    take(v, dt); rocketStep(dt);
    if (performance.now() >= cam.manual) {
      const tg = target(v), k = first ? 1 : Math.min(1, dt * 1.8); first = false;
      cam.x += (tg.x - cam.x) * k; cam.y += (tg.y - cam.y) * k; cam.s += (tg.s - cam.s) * k;
    }
    for (const l of layers) l.update(dt, v);
    const act = builder?.shippyAct?.(); // a running build calls Shippy over to weld
    shippy.update(dt, act ? { pose: act.pose, at: act.at } : v.shippy);
    const quake = builder?.shake?.() ?? 0;

    cx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = "high";
    cx.fillStyle = "#2a1410"; cx.fillRect(0, 0, W, H);
    sky();
    cx.setTransform(DPR * cam.s, 0, 0, DPR * cam.s, DPR * (W / 2 - (cam.x + (Math.random() - 0.5) * quake) * cam.s), DPR * (H / 2 - (cam.y + (Math.random() - 0.5) * quake) * cam.s));
    slot("sky-far");
    clouds(470, 1.1, 5, 0.85);
    // The platform grows (placeholder until Justin's small/medium deck art lands: the big deck, clipped).
    const dk = v.deck ?? { size: "large", island: "built" };
    const reach = { small: 0.42, medium: 0.7, large: 1 }[dk.size];
    deckW += ((reach + (dk.growing ?? 0) * 0.28) * 2039 - deckW) * Math.min(1, dt * 3);
    const deck = img("deck");
    if (deck && !owned.has("deck")) { cx.save(); cx.beginPath(); cx.rect(-50, -100, deckW + 50, 900); cx.clip(); cx.drawImage(deck, 0, 0); cx.restore(); }
    const island = dk.island === "built" ? 1 : dk.island === "building" ? dk.islandProgress ?? 0 : 0;
    const pad = img("pad");
    if (pad && island > 0 && !owned.has("island")) {
      cx.globalAlpha = Math.min(1, island * 2);
      cx.drawImage(pad, PAD.x, PAD.y + (1 - island) * 260, pad.naturalWidth * PAD.s, pad.naturalHeight * PAD.s); // rises up out of the clouds
      cx.globalAlpha = 1;
    }
    islandUp = island >= 1; islandIn = island > 0;
    slot("deck");
    put("boiler-on", 112, 182, 168);
    glow(ORB.x, ORB.y, 100, "120,240,255", 0.3 + 0.2 * Math.sin(t * 2), true);
    belt();
    slot("line");
    rocketDraw();
    crates.forEach(crate);
    for (const id of STOPS) station(v, id);
    slot("stations");
    leverDraw(v);
    shippy.drawWorld(cx);
    puffsDraw(dt);
    clouds(600, 1.6, 12, 0.95);
    slot("front");
    cx.setTransform(DPR, 0, 0, DPR, 0, 0);
    shippy.drawCorner(cx, 14, 14, 76);
  }

  return {
    frame,
    where(stop) { return { x: W / 2 + (STOP_X[stop] - cam.x) * cam.s, y: H / 2 + ((stop === "launch" ? LAUNCH_Y : FLOOR_Y - 80) - cam.y) * cam.s }; },
    focus(stop) { cam.pin = stop; cam.manual = 0; },
    seeAll(on) { cam.all = on; cam.manual = 0; },
    get portrait() { return portrait(); },
  };
}
