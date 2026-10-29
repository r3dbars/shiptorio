import { ART_PX } from "../contract";

/** Stop approaching cargo at a blocked bay; resume from that point when it clears. */
export function advanceBeltDistance(from: number, to: number, distance: number, blocked: (at: number) => boolean) {
  const next = Math.min(to, from + distance);
  for (let at = from; at < next; at += ART_PX) if (blocked(at)) return at;
  return blocked(next) ? Math.max(from, next - ART_PX) : next;
}
