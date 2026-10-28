// Turns FactoryState changes into sounds. It only looks at state, so it works the same
// for the sim and the live server.

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { FactoryState, Inspection, Item, Machine, Station } from "@shiptorio/shared";
import { sound, type Focus, type Sfx } from "./engine";
import type { ScapeKind } from "./scapes";
import { celebrateShip } from "./ship";
import type { MusicInput } from "./music";
import { accentsFor, freshAccentMemory, LAUNCH_IRON_DELAY_S, limitAccents } from "./accents";
import { tapFor, type MachineMood } from "./steamIron";
import { calmSounds, freshCalm } from "./calm";

// Each gauntlet station's verdict sounds: [pass, fail].
const STATION_SFX: Record<Station["kind"], [pass: Sfx, fail: Sfx]> = {
  ci: ["stamp_pass", "ci_buzz"],
  verify: ["verify_pop", "verify_caught"],
  review: ["review_stamp", "ai_fail"],
  merge: ["gate_clank", "stamp_fail"],
  orbit: ["orbit_clear", "orbit_alarm"],
  custom: ["stamp_pass", "stamp_fail"],
  measure: ["orbit_clear", "stamp_fail"],
};
// Inspection gates are the older name for the same stations.
const GATE_KIND: Record<Inspection["stages"][number]["gate"], Station["kind"]> = { ci: "ci", verify: "verify", ai: "review", human: "merge" };

export const STATION_EVENT = "shiptorio:station";
export interface StationVerdict {
  stationId: string;
  kind: Station["kind"];
  ok: boolean;
  text: string;
}

// Stations whose last verdict just changed. Works for sim and live: both write station.lastLog on every pass and fail.
export function stationVerdicts(prev: FactoryState, next: FactoryState): StationVerdict[] {
  const out: StationVerdict[] = [];
  for (const st of next.stations ?? []) {
    const l = st.lastLog;
    const old = prev.stations?.find((x) => x.id === st.id)?.lastLog;
    if (l && (l.text !== old?.text || l.ok !== old?.ok)) out.push({ stationId: st.id, kind: st.kind, ok: l.ok, text: l.text });
  }
  return out;
}
// Which part of the factory each sound comes from, so it plays up close when you're focused there.
const SFX_FROM: Partial<Record<Sfx, ScapeKind>> = {
  ore: "ore",
  machine_start: "assembler",
  stamp_pass: "ci",
  stamp_fail: "ci",
  verify_pop: "verify",
  verify_ram: "verify",
  ai_pass: "review",
  ai_fail: "review",
  ci_buzz: "ci",
  verify_caught: "verify",
  review_stamp: "review",
  gate_clank: "merge",
  orbit_clear: "orbit",
  orbit_alarm: "orbit",
  rework: "rework",
  dock: "pad",
  launch: "pad",
};

const STATION_SCAPE: Record<Station["kind"], ScapeKind> = { ci: "ci", verify: "verify", review: "review", merge: "merge", orbit: "orbit", custom: "other", measure: "orbit" };
const MACHINE_SCAPE: Partial<Record<Machine["type"], ScapeKind>> = {
  inspector: "ci",
  launch_pad: "pad",
  ore_deposit: "ore",
  assembler: "assembler",
  splitter: "splitter",
  steam: "steam",
  solar: "solar",
  geothermal: "geothermal",
  battery: "battery",
  turret: "turret",
};

// The thing the camera is locked onto (a station id, "m:<machine id>", "rework" or "power"),
// as a soundscape kind plus how busy it is right now.
export function focusFor(key: string | null | undefined, state: FactoryState): Focus | null {
  const f = scapeFocus(key, state);
  return f && { ...f, mood: moodOf(f, state) };
}

// What the close-up should sound like: stuck when it's waiting on you, rework when work is going back
// to be fixed, working while it has work, idle when it has none.
export function moodOf(f: Focus, state: FactoryState): MachineMood {
  if (f.kind === "rework") return f.busy > 0 ? "rework" : "idle";
  const mid = f.key.startsWith("m:") ? f.key.slice(2) : undefined;
  const st = state.stations?.find((x) => x.id === f.key || (mid && x.machineId === mid));
  const machineId = st?.machineId ?? mid;
  const m = machineId ? state.machines.find((x) => x.id === machineId) : undefined;
  const focusOf = (id?: string) => !!id && (id === f.key || id === mid || `m:${id}` === f.key);
  const waiting = m?.state === "blocked" || (st && state.bottleneck?.stationId === st.id) || focusOf(state.move?.focus) || (m?.type === "launch_pad" && state.items.some((i) => i.state === "on_pad"));
  if (waiting) return "stuck";
  if (machineId && state.items.some((i) => i.state === "rejected" && i.machineId === machineId)) return "rework";
  return f.busy > 0 ? "working" : "idle";
}

function scapeFocus(key: string | null | undefined, state: FactoryState): Focus | null {
  if (!key) return null;
  const n = (x: number, full: number) => Math.min(1, x / full);
  if (key === "rework") return { kind: "rework", key, busy: n(state.items.filter((i) => i.state === "rejected").length, 3) };
  if (key === "power") return { kind: (state.power[0]?.kind ?? "steam") as ScapeKind, key, busy: 1 };
  const mid = key.startsWith("m:") ? key.slice(2) : undefined;
  const st = state.stations?.find((x) => x.id === key || (mid && x.machineId === mid));
  if (st) return { kind: STATION_SCAPE[st.kind], key, busy: n(st.wip, 3) };
  const m = mid ? state.machines.find((x) => x.id === mid) : undefined;
  if (!m) return { kind: "other", key, busy: 0 };
  const items = state.items;
  const busy =
    m.type === "launch_pad"
      ? n(items.filter((i) => i.state === "on_pad" || i.state === "passed").length, 2)
      : m.type === "ore_deposit"
        ? n(items.filter((i) => i.state === "ore").length, 3)
        : m.type === "inspector"
          ? n(items.filter((i) => i.state === "inspecting").length, 2)
          : m.state === "working"
            ? 1
            : 0;
  return { kind: MACHINE_SCAPE[m.type] ?? "other", key, busy };
}

const MOVING: Item["state"][] = ["queued", "working", "inspecting", "rejected"];

// What the adaptive score hears from one state. Bottleneck comes from the server's engine; when it
// has none yet, the busiest gauntlet station stands in so a jam still sounds like a jam.
export function musicInput(state: FactoryState): MusicInput {
  const busiest = (state.stations ?? []).reduce((m, st) => Math.max(m, st.wip), 0);
  return {
    moving: state.items.filter((i) => MOVING.includes(i.state)).length,
    working: state.machines.filter((m) => m.state === "working").length,
    stationsBusy: state.stations?.filter((st) => st.wip > 0).length ?? 0,
    rejected: state.items.filter((i) => i.state === "rejected").length,
    bottleneck: state.bottleneck ?? (busiest ? { stage: "inspect", wip: busiest, ageMs: 0 } : null),
  };
}

// Sounds that mean a station caught something bad. They tense the score up.
const CAUGHT: Sfx[] = ["ci_buzz", "verify_caught", "orbit_alarm", "permit_revoke", "stamp_fail"];

// Sounds for one tick's worth of changes, in the order they should play.
export function diffSounds(prev: FactoryState, next: FactoryState): Sfx[] {
  const out: Sfx[] = [];
  // stations first: their verdict is the sound; item-level fallbacks below only fill gaps
  const heard = new Set<Station["kind"]>();
  for (const v of stationVerdicts(prev, next)) {
    out.push(STATION_SFX[v.kind][v.ok ? 0 : 1]);
    heard.add(v.kind);
  }
  const before = new Map(prev.items.map((i) => [i.id, i]));
  for (const item of next.items) {
    const was = before.get(item.id);
    if (!was) {
      out.push(item.state === "launched" ? "launch" : "ore");
      continue;
    }
    // inspection gates that just resolved, unless that station already spoke this tick
    for (const st of item.inspection?.stages ?? []) {
      const old = was.inspection?.stages.find((s) => s.gate === st.gate);
      const kind = GATE_KIND[st.gate];
      if (st.state !== "pending" && old?.state !== st.state && !heard.has(kind)) {
        out.push(STATION_SFX[kind][st.state === "passed" ? 0 : 1]);
        heard.add(kind);
      }
    }
    // a new scar names the station that caught it
    const scar = (item.scars?.length ?? 0) > (was.scars?.length ?? 0) ? item.scars!.at(-1) : undefined;
    if (scar && !heard.has(scar.station)) {
      out.push(STATION_SFX[scar.station][1]);
      heard.add(scar.station);
    }
    if (was.state === item.state) continue;
    switch (item.state) {
      case "working":
        if (was.state !== "rejected") out.push("machine_start");
        break;
      case "rejected":
        if (!heard.size) out.push("stamp_fail");
        out.push("rework"); // clunk onto the rework belt
        break;
      case "passed":
        if (!heard.size) out.push("stamp_pass");
        break;
      case "on_pad":
        out.push("dock");
        break;
      case "launched":
        out.push("launch");
        break;
    }
  }
  if (next.machines.some((m) => !prev.machines.some((p) => p.id === m.id))) out.push("place");
  // research: packs spent, then the new station drops onto the line
  if ((next.research?.done.length ?? 0) > (prev.research?.done.length ?? 0)) out.push("research");
  if (prev.stations?.length && next.stations?.some((st) => !prev.stations!.some((x) => x.id === st.id))) out.push("station_drop");
  const tip = next.research?.suggest?.tech;
  if (tip && tip !== prev.research?.suggest?.tech) out.push("suggest");
  // launch permits and autonomy levels
  const had = new Map(prev.autonomy?.districts.map((d) => [d.district, d.permit]));
  for (const d of next.autonomy?.districts ?? []) {
    const was = had.get(d.district) ?? false;
    if (d.permit && !was) out.push("permit_grant");
    else if (!d.permit && was) out.push("permit_revoke");
  }
  const LEVELS = ["advisor", "floor", "build", "lights_out"];
  if (prev.autonomy && next.autonomy && LEVELS.indexOf(next.autonomy.level) > LEVELS.indexOf(prev.autonomy.level)) out.push("level_up");
  const f0 = prev.foreman;
  const f1 = next.foreman;
  if (f1?.thinking && !f0?.thinking) out.push("think");
  else if (f1 && (f1.targetId !== f0?.targetId || f1.tool !== f0?.tool)) out.push("chirp");
  return out;
}

export function useFactorySound(state: FactoryState | null, focus?: string | null, calm = false) {
  const prev = useRef<FactoryState | null>(null);
  const accentMem = useRef(freshAccentMemory());
  const calmMem = useRef(freshCalm());
  const focused = state ? focusFor(focus, state) : null;
  useEffect(() => {
    sound.setFocus(focused);
    // the camera just flew in on something: that machine's own tap sound (soundboard picks)
    const tap = focused && tapFor(focused.kind, focused.key, focused.busy);
    if (tap) sound.play(tap);
  }, [focus]);
  useEffect(() => sound.updateFocus(focused), [focused?.busy, focused?.kind, focused?.mood]);
  useEffect(() => {
    const p = prev.current;
    prev.current = state;
    if (!state) return;
    const mi = musicInput(state);
    sound.setAmbience(mi.moving / 6, mi.working);
    sound.setStationsBusy(mi.stationsBusy);
    sound.setMusic(mi);
    // first snapshot (or a new repo/scenario) sets the scene silently
    if (!p || p.repo !== state.repo) return;
    // so the art's station effects (stamp flash, ram slam, gate swing) can land on the same beat
    for (const v of stationVerdicts(p, state)) window.dispatchEvent(new CustomEvent<StationVerdict>(STATION_EVENT, { detail: v }));
    const sfx = calmSounds(diffSounds(p, state), performance.now(), calmMem.current);
    // docs/ATTENTION.md: suggestions never make a sound
    sfx.filter((s) => !(calm && s === "suggest")).forEach((s, i) => s !== "launch" && sound.play(s, i * 0.08, !!focused && SFX_FROM[s] === focused.kind));
    if (sfx.some((s) => CAUGHT.includes(s))) sound.musicAlert();
    // steam and iron over the hum, rate-limited so a busy floor stays a texture, not a drum roll
    const acc = limitAccents(accentsFor(p, state), performance.now(), accentMem.current);
    accentMem.current = acc.mem;
    acc.play.forEach((a, i) => sound.play(a, a === "launch_iron" ? LAUNCH_IRON_DELAY_S : 0.04 + i * 0.12));
    // each PR that just launched gets the full celebration (event for the art + launch, fanfare, streak)
    const was = new Map(p.items.map((i) => [i.id, i.state]));
    state.items.filter((i) => i.state === "launched" && was.get(i.id) !== "launched").forEach((i, n) => celebrateShip(i, n * 0.4));
  }, [state]);
}

export function useSoundSettings() {
  return useSyncExternalStore(
    (f) => sound.subscribe(f),
    () => sound.settings,
  );
}
