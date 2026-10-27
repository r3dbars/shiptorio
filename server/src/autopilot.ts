// Dogfood autopilot rules (server/scripts/autopilot.ts). Pure, so the allowlist stays tested.
import type { Move } from "@shiptorio/shared";

/** Which recommended options autopilot may tap. Anything else waits for the human. */
/** held: item ids whose launch a human is holding (AUTOPILOT_HOLD), e.g. a green PR known to be wrong. */
export function allowedTap(card: Move, held: ReadonlySet<string> = new Set()): { optionId: string; why: string } | { skip: string } {
  const option = card.options.find(o => o.recommended);
  if (!option) return { skip: "no recommended option" };
  const action = option.actions[0];
  if (!action) return { skip: `recommended "${option.label}" does nothing` };
  if (action.tool === "plan_runner_job" || action.tool === "approve_runner_job") return { optionId: option.id, why: action.tool };
  if (action.tool === "request_merge") {
    if (card.locked) return { skip: "locked launch card" };
    if (action.args?.overrule) return { skip: "overrule is the human's call" };
    if (card.itemId && held.has(card.itemId)) return { skip: "launch held by AUTOPILOT_HOLD" };
    return { optionId: option.id, why: "launch with every stamp" };
  }
  if (action.tool === "set_autonomy" && action.args?.permit === true) return { optionId: option.id, why: "accept earned launch permit" };
  return { skip: `tool ${action.tool} is not on the autopilot list` };
}
