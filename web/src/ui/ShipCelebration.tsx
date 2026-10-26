import { useEffect, useRef, useState } from "react";
import type { AutonomyLevel, FactoryState } from "@shiptorio/shared";
import "./ship.css";

import { SHIP_EVENT, SHIP_TIMING, type ShipEvent } from "../sound/ship";

const LEVEL: Record<AutonomyLevel, string> = { advisor: "ADVISOR", floor: "FLOOR", build: "BUILD", lights_out: "LIGHTS OUT" };
const CARD_AT_MS = SHIP_TIMING.doneMs + 200; // let the rocket clear the frame before the card arrives
const HOLD_MS = 6500; // the card stays this long after the check lands

// The check, drawn on a 9x7 grid in stroke order (short leg down, then the long leg up) so it "writes" itself in.
const CHECK: [number, number][] = [
  [0, 3], [1, 4], [2, 5], [3, 6], [4, 5], [5, 4], [6, 3], [7, 2], [8, 1], [8, 0],
  [0, 4], [1, 5], [2, 6], [3, 5], [4, 4], [5, 3], [6, 2], [7, 1], [7, 0],
];
const CONFETTI = ["#5bd18b", "#f2a93b", "#6fb2ff", "#eef1fa", "#5bd18b", "#ff5e52"];

type Phase = "countdown" | "shipped";
interface Show {
  ev: ShipEvent;
  phase: Phase;
  delta: number;
}

function useCount(target: number, run: boolean, ms = 900) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!run) return setN(0);
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setN(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, ms]);
  return n;
}

export function ShipCelebration({ state }: { state: FactoryState | null }) {
  const [show, setShow] = useState<Show | null>(null);
  const score = state?.metrics?.shipScore ?? 0;
  const scoreRef = useRef(score);
  const baseRef = useRef<number | null>(null); // shipScore at the last celebration (or first sight)
  scoreRef.current = score;
  if (baseRef.current === null && state) baseRef.current = score;
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const clear = () => {
      timers.current.forEach((t) => clearTimeout(t));
      timers.current = [];
    };
    const onShip = (e: Event) => {
      const ev = (e as CustomEvent<ShipEvent>).detail;
      if (!ev) return;
      clear();
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      setShow({ ev, phase: "countdown", delta: 0 });
      if (!reduced) {
        timers.current.push(
          window.setTimeout(() => {
            document.body.classList.add("ship-shake");
            timers.current.push(window.setTimeout(() => document.body.classList.remove("ship-shake"), 900));
          }, SHIP_TIMING.ignitionMs),
        );
      }
      timers.current.push(
        window.setTimeout(() => {
          // the server bumps shipScore around the launch; read it when the check lands
          const delta = Math.max(0, scoreRef.current - (baseRef.current ?? scoreRef.current));
          baseRef.current = scoreRef.current;
          setShow({ ev, phase: "shipped", delta });
        }, CARD_AT_MS),
      );
      timers.current.push(window.setTimeout(() => setShow(null), CARD_AT_MS + HOLD_MS));
    };
    window.addEventListener(SHIP_EVENT, onShip);
    return () => {
      window.removeEventListener(SHIP_EVENT, onShip);
      clear();
      document.body.classList.remove("ship-shake");
    };
  }, []);

  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setShow(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show]);

  const shipped = show?.phase === "shipped";
  const pts = useCount(show?.delta ?? 0, shipped);
  if (!show) return null;
  const { ev } = show;
  const next = state?.autonomy?.next;
  const unlocked = !!next && next.have >= next.need;

  return (
    <div className={`ship-cel ${show.phase}`} aria-live="polite">
      {shipped && (
        <div className="ship-card card" role="status" onClick={() => setShow(null)} title="Click to close">
          <div className="ship-burst" aria-hidden>
            <span className="ship-ring" />
            {Array.from({ length: 22 }, (_, i) => {
              const a = (i / 22) * Math.PI * 2 + (i % 2) * 0.2;
              const r = 90 + (i % 4) * 26;
              return (
                <i
                  key={i}
                  style={{
                    ["--dx" as string]: `${Math.cos(a) * r}px`,
                    ["--dy" as string]: `${Math.sin(a) * r - 20}px`,
                    ["--c" as string]: CONFETTI[i % CONFETTI.length],
                    animationDelay: `${(i % 5) * 25}ms`,
                  }}
                />
              );
            })}
          </div>
          <svg className="ship-check" viewBox="-1 -1 11 9" aria-hidden shapeRendering="crispEdges">
            {CHECK.map(([x, y], i) => (
              <rect key={i} x={x} y={y} width={1} height={1} style={{ animationDelay: `${(i % 10) * 28 + (i >= 10 ? 60 : 0)}ms` }} />
            ))}
          </svg>
          <div className="ship-title">SHIPPED!</div>
          <div className="ship-what">
            {ev.prNumber != null && <b>#{ev.prNumber}</b>} {ev.title}
          </div>
          <div className="ship-badges">
            {ev.firstTry && <span className="b first">FIRST TRY</span>}
            {ev.streak >= 2 && <span className="b streak">STREAK ×{ev.streak}</span>}
          </div>
          {show.delta > 0 && <div className="ship-score">+{pts} SHIP SCORE</div>}
          {next && (
            <div className={`ship-auto ${unlocked ? "unlocked" : ""}`}>
              <span>{unlocked ? `${LEVEL[next.level]} UNLOCKED` : `→ ${LEVEL[next.level]} ${next.have}/${next.need}`}</span>
              <span className="segs">
                {Array.from({ length: next.need }, (_, i) => (
                  <i key={i} className={i < next.have ? (i === next.have - 1 ? "on new" : "on") : ""} />
                ))}
              </span>
            </div>
          )}
          <span className="sr">
            Shipped {ev.prNumber != null ? `PR ${ev.prNumber}, ` : ""}
            {ev.title}.{ev.firstTry ? " First try." : ""}
            {ev.streak >= 2 ? ` Streak of ${ev.streak}.` : ""}
          </span>
        </div>
      )}
    </div>
  );
}
