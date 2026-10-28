// attachJuice(bus, host, where): the deck's sounds and effects, driven only by DeckEvents (contract.ts).
// Sounds go through the calm rules (sounds.ts). Effects are DOM overlays in the host, placed with where(stop), and only
// at the focal moments: a station built, a launch, a stop going automatic. No ambient steam, no per-stage sparks.
// The engine owns the canvas, so anything it draws itself (rocket climb, sky drift) uses the pure helpers in fx.ts.

import { art, type AttachJuice, type CreateLayer } from "../contract";
import { pixelOn } from "../../flags";
import { play as playBuild } from "../../sound/build";
import { sound } from "../../sound/engine";
import { DeckSound, type DeckEvent } from "./sounds";
import { burst, launchPlume, stampAutomated } from "./fx";
import { createJuiceLayer } from "./pixel";

export * from "./sounds";
export * from "./fx";
export * from "./pixel";

/** Pixel mode (?px=1): the effects are drawn into the engine's art buffer by this layer instead of DOM overlays. */
export const createLayer: CreateLayer = (a, bus) => (pixelOn() ? createJuiceLayer(a, bus) : { update() {}, draw() {} });

export const attachJuice: AttachJuice = (bus, host, where) => {
  const deck = new DeckSound((s, at) => sound.play(s, at), undefined, playBuild);
  // the page passes document.body: pin effects to the viewport so they never scroll or add scrollbars
  if (host === document.body) host.classList.add("djuice-viewport");
  const px = pixelOn(); // the pixel layer (createLayer) draws the effects; DOM overlays would break the grid
  const off = bus.on((e: DeckEvent) => {
    deck.fire(e);
    if (px) return;
    switch (e.type) {
      case "station-built": {
        const p = where(e.stop);
        void burst(host, p.x, p.y - 20, { color: "gold", count: 16 });
        return;
      }
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
      // everything else is the sprites' job: the deck only flashes at its focal moments
      default:
        return;
    }
  });

  return () => {
    off();
    host.classList.remove("djuice-viewport");
  };
};
