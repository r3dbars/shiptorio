// The one task tray of the simple screen (?simple=1, thread "Simplify the whole game UI", docs/SIMPLE-UI.md). Every ask
// in the game is a card here: work parked on a yes, stuck work, ideas, a source to connect. One card at a time, "2 of 5";
// the arrows step through them and the camera flies to the machine each one is about. A card shows only its title.
// Swipe right to Continue, left for Later, up for the details (why, plan, other options), down to never see it again
// (with an optional one-tap why, the factory's feedback signal). A launch still merges real code, so it takes the held
// red button or a swipe all the way across. Every gesture has a button too.

import { useEffect, useRef, useState } from "react";
import { attentionOf, continueOption, type FactoryState, type Item, type Move, type WebToServer } from "@shiptorio/shared";
import { NEXT_MOVE, STAGE_LABEL, STATE_WORD, TASKS, THINKS, WORDS } from "../copy";
import { HoldLaunch, isLaunch, plugsInAgent } from "./Attention";
import { because } from "./because";
import { openUnlockLink } from "./unlockLink";
import { sound } from "../sound/engine";
import { taskOrder, type SlowSpot } from "./slowSpot";
import { moving } from "./moving";
import "./TaskTray.css";

const SWIPE_PX = 70;
const LAUNCH_SHARE = 0.55; // a launch swipe has to cross over half the card
const ASK_MS = 6000; // how long the optional "why" waits after a never before it goes as a plain never
const RIDE_MS = 8000; // following the work: how long the camera rides one item before it moves on to the next
const WENT_KEY = "shiptorio:simple-went"; // set on the first Continue: until then the Go tab glows

type Never = Extract<WebToServer, { type: "dismiss_move" }>["why"];
type Drag = { x: number; y: number; w: number };

interface Props {
  deck: Move[];
  send: (msg: WebToServer) => void;
  onFocus: (focus: string | null) => void; // fly the camera to what the shown card is about
  onPower?: () => void; // live local-agent setup opens Power, never a server connector action
  onCaughtUp?: () => void; // you answered the last card
  autonomy?: FactoryState["autonomy"];
  items?: Item[]; // the work on the line, for "follow them" once you're all caught up
  // the "what's next" idea when nothing waits on you: how the simple screen teaches by doing (no tour, journey pick 1)
  nudge?: { kicker: string; title: string; cta: string; onGo: () => void } | null;
}

const wentBefore = () => {
  try {
    return !!localStorage.getItem(WENT_KEY);
  } catch {
    return true;
  }
};

export function TaskTray({ deck, send, onFocus, onPower, onCaughtUp, autonomy, items, nudge }: Props) {
  const [gone, setGone] = useState<Set<string>>(() => new Set()); // answered here; hidden before the server agrees
  const tasks = taskOrder(deck).filter((m) => !gone.has(m.id));
  const [curId, setCurId] = useState<string | null>(null);
  const lastAt = useRef(0); // where the shown card sat, so answering it shows the one that slid into its place
  let at = tasks.findIndex((m) => m.id === curId);
  if (at < 0) at = Math.min(lastAt.current, tasks.length - 1);
  lastAt.current = Math.max(0, at);
  const card = at >= 0 ? tasks[at] : null;
  const [open, setOpen] = useState(false);
  const [d, setD] = useState({ x: 0, y: 0 });
  const drag = useRef<Drag | null>(null);
  const [went, setWent] = useState(wentBefore);
  const [asking, setAsking] = useState<Move | null>(null); // a never waiting on its optional why
  const askTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answeredHere = useRef(false);
  // all caught up: the work in flight, and which one the camera is riding (null = not following)
  const said = useRef<string | null>(null); // the item your last yes was about, so the ride starts there
  const flight = moving(items, said.current);
  const [rideId, setRideId] = useState<string | null>(null);
  const riding = !card && rideId ? flight.findIndex((it) => it.id === rideId) : -1;
  const ride = riding >= 0 ? flight[riding] : null;
  const hop = (by: number) => flight.length && setRideId(flight[(Math.max(0, riding) + by + flight.length) % flight.length].id);
  // ride each one for a few seconds, then the next; a tap on the arrows starts the clock over
  useEffect(() => {
    if (!ride || flight.length < 2) return;
    const t = setTimeout(() => hop(1), RIDE_MS);
    return () => clearTimeout(t);
  }, [ride?.id, flight.length]);

  // forget answered cards once the server has dropped them, so a card that comes back later shows again
  useEffect(() => {
    if (![...gone].some((id) => !deck.some((m) => m.id === id))) return;
    setGone((g) => new Set([...g].filter((id) => deck.some((m) => m.id === id))));
  }, [deck, gone]);
  useEffect(() => setOpen(false), [card?.id]);
  // the camera follows the card; with no card it goes back to where the player was
  const focus = card ? (card.focus ?? null) : ride ? `item:${ride.id}` : null;
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;
  useEffect(() => onFocusRef.current(focus), [focus, card?.id]);
  useEffect(() => () => onFocusRef.current(null), []);
  // answering the last card zooms out on everything that's moving (journey round 3, pick 8)
  const left = tasks.length;
  const onCaughtUpRef = useRef(onCaughtUp);
  onCaughtUpRef.current = onCaughtUp;
  useEffect(() => {
    if (left === 0 && answeredHere.current) onCaughtUpRef.current?.();
    if (left === 0) answeredHere.current = false;
  }, [left]);

  // a never sends when you pick a why, or as a plain never once the ask runs out (or the tray goes away)
  const sendNever = useRef<(why: Never) => void>(() => {});
  sendNever.current = (why: Never) => {
    if (askTimer.current) clearTimeout(askTimer.current);
    askTimer.current = null;
    if (asking) send({ type: "dismiss_move", moveId: asking.id, why });
    setAsking(null);
  };
  useEffect(() => () => sendNever.current("once"), []);

  const answered = (move: Move) => {
    answeredHere.current = true;
    setGone((g) => new Set(g).add(move.id));
    setCurId(null); // the next card slides into this one's place
  };
  const later = (move: Move) => {
    sound.play("card_later");
    answered(move);
    send({ type: "defer_move", moveId: move.id });
  };
  const never = (move: Move) => {
    if (asking) sendNever.current("once");
    sound.play("card_later");
    answered(move);
    setAsking(move);
    askTimer.current = setTimeout(() => sendNever.current("once"), ASK_MS);
  };
  const go = (move: Move, held = false) => {
    if (!held) sound.play("card_go");
    if (!went) {
      setWent(true);
      try {
        localStorage.setItem(WENT_KEY, "1");
      } catch {
        // glows again next visit, that's all
      }
    }
    const option = continueOption(move);
    if (onPower && plugsInAgent(option)) return onPower();
    said.current = move.itemId ?? null;
    answered(move);
    openUnlockLink(move, option);
    send({ type: "choose_move", moveId: move.id, optionId: option.id });
  };

  const ask = asking && (
    <div className="tnever" role="group" aria-label={TASKS.neverAsk}>
      <span>{TASKS.neverAsk}</span>
      <div>
        {TASKS.neverWhy.map((w) => (
          <button key={w.why} type="button" onClick={() => sendNever.current(w.why)}>{w.label}</button>
        ))}
      </div>
    </div>
  );

  if (!card && ride) return <Riding item={ride} at={riding} of={flight.length} hop={hop} stop={() => setRideId(null)} />;
  if (!card && flight.length) {
    // all caught up with work in flight: follow it through the factory (round 3 pick 8); the next idea waits beside it
    const n = flight.length;
    return (
      <div className="needs tasktray" role="region" aria-label={TASKS.label}>
        {ask}
        <section className="acard suggest tabbed task caught" aria-label={TASKS.caught}>
          <div className="abody">
            <div className="atop"><b>{TASKS.caught}</b></div>
            <span className="att">{TASKS.inFlight(n)}</span>
            {nudge && (
              <div className="aacts">
                <button type="button" className="alater" data-sfx onClick={nudge.onGo}>{nudge.cta}</button>
              </div>
            )}
          </div>
          <button type="button" className="ago atab" data-sfx onClick={() => setRideId(flight[0].id)}>
            {TASKS.follow(n)}
            <span aria-hidden="true"> →</span>
          </button>
        </section>
      </div>
    );
  }
  if (!card) {
    if (!nudge) return ask ? <div className="needs tasktray">{ask}</div> : null;
    return (
      <div className="needs tasktray" role="region" aria-label={TASKS.label}>
        {ask}
        <section className="acard suggest tabbed task" aria-label={`${TASKS.kind.suggest}: ${nudge.title}`}>
          <div className="abody">
            <div className="atop"><b>{TASKS.kind.suggest}</b><span>{nudge.kicker}</span></div>
            <span className="att">{nudge.title}</span>
          </div>
          <button type="button" className={`ago atab${went ? "" : " glow"}`} data-sfx onClick={nudge.onGo}>
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

  const kind = attentionOf(card);
  const option = continueOption(card);
  const launch = isLaunch(card);
  const others = card.options.filter((o) => o.id !== option.id && o.actions.length);
  const why = because(card);
  const where = card.stage && STAGE_LABEL[card.stage];
  const next = autonomy?.next;
  const earn = kind === "approve" && next && next.need > next.have ? TASKS.earn(next.need - next.have, next.label) : null;

  // what letting go right now would do, shown on the card while you drag
  const w = drag.current?.w ?? 360;
  const horiz = Math.abs(d.x) > Math.abs(d.y);
  const far = horiz ? Math.abs(d.x) : Math.abs(d.y);
  const intent: keyof typeof TASKS.drag | null =
    far < SWIPE_PX ? null
    : horiz ? (d.x < 0 ? "later" : launch ? (d.x > w * LAUNCH_SHARE ? "launch" : "launchFar") : "go")
    : d.y < 0 ? (open ? null : "more") : open ? "less" : "never";
  const letGo = () => {
    const was = intent;
    drag.current = null;
    setD({ x: 0, y: 0 });
    if (was === "later") later(card);
    else if (was === "go" || was === "launch") go(card);
    else if (was === "more") setOpen(true);
    else if (was === "less") setOpen(false);
    else if (was === "never") never(card);
  };

  return (
    <div className="needs tasktray" role="region" aria-label={TASKS.label}>
      {ask}
      <section
        className={`acard ${kind} tabbed task${open ? " open" : ""}${intent ? ` will-${intent}` : ""}`}
        aria-label={`${TASKS.kind[kind]}: ${card.title}`}
        aria-live="polite"
        style={d.x || d.y ? { transform: horiz ? `translateX(${d.x}px) rotate(${d.x / 40}deg)` : `translateY(${d.y}px)` } : undefined}
        title={TASKS.swipeHint}
        onPointerDown={(e) => {
          if ((e.target as Element).closest("button, a, details")) return;
          drag.current = { x: e.clientX, y: e.clientY, w: e.currentTarget.offsetWidth };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => { if (drag.current) setD({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y }); }}
        onPointerUp={() => { if (drag.current) letGo(); }}
        onPointerCancel={() => { drag.current = null; setD({ x: 0, y: 0 }); }}
      >
        {intent && <span className="tintent" aria-hidden="true">{TASKS.drag[intent]}</span>}
        <div className="abody">
          <div className="atop">
            <b>{TASKS.kind[kind]}</b>
            {where && <span>{where}</span>}
          </div>
          <span className="att">{card.title}</span>
          {earn && <span className="tearn">{earn}</span>}
          {open && (
            <div className="amore">
              {card.why && <p className="aw tw">{card.why}</p>}
              {option.label.length > 3 && option.label !== card.title && <p className="tdo">{TASKS.does(option.label)}</p>}
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
                    <button key={o.id} type="button" onClick={() => { said.current = card.itemId ?? null; answered(card); send({ type: "choose_move", moveId: card.id, optionId: o.id }); }}>
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
              {card.url && <a href={card.url} target="_blank" rel="noreferrer">{WORDS.prLink}</a>}
              <button type="button" className="tnever-btn" onClick={() => never(card)}>{TASKS.never}</button>
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
        {launch ? (
          <HoldLaunch key={card.id} card={card.id} label={option.label} onLaunch={(id) => { if (id === card.id) go(card, true); }} />
        ) : (
          <button type="button" className={`ago atab${went ? "" : " glow"}`} data-sfx onClick={() => go(card)}>
            {TASKS.drag.go}
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

/** Following the work: one piece in flight at a time, the camera riding it up the shaft, "2 of 4" to step through. */
function Riding({ item, at, of, hop, stop }: { item: Item; at: number; of: number; hop: (by: number) => void; stop: () => void }) {
  return (
    <div className="needs tasktray" role="region" aria-label={TASKS.moving}>
      <section className="acard suggest tabbed task riding" aria-label={`${TASKS.moving}: ${item.title}`} aria-live="polite">
        <div className="abody">
          <div className="atop">
            <b>{TASKS.moving}</b>
            <span>{TASKS.now(STATE_WORD[item.state])}</span>
          </div>
          <span className="att">{item.prNumber ? `#${item.prNumber} ` : ""}{item.title}</span>
          <div className="aacts">
            {item.prUrl && <a className="alater" href={item.prUrl} target="_blank" rel="noreferrer">{WORDS.prLink}</a>}
            {of > 1 && (
              <span className="tpager">
                <button type="button" aria-label={TASKS.prevWork} onClick={() => hop(-1)}>‹</button>
                <span>{TASKS.of(at + 1, of)}</span>
                <button type="button" aria-label={TASKS.nextWork} onClick={() => hop(1)}>›</button>
              </span>
            )}
          </div>
        </div>
        <button type="button" className="ago atab" data-sfx onClick={stop}>{TASKS.stop}</button>
      </section>
    </div>
  );
}
