// "While you were gone": back on the live deck after a few hours, one card says what really shipped and what's
// waiting, then gets out of the way. Real events only (launched items whose launch time falls inside the gap); with
// nothing shipped and nothing waiting there is nothing to say, so no card. One per visit.

import type { FactoryState, Item } from "@shiptorio/shared";
import type { DeckView } from "../contract";

export const AWAY_MS = 3 * 3600_000; // a gap this long counts as coming back
export const AWAY_CARD = "away";
const KEY = "shiptorio:deck-last-seen";
const SEEN_EVERY_MS = 60_000;
const UNIT: Record<string, number> = { m: 60_000, h: 3600_000, d: 86_400_000 };

/** ?away=12 (hours), ?away=90m, ?away=2d: pretend the last visit was that long ago, for shots and rehearsals. */
export function parseAway(v: string | null): number | null {
  const m = v && /^(\d+(?:\.\d+)?)([mhd]?)$/.exec(v.trim());
  if (!m) return null;
  const ms = Number(m[1]) * UNIT[m[2] || "h"];
  return ms > 0 ? ms : null;
}

/** When the player was last here, if it was long enough ago to count as coming back. */
export function awaySince(search: string, stored: number | null, now: number): number | null {
  const q = new URLSearchParams(search);
  if (q.has("away")) {
    const ms = parseAway(q.get("away"));
    return ms === null ? null : now - ms;
  }
  return stored !== null && now - stored >= AWAY_MS ? stored : null;
}

const shippedAt = (i: Item) => i.orbit?.since ?? i.updatedAt;

/** The words on the card, or null when nothing happened and nothing waits. */
export function awayCard(s: FactoryState, since: number, now: number): { title: string; line: string } | null {
  const shipped = s.items.filter(i => i.state === "launched" && shippedAt(i) > since && shippedAt(i) <= now);
  const waiting = (s.deck?.length ? s.deck : s.move ? [s.move] : []).length;
  if (!shipped.length && !waiting) return null;
  const title = shipped.length === 1 ? `While you were gone: ${shipped[0].prNumber ? `PR${shipped[0].prNumber}` : shipped[0].title} shipped.`
    : shipped.length ? `While you were gone: ${shipped.length} shipped.` : "Welcome back.";
  const line = waiting === 1 ? "1 thing is waiting on you." : waiting ? `${waiting} things are waiting on you.` : "Nothing is waiting on you. All clear.";
  return { title, line };
}

type Store = { get(): number | null; set(at: number): void };
const local = (scope: string): Store => ({
  get() { try { const n = Number(localStorage.getItem(`${KEY}:${scope}`)); return Number.isFinite(n) && n > 0 ? n : null; } catch { return null; } },
  set(at) { try { localStorage.setItem(`${KEY}:${scope}`, String(at)); } catch { /* private window: every visit is a first visit */ } },
});

/** Wraps the live deck view. The away card goes first, before any real decision; either button just dismisses it. */
export function createAway(o: { scope: string; search: string; state: () => FactoryState | null; now?: () => number; store?: Store }) {
  const now = o.now ?? Date.now, store = o.store ?? local(o.scope);
  const since = awaySince(o.search, store.get(), now());
  let card: { title: string; line: string } | null = null;
  let decided = false, dismissed = false, seenAt = 0;
  return {
    /** True when the id was the away card (the caller then sends nothing to the factory). */
    answer(id: string): boolean {
      if (id !== AWAY_CARD) return false;
      dismissed = true;
      return true;
    },
    view(base: DeckView): DeckView {
      const t = now(), s = o.state();
      if (!s) return base;
      if (!decided) { decided = true; card = since === null ? null : awayCard(s, since, t); }
      // Only mark the visit once the factory has loaded, so a page that never connects can't hide the next comeback.
      if (t - seenAt >= SEEN_EVERY_MS) { seenAt = t; store.set(t); }
      if (!card || dismissed) return base;
      return { ...base, card: { id: AWAY_CARD, title: card.title, line: card.line, dots: null, stop: base.card?.stop ?? "repo", yes: base.card ? "Show me" : "Got it", no: "Close" },
        shippy: base.card ? { at: base.card.stop, pose: "happy" } : base.shippy };
    },
  };
}
