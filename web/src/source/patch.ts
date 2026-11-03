// Folds one protocol patch into a FactoryState. React-free, so the deck can use it without pulling in the old app's store.
import type { FactoryState, Patch } from "@shiptorio/shared";

export function applyPatch(s: FactoryState, p: Patch): FactoryState {
  const upsert = <T extends { id: string }>(list: T[], next: T[] | undefined) => {
    if (!next?.length) return list;
    const out = [...list];
    for (const n of next) {
      const i = out.findIndex((x) => x.id === n.id);
      if (i === -1) out.push(n);
      else out[i] = n;
    }
    return out;
  };
  const gone = (kind: "item" | "machine" | "belt") => new Set(p.removed?.filter((r) => r.kind === kind).map((r) => r.id));
  const goneItems = gone("item");
  const goneMachines = gone("machine");
  const goneBelts = gone("belt");
  return {
    ...s,
    items: upsert(s.items, p.items).filter((x) => !goneItems.has(x.id)),
    machines: upsert(s.machines, p.machines).filter((x) => !goneMachines.has(x.id)),
    belts: upsert(s.belts, p.belts).filter((x) => !goneBelts.has(x.id)),
    districts: p.districts ?? s.districts,
    power: p.power ?? s.power,
    science: p.science ?? s.science,
    trust: p.trust ?? s.trust,
    tick: p.tick ?? s.tick,
    goal: p.goal ?? s.goal,
    goals: p.goals ?? s.goals,
    pipeline: p.pipeline ?? s.pipeline,
    bottleneck: p.bottleneck !== undefined ? p.bottleneck : s.bottleneck,
    holdingBack: p.holdingBack !== undefined ? p.holdingBack : s.holdingBack,
    liveBottleneck: p.liveBottleneck !== undefined ? p.liveBottleneck : s.liveBottleneck,
    autonomy: p.autonomy ?? s.autonomy,
    learned: p.learned ?? s.learned,
    metrics: p.metrics ?? s.metrics,
    foreman: p.foreman ?? s.foreman,
    brain: p.brain ?? s.brain,
    sources: p.sources ?? s.sources,
    stations: p.stations ?? s.stations,
    research: p.research ?? s.research,
    support: p.support ?? s.support,
    experiments: p.experiments ?? s.experiments,
  };
}
