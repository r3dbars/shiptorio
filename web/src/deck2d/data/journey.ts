import { STOPS, STOP_LABEL, type StopId } from '../contract';
import type { LiveDeckView } from './view';

/** Arrival paces the drawing only. It never approves a job or a merge. */
export function createJourney() {
  let id: string | null = null, at = 0, target = 0, arrived = true, age = 0;
  let seen = false, fromIntake = false, pending = new Set<string>(), shipped = 0;
  return {
    step(dt: number) { age += dt; },
    arrive(item: string, stop: StopId) {
      if (item === id && stop === STOPS[at]) { arrived = true; age = 0; }
    },
    view(base: LiveDeckView): LiveDeckView {
      const work = base.work;
      if (!seen) { shipped = base.shipped; seen = true; }
      if (!work) { pending = new Set(base.intake?.map(i => i.id)); id = null; shipped = base.shipped; return base; }
      target = STOPS.indexOf(work.stop);
      if (id !== work.id) { fromIntake = pending.has(work.id); at = fromIntake ? 0 : target; id = work.id; arrived = !fromIntake; age = 0; }
      if (arrived && at !== target && age >= 0.7) { at += Math.sign(target - at); arrived = false; age = 0; }
      const stop = STOPS[at], transferring = !arrived || at !== target;
      const item = base.stops.flatMap(s => s.items).find(i => i.id === id);
      const stops = base.stops.map(s => ({ ...s, state: s.id === stop && !transferring ? s.state : s.state === 'jammed' ? s.state : 'idle' as const,
        items: s.items.filter(i => i.id !== id),
      }));
      if (arrived && at !== target && stops[at].state !== 'jammed') stops[at].state = 'working';
      if (item) stops[at].items.push({ ...item, ...{ fromIntake } });
      if (work.stop === 'launch' && at === target && arrived) shipped = base.shipped;
      const card = transferring && !base.jam ? null : base.card;
      pending = new Set(base.intake?.map(i => i.id));
      return { ...base, stops, card, shipped, work: { ...work, stop }, followItem: transferring ? work.id : undefined, focus: stop,
        shippy: { at: stop, pose: transferring ? 'walking' : base.shippy.pose },
        caption: `${work.badge} · ${work.title} · ${transferring ? `Moving to ${STOP_LABEL[stop]}` : work.status === 'waiting_player' ? `Waiting for your approval at ${STOP_LABEL[stop]}` : `${STOP_LABEL[stop]} is working`}`,
      };
    },
  };
}
