// "Up from the Mine" — original Shiptorio score, CC0. No recordings or borrowed melodies.
// A sixteen-bar question/answer: earthy open fifth → climbing sixth → suspended answer → home.
// The same motif travels up the factory, from low strings to the aether/celesta voice.
import { BAR_SECONDS, EIGHTH, type Arrangement, type MusicState } from './music';

export type Instrument = 'organ' | 'string' | 'brass' | 'celesta' | 'metal' | 'piston' | 'steam';
export interface Note { instrument: Instrument; midi: number; at: number; duration: number; velocity: number }
export interface ScoreFrame { state: MusicState; arrangement: Arrangement; bar: number; launchBar: number | null; low: boolean; title?: boolean }

// Each pair shares its harmony, but answers the motif differently. Notes are eighth-note slots;
// -1 means breathe. This is a composed phrase, rather than random chord-tone blips.
const THEME = [
  [60,-1,67,69,-1,67,64,-1], [62,-1,64,-1,67,-1,60,-1],
  [64,-1,69,71,-1,72,71,-1], [69,-1,67,-1,64,-1,-1,-1],
  [65,-1,69,72,-1,74,72,-1], [69,-1,67,-1,65,-1,64,-1],
  [67,-1,71,74,-1,76,74,-1], [71,-1,69,67,-1,-1,62,-1],
  [69,-1,72,76,-1,74,72,-1], [71,-1,72,-1,69,-1,64,-1],
  [69,-1,72,77,-1,76,74,-1], [72,-1,69,-1,65,-1,-1,-1],
  [69,-1,74,77,-1,76,74,-1], [71,-1,74,79,-1,77,74,-1],
  [76,-1,74,72,-1,67,64,-1], [62,-1,67,-1,71,-1,-1,-1],
];
const HARMONY = [ [48,52,55], [48,52,55], [45,48,52], [45,48,52],
  [41,45,48], [41,45,48], [43,47,50], [43,47,50],
  [45,48,52], [45,48,52], [41,45,48], [41,45,48],
  [38,41,45], [43,47,50], [48,52,55], [43,47,50] ];
const DARK = [[45,48,52], [41,45,48], [38,41,45], [40,44,47]];
const FANFARE = [[67,-1,72,74,76,-1,79,-1], [81,-1,79,76,79,-1,84,-1], [84,-1,-1,-1,79,-1,76,-1]];

export function notesFor(frame: ScoreFrame): Note[] {
  const { state, arrangement: a, bar, launchBar, low } = frame;
  const phrase = ((bar % 16) + 16) % 16;
  const blocked = state === 'blocked';
  const launch = state === 'launch' && launchBar != null;
  const chord = launch ? (launchBar === 0 ? [43,47,50] : [48,52,55]) : blocked ? DARK[phrase % 4] : HARMONY[phrase];
  const notes: Note[] = [];
  const add = (instrument: Instrument, midi: number, step: number, length: number, velocity: number) => {
    notes.push({ instrument, midi, at: step * EIGHTH, duration: length * EIGHTH, velocity });
  };
  chord.forEach(n => add('organ', n, 0, 8.6, 0.075));
  // Idle leaves whole bars empty above the harmonium; four-bar rests between the low calls.
  const melody = launch ? FANFARE[Math.min(2, launchBar)] : blocked
    ? [chord[1]+12,-1,chord[2]+12,chord[2]+14,-1,chord[2]+12,chord[1]+12,-1] : THEME[phrase];
  const full = a.theme || frame.title || launch;
  for (let step = 0; step < 8; step++) {
    if (melody[step] < 0) continue;
    if (state === 'idle' && (phrase % 4 !== 0 || step % 4 !== 0)) continue;
    if (!full && state !== 'idle' && step % 2 !== 0) continue;
    const register = launch ? 0 : full ? 12 : state === 'idle' ? -12 : 0;
    add(full ? 'celesta' : 'string', melody[step] + register, step, full ? 2.6 : 3.2, launch ? 0.21 : full ? 0.16 : 0.13);
  }
  if (a.rhythm || blocked || launch) {
    for (const step of [0,4]) add('piston', 32, step, 0.7, 0.19);
    if (!low) for (const step of [1,3,5,7]) add('steam', 84, step, 0.22, 0.025);
    for (const step of [2,6]) add('metal', 62 + (phrase % 2) * 5, step, 0.65, 0.065);
  }
  if (a.bass || launch) {
    add('string', chord[0]-12, 0, 3.2, 0.19);
    add('string', chord[0]-5, 4, 2.3, 0.15);
    if (!low) add('string', chord[0], 7, 0.8, 0.1);
  }
  if (a.counter && !low && !blocked && !launch) {
    add('string', chord[2]+12, 1, 2.7, 0.085);
    add('string', chord[1]+12, 5, 2.7, 0.085);
  }
  if (blocked) {
    add('brass', chord[0]-12, 0, 7.5, 0.15);
    if (!low) add('brass', chord[0]+1, 4, 3.5, 0.035); // pressure, not an alarm siren
    for (const step of [0,0.65,4,4.65]) add('piston', 28, step, 0.5, 0.13);
  }
  return notes;
}

// Sample-free additive instruments. A single cached PeriodicWave per timbre keeps the audio
// graph small; all voice envelopes have soft attacks and releases, including the metal hits.
const PARTIALS: Record<Instrument, number[]> = {
  organ: [1,0.42,0.18,0.14,0.04,0.035], string: [1,0.48,0.25,0.12,0.06,0.025],
  brass: [1,0.65,0.38,0.2,0.12,0.055,0.025], celesta: [1,0.03,0.22,0.015,0.06,0.02],
  metal: [0.2,0,0.65,0,0.25,0,0.4,0,0.07,0,0.2], piston: [1,0.08],
  steam: [0,0,0,0,0,0,1,0.3,0.7,0.2,0.6],
};

export class FoundryInstruments {
  private waves = new Map<Instrument, PeriodicWave>();
  private voices = new Set<OscillatorNode>();
  scheduled = 0;
  constructor(private ctx: BaseAudioContext) {}
  get activeVoices() { return this.voices.size; }

  play(note: Note, when: number, out: AudioNode, cutoff?: number) {
    const ctx = this.ctx;
    const oscillator = ctx.createOscillator();
    let wave = this.waves.get(note.instrument);
    if (!wave) {
      const partials = PARTIALS[note.instrument];
      wave = ctx.createPeriodicWave(new Float32Array(partials.length+1), new Float32Array([0,...partials]));
      this.waves.set(note.instrument, wave);
    }
    oscillator.setPeriodicWave(wave);
    const hz = 440 * 2 ** ((note.midi-69)/12);
    oscillator.frequency.setValueAtTime(hz, when);
    if (note.instrument === 'piston') oscillator.frequency.exponentialRampToValueAtTime(hz*0.45, when+0.12);
    const gain = ctx.createGain();
    const pluck = ['celesta','metal','piston','steam'].includes(note.instrument);
    const attack = Math.min(note.duration*0.2, pluck ? 0.008 : note.instrument === 'brass' ? 0.16 : 0.055);
    gain.gain.setValueAtTime(0,when);
    gain.gain.linearRampToValueAtTime(note.velocity,when+attack);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001,note.velocity*(pluck ? 0.12 : 0.7)),when+note.duration*0.72);
    gain.gain.linearRampToValueAtTime(0,when+note.duration);
    oscillator.connect(gain);
    let filter: BiquadFilterNode | undefined;
    if (cutoff && ['brass','string','organ'].includes(note.instrument)) {
      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = cutoff; filter.Q.value = 0.5;
      gain.connect(filter).connect(out);
    } else gain.connect(out);
    this.voices.add(oscillator);
    this.scheduled++;
    oscillator.onended = () => { this.voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); filter?.disconnect(); };
    oscillator.start(when);
    oscillator.stop(when+note.duration+0.01);
  }
  stop(when: number) { for (const voice of this.voices) voice.stop(when); }
}

// Deterministic audition rendered by the exact instrument/score path used in the game.
// Kept out of initial bundles; scripts/music/verify.mjs writes the resulting WAV.
export async function renderFoundryPreview() {
  const duration = BAR_SECONDS*25;
  const ctx = new OfflineAudioContext(1, Math.ceil(duration*24000), 24000);
  const output = ctx.createGain(); output.gain.value = 0.8; output.connect(ctx.destination);
  const instruments = new FoundryInstruments(ctx);
  for (let bar = 0; bar < 25; bar++) {
    const state: MusicState = bar < 5 ? 'idle' : bar < 12 ? 'working' : bar < 18 ? 'blocked' : bar < 21 ? 'launch' : 'working';
    const a = { rhythm: bar>=5, bass: bar>=7, counter: bar>=9, theme: bar>=11 };
    for (const note of notesFor({ state, arrangement:a, bar, launchBar:state==='launch' ? bar-18 : null, low:false })) {
      if (bar*BAR_SECONDS+note.at+note.duration < duration) instruments.play(note,bar*BAR_SECONDS+note.at,output, state==='blocked' ? 1100 : 3200);
    }
  }
  return ctx.startRendering();
}
