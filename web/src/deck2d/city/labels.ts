// The words on the city: one label under each island (and under the line) and, after the dim, a quiet brass COMING SOON plate
// under each island's label. DOM text in the caption font, so it stays crisp and real; the container is aria-hidden because
// the canvas carries the city's accessible name (CITY_COPY.canvas) and the captions stay in #toast (aria-live).
// Styles: deck.css (.city-labels, .city-tag, .city-label, .city-plate). A label appears and moves as a step, and every tag sits
// on whole device px (pixel text never lands on half a pixel). The label of the island the story is showing right now (beat
// "islands", view.focus) gets the class "now", brighter than a lit label, from the moment its caption comes up (the camera has
// arrived and its light step has begun) and loses it again as a step.
//
// A tag that is not wholly on screen (less EDGE all round and the caption BAND at the bottom) hides as a step: a phone's pan
// never leaves half a label under the caption or the card. The sign-in card is the other thing a tag must keep out of. From
// the dim on, the card is known before it exists (cardAt: where it settles), so a tag it will cover steps aside when its plate
// drops, in the dim, and nothing moves while the card slides up; once the real card exists its own box counts too.
// A covered tag, in this order:
//   1. only its plate is in the way: the plate hides and the label stays exactly where it is;
//   2. else it steps to the left of its island's sprite, else to the right, else above it (SIDE_GAP clear of the sprite), and
//      stays there only if that spot is wholly on screen, clear of the card and of every other tag;
//   3. else it hides too.
import { CITY_COPY, CITY_ISLANDS, CITY_LABEL, type CityIsland, type CityView } from "../contract";
import { BAND, EDGE } from "./camera";

export type LabelId = CityIsland | "line";
/** An island sprite's box on screen, CSS px. */
export interface SpriteBox { left: number; top: number; right: number; bottom: number }
/** Where a label's top-centre is, CSS px. An island's place may also carry its sprite's box on screen: it lets a tag the
 *  sign-in card covers step beside or above the sprite instead of vanishing. Without it the tag just hides. */
export interface LabelPlace { x: number; y: number; sprite?: SpriteBox }
export type LabelPlaces = Record<LabelId, LabelPlace>;
/** CSS px between a relocated tag and its island's sprite. */
export const SIDE_GAP = 8;

/** The sign-in card's box once it has slid up, CSS px: left and right edge, and how far its top edge is above the bottom of the
 *  screen. Measured on the real card (card.css, pixel mode): its art px is 3 CSS px from 900 px wide and 2 below, it is 540 px
 *  wide from 900 px and 460 below (less 20 px of margin), and its two buttons stack under 520 px. Its height and the 6 art px
 *  it floats above the bottom give 243 up at 3 px, 162 at 2 px side by side and 210 stacked. (The first brief said 237 and 207:
 *  those were measured before the Sign in button grew two art px for its descender.) `inset` is env(safe-area-inset-bottom),
 *  how much higher a phone's home indicator lifts it. */
export function cardAt(W: number, H: number, inset = 0): { left: number; right: number; top: number; bottom: number } {
  const wide = W >= 900, stacked = W < 520;
  const w = Math.min(wide ? 540 : 460, W - 20), up = (wide ? 243 : stacked ? 210 : 162) + inset;
  return { left: (W - w) / 2, right: (W + w) / 2, top: H - up, bottom: H };
}

export interface CityLabels {
  /** Show the labels at these places for this view, or hide them all (view undefined / places null). */
  place(view: CityView | undefined, places: LabelPlaces | null, lit: Record<CityIsland, boolean>): void;
  destroy(): void;
}

interface Box { x: number; y: number; w: number; h: number }
interface Region { left: number; right: number; top: number; bottom: number }
/** Where one visible tag really is: (x, y) is its element's translate; `box` is what shows (the whole tag, or just its label when the plate is cut). */
interface Shown { box: Box; x: number; y: number; cut: boolean }

export function createLabels(host: HTMLElement): CityLabels {
  const doc = host.ownerDocument, win = doc.defaultView;
  const root = doc.createElement("div");
  root.className = "city-labels"; root.setAttribute("aria-hidden", "true"); root.hidden = true;
  type Tag = {
    el: HTMLElement; label: HTMLElement; plate: HTMLElement | null;
    width: number; height: number; // the whole tag (label and, when it shows, plate)
    labelWidth: number; labelHeight: number; // the label alone
    at: string; hidden: boolean; cut: boolean | null; lit: boolean | null; now: boolean | null; plated: boolean | null; text: string;
  };
  const make = (id: LabelId): Tag => {
    const el = doc.createElement("div"), label = doc.createElement("span");
    el.className = "city-tag"; el.dataset.island = id;
    label.className = id === "line" ? "city-label line" : "city-label";
    label.textContent = id === "line" ? CITY_COPY.repo : CITY_LABEL[id];
    el.append(label);
    let plate: HTMLElement | null = null;
    if (id !== "line") {
      plate = doc.createElement("span"); plate.className = "city-plate"; plate.textContent = CITY_COPY.plate; plate.hidden = true;
      el.append(plate);
    }
    root.append(el);
    return { el, label, plate, width: 0, height: 0, labelWidth: 0, labelHeight: 0, at: "", hidden: false, cut: null, lit: null, now: null, plated: null, text: label.textContent! };
  };
  const tags = new Map<LabelId, Tag>([...CITY_ISLANDS, "line" as const].map((id) => [id, make(id)]));
  // env(safe-area-inset-bottom) as a height: a phone with a home indicator floats the card that much higher
  const inset = doc.createElement("div");
  inset.style.cssText = "position:fixed;left:0;bottom:0;width:0;height:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none";
  root.append(inset);
  host.append(root);
  const reducedMotion = win?.matchMedia?.("(prefers-reduced-motion: reduce)");
  // Silkscreen swaps in after the first paint: widths measured before that are wrong, so measure again when it lands.
  const remeasure = () => tags.forEach((t) => { t.width = 0; });
  doc.fonts?.addEventListener?.("loadingdone", remeasure);

  return {
    place(view, places, lit) {
      if (!view || !places) { if (!root.hidden) root.hidden = true; return; }
      if (root.hidden) root.hidden = false;
      const W = win?.innerWidth ?? 0, H = win?.innerHeight ?? 0, dpr = win?.devicePixelRatio || 1;
      const snap = (v: number) => Math.round(v * dpr) / dpr; // whole device px: pixel text never lands on half a pixel
      // a phone's manual city (no beat) shows no caption: its camera uses the screen down to EDGE (camera.ts CityScreen.band)
      const bottom = H - EDGE - (H > 0 && W / H <= 1.2 ? (view.beat ? BAND.portrait : 0) : BAND.landscape);
      // the real card, once there is one (while it slides up its box is lower than where it settles) ...
      const card = doc.querySelector<HTMLElement>(".ic-card:not(.ic-ghost)"), cr = card && !card.hidden ? card.getBoundingClientRect() : null;
      const real: Region | null = cr && cr.width > 0 && cr.height > 0 ? { left: cr.left, right: cr.right, top: cr.top, bottom: cr.bottom } : null;
      // ... and, from the dim on, the one that is about to come: where it settles, known before it exists
      const afterDim = view.beat === "dim" || view.beat === "card";
      const coming: Region | null = afterDim && W > 0 && H > 0 ? cardAt(W, H, inset.offsetHeight) : null;
      const reduced = !!reducedMotion?.matches;
      // wholly on screen: inside EDGE all round and above the caption band
      const inside = (b: Box) => !(W > 0 && (b.x < EDGE || b.x + b.w > W - EDGE || b.y < EDGE || b.y + b.h > bottom));
      const hits = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      const on = (b: Box, r: Region) => b.x < r.right && r.left < b.x + b.w && b.y < r.bottom && r.top < b.y + b.h;
      // The coming card counts for a tag once its plate has dropped (the line has none: from the dim on), so a tag moves
      // when its plate appears, one step, and not again when the card slides.
      const covers = (b: Box, id: LabelId) => (!!real && on(b, real)) || (!!coming && (id === "line" || !!view.plates[id]) && on(b, coming));

      const own = new Map<LabelId, Box>(); // where each tag belongs (centred on its label's top-centre, whole device px)
      const shown = new Map<LabelId, Shown>();
      const covered: LabelId[] = [];
      for (const [id, tag] of tags) {
        const p = places[id];
        const text = id === "line" ? view.label : CITY_LABEL[id];
        if (text !== tag.text) { tag.label.textContent = text; tag.text = text; tag.width = 0; }
        let plated = false;
        if (id !== "line") {
          const isLit = lit[id];
          plated = !!view.plates[id];
          // the island the story is showing: its caption comes up when the camera arrives, which is when its light step begins
          // (reduced motion cuts, so there it is the island in focus; its lights stay off)
          const now = view.beat === "islands" && view.focus === id && (view.lit[id] > 0 || reduced);
          if (isLit !== tag.lit) { tag.label.classList.toggle("lit", isLit); tag.lit = isLit; }
          if (now !== tag.now) { tag.label.classList.toggle("now", now); tag.now = now; }
          if (plated !== tag.plated && tag.plate) { tag.plate.hidden = !plated; tag.plated = plated; tag.width = 0; }
        }
        if (!tag.width) {
          tag.width = tag.el.offsetWidth; tag.height = tag.el.offsetHeight;
          tag.labelWidth = tag.label.offsetWidth; tag.labelHeight = tag.label.offsetHeight;
        }
        // centred on the label's top-centre, then snapped: the tag's left and top are whole device px
        const x = snap(p.x - tag.width / 2), y = snap(p.y);
        const box = { x, y, w: tag.width, h: tag.height };
        const label = { x: x + (tag.width - tag.labelWidth) / 2, y, w: tag.labelWidth, h: tag.labelHeight };
        own.set(id, box);
        // The label alone is a choice only when it was measured, and only a plate gives it something to drop.
        const labelOnly = plated && tag.labelHeight > 0 && tag.labelHeight < tag.height && inside(label) && !covers(label, id);
        if (covers(box, id)) {
          if (labelOnly) shown.set(id, { box: label, x, y, cut: true }); // only the plate is in the way: keep the label where it is
          else covered.push(id);
        } else if (inside(box)) shown.set(id, { box, x, y, cut: false });
        else if (labelOnly) shown.set(id, { box: label, x, y, cut: true }); // the plate does not fit the screen, the label does
      }
      // The card is in the way of these: beside the island's sprite or above it if that is clear, else they hide with the rest.
      const taken = (b: Box) => [...shown.values()].some((other) => hits(b, other.box));
      for (const id of covered) {
        const s = places[id].sprite, tag = tags.get(id)!;
        if (!s) continue;
        const mid = (s.top + s.bottom) / 2, w = tag.width, h = tag.height;
        const spots: Box[] = [
          { x: s.left - SIDE_GAP - w, y: mid, w, h }, // the left of the sprite, its top at the sprite's mid-height
          { x: s.right + SIDE_GAP, y: mid, w, h }, // the right of it
          { x: (s.left + s.right) / 2 - w / 2, y: s.top - SIDE_GAP - h, w, h }, // above it, centred
        ].map((b) => ({ ...b, x: snap(b.x), y: snap(b.y) }));
        const spot = spots.find((b) => inside(b) && !covers(b, id) && !taken(b));
        if (spot) shown.set(id, { box: spot, x: spot.x, y: spot.y, cut: false });
      }
      for (const [id, tag] of tags) {
        const at = shown.get(id), box = own.get(id)!, hide = !at;
        const to = `translate(${Math.round((at?.x ?? box.x) * 1000) / 1000}px, ${Math.round((at?.y ?? box.y) * 1000) / 1000}px)`;
        if (to !== tag.at) { tag.el.style.transform = to; tag.at = to; }
        if (hide !== tag.hidden) { tag.el.style.visibility = hide ? "hidden" : ""; tag.hidden = hide; }
        const cut = !!at?.cut;
        if (tag.plate && cut !== tag.cut) { tag.plate.style.visibility = cut ? "hidden" : ""; tag.cut = cut; }
      }
    },
    destroy() { doc.fonts?.removeEventListener?.("loadingdone", remeasure); root.remove(); },
  };
}
