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
  | "think"
  | "arm"
  | "shipped"
  | "ci_buzz"
  | "verify_caught"
  | "review_stamp"
  | "gate_clank"
  | "orbit_clear"
  | "orbit_alarm"
  | "research"
  | "station_drop"
  | "suggest"
  | "permit_grant"
  | "permit_revoke"
  | "level_up"
  | "achievement"
  | "beat"
  | "beat_done"
  | "finale";

import { SCAPES, type Focus } from "./scapes";
import { MusicPlayer } from "./musicPlayer";
import type { MusicInput } from "./music";
import type { FoundryPlayer } from "./foundryPlayer";

export const SFX_EVENT = "shiptorio:sfx";
export interface SfxEvent {
  sfx: Sfx;
  delayMs: number;
}

export type { Focus };
type Settings = { muted: boolean; volume: number; music: boolean; musicVolume: number };
const KEY = "shiptorio.sound";
const MIN_GAP_MS = 90; // same effect can't stack faster than this

function load(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (s && typeof s.muted === "boolean" && typeof s.volume === "number") return { music: true, ...s, musicVolume: typeof s.musicVolume === "number" && Number.isFinite(s.musicVolume) ? Math.max(0, Math.min(1, s.musicVolume)) : 0.8 };
  } catch {}
  return { muted: false, volume: 0.5, music: true, musicVolume: 0.8 };
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  // Two buses: the floor (everything) and the focus (the thing you clicked into).
  // Focusing muffles and ducks the floor and plays that thing's own soundscape up close.
  private floor: GainNode | null = null;
  private floorLp: BiquadFilterNode | null = null;
  private near: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private music: MusicPlayer | FoundryPlayer = new MusicPlayer(this);
  private musicLevel: GainNode | null = null;
  private musicLoading = false;
  private musicAttached = false;
  private musicInput: MusicInput = { moving: 0, working: 0, stationsBusy: 0, rejected: 0 };
  private focus: Focus | null = null;
  private scapeStop: (() => void) | null = null;
  private step = 0;
  private noiseBuf: AudioBuffer | null = null;
  private hum: GainNode | null = null;
  private stationHum: GainNode | null = null;
  private stationsBusy = 0;
  private workTimer: number | undefined;
  private workRate = 0; // working machines
  private lastClank = 0;
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
      if (document.hidden) {
        this.syncMusic();
        void this.ctx.suspend();
      }
      else if (!this.off) { void this.ctx.resume(); void this.startMusic(); }
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
    this.floorLp = ctx.createBiquadFilter();
    this.floorLp.type = "lowpass";
    this.floorLp.frequency.value = 18000;
    this.floor = ctx.createGain();
    this.floor.connect(this.floorLp).connect(this.master);
    this.near = ctx.createGain();
    this.near.gain.value = 0;
    this.near.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicLevel = ctx.createGain();
    this.musicBus.connect(this.musicLevel).connect(this.master);
    this.applyVolume();
    // 1s of white noise, sampled at a low rate later for that crunchy 8-bit texture
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    this.startHum();
    this.workTimer = window.setInterval(() => this.workTick(), 260);
    window.setInterval(() => this.scapeTick(), 125);
    void this.startMusic();
    const f = this.focus;
    this.focus = null;
    this.setFocus(f);
  }

  // ---------- settings ----------

  set(next: Partial<Settings>) {
    this.settings = { ...this.settings, ...next };
    this.settings.volume = Math.max(0, Math.min(1, this.settings.volume));
    this.settings.musicVolume = Number.isFinite(this.settings.musicVolume) ? Math.max(0, Math.min(1, this.settings.musicVolume)) : 0.8;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.settings));
    } catch {}
    this.applyVolume();
    this.syncMusic();
    void this.startMusic();
    this.listeners.forEach((f) => f());
  }

  subscribe(f: () => void) {
    this.listeners.add(f);
    return () => void this.listeners.delete(f);
  }

  private get off() {
    return this.settings.muted || this.settings.volume <= 0;
  }

  private applyVolume() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    this.musicLevel?.gain.setTargetAtTime(this.settings.music && !this.off ? this.settings.musicVolume : 0, ctx.currentTime, 0.03);
    const v = this.off ? 0 : this.settings.volume ** 2 * 0.6; // squared feels linear to the ear
    this.master.gain.setTargetAtTime(v, ctx.currentTime, 0.03);
    // muted: once the fade is done, suspend the whole context so the drones and the music pad stop costing battery
    if (this.off) window.setTimeout(() => this.off && ctx.state === "running" && void ctx.suspend(), 200);
    else if (!document.hidden && ctx.state !== "running") void ctx.resume();
  }

  private get live() {
    return !!this.ctx && !!this.master && !this.off && this.ctx.state === "running";
  }

  get canPlay() {
    return this.live;
  }

  // ---------- music ----------

  private syncMusic() {
    if ("sync" in this.music) this.music.sync();
  }

  private async startMusic() {
    if (!this.ctx || !this.musicBus || this.musicAttached || this.musicLoading || this.off || !this.settings.music || this.settings.musicVolume <= 0 || document.hidden) return;
    this.musicLoading = true;
    try {
      // The v2 chunk is never requested by first-load rendering, or while music is off.
      if (new URLSearchParams(location.search).get("music") !== "1") {
        await this.ctx.resume();
        const { FoundryPlayer } = await import("./foundryPlayer");
        if (this.off || !this.settings.music || this.settings.musicVolume <= 0 || document.hidden) return;
        this.music = new FoundryPlayer(this);
      }
      this.music.setInput(this.musicInput);
      this.music.attach(this.musicBus);
      this.musicAttached = true;
    } catch (error) {
      console.warn("Music could not start", error);
    } finally { this.musicLoading = false; }
  }

  // What the adaptive score listens to. See music.ts for how this becomes layers and tension.
  setMusic(i: MusicInput) {
    this.musicInput = i;
    this.music.setInput(i);
  }

  // A station caught something: the score tenses up.
  musicAlert() {
    this.music.alert();
  }

  // A PR launched: the score ducks under the roar and cadences home.
  musicResolve(delay = 0) {
    if (this.ctx) this.music.resolve(delay);
  }

  // For tests and the dev overlay: what the score is doing right now.
  musicState() {
    const m = this.music;
    return { intensity: m.intensity, tension: m.tension, layers: m.layers, chord: m.chord,
      version: new URLSearchParams(location.search).get("music") !== "1" ? 2 : 1,
      state: "debug" in m ? m.debug().state : "legacy", loadedStems: [],
      ...("debug" in m ? m.debug() : {}), attached: this.musicAttached };
  }

  // ---------- ambience ----------

  // How busy the floor is. Belts hum louder with more items riding; assemblers clank per working machine.
  setAmbience(beltsBusy: number, working: number) {
    this.humLevel = Math.max(0, Math.min(1, beltsBusy));
    this.workRate = working;
    if (this.ctx && this.hum) this.hum.gain.setTargetAtTime(0.012 + this.humLevel * 0.05, this.ctx.currentTime, 0.4);
  }

  // Gauntlet stations with work in them hum: a low electrical chord that thickens as more stations get busy.
  setStationsBusy(n: number) {
    this.stationsBusy = n;
    if (this.ctx && this.stationHum) this.stationHum.gain.setTargetAtTime(Math.min(4, n) * 0.012, this.ctx.currentTime, 0.5);
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
    lp.connect(g).connect(this.floor!);
    this.hum = g;
    // station hum: 98 + 147 Hz mains-ish buzz through a soft filter, pulsing slowly
    const sg = ctx.createGain();
    sg.gain.value = 0;
    const slp = ctx.createBiquadFilter();
    slp.type = "lowpass";
    slp.frequency.value = 500;
    const trem = ctx.createGain();
    const tl = ctx.createOscillator();
    const ta = ctx.createGain();
    tl.frequency.value = 0.7;
    ta.gain.value = 0.35;
    tl.connect(ta).connect(trem.gain);
    for (const [f, type] of [[98, "square"], [147, "triangle"], [196.3, "triangle"]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.connect(slp);
      o.start();
    }
    tl.start();
    slp.connect(trem).connect(sg).connect(this.floor!);
    this.stationHum = sg;
    this.setStationsBusy(this.stationsBusy);
    this.setAmbience(this.humLevel, this.workRate);
  }

  private workTick() {
    if (!this.live || this.workRate <= 0) return;
    // more assemblers → denser clanking, capped so it stays a texture: a soft clank every second or two, never a
    // drum roll (it was up to ~3 a second, Justin's playtest 2026-10-27)
    const now = performance.now();
    if (now - this.lastClank < 900) return;
    if (Math.random() > Math.min(0.5, 0.2 + this.workRate * 0.1)) return;
    this.lastClank = now;
    this.out = this.floor!;
    const t = this.ctx!.currentTime + Math.random() * 0.05;
    const pitch = [196, 220, 247, 294][Math.floor(Math.random() * 4)];
    this.tone({ f: pitch, dur: 0.05, type: "square", vol: 0.035, at: t });
    this.noise({ dur: 0.04, vol: 0.04, hp: 2000, at: t });
  }

  // Ship streak: one rising note per ship in the streak (capped), each a half step higher, so a run sounds like it's building.
  streak(n: number, delay = 0) {
    if (!this.live || n < 2) return;
    this.out = this.floor!;
    const t = this.ctx!.currentTime + delay;
    const steps = Math.min(n, 6);
    for (let i = 0; i < steps; i++) {
      const f = 784 * 2 ** ((i * 2 + n - 2) / 12);
      this.tone({ f, dur: 0.09, vol: 0.1, at: t + i * 0.08 });
      this.tone({ f: f * 1.5, dur: 0.09, type: "triangle", vol: 0.05, at: t + i * 0.08 });
    }
    this.tone({ f: 784 * 2 ** ((steps * 2 + n) / 12), dur: 0.4, type: "triangle", vol: 0.1, at: t + steps * 0.08 });
  }

  // ---------- focus ----------

  // What the camera is locked onto, or null for the whole floor. Eases in and out.
  setFocus(f: Focus | null) {
    const same = f && this.focus && f.kind === this.focus.kind && f.key === this.focus.key;
    this.focus = f;
    if (!this.ctx || !this.floor || !this.floorLp || !this.near) return;
    const t = this.ctx.currentTime;
    this.floorLp.frequency.setTargetAtTime(f ? 650 : 18000, t, f ? 0.25 : 0.4);
    this.floor.gain.setTargetAtTime(f ? 0.35 : 1, t, f ? 0.25 : 0.4);
    this.musicBus?.gain.setTargetAtTime(f ? 0.45 : 1, t, f ? 0.25 : 0.4);
    if (same) return;
    // fade the old scape out, then start the new one
    const old = this.scapeStop;
    this.scapeStop = null;
    this.near.gain.setTargetAtTime(0, t, 0.12);
    window.setTimeout(() => {
      old?.();
      if (!this.focus || this.focus !== f || !this.ctx) return;
      this.out = this.near!;
      this.scapeStop = SCAPES[f.kind].start?.(this, this.near!) ?? (() => {});
      this.near!.gain.setTargetAtTime(1.6, this.ctx.currentTime, 0.3);
    }, old ? 300 : 0);
  }

  // Keep the busy level fresh without restarting the scape.
  updateFocus(f: Focus | null) {
    if (!f || !this.focus || f.kind !== this.focus.kind || f.key !== this.focus.key) return this.setFocus(f);
    this.focus = f;
  }

  focusKey() {
    return this.focus?.key ?? null;
  }

  private scapeTick() {
    if (!this.live || !this.focus || !this.scapeStop) return;
    this.out = this.near!;
    SCAPES[this.focus.kind].step?.(this, this.near!, this.step++, this.focus);
  }

  get now() {
    return this.ctx!.currentTime;
  }

  get audio() {
    return this.ctx!;
  }

  get noiseBuffer() {
    return this.noiseBuf!;
  }

  // ---------- primitives ----------

  tone(o: { f: number; to?: number; dur: number; type?: OscillatorType; vol?: number; at?: number; attack?: number; out?: AudioNode }) {
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
    osc.connect(g).connect(o.out ?? this.out);
    osc.start(t);
    osc.stop(t + o.dur + 0.02);
  }

  noise(o: { dur: number; vol?: number; lp?: number; hp?: number; bp?: number; at?: number; rate?: number; sweepTo?: number; attack?: number; out?: AudioNode }) {
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
    if (o.bp) {
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = o.bp;
      f.Q.value = 4;
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
    node.connect(g).connect(o.out ?? this.out);
    src.start(t);
    src.stop(t + o.dur + 0.02);
  }

  // ---------- effects ----------

  // Where one-shots go right now. play() points this at the near bus for the focused thing's sounds.
  private out!: AudioNode;

  // near: this sound belongs to the thing you're focused on, so it plays up close, unmuffled
  play(s: Sfx, delay = 0, near = false) {
    // captions hear every sound, even muted or before the first click (ui/SoundCaptions.tsx)
    window.dispatchEvent(new CustomEvent<SfxEvent>(SFX_EVENT, { detail: { sfx: s, delayMs: delay * 1000 } }));
    if (!this.live) return;
    this.out = near && this.focus ? this.near! : this.floor!;
    const now = performance.now();
    if (now - (this.last.get(s) ?? 0) < MIN_GAP_MS) return;
    this.last.set(s, now);
    let t = this.ctx!.currentTime + delay;
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
      case "rework": // a heavy clunk as it drops onto the rework belt, then it rattles away
        this.tone({ f: 110, to: 45, dur: 0.22, type: "square", vol: 0.22, at: t });
        this.noise({ dur: 0.1, vol: 0.22, lp: 700, at: t });
        t += 0.12;
        for (let i = 0; i < 5; i++) this.tone({ f: 520 - i * 70, dur: 0.05, vol: 0.08, at: t + i * 0.06 });
        this.noise({ dur: 0.35, vol: 0.05, lp: 1200, at: t, rate: 0.25 });
        break;
      case "dock": // PR clamps onto the launch pad
        this.tone({ f: 220, to: 110, dur: 0.1, vol: 0.16, at: t });
        this.noise({ dur: 0.05, vol: 0.15, hp: 1500, at: t + 0.04 });
        this.tone({ f: 660, dur: 0.05, vol: 0.08, at: t + 0.12 });
        break;
      case "launch": {
        // 3 · 2 · 1 countdown over the rocket's oxygen vent hissing, then the clamps let go, the deluge water
        // rushes, and the engine lights. The roar opens up as it throttles, then closes down as it climbs away.
        [0, 0.22, 0.44].forEach((d) => this.tone({ f: 880, dur: 0.09, vol: 0.12, at: t + d }));
        this.tone({ f: 1760, dur: 0.18, vol: 0.13, at: t + 0.66 });
        this.noise({ dur: 0.75, vol: 0.05, hp: 3500, at: t, attack: 0.25 });
        const ign = t + 0.7;
        for (let i = 0; i < 4; i++) {
          const at = ign - 0.1 + i * 0.03;
          this.tone({ f: 260 - i * 20, to: 120, dur: 0.07, vol: 0.1, at });
          this.noise({ dur: 0.03, vol: 0.12, bp: 3200, at });
        }
        this.noise({ dur: 2.2, vol: 0.1, bp: 1600, at: ign - 0.1, attack: 0.3 });
        this.noise({ dur: 1.5, vol: 0.32, lp: 300, sweepTo: 2400, at: ign, rate: 0.5, attack: 0.15 });
        this.noise({ dur: 2.0, vol: 0.3, lp: 2400, sweepTo: 220, at: ign + 1.3, rate: 0.5, attack: 0.2 });
        this.noise({ dur: 3.3, vol: 0.28, lp: 130, at: ign, rate: 0.25, attack: 0.3 }); // the rumble under it all
        this.tone({ f: 55, to: 180, dur: 2.6, type: "sawtooth", vol: 0.1, at: ign, attack: 0.2 });
        this.noise({ dur: 0.4, vol: 0.3, lp: 800, at: ign });
        // the kick you feel in your chest, then exhaust crackle that thins out with distance
        this.tone({ f: 120, to: 32, dur: 0.6, type: "sine", vol: 0.45, at: ign });
        for (let i = 0; i < 22; i++) {
          const k = Math.random() ** 1.6 * 2.6;
          this.noise({ dur: 0.025, vol: 0.13 * (1 - k / 3), hp: 2500, at: ign + 0.2 + k });
        }
        break;
      }
      case "chirp": { // Spark drone: two quick bird-like blips
        const b = 1400 + Math.random() * 500;
        this.tone({ f: b, to: b * 1.5, dur: 0.05, type: "sine", vol: 0.09, at: t });
        this.tone({ f: b * 1.2, to: b * 1.8, dur: 0.06, type: "sine", vol: 0.08, at: t + 0.07 });
        break;
      }
      case "arm": // you hit LAUNCH: a chunky switch, then a charge-up whine
        this.noise({ dur: 0.05, vol: 0.3, lp: 2000, at: t });
        this.tone({ f: 160, to: 80, dur: 0.08, vol: 0.25, at: t });
        this.tone({ f: 220, to: 880, dur: 0.45, type: "sawtooth", vol: 0.07, at: t + 0.05, attack: 0.1 });
        this.tone({ f: 1320, dur: 0.08, type: "triangle", vol: 0.1, at: t + 0.5 });
        break;
      case "shipped": {
        // the "you shipped it" fanfare: a quick climbing arpeggio into a big held major chord with sparkles
        [523, 659, 784, 1047].forEach((f, i) => {
          this.tone({ f, dur: 0.11, vol: 0.13, at: t + i * 0.07 });
          this.tone({ f: f / 2, dur: 0.11, type: "triangle", vol: 0.1, at: t + i * 0.07 });
        });
        const hold = t + 0.3;
        for (const [f, type] of [[523, "square"], [659, "square"], [784, "triangle"], [1047, "triangle"], [262, "triangle"]] as const) {
          this.tone({ f, dur: 1.1, type, vol: type === "square" ? 0.07 : 0.1, at: hold, attack: 0.01 });
        }
        this.noise({ dur: 0.08, vol: 0.18, lp: 1200, at: hold }); // a little drum hit under the chord
        this.tone({ f: 130, to: 60, dur: 0.18, type: "sine", vol: 0.3, at: hold });
        for (let i = 0; i < 6; i++) this.tone({ f: [2093, 2637, 3136, 4186][i % 4], dur: 0.12, type: "sine", vol: 0.05, at: hold + 0.15 + i * 0.09 });
        break;
      }
      case "ci_buzz": // CI failed: the inspector's harsh reject buzzer, two blasts
        for (const d of [0, 0.28]) {
          this.tone({ f: 110, dur: 0.22, type: "sawtooth", vol: 0.16, at: t + d });
          this.tone({ f: 116, dur: 0.22, type: "square", vol: 0.1, at: t + d });
        }
        break;
      case "verify_caught": // verify bay caught a bad fix: klaxon whoop, then the ram slams it back
        for (const d of [0, 0.3]) this.tone({ f: 440, to: 880, dur: 0.26, type: "square", vol: 0.1, at: t + d });
        this.noise({ dur: 0.3, vol: 0.3, lp: 600, sweepTo: 120, at: t + 0.62, rate: 0.5 });
        this.tone({ f: 80, to: 38, dur: 0.32, vol: 0.3, at: t + 0.62 });
        this.tone({ f: 1568, dur: 0.06, type: "triangle", vol: 0.08, at: t + 1.0 }); // "gotcha" tick
        break;
      case "review_stamp": // AI review approves: a solid rubber stamp, then a warm two-note OK
        this.noise({ dur: 0.06, vol: 0.32, lp: 900, at: t });
        this.tone({ f: 70, to: 40, dur: 0.12, type: "sine", vol: 0.35, at: t });
        this.tone({ f: 659, dur: 0.1, type: "triangle", vol: 0.1, at: t + 0.12 });
        this.tone({ f: 988, dur: 0.18, type: "triangle", vol: 0.1, at: t + 0.21 });
        break;
      case "gate_clank": // merge gate: heavy bolts slide back, chain rattle, the gate clanks open
        this.noise({ dur: 0.05, vol: 0.25, hp: 1200, at: t });
        this.tone({ f: 180, to: 120, dur: 0.08, vol: 0.2, at: t });
        for (let i = 0; i < 6; i++) this.noise({ dur: 0.03, vol: 0.1, bp: 2500 + i * 200, at: t + 0.1 + i * 0.045 });
        this.tone({ f: 65, to: 45, dur: 0.35, type: "square", vol: 0.2, at: t + 0.4 });
        this.noise({ dur: 0.18, vol: 0.25, lp: 900, at: t + 0.4 });
        break;
      case "orbit_clear": // orbit watch, 24h clean: two rising radar pings and a soft bell, all clear
        this.tone({ f: 1046, dur: 0.12, type: "sine", vol: 0.1, at: t });
        this.tone({ f: 1568, dur: 0.25, type: "sine", vol: 0.1, at: t + 0.16 });
        this.tone({ f: 2093, dur: 0.9, type: "sine", vol: 0.05, at: t + 0.36 });
        this.tone({ f: 3136, dur: 0.6, type: "sine", vol: 0.025, at: t + 0.36 });
        break;
      case "orbit_alarm": // orbit watch saw new errors after launch
        for (let i = 0; i < 3; i++) this.tone({ f: 988, to: 740, dur: 0.18, type: "square", vol: 0.1, at: t + i * 0.22 });
        break;
      case "research": // spend science packs: flasks clink in, bubbling, then a rising "learned it" sweep
        for (let i = 0; i < 4; i++) this.tone({ f: 2200 + i * 260, dur: 0.04, type: "triangle", vol: 0.07, at: t + i * 0.06 });
        for (let i = 0; i < 8; i++) {
          const f = 300 + Math.random() * 500;
          this.tone({ f, to: f * 1.8, dur: 0.05, type: "sine", vol: 0.05, at: t + 0.25 + i * 0.05 });
        }
        this.tone({ f: 330, to: 1320, dur: 0.5, type: "triangle", vol: 0.09, at: t + 0.65 });
        [659, 831, 988].forEach((f, i) => this.tone({ f, dur: 0.35, type: "square", vol: 0.05, at: t + 1.1 + i * 0.05 }));
        break;
      case "station_drop": // a new station drops onto the line: falling whistle, heavy landing, bolts torqued in
        this.tone({ f: 1800, to: 300, dur: 0.45, type: "sine", vol: 0.07, at: t });
        this.tone({ f: 90, to: 35, dur: 0.4, type: "sine", vol: 0.45, at: t + 0.45 });
        this.noise({ dur: 0.25, vol: 0.3, lp: 700, at: t + 0.45 });
        for (let i = 0; i < 3; i++) {
          this.noise({ dur: 0.05, vol: 0.12, bp: 3000, at: t + 0.8 + i * 0.13 });
          this.tone({ f: 600 + i * 120, dur: 0.04, vol: 0.06, at: t + 0.8 + i * 0.13 });
        }
        break;
      case "suggest": // "hey, look at this": a soft two-note nudge
        this.tone({ f: 880, dur: 0.1, type: "sine", vol: 0.09, at: t });
        this.tone({ f: 1319, dur: 0.22, type: "sine", vol: 0.09, at: t + 0.11 });
        break;
      case "permit_grant": {
        // a lane earned its launch permit: official seal thump, brass rise, bell
        this.noise({ dur: 0.07, vol: 0.3, lp: 900, at: t });
        this.tone({ f: 80, to: 45, dur: 0.18, type: "sine", vol: 0.4, at: t });
        const b = t + 0.15;
        [[392, 0], [523, 0.12], [659, 0.24]].forEach(([f, d]) => {
          this.tone({ f, dur: 0.14, type: "sawtooth", vol: 0.06, at: b + d });
          this.tone({ f, dur: 0.14, type: "square", vol: 0.05, at: b + d });
        });
        for (const f of [784, 988, 1175]) this.tone({ f, dur: 0.9, type: "triangle", vol: 0.08, at: b + 0.38 });
        this.tone({ f: 2637, dur: 1.2, type: "sine", vol: 0.05, at: b + 0.38 });
        break;
      }
      case "permit_revoke": // a lane lost its permit: everything powers down a notch
        this.tone({ f: 660, to: 160, dur: 0.6, type: "sawtooth", vol: 0.08, at: t });
        this.tone({ f: 330, to: 80, dur: 0.6, type: "square", vol: 0.05, at: t });
        this.noise({ dur: 0.08, vol: 0.15, lp: 600, at: t + 0.6 });
        break;
      case "level_up": // autonomy level up: a big climbing run into a held chord
        [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.tone({ f, dur: 0.1, vol: 0.09, at: t + i * 0.06 }));
        for (const f of [523, 784, 1047, 1319]) this.tone({ f, dur: 1.2, type: "triangle", vol: 0.07, at: t + 0.4 });
        break;
      case "achievement": // an achievement unlocked: a coin-bright double chime, a sparkle run, a warm held fifth
        this.tone({ f: 70, to: 50, dur: 0.2, type: "sine", vol: 0.25, at: t });
        this.tone({ f: 988, dur: 0.08, type: "square", vol: 0.07, at: t });
        this.tone({ f: 1319, dur: 0.3, type: "square", vol: 0.07, at: t + 0.08 });
        for (let i = 0; i < 5; i++) this.tone({ f: 2093 + i * 300, dur: 0.05, type: "sine", vol: 0.04, at: t + 0.22 + i * 0.04 });
        for (const f of [659, 988, 1319]) this.tone({ f, dur: 1, type: "triangle", vol: 0.06, at: t + 0.42 });
        break;
      case "beat": // intro: the next card slides in
        this.noise({ dur: 0.18, vol: 0.06, lp: 2500, sweepTo: 600, at: t, attack: 0.05 });
        this.tone({ f: 523, dur: 0.06, type: "triangle", vol: 0.06, at: t + 0.12 });
        break;
      case "beat_done": // intro: your move landed
        this.tone({ f: 784, dur: 0.08, type: "triangle", vol: 0.1, at: t });
        this.tone({ f: 1175, dur: 0.08, type: "triangle", vol: 0.1, at: t + 0.08 });
        this.tone({ f: 1568, dur: 0.25, type: "triangle", vol: 0.1, at: t + 0.16 });
        break;
      case "finale": // intro's last beat: lights out, the whole factory hums in harmony
        for (const [f, v] of [[131, 0.08], [196, 0.06], [262, 0.06], [330, 0.05], [392, 0.04]] as const) this.tone({ f, dur: 3, type: "triangle", vol: v, at: t, attack: 0.8 });
        for (let i = 0; i < 6; i++) this.tone({ f: [1047, 1319, 1568, 2093][i % 4], dur: 0.3, type: "sine", vol: 0.04, at: t + 0.8 + i * 0.25 });
        break;
      case "think": // Spark is thinking: a soft data warble
        for (let i = 0; i < 4; i++) this.tone({ f: 600 + Math.random() * 900, dur: 0.04, type: "triangle", vol: 0.05, at: t + i * 0.05 });
        break;
    }
  }
}

export const sound = new SoundEngine();
