import { SparkSpendPanel } from "./SparkSpend";
// "How it thinks": the planner's decision log. Every call the factory's planner made, what it looked at,
// what it decided and why, and when a fixed rule had to stand in. This sheet is where the in-game
// credit lives (copy.ts CREDIT, docs/VISION.md principle 8).

import { scorecard, type Brain } from "@shiptorio/shared";
import { THINKS, WORDS } from "../copy";
import { Icon } from "./icons";

const pct = (v: number | null) => (v === null ? "–" : `${Math.round(v * 100)}%`);

const ago = (at: number) => {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
};

export function HowItThinks({ brain, onClose, repo }: { repo?: string; brain?: Brain; onClose: () => void }) {
  const total = (brain?.decisions ?? 0) + (brain?.fallbacks ?? 0);
  const share = total ? Math.round(((brain?.decisions ?? 0) / total) * 100) : 0;
  const simulated = brain?.thoughts.some((t) => t.simulated);
  const card = scorecard(brain);
  return (
    <section className="card sheet thinks" aria-label={THINKS.title}>
      <div className="sheet-top">
        <h2>{THINKS.title}</h2>
        <button type="button" className="hud-iconbtn" onClick={onClose} aria-label={WORDS.close}>
          <Icon name="cross" size={14} />
        </button>
      </div>
      <p className="empty">{THINKS.intro}</p>
      <SparkSpendPanel repo={repo} />
      <div className="thinks-stats">
        <div><b>{brain?.decisions ?? 0}</b>{THINKS.decisions}</div>
        <div><b>{share}%</b>{THINKS.byModel}</div>
        <div><b>{brain?.fallbacks ?? 0}</b>{THINKS.fallbacks}</div>
      </div>
      <h3>{THINKS.scorecard}</h3>
      <div className="thinks-stats score">
        <div><b>{pct(card.planSuccess)}</b>{THINKS.plansShipped}<small>{THINKS.ofTotal(card.shipped, card.plans)}</small></div>
        <div><b>{pct(card.catchRate)}</b>{THINKS.reviewCatches}<small>{THINKS.ofTotal(card.catches, card.reviews)}</small></div>
        <div><b>{pct(card.fallbackRate)}</b>{THINKS.ruleShare}</div>
      </div>
      {!brain?.online && !simulated && <p className="empty warn">{THINKS.noPower}</p>}
      <h3>{THINKS.latest(!!simulated)}</h3>
      {!brain?.thoughts.length && <p className="empty">{THINKS.empty}</p>}
      {brain?.thoughts.map((t) => (
        <div key={t.id} className={`think${t.by === "fallback" ? " rule" : ""}`}>
          <div className="think-top">
            <span className="think-verb">{THINKS.verb[t.decision]}</span>
            <span className="think-when">{t.by === "spark" ? `${(t.ms / 1000).toFixed(1)}s` : THINKS.rule} · {ago(t.at)}</span>
          </div>
          <div className="think-title">{t.title}</div>
          {t.outcome !== t.title && <div className="think-out">→ {t.outcome}</div>}
          <div className="think-why">“{t.reason}”</div>
        </div>
      ))}
      <a className="credit-btn" href="/art/spark.html" target="_blank" rel="noreferrer">
        {THINKS.credit(brain?.model && brain.model !== "sim" ? brain.model : undefined)}
      </a>
    </section>
  );
}
