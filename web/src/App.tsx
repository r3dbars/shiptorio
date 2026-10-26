import { useMemo } from "react";
import type { Item } from "@shiptorio/shared";
import { FactoryMap } from "./map/FactoryMap";
import { css, KIND_COLOR } from "./map/palette";
import { readConfig } from "./source";
import { SCENARIOS } from "./sim/engine";
import { useFactory } from "./store";

const STATE_LABEL: Record<Item["state"], string> = {
  ore: "ore",
  queued: "queued",
  working: "assembling",
  inspecting: "inspecting",
  rejected: "rework",
  passed: "passed",
  on_pad: "on the pad",
  launched: "launched",
};

export function App() {
  const cfg = useMemo(() => readConfig(), []);
  const { state, log, status, send } = useFactory(cfg);
  const items = state?.items ?? [];
  const pad = items.filter((i) => i.state === "on_pad" || i.state === "passed");
  const inFlight = items.filter((i) => !["on_pad", "passed", "launched"].includes(i.state));

  return (
    <div className="app">
      <header className="hud bar">
        <span className="title">Shiptorio</span>
        <span className="repo">{cfg.kind === "sim" ? `sim · ${cfg.scenario}` : cfg.repo}</span>
        <div className="science" aria-label="Science">
          {(["red", "green", "grey", "blue"] as const).map((k) => (
            <span key={k} className={`sci ${k}`} title={`${k} science`}>
              <i aria-hidden="true" />
              {state?.science[k] ?? 0}
            </span>
          ))}
        </div>
        <div className="trust" title="Trust">
          <span>trust</span>
          <div className="meter">
            <div style={{ width: `${Math.round((state?.trust ?? 0) * 100)}%` }} />
          </div>
        </div>
        <span className={`status ${status}`}>● {status}</span>
      </header>

      <main className="floor">
        <FactoryMap state={state} />
        {cfg.kind === "sim" && (
          <nav className="hud scenarios" aria-label="Scenarios">
            {Object.keys(SCENARIOS).map((name) => (
              <a key={name} href={`?source=sim&scenario=${name}`} aria-current={name === cfg.scenario ? "page" : undefined}>
                {name}
              </a>
            ))}
          </nav>
        )}
      </main>

      <aside className="side">
        <section className="hud panel">
          <h2>Launch pad</h2>
          {pad.length === 0 && <p className="empty">Nothing on the pad.</p>}
          <ul>
            {pad.map((i) => (
              <li key={i.id} className="row">
                <i className="dot" style={{ background: css(KIND_COLOR[i.kind]) }} aria-hidden="true" />
                <span className="grow">
                  #{i.prNumber} {i.title}
                </span>
                {cfg.kind === "sim" ? (
                  <button type="button" onClick={() => send({ type: "launch_pr", itemId: i.id })}>
                    Launch
                  </button>
                ) : (
                  <a className="btn" href={i.prUrl} target="_blank" rel="noreferrer">
                    Merge
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
        <section className="hud panel">
          <h2>On the line</h2>
          {inFlight.length === 0 && <p className="empty">The line is quiet.</p>}
          <ul>
            {inFlight.map((i) => (
              <li key={i.id} className="row" title={i.failure}>
                <i className="dot" style={{ background: css(KIND_COLOR[i.kind]) }} aria-hidden="true" />
                <span className="grow">{i.title}</span>
                <span className={`tag ${i.state}`}>{STATE_LABEL[i.state]}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="hud panel log">
          <h2>Log</h2>
          <ol>
            {[...log].reverse().map((l, n) => (
              <li key={`${l.at}-${n}`} className={l.level}>
                {l.text}
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </div>
  );
}
