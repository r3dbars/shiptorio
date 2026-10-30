// Feel test (thread "Pick the best jam clear and rocket launch", 2026-10-30): five timings each for two moments, picked
// with ?feel=jamA..jamE or ?feel=rocketA..rocketE. Numbers only: no new art, no new effects. A is today's feel, so
// with no ?feel (or A) nothing changes. Once Justin picks one, its numbers become the defaults and this flag goes.
//   jam     the pile at Review clearing after the swipe (/deck.html, story/index.ts approve)
//   rocket  the tour's Ship it: lever, ride, settle, countdown, ignition, climb (story/ship.ts, engine rocket, launch/flight.ts)

export interface JamFeel {
  hold: number; // seconds after the swipe before Review lets the first crate go (anticipation: the card leaves, a beat, then go)
  svc: number; // seconds between released crates leaving Review
  batch: number; // share of the pile one yes releases (at least 3)
  speed: number; // belt speed, x today's
  breath: number; // the beacon's breath, radians per second (the one pulse on the deck)
}

export interface RocketFeel {
  lever: number; // Shippy on the Gate's lever before the crate moves
  settle: number; // the crate sits on the pad before the countdown
  count: number; // countdown on the pad before ignition
  ignition: number; // flame on, still on the pad
  ascent: number; // seconds of the climb out of frame
  curve: number; // climb easing: y = u^curve (higher = slower off the pad, then rips)
  shake: number; // camera shake during ignition, whole art px (0 = none)
}

export const JAM: Record<string, JamFeel> = {
  A: { hold: 0, svc: 0.25, batch: 0.6, speed: 1, breath: 2.4 },
  B: { hold: 0.35, svc: 0.25, batch: 0.6, speed: 1, breath: 2.4 },
  C: { hold: 0, svc: 0.12, batch: 0.6, speed: 1.4, breath: 2.4 },
  D: { hold: 0.2, svc: 0.45, batch: 0.6, speed: 0.85, breath: 2.4 },
  E: { hold: 0.5, svc: 0.18, batch: 1, speed: 1.2, breath: 1.6 },
};

export const ROCKET: Record<string, RocketFeel> = {
  A: { lever: 0.9, settle: 0.5, count: 0.6, ignition: 1.4, ascent: 5.5, curve: 2, shake: 0 },
  B: { lever: 0.9, settle: 0.8, count: 1.0, ignition: 1.8, ascent: 5.5, curve: 2.6, shake: 0 },
  C: { lever: 0.6, settle: 0.3, count: 0.3, ignition: 0.8, ascent: 3.5, curve: 2, shake: 0 },
  D: { lever: 0.9, settle: 0.5, count: 0.6, ignition: 1.6, ascent: 6.5, curve: 3, shake: 1 },
  E: { lever: 0.8, settle: 0.6, count: 0.8, ignition: 1.2, ascent: 4, curve: 1.6, shake: 2 },
};

/** The ?feel flag: { jam, rocket } presets, A for whichever moment it doesn't name. */
export function feelOf(search = globalThis.location?.search ?? "") {
  const m = /^(jam|rocket)([A-E])$/.exec(new URLSearchParams(search).get("feel") ?? "");
  return { jam: JAM[m?.[1] === "jam" ? m[2] : "A"], rocket: ROCKET[m?.[1] === "rocket" ? m[2] : "A"] };
}

export const FEEL = feelOf();
