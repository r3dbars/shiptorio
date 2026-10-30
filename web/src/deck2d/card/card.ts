// The one iron swipe card at the bottom of the 2D deck (contract.ts: MountCard). Plain DOM, no React.
// Thread "Build the iron swipe card"; target = Justin's mock: pixel title, ●○○ trust dots, one line, ← Later / Approve →.
//
// Swipe right or tap Approve, swipe left or tap Later, or use the arrow keys. A drag tilts the card and lights the
// button it is heading for. Letting go past the line answers: an approve pops the next dot, then the card flies off as
// a ghost while the source deals the next one, which slides up from below. One answer each time a card is dealt.
// show(null) right after an answer says "All caught up" for a moment, then the card steps aside for the caption.
// A hold card ships real code (a merge): Approve takes a held press (or held →), or a swipe nearly all the way across.
// ?px=1 (the pixel canvas): the plate, buttons and dots are drawn in code in the 48 colors at a whole-number scale
// (pixel.ts), and the card only moves in whole art px, never tilts. ?px=0 is the painted look below, unchanged.

import type { CardView, MountCard } from "../contract";
import { pixelOn } from "../../flags";
import { cardScale, paintButton, paintDot, paintPlate, pixelLayer } from "./pixel";
import "./card.css";
import { mountShippyGuide } from "./shippy-guide";
import { mountStoryShippy, type StoryShippy } from "./story";

const SWIPE_SHARE = 0.28; // let go past this share of the card's width to answer
const MIN_SWIPE_PX = 60;
const FLICK = 0.6; // px/ms: a quick flick that way answers too
const TILT_PER_PX = 0.06; // degrees
const MAX_TILT = 14;
const CAUGHT_UP_MS = 2200; // how long "All caught up" stays before the caption takes over
const AFTER_ANSWER_MS = 900; // a show(null) this soon after an answer is the deck running dry, not a hide
const HOLD_SWIPE_SHARE = 0.6; // a hold card's swipe has to cross most of the card, and a flick never counts
export const HOLD_MS = 800; // how long a hold card's Approve has to be held

// yes/no labels and hold are newer CardView fields (hub thread); read them so this works before and after they land
type View = CardView & { yes?: string; no?: string; hold?: boolean };

export type Answer = "approve" | "later";

/** Which way a drag answers, if at all: past the line, or a quick flick that way. */
export function swipeAnswer(dx: number, width: number, vx = 0, hold = false): Answer | null {
  const line = Math.max(MIN_SWIPE_PX, width * SWIPE_SHARE);
  if (hold ? dx > Math.max(MIN_SWIPE_PX, width * HOLD_SWIPE_SHARE) : dx > line || (dx > 40 && vx > FLICK)) return "approve";
  if (dx < -line || (dx < -40 && vx < -FLICK)) return "later";
  return null;
}

/** -1..1: how far a drag leans toward Later (-) or Approve (+). */
export const leanOf = (dx: number, width: number, hold = false) =>
  Math.max(-1, Math.min(1, dx / Math.max(MIN_SWIPE_PX, width * (hold && dx > 0 ? HOLD_SWIPE_SHARE : SWIPE_SHARE))));

const still = () => {
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

interface Face {
  root: HTMLElement;
  title: HTMLElement;
  dots: HTMLElement;
  line: HTMLElement;
  later: HTMLButtonElement;
  approve: HTMLButtonElement;
  no: HTMLElement;
  yes: HTMLElement;
  guide?: { destroy(): void };
  story?: StoryShippy; // a story card: Shippy inside the plate, typing his line
  px?: { redrawLater(): void }; // pixel mode: repaint the Later button when it lights up or goes dark
}

// pixel mode is decided once per page; the scale follows the window
let PX = false;

function face(): Face {
  const root = el("section", "ic-card");
  const title = el("h2", "ic-title");
  const dots = el("div", "ic-dots");
  dots.setAttribute("role", "img");
  const line = el("p", "ic-line");
  const actions = el("div", "ic-actions");
  const later = el("button", "ic-btn later");
  later.type = "button";
  later.innerHTML = '<span aria-hidden="true">←</span> <b>Later</b>';
  const approve = el("button", "ic-btn approve");
  approve.type = "button";
  approve.innerHTML = '<i class="ic-fill" aria-hidden="true"></i><b>Approve</b> <span aria-hidden="true">→</span>';
  actions.append(later, approve);
  root.append(title, dots, line, actions);
  const f: Face = { root, title, dots, line, later, approve, no: later.querySelector("b")!, yes: approve.querySelector("b")! };
  if (PX) {
    pixelLayer(root, cardScale, paintPlate);
    const l = pixelLayer(later, cardScale, (c, w, h) => paintButton(c, w, h, later.classList.contains("lit")));
    pixelLayer(approve, cardScale, (c, w, h) => paintButton(c, w, h, true));
    f.px = { redrawLater: l.redraw };
  }
  return f;
}

/** A story card with no second answer: only Next, and a left swipe or ← does nothing. */
const solo = (card: View | null) => !!card?.shippy && !card.no;

function fill(f: Face, card: View) {
  f.root.dataset.card = card.id;
  if (card.shippy) return fillStory(f, card as View & { shippy: NonNullable<View["shippy"]> });
  if (f.story) {
    // the same card id came back as a plain card: put the plate back the way face() made it
    f.story.stop();
    f.story.canvas.remove();
    f.story = undefined;
    f.root.classList.remove("ic-story", "solo");
    f.line.removeAttribute("aria-hidden");
    f.later.hidden = false;
    f.title.hidden = false;
  }
  if (card.guide === "shippy" && !f.guide) f.guide = mountShippyGuide(f.root);
  if (card.guide !== "shippy" && f.guide) { f.guide.destroy(); f.guide = undefined; }
  f.no.textContent = card.no || "Later";
  f.yes.textContent = card.yes || "Approve";
  f.root.classList.toggle("hold", !!card.hold);
  if (card.hold) f.approve.setAttribute("aria-label", /^hold\b/i.test(f.yes.textContent!) ? f.yes.textContent! : `Hold to ${f.yes.textContent}`);
  else f.approve.removeAttribute("aria-label");
  f.root.setAttribute("aria-label", card.title);
  f.title.textContent = card.title;
  f.line.textContent = card.line;
  f.line.hidden = !card.line;
  setDots(f, card.dots);
}

function fillStory(f: Face, card: View & { shippy: NonNullable<View["shippy"]> }) {
  f.guide?.destroy();
  f.guide = undefined;
  f.root.classList.add("ic-story");
  f.root.classList.toggle("solo", !card.no);
  f.root.classList.remove("hold");
  f.approve.removeAttribute("aria-label");
  f.no.textContent = card.no || "Later";
  f.yes.textContent = card.yes || "Next";
  f.later.hidden = !card.no;
  f.title.textContent = card.title;
  f.title.hidden = !card.title;
  f.dots.hidden = true;
  // screen readers get the whole line at once; the typed-out text is for the eyes
  f.root.setAttribute("aria-label", [card.title, card.line].filter(Boolean).join(" "));
  f.line.setAttribute("aria-hidden", "true");
  f.line.hidden = false;
  if (!f.story) f.story = mountStoryShippy(f.root, card.shippy);
  else f.story.setPose(card.shippy);
  f.story.say(f.line, card.line);
}

function setDots(f: Face, dots: CardView["dots"], pop?: number) {
  f.dots.hidden = !dots || dots.need <= 0;
  if (!dots || dots.need <= 0) return void f.dots.replaceChildren();
  const need = Math.min(8, dots.need);
  f.dots.setAttribute("aria-label", `${Math.min(dots.have, dots.need)} of ${dots.need} approvals toward automatic`);
  f.dots.replaceChildren(...Array.from({ length: need }, (_, i) => {
    const d = el("span", `ic-dot${i < dots.have ? " on" : ""}${i === pop ? " pop" : ""}`);
    if (PX) {
      // green only once this kind runs on its own (every dot filled); brass while you're still earning it
      const cv = el("canvas", "ic-pxdot");
      cv.width = 7;
      cv.height = 7;
      const c = cv.getContext("2d");
      if (c) paintDot(c, i >= dots.have ? "off" : dots.have >= dots.need ? "done" : "on");
      d.append(cv);
    }
    return d;
  }));
}

export const mountCard: MountCard = (host, handlers) => {
  PX = pixelOn();
  const wrap = el("div", `ironcard${PX ? " px" : ""}`);
  wrap.setAttribute("aria-live", "polite");
  const setScale = () => wrap.style.setProperty("--p", `${cardScale()}px`);
  if (PX) { setScale(); window.addEventListener("resize", setScale); }
  host.appendChild(wrap);

  let shown: View | null = null;
  let live: Face | null = null; // the card you can answer right now
  const answered = new Set<string>();
  let answeredAt = -Infinity;
  let answeredGuide = false; // Shippy talking (tour, first run): no queue of work, so no "All caught up" after it
  let caughtUp: { root: HTMLElement; timer: ReturnType<typeof setTimeout> } | null = null;
  let drag: { pointer: number; x0: number; y0: number; dx: number; dy: number; vx: number; lastX: number; t: number; w: number } | null = null;
  let holding: { timer: ReturnType<typeof setTimeout>; f: Face } | null = null; // a hold card's Approve being held

  let moved = false; // the current press dragged the card: its click is not a tap

  // a story card's tap, Next or →: the first one finishes a line that is still typing, the next one goes on
  const next = (f: Face) => {
    if (live !== f) return;
    if (f.story?.typing()) return f.story.finish();
    answer("approve");
  };

  const stopHold = () => {
    if (!holding) return;
    clearTimeout(holding.timer);
    holding.f.approve.classList.remove("holding");
    holding = null;
  };
  // a hold card answers only once the press has been held HOLD_MS; letting go early just drains the fill
  const startHold = () => {
    if (!live || !shown?.hold || shown.shippy || holding) return;
    const f = live;
    f.approve.classList.add("holding");
    holding = { f, timer: setTimeout(() => { if (holding?.f === f && live === f) { holding = null; f.approve.classList.remove("holding"); answer("approve"); } }, HOLD_MS) };
  };

  const clearCaughtUp = () => {
    if (!caughtUp) return;
    clearTimeout(caughtUp.timer);
    caughtUp.root.remove();
    caughtUp = null;
  };

  const leave = (root: HTMLElement, how: "approve" | "later" | "down") => {
    root.classList.remove("ic-in", "dragging");
    root.classList.add("ic-ghost", how);
    root.setAttribute("aria-hidden", "true");
    root.querySelectorAll("button").forEach((b) => (b.disabled = true));
    const done = () => root.remove();
    root.addEventListener("animationend", (e) => { if ((e as AnimationEvent).animationName.startsWith("ic-out")) done(); });
    setTimeout(done, 1400); // no animation events (reduced motion, hidden tab)
  };

  const setLean = (f: Face, lean: number) => {
    f.root.style.setProperty("--lean-r", String(Math.max(0, lean)));
    f.root.style.setProperty("--lean-l", String(Math.max(0, -lean)));
    f.approve.classList.toggle("lit", lean > 0.15);
    const was = f.later.classList.contains("lit");
    f.later.classList.toggle("lit", lean < -0.35);
    if (was !== f.later.classList.contains("lit")) f.px?.redrawLater();
  };

  const answer = (a: Answer) => {
    if (!live || !shown || answered.has(shown.id)) return;
    const card = shown;
    const f = live;
    answered.add(card.id);
    answeredAt = performance.now();
    answeredGuide = card.guide === "shippy";
    live = null;
    shown = null;
    drag = null;
    stopHold();
    // the ghost starts where the finger let go
    const m = f.root.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/);
    f.root.style.setProperty("--fx", `${m ? m[1] : 0}px`);
    f.root.style.setProperty("--fy", `${m ? m[2] : 0}px`);
    f.root.style.setProperty("--ft", `${m && !PX ? Math.max(-MAX_TILT, Math.min(MAX_TILT, Number(m[1]) * TILT_PER_PX)) : 0}deg`);
    f.root.style.transform = "";
    setLean(f, a === "approve" ? 1 : -1);
    if (a === "approve" && !card.shippy && card.dots && card.dots.have < card.dots.need) {
      setDots(f, { have: card.dots.have + 1, need: card.dots.need }, card.dots.have);
      f.root.classList.add("popping");
    }
    f.guide?.destroy();
    f.story?.stop();
    leave(f.root, a);
    try { navigator.vibrate?.(a === "approve" ? 12 : 6); } catch { /* no haptics */ }
    (a === "approve" ? handlers.onApprove : handlers.onLater)(card.id);
  };

  const mountLive = (card: View) => {
    const f = face();
    fill(f, card);
    f.root.classList.add("ic-in");
    // after an answer the next card waits for the ghost's dot pop before it slides up
    if (performance.now() - answeredAt < AFTER_ANSWER_MS) f.root.classList.add("after");
    f.later.addEventListener("click", () => answer("later"));
    f.approve.addEventListener("click", () => { if (!shown?.hold || shown.shippy) next(f); });
    // a story card: a tap anywhere on the plate goes on too (a drag that snapped back is not a tap)
    f.root.addEventListener("click", (e) => {
      if (!shown?.shippy || live !== f || moved || (e.target as HTMLElement).closest("button")) return;
      next(f);
    });
    f.approve.addEventListener("pointerdown", (e) => { if (e.isPrimary && e.button === 0) startHold(); });
    for (const type of ["pointerup", "pointerleave", "pointercancel"]) f.approve.addEventListener(type, stopHold);
    f.approve.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && shown?.hold) { e.preventDefault(); if (!e.repeat) startHold(); } });
    f.approve.addEventListener("keyup", (e) => { if (e.key === "Enter" || e.key === " ") stopHold(); });
    f.root.addEventListener("pointerdown", (e) => {
      if (!e.isPrimary || e.button !== 0 || (e.target as HTMLElement).closest("button") || live !== f) return;
      moved = false;
      drag = { pointer: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, vx: 0, lastX: e.clientX, t: performance.now(), w: f.root.getBoundingClientRect().width || 320 };
      f.root.classList.add("dragging");
      try { f.root.setPointerCapture(e.pointerId); } catch { /* synthetic pointers */ }
    });
    f.root.addEventListener("pointermove", (e) => {
      if (!drag || drag.pointer !== e.pointerId || live !== f) return;
      const now = performance.now();
      drag.vx = 0.7 * ((e.clientX - drag.lastX) / Math.max(1, now - drag.t)) + 0.3 * drag.vx;
      drag.lastX = e.clientX;
      drag.t = now;
      drag.dx = e.clientX - drag.x0;
      if (Math.abs(drag.dx) > 8) moved = true;
      drag.dy = (e.clientY - drag.y0) * 0.2;
      if (PX) {
        // whole art px only, sideways only, no tilt
        const p = cardScale();
        f.root.style.transform = `translate(${Math.round(drag.dx / p) * p}px, 0px)`;
      } else {
        const tilt = still() ? 0 : Math.max(-MAX_TILT, Math.min(MAX_TILT, drag.dx * TILT_PER_PX));
        f.root.style.transform = `translate(${drag.dx}px, ${drag.dy}px) rotate(${tilt}deg)`;
      }
      setLean(f, leanOf(drag.dx, drag.w, !!shown?.hold));
    });
    const end = (e: PointerEvent, cancel: boolean) => {
      if (!drag || drag.pointer !== e.pointerId || live !== f) return;
      const a = cancel ? null : swipeAnswer(drag.dx, drag.w, drag.vx, !!shown?.hold && !shown.shippy);
      if (a && !(a === "later" && solo(shown))) return answer(a);
      drag = null;
      f.root.classList.remove("dragging");
      f.root.style.transform = "";
      setLean(f, 0);
    };
    f.root.addEventListener("pointerup", (e) => end(e, false));
    f.root.addEventListener("pointercancel", (e) => end(e, true));
    f.root.addEventListener("lostpointercapture", (e) => end(e, true));
    wrap.appendChild(f.root);
    return f;
  };

  const onKey = (e: KeyboardEvent) => {
    if (!live || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.key === "ArrowRight") { e.preventDefault(); if (shown?.shippy) { if (!e.repeat) next(live); } else if (!shown?.hold) answer("approve"); else if (!e.repeat) startHold(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); if (!solo(shown)) answer("later"); }
  };
  const onKeyUp = (e: KeyboardEvent) => { if (e.key === "ArrowRight") stopHold(); };
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", stopHold);

  return {
    show(card, opts) {
      if (card && answered.has(card.id)) return; // the source hasn't caught up with our answer yet
      answered.clear(); // it has: a call dealt again later (the story after a Later) is a new question
      if (card && shown?.id === card.id && live) {
        shown = card;
        fill(live, card); // same card, fresher words or dots: update in place, keep any drag going
        return;
      }
      if (live) {
        // the source swapped or dropped the card underneath us (answered elsewhere): it steps down, unanswered
        stopHold();
        live.guide?.destroy();
        live.story?.stop();
        leave(live.root, "down");
        live = null;
        drag = null;
      }
      shown = card;
      if (card) {
        clearCaughtUp();
        live = mountLive(card);
        return;
      }
      if (!opts?.quiet && !answeredGuide && performance.now() - answeredAt < AFTER_ANSWER_MS && !caughtUp) {
        const root = el("section", "ic-card ic-in after ic-empty");
        root.append(el("h2", "ic-title", "All caught up"), el("p", "ic-line", "Nothing is waiting on you."));
        if (PX) pixelLayer(root, cardScale, paintPlate);
        wrap.appendChild(root);
        caughtUp = { root, timer: setTimeout(() => { if (caughtUp?.root === root) { caughtUp = null; leave(root, "down"); } }, CAUGHT_UP_MS) };
      }
    },
    destroy() {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", stopHold);
      window.removeEventListener("resize", setScale);
      stopHold();
      clearCaughtUp();
      live?.guide?.destroy();
      live?.story?.stop();
      wrap.remove();
      live = null;
      shown = null;
    },
  };
};
