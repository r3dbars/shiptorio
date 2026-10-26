// Turns FactoryState changes into sounds. It only looks at state, so it works the same
// for the sim and the live server.

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { FactoryState, Inspection, Item } from "@shiptorio/shared";
import { sound, type Sfx } from "./engine";

const GATE_SFX: Record<Inspection["stages"][number]["gate"], [pass: Sfx, fail: Sfx]> = {
  ci: ["stamp_pass", "stamp_fail"],
  verify: ["verify_pop", "verify_ram"],
  ai: ["ai_pass", "ai_fail"],
  human: ["dock", "stamp_fail"],
};
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

export function useFactorySound(state: FactoryState | null) {
  const prev = useRef<FactoryState | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = state;
    if (!state) return;
    const moving = state.items.filter((i) => MOVING.includes(i.state)).length;
    sound.setAmbience(moving / 6, state.machines.filter((m) => m.state === "working").length);
    // first snapshot (or a new repo/scenario) sets the scene silently
    if (!p || p.repo !== state.repo) return;
    diffSounds(p, state).forEach((s, i) => sound.play(s, i * 0.08));
  }, [state]);
}

export function useSoundSettings() {
  return useSyncExternalStore(
    (f) => sound.subscribe(f),
    () => sound.settings,
  );
}
