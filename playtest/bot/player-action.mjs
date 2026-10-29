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
