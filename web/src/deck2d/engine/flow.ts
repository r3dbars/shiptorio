import { ART_PX, STOPS, STOP_X } from "../contract";

/** Connection ownership changes at machines, never halfway along an exposed belt. */
export function beltConnectionAt(x: number) {
  return STOPS.find((id, i) => i === STOPS.length - 1 || x < STOP_X[STOPS[i + 1]])!;
}

/** Stop approaching cargo at a blocked bay; resume from that point when it clears. */
export function advanceBeltDistance(from: number, to: number, distance: number, blocked: (at: number) => boolean) {
  const next = Math.min(to, from + distance);
  for (let at = from; at < next; at += ART_PX) if (blocked(at)) return at;
  return blocked(next) ? Math.max(from, next - ART_PX) : next;
}
