// The one task tray of the simple screen (?simple=1, thread "Simplify the whole game UI"). Every ask in the game is a
// card here: work parked on a yes, stuck work, ideas, a source to connect. One card at a time, "2 of 5"; swiping or the
// arrows step through them and the camera flies to the machine each one is about. The card says in plain words what's
// going on and what Continue does. Continue runs the suggested option, Later parks it a day, Edit/More opens the plan,
// the proof and the other options. The slow-spot line above opens and closes it (SlowSpotLine).

import { useEffect, useRef, useState } from "react";
import { attentionOf, continueOption, type FactoryState, type Move, type WebToServer } from "@shiptorio/shared";
import { ATTENTION, NEXT_MOVE, STAGE_LABEL, TASKS, THINKS, WORDS } from "../copy";
import { HoldLaunch, isLaunch, plugsInAgent } from "./Attention";
import { because } from "./because";
import { openUnlockLink } from "./unlockLink";
import { sound } from "../sound/engine";
import { taskOrder, type SlowSpot } from "./slowSpot";
import "./TaskTray.css";

const SWIPE_PX = 60;

interface Props {
  deck: Move[];
  send: (msg: WebToServer) => void;
  onFocus: (focus: string | null) => void; // fly the camera to what the shown card is about
  onPower?: () => void; // live local-agent setup opens Power, never a server connector action
  autonomy?: FactoryState["autonomy"];
  // the "what's next" idea when nothing waits on you: how the simple screen teaches by doing (no tour, journey pick 1)
  nudge?: { kicker: string; title: string; cta: string; onGo: () => void } | null;
}

export function TaskTray({ deck, send, onFocus, onPower, autonomy, nudge }: Props) {
  const [gone, setGone] = useState<Set<string>>(() => new Set()); // answered here; hidden before the server agrees
  const tasks = taskOrder(deck).filter((m) => !gone.has(m.id));
  const [curId, setCurId] = useState<string | null>(null);
  const lastAt = useRef(0); // where the shown card sat, so answering it shows the one that slid into its place
  let at = tasks.findIndex((m) => m.id === curId);
  if (at < 0) at = Math.min(lastAt.current, tasks.length - 1);
  lastAt.current = Math.max(0, at);
  const card = at >= 0 ? tasks[at] : null;
  const [open, setOpen] = useState(false);
  const [dx, setDx] = useState(0);
  const drag = useRef<{ x: number } | null>(null);

  // forget answered cards once the server has dropped them, so a card that comes back later shows again
  useEffect(() => {
    if (![...gone].some((id) => !deck.some((m) => m.id === id))) return;
    setGone((g) => new Set([...g].filter((id) => deck.some((m) => m.id === id))));
  }, [deck, gone]);
  useEffect(() => setOpen(false), [card?.id]);
  // the camera follows the card; with no card it goes back to where the player was
  const focus = card?.focus ?? null;
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;
  useEffect(() => onFocusRef.current(focus), [focus, card?.id]);
  useEffect(() => () => onFocusRef.current(null), []);

  if (!card) {
    if (!nudge) return null;
    return (
      <div className="needs tasktray" role="region" aria-label={TASKS.label}>
        <section className="acard suggest tabbed task" aria-label={`${TASKS.kind.suggest}: ${nudge.title}`}>
          <div className="abody">
            <div className="atop"><b>{TASKS.kind.suggest}</b><span>{nudge.kicker}</span></div>
            <span className="att">{nudge.title}</span>
          </div>
          <button type="button" className="ago atab" data-sfx onClick={nudge.onGo}>
            {nudge.cta}
            <span aria-hidden="true"> →</span>
          </button>
        </section>
      </div>
    );
  }
  const step = (by: number) => {
    if (tasks.length < 2) return;
    sound.play("card_later");
    setCurId(tasks[(at + by + tasks.length) % tasks.length].id);
  };
  const answered = (move: Move) => {
    setGone((g) => new Set(g).add(move.id));
    setCurId(null); // the next card slides into this one's place
  };
  const later = (move: Move) => {
    sound.play("card_later");
    answered(move);
    send({ type: "defer_move", moveId: move.id });
  };
  const go = (move: Move, held = false) => {
    if (!held) sound.play("card_go");
    const option = continueOption(move);
    if (onPower && plugsInAgent(option)) return onPower();
    answered(move);
    openUnlockLink(move, option);
    send({ type: "choose_move", moveId: move.id, optionId: option.id });
  };

  const kind = attentionOf(card);
  const option = continueOption(card);
  const others = card.options.filter((o) => o.id !== option.id && o.actions.length);
  const why = because(card);
  const where = card.stage && STAGE_LABEL[card.stage];
  const next = autonomy?.next;
  const earn = kind === "approve" && next && next.need > next.have ? TASKS.earn(next.need - next.have, next.label) : null;

  return (
    <div className="needs tasktray" role="region" aria-label={TASKS.label}>
      <section
        className={`acard ${kind} tabbed task${open ? " open" : ""}`}
        aria-label={`${TASKS.kind[kind]}: ${card.title}`}
        aria-live="polite"
        style={dx ? { transform: `translateX(${dx}px)` } : undefined}
        title={tasks.length > 1 ? TASKS.swipeHint : undefined}
        onPointerDown={(e) => {
          if ((e.target as Element).closest("button, a, details")) return;
          drag.current = { x: e.clientX };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => { if (drag.current) setDx(e.clientX - drag.current.x); }}
        onPointerUp={(e) => {
          if (!drag.current) return;
          const d = e.clientX - drag.current.x;
          drag.current = null;
          setDx(0);
          // a swipe only browses: answering always takes a button, so nothing ships by a stray flick
          if (d < -SWIPE_PX) step(1);
          else if (d > SWIPE_PX) step(-1);
        }}
        onPointerCancel={() => { drag.current = null; setDx(0); }}
      >
        <div className="abody">
          <div className="atop">
            <b>{TASKS.kind[kind]}</b>
            {where && <span>{where}</span>}
          </div>
          <span className="att">{card.title}</span>
          {card.why && <span className="aw tw">{card.why}</span>}
          {option.label.length > 3 && option.label !== card.title && <span className="tdo">{TASKS.does(option.label)}</span>}
          {earn && <span className="tearn">{earn}</span>}
          {open && (
            <div className="amore">
              {why && <p className="awhy-line"><b>{THINKS.why}</b> {why}</p>}
              {!!card.plan?.length && (
                <details className="nm-plan" open>
                  <summary>{NEXT_MOVE.plan}</summary>
                  <ol>{card.plan.map((s, i) => <li key={i}>{s}</li>)}</ol>
                </details>
              )}
              {!!others.length && (
                <div className="aothers">
                  <span>{TASKS.others}</span>
                  {others.map((o) => (
                    <button key={o.id} type="button" onClick={() => { answered(card); send({ type: "choose_move", moveId: card.id, optionId: o.id }); }}>
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
              {card.url && <a href={card.url} target="_blank" rel="noreferrer">{WORDS.prLink}</a>}
            </div>
          )}
          <div className="aacts">
            <button type="button" className="alater" data-sfx onClick={() => later(card)}>{TASKS.later}</button>
            <button type="button" className="atog" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
              {open ? TASKS.less : others.length ? TASKS.edit : TASKS.more}
            </button>
            {tasks.length > 1 && (
              <span className="tpager">
                <button type="button" aria-label={TASKS.prev} onClick={() => step(-1)}>‹</button>
                <span aria-live="polite">{TASKS.of(at + 1, tasks.length)}</span>
                <button type="button" aria-label={TASKS.next} onClick={() => step(1)}>›</button>
              </span>
            )}
          </div>
        </div>
        {isLaunch(card) ? (
          <HoldLaunch key={card.id} card={card.id} label={option.label} onLaunch={(id) => { if (id === card.id) go(card, true); }} />
        ) : (
          <button type="button" className="ago atab" data-sfx onClick={() => go(card)}>
            {ATTENTION.go}
            <span aria-hidden="true"> →</span>
            <span className="sr">: {option.label}</span>
          </button>
        )}
      </section>
    </div>
  );
}

/** The one line that always says what's slow. Tap it to open or close the task tray. */
export function SlowSpotLine({ spot, open, onToggle, ideas }: { spot: SlowSpot; open: boolean; onToggle: () => void; ideas: number }) {
  const has = spot.who === "you" || ideas > 0;
  return (
    <button type="button" className={`slowspot ${spot.who}`} aria-expanded={has ? open : undefined} aria-label={TASKS.lineLabel(spot.text)} onClick={onToggle} disabled={!has && spot.who === "clear"}>
      <span className="k">{TASKS.slow}</span>
      <b>{spot.text}</b>
      {spot.who !== "you" && ideas > 0 && <span className="ideas">{TASKS.ideas(ideas)}</span>}
      {has && <span className="go">{open ? TASKS.hide : TASKS.open}</span>}
    </button>
  );
}
