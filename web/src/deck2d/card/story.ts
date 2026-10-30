// Shippy inside the iron card (a story card: CardView.shippy). He stands on the left of the plate and tells the story
// one card at a time, at the player's pace. Same code-drawn frames as the deck (shippy/pixel.ts), drawn at art
// resolution on a tiny canvas the CSS blows up at a whole-number scale, so he stays crisp next to the words.
//
// While his line is typing he moves (talks, waves or points). Once it is done he settles: a blink every few
// seconds, and the wave or point comes back now and then. Reduced motion: one still frame.

import { PALETTE } from "../contract";
import { drawPx, type PxFrame } from "../shippy/pixel";

export type StoryPose = "talk" | "wave" | "point" | "happy";

// canvas in art px: a little bay in the plate, wide enough for the pointing arm, tall enough for the talk hop
export const STORY_W = 30;
export const STORY_H = 24;
const FEET_X = 12, FEET_Y = STORY_H - 3; // where his feet sit: on the bay's floor plate
const TICK_MS = 140;
const CHARS_PER_SEC = 55; // 2026-10-30: faster, so the tour stays under two minutes

const still = () => {
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

// Quiet Shippy is never a statue (Justin 2026-10-30: "constantly moving or blinking in small subtle ways... if somebody
// stays on the screen, move around in creative little ways"). Once his line is typed he breathes and blinks, and every
// IDLE_LOOP ticks (~17s) runs a little routine: looks around, wanders a step and back, hops, waves.
const IDLE_LOOP = 120;
const WANDER = [0, 1, 1, 2, 2, 3, 3, 3, 2, 2, 1, 1, 0, 0, 0, 0]; // art px to the right, one per tick

/** The frame for a pose at tick t. talking = his line is still typing out. Pure, so tests can walk it. */
export function storyFrame(pose: StoryPose, t: number, talking: boolean): { frame: PxFrame; dy: number; dx: number } {
  if (talking) {
    if (pose === "wave") return { frame: Math.floor(t / 2) % 2 ? "wave1" : "wave0", dy: 0, dx: 0 };
    if (pose === "point") return { frame: Math.floor(t / 2) % 2 ? "point1" : "point0", dy: 0, dx: 0 };
    if (pose === "happy") return { frame: "happy", dy: t % 4 < 2 ? -1 : 0, dx: 0 };
    return { frame: Math.floor(t / 2) % 2 ? "talk1" : "talk0", dy: 0, dx: 0 };
  }
  const k = t % IDLE_LOOP;
  // the routines
  if (k >= 30 && k < 42) return { frame: Math.floor(k / 3) % 2 ? "inspect1" : "inspect0", dy: 0, dx: 0 }; // looks around
  if (k >= 60 && k < 76) { const i = k - 60; return { frame: WANDER[i] === WANDER[i - 1] && i > 11 ? "idle0" : `walk${(i % 6) as 0 | 1 | 2 | 3 | 4 | 5}`, dy: 0, dx: WANDER[i] }; } // a step out and back
  if (k >= 90 && k < 96) return { frame: "happy", dy: [0, -1, -2, -2, -1, 0][k - 90], dx: 0 }; // a little hop
  if (k >= 98 && k < 106) return { frame: Math.floor(k / 2) % 2 ? "wave1" : "wave0", dy: 0, dx: 0 }; // a wave
  // resting in his pose: breathing (a 1 px bob, slow) and blinking, now and then twice
  const blink = t % 26 === 25 || t % 61 === 7 || t % 61 === 9;
  const dy = t % 22 < 11 ? 0 : -1;
  if (blink) return { frame: "idle1", dy, dx: 0 };
  if (pose === "wave") return { frame: "wave0", dy, dx: 0 };
  if (pose === "point") return { frame: t % 40 < 4 ? "point1" : "point0", dy, dx: 0 };
  if (pose === "happy") return { frame: "happy", dy, dx: 0 };
  return { frame: "idle0", dy, dx: 0 };
}

/**
 * The bay he stands in: a recessed steel alcove a shade lighter than the plate face, so his dark box reads against it.
 * Soot outline, the lit edges top and right (light from the upper right), a floor plate, brass rivets as jewelry.
 */
function bay(c: CanvasRenderingContext2D) {
  const { soot, steel, brass } = PALETTE;
  const px = (color: string, x: number, y: number, w = 1, h = 1) => { c.fillStyle = color; c.fillRect(x, y, w, h); };
  const W = STORY_W, H = STORY_H;
  px(soot[0], 0, 0, W, H);
  px(steel[1], 1, 1, W - 2, H - 2);
  px(steel[0], 1, 1, W - 2, 1); // the lip's shadow along the top inside
  px(steel[0], 1, 1, 1, H - 2); // and down the left
  px(steel[2], W - 2, 2, 1, H - 4); // the right wall catches the light
  // floor plate: lit top edge, dark face, a seam
  px(steel[3], 1, FEET_Y, W - 2, 1);
  px(steel[2], 1, FEET_Y + 1, W - 2, H - FEET_Y - 2);
  px(steel[1], 9, FEET_Y + 1, 1, H - FEET_Y - 2);
  px(steel[1], 21, FEET_Y + 1, 1, H - FEET_Y - 2);
  for (const [x, y] of [[2, 2], [W - 4, 2]]) { px(brass[2], x, y, 2, 2); px(brass[5], x + 1, y); px(brass[1], x, y + 1); }
}

/** How many characters of a line show after ms of typing. */
export const typedChars = (text: string, ms: number) => Math.min(text.length, Math.floor((ms / 1000) * CHARS_PER_SEC));

export interface StoryShippy {
  canvas: HTMLCanvasElement;
  setPose(pose: StoryPose): void;
  /** Type a line into el; Shippy talks until it is done. Same text again keeps going. */
  say(el: HTMLElement, text: string): void;
  /** true while the line is still typing */
  typing(): boolean;
  /** Show the whole line now (the first tap on a typing card). */
  finish(): void;
  /** Stop all timers; the canvas stays so the card can fly off with him on it. */
  stop(): void;
}

export function mountStoryShippy(host: HTMLElement, pose: StoryPose): StoryShippy {
  const canvas = document.createElement("canvas");
  canvas.className = "ic-story-shippy";
  canvas.width = STORY_W;
  canvas.height = STORY_H;
  canvas.setAttribute("aria-hidden", "true");
  host.prepend(canvas);
  const ctx = canvas.getContext("2d");
  let t = 0;
  let line: { el: HTMLElement; text: string; start: number; done: boolean } | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;

  const paint = () => {
    if (!ctx) return;
    const talking = !!line && !line.done;
    const { frame, dy, dx } = storyFrame(pose, still() ? 0 : t, talking && !still());
    bay(ctx);
    drawPx(ctx, frame, FEET_X + dx, FEET_Y + dy, 1);
  };
  // The whole line is laid out from the first letter: the part still to come is there but invisible, so the words never
  // re-wrap or jump while they type in (Justin 2026-10-30: "it jitters around").
  const typeStep = () => {
    if (!line || line.done) return;
    const n = still() ? line.text.length : typedChars(line.text, performance.now() - line.start);
    show(line, n);
    if (n >= line.text.length) line.done = true;
  };
  const show = (l: NonNullable<typeof line>, n: number) => {
    if (n >= l.text.length) { l.el.textContent = l.text; return; }
    const typed = document.createElement("span"), rest = document.createElement("span");
    typed.textContent = l.text.slice(0, n);
    rest.textContent = l.text.slice(n);
    rest.className = "ic-untyped";
    l.el.replaceChildren(typed, rest);
  };
  // while the line types out the timer runs fast for the letters; t (his frames) still only steps every TICK_MS
  let last = performance.now();
  const tick = () => {
    const typing = !!line && !line.done;
    typeStep();
    const now = performance.now();
    if (now - last >= TICK_MS - 5) { last = now; t++; paint(); }
    if (typing && line?.done) start(); // done typing: back to the slow tick
  };
  const start = () => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    paint();
    if (!document.hidden) timer = setInterval(tick, line && !line.done ? 35 : TICK_MS);
  };
  const onVis = () => start();
  document.addEventListener("visibilitychange", onVis);
  start();

  return {
    canvas,
    setPose(p) { if (p !== pose) { pose = p; paint(); } },
    say(el, text) {
      if (line && line.el === el && line.text === text) return;
      line = { el, text, start: performance.now(), done: false };
      show(line, 0);
      typeStep();
      start();
    },
    typing: () => !!line && !line.done,
    finish() {
      if (!line || line.done) return;
      line.el.textContent = line.text;
      line.done = true;
      start();
    },
    stop() {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
      document.removeEventListener("visibilitychange", onVis);
      if (line && !line.done) { line.el.textContent = line.text; line.done = true; }
      paint();
    },
  };
}
