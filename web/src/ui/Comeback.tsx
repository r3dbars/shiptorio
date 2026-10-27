// Coming back (docs/GAMEPLAY-PICKS.md r3-return B, r4-pull B). After six hours or more away (?away=12 to try it), the
// first thing on screen is a few seconds of time-lapse: the rockets that really shipped while you were gone ride up
// the shaft and launch, fast, and the Shipped counter ticks up to its real number. Tap anywhere to skip. If a launch
// is waiting, it ends parked on the merge gate with that launch card up. Reduced motion: one line, no replay.

import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type { FactoryState, Move } from "@shiptorio/shared";
import type { Timelapse } from "../map/shaft/ShaftScene";
import { AWAY } from "../copy";
import { awaySince, LAPSE_MAX, launchWaiting, markSeen, readSeen, shippedShown, whileAway } from "./away";
import "./comeback.css";

const LINE_MS = 12000; // the reduced-motion line, then it goes (a tap dismisses it sooner)
const SEEN_EVERY_MS = 60_000;

type Phase = "wait" | "play" | "line" | "off";

export interface Comeback {
  holding: boolean; // the replay has the screen: cards and the check-in wait
  lapse: Timelapse | null; // for the map
  shipped: (real: number) => number; // the Shipped counter as the replay shows it
  park: Move | null; // the launch card the comeback ended on, while it's still waiting
  release: () => void; // the player moved on (opened something else)
  overlay: ReactElement | null;
}

export function useComeback(state: FactoryState | null, scope: string, on: boolean, reduced: boolean): Comeback {
  const [stored] = useState(() => readSeen(scope)); // read before this visit marks itself seen
  const [phase, setPhase] = useState<Phase>(on ? "wait" : "off");
  const [shippedIds, setShippedIds] = useState<string[]>([]);
  const [placed, setPlaced] = useState<string[] | null>(null);
  const [landed, setLanded] = useState(0);
  const [parking, setParking] = useState(false);
  const parkSeen = useRef<string | null>(null);

  // this visit counts as seen from now on, and keeps counting while the tab is open
  useEffect(() => {
    markSeen(scope);
    const id = setInterval(() => document.visibilityState === "visible" && markSeen(scope), SEEN_EVERY_MS);
    const bye = () => markSeen(scope);
    window.addEventListener("pagehide", bye);
    return () => (clearInterval(id), window.removeEventListener("pagehide", bye));
  }, [scope]);

  // decide once, on the first real state: were you away, and did anything really ship meanwhile?
  useEffect(() => {
    if (phase !== "wait" || !state) return;
    const now = Date.now();
    const since = awaySince(location.search, stored, now);
    const shipped = since === null ? [] : whileAway(state, since, now).shipped;
    if (!shipped.length) return setPhase("off");
    setShippedIds(shipped.map((i) => i.id));
    setPhase(reduced ? "line" : "play");
    setParking(true);
  }, [phase, state, stored, reduced]);

  const end = () => setPhase((p) => (p === "play" || p === "line" ? "off" : p));

  const lapse = useMemo<Timelapse | null>(
    () =>
      phase === "play"
        ? {
            refs: shippedIds.slice(-LAPSE_MAX),
            onStart: (ids) => {
              setPlaced(ids);
              if (!ids.length) setPhase("line"); // nothing could fly: say it in a line instead
            },
            onShip: () => setLanded((n) => n + 1),
            onOver: () => setPhase((p) => (p === "play" ? "off" : p)),
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase === "play", shippedIds],
  );

  // the replay ends when the last rocket is up (or the map says its time is up); the line on its own after a while
  useEffect(() => {
    if (phase === "line") {
      const t = setTimeout(end, LINE_MS);
      return () => clearTimeout(t);
    }
    if (phase !== "play") return;
    // (until the map has started it there's nothing to end: a map that can't replay says so at once)
    if (!placed || landed < placed.length) return;
    const t = setTimeout(end, 700);
    return () => clearTimeout(t);
  }, [phase, placed, landed]);

  // any key skips, like a tap
  useEffect(() => {
    if (phase !== "play") return;
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      e.stopPropagation();
      end();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [phase]);

  // r4-pull: a launch waiting on you is where the comeback lands, until you answer it or look elsewhere
  const deck = state?.deck ?? (state?.move ? [state.move] : []);
  const waiting = parking && phase !== "play" && phase !== "wait" && state ? launchWaiting(state) : null;
  useEffect(() => {
    if (waiting) parkSeen.current = waiting.id;
    else if (parkSeen.current && !deck.some((m) => m.id === parkSeen.current)) setParking(false);
  }, [waiting?.id, deck.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = shippedIds.length;
  const line = AWAY.line(total);
  let overlay: ReactElement | null = null;
  if (phase === "play")
    overlay = (
      <button type="button" className="comeback play" onClick={end} aria-label={AWAY.skipLabel}>
        <span className="cb-plate">
          <b>{line}</b>
          <span>{AWAY.skip}</span>
        </span>
      </button>
    );
  else if (phase === "line")
    overlay = (
      <div className="comeback" role="status">
        <button type="button" className="cb-plate" onClick={end}>
          <b>{line}</b>
        </button>
      </div>
    );

  return {
    holding: phase === "wait" || phase === "play",
    lapse,
    shipped: (real) => (phase === "play" ? (placed ? shippedShown(real, total, placed.length, landed) : Math.max(0, real - total)) : real),
    park: waiting,
    release: () => setParking(false),
    overlay,
  };
}
