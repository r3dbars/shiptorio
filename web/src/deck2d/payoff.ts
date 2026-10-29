import type { CardView, DeckEvent, DeckView } from "./contract";

// The win after a ship: the rocket goes, then one calm beat ("Shipped. That's 3 today.") before the next card.
// It only wraps the view the page already draws: it holds the card back and swaps the caption, nothing else moves.
//
//   live / replay  every ship gets a beat. After a held Ship it, the next card also waits for that ship (up to 20s),
//                  so it doesn't pop up while the merge is still landing.
//   story / demo   crates ship all the time there, so only the first ship after each yes gets a beat, and only
//                  while the story is in its swipe phase (the level-up climax keeps its own captions).

export const PAYOFF = {
  afterLaunch: 2.0, // ignition, then the rocket clears the pad, then the words
  noRocket: 2.5, // no launch event (no island yet, or a rocket still in the air): show it anyway after this
  beat: 3.0, // how long the line stays up, card held
  waitForShip: 20, // most a held Ship it keeps the next card back while the merge lands
} as const;

export const payoffLine = (today: number) => today <= 1 ? "Shipped. That's your first today." : `Shipped. That's ${today} today.`;

export interface PayoffStore { get(key: string): string | null; set(key: string, value: string): void }
export interface PayoffOptions {
  every: boolean; // live/replay: every ship gets a beat
  phase?: () => string; // the story's phase, when the source is the story
  store?: PayoffStore | null; // live: count today's ships across visits
  day?: () => string;
}

const KEY = "shiptorio.deck.shippedToday";
const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

export function createPayoff(o: PayoffOptions) {
  const day = o.day ?? localDay;
  let last: number | null = null, lastCard: CardView | null = null;
  let armed = o.every, waitT = 0; // waitT > 0: a held Ship it is waiting for its ship
  let mode: "idle" | "lift" | "away" | "beat" = "idle", t = 0;
  let session = 0, line = ""; // the line is fixed when the beat starts, so the number never ticks while it reads

  const read = () => {
    try { const v = JSON.parse(o.store?.get(KEY) ?? "null"); return v?.day === day() ? Number(v.n) || 0 : 0; } catch { return 0; }
  };
  const today = () => o.store ? read() : session;
  const count = (n: number) => {
    session += n;
    if (!o.store) return;
    try { o.store.set(KEY, JSON.stringify({ day: day(), n: read() + n })); } catch { /* private mode: session count is fine */ }
  };

  return {
    event(e: DeckEvent) {
      if (e.type === "approve") {
        if (!o.every) armed = true;
        if (lastCard && lastCard.id === e.cardId && lastCard.hold) waitT = PAYOFF.waitForShip;
      }
      if (e.type === "launch" && mode === "lift") { mode = "away"; t = 0; }
    },
    view(v: DeckView, dt: number): DeckView {
      if (v.card) lastCard = v.card;
      const shipped = v.shipped ?? 0;
      const delta = last == null ? 0 : shipped - last;
      last = shipped;
      if (delta > 0) {
        count(delta);
        const quiet = o.phase ? o.phase() !== "swipe" : false;
        if (armed && !quiet && mode === "idle") { mode = "lift"; t = 0; }
        if (!o.every) armed = false;
        waitT = 0;
      }
      if (waitT > 0) waitT = Math.max(0, waitT - dt);
      if (mode === "lift") { t += dt; if (t >= PAYOFF.noRocket) { mode = "beat"; t = 0; line = payoffLine(today()); } }
      else if (mode === "away") { t += dt; if (t >= PAYOFF.afterLaunch) { mode = "beat"; t = 0; line = payoffLine(today()); } }
      else if (mode === "beat") { t += dt; if (t >= PAYOFF.beat) mode = "idle"; }
      if (mode === "beat") return { ...v, card: null, caption: line };
      if (mode !== "idle" || waitT > 0) return { ...v, card: null };
      return v;
    },
    get active() { return mode !== "idle"; },
  };
}
