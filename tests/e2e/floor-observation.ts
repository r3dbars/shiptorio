import type { Page } from '@playwright/test';
import { assertBuildEventPrefix, type BuildEvent } from '../contract/buildout-events';
import { assertFloorChronology, type FloorEvent } from '../contract/floor-events';

export type ObservedFloorEvent = FloorEvent & { floors?: string[] };
export type FloorObservation = {
  events: ObservedFloorEvent[];
  step: string | null;
  actionKind: string | null;
  actionClass: string | null;
};

export function readFloors(page: Page): Promise<FloorObservation> {
  return page.evaluate(() => {
    const action = document.querySelector('[data-buildout-card] [data-buildout-action]');
    return {
      events: (window as any).__ev,
      step: document.querySelector('[data-buildout]')?.getAttribute('data-step') ?? null,
      actionKind: action?.getAttribute('data-buildout-action') ?? null,
      actionClass: action?.getAttribute('class') ?? null,
    };
  });
}

// Reuse an already observed positive event, never an absent phase or old DOM.
// All explicit checkpoint refreshes still inspect the full recorded chronology.
export function floorObserver(read: () => Promise<FloorObservation>) {
  const seen = new Set<string>();
  const key = (kind: string, id: string, phase: string) => `${kind}:${id}:${phase}`;
  const refresh = async () => {
    const observation = await read();
    assertBuildEventPrefix(observation.events.filter(e => e.kind === 'build') as BuildEvent[]);
    assertFloorChronology(observation.events);
    for (const event of observation.events) seen.add(key(event.kind, event.id ?? event.floor ?? '', event.phase));
    return observation;
  };
  const phase = async (kind: string, id: string, phase: string) => {
    const fact = key(kind, id, phase);
    if (seen.has(fact)) return true;
    await refresh();
    return seen.has(fact);
  };
  return {
    refresh,
    built: (id: string, at = 'done') => phase('build', id, at),
    floor: (id: string, at: string) => phase('floor', id, at),
    builtOr: async (id: string, phase: string, predicate: (observation: FloorObservation) => boolean) => {
      const fact = key('build', id, phase);
      if (seen.has(fact)) return true;
      const observation = await refresh();
      return seen.has(fact) || predicate(observation);
    },
  };
}
