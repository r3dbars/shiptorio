// Build as you go, slice 4 (web/src/buildout/CONTRACT.md): the payoff. When a piece has burst online (burst.ts), a
// brass ONLINE plate stamps down onto it with a thunk, and one short line under it says what it does. It listens for
// the shiptorio:build event: the plate lands one burst after "burst" (5.5 s into the build moment, BUILD_MS), or at
// "done" if that comes first, and lifts away on its own. Repeats of a kind (first: false) get a smaller plate, no line.
// The camera is parked on the piece while it builds (director.ts), so the plate sits over the middle of the view,
// unless the scene hands it a screen point with `anchor`. Mounted next to the coach card, behind ?buildout=1.

import { useEffect, useRef, useState } from "react";
import "./buildstamp.css";

import { BUILD_MS, onBuild, type BuildDetail } from "../buildout/journey";
import { buildoutOn } from "../flags";

/** what each build is called on its plate, and the one line under it */
export const PLATES: Record<string, { name: string; line?: string }> = {
  tunnel: { name: "GitHub tunnel", line: "Work comes up from your repo." },
  boiler: { name: "Boiler", line: "Your AI powers the factory." },
  builder: { name: "Builder", line: "Writes the code for each job." },
  issue: { name: "Ore cart", line: "Your first job is on its way." },
  planner: { name: "Planner", line: "Turns each job into a plan." },
  checks: { name: "Checks", line: "Every change gets tested here." },
  launch: { name: "Launch pad", line: "Ships whatever passes." },
};
// these steps don't build anything new (the cart just rides into the builder): no plate
const NO_PLATE = new Set(["build", "look"]);

export function plateFor(id: string): { name: string; line?: string } {
  return PLATES[id] ?? { name: id.replace(/[-_:]+/g, " ").replace(/^\w/, (c) => c.toUpperCase()) };
}

// "burst" fires as the burst starts (4.5 s); the plate lands as it ends and the payoff starts (5.5 s)
export const STAMP_DELAY_MS = BUILD_MS.burst - BUILD_MS.construct;
export const STAMP_HOLD_MS = 2600; // on screen this long, then it lifts away
const LIFT_MS = 320;

interface Shown {
  id: string;
  first: boolean;
  key: number;
  leaving: boolean;
}

export function BuildStamp({ anchor }: { anchor?: (id: string) => [number, number] | null }) {
  const [shown, setShown] = useState<Shown | null>(null);
  const timers = useRef<number[]>([]);
  const pending = useRef<Map<string, boolean>>(new Map()); // bursts waiting for their plate: id -> first
  const stamped = useRef<Set<string>>(new Set()); // plates already shown this build, so "done" doesn't stamp twice
  const seq = useRef(0);
  const on = buildoutOn();

  useEffect(() => {
    if (!on) return;
    const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    const stamp = (id: string, first: boolean) => {
      if (!pending.current.has(id)) return;
      pending.current.delete(id);
      stamped.current.add(id);
      const key = ++seq.current;
      setShown({ id, first, key, leaving: false });
      later(STAMP_HOLD_MS, () => setShown((s) => (s && s.key === key ? { ...s, leaving: true } : s)));
      later(STAMP_HOLD_MS + LIFT_MS, () => setShown((s) => (s && s.key === key ? null : s)));
    };
    const off = onBuild((d: BuildDetail) => {
      const id = String(d.id);
      if (NO_PLATE.has(id)) return;
      const first = d.first !== false;
      if (d.phase === "start") pending.current.delete(id), stamped.current.delete(id);
      else if (d.phase === "burst") {
        pending.current.set(id, first);
        later(STAMP_DELAY_MS, () => stamp(id, first));
      } else if (d.phase === "done") {
        // the payoff always plays, even when the build was hurried past its burst
        if (!pending.current.has(id) && !stamped.current.has(id)) pending.current.set(id, first);
        stamp(id, pending.current.get(id) ?? first);
      }
    });
    return () => {
      off();
      timers.current.forEach((t) => clearTimeout(t));
      timers.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  if (!on || !shown) return null;
  const plate = plateFor(shown.id);
  const at = anchor?.(shown.id) ?? null;
  const big = shown.first;
  return (
    <div className={`bstamp-wrap${at ? " pinned" : ""}`} style={at ? { left: at[0], top: at[1] } : undefined} aria-live="polite">
      <div key={shown.key} className={`bstamp${big ? " big" : " small"}${shown.leaving ? " leaving" : ""}`} role="status" data-build-stamp={shown.id}>
        {big && (
          <span className="bstamp-dust" aria-hidden>
            {Array.from({ length: 8 }, (_, i) => (
              <i key={i} style={{ ["--dx" as string]: `${(i < 4 ? -1 : 1) * (26 + (i % 4) * 18)}px`, ["--dy" as string]: `${-4 - (i % 3) * 7}px`, animationDelay: `${(i % 4) * 30}ms` }} />
            ))}
          </span>
        )}
        <div className="bstamp-plate">
          <span className="bstamp-name">{plate.name}</span>
          <span className="bstamp-word">ONLINE</span>
          <span className="bstamp-glint" aria-hidden />
        </div>
        {big && plate.line && <div className="bstamp-line">{plate.line}</div>}
        <span className="bstamp-sr">{`${plate.name} is online.${big && plate.line ? " " + plate.line : ""}`}</span>
      </div>
    </div>
  );
}
