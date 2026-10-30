// Justin's steam & iron picks from the soundboard (2026-10-27, https://claude.ai/artifact/EdGMjvx9LP9xTfzNv9Cwe3).
// Every recipe is synthesized here with Web Audio: struck metal is inharmonic partials, bells are two-operator FM,
// brass is a filtered saw with a swell, steam is band-passed noise. No samples, nothing to license.
//
//   one-shots: machine taps, card Continue / Later, the hold-to-launch countdown, repairs, unlock, merged,
//              caught a bug, ore arriving (PICKS below names each one's soundboard take)
//   close-up:  a state layer on top of each machine's own scape (scapes.ts): working, stuck, rework, idle

import type { ScapeKind } from "./scapes";

export type SteamSfx =
  | "tap_planner" | "tap_assembler" | "tap_checks" | "tap_gate" | "tap_pad" | "tap_rocket" | "tap_orbit" | "tap_mine" | "tap_lift"
  | "card_go" | "card_later" | "hold_cancel" | "hold_go"
  | "repair_pry" | "repair_boiler" | "repair_cart"
  | "unlock" | "merged" | "caught" | "caught_ram" | "ore_pour";

export type MachineMood = "working" | "stuck" | "rework" | "idle";

// Which soundboard take each sound is (A/B), so the picks can be read back from the code.
export const PICKS: Record<string, string> = {
  tap_planner: "A Teletype wake", tap_assembler: "A Gear engage", tap_checks: "A Relay bank", tap_gate: "A Iron portcullis",
  tap_pad: "A Gantry hum", tap_rocket: "A Swing in and creak", tap_orbit: "A Sonar ping", tap_mine: "B Cart rumble", tap_lift: "A Cable winch",
  working: "A Steady chug", stuck: "A Grind and bell", rework: "A Rewind", idle: "A Pilot light",
  hold: "B Countdown clank", card_go: "A Brass latch", card_later: "A Slide away",
  repair_pry: "A Crowbar", repair_boiler: "A Ignite", repair_cart: "A Hammer",
  unlock: "A Foundry fanfare", merged: "A Ship's bell", caught: "A Ram slam", ore: "A Gravel pour",
};

// The tap sound for whatever the camera just flew in on. Rocket close-up is the pad with a rocket standing on it.
export function tapFor(kind: ScapeKind, key: string, busy: number): SteamSfx | null {
  if (key.startsWith("src:")) return "tap_mine";
  switch (kind) {
    case "splitter": return "tap_planner";
    case "assembler": return "tap_assembler";
    case "ci": case "verify": case "review": return "tap_checks";
    case "merge": return "tap_gate";
    case "pad": return busy > 0 ? "tap_rocket" : "tap_pad";
    case "orbit": return "tap_orbit";
    case "ore": return "tap_mine";
    default: return null;
  }
}

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);
// the countdown's four bell notes, one per quarter of the hold (C5 D5 E5 G5)
export const HOLD_TICKS = [523, 587, 659, 784];

type ToneOpts = { t: number; f: number; to?: number; glide?: number; dur: number; type?: OscillatorType; vol: number; a?: number; lp?: number; bp?: number; q?: number; out?: AudioNode };
type NoiseOpts = { t: number; dur: number; vol: number; a?: number; lp?: number; hp?: number; bp?: number; q?: number; sweepTo?: number; sweepT?: number; rate?: number; out?: AudioNode };

export class SteamKit {
  private shift = 0; // semitones the pitched part of the one-shot being played is moved by (play's last argument)
  constructor(private ctx: BaseAudioContext, private noiseBuf: AudioBuffer, private out: AudioNode) {}

  private vca(t: number, peak: number, a: number, dur: number, out: AudioNode) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, a + 0.02));
    g.connect(out);
    return g;
  }
  private filt(type: BiquadFilterType, f: number, q?: number) {
    const x = this.ctx.createBiquadFilter();
    x.type = type;
    x.frequency.value = f;
    if (q != null) x.Q.value = q;
    return x;
  }
  tone(o: ToneOpts) {
    const os = this.ctx.createOscillator();
    os.type = o.type ?? "sine";
    os.frequency.setValueAtTime(o.f, o.t);
    if (o.to) os.frequency.exponentialRampToValueAtTime(o.to, o.t + (o.glide ?? o.dur));
    const g = this.vca(o.t, o.vol, o.a ?? 0.004, o.dur, o.out ?? this.out);
    let n: AudioNode = os;
    if (o.lp) n = n.connect(this.filt("lowpass", o.lp, o.q ?? 0.7));
    if (o.bp) n = n.connect(this.filt("bandpass", o.bp, o.q ?? 3));
    n.connect(g);
    os.start(o.t);
    os.stop(o.t + o.dur + 0.05);
    os.onended = () => { os.disconnect(); g.disconnect(); };
  }
  noise(o: NoiseOpts) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = o.rate ?? 1;
    let n: AudioNode = src;
    let first: BiquadFilterNode | null = null;
    for (const [type, f, q] of [["bandpass", o.bp, o.q ?? 2], ["lowpass", o.lp, o.q ?? 0.7], ["highpass", o.hp, 0.7]] as const) {
      if (!f) continue;
      const x = this.filt(type, f, q);
      first ??= x;
      n = n.connect(x);
    }
    if (first && o.sweepTo) first.frequency.exponentialRampToValueAtTime(o.sweepTo, o.t + (o.sweepT ?? o.dur));
    const g = this.vca(o.t, o.vol, o.a ?? 0.004, o.dur, o.out ?? this.out);
    n.connect(g);
    src.start(o.t, Math.random() * 0.5);
    src.stop(o.t + o.dur + 0.05);
    src.onended = () => { src.disconnect(); g.disconnect(); };
  }
  // struck metal: inharmonic partials, the higher ones dying first
  metal(t: number, f: number, dur: number, vol: number, ratios = [1, 2.76, 5.4, 8.93], out?: AudioNode) {
    ratios.forEach((r, i) => this.tone({ t, f: f * r, dur: dur / (1 + i * 0.9), vol: vol / (1 + i * 0.8), a: 0.002, out }));
    this.noise({ t, dur: 0.02, vol: vol * 0.6, hp: 3500, out });
  }
  // two-operator FM bell; ratio 1 with a low index is a clean sonar ping
  bell(t: number, f: number, dur: number, vol: number, ratio = 3.5, index = 2, out?: AudioNode) {
    const ctx = this.ctx;
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const mg = ctx.createGain();
    car.frequency.value = f;
    mod.frequency.value = f * ratio;
    mg.gain.setValueAtTime(f * index, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.05, t + dur * 0.6);
    mod.connect(mg).connect(car.frequency);
    const g = this.vca(t, vol, 0.003, dur, out ?? this.out);
    car.connect(g);
    car.start(t);
    mod.start(t);
    car.stop(t + dur + 0.05);
    mod.stop(t + dur + 0.05);
    car.onended = () => { car.disconnect(); mod.disconnect(); mg.disconnect(); g.disconnect(); };
  }
  // a held voice: oscillators through an optional filter, soft attack and release
  private voice(t: number, dur: number, peak: number, attack: number, release: number, parts: [OscillatorType, number, number, number][], lp?: (f: BiquadFilterNode) => void, out?: AudioNode) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setTargetAtTime(peak * 0.8, t + attack, 0.08);
    g.gain.setTargetAtTime(0, t + Math.max(dur, attack), release / 4);
    g.connect(out ?? this.out);
    let dest: AudioNode = g;
    if (lp) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      lp(f);
      f.connect(g);
      dest = f;
    }
    const end = t + dur + release + 0.1;
    for (const [type, f, det, gv] of parts) {
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = det;
      og.gain.value = gv;
      o.connect(og).connect(dest);
      o.start(t);
      o.stop(end);
      o.onended = () => { o.disconnect(); og.disconnect(); };
    }
    setTimeout(() => g.disconnect(), (end - ctx.currentTime + 0.2) * 1000);
  }
  brass(t: number, m: number, dur: number, v: number, out?: AudioNode) {
    const f = mtof(m);
    this.voice(t, dur, v * 0.12, 0.05, 0.18, [["sawtooth", f, -5, 1], ["square", f, 5, 0.45]], (x) => {
      x.Q.value = 2.2;
      x.frequency.setValueAtTime(f * 1.1, t);
      x.frequency.linearRampToValueAtTime(Math.min(7000, f * (2.5 + 6 * v)), t + 0.07);
      x.frequency.setTargetAtTime(Math.min(5000, f * 3), t + 0.08, 0.15);
    }, out);
  }
  glass(t: number, m: number, dur: number, v: number, out?: AudioNode) {
    const f = mtof(m);
    this.voice(t, dur, v * 0.1, 0.06, 0.6, [["sine", f, 0, 1], ["sine", f * 2, 3, 0.22], ["triangle", f, 0, 0.25]], undefined, out);
  }
  celesta(t: number, m: number, v: number, out?: AudioNode) {
    const f = mtof(m);
    this.tone({ t, f, dur: 1.2, vol: v * 0.13, a: 0.002, out });
    this.tone({ t, f: f * 4, dur: 0.3, vol: v * 0.03, a: 0.001, out });
  }
  kick(t: number, v: number, out?: AudioNode) {
    this.tone({ t, f: 150, to: 42, glide: 0.12, dur: 0.42, vol: v * 0.9, a: 0.002, out });
    this.noise({ t, dur: 0.03, vol: v * 0.25, lp: 1400, out });
  }
  timp(t: number, m: number, v: number, out?: AudioNode) {
    const f = mtof(m);
    this.tone({ t, f: f * 1.03, to: f, glide: 0.1, dur: 1.4, vol: v * 0.5, a: 0.003, out });
    this.tone({ t, f: f * 1.5, dur: 0.5, vol: v * 0.12, out });
    this.noise({ t, dur: 0.12, vol: v * 0.2, lp: 400, out });
  }
  chain(t: number, v: number, out?: AudioNode) {
    for (let i = 0; i < 6; i++) this.noise({ t: t + i * 0.045 + Math.random() * 0.01, dur: 0.03, vol: v * 0.14, bp: 2600 + Math.random() * 1500, q: 6, out });
  }
  whoosh(t: number, up: boolean, dur: number, v: number) { this.noise({ t, dur, vol: v, bp: up ? 600 : 2400, sweepTo: up ? 2600 : 500, q: 1.2, a: dur * 0.5 }); }
  hiss(t: number, dur: number, v: number, f = 5000, out?: AudioNode) {
    this.noise({ t, dur, vol: v, bp: f, q: 0.7, a: 0.03, out });
    this.noise({ t, dur: dur * 0.7, vol: v * 0.4, hp: 8000, a: 0.02, out });
  }
  thunk(t: number, v: number, f: number, out?: AudioNode) {
    this.tone({ t, f, to: f * 0.4, glide: 0.1, dur: 0.3, vol: v, a: 0.002, out });
    this.noise({ t, dur: 0.06, vol: v * 0.4, lp: 900, out });
  }
  clank(t: number, v: number, f: number, out?: AudioNode) {
    this.metal(t, f, 0.5, v * 0.35, [1, 2.32, 4.25, 6.63], out);
    this.noise({ t, dur: 0.08, vol: v * 0.4, bp: 1500, q: 1, out });
  }
  ratchet(t: number, n: number, gap: number, v: number, f = 3000, out?: AudioNode) {
    for (let i = 0; i < n; i++) {
      this.noise({ t: t + i * gap, dur: 0.015, vol: v, bp: f + i * 60, q: 6, out });
      this.tone({ t: t + i * gap, f: 1800 + i * 40, dur: 0.012, vol: v * 0.12, out });
    }
  }
  creak(t: number, dur: number, v: number, f: number) {
    this.tone({ t, f, to: f * 1.35, dur, type: "sawtooth", vol: v, a: 0.08, bp: 900, q: 9 });
    this.tone({ t, f: f * 1.5, to: f * 1.9, dur, type: "sawtooth", vol: v * 0.5, a: 0.08, bp: 1700, q: 9 });
  }
  typer(t: number, n: number, gap: number, v: number, out?: AudioNode) {
    for (let i = 0; i < n; i++) {
      this.noise({ t: t + i * gap, dur: 0.025, vol: v, bp: 2600 + Math.random() * 800, q: 3, out });
      this.tone({ t: t + i * gap, f: 180, dur: 0.03, vol: v * 0.2, out });
    }
  }
  sonar(t: number, m: number, v: number, out?: AudioNode) {
    // the ping, then two fading returns (the soundboard had a delay line; here the echoes are spelled out)
    [0, 0.36, 0.72].forEach((d, i) => this.bell(t + d, mtof(m), 2.4, (v * 0.14) / (1 + i * 1.8), 1, 0.6, out));
  }
  drip(t: number, m: number, v: number, out?: AudioNode) {
    const f = mtof(m);
    this.tone({ t, f, to: f * 1.6, glide: 0.05, dur: 0.22, vol: v * 0.12, out });
    this.tone({ t: t + 0.3, f, to: f * 1.6, glide: 0.05, dur: 0.2, vol: v * 0.04, out });
  }
  heart(t: number, v: number, out?: AudioNode) {
    this.tone({ t, f: 75, to: 40, glide: 0.12, dur: 0.28, vol: v * 0.7, out });
    this.tone({ t: t + 0.2, f: 66, to: 38, glide: 0.12, dur: 0.26, vol: v * 0.5, out });
  }

  // ---------- the picked one-shots ----------
  /** semitones moves the pitched part of a one-shot up or down; only the bell chord (merged) listens, and it
   *  keeps its level: the city reveal plays it an octave down (-12) when every island is lit. */
  play(s: SteamSfx, t: number, out?: AudioNode, semitones = 0) {
    const home = this.out;
    const homeShift = this.shift;
    if (out) this.out = out;
    this.shift = Number.isFinite(semitones) ? semitones : 0;
    try {
      this.oneShot(s, t);
    } finally {
      this.out = home;
      this.shift = homeShift;
    }
  }
  private oneShot(s: SteamSfx, t: number) {
    switch (s) {
      case "tap_planner":
        this.whoosh(t, true, 0.35, 0.1);
        this.typer(t + 0.05, 3, 0.07, 0.35);
        this.glass(t + 0.28, 79, 0.5, 0.7);
        this.glass(t + 0.37, 86, 0.5, 0.7);
        break;
      case "tap_assembler":
        this.ratchet(t, 5, 0.04, 0.28);
        this.thunk(t + 0.22, 0.45, 95);
        this.hiss(t + 0.26, 0.3, 0.07);
        break;
      case "tap_checks":
        this.ratchet(t, 4, 0.06, 0.25, 2200);
        this.tone({ t: t + 0.25, f: 98, dur: 0.45, type: "sawtooth", vol: 0.05, a: 0.04, lp: 500 });
        this.tone({ t: t + 0.25, f: 147, dur: 0.45, type: "triangle", vol: 0.04, a: 0.04 });
        break;
      case "tap_gate":
        this.chain(t, 1.2);
        this.chain(t + 0.15, 0.8);
        this.thunk(t + 0.38, 0.7, 65);
        this.clank(t + 0.38, 0.6, 260);
        break;
      case "tap_pad":
        this.tone({ t, f: 55, to: 110, dur: 0.7, type: "sawtooth", vol: 0.08, a: 0.25, lp: 400 });
        this.tone({ t, f: 82, to: 165, dur: 0.7, vol: 0.1, a: 0.25 });
        this.hiss(t + 0.35, 0.8, 0.09, 7000);
        break;
      case "tap_rocket":
        this.whoosh(t, true, 0.5, 0.16);
        this.creak(t + 0.35, 0.7, 0.07, 110);
        this.hiss(t + 0.7, 0.9, 0.07, 6500);
        break;
      case "tap_orbit":
        this.whoosh(t, true, 0.3, 0.08);
        this.sonar(t + 0.15, 84, 1.1);
        break;
      case "tap_mine": // B: a minecart rolls by on the rails
        this.noise({ t, dur: 0.9, vol: 0.2, lp: 500, rate: 0.6, a: 0.2 });
        this.ratchet(t + 0.1, 6, 0.12, 0.12, 1500);
        break;
      case "tap_lift":
        this.tone({ t, f: 120, to: 260, dur: 0.6, type: "sawtooth", vol: 0.06, a: 0.15, lp: 900 });
        for (let i = 0; i < 5; i++) this.metal(t + 0.12 + i * 0.09, 1900 + i * 80, 0.12, 0.05);
        break;
      case "card_go": // a latch clicks shut and two notes step up
        this.ratchet(t, 2, 0.035, 0.3, 2600);
        this.celesta(t + 0.06, 79, 0.7);
        this.celesta(t + 0.14, 86, 0.8);
        break;
      case "card_later": // a soft whoosh down and a low tick as it tucks away
        this.whoosh(t, false, 0.3, 0.12);
        this.tone({ t: t + 0.22, f: 330, dur: 0.06, vol: 0.06 });
        this.celesta(t + 0.22, 67, 0.35);
        break;
      case "hold_cancel": // let go early: the ratchet drops back
        this.metal(t, 330, 0.4, 0.06);
        this.tone({ t, f: 392, to: 262, dur: 0.3, vol: 0.06, type: "triangle" });
        break;
      case "hold_go": // countdown done: the clamps let go with a boom and a brass hit (the roar waits for the server's launch)
        this.whoosh(t, true, 0.35, 0.2);
        this.kick(t + 0.3, 1.2);
        this.timp(t + 0.3, 31, 1);
        [55, 60, 64, 67, 72].forEach((m) => this.brass(t + 0.35, m, 1.4, 0.7));
        break;
      case "repair_pry":
        this.creak(t, 0.5, 0.08, 160);
        this.tone({ t: t + 0.45, f: 2200, to: 1500, dur: 0.18, type: "sawtooth", vol: 0.03, bp: 2000, q: 6 });
        this.noise({ t: t + 0.55, dur: 0.08, vol: 0.4, bp: 700, q: 1 });
        [0.7, 0.82, 0.97].forEach((d, i) => {
          this.noise({ t: t + d, dur: 0.1, vol: 0.25 - i * 0.05, bp: 500 + i * 120, q: 1.5 });
          this.tone({ t: t + d, f: 180 - i * 20, dur: 0.12, type: "triangle", vol: 0.12 });
        });
        break;
      case "repair_boiler":
        this.noise({ t, dur: 0.12, vol: 0.25, bp: 3500, q: 1 });
        this.noise({ t: t + 0.25, dur: 1.1, vol: 0.35, lp: 300, sweepTo: 1200, sweepT: 0.3, a: 0.06, rate: 0.5 });
        this.tone({ t: t + 0.25, f: 70, to: 45, dur: 0.6, vol: 0.4 });
        this.tone({ t: t + 0.6, f: 55, dur: 1.4, type: "sawtooth", vol: 0.04, a: 0.4, lp: 250 });
        [74, 81, 86].forEach((m, i) => this.glass(t + 1 + i * 0.09, m, 0.5, 0.7));
        break;
      case "repair_cart":
        [0, 0.3, 0.6].forEach((d, i) => { this.metal(t + d, 420 * 1.19 ** i, 0.6, 0.14); this.thunk(t + d, 0.25, 120); });
        this.thunk(t + 0.95, 0.6, 70);
        this.noise({ t: t + 1.1, dur: 1, vol: 0.15, lp: 600, rate: 0.6, a: 0.2 });
        this.ratchet(t + 1.15, 6, 0.13, 0.08, 1400);
        break;
      case "unlock": // three brass notes climb, an anvil rings, a lamp hums on
        [67, 72, 76].forEach((m, i) => this.brass(t + i * 0.12, m, i === 2 ? 0.8 : 0.12, 0.9));
        this.metal(t + 0.36, 1047, 1.4, 0.08);
        this.tone({ t: t + 0.4, f: 110, dur: 1.2, type: "sawtooth", vol: 0.03, a: 0.3, lp: 400 });
        break;
      case "merged": // three rings of a big brass bell over a warm brass chord
        [0, 0.35, 0.7].forEach((d) => this.bell(t + d, 784 * 2 ** (this.shift / 12), 2.2, 0.13, 2.4, 1.4));
        [60, 64, 67, 72].forEach((m) => this.brass(t + 0.7, m + this.shift, 1.8, 0.6));
        break;
      case "caught": // the ram slams the lid shut, a low brass blat, a little "got it" tick
      case "caught_ram": { // the verify bay's ram lands 0.62s in, on its FAIL animation
        const slam = t + (s === "caught_ram" ? 0.62 : 0.2);
        this.hiss(slam - 0.2, 0.25, 0.1, 3000);
        this.noise({ t: slam, dur: 0.35, vol: 0.35, lp: 700, sweepTo: 120, rate: 0.5 });
        this.thunk(slam, 0.7, 70);
        this.brass(slam + 0.15, 40, 0.35, 0.9);
        this.celesta(slam + 0.6, 84, 0.6);
        break;
      }
      case "ore_pour": { // a scoop of ore pours into the cart, a little different each time
        const k = Math.random();
        this.noise({ t, dur: 0.35, vol: 0.18, bp: 1200 + k * 1400, q: 0.8, a: 0.04 });
        for (let i = 0; i < 6; i++) this.noise({ t: t + i * 0.04, dur: 0.02, vol: 0.15, bp: 2500 + Math.random() * 2000, q: 4 });
        this.thunk(t + 0.08, 0.15, 160 + k * 60);
        break;
      }
    }
  }

  // The countdown clank: one ratchet and a rising bell per quarter of the hold.
  holdTick(i: number, t: number, out?: AudioNode) {
    this.ratchet(t, 3, 0.06, 0.25, 2200, out);
    this.bell(t + 0.05, HOLD_TICKS[Math.min(i, HOLD_TICKS.length - 1)], 0.5, 0.1, 2.4, 1, out);
  }

  // ---------- close-up state layer (runs every 1/8 s next to the machine's own scape) ----------
  moodStep(m: MachineMood, i: number, t: number, out: AudioNode) {
    const k = i % 16;
    const bar = Math.floor(i / 16);
    if (m === "working") {
      if (k === 0) this.hiss(t, 0.6, 0.04, 4500, out); // a soft steam breath every bar
    } else if (m === "idle") {
      if (k === 0 && bar % 2 === 0) this.metal(t + Math.random() * 0.5, 2400 + Math.random() * 1500, 0.25, 0.025, undefined, out); // metal ticking as it cools
    } else if (m === "stuck") {
      if (k === 0) { // a soft two-tone bell asking for you
        this.bell(t + 0.4, 784, 1.4, 0.06, 2, 0.8, out);
        this.bell(t + 0.75, 622, 1.8, 0.06, 2, 0.8, out);
      }
      if (k === 8 && bar % 2 === 1) { this.clank(t, 0.25, 300, out); this.chain(t + 0.1, 0.4, out); }
    } else if (m === "rework") { // the machine winds backwards
      if (k === 0) this.tone({ t, f: 420, to: 110, dur: 0.9, type: "sawtooth", vol: 0.04, a: 0.05, lp: 1200, out });
      if (k % 4 === 2) this.thunk(t, 0.3, 75, out);
      if (k === 8) this.noise({ t, dur: 0.6, vol: 0.08, bp: 1500, sweepTo: 400, q: 1, a: 0.5, out });
    }
  }
  // The steady part of a mood: the straining motor when stuck, the pilot-light flutter when idle. Returns its stop.
  moodBed(m: MachineMood, out: AudioNode): () => void {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.connect(out);
    const srcs: AudioScheduledSourceNode[] = [];
    if (m === "stuck") {
      g.gain.setTargetAtTime(0.05, now, 0.4);
      const f = this.filt("lowpass", 380, 4);
      f.connect(g);
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = 52;
      o.connect(f);
      const wob = (target: AudioParam, depth: number) => {
        const l = ctx.createOscillator();
        const lg = ctx.createGain();
        l.frequency.value = 0.35;
        lg.gain.value = depth;
        l.connect(lg).connect(target);
        srcs.push(l);
      };
      wob(o.frequency, 9);
      wob(f.frequency, 140);
      srcs.push(o);
    } else if (m === "idle") {
      g.gain.setTargetAtTime(0.05, now, 0.4);
      const s = ctx.createBufferSource();
      s.buffer = this.noiseBuf;
      s.loop = true;
      s.playbackRate.value = 0.3;
      const f = this.filt("bandpass", 420, 1.2);
      s.connect(f).connect(g);
      const l = ctx.createOscillator();
      const lg = ctx.createGain();
      l.frequency.value = 7;
      lg.gain.value = 0.02;
      l.connect(lg).connect(g.gain);
      srcs.push(s, l);
    } else return () => g.disconnect();
    srcs.forEach((x) => x.start());
    return () => {
      g.gain.cancelScheduledValues(ctx.currentTime);
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      setTimeout(() => { srcs.forEach((x) => { try { x.stop(); } catch { /* already stopped */ } x.disconnect(); }); g.disconnect(); }, 800);
    };
  }
}
