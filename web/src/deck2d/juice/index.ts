// attachJuice(bus, host, where): the deck's sounds and effects, driven only by DeckEvents (contract.ts).
// Sounds go through the calm rules (sounds.ts). Effects are DOM overlays in the host, placed with where(stop).
// The engine owns the canvas, so anything it draws itself (rocket climb, sky drift) uses the pure helpers in fx.ts.

import { art, type AttachJuice, type StopId } from "../contract";
import { sound } from "../../sound/engine";
import { DeckSound } from "./sounds";
import { burst, launchPlume, shake, stampAutomated, steamPuff } from "./fx";

export * from "./sounds";
export * from "./fx";

// how far above a stop's point its smokestack is, CSS px
const STACK_UP = 44;
const STEAM_EVERY_MS = 2800;

export const attachJuice: AttachJuice = (bus, host, where) => {
  const deck = new DeckSound((s, at) => sound.play(s, at));
  const working = new Set<StopId>();
  let stopped = false;

  // working machines let off a lazy puff of steam now and then; idle ones are quiet
  let steamTimer = 0;
  const steam = () => {
    if (stopped) return;
    if (!document.hidden && working.size) {
      const list = [...working];
      const p = where(list[Math.floor(Math.random() * list.length)]);
      void steamPuff(host, p.x + (Math.random() * 16 - 8), p.y - STACK_UP);
    }
    steamTimer = window.setTimeout(steam, STEAM_EVERY_MS * (0.6 + Math.random() * 0.8));
  };
  steam();

  const off = bus.on((e) => {
    deck.fire(e);
    switch (e.type) {
      case "station-state":
        if (e.state === "working") working.add(e.stop);
        else working.delete(e.stop);
        return;
      case "station-built": {
        const p = where(e.stop);
        void burst(host, p.x, p.y - 20, { color: "gold", count: 16 });
        return;
      }
      case "crate-arrive": {
        const p = where(e.stop);
        void steamPuff(host, p.x, p.y, 10);
        return;
      }
      case "jam": {
        const p = where(e.stop);
        void burst(host, p.x, p.y - STACK_UP, { color: "red", count: 6, reach: 22 });
        void shake(host, 3, 320);
        return;
      }
      case "shippy":
        // Shippy's own sprite does the pose (shippy/); juice only adds the sound
        return;
      case "launch": {
        const p = where("launch");
        void launchPlume(host, p.x, p.y, { flameSrc: art("flame") });
        return;
      }
      case "automated": {
        const p = where(e.stop);
        void stampAutomated(host, { x: p.x, y: Math.max(60, p.y - 90) });
        return;
      }
    }
  });

  return () => {
    stopped = true;
    off();
    window.clearTimeout(steamTimer);
  };
};
