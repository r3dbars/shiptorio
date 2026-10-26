// The Next Move card: the one thing holding the factory back, and Spark's ask about it.
// Bottom center, always one card at a time (docs/PRODUCT.md).

import type { Bottleneck, Move, Station, WebToServer } from "@shiptorio/shared";
import { lc } from "../sim/engine";

const STAGE_LABEL: Record<Bottleneck["stage"], string> = {
  intake: "intake",
  triage: "triage",
  build: "build",
  inspect: "inspector",
  pad: "launch pad",
  release: "release",
  impact: "impact",
  power: "power",
  resources: "no power",
};

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
      <section className="card nextmove quiet" aria-label="Bottleneck">
        <div className="nm-head">
          <span className="nm-kicker">BOTTLENECK · {(st?.name ?? STAGE_LABEL[bottleneck.stage]).toUpperCase()}</span>
        </div>
        <p className="psub">{bottleneck.summary}</p>
        {st && onOpen && (
          <div className="nm-options">
            <button type="button" className="nm-btn" onClick={() => onOpen(st.id)}>
              Open the {lc(st.name)}
            </button>
          </div>
        )}
      </section>
    );
  }
  const stage = move.stage ?? bottleneck?.stage;
  return (
    <section className="card nextmove" aria-label="Next move" aria-live="polite">
      <div className="nm-head">
        <span className="nm-kicker">SPARK · NEXT MOVE</span>
        {stage && <span className="nm-stage">{STAGE_LABEL[stage].toUpperCase()}</span>}
      </div>
      <div className="nm-title">{move.title}</div>
      <p className="nm-why">{move.why}</p>
      <div className="nm-options">
        {move.options.map((o) => (
          <button
            key={o.id}
            type="button"
            className={o.recommended ? "nm-btn rec" : "nm-btn"}
            title={o.actions.map((a) => `${a.tool}: ${a.reason}`).join("\n") || undefined}
            onClick={() => send({ type: "choose_move", moveId: move.id, optionId: o.id })}
          >
            {o.label}
          </button>
        ))}
        {move.url && (
          <a className="nm-link" href={move.url} target="_blank" rel="noreferrer">
            PR ↗
          </a>
        )}
      </div>
    </section>
  );
}
