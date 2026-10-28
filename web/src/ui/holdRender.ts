import type { HoldEvents } from "./holdLaunch";

// Give genuine consent holds the main thread. Successful consent can replace its
// button before the finger/key ends: that physical gesture still owns its lease.
const active = new Set<object>();
type Physical = { kind: "pointer"; id: number; pointerType: string } | { kind: "key"; key: string };
type Surfaces = { window: EventTarget; document: EventTarget & { readonly visibilityState?: string } };
export function holdRenderYield(events: HoldEvents, surfaces?: Surfaces) {
  const owner = {};
  let physical: Physical | null = null, completed = false, disposed = false;
  let removeListeners: (() => void) | undefined;
  const clear = () => {
    active.delete(owner);
    physical = null; completed = false;
    removeListeners?.(); removeListeners = undefined;
  };
  const begin = (gesture: Physical): boolean => {
    if (disposed || physical) return false;
    const target = surfaces ?? (typeof window !== "undefined" && typeof document !== "undefined" ? { window, document } : null);
    if (!target) return false;
    physical = gesture; completed = false;
    const end = (event: Event) => {
      if (physical?.kind === "pointer" && (event as PointerEvent).pointerId === physical.id ||
          physical?.kind === "key" && (event as KeyboardEvent).key === physical.key) clear();
    };
    const fresh = (event: Event) => {
      if (!completed) return;
      const pointer = event as PointerEvent, key = event as KeyboardEvent;
      if (physical?.kind === "pointer" && pointer.isPrimary && pointer.button === 0 && (physical.pointerType ? pointer.pointerType === physical.pointerType : pointer.pointerId === physical.id) ||
          physical?.kind === "key" && !key.repeat && key.key === physical.key) clear();
    };
    const hidden = () => { if (target.document.visibilityState !== "visible") clear(); };
    // Capture at the window survives button removal and pointer-capture loss.
    target.window.addEventListener("pointerdown", fresh, true);
    target.window.addEventListener("keydown", fresh, true);
    target.window.addEventListener("pointerup", end, true);
    target.window.addEventListener("pointercancel", end, true);
    target.window.addEventListener("keyup", end, true);
    target.window.addEventListener("blur", clear);
    target.document.addEventListener("visibilitychange", hidden);
    removeListeners = () => {
      target.window.removeEventListener("pointerdown", fresh, true);
      target.window.removeEventListener("keydown", fresh, true);
      target.window.removeEventListener("pointerup", end, true);
      target.window.removeEventListener("pointercancel", end, true);
      target.window.removeEventListener("keyup", end, true);
      target.window.removeEventListener("blur", clear);
      target.document.removeEventListener("visibilitychange", hidden);
    };
    return true;
  };
  return {
    mount() { disposed = false; }, // React StrictMode may replay effect cleanup/setup on the same controller.
    pointerDown: (id: number, pointerType = "") => begin({ kind: "pointer", id, pointerType }),
    keyDown: (key: string) => begin({ kind: "key", key }),
    events: {
      ...events,
      arm: () => { active.add(owner); events.arm(); },
      cancel: () => { clear(); events.cancel(); },
      launch: (card: string) => {
        completed = true;
        if (!physical) clear(); // assistive/programmatic consent has no physical press to retain
        events.launch(card);
      },
    },
    dispose() {
      disposed = true;
      // An abandoned hold releases now. A completed native hold transfers just
      // its token/listeners until actual up/cancel/blur/hidden; never React callbacks.
      if (!completed || !physical) clear();
    },
  };
}

export function submitWhenUnheld(submit: () => void) {
  if (active.size) return false;
  submit();
  return true;
}
