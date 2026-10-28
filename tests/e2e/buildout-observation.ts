import type { Page } from '@playwright/test';
import { assertBuildEventPrefix, type BuildEvent } from '../contract/buildout-events';

export type TimedBuildEvent = BuildEvent & { at: number };
export type BuildoutObservation = {
  events: TimedBuildEvent[];
  step: string | null;
  phase: string | null;
  trigger: string | null;
  actionKind: string | null;
};

// One read-only browser command captures facts at the same instant. Visibility and
// attribute assertions remain Playwright assertions at their original checkpoints.
export function readBuildout(page: Page): Promise<BuildoutObservation> {
  return page.evaluate(() => {
    const root = document.querySelector('[data-buildout]');
    const card = document.querySelector('[data-buildout-card]');
    return {
      events: (window as any).__builds,
      step: root?.getAttribute('data-step') ?? null,
      phase: root?.getAttribute('data-phase') ?? null,
      trigger: card?.getAttribute('data-trigger') ?? null,
      actionKind: card?.querySelector('[data-buildout-action]')?.getAttribute('data-buildout-action') ?? null,
    };
  });
}

// The recorder is append-only. Only observed positive phase facts can be reused;
// absent phases and changing DOM state always require a fresh browser observation.
export function buildoutObserver(read: () => Promise<BuildoutObservation>) {
  const seen = new Set<string>();
  const key = (id: string, phase: BuildEvent['phase']) => `${id}:${phase}`;
  const refresh = async () => {
    const observation = await read();
    assertBuildEventPrefix(observation.events);
    for (const event of observation.events) seen.add(key(event.id, event.phase));
    return observation;
  };
  const has = (id: string, phase: BuildEvent['phase']) => seen.has(key(id, phase));
  return {
    refresh,
    phase: async (id: string, phase: BuildEvent['phase']) => {
      if (has(id, phase)) return true;
      await refresh();
      return has(id, phase);
    },
    phaseOr: async (id: string, phase: BuildEvent['phase'], predicate: (observation: BuildoutObservation) => boolean) => {
      if (has(id, phase)) return true;
      const observation = await refresh();
      return has(id, phase) || predicate(observation);
    },
  };
}
