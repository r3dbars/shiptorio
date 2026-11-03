// The construction moment: a stop goes from a tarped, padlocked plot to a finished machine with a gold burst and a
// green check. ~2.5s until the engine's normal sprite takes over; the check and afterglow linger to 3.5s
// (the first run is serial, so this stays short).
// Thread "Animate a station getting built"; this folder only. Art: Justin's ChatGPT sheets, cut by
// scripts/art/cut-build.py into /deck/art/build-*.webp, fx-*.webp and <stop>-build-1..4.webp.
//
// The beats (seconds from the start):
//   0.00 unlock    tarp whips off, padlock pops, plate drops away
//   0.20 plot      chalk plot glows gold, corner lamps light
//   0.45 scaffold  scaffold platform and crane rise behind the plot
//   0.70 frame     the frame goes up from the feet
//   1.15 panels    panels weld on over the frame
//   1.65 top       the crane brings the top down; thump + dust at 1.95
//   2.10 burst     scaffold and crane drop away, gold ring bursts
//   2.30 check     green check pops (small, overshoot, settle)
//   2.50 done      the engine draws the normal idle sprite again
// Calm by design (Justin, 2026-10-28): everything stays inside the stop's own slot (SLOT px either side, neighbours
// are ~250 apart), no welding sparks or flashes mid-build, one small shake when the top lands, one burst at the end.
// A stop with <stop>-build-1..4 sprites (builder today) plays those stages; others reveal their idle sprite instead.

import { pixelOn } from "../../flags";
import { BELT_Y, LOOK, STOP_X, type ArtLoader, type DeckBus, type DeckView, type Stop, type StopId } from "../contract";
import { drawBuildPx, drawLockedPx } from "./pixel";
import { STAGE_AT } from "./timeline";
import { clamp01, span } from "../engine/math";

export { STAGE_AT };

export type BuildStage = "plot" | "scaffold" | "frame" | "panels" | "top" | "burst" | "check";

/** Half-width of a stop's slot in world px: scaffold, crane, dust and burst stay inside it. */
const SLOT = 110;
const STAGES: BuildStage[] = ["plot", "scaffold", "frame", "panels", "top", "burst", "check"];

const SPRITE_OF: Partial<Record<StopId, string>> = { launch: "gate" };
/** <stop>-build-N frames are padded taller than the idle sprite (room for the hanging top); this scale lines their bodies up. */
const STAGED_SCALE = 1.08;

/** Every sprite this module draws, so a loader can fetch them up front. */
export const BUILD_SPRITES = [
  "build-tarp", "build-plate", "build-plot-dim", "build-plot-glow", "build-scaffold",
  "build-crane-left", "build-crane-up", "build-crane-right",
  "build-burst-1", "build-burst-2", "build-burst-3", "build-burst-4", "build-check-1", "build-check-2", "build-check-3",
  "fx-dust-1", "fx-dust-2", "fx-dust-3", "fx-dust-4",
  "builder-build-1", "builder-build-2", "builder-build-3", "builder-build-4",
] as const;

/** What Shippy should be doing for the build right now; the engine can hand this to the Shippy module. */
export interface ShippyAct { at: StopId; pose: "carry" | "weld" | "happy" }

export interface BuildOptions {
  reduced?: boolean; // prefers-reduced-motion: no shake, fewer particles
  label?: (stop: StopId) => string; // plate text on a locked stop
  now?: () => number; // test hook
}

interface Job { stop: StopId; t: number; fired: Set<string> }
interface Puff { name: "dust"; x: number; y: number; size: number; t: number; dur: number; flip: boolean }

const ease = {
  out: (t: number) => 1 - (1 - t) ** 3,
  in: (t: number) => t * t * t,
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  back: (t: number) => 1 + 3.2 * (t - 1) ** 3 + 2.2 * (t - 1) ** 2,
};

export interface Build {
  update(dt: number, view: DeckView): void;
  draw(ctx: CanvasRenderingContext2D, slot: "line" | "stations" | "front"): void;
  owns(stop: Stop): boolean;
  /** Start a build now (the dev preview's buttons). Normally a stop's built flag flipping starts it. */
  start(stop: StopId): void;
  progress(stop: StopId): number | null;
  shake(): number;
  shippyAct(): ShippyAct | null;
}

export function createBuild(art: ArtLoader, bus: DeckBus | null, opts: BuildOptions = {}): Build {
  const jobs = new Map<StopId, Job>();
  const locked = new Set<StopId>();
  const seen = new Map<StopId, boolean>();
  const puffs: Puff[] = [];
  const tints = new Map<string, HTMLCanvasElement>();
  const reduced = opts.reduced ?? (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  let clock = 0;
  let shakeAmp = 0;
  let first = true;
  const pixel = pixelOn();

  const img = (name: string) => art.get(name);
  const feet = (stop: StopId) => BELT_Y + LOOK[stop].drop;
  const idle = (stop: StopId) => img(`${stop}-idle`) ?? img(`${SPRITE_OF[stop] ?? "builder"}-idle`);
  const staged = (stop: StopId, n: number) => img(`${stop}-build-${n}`);
  const widthOf = (stop: StopId) => { const im = idle(stop); return im ? (im.naturalWidth * LOOK[stop].h) / im.naturalHeight : LOOK[stop].h; };

  /** Draw a sprite by its feet at height h. clip = the slice to draw, 0 = feet .. 1 = top. */
  function put(im: CanvasImageSource & { width: number; height: number }, x: number, base: number, h: number, clip?: [number, number]) {
    const w = (im.width * h) / im.height;
    if (!clip) { ctx0!.drawImage(im, x - w / 2, base - h, w, h); return; }
    const [lo, hi] = clip;
    if (hi <= lo) return;
    const sy = (1 - hi) * im.height, sh = (hi - lo) * im.height;
    ctx0!.drawImage(im, 0, sy, im.width, sh, x - w / 2, base - h * hi, w, h * (hi - lo));
  }
  let ctx0: CanvasRenderingContext2D | null = null;

  /** A flat-colour copy of a sprite (flash / silhouette), cached. */
  function tint(im: HTMLImageElement, color: string) {
    const key = im.src + color;
    let c = tints.get(key);
    if (!c) {
      c = document.createElement("canvas");
      c.width = im.naturalWidth; c.height = im.naturalHeight;
      const g = c.getContext("2d")!;
      g.drawImage(im, 0, 0);
      g.globalCompositeOperation = "source-atop";
      g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
      tints.set(key, c);
    }
    return c;
  }

  function puff(name: Puff["name"], x: number, y: number, size: number, dur = 0.45) {
    puffs.push({ name, x, y, size, t: 0, dur, flip: Math.random() < 0.5 });
  }

  function start(stop: StopId) {
    if (stop === "launch") return; // The launch layer owns island/rocket construction, not the six station sprites.
    locked.delete(stop);
    jobs.set(stop, { stop, t: 0, fired: new Set() });
  }

  /** The height (0..1 of the machine) the current layer has reached, and which layer. */
  const reveal = (t: number, a: number, b: number) => ease.inOut(span(t, a, b));

  function step(j: Job, dt: number) {
    const t0 = j.t; j.t += dt;
    const t = j.t, stop = j.stop, x = STOP_X[stop], f = feet(stop), h = LOOK[stop].h, w = widthOf(stop);
    for (const st of STAGES) {
      if (t >= STAGE_AT[st] && !j.fired.has(st)) { j.fired.add(st); bus?.emit({ type: "build-stage", stop, stage: st }); }
    }
    const crossed = (at: number) => t0 < at && t >= at;
    if (crossed(STAGE_AT.land)) {
      shakeAmp = Math.max(shakeAmp, reduced ? 0 : 2.5);
      const dx = Math.min(w * 0.4, SLOT - 35);
      puff("dust", x - dx, f - 10, 64, 0.7); puff("dust", x + dx, f - 10, 64, 0.7);
    }
    if (crossed(STAGE_AT.check)) bus?.emit({ type: "station-built", stop });
    if (t >= STAGE_AT.gone) jobs.delete(stop);
  }

  // ---------- drawing ----------
  function drawLocked(stop: StopId) {
    const x = STOP_X[stop], f = feet(stop), w = widthOf(stop);
    const tarp = img("build-tarp");
    if (tarp) put(tarp, x, f + 6, (tarp.height * w * 1.02) / tarp.width);
    drawPlate(stop, x, f + 40, 1, 0);
  }

  function drawPlate(stop: StopId, x: number, y: number, alpha: number, dy: number) {
    const plate = img("build-plate");
    if (!plate || alpha <= 0) return;
    const c = ctx0!, ph = 30, pw = (plate.width * ph) / plate.height, pulse = 0.5 + 0.5 * Math.sin(clock * 2.6);
    c.save();
    c.globalAlpha = alpha;
    c.shadowColor = "rgba(255,190,60,0.9)"; c.shadowBlur = 4 + 10 * pulse;
    c.drawImage(plate, x - pw / 2, y - ph / 2 + dy, pw, ph);
    c.shadowBlur = 0;
    c.fillStyle = "#ffcf5a"; c.font = "11px Silkscreen, monospace"; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(opts.label?.(stop) ?? "CONNECT", x, y + 1 + dy);
    c.restore();
  }

  function drawPlot(j: Job) {
    const t = j.t, x = STOP_X[j.stop], f = feet(j.stop), w = widthOf(j.stop), c = ctx0!;
    if (t >= STAGE_AT.done + 0.4) return;
    const dim = img("build-plot-dim"), glow = img("build-plot-glow");
    const pw = w * 1.3, gk = span(t, STAGE_AT.plot - 0.1, STAGE_AT.plot + 0.35) * (0.8 + 0.2 * Math.sin(t * 9));
    const fade = 1 - span(t, STAGE_AT.burst, STAGE_AT.done + 0.4);
    c.save(); c.globalAlpha = fade;
    if (dim) put(dim, x, f + 22, (dim.height * pw) / dim.width);
    if (glow && gk > 0) { c.globalAlpha = gk * fade; put(glow, x, f + 22, (glow.height * pw * 0.94) / glow.width); }
    c.restore();
  }

  function drawTarpOff(j: Job) {
    const t = j.t, x = STOP_X[j.stop], f = feet(j.stop), w = widthOf(j.stop), c = ctx0!;
    const tarp = img("build-tarp");
    const k = span(t, 0.04, STAGE_AT.plot + 0.2);
    if (tarp && k < 1) {
      const th = (tarp.height * w * 1.02) / tarp.width, shiver = t < 0.08 ? Math.sin(t * 160) * 2 : 0;
      c.save();
      c.globalAlpha = 1 - ease.in(k);
      c.translate(x + shiver + ease.in(k) * 170, f + 6 - ease.out(k) * 150);
      c.rotate(k * 0.55);
      c.scale(1 + k * 0.15, 1 - k * 0.35); // the cloth catches the wind
      c.drawImage(tarp, -(w * 1.02) / 2, -th, w * 1.02, th);
      c.restore();
    }
    const pk = span(t, 0, 0.25);
    if (pk < 1) drawPlate(j.stop, x, f + 40, 1 - pk, ease.in(pk) * 40);
  }

  function drawScaffold(j: Job) {
    const t = j.t, x = STOP_X[j.stop], f = feet(j.stop), h = LOOK[j.stop].h, w = widthOf(j.stop), c = ctx0!;
    const up = ease.out(span(t, STAGE_AT.scaffold, STAGE_AT.scaffold + 0.3)), off = span(t, STAGE_AT.burst - 0.15, STAGE_AT.burst + 0.3);
    if (up <= 0 || off >= 1) return;
    const sc = img("build-scaffold");
    if (!sc) return;
    const sh = Math.min(h * 0.8, (SLOT * 2 * 0.9 * sc.height) / sc.width), sx = x - 12, sink = ease.in(off) * 30; // behind the machine, inside the slot
    c.save(); c.globalAlpha = 1 - off;
    put(sc, sx, f + 4 + sink, sh, [0, up]); // grows up from its feet
    c.restore();
  }

  /** The crane stands right of the plot and swings: left over the machine while it builds, up to lift, back for the top. */
  function drawCrane(j: Job) {
    const t = j.t, x = STOP_X[j.stop], f = feet(j.stop), h = LOOK[j.stop].h, w = widthOf(j.stop), c = ctx0!;
    const up = ease.out(span(t, STAGE_AT.scaffold + 0.05, STAGE_AT.scaffold + 0.35)), off = span(t, STAGE_AT.burst - 0.2, STAGE_AT.burst + 0.35);
    if (up <= 0 || off >= 1) return;
    const swing = t < STAGE_AT.panels ? "up" : t < STAGE_AT.top - 0.35 ? (Math.floor(t * 1.6) % 2 ? "up" : "left") : "left";
    const im = img(`build-crane-${swing}`);
    if (!im) return;
    const ch = Math.min(h * 1.05, (SLOT * 1.3 * im.height) / im.width), cx = x + SLOT - (ch * im.width) / im.height / 2; // base at the slot's right edge
    c.save(); c.globalAlpha = 1 - off;
    put(im, cx, f - 6 + ease.in(off) * 30, ch, [0, up]);
    c.restore();
  }

  function drawMachine(j: Job) {
    const t = j.t, stop = j.stop, x = STOP_X[stop], f = feet(stop), h = LOOK[stop].h, c = ctx0!;
    const s1 = staged(stop, 1), s2 = staged(stop, 2), s3 = staged(stop, 3), s4 = staged(stop, 4), im = idle(stop);
    const H = h * STAGED_SCALE;
    const fUp = reveal(t, STAGE_AT.frame, STAGE_AT.panels - 0.1), pUp = reveal(t, STAGE_AT.panels, STAGE_AT.top - 0.1);
    if (s1 && s2 && s3 && s4) {
      if (t < STAGE_AT.top) {
        put(s1, x, f, H, [0, fUp]);
        if (pUp > 0) put(s2, x, f, H, [0, pUp]);
      } else if (t < STAGE_AT.land) { // the top hangs and lowers into its hole
        const k = span(t, STAGE_AT.top, STAGE_AT.land), bob = Math.sin(k * Math.PI * 3) * 2 * (1 - k);
        c.save(); c.globalAlpha = span(t, STAGE_AT.top, STAGE_AT.top + 0.15); put(s3, x, f + bob, H); c.restore();
        if (k < 0.15) { c.save(); c.globalAlpha = 1 - k / 0.15; put(s2, x, f, H); c.restore(); }
      } else {
        const squash = Math.sin(span(t, STAGE_AT.land, STAGE_AT.land + 0.22) * Math.PI) * 6; // thump
        if (t < STAGE_AT.burst + 0.15) put(s4, x, f, H + 0 - squash);
        else if (im) put(im, x, f, h);
      }
    } else if (im) { // no staged art: the girder cage rises, then the real machine welds on and the top drops in
      if (t < STAGE_AT.top) {
        const cage = img("builder-build-1"); // every machine starts as the same girder cage
        if (cage) put(cage, x, f, h * STAGED_SCALE * Math.min(1, widthOf(stop) / ((cage.width * h * STAGED_SCALE) / cage.height)) * 0.95, [0, fUp]);
        else put(tint(im, "#2b2a2e"), x, f, h, [0, fUp * 0.72]);
        if (pUp > 0) put(im, x, f, h, [0, pUp * 0.72]);
      } else {
        const k = span(t, STAGE_AT.top, STAGE_AT.land), drop = 120 * (1 - ease.in(k));
        const squash = Math.sin(span(t, STAGE_AT.land, STAGE_AT.land + 0.22) * Math.PI) * 5;
        put(im, x, f, h - squash, [0, 0.72]);
        c.save(); c.globalAlpha = span(t, STAGE_AT.top, STAGE_AT.top + 0.2); put(im, x, f - drop, h - squash, [0.72, 1]); c.restore();
      }
    }
    // the flash that hides the swap to the finished sprite
    if (t >= STAGE_AT.burst - 0.05 && t < STAGE_AT.done && im) {
      const k = span(t, STAGE_AT.burst - 0.05, STAGE_AT.done);
      c.save(); c.globalCompositeOperation = "lighter"; c.globalAlpha = (1 - k) * 0.45; put(tint(im, "#ffd77a"), x, f, h); c.restore();
    }
  }

  function drawBurst(j: Job) {
    const t = j.t, x = STOP_X[j.stop], f = feet(j.stop), h = LOOK[j.stop].h, w = widthOf(j.stop), c = ctx0!;
    const k = span(t, STAGE_AT.burst, STAGE_AT.burst + 0.45);
    if (k > 0 && k < 1) {
      const n = Math.min(4, 1 + Math.floor(k * 4)), im = img(`build-burst-${n}`), d = SLOT * 2 * (0.6 + k * 0.4);
      c.save(); c.globalCompositeOperation = "lighter"; c.globalAlpha = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
      if (im) c.drawImage(im, x - d / 2, f - h * 0.5 - d / 2, d, d);
      const g = c.createRadialGradient(x, f - h * 0.5, 0, x, f - h * 0.5, SLOT);
      g.addColorStop(0, `rgba(255,210,110,${0.45 * (1 - k)})`); g.addColorStop(1, "rgba(255,210,110,0)");
      c.fillStyle = g; c.fillRect(x - SLOT, f - h * 0.5 - SLOT, SLOT * 2, SLOT * 2);
      c.restore();
    }
    // warm afterglow on the finished machine
    const im = idle(j.stop), ag = span(t, STAGE_AT.done, STAGE_AT.gone - 0.6);
    if (im && t >= STAGE_AT.done && ag < 1) {
      c.save(); c.globalCompositeOperation = "lighter"; c.globalAlpha = 0.3 * (1 - ag) * (0.7 + 0.3 * Math.sin(t * 7));
      put(tint(im, "#ffc94a"), x, f, h); c.restore();
    }
    drawCheck(j, x + w * 0.36, f - h * 0.82);
  }

  function drawCheck(j: Job, x: number, y: number) {
    const t = j.t - STAGE_AT.check, c = ctx0!;
    const out = span(j.t, STAGE_AT.gone - 0.45, STAGE_AT.gone);
    if (t < 0 || out >= 1) return;
    const frame = t < 0.07 ? 1 : t < 0.2 ? 2 : 3, im = img(`build-check-${frame}`);
    const s = ease.back(span(t, 0, 0.4)) * (1 - ease.in(out)), d = 62 * s;
    if (!im || d <= 0) return;
    c.save();
    c.globalCompositeOperation = "lighter"; // green halo that breathes
    const g = c.createRadialGradient(x, y, 0, x, y, d * 0.95);
    g.addColorStop(0, `rgba(80,230,110,${0.35 + 0.12 * Math.sin(j.t * 6)})`); g.addColorStop(1, "rgba(80,230,110,0)");
    c.fillStyle = g; c.fillRect(x - d, y - d, d * 2, d * 2);
    c.globalCompositeOperation = "source-over";
    c.drawImage(im, x - d / 2, y - d / 2, d, d);
    c.restore();
  }

  function drawFx() {
    const c = ctx0!;
    for (const p of puffs) {
      const n = Math.min(4, 1 + Math.floor((p.t / p.dur) * 4)), im = img(`fx-${p.name}-${n}`);
      if (!im) continue;
      c.save();
      c.globalAlpha = 0.85;
      c.translate(p.x, p.y); if (p.flip) c.scale(-1, 1);
      c.drawImage(im, -p.size / 2, -p.size / 2, p.size, p.size);
      c.restore();
    }
  }

  return {
    update(dt, view) {
      clock += dt;
      shakeAmp *= Math.exp(-dt * 9);
      for (const s of view.stops) {
        if (s.id === "launch") continue;
        const was = seen.get(s.id);
        if (!s.built) jobs.delete(s.id); // removal/replay cancels a construction already in progress
        if (s.locked && !s.built && !jobs.has(s.id)) locked.add(s.id); else if (!s.locked) locked.delete(s.id);
        if (!first && was === false && s.built && !jobs.has(s.id)) start(s.id);
        seen.set(s.id, s.built);
      }
      first = false;
      for (const j of [...jobs.values()]) step(j, dt);
      for (let i = puffs.length - 1; i >= 0; i--) if ((puffs[i].t += dt) >= puffs[i].dur) puffs.splice(i, 1);
    },
    draw(ctx, slot) {
      if (pixel) { // the pixel canvas (?px=1): same timeline, drawn in art px
        const label = (s: StopId) => opts.label?.(s) ?? "CONNECT";
        if (slot === "stations") for (const s of locked) drawLockedPx(ctx, s, label(s));
        for (const j of jobs.values()) drawBuildPx(ctx, j.stop, j.t, slot, label(j.stop));
        return;
      }
      ctx0 = ctx;
      if (slot === "line") { for (const j of jobs.values()) drawPlot(j); return; }
      if (slot === "stations") {
        for (const s of locked) drawLocked(s);
        for (const j of jobs.values()) {
          if (j.t >= STAGE_AT.done) continue;
          drawScaffold(j); drawCrane(j); drawMachine(j); drawTarpOff(j); // scaffold + crane behind the machine
        }
        return;
      }
      for (const j of jobs.values()) drawBurst(j);
      drawFx();
    },
    owns(stop) {
      const j = jobs.get(stop.id);
      return locked.has(stop.id) || (!!j && j.t < STAGE_AT.done);
    },
    start,
    progress(stop) { const j = jobs.get(stop); return j && j.t < STAGE_AT.done ? j.t / STAGE_AT.done : null; },
    shake: () => shakeAmp,
    shippyAct() {
      let best: Job | null = null;
      for (const j of jobs.values()) if (j.t < STAGE_AT.done + 1 && (!best || j.t < best.t)) best = j;
      if (!best) return null;
      const t = best.t;
      return { at: best.stop, pose: t < STAGE_AT.frame ? "carry" : t < STAGE_AT.burst ? "weld" : "happy" };
    },
  };
}
