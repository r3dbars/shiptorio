// How long until a cart is ready to launch (Justin's pick r5-eta B): shown only in the cart's callout, "About 6 min
// to launch". Learned from how long real items stay in each stage on this page, starting from typical times.

import type { FactoryState, Item, ItemState } from "@shiptorio/shared";

// The stages a cart still rides before it reaches the pad, in order.
const AHEAD: ItemState[] = ["queued", "working", "inspecting", "passed"];
const TYPICAL: Partial<Record<ItemState, number>> = { queued: 2 * 60_000, working: 6 * 60_000, inspecting: 3 * 60_000, passed: 60_000, rejected: 60_000 };
const KEEP = 8; // the last few real stage times per stage
const MIN_LEFT = 30_000; // a stage running long still has a little left, never "0 min"

export class Etas {
  private readonly seen = new Map<string, { state: ItemState; since: number }>();
  private readonly took = new Map<ItemState, number[]>();

  /** Note every stage change: how long the item spent in the stage it just left. */
  observe(state: FactoryState, now: number) {
    for (const it of state.items) {
      const was = this.seen.get(it.id);
      if (was && was.state === it.state) continue;
      if (was) {
        const list = this.took.get(was.state) ?? [];
        list.push(Math.max(0, now - was.since));
        if (list.length > KEEP) list.shift();
        this.took.set(was.state, list);
      }
      // first sight: its updatedAt is the best guess at when it entered this stage
      this.seen.set(it.id, { state: it.state, since: was ? now : Math.min(it.updatedAt || now, now) });
    }
  }

  /** a stage's usual time: the median of what this page saw, else the typical time */
  typical(s: ItemState): number {
    const list = this.took.get(s);
    if (!list?.length) return TYPICAL[s] ?? 0;
    const sorted = [...list].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  /** ms until this item reaches the launch pad, or undefined when there's no honest answer */
  left(item: Item, now: number): number | undefined {
    if (item.priority === "park") return undefined;
    const at = item.state === "rejected" ? 0 : AHEAD.indexOf(item.state);
    if (at < 0) return undefined; // not on the line yet, or already at the pad
    const since = this.seen.get(item.id)?.since ?? item.updatedAt;
    let ms = Math.max(this.typical(item.state) - Math.max(0, now - since), MIN_LEFT);
    // a rework goes back through the builder and the checks
    for (const s of AHEAD.slice(item.state === "rejected" ? 1 : at + 1)) ms += this.typical(s);
    return ms;
  }
}

export const etas = new Etas();

/** "About 6 min to launch"; "Ready to launch" on the pad; nothing when there's no honest answer */
export function etaLine(item: Item, now = Date.now(), e: Etas = etas): string | undefined {
  if (item.state === "on_pad") return "Ready to launch";
  const ms = e.left(item, now);
  if (ms === undefined) return undefined;
  const min = Math.max(1, Math.round(ms / 60_000));
  return min < 90 ? `About ${min} min to launch` : `About ${Math.round(min / 60)} h to launch`;
}
