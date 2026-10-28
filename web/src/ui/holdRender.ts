import type { HoldEvents } from "./holdLaunch";

// Give genuine consent holds the main thread: keep their UI frames/timing running,
// but defer expensive scene submission. Each mounted control owns its own lease.
const active = new Set<object>();
export function holdRenderYield(events: HoldEvents) {
  const owner = {};
  const dispose = () => { active.delete(owner); };
  return {
    events: {
      ...events,
      arm: () => { active.add(owner); events.arm(); },
      cancel: () => { dispose(); events.cancel(); },
      launch: (card: string) => { dispose(); events.launch(card); },
    },
    dispose,
  };
}

export function submitWhenUnheld(submit: () => void) {
  if (active.size) return false;
  submit();
  return true;
}
