// The adaptive factory score. A tiny step sequencer on Web Audio: one steady pad (4 oscillators
// that glide between chords, never rebuilt) plus short synthesized notes scheduled a quarter
// second ahead. music.ts decides what to play; this just plays it.
//
// Cheap on purpose (the phone perf pass is watching): no samples to decode, one timer, and
// nothing gets scheduled while muted, hidden, or with music off. The engine suspends the whole
// AudioContext in those cases, so the pad oscillators stop costing anything too.

import type { sound } from "./engine";
import {
  arpNotes,
  chordFor,
  ease,
  EIGHTH,
  intensityFor,
  layersFor,
  midiHz,
  padCutoff,
  STEPS_PER_BAR,
  tensionFor,
  CADENCE,
  type Layers,
  type MusicInput,
} from "./music";

type Synth = typeof sound;

const LOOKAHEAD = 0.3; // seconds of notes scheduled ahead of the clock
const TICK_MS = 100;
const RESOLVE_LEAD = 1.0; // the cadence starts on the first bar at least this long after a launch
const DUCK_FOR = 3.0; // the music sits under the launch roar for this long

export class MusicPlayer {
  private bus: GainNode | null = null; // the engine's music bus (ducks when you focus something)
  private duck: GainNode | null = null; // our own duck, for launches
  private pad: { oscs: OscillatorNode[]; lp: BiquadFilterNode; g: GainNode } | null = null;
  private timer: number | undefined;
  private nextTime = 0;
  private step = 0;
  private bar = 0;
  private input: MusicInput = { moving: 0, working: 0, stationsBusy: 0, rejected: 0, bottleneck: null };
  private lastCatch: number | null = null; // performance.now() of the last catch
  private resolveFrom: number | null = null; // ctx time a launch asked to resolve from
  private resolveBar: number | null = null; // bars into the cadence, while it plays
  private silent = true;
  intensity = 0;
  tension = 0;
  layers: Layers = layersFor(0, 0);
  chord: number[] = chordFor(0, 0, null);

  constructor(private s: Synth) {}

  attach(bus: GainNode) {
    const ctx = this.s.audio;
    this.bus = bus;
    this.duck = ctx.createGain();
    this.duck.connect(bus);
    const g = ctx.createGain();
    g.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = padCutoff(0, 0);
    lp.Q.value = 0.7;
    const oscs = [...this.chord.map((n) => ["triangle", midiHz(n - 12)] as const), ["sawtooth", midiHz(this.chord[0] - 24) * 1.003] as const].map(([type, f]) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.connect(lp);
      o.start();
      return o;
    });
    lp.connect(g).connect(this.duck);
    this.pad = { oscs, lp, g };
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  setInput(i: MusicInput) {
    this.input = i;
  }

  // A station just caught something: tension spikes, then fades.
  alert() {
    this.lastCatch = performance.now();
  }

  // A PR launched: duck under the roar, then cadence home on the next bar.
  resolve(delay = 0) {
    if (!this.bus || !this.duck) return;
    const t = this.s.audio.currentTime + delay;
    this.resolveFrom = t + RESOLVE_LEAD;
    this.lastCatch = null;
    this.duck.gain.setTargetAtTime(0.3, t, 0.15);
    this.duck.gain.setTargetAtTime(1, t + DUCK_FOR, 0.6);
  }

  private get on() {
    return this.s.canPlay && this.s.settings.music && !document.hidden;
  }

  private tick() {
    if (!this.pad) return;
    const ctx = this.s.audio;
    if (!this.on) {
      if (!this.silent) this.pad.g.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
      this.silent = true;
      return;
    }
    // back from a pause: pick the beat up from now instead of rushing through missed steps
    if (this.silent || this.nextTime < ctx.currentTime) {
      this.nextTime = ctx.currentTime + 0.05;
      this.step = 0;
      this.silent = false;
    }
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.play(this.step, this.nextTime);
      this.nextTime += EIGHTH;
      this.step = (this.step + 1) % STEPS_PER_BAR;
    }
  }

  // Once per bar: read the factory, ease toward it, pick the chord and layers.
  private barStart(t: number) {
    this.bar++;
    if (this.resolveFrom != null && t >= this.resolveFrom) {
      this.resolveBar = 0;
      this.resolveFrom = null;
    } else if (this.resolveBar != null) {
      this.resolveBar++;
      if (this.resolveBar >= CADENCE.length) this.resolveBar = null;
    }
    const resolving = this.resolveBar != null;
    const since = this.lastCatch == null ? null : performance.now() - this.lastCatch;
    const tt = resolving ? 0 : tensionFor(this.input, since);
    this.intensity = ease(this.intensity, intensityFor(this.input));
    this.tension = resolving ? 0 : ease(this.tension, tt, tt > this.tension ? 0.6 : 0.3); // tension hits fast, lets go slow
    this.layers = layersFor(this.intensity, this.tension, this.layers);
    this.chord = chordFor(this.bar, this.tension, this.resolveBar);
    const p = this.pad!;
    this.chord.forEach((n, i) => p.oscs[i].frequency.setTargetAtTime(midiHz(n - 12), t, 0.12));
    p.oscs[3].frequency.setTargetAtTime(midiHz(this.chord[0] - 24) * (1.003 + this.tension * 0.01), t, 0.12); // detunes a touch under tension
    p.lp.frequency.setTargetAtTime(padCutoff(this.intensity, this.tension), t, 0.5);
    p.g.gain.setTargetAtTime(0.045 + this.intensity * 0.03, t, 0.8);
  }

  private play(step: number, t: number) {
    if (step === 0) this.barStart(t);
    const out = this.duck!;
    const L = this.layers;
    const root = this.chord[0];
    const s = this.s;
    if (L.bass && (step === 0 || step === 4 || (L.drums && (step === 3 || step === 6)))) {
      s.tone({ f: midiHz(root - 24), dur: step % 4 === 0 ? 0.32 : 0.16, type: "triangle", vol: 0.11, at: t, attack: 0.01, out });
    }
    if (L.arp) s.tone({ f: midiHz(arpNotes(this.chord)[step]), dur: 0.11, type: "square", vol: 0.018 + this.intensity * 0.01, at: t, out });
    if (L.drums) {
      if (step === 0 || step === 4) s.tone({ f: 130, to: 42, dur: 0.14, type: "sine", vol: 0.16, at: t, out });
      if (step % 2 === 1) s.noise({ dur: 0.025, vol: 0.022, hp: 7000, at: t, out });
    }
    if (L.snare && (step === 2 || step === 6)) s.noise({ dur: 0.09, vol: 0.05, bp: 1800, at: t, out });
    if (L.pulse) {
      // a heartbeat under the jam, louder the worse it is, and a nervous half-step tick at the end of the bar
      if (step === 0) {
        const vol = 0.06 + this.tension * 0.08;
        s.tone({ f: 60, to: 40, dur: 0.16, type: "sine", vol, at: t, out });
        s.tone({ f: 52, to: 38, dur: 0.16, type: "sine", vol: vol * 0.8, at: t + 0.2, out });
      }
      if (step === 7 && this.tension > 0.6) {
        s.tone({ f: midiHz(76), dur: 0.06, type: "square", vol: 0.014, at: t, out });
        s.tone({ f: midiHz(77), dur: 0.06, type: "square", vol: 0.014, at: t + EIGHTH / 2, out });
      }
    }
    // the launch cadence's last bars ring out with bells on the home chord
    if (this.resolveBar != null && this.resolveBar >= 1 && step % 2 === 0) {
      s.tone({ f: midiHz(this.chord[(step / 2) % 3] + 24), dur: 0.5, type: "sine", vol: 0.03, at: t, out });
    }
  }

  stop() {
    window.clearInterval(this.timer);
  }
}
