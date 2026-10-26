// The ship celebration. When a PR launches, web fires one window event that the art and the
// sound both hang off, so the rocket, the green check and the fanfare land together.
//
//   window.addEventListener("shiptorio:ship", (e) => e.detail) // ShipEvent, at t = 0
//
// SHIP_TIMING is measured from that event: countdown pips, ignition, then the "shipped!" sting
// right when the check should pop in, and the streak chime just after it.

import type { Item } from "@shiptorio/shared";
import { sound } from "./engine";

export const SHIP_EVENT = "shiptorio:ship";
export const SHIP_TIMING = { ignitionMs: 700, checkMs: 2200, doneMs: 3400 } as const;
const STREAK_GAP_MS = 15 * 60_000; // ships within 15 minutes of each other keep the streak going

export interface ShipEvent {
  itemId: string;
  title: string;
  prNumber?: number;
  streak: number; // every ship within 15 min of the last one counts; 1 for a lone ship. Scars don't reset it: shipping is always good
  firstTry: boolean; // no scars, it went through the gauntlet clean
}

let streak = 0;
let lastShip = 0;

export function celebrateShip(item: Item, delay = 0) {
  const now = Date.now();
  streak = now - lastShip < STREAK_GAP_MS ? streak + 1 : 1;
  lastShip = now;
  const detail: ShipEvent = { itemId: item.id, title: item.title, prNumber: item.prNumber, streak, firstTry: !item.scars?.length };
  window.dispatchEvent(new CustomEvent<ShipEvent>(SHIP_EVENT, { detail }));
  sound.play("launch", delay);
  sound.musicResolve(delay);
  sound.play("shipped", delay + SHIP_TIMING.checkMs / 1000);
  sound.streak(streak, delay + SHIP_TIMING.checkMs / 1000 + 0.75);
}
