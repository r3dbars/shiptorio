// Captions for the sounds that mean something, so nothing important is sound-only.
// The words always go to screen readers; the on-screen caption strip is a setting (C toggles it).

import { useEffect, useState, useSyncExternalStore } from "react";
import { SFX_EVENT, type Sfx, type SfxEvent } from "../sound/engine";

// Only sounds that tell you something. Belts, clicks and chirps stay uncaptioned.
const CAPTION: Partial<Record<Sfx, string>> = {
  ci_buzz: "CI buzzer: a check failed",
  verify_caught: "Klaxon: the verify bay caught a bad fix",
  ai_fail: "AI review asked for changes",
  stamp_fail: "Reject stamp",
  rework: "Clunk: sent back on the rework belt",
  review_stamp: "AI review approved",
  gate_clank: "Merge gate opened",
  dock: "A PR docked on the launch pad",
  arm: "Launch armed",
  launch: "Rocket launching",
  shipped: "Shipped",
  orbit_alarm: "Orbit alarm: new errors after a launch",
  orbit_clear: "Orbit watch: all clear",
  research: "Research done",
  station_drop: "A new check landed on the line",
  permit_grant: "Launch permit earned",
  permit_revoke: "Launch permit revoked",
  level_up: "Autonomy level up",
  suggest: "Suggestion",
  steam_hiss: "Steam hiss: a build started",
  iron_clank: "Iron clank: work moved up a floor",
};
// Texture accents: on the caption strip for people who can't hear them, but not read out, since anyone
// hearing the screen reader hears the sound itself and the strip would otherwise talk over everything.
const STRIP_ONLY = new Set<Sfx>(["steam_hiss", "iron_clank"]);
const KEY = "shiptorio:captions";
const HOLD_MS = 3200;

let on = (() => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
})();
const subs = new Set<() => void>();
export const captions = {
  get on() {
    return on;
  },
  set(v: boolean) {
    on = v;
    try {
      localStorage.setItem(KEY, v ? "1" : "0");
    } catch {
      // this visit only
    }
    subs.forEach((f) => f());
  },
};
export const useCaptionsOn = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => on,
  );

export function SoundCaptions() {
  const visible = useCaptionsOn();
  const [lines, setLines] = useState<{ id: number; text: string }[]>([]);
  const [said, setSaid] = useState("");
  useEffect(() => {
    let n = 0;
    const timers: number[] = [];
    const onSfx = (e: Event) => {
      const { sfx, delayMs } = (e as CustomEvent<SfxEvent>).detail;
      const text = CAPTION[sfx];
      if (!text) return;
      timers.push(
        window.setTimeout(() => {
          const id = ++n;
          if (!STRIP_ONLY.has(sfx)) setSaid(text);
          setLines((l) => (l.some((x) => x.text === text) ? l : [...l.slice(-2), { id, text }]));
          timers.push(window.setTimeout(() => setLines((l) => l.filter((x) => x.id !== id)), HOLD_MS));
        }, delayMs),
      );
    };
    window.addEventListener(SFX_EVENT, onSfx);
    return () => {
      window.removeEventListener(SFX_EVENT, onSfx);
      timers.forEach(clearTimeout);
    };
  }, []);
  return (
    <>
      <div className="sr" role="log" aria-live="polite" aria-label="Sound captions">
        {said}
      </div>
      {visible && lines.length > 0 && (
        <div className="sfx-captions" aria-hidden="true">
          {lines.map((l) => (
            <span key={l.id}>[{l.text}]</span>
          ))}
        </div>
      )}
    </>
  );
}
