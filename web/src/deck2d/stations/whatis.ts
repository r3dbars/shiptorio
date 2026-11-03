// Tap a station, see what it is (Justin 2026-10-29: "click on each of the stations ... highlights it and gives you a
// what is this pop up"). The words are Shippy's own lines from the tutorial (story/script.ts), so the copy lives in one
// place. One small iron note above the station; tap it again, the note, or anywhere else and it closes. While Shippy's
// tour is talking, taps are ignored so they never fight the story card.
import { STOP_LABEL, type StopId } from "../contract";
import { TUTORIAL } from "../story/script";

export type WhatIsId = StopId | "engine";
export interface WhatIs { title: string; line: string }

const TITLE: Record<WhatIsId, string> = { ...STOP_LABEL, engine: "Steam engine" };

/** Shippy's tutorial lines for this station, minus the line that only names it ("This is Repo.", "Planner."). */
export function whatIs(id: WhatIsId): WhatIs {
  const card = TUTORIAL.find((c) => c.id === id || c.build === id);
  const title = TITLE[id];
  const naming = new RegExp(`^(This is )?(the )?${title}\\.$`, "i");
  const lines = (card?.lines ?? []).filter((l) => !naming.test(l.trim()));
  return { title, line: lines.join(" ") };
}

/** Which station's note is open. Pure, so the rules are testable without a canvas. */
export function createWhatIsState() {
  let open: WhatIsId | null = null;
  return {
    get open() { return open; },
    /** A tap on a station (or null for empty deck). Same station again closes it. Returns what's open now. */
    tap(id: WhatIsId | null, blocked = false): WhatIsId | null {
      if (blocked) return (open = null);
      open = id && id !== open ? id : null;
      return open;
    },
    close() { open = null; },
  };
}

/** The note itself: plain DOM over the canvas, placed by the engine each frame. */
export function mountWhatIs(doc: Document, onClose: () => void) {
  const el = doc.createElement("div");
  el.className = "whatis"; el.hidden = true;
  el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite");
  const title = doc.createElement("b"), line = doc.createElement("span");
  el.append(title, line);
  el.addEventListener("pointerup", (e) => { e.stopPropagation(); onClose(); });
  doc.body.append(el);
  let shown: WhatIsId | null = null;
  return {
    /** at = the station's top-centre in CSS px; the note sits above it, or below when there's no room. */
    show(id: WhatIsId | null, at: { x: number; y: number; bottom: number } | null) {
      if (!id || !at) { el.hidden = true; shown = null; return; }
      if (id !== shown) { const w = whatIs(id); title.textContent = w.title; line.textContent = w.line; shown = id; }
      el.hidden = false;
      const W = doc.documentElement.clientWidth, gutter = 16, r = el.getBoundingClientRect();
      const x = Math.max(gutter, Math.min(W - gutter - r.width, at.x - r.width / 2));
      const above = at.y - r.height - 10;
      const y = above >= gutter ? above : at.bottom + 10;
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    },
    destroy() { el.remove(); },
  };
}
