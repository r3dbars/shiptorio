// What the score (soundtrack.ts) hears from the deck. Pure, so it is tested without Web Audio (web/test/deck-sound.test.ts).

import type { DeckView } from "../contract";
import type { MusicInput } from "./music";

export function musicInputFor(v: DeckView, jamSince: number | null, now: number): MusicInput {
  const built = v.stops.filter((s) => s.built);
  const jam = v.jam ? v.stops.find((s) => s.id === v.jam) : undefined;
  return {
    moving: built.reduce((n, s) => n + s.items.length, 0),
    working: built.filter((s) => s.state === "working").length,
    stationsBusy: built.filter((s) => s.items.length > 0).length,
    rejected: 0,
    // a jam is news, not an emergency: only a real pile-up there (4+ crates) tips the music into the pressure track
    bottleneck: jam ? { stage: "inspect", wip: jam.items.length, ageMs: jamSince == null ? 0 : now - jamSince } : null,
  };
}

