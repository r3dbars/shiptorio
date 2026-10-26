// The Next Move card: the one thing holding the factory back, and the ask about it.
// Above the dock, always one card at a time (docs/PRODUCT.md). The recommended option says "Suggested".

import type { Bottleneck, Move, Station, WebToServer } from "@shiptorio/shared";
import { lc } from "../sim/engine";
import { Icon } from "./icons";

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
  // live: "Connect a local agent" is a setup step on this machine, not a server action, so it opens Power
  onPower?: () => void;
}

const plugsInAgent = (o: Move["options"][number]) => o.actions.some((a) => a.tool === "connect_source" && (a.args.kind === "claude" || a.args.kind === "codex"));

export function NextMove({ move, bottleneck, stations, send, onOpen, onPower }: Props) {
  if (!move) {
    if (!bottleneck) return null;
    const st = stations?.find((x) => x.id === bottleneck.stationId);
    return (
      <section className="card nextmove quiet" aria-label="Bottleneck">
        <div className="nm-head">
          <span className="nm-kicker">Bottleneck · {st?.name ?? STAGE_LABEL[bottleneck.stage]}</span>
        </div>
        <p className="nm-why">{bottleneck.summary}</p>
        {st && onOpen && (
          <div className="nm-options">
            <button type="button" className="btn" onClick={() => onOpen(st.id)}>
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
        <span className="nm-kicker">
          <Icon name="star" size={14} />
          Next move
        </span>
        {stage && <span className="nm-stage">{STAGE_LABEL[stage]}</span>}
      </div>
      <div className="nm-title">{move.title}</div>
      <p className="nm-why">{move.why}</p>
      {!!move.plan?.length && (
        <details className="nm-plan">
          <summary>Review plan and files</summary>
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
            onClick={() => (onPower && plugsInAgent(o) ? onPower() : send({ type: "choose_move", moveId: move.id, optionId: o.id }))}
          >
            {o.label}
            {o.recommended && <span className="sugg">Suggested</span>}
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
