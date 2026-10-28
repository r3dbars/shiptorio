// docs/LEARN.md: the "teach the factory" meter on a card. One dot per yes in a row on this kind of card; fill them all
// and the factory does these on its own from then on. Later, Edit or a dismiss empties it again.

import type { Move } from "@shiptorio/shared";
import { LEARN } from "../copy";

export function LearnDots({ learn }: { learn: Move["learn"] }) {
  if (!learn) return null;
  const left = Math.max(1, learn.need - learn.have);
  return (
    <span className="learndots" role="img" aria-label={LEARN.aria(learn.have, learn.need, left)}>
      <span className="dots" aria-hidden="true">
        {Array.from({ length: learn.need }, (_, i) => <i key={i} className={i < learn.have ? "on" : undefined} />)}
      </span>
      <span className="ln" aria-hidden="true">{LEARN.line(left)}</span>
    </span>
  );
}
