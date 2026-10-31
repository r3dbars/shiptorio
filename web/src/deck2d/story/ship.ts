// The tour's ship beat, made to feel right (Justin, 2026-10-29: "approve the PR that's waiting at the merge gate and I'll
// show you how shipping works"). story/tour.ts owns the beats, the held Ship it and the "Shipped!" card after; this
// wraps it and only changes how the ship itself plays, one thing at a time:
//   lever   Shippy pulls the Gate's lever
//   ride    the crate rides the bridge all the way onto the pad (the tour's own clock would drop it mid-bridge)
//   press   Shippy, who ran over alongside it, presses the launch button by the pad (Justin 2026-10-30)
//   launch  only then does `shipped` go up, so the engine's rocket counts down and lifts off (launch sound + music),
//           and the tour's next card waits until the rocket is climbing
// Wiring (main.ts): storyBeforeSignIn(shipFeel(createTour(), bus), ...). It hooks on the tour's own contract: the ship
// beat is the one whose `then` is a ship, its card id is `tour-<round>-<beat>`, the crate is "tour-crate".
import { PAYOFF } from "../payoff";
import type { CardView, DeckBus, DeckSource, DeckView, ShippyView, StopId } from "../contract";
import type { AttentionView } from "../stations/attention";
import { TOUR } from "./tour";

export type ShipPhase = "off" | "lever" | "ride" | "press" | "launch" | "done";

export const SHIP_CRATE = "tour-crate";

/** What's happening, as the caption over the deck, while the fix ships (round 2: every step says what it is). */
export const SHIP_CAPTION: Record<ShipPhase, string | null> = {
  off: null, done: null,
  lever: "Merged! The Gate opens.",
  ride: "Your fix rides out to Launch.",
  press: "Shippy hits launch...",
  launch: "Shipped to your users!",
};

export const SHIP_TIMING = {
  lever: 0.6, // Shippy pulls the lever before the crate moves (the tour hands it to Launch at the same moment)
  ride: 7, // most the crate gets to reach the pad; crate-arrive normally ends it sooner (2.5 let the rocket go before the crate landed)
  settle: 0.3, // the crate sits on the pad a beat before Shippy reaches for the button
  press: 0.9, // Shippy presses the launch button; the rocket goes as he lets go
  liftoff: 1.5, // no "launch" event (no rocket layer): go on anyway after this
  afterLaunch: PAYOFF.afterLaunch, // the rocket clears the pad and climbs before the next card covers the bottom
} as const;

/** The tour's Ship it card: the beat whose `then` ships. Ids are `tour-<round>-<beat>`. */
const SHIP_BEAT = TOUR.findIndex(b => b.then && "ship" in b.then);
export const isShipCard = (c: CardView | null | undefined) => !!c && c.id.startsWith("tour-") && c.id.endsWith(`-${SHIP_BEAT}`);

export function shipFeel<T extends DeckSource>(tour: T, bus: DeckBus): T & { shipPhase(): ShipPhase } {
  let phase: ShipPhase = "off", t = 0, held = 0, arrived = false, launched = false;
  let bias = 0, lastRaw = 0; // a Replay resets the tour's count; the engine only launches when the number goes up
  let shown: CardView | null = null;
  const enter = (p: ShipPhase) => { phase = p; t = 0; };

  bus.on(e => {
    if (e.type === "crate-arrive" && e.stop === "launch" && e.id === SHIP_CRATE && phase === "ride") { arrived = true; t = 0; }
    if (e.type === "launch" && phase === "launch") { launched = true; t = 0; }
  });

  function step(dt: number) {
    tour.step?.(dt);
    if (phase === "off" || phase === "done") return;
    t += dt;
    if (phase === "lever" && t >= SHIP_TIMING.lever) enter("ride");
    else if (phase === "ride" && (arrived ? t >= SHIP_TIMING.settle : t >= SHIP_TIMING.ride)) enter("press");
    else if (phase === "press" && t >= SHIP_TIMING.press) enter("launch");
    else if (phase === "launch" && t >= (launched ? 0 : SHIP_TIMING.liftoff) + SHIP_TIMING.afterLaunch) enter("done");
  }

  function view(): DeckView {
    const v = tour.view() as AttentionView & { followItem?: string };
    if (v.shipped < lastRaw) bias += lastRaw - v.shipped;
    lastRaw = v.shipped;
    if (phase === "off" || phase === "done") {
      shown = v.card;
      return bias ? { ...v, shipped: v.shipped + bias } : v;
    }
    const crateAt: StopId | null = phase === "lever" ? "gate" : phase === "ride" || phase === "press" ? "launch" : null;
    const stops = v.stops.map(s => ({
      ...s, state: s.id === crateAt ? "working" as const : "idle" as const,
      items: s.id === crateAt ? [{ id: SHIP_CRATE, title: "Fix the broken docs link", look: "ok" as const }] : [],
    }));
    const shippy: ShippyView = phase === "lever" ? { pose: "lever", at: "gate" } : phase === "ride" ? { pose: "walking", at: "launch" }
      : phase === "press" ? { pose: "poke", at: "launch" } : { pose: "happy", at: "launch" };
    shown = null;
    return {
      ...v, stops, card: null, caption: SHIP_CAPTION[phase], shippy, attention: [], focus: phase === "lever" ? "gate" : "launch",
      followItem: phase === "ride" ? SHIP_CRATE : undefined,
      // Held until the crate is on the pad: the engine launches the rocket the moment this goes up.
      shipped: (phase === "lever" || phase === "ride" || phase === "press" ? held : held + 1) + bias,
    } as DeckView;
  }

  return {
    ...tour, step, view,
    approve(id: string) {
      if (phase !== "off" && phase !== "done") return; // nothing to answer while it ships
      if (isShipCard(shown) && shown!.id === id) { held = tour.view().shipped; arrived = launched = false; enter("lever"); }
      tour.approve(id);
    },
    reset() { phase = "off"; (tour as DeckSource & { reset?: () => void }).reset?.(); },
    shipPhase: () => phase,
  } as T & { shipPhase(): ShipPhase };
}
