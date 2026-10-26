// The support well's panel: every customer conversation, what it was sorted as, what it's linked to, and the
// reply drafted for it. Nothing reaches a customer until you tap Send on the draft you're reading
// (docs/context/support-mine.md). Editing a draft saves a new one; Send always names the draft on screen.

import { useEffect, useState } from "react";
import type { FactoryState, Move, SupportTicket, WebToServer } from "@shiptorio/shared";

/** Summary cards can open review, never send a hidden remainder of a draft. */
export function supportReviewTarget(message: WebToServer, deck: Move[]): string | null {
  if (message.type !== "choose_move") return null;
  const action = deck.find(m => m.id === message.moveId)?.options.find(o => o.id === message.optionId)?.actions[0];
  return action?.tool === "review_customer_reply" && typeof action.args.ticketId === "string" ? action.args.ticketId : null;
}

const KIND_TAG: Record<string, [string, string]> = { bug: ["red", "bug"], feature: ["green", "feature"], question: ["blue", "question"], praise: ["green", "thanks"], spam: ["steel", "spam"] };
const ORDER: Record<SupportTicket["state"], number> = { drafted: 0, new: 1, waiting_fix: 2, answered: 3, closed: 4 };
const STATE_WORD: Record<SupportTicket["state"], string> = { new: "reading it", drafted: "reply ready", waiting_fix: "waiting on the fix", answered: "answered", closed: "closed" };

function ago(at: number) {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  return s < 90 ? "just now" : s < 5400 ? `${Math.round(s / 60)}m ago` : s < 129600 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
}

export function SupportPanel({ state, send, onClose, reviewTicket }: { state: FactoryState; send: (m: WebToServer) => void; onClose: () => void; reviewTicket?: string | null }) {
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  // replies waiting on you first, the customer who's waited longest on top; finished threads newest first
  const tickets = [...(state.support ?? [])].sort((a, b) => ORDER[a.state] - ORDER[b.state] || (ORDER[a.state] < 2 ? a.receivedAt - b.receivedAt : b.receivedAt - a.receivedAt));
  const waiting = tickets.filter((t) => t.state === "drafted").length;
  const [open, setOpen] = useState<string | null>(reviewTicket ?? tickets[0]?.id ?? null);
  useEffect(() => {
    if (!open && tickets[0]) setOpen(tickets[0].id);
  }, [open, tickets]);
  useEffect(() => { if (reviewTicket) setOpen(reviewTicket); }, [reviewTicket]);
  const status = state.sources?.find((s) => s.kind === "email");
  return (
    <section className="card stationpanel support" aria-label="Support well">
      <div className="sp-head">
        <span className="sp-zone">mine · customers</span>
        <button type="button" className="sp-close" onClick={onClose} aria-label="Close and zoom back out">
          ×
        </button>
      </div>
      <div className="sp-name">
        <span className="ptitle small">Support well</span>
        {waiting > 0 && <span className="sp-tag amber">{waiting} waiting on you</span>}
      </div>
      <p className="sp-what">Customer emails and chats come up here. Each one is sorted and gets a reply drafted. Nothing is sent until you tap Send.</p>
      {!tickets.length && <p className="sp-empty">{status?.state === "connected" ? "No customer mail yet." : "Not connected yet."}</p>}
      <ul className="su-list">
        {tickets.slice(0, 12).map((t) => (
          <Ticket key={t.id} t={t} open={open === t.id} onOpen={() => setOpen(open === t.id ? null : t.id)} state={state} send={send} />
        ))}
      </ul>
    </section>
  );
}

function Ticket({ t, open, onOpen, state, send }: { t: SupportTicket; open: boolean; onOpen: () => void; state: FactoryState; send: (m: WebToServer) => void }) {
  const [text, setText] = useState(t.draft?.text ?? "");
  const [copied, setCopied] = useState(false);
  useEffect(() => setText(t.draft?.text ?? ""), [t.draft?.hash, t.draft?.text]);
  const edited = !!t.draft && text.trim() !== t.draft.text;
  const linked = state.items.find((i) => i.id === t.triage?.linkedItemId);
  const [color, tag] = KIND_TAG[t.triage?.kind ?? ""] ?? ["steel", "new"];
  const outbox = [...t.sent].reverse().find((s) => s.via === "outbox" && s.text);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(outbox!.text!);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <li className={`su-t${open ? " open" : ""}`}>
      <button type="button" className="su-row" onClick={onOpen} aria-expanded={open}>
        <span className={`sp-tag ${color}`}>{tag}</span>
        <span className="txt">
          <b>{t.name?.split(/\s+/)[0] ?? t.from.split("@")[0]}</b> {t.triage?.summary ?? t.subject}
        </span>
        <span className={`st${t.state === "drafted" ? " hot" : ""}`}>{STATE_WORD[t.state]}</span>
      </button>
      {open && (
        <div className="su-body">
          <p className="su-quote">
            “{t.body.length > 280 ? `${t.body.slice(0, 279)}…` : t.body}”
            <small>
              {t.channel === "intercom" ? "Intercom" : "email"} · {ago(t.receivedAt)}
              {t.messages > 1 ? ` · ${t.messages} messages` : ""}
              {t.paying ? " · paying" : ""}
            </small>
          </p>
          {t.triage && <p className="su-why">{t.triage.reason}</p>}
          {linked && (
            <p className="su-link">
              Same as <b>{linked.title}</b> ({linked.state === "launched" ? "shipped" : linked.state.replace("_", " ")})
            </p>
          )}
          {t.issue && !linked && <p className="su-link">Filed as issue #{t.issue.number}</p>}
          {t.draft && t.state === "drafted" && (
            <>
              <label className="su-h" htmlFor={`draft-${t.id}`}>
                {t.draft.purpose === "fixed" ? "“It's fixed” reply" : "Drafted reply"}
                {t.draft.by === "player" ? " (your edit)" : ""}
              </label>
              <p className="su-destination">To: {t.channel === "intercom" ? `Intercom conversation ${t.thread}` : t.from}</p>
              <textarea id={`draft-${t.id}`} className="su-draft" value={text} maxLength={4000} rows={6} onChange={(e) => setText(e.target.value)} />
              <div className="sp-actions">
                {edited ? (
                  <button type="button" className="btn rec" disabled={!text.trim()} onClick={() => send({ type: "edit_reply", ticketId: t.id, text: text.trim() })}>
                    Save my edit
                  </button>
                ) : (
                  <button type="button" className="btn rec" onClick={() => send({ type: "send_reply", ticketId: t.id, draftHash: t.draft!.hash })}>
                    Send reply<span className="sugg">Suggested</span>
                  </button>
                )}
              </div>
            </>
          )}
          {outbox && (
            <div className="sp-actions">
              <button type="button" className="btn" onClick={copy}>
                {copied ? "Copied" : "Copy the reply (no mail sender yet)"}
              </button>
            </div>
          )}
          <div className="su-more">
            {t.triage?.kind === "bug" && !t.triage.linkedItemId && !t.issue && t.state !== "closed" && (
              <button type="button" className="btn" onClick={() => send({ type: "file_issue", ticketId: t.id })}>
                File as an issue
              </button>
            )}
            {t.state !== "closed" && t.state !== "answered" && (
              <button type="button" className="btn" onClick={() => send({ type: "close_ticket", ticketId: t.id })}>
                Close
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
