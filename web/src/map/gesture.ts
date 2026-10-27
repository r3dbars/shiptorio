// What a finger or mouse lifting off the map does: a tap picks, a one-finger drag settles the view (a phone snaps
// to the nearest floor), anything else does nothing. A pinch is the player framing the view on purpose, so it never
// snaps, and a cancelled pointer (the OS took the gesture) never acts.

export type Release = "pick" | "settle" | "none";

export function releaseAction(g: { last: boolean; moved: number; multi: boolean; cancelled: boolean }): Release {
  if (!g.last || g.cancelled) return "none";
  if (g.moved < 8) return "pick";
  return g.multi ? "none" : "settle";
}
