// The tour's payoff, made to feel right (Justin, 2026-10-29: "approve the PR that's waiting at the merge gate and I'll
// show you how shipping works"). story/tour.ts owns the beats; this wraps it and only changes how its last one plays:
//   ask     the Gate card is a held Ship it, like a real merge
//   lever   Shippy pulls the Gate's lever
//   ride    the crate rides the bridge all the way onto the pad (the tour's own clock would drop it mid-bridge)
//   launch  only then does `shipped` go up, so the engine's rocket counts down and lifts off (launch sound + music)
//   cheer   once the rocket is climbing, Shippy says it in the card, at the player's pace. Then the tour goes on.
// ONE thing moves at a time: no card while the crate and rocket go, no caption over the climb.
//
// Wiring (main.ts): source = shipFeel(createTour(), bus), and card.show(..., { quiet: source.quiet() }) so the card
// doesn't flash "All caught up" between the Ship it and the cheer. payoff.ts stays quiet on its own (tour phase isn't
// "swipe"). It hooks on the tour's own contract: the Gate card is the last "tour-" card, the crate is "tour-crate".
import { PAYOFF } from "../payoff";
import type { CardView, DeckBus, DeckSource, DeckView, ShippyView, StopId } from "../contract";
import type { AttentionView } from "../stations/attention";
import { TOUR } from "./tour";

export type ShipPhase = "off" | "lever" | "ride" | "launch" | "cheer" | "done";

export const SHIP_CRATE = "tour-crate";
export const SHIP_CHEER = "tour-shipped";
export const SHIP_LINES = {
  cheerTitle: "Shipped!",
  cheer: "You said yes at the Gate, and your fix went live. That's how shipping works.",
} as const;

export const SHIP_TIMING = {
  lever: 0.9, // Shippy pulls the lever before the crate moves (the tour hands it to Launch at the same moment)
  ride: 6, // most the crate gets to reach the pad; crate-arrive normally ends it sooner
  settle: 0.5, // the crate sits on the pad a beat before the countdown
  liftoff: 1.5, // no "launch" event (no rocket layer): go on anyway after this
  afterLaunch: PAYOFF.afterLaunch + 1, // the rocket clears the pad and climbs before the cheer card covers the bottom
} as const;

/** The tour's Gate card: its last beat. Ids are `tour-<round>-<beat>`. */
export const isShipCard = (c: CardView | null | undefined) => !!c && c.id.startsWith("tour-") && c.id.endsWith(`-${TOUR.length - 1}`);

export function shipFeel<T extends DeckSource>(tour: T, bus: DeckBus): T & { quiet(): boolean; shipPhase(): ShipPhase } {
  let phase: ShipPhase = "off", t = 0, held = 0, extra = 0, cheers = 0, arrived = false, launched = false;
  let bias = 0, lastRaw = 0; // a Replay resets the tour's count; the engine only launches when the number goes up
  let shown: CardView | null = null;
  const enter = (p: ShipPhase) => { phase = p; t = 0; };

  bus.on(e => {
    if (e.type === "crate-arrive" && e.stop === "launch" && e.id === SHIP_CRATE && phase === "ride") { arrived = true; t = 0; }
    if (e.type === "launch" && phase === "launch") { launched = true; t = 0; }
  });

  const cheerId = () => `${SHIP_CHEER}-${cheers}`;
  const cheerCard = (): CardView => ({
    id: cheerId(), title: SHIP_LINES.cheerTitle, line: SHIP_LINES.cheer, dots: null, stop: "launch", yes: "Next", no: "Watch again", guide: "shippy",
  });

  function step(dt: number) {
    tour.step?.(dt);
    if (phase === "off" || phase === "done" || phase === "cheer") return;
    t += dt;
    if (phase === "lever" && t >= SHIP_TIMING.lever) enter("ride");
    else if (phase === "ride" && (arrived ? t >= SHIP_TIMING.settle : t >= SHIP_TIMING.ride)) enter("launch");
    else if (phase === "launch" && t >= (launched ? 0 : SHIP_TIMING.liftoff) + SHIP_TIMING.afterLaunch) enter("cheer");
  }

  function view(): DeckView {
    const v = tour.view() as AttentionView & { followItem?: string };
    if (v.shipped < lastRaw) bias += lastRaw - v.shipped;
    lastRaw = v.shipped;
    if (phase === "off" || phase === "done") {
      if (v.card && isShipCard(v.card)) v.card = { ...v.card, hold: true };
      shown = v.card;
      return extra + bias ? { ...v, shipped: v.shipped + extra + bias } : v;
    }
    const crateAt: StopId | null = phase === "lever" ? "gate" : phase === "ride" ? "launch" : null;
    const stops = v.stops.map(s => ({
      ...s, state: s.id === crateAt ? "working" as const : "idle" as const,
      items: s.id === crateAt ? [{ id: SHIP_CRATE, title: "Fix the broken docs link", look: "ok" as const }] : [],
    }));
    const shippy: ShippyView = phase === "lever" ? { pose: "lever", at: "gate" } : phase === "ride" ? { pose: "walking", at: "launch" } : { pose: "happy", at: "launch" };
    const card = phase === "cheer" ? cheerCard() : null;
    shown = card;
    return {
      ...v, stops, card, caption: null, shippy, attention: [], focus: phase === "lever" ? "gate" : "launch",
      followItem: phase === "ride" ? SHIP_CRATE : undefined,
      // Held until the crate is on the pad: the engine launches the rocket the moment this goes up.
      shipped: (phase === "lever" || phase === "ride" ? held : held + 1) + extra + bias,
    } as DeckView;
  }

  return {
    ...tour, step, view,
    approve(id: string) {
      if (phase === "cheer") { if (id === cheerId()) enter("done"); return; }
      if ((phase === "off" || phase === "done") && isShipCard(shown) && shown!.id === id) { held = tour.view().shipped; arrived = launched = false; enter("lever"); }
      tour.approve(id);
    },
    later(id: string) {
      // Watch again: one more rocket off the same pad, then the same cheer.
      if (phase === "cheer") { if (id === cheerId()) { extra++; cheers++; launched = false; enter("launch"); } return; }
      tour.later(id);
    },
    reset() { phase = "off"; (tour as DeckSource & { reset?: () => void }).reset?.(); },
    quiet: () => phase !== "off" && phase !== "done",
    shipPhase: () => phase,
  } as T & { quiet(): boolean; shipPhase(): ShipPhase };
}
