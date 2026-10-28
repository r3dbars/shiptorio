// The Needs you tray, behind the "attention" flag (docs/ATTENTION.md). One card shape for every kind:
// Approve (amber, parked on a yes), Steer (red, stuck) and Suggested (teal, an idea that never pings).
// Two actions only: Continue (swipe right) runs the suggested option; Later (swipe left) parks it for a day.
// After Later, an optional row says why, and that answer steers what the planner suggests next.
// Gameplay picks (docs/GAMEPLAY.md): Continue is a tab on the card's right edge, a launch is a
// big red button you hold down, and more cards waiting show as plates peeking out behind this one.

import { useEffect, useRef, useState } from "react";
import { openUnlockLink } from "./unlockLink";
import { attentionOf, ATTENTION_RANK, continueOption, type Attention, type Move, type WebToServer } from "@shiptorio/shared";
import { ATTENTION, NEXT_MOVE, STAGE_LABEL, THINKS, WORDS } from "../copy";
import { because } from "./because";
import { sound } from "../sound/engine";
import { HoldGesture, type HoldClock } from "./holdLaunch";
import { holdRenderYield } from "./holdRender";

const SWIPE_PX = 80;
const LATER_ASK_MS = 4000;
type Why = (typeof ATTENTION.why)[number]["why"];

export const isLaunch = (m: Move) => continueOption(m).actions.some((a) => a.tool === "request_merge");
export const plugsInAgent = (o: Move["options"][number]) => o.actions.some((a) => a.tool === "connect_source" && (a.args.kind === "claude" || a.args.kind === "codex"));

/** The card the tray shows: the first Steer, else the first Approve, else the first suggestion, in deck order. */
export function trayCard(deck: readonly Move[]): Move | null {
  let best: Move | null = null;
  for (const m of deck) if (!best || ATTENTION_RANK[attentionOf(m)] < ATTENTION_RANK[attentionOf(best)]) best = m;
  return best;
}

export function countKinds(deck: readonly Move[]): Record<Attention, number> {
  const n: Record<Attention, number> = { approve: 0, steer: 0, suggest: 0 };
  for (const m of deck) n[attentionOf(m)]++;
  return n;
}

interface Props {
  deck: Move[];
  send: (msg: WebToServer) => void;
  onPower?: () => void; // live local-agent setup opens Power, never a server connector action
  onCheckin?: () => void;
  quiet?: { kicker: string; title: string; cta: string; onGo: () => void } | null; // the "what's next" idea when nothing waits
  first?: string; // this card goes on top while it waits (coming back: the launch the comeback parked on)
}

export function AttentionTray({ deck, send, onPower, onCheckin, quiet, first }: Props) {
  const [open, setOpen] = useState(false);
  const [thinking, setThinking] = useState(false); // the one-line why, shown only when asked
  const [asking, setAsking] = useState<Move | null>(null); // a Later held for a moment so the player can say why
  const [gone, setGone] = useState<string | null>(null);
  const card = (first && first !== gone && deck.find((m) => m.id === first)) || trayCard(deck);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef<{ x: number; id: number } | null>(null);
  const [dx, setDx] = useState(0);

  useEffect(() => { setOpen(false); setThinking(false); }, [card?.id]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const settle = (move: Move, why: Why) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setAsking(null);
    send(why === "defer" ? { type: "defer_move", moveId: move.id } : { type: "dismiss_move", moveId: move.id, why });
  };
  const later = (move: Move) => {
    sound.play("card_later");
    if (asking) settle(asking, "defer");
    setGone(move.id);
    setAsking(move);
    timer.current = setTimeout(() => settle(move, "defer"), LATER_ASK_MS);
  };
  const go = (move: Move, held = false) => {
    if (!held) sound.play("card_go"); // a held launch already played its countdown and clamp release
    if (asking) settle(asking, "defer");
    const option = continueOption(move);
    if (onPower && plugsInAgent(option)) return onPower();
    setGone(move.id);
    openUnlockLink(move, option);
    send({ type: "choose_move", moveId: move.id, optionId: option.id });
  };

  const shown = card && card.id !== gone ? card : null;
  const rest = countKinds(deck.filter((m) => m !== shown && m.id !== gone && m.id !== asking?.id));
  const restTotal = rest.approve + rest.steer + rest.suggest;

  let body = null;
  if (shown) {
    const kind = attentionOf(shown);
    const stage = shown.stage && STAGE_LABEL[shown.stage];
    const why = because(shown);
    const others = shown.options.filter((o) => o.id !== continueOption(shown).id && o.actions.length);
    body = (
      <section
        className={`acard ${kind}${open ? " open" : ""} tabbed${restTotal > 0 ? ` peek peek${Math.min(restTotal, 2)}` : ""}`}
        aria-label={`${ATTENTION.kind[kind]}: ${shown.title}`}
        aria-live="polite"
        style={dx ? { transform: `translateX(${dx}px) rotate(${dx / 40}deg)` } : undefined}
        onPointerDown={(e) => {
          if ((e.target as Element).closest("button, a")) return;
          drag.current = { x: e.clientX, id: e.pointerId };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => { if (drag.current) setDx(e.clientX - drag.current.x); }}
        onPointerUp={(e) => {
          if (!drag.current) return;
          const d = e.clientX - drag.current.x;
          drag.current = null;
          setDx(0);
          // A launch is never a swipe: the big red button has to be held down.
          if (d > SWIPE_PX) { if (!isLaunch(shown)) go(shown); }
          else if (d < -SWIPE_PX) later(shown);
          // One queue: tapping the card opens the deck when more is waiting, else its details.
          else if (Math.abs(d) < 6) { if (onCheckin && deck.length > 1) onCheckin(); else setOpen((v) => !v); }
        }}
        onPointerCancel={() => { drag.current = null; setDx(0); }}
        title={ATTENTION.swipeHint}
      >
        <div className="abody">
        <div className="atop">
          <b>{ATTENTION.kind[kind]}</b>
          {stage && <span>{stage}</span>}
        </div>
        <span className="att">{shown.title}</span>
        <span className="aw">{shown.why}</span>
        {thinking && why && <p className="awhy-line"><b>{THINKS.why}</b> {why}</p>}
        {open && (
          <div className="amore">
            {!!shown.plan?.length && (
              <details className="nm-plan" open>
                <summary>{NEXT_MOVE.plan}</summary>
                <ol>{shown.plan.map((step, i) => <li key={i}>{step}</li>)}</ol>
              </details>
            )}
            {!!others.length && (
              <div className="aothers">
                <span>{ATTENTION.others}</span>
                {others.map((o) => (
                  <button key={o.id} type="button" onClick={() => { setGone(shown.id); send({ type: "choose_move", moveId: shown.id, optionId: o.id }); }}>
                    {o.label}
                  </button>
                ))}
              </div>
            )}
            {shown.url && <a href={shown.url} target="_blank" rel="noreferrer">{WORDS.prLink}</a>}
          </div>
        )}
        <div className="aacts">
          <button type="button" className="alater" data-sfx onClick={() => later(shown)}>{ATTENTION.later}</button>
          <button type="button" className="atog" aria-expanded={open} onClick={() => setOpen((v) => !v)} aria-label={`${open ? ATTENTION.hide : ATTENTION.details}: ${THINKS.why}`}>
            {open ? ATTENTION.hide : ATTENTION.details}
          </button>
          {why && (
            <button type="button" className="awhy" aria-expanded={thinking} onClick={() => setThinking((v) => !v)}>
              {ATTENTION.whyAsk}
            </button>
          )}
        </div>
        </div>
        {isLaunch(shown) ? (
          <HoldLaunch key={shown.id} card={shown.id} label={continueOption(shown).label} onLaunch={(id) => { if (id === shown.id) go(shown, true); }} />
        ) : (
          <button type="button" className="ago atab" data-sfx onClick={() => go(shown)}>
            {ATTENTION.go}
            <span aria-hidden="true"> →</span>
            <span className="sr">: {continueOption(shown).label}</span>
          </button>
        )}
      </section>
    );
  } else if (quiet && !asking) {
    body = (
      <section className="acard suggest quiet" aria-label={quiet.title}>
        <div className="atop"><b>{ATTENTION.kind.suggest}</b><span>{quiet.kicker}</span></div>
        <span className="att">{quiet.title}</span>
        <div className="aacts"><button type="button" className="ago" onClick={quiet.onGo}>{quiet.cta}</button></div>
      </section>
    );
  }
  if (!body && !asking && !restTotal) return null;
  return (
    <div className="needs attention" role="group" aria-label={ATTENTION.kind.approve}>
      {body}
      {asking && (
        <div className="aask" role="group" aria-label={ATTENTION.laterAsk}>
          <span>{ATTENTION.parked} {ATTENTION.laterAsk}</span>
          <div>
            {ATTENTION.why.map((w) => (
              <button key={w.why} type="button" onClick={() => settle(asking, w.why)}>{w.label}</button>
            ))}
          </div>
        </div>
      )}
      {restTotal > 0 && <span className="sr" aria-live="polite">{ATTENTION.moreWaiting(restTotal)}</span>}
    </div>
  );
}

const realClock: HoldClock = {
  now: () => performance.now(),
  raf: (cb) => requestAnimationFrame(cb),
  caf: (id) => cancelAnimationFrame(id),
  after: (ms, cb) => window.setTimeout(cb, ms),
  clear: (id) => window.clearTimeout(id),
};

/** The big red launch button: hold one primary press until the ring fills (holdLaunch.ts has the rules).
 *  Finishing the hold only sends the launch: the rocket sound and "Rocket launching" caption wait for the server. */
export function HoldLaunch({ card, label, onLaunch, clock = realClock }: { card: string; label: string; onLaunch: (card: string) => void; clock?: HoldClock }) {
  const [p, setP] = useState(0);
  const [armed, setArmed] = useState(false); // mirrors the controller's confirm window, which owns its own expiry
  const launch = useRef(onLaunch);
  launch.current = onLaunch;
  const gesture = useRef<HoldGesture | null>(null);
  const renderHold = useRef<ReturnType<typeof holdRenderYield> | null>(null);
  const ticked = useRef(-1); // the last countdown tick played this press
  if (!gesture.current) {
    const lease = renderHold.current = holdRenderYield(
      {
        progress: (p) => {
          setP(p);
          // Countdown clank: a ratchet and a rising bell at each quarter of the hold
          const tick = Math.min(3, Math.floor(p * 4));
          if (p > 0 && tick > ticked.current) for (let i = ticked.current + 1; i <= tick; i++) sound.holdTick(i);
          if (p > 0) ticked.current = Math.max(ticked.current, tick);
        },
        arm: () => { ticked.current = 0; sound.holdTick(0); },
        cancel: () => { ticked.current = -1; sound.play("hold_cancel"); },
        confirm: (c) => setArmed(c !== null),
        launch: (c) => {
          ticked.current = -1;
          sound.play("hold_go");
          navigator.vibrate?.(60);
          launch.current(c);
        },
      },
    );
    gesture.current = new HoldGesture(lease.events, clock);
  }
  const g = gesture.current;
  useEffect(() => g.retarget(card), [g, card]);
  useEffect(() => {
    const leave = () => g.cancel();
    const hidden = () => { if (document.visibilityState !== "visible") g.cancel(); };
    window.addEventListener("blur", leave);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("blur", leave);
      document.removeEventListener("visibilitychange", hidden);
      g.dispose();
      renderHold.current?.dispose();
    };
  }, [g]);
  const isKey = (e: React.KeyboardEvent) => e.key === " " || e.key === "Enter";
  return (
    <button
      type="button"
      className={`alaunch${p > 0 ? " down" : ""}${armed ? " armed" : ""}`}
      style={{ "--p": p } as React.CSSProperties}
      aria-label={`${armed ? ATTENTION.confirmLaunch : ATTENTION.holdLaunch}: ${label}`}
      onPointerDown={(e) => {
        if (!e.isPrimary || e.button !== 0) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        g.press(card);
      }}
      onPointerUp={() => g.release()}
      onPointerCancel={() => g.cancel()}
      onLostPointerCapture={() => g.cancel()}
      onBlur={() => g.cancel()}
      onKeyDown={(e) => {
        if (!isKey(e)) return;
        e.preventDefault();
        if (!e.repeat) g.press(card);
      }}
      onKeyUp={(e) => {
        if (!isKey(e)) return;
        e.preventDefault();
        g.release();
      }}
      // Pointer clicks carry a click count; a bare activation (screen reader, switch) does not.
      onClick={(e) => { if (e.detail === 0) g.assistive(card); }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="cap" />
      <span className="lbl">{armed ? ATTENTION.again : ATTENTION.hold}</span>
    </button>
  );
}
