// The floor card and the ticker, laid out like the Black Iron mockup (docs/black-iron.html #hud and #ticker):
// top left, THE FACTORY FLOOR over SHIPTORIO in pixel type, one row of numbers (a dim pixel label, a bold mono number),
// then the colored key of what rides the belts. Bottom left, the last lines of the floor log, colored by kind.

import type { ReactNode } from "react";
import type { LogLine } from "../store";
import { HUD } from "../copy";
import { Wordmark } from "./Logo";

export interface Count {
  key: string;
  label: string;
  value: ReactNode;
  tone?: "ship" | "rw" | "need" | "aether" | "amber";
  title?: string;
  desk?: boolean; // wide screens only
}

const F = HUD.floor;

export function FloorCard({ counts, extra, showKey, repo }: { counts: Count[]; extra?: ReactNode; showKey: boolean; repo?: string }) {
  return (
    <section className="floorcard" aria-label={F.label}>
      <span className="eyebrow">{F.eyebrow}</span>
      <h1>
        <Wordmark width={250} />
        {repo && <span className="sr">: {repo}</span>}
      </h1>
      {counts.length > 0 && (
        <dl className="counts">
          {counts.map((c) => (
            <div key={c.key} className={[c.tone, c.desk && "desk"].filter(Boolean).join(" ") || undefined} title={c.title}>
              <dt>{c.label}</dt>
              <dd>{c.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {showKey && (
        <div className="fkey" role="img" aria-label={`${F.keyLabel}: ${F.key.issue}, ${F.key.cards}, ${F.key.pr}, ${F.key.ships}, ${F.key.rework}`}>
          <span><i className="k-issue" />{F.key.issue}</span>›<span><i className="k-cards" />{F.key.cards}</span>›<span><i className="k-pr" />{F.key.pr}</span>›<span><i className="k-pass" />{F.key.ships}</span>
          <span><i className="k-rej" />{F.key.rework}</span>
        </div>
      )}
      {extra && <div className="fc-extra">{extra}</div>}
    </section>
  );
}

// A log line's color, the way the mockup's ticker paints them: in (new work), good, bad, warn, ship.
export function tickKind(l: LogLine): "in" | "good" | "bad" | "warn" | "ship" | "info" {
  if (l.level === "error") return "bad";
  if (l.level === "warn") return "warn";
  if (l.level === "success") return /launch|ship|merged|rocket/i.test(l.text) ? "ship" : "good";
  return /\b(mined|new|arriv|dug|ore|issue|error|signal)\b/i.test(l.text) ? "in" : "info";
}

export function Ticker({ log, className }: { log: LogLine[]; className?: string }) {
  const rows = log.slice(-3).reverse();
  return (
    <div className={`ticker${className ? ` ${className}` : ""}`} role="log" aria-label={HUD.ticker.label}>
      {rows.length === 0 ? <div className="k-in">{HUD.ticker.idle}</div> : rows.map((l) => <div key={`${l.at}-${l.text}`} className={`k-${tickKind(l)}`}>{l.text}</div>)}
    </div>
  );
}
