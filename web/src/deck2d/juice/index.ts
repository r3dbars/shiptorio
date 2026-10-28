// attachJuice(bus, host, where): the deck's sounds and effects, driven only by DeckEvents (contract.ts).
// Sounds go through the calm rules (sounds.ts). Effects are DOM overlays in the host, placed with where(stop).
// The engine owns the canvas, so anything it draws itself (rocket climb, sky drift) uses the pure helpers in fx.ts.

import { art, type AttachJuice, type StopId } from "../contract";
import { play as playBuild } from "../../sound/build";
import { sound } from "../../sound/engine";
import { DeckSound, type DeckEvent } from "./sounds";
import { burst, launchPlume, shake, stampAutomated, steamPuff } from "./fx";

export * from "./sounds";
export * from "./fx";

// how far above a stop's point its smokestack is, CSS px
const STACK_UP = 44;
const STEAM_EVERY_MS = 2800;

export const attachJuice: AttachJuice = (bus, host, where) => {
  const deck = new DeckSound((s, at) => sound.play(s, at), undefined, playBuild);
  // the page passes document.body: pin effects to the viewport so they never scroll or add scrollbars
  if (host === document.body) host.classList.add("djuice-viewport");
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

  const off = bus.on((e: DeckEvent) => {
    deck.fire(e);
    switch (e.type) {
      case "build-start": {
        const p = where(e.stop);
        void burst(host, p.x, p.y - 20, { color: "gold", count: 6, reach: 20 });
        return;
      }
      case "build-stage": {
        const p = where(e.stop);
        if (e.stage === "frame" || e.stage === "panels") void burst(host, p.x, p.y - 30, { color: "gold", count: 5, reach: 16 }); // welding
        else if (e.stage === "burst") void burst(host, p.x, p.y - 30, { color: "gold", count: 18, reach: 56 });
        else if (e.stage === "check") void burst(host, p.x, p.y - 40, { color: "green", count: 8, reach: 26 });
        else if (e.stage === "top") void steamPuff(host, p.x, p.y - STACK_UP);
        return;
      }
      case "launch-stage": {
        if (e.stage === "island-up" || e.stage === "rocket-seated") {
          const p = where("launch");
          void steamPuff(host, p.x - 14, p.y, 20);
          void steamPuff(host, p.x + 14, p.y, 20);
        }
        if (e.stage === "island-up") void shake(host, 2, 260);
        return;
      }
      case "deck-grow":
        return;
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
    host.classList.remove("djuice-viewport");
  };
};
