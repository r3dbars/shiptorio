// The Next Move card: the one thing holding the factory back, and Spark's ask about it.
// Bottom center, always one card at a time (docs/PRODUCT.md).

import type { Bottleneck, Move, WebToServer } from "@shiptorio/shared";

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

export function NextMove({ move, bottleneck, send }: { move: Move | null | undefined; bottleneck: Bottleneck | null | undefined; send: (msg: WebToServer) => void }) {
  if (!move) {
    if (!bottleneck) return null;
    return (
      <section className="card nextmove quiet" aria-label="Bottleneck">
        <div className="nm-head">
          <span className="nm-kicker">BOTTLENECK · {STAGE_LABEL[bottleneck.stage].toUpperCase()}</span>
        </div>
        <p className="psub">{bottleneck.summary}</p>
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
