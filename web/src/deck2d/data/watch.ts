import { continueOption } from "@shiptorio/shared";
import type { DeckSource, StopId } from "../contract";
import { createLiveSource } from "./source";
import { FLIGHT_SECONDS } from "../launch/flight";

/** Explicitly opt in; a live URL can never acquire automatic approvals. */
export function isWatchMode(search: string): boolean {
  const q = new URLSearchParams(search);
  return q.get("source") === "sim" && q.get("watch") === "1";
}

/** Uses the ordinary simulator protocol and adapter. No live connection or real merges. */
export function createWatchSource() {
  const connect = () => createLiveSource({ kind: "sim", scenario: "deck-watch", repo: "" });
  let source = connect();
  let replacement: typeof source | null = null;
  let pending = "", waiting = 0, finished = 0;
  const watch: DeckSource & { close(): void; reset(): void; state: typeof source.state } = {
    state: () => source.state(),
    step(dt) {
      if (replacement) {
        // Keep the built scene until the next snapshot exists. A null view for even
        // one frame makes the build layer replay every station's construction.
        if (!replacement.state()) return;
        source = replacement; replacement = null;
        pending = ""; waiting = 0; finished = 0;
      }
      const card = source.view().card;
      if (card?.id !== pending) { pending = card?.id ?? ""; waiting = 0; }
      if (card) {
        waiting += dt;
        const state = source.state();
        const move = state?.deck?.find(m => m.id === card.id) ?? (state?.move?.id === card.id ? state.move : null);
        // Only the two actions needed for this simulated job; never approve unrelated cards.
        const actions = move ? continueOption(move).actions : [];
        if (move && waiting >= 2.5 && actions.length > 0 && actions.every(a => ["start_job", "request_merge"].includes(a.tool))) {
          source.approve(card.id);
          waiting = 0;
        }
      }
      if (source.view().shipped > 0) { finished += dt; if (finished >= FLIGHT_SECONDS + 4) watch.reset(); }
    },
    view() {
      const v = source.view();
      const item = source.state()?.items[0];
      const broken = item?.state === "rejected";
      const jam: StopId | null = broken ? "builder" : null;
      return { ...v, card: null, jam,
        stops: v.stops.map(s => ({ ...s,
          state: s.id === jam ? "jammed" as const : s.state === "jammed" ? "working" as const : s.state,
          waiting: s.id === jam ? s.waiting : undefined,
          items: s.items.map(it => ({ ...it, look: it.look === "wait" && s.id !== jam ? "plain" as const : it.look })),
        })),
        shippy: broken ? { at: "builder" as const, pose: "alarmed" as const } : v.shippy,
        caption: `${v.shipped ? "Shipped! Shippy heads home. Replaying shortly…" : broken ? "A check failed. Sending the fix back for repair…" : item?.state === "working" ? item.attempts > 1 ? "Shippy is repairing the failed build." : "Shippy is building the checkout fix." : item?.state === "inspecting" ? "Checking the fix…" : item?.state === "on_pad" ? "All checks passed. Preparing to launch…" : item?.attempts ? "The fix heads back to the Builder for another try." : "A new job is arriving. Shippy will take it from here."}`,
      };
    },
    approve() {}, later() {},
    reset() { if (replacement) return; source.close(); replacement = connect(); },
    close() { source.close(); replacement?.close(); replacement = null; },
  };
  return watch;
}
