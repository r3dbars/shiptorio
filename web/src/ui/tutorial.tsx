// Progressive disclosure for the first run (docs/VISION.md): the HUD starts nearly empty and each piece
// shows up the moment the coach card introduces the idea behind it, one concept at a time. Lessons fire off the
// factory state, so the player learns by doing: ore arrives, then you meet ore.
//
// HUD pieces are keyed by concept, not layout, so the HUD can be redesigned without touching this.

import { useEffect, useMemo, useState } from "react";
import type { FactoryState } from "@shiptorio/shared";

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
    title: "Your factory",
    text: "This island is {repo}. One factory, one codebase. Each building is a folder, and it lights up when work lands there.",
    when: (s) => s.districts.length > 0,
    unlocks: [],
  },
  {
    id: "machines",
    title: "Machines",
    text: "Machines do the work. The splitter sorts what comes in, the assembler builds the fix, the inspectors check it, the pad ships it.",
    when: (s) => s.machines.some((m) => m.type === "assembler"),
    unlocks: [],
  },
  {
    id: "power",
    title: "Power",
    text: "Assemblers run on power, and power is your own Claude or ChatGPT sign-in. More sign-ins, more machines.",
    when: (s) => s.move?.stage === "resources" || s.power.some((p) => p.kind === "solar"),
    unlocks: ["power"],
  },
  {
    id: "ore",
    title: "Ore",
    text: "That's ore: each open issue is one chunk. It rides the belt in, and the line list shows where every chunk is.",
    when: (s) => s.items.length > 0,
    unlocks: ["line"],
  },
  {
    id: "inspect",
    title: "Inspection",
    text: "Nothing ships unchecked. Every PR runs the gauntlet: CI, proof, AI review. A fail rides the red belt back with the reason, for another try.",
    when: (s) => s.items.some((i) => i.prNumber !== undefined),
    unlocks: [],
  },
  {
    id: "pad",
    title: "Launch pad",
    text: "It passed and it's on the pad. Launching means you merge the PR. That's always your call.",
    when: (s) => s.items.some((i) => i.state === "on_pad"),
    unlocks: ["launch"],
  },
  {
    id: "rocket",
    title: "Rocket",
    text: "Rocket! That was a real merged PR. The score counts what shipping did for people, not how busy the factory looks.",
    when: (s) => (s.metrics?.rockets ?? 0) > 0,
    unlocks: ["score", "science"],
  },
  {
    id: "bottleneck",
    title: "Bottleneck",
    text: "There's always a bottleneck: the one spot where work piles up. The Next Move card points at it. Clear it and the factory grows. Add builders with Build.",
    when: (s) => (s.metrics?.rockets ?? 0) > 0,
    unlocks: ["build", "log", "labels"],
  },
  {
    id: "autonomy",
    title: "Autonomy",
    text: "Every suggestion you approve as-is builds trust. Approve enough and the factory earns the right to do the small stuff on its own.",
    when: (s) => (s.autonomy?.next?.have ?? 0) >= 3 || s.autonomy?.level !== "advisor",
    unlocks: ["autonomy", "scenarios"],
  },
  {
    id: "checkin",
    title: "Check-in",
    text: "When a few things wait on you, check in: swipe through them in one go. Right does it, left is later, down is never.",
    when: (s) => (s.deck?.length ?? 0) > 1 || (s.metrics?.rockets ?? 0) >= 2,
    unlocks: ["checkin"],
  },
];

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
        <span className="who">New · {lesson.title}</span>
        <span className="coach-step">
          {step}/{total}
        </span>
      </div>
      <p>{lesson.text.replace("{repo}", repo)}</p>
      <div className="coach-btns">
        <button type="button" className="btn rec" onClick={onDismiss}>
          Got it
        </button>
        <button type="button" className="linkish coach-skip" onClick={onSkip}>
          skip the tour
        </button>
      </div>
    </div>
  );
}
