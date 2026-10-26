// The up-close soundscape for each kind of thing you can click into. When the camera locks
// onto something, its scape plays on the near bus while the rest of the floor ducks and muffles.
// start() builds any steady drone and returns its stop; step() runs every 1/8 s for rhythm.
// busy (0..1) is how much work that thing has right now, so a jammed station sounds jammed.

import type { sound } from "./engine";

type Synth = typeof sound;
export type ScapeKind =
  | "ci"
  | "verify"
  | "review"
  | "merge"
  | "orbit"
  | "assembler"
  | "splitter"
  | "ore"
  | "pad"
  | "rework"
  | "steam"
  | "solar"
  | "geothermal"
  | "battery"
  | "turret"
  | "other";
export type Focus = { kind: ScapeKind; key: string; busy: number };
type Scape = {
  start?: (s: Synth, out: AudioNode) => () => void;
  step?: (s: Synth, out: AudioNode, i: number, f: Focus) => void;
};

// A steady bed: oscillators and/or looped filtered noise, faded in, with a stop that fades out.
function bed(s: Synth, out: AudioNode, parts: { osc?: [OscillatorType, number, number][]; noise?: { vol: number; lp?: number; bp?: number; rate?: number }; wobble?: [hz: number, depth: number] }) {
  const ctx = s.audio;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, ctx.currentTime);
  g.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.6);
  g.connect(out);
  const nodes: AudioScheduledSourceNode[] = [];
  let target: AudioNode = g;
  if (parts.wobble) {
    const trem = ctx.createGain();
    trem.connect(g);
    const lfo = ctx.createOscillator();
    const amt = ctx.createGain();
    lfo.frequency.value = parts.wobble[0];
    amt.gain.value = parts.wobble[1];
    lfo.connect(amt).connect(trem.gain);
    nodes.push(lfo);
    target = trem;
  }
  for (const [type, f, vol] of parts.osc ?? []) {
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = type;
    o.frequency.value = f;
    og.gain.value = vol;
    o.connect(og).connect(target);
    nodes.push(o);
  }
  if (parts.noise) {
    const n = ctx.createBufferSource();
    n.buffer = s.noiseBuffer;
    n.loop = true;
    n.playbackRate.value = parts.noise.rate ?? 1;
    const ng = ctx.createGain();
    ng.gain.value = parts.noise.vol;
    let node: AudioNode = n;
    for (const [type, f] of [["lowpass", parts.noise.lp], ["bandpass", parts.noise.bp]] as const) {
      if (!f) continue;
      const bf = ctx.createBiquadFilter();
      bf.type = type;
      bf.frequency.value = f;
      node = node.connect(bf);
    }
    node.connect(ng).connect(target);
    nodes.push(n);
  }
  nodes.forEach((n) => n.start());
  return () => {
    const t = ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0, t + 0.4);
    nodes.forEach((n) => n.stop(t + 0.45));
  };
}

const chance = (p: number) => Math.random() < p;
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

export const SCAPES: Record<ScapeKind, Scape> = {
  // CI inspector: scanner hum, a sweeping scan beep each bar, paper ticking through
  ci: {
    start: (s, out) => bed(s, out, { osc: [["triangle", 120, 0.03]], noise: { vol: 0.015, bp: 3000 } }),
    step: (s, out, i, f) => {
      const t = s.now;
      if (i % 16 === 0) s.tone({ f: 600, to: 1400, dur: 0.35, type: "sine", vol: 0.05, at: t, out });
      if (i % 2 === 0 && chance(0.3 + f.busy * 0.6)) s.noise({ dur: 0.02, vol: 0.06, hp: 4000, at: t, out });
      if (i % 16 === 8 && f.busy > 0) s.tone({ f: 1760, dur: 0.05, vol: 0.05, at: t, out });
    },
  },
  // Verify bay: hydraulic idle, the ram cycling with a pneumatic hiss
  verify: {
    start: (s, out) => bed(s, out, { osc: [["sawtooth", 48, 0.025], ["square", 96, 0.008]], noise: { vol: 0.01, lp: 400 }, wobble: [1.5, 0.3] }),
    step: (s, out, i, f) => {
      const t = s.now;
      const every = f.busy > 0 ? 12 : 24;
      if (i % every === 0) {
        s.tone({ f: 70, to: 140, dur: 0.4, type: "sawtooth", vol: 0.05, at: t, attack: 0.2, out });
        s.noise({ dur: 0.35, vol: 0.06, hp: 2500, at: t + 0.4, out });
      }
      if (i % every === 6) s.noise({ dur: 0.12, vol: 0.12, lp: 500, at: t, rate: 0.5, out });
    },
  },
  // AI review: terminal chatter, little thinking bleeps
  review: {
    start: (s, out) => bed(s, out, { osc: [["sine", 220, 0.02], ["sine", 330, 0.012]], wobble: [0.3, 0.4] }),
    step: (s, out, _i, f) => {
      if (chance(0.25 + f.busy * 0.5)) s.tone({ f: pick([880, 988, 1175, 1319, 1568, 1760]), dur: 0.04, type: "square", vol: 0.03, at: s.now, out });
      if (chance(0.05)) s.tone({ f: 523, to: 784, dur: 0.12, type: "triangle", vol: 0.04, at: s.now, out });
    },
  },
  // Merge gate: big gate hum and a slow beacon, faster when PRs wait on you
  merge: {
    start: (s, out) => bed(s, out, { osc: [["sawtooth", 55, 0.02], ["triangle", 110, 0.02]], noise: { vol: 0.008, lp: 300 } }),
    step: (s, out, i, f) => {
      if (i % (f.busy > 0 ? 8 : 16) === 0) s.tone({ f: 660, dur: 0.25, type: "sine", vol: 0.05, at: s.now, out });
    },
  },
  // Orbit watch: space pad and a radar ping with echoes
  orbit: {
    start: (s, out) => bed(s, out, { osc: [["sine", 196, 0.02], ["sine", 294, 0.015], ["sine", 392.5, 0.01]], wobble: [0.2, 0.5] }),
    step: (s, out, i) => {
      if (i % 20 === 0) [0, 0.25, 0.5].forEach((d, n) => s.tone({ f: 1200, dur: 0.15, type: "sine", vol: 0.06 / (n + 1), at: s.now + d, out }));
    },
  },
  // Assembler: servo whine, rhythmic press and clank. Idle machines just tick over.
  assembler: {
    start: (s, out) => bed(s, out, { osc: [["sawtooth", 82, 0.02], ["triangle", 330, 0.006]], noise: { vol: 0.01, lp: 800 } }),
    step: (s, out, i, f) => {
      const t = s.now;
      if (f.busy <= 0) {
        if (i % 16 === 0) s.tone({ f: 196, dur: 0.05, vol: 0.03, at: t, out });
        return;
      }
      if (i % 4 === 0) s.noise({ dur: 0.08, vol: 0.12, lp: 900, at: t, out });
      if (i % 4 === 2) s.tone({ f: pick([220, 247, 294]), dur: 0.05, vol: 0.05, at: t, out });
      if (i % 8 === 5) s.tone({ f: 400, to: 900, dur: 0.18, type: "sawtooth", vol: 0.025, at: t, out });
    },
  },
  // Splitter: sorter flaps flipping left and right
  splitter: {
    start: (s, out) => bed(s, out, { osc: [["triangle", 98, 0.02]], noise: { vol: 0.008, lp: 1200 } }),
    step: (s, out, i, f) => {
      if (i % 3 === 0 && chance(0.4 + f.busy * 0.5)) s.tone({ f: i % 6 ? 523 : 392, dur: 0.03, vol: 0.05, at: s.now, out });
    },
  },
  // Ore mine: grinding drill, rocks clinking into the hopper
  ore: {
    start: (s, out) => bed(s, out, { noise: { vol: 0.05, lp: 500, rate: 0.4 }, osc: [["sawtooth", 41, 0.02]], wobble: [7, 0.5] }),
    step: (s, out, _i, f) => {
      if (chance(0.15 + f.busy * 0.3)) s.tone({ f: pick([1500, 1800, 2100, 2500]), dur: 0.03, type: "triangle", vol: 0.04, at: s.now, out });
    },
  },
  // Launch pad: wind through the gantry, the rocket's oxygen vents hissing off, the tank pump ticking, steel
  // creaking in the cold; countdown pips when a PR waits on you
  pad: {
    start: (s, out) => bed(s, out, { noise: { vol: 0.03, lp: 700, rate: 0.3 }, osc: [["sine", 46, 0.015]], wobble: [0.15, 0.6] }),
    step: (s, out, i, f) => {
      const t = s.now;
      if (f.busy > 0 && i % 8 === 0) s.tone({ f: 880, dur: 0.06, vol: 0.04, at: t, out });
      if (chance(0.035)) s.noise({ dur: 0.5 + Math.random() * 0.6, vol: 0.05, hp: 3200, at: t, attack: 0.15, out });
      if (i % 6 === 0) s.noise({ dur: 0.02, vol: 0.025, bp: 1400, at: t, out });
      if (chance(0.02)) s.tone({ f: 140, to: 120, dur: 0.3, type: "sawtooth", vol: 0.03, at: t, out });
      if (chance(0.01)) s.tone({ f: 2400, to: 2250, dur: 0.25, type: "sine", vol: 0.012, at: t, out });
    },
  },
  // Rework belt: chattering rollers, a grumbling motor, louder the more that's riding it
  rework: {
    start: (s, out) => bed(s, out, { osc: [["sawtooth", 65, 0.02]], noise: { vol: 0.02, bp: 1800 }, wobble: [9, 0.4] }),
    step: (s, out, i, f) => {
      if (chance(0.3 + f.busy * 0.5)) s.noise({ dur: 0.02, vol: 0.05, hp: 2500, at: s.now, out });
      if (f.busy > 0 && i % 16 === 0) for (let k = 0; k < 3; k++) s.tone({ f: 440 - k * 60, dur: 0.05, vol: 0.04, at: s.now + k * 0.07, out });
    },
  },
  // Steam engine: piston chuff and a boiler rumble
  steam: {
    start: (s, out) => bed(s, out, { noise: { vol: 0.03, lp: 200, rate: 0.3 }, osc: [["sawtooth", 36, 0.02]] }),
    step: (s, out, i) => {
      if (i % 4 === 0) s.noise({ dur: 0.18, vol: 0.1, bp: 900, at: s.now, attack: 0.03, out });
      if (i % 32 === 16) s.noise({ dur: 0.8, vol: 0.05, hp: 3000, at: s.now, attack: 0.2, out });
    },
  },
  // Solar: a bright shimmering chord, soft sparkles
  solar: {
    start: (s, out) => bed(s, out, { osc: [["sine", 523, 0.015], ["sine", 659, 0.012], ["sine", 784, 0.012], ["sine", 1047, 0.006]], wobble: [0.5, 0.4] }),
    step: (s, out) => {
      if (chance(0.06)) s.tone({ f: pick([2093, 2349, 2637, 3136]), dur: 0.12, type: "sine", vol: 0.025, at: s.now, out });
    },
  },
  // Geothermal: deep earth rumble, bubbling
  geothermal: {
    start: (s, out) => bed(s, out, { noise: { vol: 0.06, lp: 150, rate: 0.25 }, osc: [["sine", 30, 0.05]] }),
    step: (s, out) => {
      if (chance(0.2)) {
        const f = 200 + Math.random() * 300;
        s.tone({ f, to: f * 2, dur: 0.06, type: "sine", vol: 0.04, at: s.now, out });
      }
    },
  },
  // Battery: transformer buzz, the occasional zap
  battery: {
    start: (s, out) => bed(s, out, { osc: [["sawtooth", 60, 0.012], ["square", 120, 0.006]] }),
    step: (s, out) => {
      if (chance(0.03)) s.noise({ dur: 0.05, vol: 0.06, hp: 5000, at: s.now, out });
    },
  },
  // Turret: servo scanning, a lock-on tick
  turret: {
    start: (s, out) => bed(s, out, { osc: [["triangle", 150, 0.01]] }),
    step: (s, out, i) => {
      if (i % 12 === 0) s.tone({ f: 300, to: 500, dur: 0.3, type: "sawtooth", vol: 0.02, at: s.now, out });
      if (i % 24 === 18) s.tone({ f: 1400, dur: 0.03, vol: 0.04, at: s.now, out });
    },
  },
  other: {
    start: (s, out) => bed(s, out, { osc: [["triangle", 110, 0.02]] }),
  },
};
