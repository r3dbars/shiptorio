import { describe, expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';
import {
  arpNotes, bottleneckTension, CADENCE, CALM, catchTension, CATCH_FADE_MS, chordFor, ease, intensityFor,
  layerCount, layersFor, padCutoff, STEPS_PER_BAR, TENSE, tensionFor, type MusicInput,
} from '../src/sound/music';
import { musicInput } from '../src/sound/useFactorySound';
import type { FactoryState } from '@shiptorio/shared';

const idle: MusicInput = { moving: 0, working: 0, stationsBusy: 0, rejected: 0, bottleneck: null };
const busy = (moving: number): MusicInput => ({ ...idle, moving, working: Math.ceil(moving / 3), stationsBusy: Math.min(5, Math.ceil(moving / 2)) });

describe('intensity', () => {
  test('idle floor is silent but for the pad', () => {
    expect(intensityFor(idle)).toBe(0);
    const l = layersFor(0, 0);
    expect(l.pad).toBe(true);
    expect(layerCount(l)).toBe(0);
  });
  test('more items moving means more layers, never fewer', () => {
    let last = -1;
    let lastLayers = 0;
    for (let n = 0; n <= 20; n++) {
      const i = intensityFor(busy(n));
      expect(i).toBeGreaterThanOrEqual(last);
      const layers = layerCount(layersFor(i, 0));
      expect(layers).toBeGreaterThanOrEqual(lastLayers);
      last = i;
      lastLayers = layers;
    }
    expect(layerCount(layersFor(intensityFor(busy(1)), 0))).toBeLessThanOrEqual(1);
    expect(layerCount(layersFor(intensityFor(busy(20)), 0))).toBe(4);
  });
  test('saturates below 1 instead of blowing up on a huge queue', () => {
    expect(intensityFor(busy(500))).toBeLessThanOrEqual(1);
    expect(intensityFor(busy(500))).toBeGreaterThan(0.99);
  });
  test('layers have hysteresis so they do not chatter at a threshold', () => {
    const on = layersFor(0.41, 0);
    expect(on.arp).toBe(true);
    expect(layersFor(0.36, 0, on).arp).toBe(true); // just under: stays on
    expect(layersFor(0.36, 0).arp).toBe(false); // from cold: stays off
    expect(layersFor(0.3, 0, on).arp).toBe(false);
  });
  test('ease approaches the target and lands on it', () => {
    let x = 0;
    for (let i = 0; i < 30; i++) x = ease(x, 1);
    expect(x).toBe(1);
    expect(ease(0, 1)).toBeCloseTo(0.35);
  });
});

describe('tension', () => {
  test('a single waiting item is not a jam', () => {
    expect(bottleneckTension({ stage: 'inspect', wip: 1, ageMs: 0 })).toBe(0);
  });
  test('a pile-up builds tension with wip and age', () => {
    const a = bottleneckTension({ stage: 'inspect', wip: 2, ageMs: 0 });
    const b = bottleneckTension({ stage: 'inspect', wip: 5, ageMs: 0 });
    const c = bottleneckTension({ stage: 'inspect', wip: 5, ageMs: 9 * 3_600_000 });
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBe(1);
  });
  test('"nothing plugged in" only nudges', () => {
    expect(bottleneckTension({ stage: 'resources', wip: 6, ageMs: 0 })).toBeLessThan(0.4);
  });
  test('a catch spikes tension and fades over 20s', () => {
    expect(catchTension(null)).toBe(0);
    expect(catchTension(0)).toBeCloseTo(0.9);
    expect(catchTension(CATCH_FADE_MS / 2)).toBeLessThan(0.9);
    expect(catchTension(CATCH_FADE_MS)).toBe(0);
    expect(layersFor(0, tensionFor(idle, 0)).pulse).toBe(true);
    expect(layersFor(0, tensionFor(idle, CATCH_FADE_MS)).pulse).toBe(false);
  });
  test('the rework belt filling up tenses things a bit', () => {
    expect(tensionFor({ ...idle, rejected: 4 }, null)).toBeCloseTo(0.4);
  });
  test('tension darkens the pad, busy opens it', () => {
    expect(padCutoff(1, 0)).toBeGreaterThan(padCutoff(0, 0));
    expect(padCutoff(0.5, 1)).toBeLessThan(padCutoff(0.5, 0));
  });
});

describe('harmony', () => {
  test('calm cycles I vi IV V, tense switches progressions', () => {
    expect(chordFor(0, 0, null)).toEqual(CALM[0]);
    expect(chordFor(5, 0, null)).toEqual(CALM[1]);
    expect(chordFor(3, 0.8, null)).toEqual(TENSE[3]);
  });
  test('a launch resolves V → I regardless of tension', () => {
    expect(chordFor(7, 1, 0)).toEqual(CADENCE[0]);
    expect(chordFor(7, 1, 1)).toEqual(CALM[0]); // home
  });
  test('arp fills a bar with chord tones', () => {
    for (const c of [...CALM, ...TENSE]) {
      const notes = arpNotes(c);
      expect(notes.length).toBe(STEPS_PER_BAR);
      for (const n of notes) expect(c.map((x) => x % 12)).toContain(n % 12);
    }
  });
});

describe('musicInput', () => {
  const state = {
    items: [{ state: 'working' }, { state: 'inspecting' }, { state: 'rejected' }, { state: 'launched' }],
    machines: [{ state: 'working' }, { state: 'idle' }],
    stations: [{ wip: 0 }, { wip: 3 }],
  } as unknown as FactoryState;
  test('reads the factory state', () => {
    expect(musicInput(state)).toEqual({ moving: 3, working: 1, stationsBusy: 1, rejected: 1, bottleneck: { stage: 'inspect', wip: 3, ageMs: 0 } });
  });
  test('prefers the real bottleneck when the engine has one', () => {
    const b = { stage: 'pad', wip: 2, ageMs: 5, throughputPerHour: 0, valueAtRisk: 0, summary: '' };
    expect(musicInput({ ...state, bottleneck: b } as FactoryState).bottleneck).toBe(b);
  });
});

// v2's arrangement and score are pure; browser integration tests exercise the actual graph.
import { arrangementFor, BAR_SECONDS, crossfadeGains, FADE_SECONDS, MUSIC_BUDGET, nextBarTime, stateFor, transportAt, EIGHTH } from '../src/sound/music';
import { notesFor } from '../src/sound/foundryScore';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

describe('foundry state and transport', () => {
  test('launch wins; blocked and activity have independent hysteresis', () => {
    expect(stateFor(0,0,false)).toBe('idle');
    expect(stateFor(0.15,0,false)).toBe('working');
    expect(stateFor(0.12,0,false,'working')).toBe('working');
    expect(stateFor(0.09,0,false,'working')).toBe('idle');
    expect(stateFor(0,0.5,false)).toBe('blocked');
    expect(stateFor(0,0.4,false,'blocked')).toBe('blocked');
    expect(stateFor(0,0.37,false,'blocked')).toBe('idle');
    expect(stateFor(1,1,true,'blocked')).toBe('launch');
    expect(stateFor(0,0,false,'launch')).toBe('idle');
  });
  test('rhythm, bass, counter and theme stack, and retain their thresholds', () => {
    let a = arrangementFor(0);
    expect(Object.values(a).some(Boolean)).toBe(false);
    a = arrangementFor(0.15,a); expect(a.rhythm).toBe(true); expect(a.bass).toBe(false);
    a = arrangementFor(0.3,a); expect(a.bass).toBe(true); expect(a.counter).toBe(false);
    a = arrangementFor(0.5,a); expect(a.counter).toBe(true); expect(a.theme).toBe(false);
    a = arrangementFor(0.7,a); expect(Object.values(a).every(Boolean)).toBe(true);
    expect(arrangementFor(0.6,a).theme).toBe(true);
    expect(arrangementFor(0.56,a).theme).toBe(false);
    expect(Object.values(arrangementFor(0,a)).some(Boolean)).toBe(false);
  });
  test('a stalled clock resumes within an eighth without restarting its phrase', () => {
    for (const elapsed of [0,0.01,0.8,2.9,18.01,79.75]) {
      const r = transportAt(10+elapsed,10);
      expect(r.time).toBeGreaterThanOrEqual(10+elapsed-1e-8);
      expect(r.time-(10+elapsed)).toBeLessThan(EIGHTH+1e-8);
      expect(r.bar*8+r.step).toBeCloseTo((r.time-10)/EIGHTH);
    }
    expect(transportAt(10+BAR_SECONDS*19,10)).toEqual({time:10+BAR_SECONDS*19,step:0,bar:19});
  });
  test('crossfades start on the existing bar clock and preserve power', () => {
    expect(nextBarTime(0)).toBe(0);
    expect(nextBarTime(0.1)).toBeCloseTo(BAR_SECONDS);
    expect(nextBarTime(2*BAR_SECONDS)).toBeCloseTo(2*BAR_SECONDS);
    expect(nextBarTime(12.2,10)).toBeCloseTo(10+BAR_SECONDS);
    expect(FADE_SECONDS).toBeLessThan(BAR_SECONDS);
    for (let p=0;p<=1;p+=0.05) {
      const [out,into]=crossfadeGains(p); expect(out*out+into*into).toBeCloseTo(1,6);
    }
    expect(crossfadeGains(-1)).toEqual([1,0]);
    expect(crossfadeGains(2)[1]).toBe(1);
  });
});

describe('original foundry composition', () => {
  const frame = { state:'working' as const, arrangement:arrangementFor(1), bar:0, launchBar:null, low:false };
  test('sixteen-bar phrase has real variation and an upward register', () => {
    expect(notesFor(frame)).not.toEqual(notesFor({...frame,bar:8}));
    expect(notesFor(frame)).toEqual(notesFor({...frame,bar:16}));
    const idleNotes=notesFor({...frame,state:'idle',arrangement:arrangementFor(0)});
    expect(idleNotes.length).toBeLessThan(notesFor(frame).length);
    expect(Math.max(...idleNotes.map(n=>n.midi))).toBeLessThan(Math.max(...notesFor(frame).map(n=>n.midi)));
    expect(notesFor({...frame,state:'idle',arrangement:arrangementFor(0),bar:1}).every(n=>n.instrument==='organ')).toBe(true);
  });
  test('blocked adds brass and pressure; launch is a three-bar rising answer', () => {
    expect(notesFor({...frame,state:'blocked'}).some(n=>n.instrument==='brass')).toBe(true);
    const first=notesFor({...frame,state:'launch',launchBar:0}).filter(n=>n.instrument==='celesta');
    const next=notesFor({...frame,state:'launch',launchBar:1}).filter(n=>n.instrument==='celesta');
    expect(Math.max(...next.map(n=>n.midi))).toBeGreaterThan(Math.max(...first.map(n=>n.midi)));
    expect(3*BAR_SECONDS).toBeLessThan(8);
    expect(3*BAR_SECONDS).toBeGreaterThan(4);
  });
  test('low quality reduces voices and intro reuses the melody', () => {
    expect(notesFor({...frame,low:true}).length).toBeLessThan(notesFor(frame).length);
    expect(notesFor({...frame,arrangement:arrangementFor(0),title:true}).some(n=>n.instrument==='celesta')).toBe(true);
    for (const state of ['idle','working','blocked','launch'] as const) for(let bar=0;bar<32;bar++) {
      for (const n of notesFor({...frame,state,bar,launchBar:state==='launch' ? bar%3 : null})) {
        expect(n.duration).toBeGreaterThan(0); expect(n.at).toBeLessThan(BAR_SECONDS);
        expect(n.midi).toBeGreaterThan(0); expect(n.midi).toBeLessThan(109);
        expect(n.velocity).toBeLessThan(0.3);
      }
    }
  });
  test('asset inventory and payload stay within phone budgets', () => {
    const dir = fileURLToPath(new URL('../public/music/',import.meta.url));
    const license = readFileSync(join(dir,'LICENSES.md'),'utf8');
    const files = readdirSync(dir,{recursive:true}).map(String).filter(f=>statSync(join(dir,f)).isFile() && f!=='LICENSES.md');
    let total=0;
    for (const f of files) { expect(license).toContain(f); total+=statSync(join(dir,f)).size; }
    expect(total).toBeLessThanOrEqual(MUSIC_BUDGET.payloadBytes);
    expect(MUSIC_BUDGET.actualPayloadBytes).toBeLessThanOrEqual(MUSIC_BUDGET.firstSetBytes);
    expect(MUSIC_BUDGET.actualDecodedBytes).toBeLessThanOrEqual(MUSIC_BUDGET.decodedBytes);
  });
});
