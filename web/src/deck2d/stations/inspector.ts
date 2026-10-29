import { STOP_LABEL, type CardView, type DeckView, type StopId } from "../contract";
import { needsAttention } from "./attention";

/** Machine selection uses the existing swipe card; only the rehearsal can simulate repairs. */
export function createMachineInteraction(repair?: (id: StopId) => void) {
  let selected: StopId | null = null, revision = 0;
  let shown: CardView | null = null, blocked = false, attention = false;
  return {
    select(id: StopId) { selected = id; revision++; },
    view(base: DeckView): DeckView {
      if (!selected) return base;
      const stop = base.stops.find(s => s.id === selected);
      if (!stop) { selected = null; return base; }
      blocked = stop.state === "jammed" || base.jam === selected;
      attention = !blocked && needsAttention(base, selected);
      // Preserve the actual approval, reason and hold-to-merge behavior when one is available.
      shown = base.card?.stop === selected ? base.card : {
        id: `machine-info-${revision}-${selected}-${stop.state}-${attention}`,
        stop: selected, dots: null,
        title: `${STOP_LABEL[selected]} ${blocked ? "is blocked" : attention ? "needs your review" : stop.state === "idle" ? "is ready" : "is running"}`,
        line: attention ? "Shippy: Everything is connected. I just need your approval before starting this job." : blocked ? repair
          ? "Shippy: A simulated jam stopped this bay. Swipe right and I'll clear it."
          : "Shippy: This bay is stopped. There's no repair approval waiting here yet."
          : stop.state === "idle" ? "Shippy: Ready for the next job. Everything is quiet here."
          : "Shippy: All good here. The green light means this machine is working.",
        yes: repair && attention ? "Approve job" : blocked && repair ? "Clear jam" : "Got it", no: "Later",
      };
      return { ...base, card: shown, shippy: { at: selected, pose: blocked ? "alarmed" : "inspect" } };
    },
    answer(id: string, approve: boolean) {
      if (!selected || shown?.id !== id) return false;
      const local = id.startsWith("machine-info-");
      if (local && approve && (blocked || attention) && repair) repair(selected);
      selected = null; shown = null;
      return local; // real cards still go through their authoritative source
    },
  };
}
