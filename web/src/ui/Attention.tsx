// The Needs you tray, behind the "attention" flag (docs/ATTENTION.md). One card shape for every kind:
// Approve (amber, parked on a yes), Steer (red, stuck) and Suggested (teal, an idea that never pings).
// Two actions only: Continue (swipe right) runs the suggested option; Later (swipe left) parks it for a day.
// After Later, an optional row says why, and that answer steers what the planner suggests next.

import { useEffect, useRef, useState } from "react";
import { attentionOf, ATTENTION_RANK, continueOption, type Attention, type Move, type WebToServer } from "@shiptorio/shared";
import { ATTENTION, NEXT_MOVE, STAGE_LABEL, THINKS, WORDS } from "../copy";
import { because } from "./because";

const SWIPE_PX = 80;
const LATER_ASK_MS = 4000;
type Why = (typeof ATTENTION.why)[number]["why"];

const plugsInAgent = (o: Move["options"][number]) => o.actions.some((a) => a.tool === "connect_source" && (a.args.kind === "claude" || a.args.kind === "codex"));

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
}

export function AttentionTray({ deck, send, onPower, onCheckin, quiet }: Props) {
  const card = trayCard(deck);
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState<Move | null>(null); // a Later held for a moment so the player can say why
  const [gone, setGone] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef<{ x: number; id: number } | null>(null);
  const [dx, setDx] = useState(0);

  useEffect(() => setOpen(false), [card?.id]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const settle = (move: Move, why: Why) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setAsking(null);
    send(why === "defer" ? { type: "defer_move", moveId: move.id } : { type: "dismiss_move", moveId: move.id, why });
  };
  const later = (move: Move) => {
    if (asking) settle(asking, "defer");
    setGone(move.id);
    setAsking(move);
    timer.current = setTimeout(() => settle(move, "defer"), LATER_ASK_MS);
  };
  const go = (move: Move) => {
    if (asking) settle(asking, "defer");
    const option = continueOption(move);
    if (onPower && plugsInAgent(option)) return onPower();
    setGone(move.id);
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
        className={`acard ${kind}${open ? " open" : ""}`}
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
          if (d > SWIPE_PX) go(shown);
          else if (d < -SWIPE_PX) later(shown);
          // One queue: tapping the card opens the deck when more is waiting, else its details.
          else if (Math.abs(d) < 6) { if (onCheckin && deck.length > 1) onCheckin(); else setOpen((v) => !v); }
        }}
        onPointerCancel={() => { drag.current = null; setDx(0); }}
        title={ATTENTION.swipeHint}
      >
        <div className="atop">
          <b>{ATTENTION.kind[kind]}</b>
          {stage && <span>{stage}</span>}
        </div>
        <span className="att">{shown.title}</span>
        <span className="aw">{shown.why}</span>
        {shown.because && <span className="abc">{shown.because}</span>}
        {open && (
          <div className="amore">
            {why && why !== shown.because && <p>{why}</p>}
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
          <button type="button" className="ago" onClick={() => go(shown)}>
            {ATTENTION.continue}
            <span className="sr">: {continueOption(shown).label}</span>
          </button>
          <button type="button" className="alater" onClick={() => later(shown)}>{ATTENTION.later}</button>
          <button type="button" className="atog" aria-expanded={open} onClick={() => setOpen((v) => !v)} aria-label={`${open ? ATTENTION.hide : ATTENTION.details}: ${THINKS.why}`}>
            {open ? ATTENTION.hide : ATTENTION.details}
          </button>
        </div>
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
      {restTotal > 0 && (
        <div className="arest">
          <span>+ {ATTENTION.more(rest.approve, rest.steer, rest.suggest)}</span>
          {onCheckin && <button type="button" onClick={onCheckin}>{ATTENTION.checkin}</button>}
        </div>
      )}
    </div>
  );
}
