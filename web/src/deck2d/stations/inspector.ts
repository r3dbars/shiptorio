import { STOP_LABEL, type CardView, type DeckView, type StopId } from "../contract";
import { needsAttention } from "./attention";
import type { LiveDeckView } from "../data/view";

/** Machine selection uses the existing swipe card; only the rehearsal can simulate repairs. */
export function createMachineInteraction(repair?: (id: StopId) => void) {
  let selected: StopId | null = null, revision = 0;
  let shown: CardView | null = null, blocked = false, attention = false;
  let observedWork = '';
  return {
    select(id: StopId) { selected = id; revision++; },
    view(base: DeckView): DeckView {
      if (!selected) return base;
      const work = (base as LiveDeckView).work;
      const key = work ? `${work.id}:${work.stop}` : '';
      if (observedWork && key !== observedWork) { selected = null; observedWork = key; return base; }
      observedWork = key;
      const stop = base.stops.find(s => s.id === selected);
      if (!stop) { selected = null; return base; }
      blocked = stop.state === "jammed" || base.jam === selected;
      attention = !blocked && needsAttention(base, selected);
      // Preserve the actual approval, reason and hold-to-merge behavior when one is available.
      shown = base.card?.stop === selected ? base.card : {
        id: `machine-info-${revision}-${selected}-${stop.state}-${attention}`,
        stop: selected, dots: null,
        title: work?.stop === selected ? `${work.badge} · ${STOP_LABEL[selected]}` : `${STOP_LABEL[selected]} ${blocked ? "is blocked" : attention ? "needs your review" : stop.state === "idle" ? "is ready" : "is running"}`,
        line: work ? work.stop === selected ? `Shippy: ${work.title}. ${work.status === 'waiting_player' ? 'Your approval is needed here.' : `This item is being processed at ${STOP_LABEL[selected]}.`}` : `Shippy: No work in this machine. ${work.badge} is at ${STOP_LABEL[work.stop]}.` : attention ? "Shippy: Everything is connected. I just need your approval before starting this job." : blocked ? repair
          ? "Shippy: A simulated jam stopped this bay. Swipe right and I'll clear it."
          : "Shippy: This bay is stopped. There's no repair approval waiting here yet."
          : stop.state === "idle" ? "Shippy: Ready for the next job. Everything is quiet here."
          : "Shippy: All good here. The blue light means this machine is running.",
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
