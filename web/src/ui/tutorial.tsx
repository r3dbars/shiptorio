// Progressive disclosure for the first run (docs/VISION.md): the HUD starts nearly empty and each piece
// shows up the moment the coach card introduces the idea behind it, one concept at a time. Lessons fire off the
// factory state, so the player learns by doing: ore arrives, then you meet ore.
//
// HUD pieces are keyed by concept, not layout, so the HUD can be redesigned without touching this.

import { useEffect, useMemo, useState } from "react";
import type { FactoryState } from "@shiptorio/shared";
import { COACH, LESSON_COPY } from "../copy";

export type HudPart = "spark" | "score" | "launch" | "build" | "power" | "line" | "autonomy" | "science" | "log" | "scenarios" | "labels" | "checkin";

const ALL: HudPart[] = ["spark", "score", "launch", "build", "power", "line", "autonomy", "science", "log", "scenarios", "labels", "checkin"];

export interface Lesson {
  id: string;
  title: string; // the concept, one or two words
  text: string; // the coach's one-liner. {repo} is filled in
  when: (s: FactoryState) => boolean;
  unlocks: HudPart[];
}

// In the order a new player meets them. Each waits for the one before it.
export const LESSONS: Lesson[] = [
  {
    id: "island",
    ...LESSON_COPY.island,
    when: (s) => s.districts.length > 0,
    unlocks: [],
  },
  {
    id: "machines",
    ...LESSON_COPY.machines,
    when: (s) => s.machines.some((m) => m.type === "assembler"),
    unlocks: [],
  },
  {
    id: "power",
    ...LESSON_COPY.power,
    when: (s) => s.move?.stage === "resources" || s.power.some((p) => p.kind === "solar"),
    unlocks: ["power"],
  },
  {
    id: "ore",
    ...LESSON_COPY.ore,
    when: (s) => s.items.length > 0,
    unlocks: ["line"],
  },
  {
    id: "inspect",
    ...LESSON_COPY.inspect,
    when: (s) => s.items.some((i) => i.prNumber !== undefined),
    unlocks: [],
  },
  {
    id: "pad",
    ...LESSON_COPY.pad,
    when: (s) => s.items.some((i) => i.state === "on_pad"),
    unlocks: ["launch"],
  },
  {
    id: "rocket",
    ...LESSON_COPY.rocket,
    when: (s) => (s.metrics?.rockets ?? 0) > 0,
    unlocks: ["score", "science"],
  },
  {
    id: "bottleneck",
    ...LESSON_COPY.bottleneck,
    when: (s) => (s.metrics?.rockets ?? 0) > 0,
    unlocks: ["build", "log", "labels"],
  },
  {
    id: "autonomy",
    ...LESSON_COPY.autonomy,
    when: (s) => (s.autonomy?.next?.have ?? 0) >= 3 || s.autonomy?.level !== "advisor",
    unlocks: ["autonomy", "scenarios"],
  },
  {
    id: "checkin",
    ...LESSON_COPY.checkin,
    when: (s) => (s.deck?.length ?? 0) > 1 || (s.metrics?.rockets ?? 0) >= 2,
    unlocks: ["checkin"],
  },
];

// Use the same pick keys as the map, so touch players can see the named stations without hover.
export function lessonFocus(state: FactoryState | null, lessonId?: string): string[] {
  if (!state || !lessonId) return [];
  if (lessonId === "island") return state.districts.map(d => `d:${d.name}`);
  const machineKey = (id: string) => state.stations?.find(st => st.machineId === id)?.id ?? `m:${id}`;
  if (lessonId === "inspect") return (state.stations ?? []).filter(st => ["ci", "verify", "review"].includes(st.kind)).map(st => st.id);
  const types = lessonId === "machines" ? ["splitter", "assembler", "inspector", "launch_pad"] : lessonId === "power" ? ["solar", "battery", "steam"] : lessonId === "ore" ? ["ore_deposit"] : lessonId === "pad" || lessonId === "rocket" ? ["launch_pad"] : [];
  return state.machines.filter(m => types.includes(m.type)).map(m => machineKey(m.id));
}

const DWELL_MS = 6000; // a lesson stays up at least this long before the next one can replace it

// on = this run teaches. Off, everything is visible and no lessons fire.
export function useTutorial(state: FactoryState | null, on: boolean) {
  const [done, setDone] = useState<string[]>(() => (on ? [] : LESSONS.map((l) => l.id)));
  const [open, setOpen] = useState<string | null>(null);
  const [settled, setSettled] = useState(true); // the open lesson has been up long enough

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setSettled(true), DWELL_MS);
    return () => clearTimeout(t);
  }, [open]);

  // The next lesson fires once its moment arrives, and only after the one before it.
  const next = LESSONS.find((l) => !done.includes(l.id));
  useEffect(() => {
    if (!on || !state || !next || !settled || !next.when(state)) return;
    setOpen(next.id);
    setSettled(false);
    setDone((d) => [...d, next.id]);
  }, [on, state, next, settled]);

  const shown = useMemo(() => {
    if (!on || !next) return new Set<HudPart>(ALL);
    const out = new Set<HudPart>(["spark"]);
    for (const l of LESSONS) if (done.includes(l.id)) l.unlocks.forEach((p) => out.add(p));
    return out;
  }, [on, next, done]);

  const lesson = LESSONS.find((l) => l.id === open) ?? null;
  return {
    on,
    learned: done, // lesson ids met so far; the field guide shows these
    show: (p: HudPart) => shown.has(p),
    lesson,
    step: lesson ? LESSONS.indexOf(lesson) + 1 : done.length,
    total: LESSONS.length,
    dismiss: () => {
      setOpen(null);
      setSettled(true);
    },
    skip: () => {
      setDone(LESSONS.map((l) => l.id));
      setOpen(null);
    },
  };
}

export function Coach({ lesson, step, total, repo, onDismiss, onSkip }: { lesson: Lesson; step: number; total: number; repo: string; onDismiss: () => void; onSkip: () => void }) {
  return (
    <div className="coach" role="status" aria-live="polite">
      <div className="coach-head">
        <span className="who">{COACH.kicker(lesson.title)}</span>
        <span className="coach-step">
          {step}/{total}
        </span>
      </div>
      <p>{lesson.text.replace("{repo}", repo)}</p>
      <div className="coach-btns">
        <button type="button" className="btn rec" onClick={onDismiss}>
          {COACH.gotIt}
        </button>
        <button type="button" className="linkish coach-skip" onClick={onSkip}>
          {COACH.skip}
        </button>
      </div>
    </div>
  );
}
