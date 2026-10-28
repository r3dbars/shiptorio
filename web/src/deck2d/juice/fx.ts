// Small visual juice for the 2D deck. Each helper drops a short-lived element into a host you pass in (the deck's
// positioned container, over the canvas), animates it with the Web Animations API, and cleans up after itself.
// x/y are CSS pixels inside the host. Calm by default: routine effects are small and quick; only launch and
// automated get a big moment. Reduced motion keeps the information (a flash, the stamp) and drops the movement.
// The pure functions (shakeOffset, driftX) are there for a canvas renderer that wants to draw the same thing itself.

import "./juice.css";

export const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function spawn(host: HTMLElement, cls: string, x: number, y: number): HTMLElement {
  const el = document.createElement("div");
  el.className = `djuice ${cls}`;
  el.setAttribute("aria-hidden", "true");
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  host.appendChild(el);
  return el;
}

function run(el: HTMLElement, frames: Keyframe[], o: KeyframeAnimationOptions): Promise<void> {
  const a = el.animate(frames, { fill: "forwards", ...o });
  return a.finished.then(() => el.remove(), () => el.remove());
}

// ---- shake -------------------------------------------------------------------------------------------------

/** A decaying shake at time t (seconds) into it: [dx, dy] in px. Zero once it's over. */
export function shakeOffset(t: number, strength = 5, seconds = 0.4): [number, number] {
  if (t < 0 || t >= seconds) return [0, 0];
  const k = strength * (1 - t / seconds) ** 2;
  return [Math.round(Math.sin(t * 71) * k), Math.round(Math.cos(t * 53) * k * 0.6)];
}

/** Shake an element (a jam: small; launch: bigger). */
export function shake(el: HTMLElement, strength = 5, ms = 400): Promise<void> {
  if (reducedMotion()) return Promise.resolve();
  const frames: Keyframe[] = [];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const [dx, dy] = shakeOffset((i / n) * (ms / 1000) * 0.999, strength, ms / 1000);
    frames.push({ transform: `translate(${dx}px, ${dy}px)` });
  }
  frames[n] = { transform: "translate(0, 0)" };
  return el.animate(frames, { duration: ms, easing: "linear" }).finished.then(() => {}, () => {});
}

// ---- sparks ------------------------------------------------------------------------------------------------

export type BurstColor = "gold" | "green" | "red" | "cyan";

/** Pixel sparks flying out from a point: a station finishing its build, Shippy's happy hop. */
export function burst(host: HTMLElement, x: number, y: number, o: { color?: BurstColor; count?: number; reach?: number } = {}): Promise<void> {
  const color = o.color ?? "gold";
  if (reducedMotion()) return run(spawn(host, `djuice-flash djuice-${color}`, x, y), [{ opacity: 0.9 }, { opacity: 0 }], { duration: 360 });
  const count = o.count ?? 14;
  const reach = o.reach ?? 46;
  const done: Promise<void>[] = [];
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + rand(-0.25, 0.25);
    const d = reach * rand(0.55, 1);
    const dx = Math.cos(ang) * d;
    const dy = Math.sin(ang) * d - reach * 0.25; // a little lift, sparks rise before they fall
    const el = spawn(host, `djuice-spark djuice-${color}`, x, y);
    done.push(run(el, [
      { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.9)`, opacity: 1, offset: 0.7 },
      { transform: `translate(calc(-50% + ${dx * 1.1}px), calc(-50% + ${dy + 14}px)) scale(0.4)`, opacity: 0 },
    ], { duration: rand(420, 620), easing: "cubic-bezier(.2,.7,.3,1)" }));
  }
  return Promise.all(done).then(() => {});
}

// ---- steam -------------------------------------------------------------------------------------------------

/** One soft puff rising from a pipe. */
export function steamPuff(host: HTMLElement, x: number, y: number, size = 14): Promise<void> {
  const el = spawn(host, "djuice-steam", x, y);
  el.style.width = el.style.height = `${size}px`;
  if (reducedMotion()) return run(el, [{ opacity: 0.5 }, { opacity: 0 }], { duration: 900 });
  const drift = rand(-8, 10);
  return run(el, [
    { transform: "translate(-50%, -50%) scale(0.5)", opacity: 0 },
    { transform: `translate(calc(-50% + ${drift * 0.4}px), calc(-50% - 10px)) scale(1)`, opacity: 0.55, offset: 0.25 },
    { transform: `translate(calc(-50% + ${drift}px), calc(-50% - 34px)) scale(1.9)`, opacity: 0 },
  ], { duration: rand(1500, 2100), easing: "ease-out" });
}

/** Lazy steam from the deck's pipes: one puff from a random vent every few seconds. Returns stop(). */
export function steamVents(host: HTMLElement, vents: { x: number; y: number }[], everyMs = 2600): () => void {
  if (!vents.length) return () => {};
  let timer: number | undefined;
  const tick = () => {
    if (!document.hidden) {
      const v = vents[Math.floor(Math.random() * vents.length)];
      void steamPuff(host, v.x, v.y);
    }
    timer = window.setTimeout(tick, everyMs * rand(0.6, 1.4));
  };
  timer = window.setTimeout(tick, rand(200, everyMs));
  return () => window.clearTimeout(timer);
}

// ---- parallax ----------------------------------------------------------------------------------------------

/** How far a layer has drifted after t seconds, wrapped to one tile so it loops forever. */
export function driftX(t: number, pxPerSecond: number, tileWidth: number): number {
  if (tileWidth <= 0) return 0;
  return -((t * pxPerSecond) % tileWidth);
}

export interface DriftLayer {
  el: HTMLElement;
  /** px per second; clouds ~6, skyline ~2. Slow is the point. */
  speed: number;
  /** Width of one repeat. The element should hold two copies side by side (or a repeat-x background). */
  tile: number;
}

/** Slow cloud/skyline drift. Moves each layer with a transform, pauses when the tab is hidden. Returns stop(). */
export function startDrift(layers: DriftLayer[]): () => void {
  if (reducedMotion() || !layers.length) return () => {};
  let raf = 0;
  let t = 0;
  let last = performance.now();
  const frame = (now: number) => {
    t += Math.min(0.1, (now - last) / 1000); // a long pause doesn't jump the sky
    last = now;
    for (const l of layers) l.el.style.transform = `translate3d(${driftX(t, l.speed, l.tile).toFixed(2)}px, 0, 0)`;
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

// ---- the big moments ---------------------------------------------------------------------------------------

/** Green AUTOMATED stamp slamming onto the deck, then fading. The stamp stays readable with reduced motion. */
export function stampAutomated(host: HTMLElement, o: { x?: number; y?: number; text?: string; holdMs?: number } = {}): Promise<void> {
  const x = o.x ?? host.clientWidth / 2;
  const y = o.y ?? host.clientHeight * 0.4;
  const el = spawn(host, "djuice-stamp", x, y);
  el.textContent = o.text ?? "AUTOMATED";
  el.setAttribute("role", "status");
  el.removeAttribute("aria-hidden");
  // keep the whole stamp on screen when the station is near an edge
  const half = el.offsetWidth / 2 + 8;
  if (host.clientWidth > half * 2) el.style.left = `${Math.min(host.clientWidth - half, Math.max(half, x))}px`;
  const hold = o.holdMs ?? 1600;
  const total = 260 + hold + 500;
  const at = (ms: number) => ms / total;
  if (reducedMotion()) {
    return run(el, [
      { transform: "translate(-50%, -50%) rotate(-8deg)", opacity: 0 },
      { opacity: 1, offset: at(200) },
      { opacity: 1, offset: at(260 + hold) },
      { transform: "translate(-50%, -50%) rotate(-8deg)", opacity: 0 },
    ], { duration: total });
  }
  void shake(host, 4, 260);
  void burst(host, x, y, { color: "green", count: 18, reach: 70 });
  return run(el, [
    { transform: "translate(-50%, -50%) rotate(-14deg) scale(2.6)", opacity: 0 },
    { transform: "translate(-50%, -50%) rotate(-8deg) scale(0.92)", opacity: 1, offset: at(180), easing: "ease-out" },
    { transform: "translate(-50%, -50%) rotate(-8deg) scale(1)", opacity: 1, offset: at(260) },
    { transform: "translate(-50%, -50%) rotate(-8deg) scale(1)", opacity: 1, offset: at(260 + hold) },
    { transform: "translate(-50%, -60%) rotate(-8deg) scale(1.04)", opacity: 0 },
  ], { duration: total, easing: "cubic-bezier(.3,1.4,.5,1)" });
}

export const LAUNCH_MS = 2400;

/**
 * How far up the rocket is at t (0..1 of LAUNCH_MS), as 0..1 of its whole climb: a beat of rumble on the pad, then
 * it climbs, slow and then fast. The engine moves the rocket sprite with this so it rides the flame and smoke below.
 */
export function launchRise(t: number): number {
  const HOLD = 0.25;
  if (t <= HOLD) return 0;
  const k = Math.min(1, (t - HOLD) / (1 - HOLD));
  return k * k * k;
}

export interface LaunchOpts {
  /** Justin's flame sprite (contract art("flame")). Without it the flame is drawn in CSS. */
  flameSrc?: string;
  /** Flame size in CSS px. */
  flameW?: number;
  flameH?: number;
  /** How far the rocket climbs, px. Default: out the top of the host. */
  climb?: number;
  ms?: number;
}

/**
 * Liftoff, seen from below: flame under the rocket's nozzle at (x, y) on the host, a rumble, then flame and a smoke
 * trail climb out of frame on the launchRise curve. The rocket itself is the engine's to draw.
 */
export function launchPlume(host: HTMLElement, x: number, y: number, o: LaunchOpts = {}): Promise<void> {
  const ms = o.ms ?? LAUNCH_MS;
  const climb = o.climb ?? y + 120;
  const reduce = reducedMotion();
  const flame = document.createElement(o.flameSrc ? "img" : "div");
  flame.className = "djuice djuice-flame";
  flame.setAttribute("aria-hidden", "true");
  if (o.flameSrc) (flame as HTMLImageElement).src = o.flameSrc;
  flame.style.width = `${o.flameW ?? 28}px`;
  flame.style.height = `${o.flameH ?? 46}px`;
  flame.style.left = `${x}px`;
  host.appendChild(flame);
  const flicker = flame.animate(
    [{ transform: "translateX(-50%) scaleY(0.85)" }, { transform: "translateX(-50%) scaleY(1.15)" }, { transform: "translateX(-50%) scaleY(0.95)" }],
    { duration: 140, iterations: Infinity, direction: "alternate" },
  );
  if (!reduce) void shake(host, 6, 700);
  return new Promise<void>((resolve) => {
    const t0 = performance.now();
    let lastPuff = 0;
    const frame = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      const ny = y - (reduce ? 0 : launchRise(t) * climb);
      flame.style.top = `${ny}px`;
      if (reduce) flame.style.opacity = String(1 - t);
      if (now - lastPuff > (reduce ? 500 : 80)) {
        lastPuff = now;
        // on the pad the smoke billows sideways; in flight it trails straight down
        const spread = t < 0.3 ? rand(-26, 26) : rand(-4, 4);
        void steamPuff(host, x + spread, ny + 10, rand(14, t < 0.3 ? 30 : 22));
      }
      if (t < 1) requestAnimationFrame(frame);
      else {
        flicker.cancel();
        flame.remove();
        resolve();
      }
    };
    requestAnimationFrame(frame);
  });
}
