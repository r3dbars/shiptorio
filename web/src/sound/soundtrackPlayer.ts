// Plays Justin's soundtrack picks (soundtrack.ts) in the game. Lazy-loaded only after unlock, with music on.
// The instruments are a straight port of the soundboard's, so a track sounds the same here as it did there:
// Karplus-Strong plucks, FM bells, filtered saws for brass and bows, band-passed noise for steam.
//
// Each track runs on its own lane with its own clock (they have different tempos). When the moment changes,
// the new lane starts on the old one's next bar and the two crossfade, so nothing cuts off mid-phrase.

import type { sound } from "./engine";
import type { Focus } from "./scapes";
import { ease, intensityFor, musicFocus, stateFor, tensionFor, type MusicInput, type MusicState } from "./music";
import { brightnessHz, layersFor, nextRole, PICKS, reverbSend, roleFor, trackById, type Bar, type Inst, type Knobs, type LayerId, type Role, type Track } from "./soundtrack";

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);
const CROSSFADE_S = 2.2;
const LAUNCH_MS = 30_000; // the victory lap after a ship
const LAYER_IDS: LayerId[] = ["pad", "melody", "steam", "bass", "rhythm", "counter", "pressure"];

type ToneOpts = { t: number; f: number; to?: number; glide?: number; dur: number; type?: OscillatorType; vol: number; a?: number; det?: number; lp?: number; lpTo?: number; bp?: number; q?: number; echo?: number; out: AudioNode };
type NoiseOpts = { t: number; dur: number; vol: number; a?: number; rate?: number; bp?: number; q?: number; lp?: number; hp?: number; sweepTo?: number; sweepT?: number; echo?: number; out: AudioNode };
type Play = (t: number, m: number, dur: number, v: number, out: AudioNode) => void;

export class SoundtrackInstruments {
  scheduled = 0;
  private live = new Set<AudioScheduledSourceNode>();
  private ks = new Map<string, { b: AudioBuffer; rate: number }>();
  readonly echoIn: GainNode;
  readonly echo: DelayNode;
  constructor(private ctx: BaseAudioContext, private noiseBuf: AudioBuffer, echoOut: AudioNode) {
    this.echoIn = ctx.createGain();
    this.echo = ctx.createDelay(2);
    this.echo.delayTime.value = 0.36;
    const fb = ctx.createGain(); fb.gain.value = 0.34;
    const lp = this.filt("lowpass", 3200);
    this.echoIn.connect(this.echo).connect(lp).connect(fb).connect(this.echo);
    lp.connect(echoOut);
  }
  get activeVoices() { return this.live.size; }
  stop(when: number) { for (const s of this.live) try { s.stop(when); } catch {} }

  private track(s: AudioScheduledSourceNode, t: number, end: number, ...nodes: AudioNode[]) {
    this.live.add(s); this.scheduled++;
    s.onended = () => { this.live.delete(s); s.disconnect(); nodes.forEach((n) => n.disconnect()); };
    s.start(t); s.stop(end);
  }
  private filt(type: BiquadFilterType, f: number, q?: number) {
    const x = this.ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; if (q != null) x.Q.value = q; return x;
  }
  private vca(t: number, peak: number, a: number, dur: number, out: AudioNode) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, a + 0.02));
    g.connect(out); return g;
  }
  private send(node: AudioNode, amt: number) {
    if (amt <= 0) return;
    const g = this.ctx.createGain(); g.gain.value = amt; node.connect(g).connect(this.echoIn);
  }
  private tone(o: ToneOpts) {
    const { t } = o, os = this.ctx.createOscillator();
    os.type = o.type ?? "sine";
    os.frequency.setValueAtTime(o.f, t);
    if (o.to) os.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide ?? o.dur));
    if (o.det) os.detune.value = o.det;
    const g = this.vca(t, o.vol, o.a ?? 0.004, o.dur, o.out);
    let n: AudioNode = os;
    const extra: AudioNode[] = [g];
    if (o.lp) { const f = this.filt("lowpass", o.lp, o.q ?? 0.7); if (o.lpTo) f.frequency.exponentialRampToValueAtTime(o.lpTo, t + o.dur); n.connect(f); n = f; extra.push(f); }
    if (o.bp) { const f = this.filt("bandpass", o.bp, o.q ?? 3); n.connect(f); n = f; extra.push(f); }
    n.connect(g);
    if (o.echo) this.send(g, o.echo);
    this.track(os, t, t + o.dur + 0.05, ...extra);
  }
  private noise(o: NoiseOpts) {
    const { t } = o, src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true; src.playbackRate.value = o.rate ?? 1;
    let n: AudioNode = src; let first: BiquadFilterNode | null = null;
    const extra: AudioNode[] = [];
    const add = (type: BiquadFilterType, f: number, q: number) => { const x = this.filt(type, f, q); first ??= x; n.connect(x); n = x; extra.push(x); };
    if (o.bp) add("bandpass", o.bp, o.q ?? 2);
    if (o.lp) add("lowpass", o.lp, o.q ?? 0.7);
    if (o.hp) add("highpass", o.hp, 0.7);
    if (first && o.sweepTo) (first as BiquadFilterNode).frequency.exponentialRampToValueAtTime(o.sweepTo, t + (o.sweepT ?? o.dur));
    const g = this.vca(t, o.vol, o.a ?? 0.004, o.dur, o.out);
    n.connect(g); extra.push(g);
    if (o.echo) this.send(g, o.echo);
    this.live.add(src); this.scheduled++;
    src.onended = () => { this.live.delete(src); src.disconnect(); extra.forEach((x) => x.disconnect()); };
    src.start(t, Math.random() * 0.8); src.stop(t + o.dur + 0.05);
  }
  private metal(t: number, f: number, dur: number, v: number, out: AudioNode, echo = 0, ratios = [1, 2.76, 5.4, 8.93]) {
    ratios.forEach((r, i) => this.tone({ t, f: f * r, dur: dur / (1 + i * 0.9), vol: v / (1 + i * 0.8), a: 0.002, out, echo }));
    this.noise({ t, dur: 0.02, vol: v * 0.6, hp: 3500, out });
  }
  private bell(t: number, f: number, dur: number, vol: number, out: AudioNode, ratio = 3.5, index = 2, echo = 0) {
    const car = this.ctx.createOscillator(), mod = this.ctx.createOscillator(), mg = this.ctx.createGain();
    car.frequency.value = f; mod.frequency.value = f * ratio;
    mg.gain.setValueAtTime(f * index, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + dur * 0.6);
    mod.connect(mg).connect(car.frequency);
    const g = this.vca(t, vol, 0.003, dur, out);
    car.connect(g);
    if (echo) this.send(g, echo);
    this.track(mod, t, t + dur + 0.05, mg);
    this.track(car, t, t + dur + 0.05, g);
  }
  // Karplus-Strong plucked string, rendered once per pitch and cached
  private ksBuf(m: number, bright: number) {
    const key = m + "|" + bright, hit = this.ks.get(key); if (hit) return hit;
    const sr = this.ctx.sampleRate, f = mtof(m), N = Math.max(2, Math.floor(sr / f)), secs = m < 50 ? 2.6 : 1.8;
    const len = Math.floor(sr * secs), b = this.ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
    let p = 0; for (let i = 0; i < N; i++) { p += bright * ((Math.random() * 2 - 1) - p); d[i] = p * 1.6; }
    const decay = m < 50 ? 0.9985 : 0.997;
    for (let i = N; i < len; i++) d[i] = decay * 0.5 * (d[i - N] + (i - N - 1 >= 0 ? d[i - N - 1] : d[i - N]));
    const res = { b, rate: (f * (N + 0.5)) / sr };
    this.ks.set(key, res); return res;
  }
  private pluckKs(t: number, m: number, dur: number, v: number, out: AudioNode, bright: number) {
    const { b, rate } = this.ksBuf(m, bright);
    const s = this.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(v, t);
    const end = t + Math.min(dur + 0.25, b.duration / rate);
    g.gain.setValueAtTime(v, Math.max(t, end - 0.12)); g.gain.linearRampToValueAtTime(0, end);
    s.connect(g).connect(out);
    this.track(s, t, end + 0.02, g);
    return g;
  }
  private adsr(t: number, dur: number, peak: number, a: number, d: number, s: number, r: number, out: AudioNode) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(peak * s, t + a, Math.max(0.01, d / 3));
    g.gain.setTargetAtTime(0, t + Math.max(dur, a), Math.max(0.01, r / 4));
    g.connect(out); return g;
  }
  // [type, freq, detune cents, gain] into dest; the envelope node is disconnected with the last oscillator
  private oscs(t: number, end: number, list: [OscillatorType, number, number, number][], dest: AudioNode, ...chain: AudioNode[]) {
    return list.map(([type, f, det, gv], i) => {
      const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det;
      const g = this.ctx.createGain(); g.gain.value = gv; o.connect(g).connect(dest);
      this.track(o, t, end, g, ...(i === list.length - 1 ? chain : []));
      return o;
    });
  }
  private vibrato(t: number, end: number, list: OscillatorNode[], rate: number, cents: number, delay = 0) {
    const l = this.ctx.createOscillator(), lg = this.ctx.createGain(); l.frequency.value = rate;
    lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(cents, t + delay + 0.2);
    l.connect(lg); list.forEach((o) => lg.connect(o.detune));
    this.track(l, t, end, lg);
  }

  readonly play: Record<Inst, Play> = {
    harmonium: (t, m, dur, v, out) => {
      const f = mtof(m), end = t + dur + 0.6, lp = this.filt("lowpass", Math.min(5000, f * 5 + 600), 0.6);
      const g = this.adsr(t, dur, v * 0.11, 0.12, 0.4, 0.82, 0.4, out);
      lp.connect(g);
      const os = this.oscs(t, end, [["sawtooth", f, -6, 1], ["sawtooth", f, 7, 1], ["triangle", f / 2, 0, 0.8]], lp, lp, g);
      this.vibrato(t, end, os, 4.6, 4, 0.1);
    },
    pad: (t, m, dur, v, out) => {
      const f = mtof(m), end = t + dur + 1;
      const g = this.adsr(t, dur, v * 0.12, 0.6, 0.5, 0.9, 0.9, out);
      this.oscs(t, end, [["sine", f, 0, 1], ["triangle", f * 2, 3, 0.25], ["sine", f * 3, -3, 0.1]], g, g);
    },
    bowed: (t, m, dur, v, out) => {
      const f = mtof(m), end = t + dur + 0.5, lp = this.filt("lowpass", f * 2, 0.8);
      lp.frequency.setValueAtTime(f * 1.5, t); lp.frequency.linearRampToValueAtTime(Math.min(6000, f * 5), t + 0.18);
      const g = this.adsr(t, dur, v * 0.1, Math.min(0.14, dur * 0.4), 0.2, 0.85, 0.3, out);
      lp.connect(g);
      const os = this.oscs(t, end, [["sawtooth", f, -4, 1], ["sawtooth", f, 5, 0.8]], lp, lp, g);
      this.vibrato(t, end, os, 5.4, 9, 0.22);
    },
    spic: (t, m, _dur, v, out) => { // short bowed stroke
      const f = mtof(m), end = t + 0.3, lp = this.filt("lowpass", Math.min(4000, f * 6), 1);
      const g = this.vca(t, v * 0.12, 0.012, 0.22, out); lp.connect(g);
      this.oscs(t, end, [["sawtooth", f, -4, 1], ["sawtooth", f, 6, 0.7]], lp, lp, g);
    },
    brass: (t, m, dur, v, out) => {
      const f = mtof(m), end = t + dur + 0.4, lp = this.filt("lowpass", f * 1.2, 2.2);
      lp.frequency.setValueAtTime(f * 1.1, t);
      lp.frequency.linearRampToValueAtTime(Math.min(7000, f * (2.5 + 6 * v)), t + 0.07);
      lp.frequency.setTargetAtTime(Math.min(5000, f * 3), t + 0.08, 0.15);
      const g = this.adsr(t, dur, v * 0.12, 0.05, 0.25, 0.75, 0.18, out);
      lp.connect(g);
      const os = this.oscs(t, end, [["sawtooth", f, -5, 1], ["square", f, 5, 0.45]], lp, lp, g);
      this.vibrato(t, end, os, 5, 6, 0.3);
    },
    pluck: (t, m, dur, v, out) => void this.pluckKs(t, m, dur, v * 0.55, out, 0.45),
    harp: (t, m, dur, v, out) => this.send(this.pluckKs(t, m, dur * 2, v * 0.4, out, 0.75), 0.2),
    musicbox: (t, m, _dur, v, out) => {
      const f = mtof(m);
      this.tone({ t, f, dur: 1.8, vol: v * 0.16, a: 0.002, out, echo: 0.25 });
      this.tone({ t, f: f * 2.76, dur: 0.4, vol: v * 0.035, a: 0.001, out });
      this.tone({ t, f: f * 5.4, dur: 0.12, vol: v * 0.02, a: 0.001, out });
    },
    celesta: (t, m, _dur, v, out) => {
      const f = mtof(m);
      this.tone({ t, f, dur: 1.2, vol: v * 0.13, a: 0.002, out, echo: 0.3 });
      this.tone({ t, f: f * 4, dur: 0.3, vol: v * 0.03, a: 0.001, out });
    },
    bell: (t, m, dur, v, out) => this.bell(t, mtof(m), Math.max(1.5, dur), v * 0.12, out, 3.5, 1.6, 0.25),
    choir: (t, m, dur, v, out) => {
      const f = mtof(m), end = t + dur + 0.9;
      const g = this.adsr(t, dur, v * 0.16, 0.35, 0.4, 0.9, 0.7, out);
      const sum = this.ctx.createGain();
      const bands = ([[730, 7, 1], [1090, 9, 0.6], [2440, 12, 0.25]] as const).map(([ff, q, gv]) => {
        const b = this.filt("bandpass", ff, q), bg = this.ctx.createGain(); bg.gain.value = gv; sum.connect(b).connect(bg).connect(g); return [b, bg];
      }).flat();
      const os = this.oscs(t, end, [["sawtooth", f, -8, 1], ["sawtooth", f, 9, 1]], sum, sum, g, ...bands);
      this.vibrato(t, end, os, 5.1, 10, 0.3);
    },
    glass: (t, m, dur, v, out) => {
      const f = mtof(m), end = t + dur + 0.8;
      const g = this.adsr(t, dur, v * 0.1, 0.06, 0.3, 0.7, 0.6, out);
      this.send(g, 0.35);
      const os = this.oscs(t, end, [["sine", f, 0, 1], ["sine", f * 2, 3, 0.22], ["triangle", f, 0, 0.25]], g, g);
      this.vibrato(t, end, os, 5.2, 10, 0.25);
    },
    accordion: (t, m, dur, v, out) => {
      const f = mtof(m), end = t + dur + 0.2, lp = this.filt("lowpass", 2400, 0.7);
      const g = this.adsr(t, dur, v * 0.05, 0.02, 0.1, 0.8, 0.08, out); lp.connect(g);
      this.oscs(t, end, [["square", f, -9, 1], ["square", f, 9, 1], ["sawtooth", f / 2, 0, 0.5]], lp, lp, g);
    },
    sub: (t, m, dur, v, out) => {
      const f = mtof(m), g = this.adsr(t, dur, v * 0.3, 0.02, 0.2, 0.9, 0.15, out);
      this.oscs(t, t + dur + 0.3, [["sine", f, 0, 1], ["triangle", f, 0, 0.2]], g, g);
    },
    kick: (t, _m, _dur, v, out) => {
      this.tone({ t, f: 150, to: 42, glide: 0.12, dur: 0.42, vol: v * 0.9, a: 0.002, out });
      this.noise({ t, dur: 0.03, vol: v * 0.25, lp: 1400, out });
    },
    piston: (t, m, dur, v, out) => { // kick with a steam exhale after it
      this.play.kick(t, m, dur, v * 0.9, out);
      this.noise({ t: t + 0.06, dur: 0.22, vol: v * 0.06, hp: 2800, a: 0.03, out });
    },
    clank: (t, _m, _dur, v, out) => {
      this.noise({ t, dur: 0.17, vol: v * 0.5, bp: 1900, q: 1.1, out });
      this.tone({ t, f: 220, to: 150, dur: 0.1, type: "triangle", vol: v * 0.3, out });
      this.metal(t, 690, 0.3, v * 0.06, out);
    },
    hat: (t, _m, _dur, v, out) => this.noise({ t, dur: 0.045, vol: v * 0.22, hp: 7000, out }),
    hatO: (t, _m, _dur, v, out) => this.noise({ t, dur: 0.24, vol: v * 0.14, bp: 8500, q: 0.8, a: 0.01, out }),
    anvil: (t, m, _dur, v, out) => this.metal(t, mtof(m || 86), 1.4, v * 0.18, out, 0.12),
    tick: (t, _m, _dur, v, out) => {
      this.noise({ t, dur: 0.02, vol: v * 0.3, bp: 3600, q: 5, out });
      this.tone({ t, f: 2400, dur: 0.015, vol: v * 0.05, out });
    },
    timp: (t, m, _dur, v, out) => {
      const f = mtof(m || 43);
      this.tone({ t, f: f * 1.03, to: f, glide: 0.1, dur: 1.4, vol: v * 0.5, a: 0.003, out });
      this.tone({ t, f: f * 1.5, dur: 0.5, vol: v * 0.12, out });
      this.noise({ t, dur: 0.12, vol: v * 0.2, lp: 400, out });
    },
    heart: (t, _m, _dur, v, out) => {
      this.tone({ t, f: 75, to: 40, glide: 0.12, dur: 0.28, vol: v * 0.7, out });
      this.tone({ t: t + 0.2, f: 66, to: 38, glide: 0.12, dur: 0.26, vol: v * 0.5, out });
    },
    steam: (t, _m, dur, v, out) => {
      const d = dur || 1.2;
      this.noise({ t, dur: d, vol: v * 0.09, bp: 5200, q: 0.6, a: d * 0.3, out });
      this.noise({ t, dur: d * 0.6, vol: v * 0.04, hp: 9000, a: 0.08, out });
    },
    chain: (t, _m, _dur, v, out) => {
      for (let i = 0; i < 6; i++) this.noise({ t: t + i * 0.045 + Math.random() * 0.01, dur: 0.03, vol: v * 0.14, bp: 2600 + Math.random() * 1500, q: 6, out });
    },
    drip: (t, m, _dur, v, out) => { const f = mtof(m || 84); this.tone({ t, f, to: f * 1.6, glide: 0.05, dur: 0.22, vol: v * 0.12, out, echo: 0.45 }); },
    sonar: (t, m, _dur, v, out) => this.bell(t, mtof(m || 79), 2.4, v * 0.14, out, 1.0, 0.6, 0.5),
    pick: (t, _m, _dur, v, out) => {
      this.metal(t, 340, 0.35, v * 0.2, out, 0, [1, 2.3, 3.9]);
      this.noise({ t, dur: 0.07, vol: v * 0.35, bp: 1100, q: 1, out });
      this.noise({ t: t + 0.03, dur: 0.3, vol: v * 0.08, bp: 3200, q: 0.8, a: 0.02, out });
    },
  };
}

// A brick-hall impulse response: the tail darkens as it fades.
function hallIR(ctx: BaseAudioContext, secs = 2.8, decay = 2.6) {
  const sr = ctx.sampleRate, len = Math.floor(sr * secs), b = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch); let y = 0;
    for (let i = 0; i < len; i++) {
      const k = i / len, a = 0.85 - 0.7 * k;
      y += a * ((Math.random() * 2 - 1) - y);
      d[i] = y * (1 - k) ** decay * (i < sr * 0.012 ? i / (sr * 0.012) : 1);
    }
  }
  return b;
}

// The soundboard's mix: a master compressor (so a big Liftoff bar and a quiet Lullaby bar sit at a similar
// level), a brick-hall reverb every lane sends into, and the instruments' echo feeding that reverb a little.
function buildMix(ctx: BaseAudioContext, dest: AudioNode) {
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const output = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.22;
  const trim = ctx.createGain(); trim.gain.value = 0.6; // matches the older score's loudness (renderFoundryPreview) on the busiest tracks
  output.connect(comp).connect(trim).connect(dest);
  const reverb = ctx.createConvolver(); reverb.buffer = hallIR(ctx); reverb.connect(output);
  const instruments = new SoundtrackInstruments(ctx, noise, output);
  const er = ctx.createGain(); er.gain.value = 0.3; instruments.echo.connect(er).connect(reverb);
  return { output, reverb, instruments };
}

// One track playing: its layers, its knobs, its own bar clock.
class Lane {
  readonly out: GainNode;
  private lg = {} as Record<LayerId, GainNode>;
  private filter: BiquadFilterNode;
  private on: Record<LayerId, boolean>;
  bar = 0;
  next: number;
  constructor(private ctx: BaseAudioContext, private inst: SoundtrackInstruments, readonly role: Role, readonly track: Track, readonly knobs: Knobs, dest: AudioNode, reverb: AudioNode, start: number, low: boolean) {
    this.out = ctx.createGain(); this.out.gain.value = 0; this.out.connect(dest);
    const vol = ctx.createGain(); vol.gain.value = knobs.volume / 100;
    this.filter = ctx.createBiquadFilter(); this.filter.type = "lowpass"; this.filter.Q.value = 0.5; this.filter.frequency.value = brightnessHz(knobs);
    const rev = ctx.createGain(); rev.gain.value = reverbSend(knobs);
    this.filter.connect(vol).connect(this.out);
    this.filter.connect(rev).connect(reverb);
    this.on = layersFor(knobs.intensity, low);
    for (const id of LAYER_IDS) {
      const g = ctx.createGain(); g.gain.value = id === "pressure" ? knobs.tension / 100 : 1; g.connect(this.filter); this.lg[id] = g;
    }
    this.next = start;
  }
  get barSeconds() { return this.stepSeconds * this.track.meter * this.track.sub; }
  private get stepSeconds() { return 60 / ((this.track.bpm * this.knobs.tempo) / 100) / this.track.sub; }
  // Schedule one bar at this.next, then move the clock on.
  schedule() {
    const tr = this.track, step = this.stepSeconds, t0 = this.next, dark = this.knobs.tension >= 50;
    this.inst.echo.delayTime.setTargetAtTime(Math.min(1.5, step * tr.echo), t0, 0.1);
    const darken = (m: number) => (dark && m > 20 && tr.dark.includes((((m - tr.root) % 12) + 12) % 12) ? m - 1 : m);
    const B: Bar = {
      i: this.bar, dark, on: (id) => this.on[id],
      n: (layer, inst, m, at, len, vel) => {
        if (!this.on[layer]) return;
        this.inst.play[inst](t0 + at * step, darken(m), len * step, vel, this.lg[layer]);
      },
    };
    tr.bar(B);
    // the shared pressure layer: a heartbeat and a low drone that grow with tension
    const ten = this.knobs.tension / 100;
    if (ten > 0.05) {
      const p = this.inst.play, out = this.lg.pressure;
      p.heart(t0, 0, 0, 0.7, out);
      if (ten > 0.7) p.heart(t0 + step * tr.sub * 2, 0, 0, 0.5, out);
      if (this.bar % 2 === 0) p.bowed(t0, (tr.root % 12) + 36, tr.meter * tr.sub * step * 2, 0.6, out);
      if (ten > 0.75) p.brass(t0 + step * tr.sub * (tr.meter - 1), (tr.root % 12) + 42, step * tr.sub, 0.35, out);
    }
    this.next += this.barSeconds; this.bar++;
  }
  fade(to: number, at: number, secs: number) {
    const g = this.out.gain;
    g.cancelScheduledValues(at);
    g.setValueAtTime(g.value, at);
    g.linearRampToValueAtTime(to, at + secs);
  }
  dispose() { this.out.disconnect(); }
}

export class SoundtrackPlayer {
  private instruments: SoundtrackInstruments | null = null;
  private output: GainNode | null = null;
  private duck: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private lane: Lane | null = null;
  private leaving: { lane: Lane; fadeEnd: number; until: number }[] = [];
  private input: MusicInput = { moving: 0, working: 0, stationsBusy: 0, rejected: 0 };
  private lastCatch: number | null = null;
  private launchUntil = 0;
  private focus: "orbit" | "mine" | null = null;
  private firstRun = false;
  private barsHeld = 0;
  private silent = true;
  private timer: number | undefined;
  intensity = 0;
  tension = 0;
  state: MusicState = "idle";
  role: Role | null = null;
  // Legacy debug fields read by musicState().
  layers = {};
  chord: number[] = [];
  readonly low = new URLSearchParams(location.search).get("quality") === "2";
  constructor(private s: typeof sound) {}

  attach(bus: GainNode) {
    const ctx = this.s.audio;
    this.duck = ctx.createGain();
    this.duck.connect(bus);
    const mix = buildMix(ctx, this.duck);
    this.output = mix.output; this.output.gain.value = 0;
    this.reverb = mix.reverb; this.instruments = mix.instruments;
    this.timer = window.setInterval(() => this.tick(), 100);
  }
  setInput(input: MusicInput) { this.input = input; }
  alert() { this.lastCatch = performance.now(); }
  // What the camera is in on. The orbit watch and the mines have their own tracks.
  setFocus(f: Focus | null) { this.focus = musicFocus(f); }
  setFirstRun(on: boolean) { this.firstRun = on; }
  // A PR launched: duck under the roar, then the victory lap.
  resolve(delay = 0) {
    if (!this.on || !this.duck) return;
    const t = this.s.audio.currentTime + delay;
    this.launchUntil = performance.now() + delay * 1000 + LAUNCH_MS;
    this.lastCatch = null;
    this.duck.gain.cancelScheduledValues(t);
    this.duck.gain.setTargetAtTime(0.3, t, 0.12);
    this.duck.gain.setTargetAtTime(1, t + 3, 0.5);
  }
  private get on() { return this.s.canPlay && this.s.settings.music && this.s.settings.musicVolume > 0 && !document.hidden; }
  // Called synchronously by settings/visibility changes, so even already queued notes go quiet.
  sync() {
    if (!this.output || this.on || this.silent) return;
    const t = this.s.audio.currentTime;
    this.output.gain.cancelScheduledValues(t);
    this.output.gain.setTargetAtTime(0, t, 0.015);
    this.instruments?.stop(t + 0.08);
    this.duck?.gain.cancelScheduledValues(t);
    this.duck?.gain.setValueAtTime(1, t);
    this.lane?.dispose(); this.lane = null;
    this.leaving.forEach((l) => l.lane.dispose()); this.leaving = [];
    this.role = null;
    this.silent = true;
  }
  debug() {
    return { state: this.state, role: this.role, track: this.lane?.track.name ?? null, bar: this.lane?.bar ?? -1,
      activeVoices: this.instruments?.activeVoices ?? 0, scheduledNotes: this.instruments?.scheduled ?? 0,
      loadedStems: [], decodedBytes: 0, low: this.low };
  }

  private wanted(): Role {
    const tt = tensionFor(this.input, this.lastCatch == null ? null : performance.now() - this.lastCatch);
    this.intensity = ease(this.intensity, intensityFor(this.input), 0.5);
    this.tension = ease(this.tension, tt, tt > this.tension ? 0.75 : 0.4);
    const launching = performance.now() < this.launchUntil;
    this.state = stateFor(this.intensity, this.tension, false, this.state);
    return roleFor({ state: this.state, focus: this.focus, firstRun: this.firstRun, launching });
  }

  private start(role: Role, at: number) {
    const ctx = this.s.audio, pick = PICKS[role];
    const lane = new Lane(ctx, this.instruments!, role, trackById(pick.track), pick.knobs, this.output!, this.reverb!, at, this.low);
    if (this.lane) {
      this.lane.fade(0, at, CROSSFADE_S);
      this.leaving.push({ lane: this.lane, fadeEnd: at + CROSSFADE_S, until: at + CROSSFADE_S + 4 });
      lane.fade(1, at, CROSSFADE_S);
    } else lane.fade(1, at, 1.2);
    this.lane = lane; this.role = role; this.barsHeld = 0;
  }

  private tick() {
    if (!this.output || !this.instruments) return;
    if (!this.on) { this.sync(); return; }
    const ctx = this.s.audio;
    if (this.silent) {
      this.silent = false;
      this.output.gain.cancelScheduledValues(ctx.currentTime);
      this.output.gain.setTargetAtTime(1, ctx.currentTime, 0.04);
    }
    if (!this.lane) this.start(this.wanted(), ctx.currentTime + 0.08);
    // a browser stall: missed bars stay missed, pick up on the next one
    if (this.lane!.next < ctx.currentTime) this.lane!.next = ctx.currentTime + 0.05;
    while (this.lane!.next < ctx.currentTime + 0.3) {
      const role = nextRole(this.role, this.wanted(), this.barsHeld);
      if (role !== this.role) this.start(role, this.lane!.next);
      this.lane!.schedule();
      this.barsHeld++;
    }
    // the outgoing track keeps playing under the crossfade, so it fades out instead of stopping dead
    this.leaving = this.leaving.filter((l) => {
      while (l.lane.next < l.fadeEnd && l.lane.next < ctx.currentTime + 0.3) l.lane.schedule();
      if (ctx.currentTime < l.until) return true;
      l.lane.dispose(); return false;
    });
  }
  stop() {
    window.clearInterval(this.timer);
    this.instruments?.stop(this.s.audio.currentTime);
    this.output?.disconnect();
  }
}

// Deterministic-length audition of one moment's track through the same instruments, lanes and mix as the game.
// Used to check loudness against the older score (renderFoundryPreview) and to listen without playing the game.
export async function renderSoundtrackPreview(role: Role, bars = 8, sampleRate = 24000) {
  const pick = PICKS[role], track = trackById(pick.track);
  const barS = (60 / ((track.bpm * pick.knobs.tempo) / 100)) * track.meter;
  const ctx = new OfflineAudioContext(1, Math.ceil((barS * bars + 3) * sampleRate), sampleRate);
  const { output, reverb, instruments } = buildMix(ctx, ctx.destination);
  const lane = new Lane(ctx, instruments, role, track, pick.knobs, output, reverb, 0, false);
  lane.out.gain.value = 1;
  for (let i = 0; i < bars; i++) lane.schedule();
  return ctx.startRendering();
}
