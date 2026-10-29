// The deck's sound: the old game's engine (sound effects from Justin's soundboard picks) and his soundtrack picks
// (soundtrack.ts), wired to the 2D deck. juice/sounds.ts maps each DeckEvent to its effect; this file starts the
// engine, keeps the music in step with the deck, and puts a mute button in the corner.
//
// Calm: the music follows the deck slowly (a track holds at least 8 bars, soundtrack.ts nextRole). Idle plays the
// lullaby, a moving line the night shift, a real pile-up at the jam the pressure track, and a launch the lift-off lap.
// Nothing plays until the first tap or key (browsers block autoplay). M or the button mutes everything, remembered.

import type { DeckBus, DeckView, StopId } from "../contract";
import { musicInputFor } from "./deckMusic";
import { sound, type Sfx } from "./engine";
import "./sound.css";

export { musicInputFor } from "./deckMusic";
export { shippySays, talkBlip, cardAdvance, spotlight } from "./talk";

const SPEAKER = '<svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" d="M2 6h3l4-3h1v10H9l-4-3H2z"/><path class="dsound-waves" fill="currentColor" d="M11 6h1v4h-1zM13 4h1v8h-1z"/><path class="dsound-x" stroke="currentColor" stroke-width="1.5" d="M11 6l4 4M15 6l-4 4"/></svg>';

// Tapping a machine plays its own tap from Justin's soundboard (the old game's close-up taps). Your taps are never thinned.
const TAP: Record<StopId, Sfx> = {
  repo: "tap_mine", planner: "tap_planner", builder: "tap_assembler", checks: "tap_checks", review: "tap_checks", gate: "tap_gate", launch: "tap_pad",
};
export const tapSound = (stop: StopId): Sfx => TAP[stop];
export function playTap(stop: StopId) { sound.play(TAP[stop]); }

let installed = false;

/** Starts the deck's sound and music. view() is read about once a second for the music; returns a detach. */
export function attachSound(bus: DeckBus, view: () => DeckView, host: HTMLElement = document.body): () => void {
  if (!installed) { sound.install(); installed = true; }
  // the card's own buttons ring card_go / card_later (juice/sounds.ts), so they skip the engine's generic click
  document.getElementById("card-host")?.setAttribute("data-sfx", "card");

  const button = document.createElement("button");
  button.type = "button";
  button.className = "dsound";
  button.dataset.sfx = "mute";
  button.innerHTML = SPEAKER;
  const paint = () => {
    const off = sound.settings.muted;
    button.classList.toggle("off", off);
    button.setAttribute("aria-pressed", String(off));
    button.setAttribute("aria-label", off ? "Turn sound on (M)" : "Mute sound (M)");
    button.title = off ? "Sound off (M)" : "Sound on (M)";
  };
  button.addEventListener("click", () => sound.set({ muted: !sound.settings.muted }));
  host.append(button);
  document.body.classList.add("has-dsound");
  paint();
  const unsub = sound.subscribe(paint);

  let jam: string | null = null;
  let jamSince: number | null = null;
  const feed = () => {
    const v = view();
    const now = performance.now();
    if (v.jam !== jam) { jam = v.jam; jamSince = v.jam ? now : null; }
    sound.setMusic(musicInputFor(v, jamSince, now));
  };
  feed();
  const timer = window.setInterval(feed, 1000);
  // a rocket going up: the score ducks under the roar, then plays the lift-off lap
  const off = bus.on((e) => { if (e.type === "launch") sound.musicResolve(); });

  return () => {
    off(); unsub(); window.clearInterval(timer);
    button.remove(); document.body.classList.remove("has-dsound");
  };
}
