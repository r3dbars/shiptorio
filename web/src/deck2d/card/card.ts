// The one iron swipe card at the bottom of the 2D deck (contract.ts: MountCard). Plain DOM, no React.
// Thread "Build the iron swipe card"; target = Justin's mock: pixel title, ●○○ trust dots, one line, ← Later / Approve →.
//
// Swipe right or tap Approve, swipe left or tap Later, or use the arrow keys. A drag tilts the card and lights the
// button it is heading for. Letting go past the line answers: an approve pops the next dot, then the card flies off as
// a ghost while the source deals the next one, which slides up from below. One answer per card, ever.
// show(null) right after an answer says "All caught up" for a moment, then the card steps aside for the caption.

import type { CardView, MountCard } from "../contract";
import "./card.css";

const SWIPE_SHARE = 0.28; // let go past this share of the card's width to answer
const MIN_SWIPE_PX = 60;
const FLICK = 0.6; // px/ms: a quick flick that way answers too
const TILT_PER_PX = 0.06; // degrees
const MAX_TILT = 14;
const CAUGHT_UP_MS = 2200; // how long "All caught up" stays before the caption takes over
const AFTER_ANSWER_MS = 900; // a show(null) this soon after an answer is the deck running dry, not a hide

export type Answer = "approve" | "later";

/** Which way a drag answers, if at all: past the line, or a quick flick that way. */
export function swipeAnswer(dx: number, width: number, vx = 0): Answer | null {
  const line = Math.max(MIN_SWIPE_PX, width * SWIPE_SHARE);
  if (dx > line || (dx > 40 && vx > FLICK)) return "approve";
  if (dx < -line || (dx < -40 && vx < -FLICK)) return "later";
  return null;
}

/** -1..1: how far a drag leans toward Later (-) or Approve (+). */
export const leanOf = (dx: number, width: number) => Math.max(-1, Math.min(1, dx / Math.max(MIN_SWIPE_PX, width * SWIPE_SHARE)));

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
}

function face(): Face {
  const root = el("section", "ic-card");
  const title = el("h2", "ic-title");
  const dots = el("div", "ic-dots");
  dots.setAttribute("role", "img");
  const line = el("p", "ic-line");
  const actions = el("div", "ic-actions");
  const later = el("button", "ic-btn later");
  later.type = "button";
  later.innerHTML = '<span aria-hidden="true">←</span> Later';
  const approve = el("button", "ic-btn approve");
  approve.type = "button";
  approve.innerHTML = 'Approve <span aria-hidden="true">→</span>';
  actions.append(later, approve);
  root.append(title, dots, line, actions);
  return { root, title, dots, line, later, approve };
}

function fill(f: Face, card: CardView) {
  f.root.dataset.card = card.id;
  f.root.setAttribute("aria-label", card.title);
  f.title.textContent = card.title;
  f.line.textContent = card.line;
  f.line.hidden = !card.line;
  setDots(f, card.dots);
}

function setDots(f: Face, dots: CardView["dots"], pop?: number) {
  f.dots.hidden = !dots || dots.need <= 0;
  if (!dots || dots.need <= 0) return void f.dots.replaceChildren();
  const need = Math.min(8, dots.need);
  f.dots.setAttribute("aria-label", `${Math.min(dots.have, dots.need)} of ${dots.need} approvals toward automatic`);
  f.dots.replaceChildren(...Array.from({ length: need }, (_, i) => el("span", `ic-dot${i < dots.have ? " on" : ""}${i === pop ? " pop" : ""}`)));
}

export const mountCard: MountCard = (host, handlers) => {
  const wrap = el("div", "ironcard");
  wrap.setAttribute("aria-live", "polite");
  host.appendChild(wrap);

  let shown: CardView | null = null;
  let live: Face | null = null; // the card you can answer right now
  const answered = new Set<string>();
  let answeredAt = -Infinity;
  let caughtUp: { root: HTMLElement; timer: ReturnType<typeof setTimeout> } | null = null;
  let drag: { pointer: number; x0: number; y0: number; dx: number; dy: number; vx: number; lastX: number; t: number; w: number } | null = null;

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
    f.later.classList.toggle("lit", lean < -0.35);
  };

  const answer = (a: Answer) => {
    if (!live || !shown || answered.has(shown.id)) return;
    const card = shown;
    const f = live;
    answered.add(card.id);
    answeredAt = performance.now();
    live = null;
    shown = null;
    drag = null;
    // the ghost starts where the finger let go
    const m = f.root.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/);
    f.root.style.setProperty("--fx", `${m ? m[1] : 0}px`);
    f.root.style.setProperty("--fy", `${m ? m[2] : 0}px`);
    f.root.style.setProperty("--ft", `${m ? Math.max(-MAX_TILT, Math.min(MAX_TILT, Number(m[1]) * TILT_PER_PX)) : 0}deg`);
    f.root.style.transform = "";
    setLean(f, a === "approve" ? 1 : -1);
    if (a === "approve" && card.dots && card.dots.have < card.dots.need) {
      setDots(f, { have: card.dots.have + 1, need: card.dots.need }, card.dots.have);
      f.root.classList.add("popping");
    }
    leave(f.root, a);
    try { navigator.vibrate?.(a === "approve" ? 12 : 6); } catch { /* no haptics */ }
    (a === "approve" ? handlers.onApprove : handlers.onLater)(card.id);
  };

  const mountLive = (card: CardView) => {
    const f = face();
    fill(f, card);
    f.root.classList.add("ic-in");
    // after an answer the next card waits for the ghost's dot pop before it slides up
    if (performance.now() - answeredAt < AFTER_ANSWER_MS) f.root.classList.add("after");
    f.later.addEventListener("click", () => answer("later"));
    f.approve.addEventListener("click", () => answer("approve"));
    f.root.addEventListener("pointerdown", (e) => {
      if (!e.isPrimary || e.button !== 0 || (e.target as HTMLElement).closest("button") || live !== f) return;
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
      drag.dy = (e.clientY - drag.y0) * 0.2;
      const tilt = still() ? 0 : Math.max(-MAX_TILT, Math.min(MAX_TILT, drag.dx * TILT_PER_PX));
      f.root.style.transform = `translate(${drag.dx}px, ${drag.dy}px) rotate(${tilt}deg)`;
      setLean(f, leanOf(drag.dx, drag.w));
    });
    const end = (e: PointerEvent, cancel: boolean) => {
      if (!drag || drag.pointer !== e.pointerId || live !== f) return;
      const a = cancel ? null : swipeAnswer(drag.dx, drag.w, drag.vx);
      if (a) return answer(a);
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
    if (e.key === "ArrowRight") { e.preventDefault(); answer("approve"); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); answer("later"); }
  };
  window.addEventListener("keydown", onKey);

  return {
    show(card) {
      if (card && answered.has(card.id)) return; // the source hasn't caught up with our answer yet
      if (card && shown?.id === card.id && live) {
        shown = card;
        fill(live, card); // same card, fresher words or dots: update in place, keep any drag going
        return;
      }
      if (live) {
        // the source swapped or dropped the card underneath us (answered elsewhere): it steps down, unanswered
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
      if (performance.now() - answeredAt < AFTER_ANSWER_MS && !caughtUp) {
        const root = el("section", "ic-card ic-in after ic-empty");
        root.append(el("h2", "ic-title", "All caught up"), el("p", "ic-line", "Nothing is waiting on you."));
        wrap.appendChild(root);
        caughtUp = { root, timer: setTimeout(() => { if (caughtUp?.root === root) { caughtUp = null; leave(root, "down"); } }, CAUGHT_UP_MS) };
      }
    },
    destroy() {
      window.removeEventListener("keydown", onKey);
      clearCaughtUp();
      wrap.remove();
      live = null;
      shown = null;
    },
  };
};
