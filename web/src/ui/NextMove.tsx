// The needs-you tray (Black Iron mockup's #needs): one amber row per thing waiting on you, top center on a wide
// screen, just above the controls on a phone. The first row is the Next Move card (docs/PRODUCT.md), squeezed into
// the mockup's row: what it is, the ask, and its options as buttons, with the why and the plan one tap away.
// No card open, the row is the "what's next" pick (ui/whatsNext.ts), so the game never goes quiet after a rocket.

import { useState, type ReactNode } from "react";
import { because } from "./because";
import type { Bottleneck, Move, Station, WebToServer } from "@shiptorio/shared";
import { lc } from "../sim/engine";
import { HUD, NEXT_MOVE, STAGE_LABEL, THINKS, WORDS } from "../copy";
import { Icon } from "./icons";
import type { Nudge, NudgeAction } from "./whatsNext";

/** Another thing waiting on you: a blocked machine, the rest of the check-in deck. */
export interface NeedRow {
  key: string;
  label: string;
  text: string;
  go: { label: string; onClick: () => void; aria?: string };
}

interface Props {
  move: Move | null | undefined;
  bottleneck: Bottleneck | null | undefined;
  stations?: Station[];
  send: (msg: WebToServer) => void;
  onOpen?: (stationId: string) => void; // open the bottleneck station's panel
  onPower?: () => void; // live local-agent setup opens Power, never a server connector action
  nudge?: Nudge | null;
  onNudge?: (action: NudgeAction) => void;
  rows?: NeedRow[];
}

const plugsInAgent = (o: Move["options"][number]) => o.actions.some((a) => a.tool === "connect_source" && (a.args.kind === "claude" || a.args.kind === "codex"));
const N = HUD.needs;

export function NextMove({ move, bottleneck, stations, send, onOpen, onPower, nudge, onNudge, rows = [] }: Props) {
  const [open, setOpen] = useState(false);
  let first: ReactNode = null;
  if (move) {
    const stage = move.stage ?? bottleneck?.stage;
    const why = because(move);
    const more = !!why || !!move.plan?.length || !!move.url;
    first = (
      <section className={`nrow move${open ? " open" : ""}`} aria-label={NEXT_MOVE.label} aria-live="polite">
        <span className="ic" aria-hidden="true">!</span>
        <div className="tx">
          <b>
            {N.nextMove}
            {stage && <span className="nst"> · {STAGE_LABEL[stage]}</span>}
          </b>
          <span className="nt">{move.title}</span>
          <span className="nw">{move.why}</span>
          {open && (
            <div className="nx">
              {why && <p className="why-line"><b>{THINKS.why}</b> {why}</p>}
              {!!move.plan?.length && (
                <details className="nm-plan" open>
                  <summary>{NEXT_MOVE.plan}</summary>
                  <ol>{move.plan.map((step, i) => <li key={i}>{step}</li>)}</ol>
                </details>
              )}
              {move.url && (
                <a className="nm-link" href={move.url} target="_blank" rel="noreferrer">
                  {WORDS.prLink}
                </a>
              )}
            </div>
          )}
        </div>
        <div className="nb">
          {move.options.map((o) => (
            <button
              key={o.id}
              type="button"
              className={o.recommended ? "rec" : undefined}
              title={o.actions.map((a) => `${a.tool}: ${a.reason}`).join("\n") || undefined}
              onClick={() => (onPower && plugsInAgent(o) ? onPower() : send({ type: "choose_move", moveId: move.id, optionId: o.id }))}
            >
              {o.label}
              {o.recommended && <span className="sr">, {WORDS.suggested}</span>}
            </button>
          ))}
          {more && (
            <button type="button" className="tg" aria-expanded={open} aria-label={open ? N.lessLabel : N.moreLabel} onClick={() => setOpen((v) => !v)}>
              {open ? N.less : N.more}
            </button>
          )}
        </div>
      </section>
    );
  } else if (nudge && onNudge) {
    first = (
      <section className="nrow calm" aria-label={NEXT_MOVE.label} aria-live="polite" data-nudge={nudge.id}>
        <span className="ic" aria-hidden="true"><Icon name="star" size={12} /></span>
        <div className="tx">
          <b>
            {nudge.kicker}
            {nudge.grows && <span className="ngrow"> {nudge.grows}</span>}
          </b>
          <span className="nt">{nudge.title}</span>
          <span className="nw">{nudge.why}</span>
        </div>
        <div className="nb">
          <button type="button" className="rec" onClick={() => onNudge(nudge.cta.action)}>
            {nudge.cta.label}
            <span className="sr">, {WORDS.suggested}</span>
          </button>
          {nudge.alt && (
            <button type="button" onClick={() => onNudge(nudge.alt!.action)}>
              {nudge.alt.label}
            </button>
          )}
        </div>
      </section>
    );
  } else if (bottleneck) {
    const st = stations?.find((x) => x.id === bottleneck.stationId);
    first = (
      <section className="nrow calm" aria-label={NEXT_MOVE.bottleneck}>
        <span className="ic" aria-hidden="true">!</span>
        <div className="tx">
          <b>{NEXT_MOVE.bottleneckAt(st?.name ?? STAGE_LABEL[bottleneck.stage])}</b>
          <span className="nt">{bottleneck.summary}</span>
        </div>
        {st && onOpen && (
          <div className="nb">
            <button type="button" className="rec" onClick={() => onOpen(st.id)}>
              {NEXT_MOVE.open(lc(st.name))}
            </button>
          </div>
        )}
      </section>
    );
  }
  if (!first && !rows.length) return null;
  return (
    <div className="needs" role="group" aria-label={N.label}>
      {first}
      {rows.map((r) => (
        <div className="nrow" key={r.key}>
          <span className="ic" aria-hidden="true">!</span>
          <div className="tx">
            <b>{r.label}</b>
            <span className="nt">{r.text}</span>
          </div>
          <div className="nb">
            <button type="button" className="rec" onClick={r.go.onClick} aria-label={r.go.aria}>
              {r.go.label}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
