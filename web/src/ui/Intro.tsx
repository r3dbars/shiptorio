// "Welcome to Shiptorio": the intro right after GitHub sign-in (docs/VISION.md, Goal log 2026-10-26).
// One live factory tells the whole idea in eight beats. You're the approve button today; verify, then
// automate, and the factory runs more of itself every week. Two beats are taught by doing: you swipe a
// verified PR, then you let a whole kind of work ship on its own.

import { useEffect, useRef, useState } from "react";
import { startScene, type SceneParams } from "./introScene";

interface Beat {
  kick: string;
  title: string; // the phrase in *stars* is the amber one
  body: string;
  fx: SceneParams;
  card?: { title: string; stamps: string[]; btn: string };
  after?: string; // replaces body once the card is done
  go?: SceneParams; // what the card does to the scene
}

const Z: SceneParams = { spot: 0, score: 0, markers: 0, mines: 0, party: 0, auto: 0, rise: 0, ambient: 0 };
const LINE: SceneParams = { belt: 1, checks: 3, gate: "closed" };

export const BEATS: Beat[] = [
  {
    kick: "Welcome",
    title: "Welcome to *Shiptorio*.",
    body: "Your GitHub repo, as a factory you can see and play. Every building is a folder. Every crate is real work.",
    fx: { ...Z, rise: 1, belt: 0, checks: 0, gate: "none", spawn: 0 },
  },
  {
    kick: "AI builds now",
    title: "Your agents are *fast*.",
    body: "Claude and Codex write fixes and features all day. Each crate on the belt is a change to your code, built by AI.",
    fx: { ...Z, ...LINE, checks: 1, spawn: 420 },
  },
  {
    kick: "Today",
    title: "And you're the *approve button*.",
    body: "Right now most of your job is waiting to approve things. Build it? Does it work? Ship it? Everything stops at your gate, and the pile keeps growing.",
    fx: { ...Z, ...LINE, checks: 1, spawn: 300, spot: 1 },
  },
  {
    kick: "Step 1 · Verify",
    title: "Checks make a yes *safe*.",
    body: "Every crate carries its proof: CI passed, the fix was verified, a second AI reviewed it. You're not guessing anymore. Swipe this one right.",
    after: "One swipe, because three checks already did the hard part. The more you verify, the less you have to look.",
    fx: { ...Z, ...LINE, spawn: 300 },
    card: { title: 'Ship PR #38 "Fix cart rounding"?', stamps: ["CI ✓", "Verified ✓", "AI review ✓"], btn: "Ship it →" },
    go: { gate: "open" },
  },
  {
    kick: "Step 2 · Automate",
    title: "Then hand it *off*.",
    body: "Here's the real goal. Every clean ship builds trust, and Shiptorio keeps asking: let this kind ship on its own? Say yes.",
    after: "Now the safe stuff ships itself and only the risky crates wait for you. Keep doing this and your factory gets more automated every week, every step still verified.",
    fx: { ...Z, ...LINE, spawn: 260 },
    card: { title: "5 docs PRs shipped clean, zero rework. Let docs ship on their own?", stamps: ["+1 AUTOMATION"], btn: "Allow →" },
    go: { auto: 1 },
  },
  {
    kick: "The game",
    title: "The bottleneck *moves*.",
    body: "Clear one and the next shows up. Too little feedback coming in. A CI gate that's too slow. A pile at review. Shiptorio reads your repo, finds the next one, and suggests the fix: usually one more check, or one more thing to automate.",
    fx: { ...Z, ...LINE, spawn: 380, markers: 1, auto: 1 },
  },
  {
    kick: "Connect more",
    title: "Every source is a *new mine*.",
    body: "GitHub brings issues. Sentry adds errors the moment they happen. PostHog shows what users really do. Later: support, payments, marketing. More sources, more to automate, a richer factory.",
    fx: { ...Z, ...LINE, spawn: 340, mines: 1, auto: 1 },
  },
  {
    kick: "Where you're headed",
    title: "It runs *itself*.",
    body: "Verified, automated, growing. Bugs fixed before users notice. Features shipped while you sleep. New customers showing up. You set the direction and check in when it asks.",
    fx: { ...Z, ...LINE, spawn: 150, mines: 1, party: 1, score: 1, auto: 1 },
  },
];

function Title({ text }: { text: string }) {
  // word by word, the starred phrase in amber
  const parts = text.split(/(\*[^*]+\*[.,]?)/).flatMap((p) => (p.startsWith("*") ? [p] : p.split(/\s+/))).filter(Boolean);
  return (
    <h2>
      {parts.map((w, i) => {
        const em = w.startsWith("*");
        const [, inner = w, tail = ""] = em ? (w.match(/^\*([^*]+)\*(.*)$/) ?? []) : [];
        return (
          <span key={i} className="w" style={{ animationDelay: `${i * 70}ms` }}>
            {em ? (
              <>
                <em>{inner}</em>
                {tail}
              </>
            ) : (
              w
            )}{" "}
          </span>
        );
      })}
    </h2>
  );
}

function Card({ beat, onGo }: { beat: Beat; onGo: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  const drag = useRef({ x: 0, dx: 0, down: false });
  const [gone, setGone] = useState(false);
  const go = () => {
    if (gone) return;
    setGone(true);
    setTimeout(onGo, 300);
  };
  const c = beat.card!;
  return (
    <div
      ref={el}
      className={`intro-card${gone ? " gone" : ""}`}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        drag.current = { x: e.clientX, dx: 0, down: true };
        el.current?.setPointerCapture(e.pointerId);
        if (el.current) el.current.style.transition = "none";
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d.down || !el.current) return;
        d.dx = e.clientX - d.x;
        el.current.style.transform = `translateX(${Math.max(d.dx, -30)}px) rotate(${d.dx / 22}deg)`;
      }}
      onPointerUp={() => {
        const d = drag.current;
        if (!d.down || !el.current) return;
        d.down = false;
        el.current.style.transition = "";
        el.current.style.transform = "";
        if (d.dx > 80) go();
      }}
    >
      <b>{c.title}</b>
      <div className="stamps">
        {c.stamps.map((s) => (
          <span key={s} className="stamp">
            {s}
          </span>
        ))}
      </div>
      <div className="row">
        <span className="hint">drag right, or tap</span>
        <button type="button" className="ship" onClick={go}>
          {c.btn}
        </button>
      </div>
    </div>
  );
}

export function Intro({ login, onDone }: { login?: string | null; onDone: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const scene = useRef<ReturnType<typeof startScene> | null>(null);
  const [at, setAt] = useState(0);
  const [done, setDone] = useState(false); // this beat's card has been played
  const beat = BEATS[at];

  useEffect(() => {
    scene.current = startScene(cv.current!);
    return () => scene.current?.stop();
  }, []);
  useEffect(() => {
    scene.current?.set(BEATS[at].fx);
  }, [at]);

  const next = () => {
    if (at === BEATS.length - 1) return onDone();
    setDone(false);
    setAt(at + 1);
  };

  return (
    <div className="intro">
      <canvas ref={cv} className="intro-fx" aria-hidden="true" />
      <div className="intro-top">
        <div className="intro-segs" aria-label={`Step ${at + 1} of ${BEATS.length}`}>
          {BEATS.map((_, i) => (
            <i key={i} className={i < at ? "done" : i === at ? "now" : undefined} />
          ))}
        </div>
        <button type="button" className="linkish" onClick={onDone}>
          Skip
        </button>
      </div>
      <div className="intro-words" key={at}>
        <div className="intro-kick">{at === 0 && login ? `Welcome, @${login}` : beat.kick}</div>
        <Title text={beat.title} />
        <p className="intro-body" key={String(done)}>
          {beat.card && done ? beat.after : beat.body}
        </p>
        {beat.card && !done && (
          <Card
            beat={beat}
            onGo={() => {
              setDone(true);
              if (beat.go) scene.current?.set(beat.go);
            }}
          />
        )}
        {(!beat.card || done) && (
          <button type="button" className="btn rec intro-next" onClick={next} autoFocus>
            {at === BEATS.length - 1 ? "Pick your repo" : "Next"}
          </button>
        )}
      </div>
    </div>
  );
}
