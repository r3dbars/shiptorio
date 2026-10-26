import type { FactoryState } from "@shiptorio/shared";

/** Never import the old unscoped record: its account owner cannot be established. */
export const achievementStorageKey = (profile: string) => `shiptorio:achievements:${profile}`;
export interface ShipBaseline { repo: string; rockets: number }
export function shipBaseline(state: FactoryState): ShipBaseline {
  return { repo: state.repo, rockets: Math.max(state.metrics?.rockets ?? 0, state.science.red + state.science.green + state.science.grey + state.science.blue) };
}
/** A cumulative count in a different factory is historical data, not a ship today. */
export const shippedSince = (previous: ShipBaseline | null, next: ShipBaseline) => !!previous && previous.repo === next.repo && next.rockets > previous.rockets;
