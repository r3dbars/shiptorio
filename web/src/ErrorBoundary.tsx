import * as Sentry from "@sentry/react";
import type { ReactNode } from "react";
import { CRASH } from "./copy";
import "./crash.css";

// A pixel pressure gauge pegged in the red, its needle rattling (steady under reduced motion).
function Gauge() {
  return (
    <svg className="crash-gauge" viewBox="0 0 36 36" aria-hidden="true" focusable="false">
      <rect x="4" y="4" width="28" height="28" fill="#000" />
      <rect x="6" y="6" width="24" height="24" fill="#d0a24e" />
      <rect x="8" y="8" width="20" height="20" fill="#f4ead8" />
      <rect x="8" y="8" width="20" height="2" fill="#b8a48a" />
      <rect x="22" y="10" width="6" height="6" fill="#ff4a32" />
      <rect x="10" y="12" width="2" height="2" fill="#140e0a" />
      <rect x="16" y="10" width="2" height="2" fill="#140e0a" />
      <rect x="10" y="20" width="2" height="2" fill="#140e0a" />
      <g className="crash-needle"><rect x="18" y="14" width="2" height="8" fill="#140e0a" transform="rotate(45 18 22)" /></g>
      <rect x="16" y="20" width="4" height="4" fill="#140e0a" />
      <rect x="14" y="0" width="8" height="4" fill="#5a4434" />
      <rect x="6" y="32" width="4" height="4" fill="#5a4434" />
      <rect x="26" y="32" width="4" height="4" fill="#5a4434" />
    </svg>
  );
}

export function Crash({ eventId }: { eventId?: string }) {
  return (
    <main className="crash">
      <section role="alert" className="crash-plate iron-plate iron-rivets" aria-labelledby="crash-title">
        <div className="crash-stripe" aria-hidden="true" />
        <div className="crash-head">
          <span className="iron-eyebrow">{CRASH.eyebrow}</span>
          <span className="iron-state" data-s="BLOCKED">{CRASH.state}</span>
        </div>
        <div className="crash-body">
          <Gauge />
          <div>
            <h1 id="crash-title">{CRASH.title}</h1>
            <p>{CRASH.body}</p>
            <p className="crash-hint">{CRASH.hint}</p>
            <button type="button" className="iron-btn primary" onClick={() => location.reload()}>{CRASH.restart}</button>
            {eventId ? <div className="crash-ref">{CRASH.ref(eventId)}</div> : null}
          </div>
        </div>
      </section>
    </main>
  );
}

export function ErrorBoundary({ children }: { children: ReactNode }) {
  return <Sentry.ErrorBoundary fallback={({ eventId }) => <Crash eventId={eventId} />}>{children}</Sentry.ErrorBoundary>;
}
