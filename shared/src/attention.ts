// When the game may interrupt the player (docs/ATTENTION.md). Every card is one of three kinds:
// approve (work is parked on a yes), steer (the line is stuck and the best guess isn't sure), or
// suggest (an idea; nothing is waiting). Pure, so server, web and sim sort cards the same way.

import type { Item, Move } from "./model";

export type Attention = "approve" | "steer" | "suggest";

// Parked work with an obvious answer: plans, builds, launches, the missing check, a customer reply.
// (start_job, request_rework and send_customer_reply are the simulator's names for the same steps.)
const APPROVE_TOOLS = new Set(["plan_runner_job", "approve_runner_job", "request_merge", "run_missing_check", "review_customer_reply", "start_job", "request_rework", "send_customer_reply"]);
// Cards the factory raises when it can't move on its own.
const STEER_PREFIXES = ["stuck:", "reliability:", "failed:", "bottleneck:"];

export function attentionOf(move: Move, item?: Item): Attention {
  if (move.attention) return move.attention;
  const tools = move.options.flatMap((o) => o.actions.map((a) => a.tool));
  if (STEER_PREFIXES.some((p) => move.id.startsWith(p)) || tools.includes("escalate")) return "steer";
  // No builder plugged in while work waits: the line can't move until the player acts.
  if (move.stage === "resources" && tools.includes("connect_source")) return "steer";
  // A rework card: the first failure has an obvious answer (send it back with the scar); a second one, or no way
  // to rework at all, needs a real call.
  if (move.options.some((o) => o.id === "overrule")) {
    const canRework = move.options.some((o) => o.id.startsWith("rework-"));
    return !canRework || (item?.scars?.length ?? 0) >= 2 ? "steer" : "approve";
  }
  if (tools.some((t) => APPROVE_TOOLS.has(t))) return "approve";
  if (move.kind === "ship" || move.kind === "reply" || move.kind === "build") return "approve";
  return "suggest";
}

/** The one option Continue runs: the suggested pick, or the first option with an action. */
export function continueOption(move: Move) {
  return move.options.find((o) => o.recommended) ?? move.options.find((o) => o.actions.length) ?? move.options[0];
}
