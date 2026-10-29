// Only an authoritative launched-state transition ends an outstanding UI action.
// All failures before that transition still fail the playtest.
export function playerAction(action, launchConfirmed) {
  return Promise.race([action().then(() => false), launchConfirmed.then(() => true)]);
}

// The end-to-end player may approve fixture work, never account or engine removal.
export function assertSafePrimaryAction(label) {
  if (/\b(?:disconnect|unplug|delete|erase|reset)\b/i.test(label))
    throw new Error("Refusing destructive player-bot action");
}

// Accept the visible, scoped decision rather than blindly clicking a right button.
export function fixtureCardIntent(label, title, actionTools = []) {
  const text = label.replace(/[←→]/g, "").trim();
  assertSafePrimaryAction(text);
  if (/^(Please wait|Loading|Checking)/i.test(text)) return "wait";
  if (text === "Plan" || text === "Start issue") {
    if (/^#\d+:|^Plan #\d+:/i.test(title)) return "plan-issue";
  } else if (text === "Start build") {
    if (/^Build #\d+:/i.test(title) && actionTools.includes("approve_runner_job")) return "approve-build";
  } else if (text === "Open inbox" && /Codex engine is ready/i.test(title)) return "open-inbox";
  else if (["Refresh", "Try again"].includes(text) && /engine|connection|issues|repo|inbox/i.test(title)) return "refresh";
  else if (["More issues", "More repos"].includes(text)) return "next-page";
  else if (text === "Continue" && actionTools.length && actionTools.every(tool => ["plan_runner_job", "approve_runner_job", "inspect_bottleneck", "run_missing_check", "request_rework"].includes(tool))) return "continue-work";
  throw new Error(`Unsupported player card action: ${text}`);
}

/** A reconnect snapshot is authoritative even before a separate deck message. */
export function fixtureDecisionDeck(previous, message) {
  const state = message.type === "snapshot" ? message.state : message.type === "patch" ? message.patch : null;
  if (state && Array.isArray(state.deck)) return state.deck;
  if (state && Object.hasOwn(state, "move")) return state.move ? [state.move] : [];
  if (message.type === "deck") return message.deck;
  if (message.type === "move") return [...previous.filter(move => move.id !== message.move.id), message.move];
  if (message.type === "move_resolved") return previous.filter(move => move.id !== message.moveId);
  return message.type === "snapshot" ? [] : previous;
}
