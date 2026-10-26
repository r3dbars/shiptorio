// Procedural chiptune sound for the factory. Every effect is synthesized with Web Audio
// (square/triangle/saw oscillators + a noise buffer), so there are no audio files to license.
// Nothing makes a sound until the player clicks or presses a key: browsers block autoplay,
// and we wouldn't want it anyway.

export type Sfx =
  | "click"
  | "ore"
  | "place"
  | "machine_start"
  | "stamp_pass"
  | "stamp_fail"
  | "verify_pop"
  | "verify_ram"
  | "ai_pass"
  | "ai_fail"
  | "rework"
  | "dock"
  | "launch"
  | "chirp"
  | "think";

type Settings = { muted: boolean; volume: number };
const KEY = "shiptorio.sound";
const MIN_GAP_MS = 90; // same effect can't stack faster than this

function load(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (s && typeof s.muted === "boolean" && typeof s.volume === "number") return s;
  } catch {}
  return { muted: false, volume: 0.5 };
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private hum: GainNode | null = null;
  private workTimer: number | undefined;
  private workRate = 0; // working machines
  private humLevel = 0; // 0..1, how busy the belts are
  private last = new Map<Sfx, number>();
  private listeners = new Set<() => void>();
  settings: Settings = load();

  // Call once; waits for the first real gesture before creating the AudioContext.
  install() {
    const unlock = () => {
      this.start();
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    };
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    // UI clicks on any button or link
    document.addEventListener("click", (e) => {
      if ((e.target as Element | null)?.closest?.("button, a, input[type=range]")) this.play("click");
    }, true);
    window.addEventListener("keydown", (e) => {
      if (e.key.toLowerCase() === "m" && !(e.target instanceof HTMLInputElement) && !e.metaKey && !e.ctrlKey) this.set({ muted: !this.settings.muted });
    });
    document.addEventListener("visibilitychange", () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  private start() {
    if (this.ctx) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.applyVolume();
    // 1s of white noise, sampled at a low rate later for that crunchy 8-bit texture
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    this.startHum();
    this.workTimer = window.setInterval(() => this.workTick(), 260);
  }

  // ---------- settings ----------

  set(next: Partial<Settings>) {
    this.settings = { ...this.settings, ...next };
    this.settings.volume = Math.max(0, Math.min(1, this.settings.volume));
    try {
      localStorage.setItem(KEY, JSON.stringify(this.settings));
    } catch {}
    this.applyVolume();
    this.listeners.forEach((f) => f());
  }

  subscribe(f: () => void) {
    this.listeners.add(f);
    return () => void this.listeners.delete(f);
  }

  private applyVolume() {
    if (!this.ctx || !this.master) return;
    const v = this.settings.muted ? 0 : this.settings.volume ** 2 * 0.6; // squared feels linear to the ear
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
  }

  private get live() {
    return !!this.ctx && !!this.master && !this.settings.muted && this.settings.volume > 0 && this.ctx.state === "running";
  }

  // ---------- ambience ----------

  // How busy the floor is. Belts hum louder with more items riding; assemblers clank per working machine.
  setAmbience(beltsBusy: number, working: number) {
    this.humLevel = Math.max(0, Math.min(1, beltsBusy));
    this.workRate = working;
    if (this.ctx && this.hum) this.hum.gain.setTargetAtTime(0.012 + this.humLevel * 0.05, this.ctx.currentTime, 0.4);
  }

  private startHum() {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 220;
    // the belt's rattle: a slow wobble on the filter
    const lfo = ctx.createOscillator();
    const lfoAmt = ctx.createGain();
    lfo.frequency.value = 5.5;
    lfoAmt.gain.value = 60;
    lfo.connect(lfoAmt).connect(lp.frequency);
    for (const f of [55, 55.7, 110.4]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.connect(lp);
      o.start();
    }
    lfo.start();
    lp.connect(g).connect(this.master!);
    this.hum = g;
    this.setAmbience(this.humLevel, this.workRate);
  }

  private workTick() {
    if (!this.live || this.workRate <= 0) return;
    // more assemblers → denser clanking, capped so it stays a texture
    if (Math.random() > Math.min(0.85, 0.35 + this.workRate * 0.15)) return;
    const t = this.ctx!.currentTime + Math.random() * 0.05;
    const pitch = [196, 220, 247, 294][Math.floor(Math.random() * 4)];
    this.tone({ f: pitch, dur: 0.05, type: "square", vol: 0.05, at: t });
    this.noise({ dur: 0.04, vol: 0.06, hp: 2000, at: t });
  }

  // ---------- primitives ----------

  private tone(o: { f: number; to?: number; dur: number; type?: OscillatorType; vol?: number; at?: number; attack?: number }) {
    const ctx = this.ctx!;
    const t = o.at ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type ?? "square";
    osc.frequency.setValueAtTime(o.f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
    const v = o.vol ?? 0.2;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + (o.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + o.dur + 0.02);
  }

  private noise(o: { dur: number; vol?: number; lp?: number; hp?: number; at?: number; rate?: number; sweepTo?: number; attack?: number }) {
    const ctx = this.ctx!;
    const t = o.at ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = o.rate ?? 1;
    let node: AudioNode = src;
    if (o.lp) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(o.lp, t);
      if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t + o.dur);
      node = node.connect(f);
    }
    if (o.hp) {
      const f = ctx.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = o.hp;
      node = node.connect(f);
    }
    const g = ctx.createGain();
    const v = o.vol ?? 0.2;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + (o.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    node.connect(g).connect(this.master!);
    src.start(t);
    src.stop(t + o.dur + 0.02);
  }

  // ---------- effects ----------

  play(s: Sfx, delay = 0) {
    if (!this.live) return;
    const now = performance.now();
    if (now - (this.last.get(s) ?? 0) < MIN_GAP_MS) return;
    this.last.set(s, now);
    const t = this.ctx!.currentTime + delay;
    switch (s) {
      case "click":
        this.tone({ f: 1320, dur: 0.035, vol: 0.08, at: t });
        break;
      case "ore": // a chunk of ore drops onto the deposit
        this.tone({ f: 880, to: 1175, dur: 0.07, type: "triangle", vol: 0.12, at: t });
        this.tone({ f: 1175, dur: 0.09, type: "triangle", vol: 0.1, at: t + 0.06 });
        break;
      case "place": // building thunk
        this.tone({ f: 140, to: 60, dur: 0.18, type: "square", vol: 0.22, at: t });
        this.noise({ dur: 0.12, vol: 0.18, lp: 900, at: t });
        break;
      case "machine_start": // assembler spins up
        this.tone({ f: 110, to: 330, dur: 0.22, type: "sawtooth", vol: 0.08, at: t, attack: 0.03 });
        break;
      case "stamp_pass": // inspector's rubber stamp + a bright ding
        this.noise({ dur: 0.07, vol: 0.3, lp: 1400, at: t });
        this.tone({ f: 90, to: 50, dur: 0.1, vol: 0.2, at: t });
        this.tone({ f: 988, dur: 0.08, vol: 0.12, at: t + 0.08 });
        this.tone({ f: 1319, dur: 0.16, vol: 0.12, at: t + 0.15 });
        break;
      case "stamp_fail": // stamp + a buzzer
        this.noise({ dur: 0.07, vol: 0.3, lp: 1400, at: t });
        this.tone({ f: 90, to: 50, dur: 0.1, vol: 0.2, at: t });
        this.tone({ f: 165, dur: 0.32, type: "sawtooth", vol: 0.13, at: t + 0.08 });
        this.tone({ f: 156, dur: 0.32, type: "square", vol: 0.08, at: t + 0.08 });
        break;
      case "verify_pop": // verify bay: the hatch pops open, it ran clean
        this.tone({ f: 400, to: 1600, dur: 0.06, vol: 0.14, at: t });
        this.noise({ dur: 0.05, vol: 0.12, hp: 3000, at: t + 0.02 });
        break;
      case "verify_ram": // verify bay: the hydraulic ram slams it back
        this.noise({ dur: 0.3, vol: 0.28, lp: 600, sweepTo: 120, at: t, rate: 0.5 });
        this.tone({ f: 70, to: 40, dur: 0.3, vol: 0.25, at: t });
        break;
      case "ai_pass": // little sparkle arpeggio
        [784, 988, 1175, 1568].forEach((f, i) => this.tone({ f, dur: 0.07, type: "triangle", vol: 0.09, at: t + i * 0.045 }));
        break;
      case "ai_fail":
        this.tone({ f: 330, to: 220, dur: 0.2, type: "triangle", vol: 0.12, at: t });
        break;
      case "rework": // item rattles back down the rework belt
        for (let i = 0; i < 5; i++) this.tone({ f: 520 - i * 70, dur: 0.05, vol: 0.08, at: t + i * 0.06 });
        this.noise({ dur: 0.35, vol: 0.05, lp: 1200, at: t, rate: 0.25 });
        break;
      case "dock": // PR clamps onto the launch pad
        this.tone({ f: 220, to: 110, dur: 0.1, vol: 0.16, at: t });
        this.noise({ dur: 0.05, vol: 0.15, hp: 1500, at: t + 0.04 });
        this.tone({ f: 660, dur: 0.05, vol: 0.08, at: t + 0.12 });
        break;
      case "launch": {
        // 3 · 2 · 1 countdown, then ignition and a rising roar (the rocket clears the frame in ~3.4s)
        [0, 0.22, 0.44].forEach((d) => this.tone({ f: 880, dur: 0.09, vol: 0.12, at: t + d }));
        this.tone({ f: 1760, dur: 0.18, vol: 0.13, at: t + 0.66 });
        const ign = t + 0.7;
        this.noise({ dur: 3.0, vol: 0.32, lp: 300, sweepTo: 2400, at: ign, rate: 0.5, attack: 0.15 });
        this.tone({ f: 55, to: 180, dur: 2.6, type: "sawtooth", vol: 0.12, at: ign, attack: 0.2 });
        this.noise({ dur: 0.4, vol: 0.3, lp: 800, at: ign });
        break;
      }
      case "chirp": { // Spark drone: two quick bird-like blips
        const b = 1400 + Math.random() * 500;
        this.tone({ f: b, to: b * 1.5, dur: 0.05, type: "sine", vol: 0.09, at: t });
        this.tone({ f: b * 1.2, to: b * 1.8, dur: 0.06, type: "sine", vol: 0.08, at: t + 0.07 });
        break;
      }
      case "think": // Spark is thinking: a soft data warble
        for (let i = 0; i < 4; i++) this.tone({ f: 600 + Math.random() * 900, dur: 0.04, type: "triangle", vol: 0.05, at: t + i * 0.05 });
        break;
    }
  }
}

export const sound = new SoundEngine();
