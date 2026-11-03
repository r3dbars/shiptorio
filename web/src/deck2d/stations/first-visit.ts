import { STOPS, type DeckSource, type CardView } from "../contract";
import type { AttentionView } from "./attention";

/** Two sample issues, no GitHub calls. The decisions use the same swipe card as live work. */
export function createFirstVisitDemo(options: { ready?: () => boolean } = {}): DeckSource {
  const issues = ["Fix checkout retries", "Fix the stale cart badge"];
  let index = 0, stage: "choose" | "activate" | "build" | "review" | "done" = "choose", age = 0;
  const advance = () => { index++; age = 0; stage = index < issues.length ? "choose" : "done"; };
  const id = () => `first-visit-${index}-${stage}`;
  return {
    step(dt) {
      if (stage === "activate") {
        if (options.ready?.() === false) { age = 0; return; }
        if ((age += dt) >= 1.3 - 1e-9) { stage = "build"; age = 0; }
      } else if (stage === "build" && (age += dt) >= 6) { stage = "review"; age = 0; }
    },
    view(): AttentionView {
      const target = stage === "review" ? "review" : "planner";
      const card: CardView | null = stage === "choose" || stage === "review" ? {
        id: id(), stop: target, dots: null,
        title: stage === "choose" ? `Start an agent: ${issues[index]}?` : `Review: ${issues[index]}`,
        line: stage === "choose" ? `Shippy: Here are two sample GitHub issues. ${index === 0 ? "This is the first." : "This is the second."} Want an agent to work on it?` : "Shippy: The change is ready. This needs your review, not a repair.",
        yes: stage === "choose" ? "Start agent" : "Approve", no: stage === "choose" ? "Next issue" : "Later",
      } : null;
      return {
        stops: STOPS.map(stop => ({ id: stop, built: true, state: (stage === "build" && stop === "builder") || (stage === "activate" && age >= 0.65 && stop === "planner") ? "working" : "idle", automated: false, items: [] })),
        attention: card ? [target] : [], jam: null, card, shipped: 0,
        focus: stage === "activate" ? "planner" : stage === "build" ? "builder" : card ? target : undefined,
        shippy: stage === "activate" ? { at: "planner", pose: "lever" } : stage === "build" ? { at: "builder", pose: "weld" } : card ? { at: target, pose: "inspect" } : { at: "corner", pose: "folded" },
        caption: stage === "activate" ? "Shippy is starting the machine." : stage === "build" ? "PREVIEW · Agent working. No blocker; the machine is green." : stage === "done" ? "PREVIEW · Both sample issues reviewed. Reload to replay." : null,
      };
    },
    approve(cardId) { if (cardId !== id()) return; if (stage === "choose") { stage = "activate"; age = 0; } else if (stage === "review") advance(); },
    later(cardId) { if (cardId === id() && (stage === "choose" || stage === "review")) advance(); },
  };
}
