// The real island, idling behind the sign-in card, so the first screen already looks like the game.
// It runs the heal scenario's factory on its own sim; nothing on it can be touched.

import { useMemo } from "react";
import { FactoryMap } from "../map/FactoryMap";
import { useFactory } from "../store";

export function IslandBackdrop() {
  const cfg = useMemo(() => ({ kind: "sim" as const, repo: "you/demo-shop", scenario: "heal" as const }), []);
  const { state } = useFactory(cfg);
  return (
    <div className="ob-backdrop" aria-hidden="true" inert>
      <FactoryMap state={state} />
    </div>
  );
}
