// The research tree (docs/LOOP.md "Players add checks"): spend the science packs your shipped PRs earned on
// new gauntlet stations. Each one really runs on every PR, right after CI. Repeated scars put a "Suggested"
// tag on the tech that would have caught them.

import { sciencePacks, techById, techStatus, TECHS, type FactoryState, type Tech, type WebToServer } from "@shiptorio/shared";
import { Icon, type IconName } from "./icons";

const TIER_LABEL: Record<Tech["tier"], string> = {
  1: "Tier 1 · instant checks",
  2: "Tier 2 · stricter gates",
  3: "Tier 3 · real-world checks",
};

/** Something new to spend on: the flask glows. */
export function researchReady(state: FactoryState | null): boolean {
  if (!state) return false;
  return TECHS.some((t) => techStatus(t, state).state === "ready");
}

export function Research({ state, send, onClose, onResearched }: { state: FactoryState; send: (m: WebToServer) => void; onClose: () => void; onResearched: (tech: string) => void }) {
  const have = sciencePacks(state);
  const suggest = state.research?.suggest;
  const pick = suggest && techById(suggest.tech);
  const go = (tech: string) => {
    send({ type: "research", tech });
    onResearched(tech);
  };
  return (
    <section className="card sheet research" aria-label="Research">
      <div className="sheet-top">
        <h2>Research</h2>
        <button type="button" className="hud-iconbtn" onClick={onClose} aria-label="Close">
          <Icon name="cross" size={14} />
        </button>
      </div>
      <div className="rs-packs">
        <span className="rs-flask">
          <Icon name="flask" size={22} />
        </span>
        <span>
          <b>{have}</b> science pack{have === 1 ? "" : "s"}
          <small>Every PR you ship is one. Spend them on new checks.</small>
        </span>
      </div>
      {pick && techStatus(pick, state).state !== "done" && (
        <div className="rs-pick">
          <span className="rs-tag">Suggested</span>
          <p>{suggest.why}</p>
        </div>
      )}
      <div className="rs-tree">
        {([1, 2, 3] as const).map((tier) => (
          <div className="rs-tier" key={tier}>
            <h3>{TIER_LABEL[tier]}</h3>
            {TECHS.filter((t) => t.tier === tier).map((t) => {
              const st = techStatus(t, state);
              const picked = suggest?.tech === t.id && st.state !== "done";
              return (
                <div key={t.id} className={`rs-node ${st.state}${picked ? " picked" : ""}`}>
                  <span className="rs-ico" aria-hidden="true">
                    <Icon name={(st.state === "locked" ? "lock" : t.icon) as IconName} size={22} />
                  </span>
                  <span className="rs-body">
                    <span className="rs-name">
                      {t.name}
                      {picked && <em>Suggested</em>}
                    </span>
                    <span className="rs-what">{t.what}</span>
                    <span className="rs-catch">Catches {t.catches}</span>
                  </span>
                  {st.state === "ready" ? (
                    <button type="button" className={`btn${picked ? " rec" : ""} rs-go`} onClick={() => go(t.id)}>
                      Research
                      <small>
                        <Icon name="flask" size={10} /> {t.cost}
                      </small>
                    </button>
                  ) : st.state === "done" ? (
                    <span className="pill rs-done">
                      <Icon name="check" size={10} /> Running
                    </span>
                  ) : (
                    <span className="rs-why">
                      {st.state === "short" && (
                        <b>
                          <Icon name="flask" size={10} /> {t.cost}
                        </b>
                      )}
                      {st.why}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
