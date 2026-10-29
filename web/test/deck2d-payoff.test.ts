import { expect, test } from "bun:test";
import { PAYOFF, createPayoff, payoffLine } from "../src/deck2d/payoff";
import type { CardView, DeckView } from "../src/deck2d/contract";

const card = (id: string, hold = false): CardView => ({ id, title: id, dots: null, line: "", stop: "launch", hold });
const view = (shipped: number, c: CardView | null = null, caption: string | null = null) =>
  ({ stops: [], jam: null, card: c, shippy: { at: "corner", pose: "idle" }, shipped, caption }) as DeckView;
const run = (p: ReturnType<typeof createPayoff>, v: DeckView, seconds: number) => { let out = p.view(v, 0); for (let t = 0; t < seconds; t += 0.05) out = p.view(v, 0.05); return out; };

test("live: a ship holds the next card, waits for the rocket, then shows one calm line", () => {
  const p = createPayoff({ every: true });
  p.view(view(2), 0); // baseline: earlier ships aren't today's beat
  expect(p.view(view(3, card("next")), 0).card).toBeNull();
  expect(run(p, view(3, card("next")), PAYOFF.noRocket - 0.2).caption).toBeNull(); // rocket counting down: no words yet
  p.event({ type: "launch" });
  expect(run(p, view(3, card("next")), PAYOFF.afterLaunch - 0.2).card).toBeNull();
  const beat = run(p, view(3, card("next")), 0.4);
  expect(beat.caption).toBe(payoffLine(1));
  expect(beat.card).toBeNull();
  expect(run(p, view(3, card("next")), PAYOFF.beat).card?.id).toBe("next"); // then the next card comes back
});

test("no rocket on screen: the beat still lands", () => {
  const p = createPayoff({ every: true });
  p.view(view(0), 0); p.view(view(1), 0);
  expect(run(p, view(1), PAYOFF.noRocket + 0.1).caption).toBe(payoffLine(1));
});

test("a held Ship it keeps the next card back until its ship lands", () => {
  const p = createPayoff({ every: true });
  p.view(view(0, card("ship", true)), 0);
  p.event({ type: "approve", cardId: "ship" });
  expect(run(p, view(0, card("next")), 5).card).toBeNull();
  expect(run(p, view(0, card("next")), PAYOFF.waitForShip).card?.id).toBe("next"); // never stuck forever
});

test("story: only the first ship after a yes, and never during the level-up climax", () => {
  let phase = "bottleneck";
  const p = createPayoff({ every: false, phase: () => phase });
  p.view(view(0), 0);
  expect(run(p, view(2), PAYOFF.noRocket + 0.1).caption).toBeNull(); // the opening ships carry the story's own words
  phase = "swipe"; p.event({ type: "approve", cardId: "call-1" });
  expect(run(p, view(3), PAYOFF.noRocket + 0.1).caption).toBe(payoffLine(3));
  run(p, view(3), PAYOFF.beat);
  expect(run(p, view(5), PAYOFF.noRocket + 0.1).caption).toBeNull(); // one beat per yes, not per crate
  phase = "automatic"; p.event({ type: "approve", cardId: "call-3" });
  expect(run(p, view(6), PAYOFF.noRocket + 0.1).caption).toBeNull();
});

test("live counts today's ships across visits and starts fresh tomorrow", () => {
  const mem = new Map<string, string>(), store = { get: (k: string) => mem.get(k) ?? null, set: (k: string, v: string) => void mem.set(k, v) };
  let day = "2026-10-29";
  for (const n of [1, 2]) { const p = createPayoff({ every: true, store, day: () => day }); p.view(view(n - 1), 0); p.view(view(n), 0); expect(run(p, view(n), PAYOFF.noRocket + 0.1).caption).toBe(payoffLine(n)); }
  day = "2026-10-30";
  const p = createPayoff({ every: true, store, day: () => day }); p.view(view(5), 0); p.view(view(6), 0);
  expect(run(p, view(6), PAYOFF.noRocket + 0.1).caption).toBe("Shipped. That's your first today.");
});

test("the number doesn't tick while the line is up", () => {
  const p = createPayoff({ every: true });
  p.view(view(0), 0); p.view(view(1), 0);
  expect(run(p, view(1), PAYOFF.noRocket + 0.1).caption).toBe(payoffLine(1));
  expect(p.view(view(2), 0.05).caption).toBe(payoffLine(1));
});
