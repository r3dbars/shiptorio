// Turns FactoryState changes into sounds. It only looks at state, so it works the same
// for the sim and the live server.

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { FactoryState, Inspection, Item, Machine, Station } from "@shiptorio/shared";
import { sound, type Focus, type Sfx } from "./engine";
import type { ScapeKind } from "./scapes";

const GATE_SFX: Record<Inspection["stages"][number]["gate"], [pass: Sfx, fail: Sfx]> = {
  ci: ["stamp_pass", "stamp_fail"],
  verify: ["verify_pop", "verify_ram"],
  ai: ["ai_pass", "ai_fail"],
  human: ["dock", "stamp_fail"],
};
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
  rework: "rework",
  dock: "pad",
  launch: "pad",
};

const STATION_SCAPE: Record<Station["kind"], ScapeKind> = { ci: "ci", verify: "verify", review: "review", merge: "merge", orbit: "orbit", custom: "other" };
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

// Sounds for one tick's worth of changes, in the order they should play.
export function diffSounds(prev: FactoryState, next: FactoryState): Sfx[] {
  const out: Sfx[] = [];
  const before = new Map(prev.items.map((i) => [i.id, i]));
  for (const item of next.items) {
    const was = before.get(item.id);
    if (!was) {
      out.push(item.state === "launched" ? "launch" : "ore");
      continue;
    }
    // inspection stations, one sound per gate that just resolved
    let stamped = false;
    for (const st of item.inspection?.stages ?? []) {
      const old = was.inspection?.stages.find((s) => s.gate === st.gate);
      if (st.state !== "pending" && old?.state !== st.state) {
        out.push(GATE_SFX[st.gate][st.state === "passed" ? 0 : 1]);
        stamped = true;
      }
    }
    if (was.state === item.state) continue;
    switch (item.state) {
      case "working":
        out.push(was.state === "rejected" ? "rework" : "machine_start");
        break;
      case "queued":
        if (was.state === "rejected") out.push("rework");
        break;
      case "rejected":
        if (!stamped) out.push("stamp_fail");
        break;
      case "passed":
        if (!stamped) out.push("stamp_pass");
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
  const f0 = prev.foreman;
  const f1 = next.foreman;
  if (f1?.thinking && !f0?.thinking) out.push("think");
  else if (f1 && (f1.targetId !== f0?.targetId || f1.tool !== f0?.tool)) out.push("chirp");
  return out;
}

export function useFactorySound(state: FactoryState | null, focus?: string | null) {
  const prev = useRef<FactoryState | null>(null);
  const focused = state ? focusFor(focus, state) : null;
  useEffect(() => sound.setFocus(focused), [focus]);
  useEffect(() => sound.updateFocus(focused), [focused?.busy, focused?.kind]);
  useEffect(() => {
    const p = prev.current;
    prev.current = state;
    if (!state) return;
    const moving = state.items.filter((i) => MOVING.includes(i.state)).length;
    sound.setAmbience(moving / 6, state.machines.filter((m) => m.state === "working").length);
    // first snapshot (or a new repo/scenario) sets the scene silently
    if (!p || p.repo !== state.repo) return;
    diffSounds(p, state).forEach((s, i) => sound.play(s, i * 0.08, !!focused && SFX_FROM[s] === focused.kind));
  }, [state]);
}

export function useSoundSettings() {
  return useSyncExternalStore(
    (f) => sound.subscribe(f),
    () => sound.settings,
  );
}
