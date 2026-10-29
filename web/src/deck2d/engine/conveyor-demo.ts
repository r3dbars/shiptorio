import { STOPS, STOP_LABEL, type DeckSource, type StopId } from "../contract";
import type { AttentionView } from "../stations/attention";

export function createConveyorDemo() {
  let revision = 0, showCard = true;
  const issue = () => `issue-101-${revision}`;
  let station = 0, phase: "ready" | "travel" | "work" | "review" | "gate" | "done" = "ready", age = 0, blocked = false;
  const move = () => { station++; phase = "travel"; age = 0; showCard = true; };
  const cardId = () => `conveyor-${revision}-${phase}`;
  const demo: DeckSource & { paused: boolean; readonly canBlock: boolean; selectStop(stop: StopId): void; toggleBlock(): void; replay(): void; arrive(id: string, stop: StopId): void } = {
    paused: false,
    get canBlock() { return phase !== "ready" && phase !== "done"; },
    selectStop(stop) { if (stop === STOPS[station]) showCard = true; },
    toggleBlock() { if (phase !== "ready" && phase !== "done") { blocked = !blocked; showCard = true; } },
    replay() { revision++; station = 0; phase = "ready"; age = 0; blocked = false; demo.paused = false; showCard = true; },
    arrive(id, stop) {
      if (blocked || id !== issue() || stop !== STOPS[station] || phase !== "travel") return;
      phase = station === 4 ? "review" : station === 5 ? "gate" : station === 6 ? "done" : "work";
      age = 0;
    },
    step(dt) {
      if (!demo.paused && !blocked && phase === "work" && (age += dt) >= (station === 2 ? 4 : 2.5)) move();
    },
    view(): AttentionView & { followItem?: string } {
      const stop = STOPS[station], pr = station >= 3, waiting = ["ready", "review", "gate"].includes(phase);
      const badge = pr ? "PR301" : "#101";
      return {
        stops: STOPS.map(id => ({ id, built: true, automated: false,
          state: id === stop ? blocked ? "jammed" : phase === "work" ? "working" : "idle" : "idle",
          items: id === stop && phase !== "ready" && phase !== "done" ? [{ id: issue(), title: "Fix checkout retries", look: blocked ? "bad" : pr ? "ok" : "plain", badge, spawnAt: "repo" }] : [],
        })),
        followItem: phase === "travel" && !blocked ? issue() : undefined,
        focus: phase !== "done" ? stop : undefined,
        attention: waiting && !blocked ? [stop] : [], jam: blocked ? stop : null,
        shippy: blocked ? { at: stop, pose: "alarmed" } : phase === "work" ? { at: stop, pose: station === 2 ? "weld" : "inspect" } : waiting ? { at: stop, pose: "inspect" } : { at: "corner", pose: "folded" },
        shipped: phase === "done" ? 1 : 0,
        card: blocked && showCard ? {
          id: `conveyor-${revision}-blocked`, stop, dots: null, title: `${STOP_LABEL[stop]} is blocked`,
          line: "Shippy: This preview bay is stopped. Clear it to let the same crate continue.", yes: "Clear blockage", no: "Later",
        } : waiting && !blocked && showCard ? {
          id: cardId(), stop, dots: null,
          title: phase === "ready" ? "Start issue #101: Fix checkout retries?" : phase === "review" ? "Review PR #301" : "Ship PR #301?",
          line: phase === "ready" ? "Shippy: Follow this issue through the line. This is a local animation preview." : phase === "review" ? "Shippy: The same issue is now a PR. Checks passed; your review is next." : "Shippy: Ready for the launch pad. This only launches the preview rocket.",
          yes: phase === "ready" ? "Start issue" : phase === "review" ? "Approve review" : "Launch preview", no: "Later",
        } : null,
        caption: blocked ? `${badge} · ${STOP_LABEL[stop]} is blocked. This belt bay is stopped.` : phase === "done" ? "PR #301 shipped. Replay to follow the issue again." : `${badge} · Fix checkout retries · ${phase === "travel" ? `Moving to ${STOP_LABEL[stop]}` : phase === "work" ? `Inside ${STOP_LABEL[stop]}` : "Ready"}`,
      };
    },
    approve(id) {
      if (blocked && id === `conveyor-${revision}-blocked`) { blocked = false; return; }
      if (id !== cardId() || blocked) return;
      if (phase === "ready" || phase === "review" || phase === "gate") move();
    },
    later(id) { if (id === cardId() || id === `conveyor-${revision}-blocked`) showCard = false; },
  };
  return demo;
}
