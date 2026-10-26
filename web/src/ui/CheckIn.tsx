// The check-in: Spark's next 8 to 12 moves as a deck you swipe through (docs/PRODUCT.md "Check-in").
// Right = do it (Spark's pick), left = later, down = never (+ one tap on why), up = details, tap = zoom.
// Every gesture also has a button and an arrow key.

import { useEffect, useRef, useState } from "react";
import type { Autonomy, Move, WebToServer } from "@shiptorio/shared";

type Gesture = "right" | "left" | "down" | "up";
type Why = Extract<WebToServer, { type: "dismiss_move" }>["why"];

const NEVER: { why: Why; label: string; text: string }[] = [
  { why: "once", label: "JUST THIS ONE", text: "Drop it, no rule." },
  { why: "kind", label: "NOT THIS KIND", text: "Stop dealing cards like this. It gets saved as a rule." },
  { why: "spark", label: "HANDLE THESE FOR ME", text: "Do this kind without asking me. Counts as trust." },
  { why: "wrong", label: "WRONG CALL", text: "Misread. It becomes a scar so the next read is better." },
];

const STAMP: Record<Gesture, string> = { right: "DO IT", left: "LATER", down: "NEVER", up: "DETAILS" };
const SWIPE_PX = 90;

interface Props {
  deck: Move[];
  autonomy?: Autonomy;
  send: (msg: WebToServer) => void;
  onFocus: (id: string | null) => void; // the map zooms to the card's spot
  onClose: () => void;
}

const pickOf = (m: Move) => m.options.find((o) => o.recommended) ?? m.options[0];

function dirOf(dx: number, dy: number, min: number): Gesture | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < min) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

export function CheckIn({ deck, autonomy, send, onFocus, onClose }: Props) {
  const [gone, setGone] = useState<Set<string>>(new Set()); // swiped, waiting for the server to drop them
  const [sheet, setSheet] = useState<"details" | "never" | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const [fly, setFly] = useState<Gesture | null>(null);
  const [tally, setTally] = useState({ yes: 0, later: 0, never: 0, rules: 0, grows: [] as string[] });
  const [toast, setToast] = useState<string | null>(null);
  const start = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const firstDeal = useRef(deck.length);

  const cards = deck.filter((m) => !gone.has(m.id));
  const top = cards[0];

  // Forget swiped ids once the server has dropped them, so a deferred card can come back around.
  useEffect(() => {
    setGone((g) => {
      const live = new Set(deck.map((m) => m.id));
      const next = new Set([...g].filter((id) => live.has(id)));
      return next.size === g.size ? g : next;
    });
  }, [deck]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1700);
    return () => clearTimeout(t);
  }, [toast]);

  // A new top card starts zoomed out.
  useEffect(() => {
    setZoomed(false);
    onFocus(null);
  }, [top?.id]);

  const done = (m: Move, g: Gesture, then: () => void) => {
    setFly(g);
    setSheet(null);
    setTimeout(() => {
      setGone((s) => new Set(s).add(m.id));
      setFly(null);
      setDrag(null);
      then();
    }, 260);
  };

  const choose = (m: Move, optionId: string) =>
    done(m, "right", () => {
      send({ type: "choose_move", moveId: m.id, optionId });
      const o = m.options.find((x) => x.id === optionId);
      setTally((t) => ({ ...t, yes: t.yes + 1, grows: o?.recommended ? [...t.grows, ...(m.grows ?? [])] : t.grows }));
      setToast(o ? `${o.label}. On it.` : "On it.");
    });

  const act = (g: Gesture) => {
    if (!top) return;
    if (g === "up") return setSheet("details");
    if (g === "down") return setSheet("never");
    if (g === "right") return choose(top, pickOf(top).id); // a locked card's pick is the missing check, never a merge
    done(top, "left", () => {
      send({ type: "defer_move", moveId: top.id });
      setTally((t) => ({ ...t, later: t.later + 1 }));
      setToast("Later. It'll come back around.");
    });
  };

  const never = (why: Why) => {
    if (!top) return;
    done(top, "down", () => {
      send({ type: "dismiss_move", moveId: top.id, why });
      setTally((t) => ({ ...t, never: t.never + 1, rules: t.rules + (why === "once" ? 0 : 1) }));
      setToast(why === "once" ? "Gone." : why === "kind" ? "Rule saved. No more cards like it." : why === "spark" ? "Handled without asking from now on." : "Scar logged.");
    });
  };

  const toggleZoom = () => {
    if (!top) return;
    const on = !zoomed;
    setZoomed(on);
    onFocus(on ? top.focus ?? null : null);
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") return sheet ? setSheet(null) : onClose();
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
    start.current = { x: e.clientX, y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) s.moved = true;
    if (s.moved) setDrag({ dx, dy });
  };
  const up = () => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    if (!s.moved) return toggleZoom();
    const g = drag && dirOf(drag.dx, drag.dy, SWIPE_PX);
    setDrag(null);
    if (g) act(g);
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
    <section className={`checkin${zoomed ? " zoomed" : ""}`} aria-label="Check-in">
      <header className="ci-bar card">
        <b>Check-in</b>
        <span className="ci-count">{top ? `${cards.length} left` : "All clear"}</span>
        <div className="ci-pips" aria-hidden="true">
          {Array.from({ length: Math.min(12, total) }, (_, i) => (
            <i key={i} className={i < swiped ? "done" : i === swiped && top ? "cur" : ""} />
          ))}
        </div>
        <button type="button" className="ci-x" onClick={onClose} aria-label="Close the check-in">
          ×
        </button>
      </header>

      {zoomed && top && <div className="ci-where">{top.focus ? "ZOOMED IN · TAP THE CARD TO COME BACK" : "TAP THE CARD TO COME BACK"}</div>}

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
                    {m.stage && <span className="ci-stage">{m.stage.toUpperCase()}</span>}
                  </div>
                  <div className="ci-title">{m.title}</div>
                  <p className="ci-why">{m.why}</p>
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
                  {m.locked && <div className="ci-lock">NO MERGE ON SWIPE · NOT PROVEN YET</div>}
                  <div className="ci-pick">
                    <span className="lbl">SUGGESTED · SWIPE RIGHT</span>
                    <span className="do">{pickOf(m).label}</span>
                    {m.options.length > 1 && <span className="alt">or: {m.options.filter((o) => o !== pickOf(m)).map((o) => o.label.toLowerCase()).join(", ")}</span>}
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
            <div className="ci-title">All clear</div>
            <p className="ci-why">{swiped ? `${swiped} calls. The factory's moving without you now.` : "Nothing needs you right now. A card shows up when something does."}</p>
            {swiped > 0 && (
              <div className="ci-tally">
                <div>
                  <b>{tally.yes}</b>pushed forward
                </div>
                <div>
                  <b>{tally.later}</b>back later
                </div>
                <div>
                  <b>{tally.grows.filter((g) => g.includes("CHECK") || g.includes("STATION")).length}</b>checks added
                </div>
                <div>
                  <b>{tally.rules}</b>rules taught
                </div>
              </div>
            )}
            {autonomy?.next && (
              <div className="ci-meter" title={`${autonomy.next.have}/${autonomy.next.need} ${autonomy.next.label}`}>
                <span>AUTONOMY → {autonomy.next.level.toUpperCase().replace("_", " ")}</span>
                <div className="segs">
                  {Array.from({ length: 10 }, (_, i) => (
                    <i key={i} style={i < Math.round((autonomy.next!.have / autonomy.next!.need) * 10) ? { background: "var(--blue)" } : undefined} />
                  ))}
                </div>
              </div>
            )}
            <p className="ci-quote">The score isn't how many you cleared. It's how few need you tomorrow.</p>
            <button type="button" className="nm-btn" onClick={onClose}>
              Back to the floor
            </button>
          </div>
        )}
      </div>

      {top && (
        <div className="ci-actions">
          <button type="button" className="ci-act never" onClick={() => act("down")}>
            <span className="k">✕</span>Never ↓
          </button>
          <button type="button" className="ci-act later" onClick={() => act("left")}>
            <span className="k">↶</span>Later ←
          </button>
          <button type="button" className="ci-act more" onClick={() => act("up")}>
            <span className="k">i</span>Details ↑
          </button>
          <button type="button" className="ci-act do" onClick={() => act("right")}>
            <span className="k">✓</span>Do it →
          </button>
        </div>
      )}

      {top && sheet === "details" && (
        <div className="ci-sheet card" role="dialog" aria-label="Details">
          <button type="button" className="ci-close" onClick={() => setSheet(null)}>
            CLOSE
          </button>
          <div className="ci-title small">{top.title}</div>
          {top.plan && (
            <>
              <div className="ci-sec">WHAT HAPPENS ON YES</div>
              <ol>
                {top.plan.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ol>
            </>
          )}
          <div className="ci-sec">PICK ONE</div>
          {top.options.map((o) => (
            <button key={o.id} type="button" className={o.recommended ? "ci-opt rec" : "ci-opt"} title={o.actions.map((a) => `${a.tool}: ${a.reason}`).join("\n") || undefined} onClick={() => choose(top, o.id)}>
              {o.recommended ? "★ " : ""}
              {o.label}
            </button>
          ))}
          {top.url && (
            <a className="nm-link" href={top.url} target="_blank" rel="noreferrer">
              Open on GitHub ↗
            </a>
          )}
        </div>
      )}

      {top && sheet === "never" && (
        <div className="ci-sheet card" role="dialog" aria-label="Never show this">
          <button type="button" className="ci-close" onClick={() => setSheet(null)}>
            CANCEL
          </button>
          <div className="ci-title small">Never: why? One tap.</div>
          {NEVER.map((n) => (
            <button key={n.why} type="button" className="ci-opt why" onClick={() => never(n.why)}>
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
