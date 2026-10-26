// "How it thinks": the planner's decision log. Every call the factory's planner made, what it looked at,
// what it decided and why, and when a fixed rule had to stand in. This sheet is where the one
// "powered by Meta Muse Spark" credit lives (docs/VISION.md principle 8).

import { scorecard, type Brain, type ThoughtDecision } from "@shiptorio/shared";
import { Icon } from "./icons";

const VERB: Record<ThoughtDecision, string> = {
  triage: "Sorted",
  scope: "Picked files",
  plan: "Planned",
  review: "Reviewed",
  next_move: "Chose your next card",
  rank: "Ranked your cards",
  orbit: "Judged a comeback",
  research: "Picked a check",
  permit: "Weighed a permit",
};

const pct = (v: number | null) => (v === null ? "–" : `${Math.round(v * 100)}%`);

const ago = (at: number) => {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
};

export function HowItThinks({ brain, onClose }: { brain?: Brain; onClose: () => void }) {
  const total = (brain?.decisions ?? 0) + (brain?.fallbacks ?? 0);
  const share = total ? Math.round(((brain?.decisions ?? 0) / total) * 100) : 0;
  const simulated = brain?.thoughts.some((t) => t.simulated);
  const card = scorecard(brain);
  return (
    <section className="card sheet thinks" aria-label="How it thinks">
      <div className="sheet-top">
        <h2>How it thinks</h2>
        <button type="button" className="hud-iconbtn" onClick={onClose} aria-label="Close">
          <Icon name="cross" size={14} />
        </button>
      </div>
      <p className="empty">
        One model sorts your work, plans every job, reviews every PR and picks your next card. Your Claude or ChatGPT
        sign-ins build what it plans. It never writes code or skips a check.
      </p>
      <div className="thinks-stats">
        <div><b>{brain?.decisions ?? 0}</b>decisions</div>
        <div><b>{share}%</b>made by the model</div>
        <div><b>{brain?.fallbacks ?? 0}</b>rule fallbacks</div>
      </div>
      <h3>Scorecard</h3>
      <div className="thinks-stats score">
        <div><b>{pct(card.planSuccess)}</b>plans shipped<small>{card.shipped} of {card.plans}</small></div>
        <div><b>{pct(card.catchRate)}</b>reviews caught a problem<small>{card.catches} of {card.reviews}</small></div>
        <div><b>{pct(card.fallbackRate)}</b>calls a rule had to make</div>
      </div>
      {!brain?.online && !simulated && <p className="empty warn">The planner has no power right now, so fixed rules are standing in.</p>}
      <h3>Latest calls{simulated ? " · sim" : ""}</h3>
      {!brain?.thoughts.length && <p className="empty">Nothing yet. Decisions show up here as work comes in.</p>}
      {brain?.thoughts.map((t) => (
        <div key={t.id} className={`think${t.by === "fallback" ? " rule" : ""}`}>
          <div className="think-top">
            <span className="think-verb">{VERB[t.decision]}</span>
            <span className="think-when">{t.by === "spark" ? `${(t.ms / 1000).toFixed(1)}s` : "rule"} · {ago(t.at)}</span>
          </div>
          <div className="think-title">{t.title}</div>
          {t.outcome !== t.title && <div className="think-out">→ {t.outcome}</div>}
          <div className="think-why">“{t.reason}”</div>
        </div>
      ))}
      <a className="credit-btn" href="/art/spark.html" target="_blank" rel="noreferrer">How Meta Muse Spark runs Shiptorio →</a>
      <p className="credit">powered by Meta Muse Spark{brain?.model && brain.model !== "sim" ? ` · ${brain.model}` : ""}</p>
    </section>
  );
}
