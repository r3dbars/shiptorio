// The check-in: the planner's next 8 to 12 moves as a deck you swipe through (docs/PRODUCT.md "Check-in").
// Right = do it (the suggested pick), left = later, down = never (+ one tap on why), up = details, tap = zoom.
// Every gesture also has a button and an arrow key.

import { because } from "./because";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Autonomy, Move, WebToServer } from "@shiptorio/shared";
import { ATTENTION, CHECKIN, STAGE_LABEL, THINKS, WORDS } from "../copy";
import { Icon } from "./icons";

type Gesture = "right" | "left" | "down" | "up";
type Why = Extract<WebToServer, { type: "dismiss_move" }>["why"];

const NEVER: readonly { why: Why; label: string; text: string }[] = CHECKIN.never;

const STAMP: Record<Gesture, string> = CHECKIN.stamp;
const SWIPE_PX = 90;

interface Props {
  deck: Move[];
  autonomy?: Autonomy;
  send: (msg: WebToServer) => void;
  onFocus: (id: string | null) => void; // the map zooms to the card's spot
  onClose: () => void;
  onAnswered?: (left: number) => void; // a yes or a never landed (progression), with this many cards still up
  end?: ReactNode; // extra on the end screen: today's tally and the deck trend
  calm?: boolean; // docs/ATTENTION.md: two buttons only (Continue / Later); the never reasons move into Details
}

const pickOf = (m: Move) => m.options.find((o) => o.recommended) ?? m.options[0];

function dirOf(dx: number, dy: number, min: number): Gesture | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < min) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

type CardMessage = Extract<WebToServer, { type: "choose_move" | "defer_move" | "dismiss_move" }>;

/** Keep identity stable while refreshing the actual server-owned proof and options. */
export function createCheckInSession(initial: Move[], clock = {
  later: (fn: () => void) => setTimeout(fn, 260),
  cancel: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
}) {
  let live = initial;
  let pinned: string | null = initial[0]?.id ?? null;
  let closed = false;
  const gone = new Set<string>();
  type Flight = { moveId: string; message: CardMessage; stamp: string; timer?: ReturnType<typeof setTimeout>; abort: () => void };
  let flight: Flight | null = null;
  const cards = (deck = live) => {
    const remaining = deck.filter((move) => !gone.has(move.id));
    const current = remaining.find((move) => move.id === pinned);
    return current ? [current, ...remaining.filter((move) => move.id !== pinned)] : remaining;
  };
  const stamp = (move: Move) => JSON.stringify({ itemId: move.itemId, stage: move.stage, url: move.url,
    kind: move.kind, focus: move.focus, locked: move.locked, plan: move.plan, evidence: move.evidence, options: move.options });
  const cancel = (notify: boolean) => {
    const pending = flight; flight = null;
    if (pending?.timer !== undefined) clock.cancel(pending.timer);
    if (notify) pending?.abort();
  };
  return {
    cards,
    busy: () => flight !== null,
    open() { closed = false; },
    close() { closed = true; cancel(false); },
    update(deck: Move[]) {
      live = deck;
      const ids = new Set(deck.map((move) => move.id));
      for (const id of gone) if (!ids.has(id)) gone.delete(id);
      pinned = cards()[0]?.id ?? null;
      if (flight) {
        const current = live.find((move) => move.id === flight!.moveId);
        if (!current || stamp(current) !== flight.stamp) cancel(true);
      }
      return cards();
    },
    begin(move: Move, message: CardMessage, commit: (message: CardMessage) => void, abort: () => void) {
      const current = cards()[0];
      if (closed || flight || !current || current.id !== move.id || message.moveId !== move.id || stamp(current) !== stamp(move)) return false;
      if (message.type === "choose_move" && !current.options.some((option) => option.id === message.optionId)) return false;
      const pending: Flight = { moveId: move.id, message: { ...message }, stamp: stamp(move), abort };
      flight = pending; // synchronous guard: two events in one render still schedule only once
      pending.timer = clock.later(() => {
        if (closed || flight !== pending) return;
        const latest = live.find((candidate) => candidate.id === pending.message.moveId);
        if (!latest || stamp(latest) !== pending.stamp) { cancel(true); return; }
        flight = null;
        gone.add(pending.moveId);
        pinned = cards()[0]?.id ?? null;
        commit(pending.message);
      });
      return true;
    },
  };
}

/** A sent gesture earns progress only after it disappears from the server-owned deck. */
export function createAnswerTracker() {
  const pending = new Set<string>();
  return {
    submit(moveId: string) { pending.add(moveId); },
    acknowledge(deck: readonly Move[]): number[] {
      const present = new Set(deck.map(move => move.id));
      const resolved = [...pending].filter(id => !present.has(id));
      for (const id of resolved) pending.delete(id);
      // Batched acknowledgments clear the deck once, on the last resolved card.
      return resolved.map((_, index) => deck.length + resolved.length - index - 1);
    },
  };
}

export function CheckIn({ deck, autonomy, send, onFocus, onClose, onAnswered, end, calm }: Props) {
  const [session] = useState(() => createCheckInSession(deck));
  const [answers] = useState(createAnswerTracker);
  const [sheet, setSheet] = useState<"details" | "never" | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const [fly, setFly] = useState<Gesture | null>(null);
  const [tally, setTally] = useState({ yes: 0, later: 0, never: 0, rules: 0, grows: [] as string[] });
  const [toast, setToast] = useState<string | null>(null);
  const start = useRef<{ id: string; card: Move; x: number; y: number; moved: boolean } | null>(null);
  const firstDeal = useRef(deck.length);

  const cards = session.cards(deck);
  const top = cards[0];

  // Reconcile committed props before paint. New top-ranked cards cannot replace the
  // card under the player's finger; same-id proof/options still update immediately.
  useLayoutEffect(() => {
    session.update(deck);
    for (const left of answers.acknowledge(deck)) onAnswered?.(left);
  }, [deck, session, answers, onAnswered]);
  useLayoutEffect(() => { session.open(); return () => session.close(); }, [session]);
  const close = () => { session.close(); onClose(); };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1700);
    return () => clearTimeout(t);
  }, [toast]);

  // A new top card starts zoomed out.
  useLayoutEffect(() => {
    setZoomed(false);
    setSheet(null);
    setDrag(null);
    start.current = null;
    onFocus(null);
  }, [top?.id]);

  const done = (m: Move, g: Gesture, message: CardMessage, then: () => void) => {
    const reset = () => { setFly(null); setDrag(null); start.current = null; };
    if (!session.begin(m, message, (boundMessage) => {
      reset();
      send(boundMessage); // exactly the card and option that were visible at gesture start
      then();
    }, () => { reset(); setToast(CHECKIN.toast.changed); })) return;
    setFly(g);
    setSheet(null);
  };

  const choose = (m: Move, optionId: string) =>
    done(m, "right", { type: "choose_move", moveId: m.id, optionId }, () => {
      const o = m.options.find((x) => x.id === optionId);
      setTally((t) => ({ ...t, yes: t.yes + 1, grows: o?.recommended ? [...t.grows, ...(m.grows ?? [])] : t.grows }));
      if (onAnswered) answers.submit(m.id);
      setToast(CHECKIN.toast.yes(o?.label));
    });

  const act = (g: Gesture, card = top): void => {
    if (!card || card.id !== top?.id || session.busy()) return;
    if (g === "up") return setSheet("details");
    if (g === "down") return calm ? act("left", card) : setSheet("never");
    if (g === "right") return choose(card, pickOf(card).id); // a locked card's pick is the missing check, never a merge
    done(card, "left", { type: "defer_move", moveId: card.id }, () => {
      setTally((t) => ({ ...t, later: t.later + 1 }));
      setToast(CHECKIN.toast.later);
    });
  };

  const never = (why: Why) => {
    if (!top || session.busy()) return;
    done(top, "down", { type: "dismiss_move", moveId: top.id, why }, () => {
      setTally((t) => ({ ...t, never: t.never + 1, rules: t.rules + (why === "once" ? 0 : 1) }));
      if (onAnswered) answers.submit(top.id);
      setToast(CHECKIN.toast.never[why]);
    });
  };

  const toggleZoom = () => {
    if (!top || session.busy()) return;
    const on = !zoomed;
    setZoomed(on);
    onFocus(on ? top.focus ?? null : null);
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") return sheet ? setSheet(null) : close();
      if (e.repeat) return;
      if (sheet) return;
      const g = ({ ArrowRight: "right", ArrowLeft: "left", ArrowUp: "up", ArrowDown: "down" } as const)[e.key as string];
      if (g) {
        e.preventDefault();
        act(g);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const down = (e: React.PointerEvent) => {
    if (!top || session.busy()) return;
    start.current = { id: top.id, card: top, x: e.clientX, y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s || s.id !== top?.id || session.busy()) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) s.moved = true;
    if (s.moved) setDrag({ dx, dy });
  };
  const up = () => {
    const s = start.current;
    start.current = null;
    if (!s || s.id !== top?.id || session.busy()) return;
    if (!s.moved) return toggleZoom();
    const g = drag && dirOf(drag.dx, drag.dy, SWIPE_PX);
    setDrag(null);
    if (g) act(g, s.card);
  };

  const leaning = drag ? dirOf(drag.dx, drag.dy, 30) : null;
  const lean = drag ? Math.min(1, (Math.max(Math.abs(drag.dx), Math.abs(drag.dy)) - 30) / 60) : 0;
  const cardStyle = (): React.CSSProperties | undefined => {
    if (fly) {
      const far = { right: "translate(140%, -10%) rotate(22deg)", left: "translate(-140%, -10%) rotate(-22deg)", down: "translate(0, 140%)", up: "none" }[fly];
      return { transform: far, opacity: 0, transition: "transform .26s ease-in, opacity .26s ease-in" };
    }
    if (drag) return { transform: `translate(${drag.dx}px, ${drag.dy}px) rotate(${drag.dx / 18}deg)` };
    return undefined;
  };

  const total = Math.max(firstDeal.current, cards.length);
  const swiped = tally.yes + tally.later + tally.never;

  return (
    <section className={`checkin${zoomed ? " zoomed" : ""}`} aria-label={CHECKIN.label}>
      <header className="ci-bar card">
        <b>{CHECKIN.label}</b>
        <span className="ci-count">{top ? CHECKIN.left(cards.length) : CHECKIN.allClear}</span>
        <div className="ci-pips" aria-hidden="true">
          {Array.from({ length: Math.min(12, total) }, (_, i) => (
            <i key={i} className={i < swiped ? "done" : i === swiped && top ? "cur" : ""} />
          ))}
        </div>
        <button type="button" className="ci-x" onClick={close} aria-label={CHECKIN.close}>
          <Icon name="cross" size={14} />
        </button>
      </header>

      {zoomed && top && <div className="ci-where">{top.focus ? CHECKIN.zoomed : CHECKIN.zoomedNoSpot}</div>}

      <div className="ci-deck">
        {top ? (
          cards
            .slice(0, 3)
            .reverse()
            .map((m, n, arr) => {
              const depth = arr.length - 1 - n;
              if (depth > 0)
                return <div key={m.id} className={`ci-card card behind d${depth}`} aria-hidden="true" />;
              return (
                <article
                  key={m.id}
                  className="ci-card card"
                  aria-busy={!!fly}
                  style={cardStyle()}
                  tabIndex={0}
                  aria-label={m.title}
                  onPointerDown={down}
                  onPointerMove={move}
                  onPointerUp={up}
                  onPointerCancel={() => {
                    start.current = null;
                    setDrag(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleZoom();
                    }
                  }}
                >
                  <div className="ci-kicker">
                    {m.kind && <span className={`ci-tag ${m.kind}`}>{m.kind.toUpperCase()}</span>}
                    {m.stage && <span className="ci-stage">{STAGE_LABEL[m.stage].toUpperCase()}</span>}
                  </div>
                  <div className="ci-title">{m.title}</div>
                  <p className="ci-why">{m.why}</p>
                  {zoomed && because(m) && <p className="why-line"><b>{THINKS.why}</b> {because(m)}</p>}
                  {m.evidence && (
                    <div className="ci-stamps">
                      {m.evidence.map((e) => (
                        <span key={e.station} className={e.ok ? "ok" : "miss"}>
                          {e.ok ? "✓" : "✕"} {e.station.toUpperCase()}
                          {e.note ? ` · ${e.note}` : ""}
                        </span>
                      ))}
                    </div>
                  )}
                  {m.grows && (
                    <div className="ci-grows">
                      {m.grows.map((g) => (
                        <span key={g}>{g}</span>
                      ))}
                    </div>
                  )}
                  {m.locked && <div className="ci-lock">{CHECKIN.locked}</div>}
                  <div className="ci-pick">
                    <span className="lbl">{CHECKIN.pick}</span>
                    <span className="do">{pickOf(m).label}</span>
                    {m.options.length > 1 && <span className="alt">{CHECKIN.or(m.options.filter((o) => o !== pickOf(m)).map((o) => o.label.toLowerCase()).join(", "))}</span>}
                  </div>
                  {(Object.keys(STAMP) as Gesture[]).map((g) => (
                    <span key={g} className={`ci-stampbig ${g}`} style={{ opacity: leaning === g ? lean : 0 }} aria-hidden="true">
                      {STAMP[g]}
                    </span>
                  ))}
                </article>
              );
            })
        ) : (
          <div className="ci-clear card">
            <div className="ci-title">{CHECKIN.allClear}</div>
            <p className="ci-why">{swiped ? CHECKIN.doneWhy(swiped) : CHECKIN.emptyWhy}</p>
            {swiped > 0 && (
              <div className="ci-tally">
                <div>
                  <b>{tally.yes}</b>{CHECKIN.tally.yes}
                </div>
                <div>
                  <b>{tally.later}</b>{CHECKIN.tally.later}
                </div>
                <div>
                  <b>{tally.grows.filter((g) => g.includes("CHECK") || g.includes("STATION")).length}</b>{CHECKIN.tally.checks}
                </div>
                <div>
                  <b>{tally.rules}</b>{CHECKIN.tally.rules}
                </div>
              </div>
            )}
            {autonomy?.next && (
              <div className="ci-meter" title={`${autonomy.next.have}/${autonomy.next.need} ${autonomy.next.label}`}>
                <span>{CHECKIN.autonomy(autonomy.next.level.toUpperCase().replace("_", " "))}</span>
                <div className="segs">
                  {Array.from({ length: 10 }, (_, i) => (
                    <i key={i} style={i < Math.round((autonomy.next!.have / autonomy.next!.need) * 10) ? { background: "var(--blue)" } : undefined} />
                  ))}
                </div>
              </div>
            )}
            {end}
            <p className="ci-quote">{CHECKIN.quote}</p>
            <button type="button" className="btn nm-btn" onClick={close}>
              {CHECKIN.back}
            </button>
          </div>
        )}
      </div>

      {top && (
        <div className="ci-actions">
          {!calm && (
            <button type="button" className="ci-act never" disabled={!!fly} onClick={() => act("down")}>
              <span className="k"><Icon name="cross" size={16} /></span>{CHECKIN.buttons.never}
            </button>
          )}
          <button type="button" className="ci-act later" disabled={!!fly} onClick={() => act("left")}>
            <span className="k"><Icon name="back" size={16} /></span>{calm ? ATTENTION.later : CHECKIN.buttons.later}
          </button>
          <button type="button" className="ci-act more" disabled={!!fly} onClick={() => act("up")}>
            <span className="k"><Icon name="info" size={16} /></span>{calm ? ATTENTION.details : CHECKIN.buttons.details}
          </button>
          <button type="button" className="ci-act do" disabled={!!fly} onClick={() => act("right")}>
            <span className="k"><Icon name="check" size={16} /></span>{calm ? ATTENTION.continue : CHECKIN.buttons.doIt}
          </button>
        </div>
      )}

      {top && sheet === "details" && (
        <div className="ci-sheet ci-details card" role="dialog" aria-label={CHECKIN.details}>
          <div className="ci-details-head">
            <button type="button" className="ci-close" onClick={() => setSheet(null)}>
              {CHECKIN.closeSheet}
            </button>
            <div className="ci-title small">{top.title}</div>
          </div>
          <div className="ci-review" role="region" aria-label="Plan details" tabIndex={0}>
            {top.plan && (
              <>
                <div className="ci-sec">{CHECKIN.onYes}</div>
                <ol>
                  {top.plan.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ol>
              </>
            )}
            {top.url && (
              <a className="nm-link" href={top.url} target="_blank" rel="noreferrer">
                {WORDS.onGithub}
              </a>
            )}
            {calm && (
              <>
                <div className="ci-sec">{ATTENTION.teach}</div>
                {NEVER.filter((n) => n.why !== "once").map((n) => (
                  <button key={n.why} type="button" disabled={!!fly} className="ci-opt why" onClick={() => { setSheet(null); never(n.why); }}>
                    <b>{n.label}</b>
                    {n.text}
                  </button>
                ))}
              </>
            )}
          </div>
          <div className="ci-options">
            <div className="ci-sec">{CHECKIN.pickOne}</div>
            {top.options.map((o) => (
              <button key={o.id} type="button" disabled={!!fly} className={o.recommended ? "ci-opt rec" : "ci-opt"} title={o.actions.map((a) => `${a.tool}: ${a.reason}`).join("\n") || undefined} onClick={() => choose(top, o.id)}>
                {o.recommended ? "★ " : ""}
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {top && sheet === "never" && (
        <div className="ci-sheet card" role="dialog" aria-label={CHECKIN.neverLabel}>
          <button type="button" className="ci-close" onClick={() => setSheet(null)}>
            {CHECKIN.cancel}
          </button>
          <div className="ci-title small">{CHECKIN.neverTitle}</div>
          {NEVER.map((n) => (
            <button key={n.why} type="button" disabled={!!fly} className="ci-opt why" onClick={() => never(n.why)}>
              <b>{n.label}</b>
              {n.text}
            </button>
          ))}
        </div>
      )}

      <div className={`ci-toast card${toast ? " on" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </section>
  );
}
