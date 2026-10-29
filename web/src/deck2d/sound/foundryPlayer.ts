// Lazy-loaded only after unlock, with music enabled. Original procedural score, zero samples.
import type { sound } from './engine';
import { arrangementFor, BAR_SECONDS, crossfadeGains, ease, EIGHTH, FADE_SECONDS, intensityFor,
  nextBarTime, stateFor, tensionFor, transportAt, type Arrangement, type MusicInput, type MusicState } from './music';
import { FoundryInstruments, notesFor, type ScoreFrame } from './foundryScore';

export class FoundryPlayer {
  private instruments: FoundryInstruments | null = null;
  private output: GainNode | null = null;
  private duck: GainNode | null = null;
  private lane: GainNode | null = null;
  private input: MusicInput = { moving:0, working:0, stationsBusy:0, rejected:0 };
  private lastCatch: number | null = null;
  private launchAt: number | null = null;
  private launchBar: number | null = null;
  private nextTime = 0;
  private origin = 0;
  private step = 0;
  private bar = -1;
  private silent = true;
  private frame: ScoreFrame | null = null;
  private frameNotes: ReturnType<typeof notesFor> = [];
  private previous: { lane: GainNode; frame: ScoreFrame } | null = null;
  private timer: number | undefined;
  intensity = 0;
  tension = 0;
  state: MusicState = 'idle';
  arrangement: Arrangement = arrangementFor(0);
  // Legacy debug fields retained for the overlay.
  layers = {};
  chord: number[] = [];
  readonly loadedStems: string[] = [];
  readonly low = new URLSearchParams(location.search).get('quality') === '2';
  private title = new URLSearchParams(location.search).get('intro') === '1';
  constructor(private s: typeof sound) {}
  attach(bus: GainNode) {
    const ctx = this.s.audio;
    this.instruments = new FoundryInstruments(ctx);
    this.output = ctx.createGain(); this.output.gain.value = 0;
    this.duck = ctx.createGain();
    this.output.connect(this.duck).connect(bus);
    this.origin = ctx.currentTime+0.08;
    this.nextTime = this.origin;
    this.timer = window.setInterval(() => this.tick(),100);
  }
  setInput(input: MusicInput) { this.input = input; }
  alert() { this.lastCatch = performance.now(); }
  resolve(delay = 0) {
    if (!this.on || !this.duck) return;
    const t = this.s.audio.currentTime+delay;
    this.launchAt = nextBarTime(t+1,this.origin);
    this.lastCatch = null;
    this.duck.gain.cancelScheduledValues(t);
    this.duck.gain.setTargetAtTime(0.3,t,0.12);
    this.duck.gain.setTargetAtTime(1,t+3,0.5);
  }
  private get on() { return this.s.canPlay && this.s.settings.music && this.s.settings.musicVolume > 0 && !document.hidden; }
  // Called synchronously by settings/visibility changes, so even already queued notes are silent.
  sync() {
    if (!this.output || this.on || this.silent) return;
    const t = this.s.audio.currentTime;
    this.output.gain.cancelScheduledValues(t);
    this.output.gain.setTargetAtTime(0,t,0.015);
    this.instruments?.stop(t+0.08);
    this.duck?.gain.cancelScheduledValues(t);
    this.duck?.gain.setValueAtTime(1,t);
    this.launchAt = null; this.launchBar = null;
    this.silent = true;
  }
  debug() {
    return { state:this.state, loadedStems:this.loadedStems, bar:this.bar, arrangement:this.arrangement,
      activeVoices:this.instruments?.activeVoices ?? 0, scheduledNotes:this.instruments?.scheduled ?? 0,
      decodedBytes:0, low:this.low };
  }
  private tick() {
    if (!this.output || !this.instruments) return;
    if (!this.on) { this.sync(); return; }
    const ctx = this.s.audio;
    if (this.silent || this.nextTime < ctx.currentTime) {
      if (this.bar < 0) this.origin = ctx.currentTime+0.08;
      const recovered = transportAt(ctx.currentTime+0.04,this.origin);
      this.nextTime = recovered.time;
      this.step = recovered.step;
      this.bar = recovered.bar-(this.step === 0 ? 1 : 0);
      // Missed notes stay missed. Keep harmony/state until a real bar boundary; never
      // rush a backlog or add a whole silent bar just because a frame was late.
      if (this.frame && this.step !== 0) {
        this.frame = {...this.frame,bar:this.bar};
        this.frameNotes = notesFor(this.frame);
      }
      this.silent = false;
      this.output.gain.cancelScheduledValues(ctx.currentTime);
      this.output.gain.setTargetAtTime(1,ctx.currentTime,0.04);
    }
    while (this.nextTime < ctx.currentTime+0.3) {
      if (this.step === 0) this.beginBar(this.nextTime);
      const at = this.nextTime;
      for (const note of this.frameNotes) {
        if (Math.floor(note.at/EIGHTH+1e-6) === this.step) {
          this.instruments.play(note,at+note.at-this.step*EIGHTH,this.lane!,this.state === 'blocked' ? 1100 : 3200);
        }
      }
      // During a state transition, the outgoing arrangement continues briefly on the same
      // transport. Equal-power gains blend real old/new notes, not just a master fade.
      if (this.previous && this.step < 2) {
        for (const note of notesFor(this.previous.frame)) {
          if (Math.floor(note.at/EIGHTH+1e-6) === this.step && note.at < FADE_SECONDS) {
            this.instruments.play(note,at+note.at-this.step*EIGHTH,this.previous.lane,2200);
          }
        }
      }
      this.nextTime += EIGHTH; this.step = (this.step+1)%8;
    }
  }
  private beginBar(t: number) {
    const ctx = this.s.audio;
    this.bar++;
    if (this.launchAt != null && t+1e-6 >= this.launchAt) { this.launchBar=0; this.launchAt=null; }
    else if (this.launchBar != null && ++this.launchBar >= 3) this.launchBar=null;
    const tt = this.launchBar != null ? 0 : tensionFor(this.input,this.lastCatch==null ? null : performance.now()-this.lastCatch);
    this.intensity = ease(this.intensity,intensityFor(this.input),0.5);
    this.tension = ease(this.tension,tt,tt>this.tension ? 0.75 : 0.4);
    const state = stateFor(this.intensity,this.tension,this.launchBar!=null,this.state);
    const a = arrangementFor(this.intensity,this.arrangement);
    // Title motif is limited to the intro's first 16 bars; factory input takes over immediately.
    if (this.intensity >= 0.15 || this.bar >= 16) this.title=false;
    const changed = state!==this.state || Object.keys(a).some(k => a[k as keyof Arrangement]!==this.arrangement[k as keyof Arrangement]);
    if (this.previous) { this.previous.lane.disconnect(); this.previous=null; }
    if (!this.lane || changed) {
      const old = this.lane;
      this.lane = ctx.createGain(); this.lane.connect(this.output!);
      if (old && this.frame) {
        const outgoing = new Float32Array(33); const incoming = new Float32Array(33);
        for (let i=0;i<33;i++) [outgoing[i],incoming[i]]=crossfadeGains(i/32);
        old.gain.cancelScheduledValues(t);
        old.gain.setValueCurveAtTime(outgoing,t,FADE_SECONDS);
        this.lane.gain.setValueCurveAtTime(incoming,t,FADE_SECONDS);
        this.previous={lane:old,frame:{...this.frame,bar:this.bar}};
      }
    }
    this.state=state; this.arrangement=a;
    this.frame={state,arrangement:a,bar:this.bar,launchBar:this.launchBar,low:this.low,title:this.title};
    this.frameNotes=notesFor(this.frame);
  }
  stop() { window.clearInterval(this.timer); this.instruments?.stop(this.s.audio.currentTime); this.output?.disconnect(); }
}
