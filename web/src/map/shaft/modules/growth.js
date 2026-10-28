// Floating-city art pass, slice 10 (ART-PASS.md "Floors"): the island grows floors as you build.
//
// Under ?buildout=1&artpass=1 a new factory starts as the rock and its boarded tunnel. The decks above aren't there
// yet. When a build finishes (shiptorio:build "done", web/src/buildout/journey.ts) and the next step's site sits on a
// floor that isn't built (floors.ts floorsFor), that floor goes up (floorbuild.ts, ~6 s) while the director swoops to
// the new site. Floors go up bottom first, one at a time. A returning factory shows the floors it has at once.
//
// This never touches the Build As You Go files: it reads the journey, listens for the event, and hides or raises
// the world's floors (bake.ts, I.floorParts(id)). It fires `shiptorio:floor` on window for tests:
// { phase: "stand", floors } on the first look, then { phase: "start" | "done", floor } per floor that rises.

import { STEPS, onBuild, stepFrom } from '../../../buildout/journey';
import { artPass, buildout } from '../backdrop-kit.js';
import { buildFloor, showFloor } from '../floorbuild';
import { FLOORS, FLOOR_IDS, floorsFor } from '../floors';

export const FLOOR_EVENT = 'shiptorio:floor';
const ALWAYS = new Set(FLOORS.filter((f) => f.always).map((f) => f.id));

/** What stands on the first look: every floor up to the step the player is on (a fresh factory: the rock). */
export const standingFor = (state) => floorsFor(stepFrom(state).id);

/** The floors to raise once build `id` is done, bottom up: what the next step needs that isn't standing yet. */
export function toRaise(id, standing) {
  const i = STEPS.findIndex((s) => s.id === id);
  if (i < 0) return [];
  return floorsFor(STEPS[i + 1]?.id ?? 'look').filter((f) => !standing.has(f));
}

const emit = (detail) => window.dispatchEvent(new CustomEvent(FLOOR_EVENT, { detail }));
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// One page, one journey: what stands outlives a shaft rebuild (a new machine id rebuilds it mid-run).
const mem = { standing: null, queue: [], run: null, floor: null, I: null, off: null };

// the next floor in the queue starts rising, if nothing is
function next() {
  if (mem.run || !mem.I) return;
  const id = mem.queue.shift();
  if (!id) return;
  mem.standing.add(id);
  mem.floor = id;
  mem.run = buildFloor(mem.I, id, { reduced: reducedMotion() });
  emit({ phase: 'start', floor: id });
}

function finished() {
  const id = mem.floor;
  if (mem.I && id) showFloor(mem.I, id, true); // whatever the run left, the floor stands
  mem.run = null;
  mem.floor = null;
  if (id) emit({ phase: 'done', floor: id });
  next();
}

// A build finished: the next step's floors go up. A build starting while its floor is still rising (the sim's CI
// can report right away) gets the floor there now, so nothing rises on a deck that's still sliding in.
function heard(d) {
  if (!mem.standing) return;
  if (d.phase === 'done') {
    for (const f of toRaise(d.id, mem.standing)) if (!mem.queue.includes(f)) mem.queue.push(f);
    next();
  } else if (d.phase === 'start' && mem.run && STEPS.some((s) => s.id === d.id)) {
    const need = floorsFor(d.id);
    if (!need.includes(mem.floor) && !mem.queue.some((f) => need.includes(f))) return;
    mem.queue = mem.queue.filter((f) => !need.includes(f) || (mem.standing.add(f), showFloor(mem.I, f, true), false));
    mem.run.finish();
  }
}

export default function install(IRON) {
  if (typeof window === 'undefined' || !buildout() || !artPass()) return; // flag off: every floor stands, as before
  IRON.part(
    'growth',
    () => {
      const I = IRON;
      mem.I = I;
      mem.off ??= onBuild(heard);
      // a rebuild while a floor was rising (a new machine id rebuilds the shaft): it starts over on the new one
      mem.run = null;
      let first = true, last = 0;
      return {
        update(t, dt) {
          // a floor rises on the wall clock, like a build: the frame's dt is clamped, so on a slow GPU it would crawl
          const now = performance.now(), wall = last ? Math.min(0.5, (now - last) / 1000) : 0;
          last = now;
          if (first) {
            // after the bake, before the first frame draws: the floors that aren't built are gone
            const state = I.driver && I.driver.state;
            if (!state || typeof I.floorParts !== 'function') return; // the dev harness's own line: all of it stands
            first = false;
            if (!mem.standing) {
              mem.standing = new Set(standingFor(state));
              emit({ phase: 'stand', floors: [...mem.standing] });
            }
            for (const id of FLOOR_IDS) if (!ALWAYS.has(id)) showFloor(I, id, mem.standing.has(id) && id !== mem.floor);
            if (mem.floor) mem.run = buildFloor(I, mem.floor, { reduced: reducedMotion() });
            next();
          }
          if (mem.run && mem.run.update(Math.max(dt, wall))) finished();
          // the chalk on the next site waits for its deck
          const chalk = I.root && I.root.getObjectByName('buildout-chalk');
          if (chalk) chalk.visible = !mem.run;
        },
      };
    },
    9,
  );
}
