// The Next Move card: the one thing holding the factory back, and the ask about it.
// Above the dock, always one card at a time (docs/PRODUCT.md). The recommended option says "Suggested".

import { because } from "./because";
import type { Bottleneck, Move, Station, WebToServer } from "@shiptorio/shared";
import { lc } from "../sim/engine";
import { NEXT_MOVE, STAGE_LABEL, WORDS } from "../copy";
import { Icon } from "./icons";

interface Props {
  move: Move | null | undefined;
  bottleneck: Bottleneck | null | undefined;
  stations?: Station[];
  send: (msg: WebToServer) => void;
  onOpen?: (stationId: string) => void; // open the bottleneck station's panel
}

export function NextMove({ move, bottleneck, stations, send, onOpen }: Props) {
  if (!move) {
    if (!bottleneck) return null;
    const st = stations?.find((x) => x.id === bottleneck.stationId);
    return (
      <section className="card nextmove quiet" aria-label={NEXT_MOVE.bottleneck}>
        <div className="nm-head">
          <span className="nm-kicker">{NEXT_MOVE.bottleneckAt(st?.name ?? STAGE_LABEL[bottleneck.stage])}</span>
        </div>
        <p className="nm-why">{bottleneck.summary}</p>
        {st && onOpen && (
          <div className="nm-options">
            <button type="button" className="btn" onClick={() => onOpen(st.id)}>
              {NEXT_MOVE.open(lc(st.name))}
            </button>
          </div>
        )}
      </section>
    );
  }
  const stage = move.stage ?? bottleneck?.stage;
  return (
    <section className="card nextmove" aria-label={NEXT_MOVE.label} aria-live="polite">
      <div className="nm-head">
        <span className="nm-kicker">
          <Icon name="star" size={14} />
          {NEXT_MOVE.label}
        </span>
        {stage && <span className="nm-stage">{STAGE_LABEL[stage]}</span>}
      </div>
      <div className="nm-title">{move.title}</div>
      <p className="nm-why">{move.why}</p>
      {because(move) && <p className="why-line"><b>Why:</b> {because(move)}</p>}
      {!!move.plan?.length && (
        <details className="nm-plan">
          <summary>{NEXT_MOVE.plan}</summary>
          <ol>{move.plan.map((step, i) => <li key={i}>{step}</li>)}</ol>
        </details>
      )}
      <div className="nm-options">
        {move.options.map((o) => (
          <button
            key={o.id}
            type="button"
            className={o.recommended ? "btn rec" : "btn"}
            title={o.actions.map((a) => `${a.tool}: ${a.reason}`).join("\n") || undefined}
            onClick={() => send({ type: "choose_move", moveId: move.id, optionId: o.id })}
          >
            {o.label}
            {o.recommended && <span className="sugg">{WORDS.suggested}</span>}
          </button>
        ))}
        {move.url && (
          <a className="nm-link" href={move.url} target="_blank" rel="noreferrer">
            {WORDS.prLink}
          </a>
        )}
      </div>
    </section>
  );
}
