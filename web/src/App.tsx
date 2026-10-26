import { useEffect, useMemo, useState } from "react";
import type { FactoryState, Item, PowerSource } from "@shiptorio/shared";
import { FactoryMap } from "./map/FactoryMap";
import { css, KIND_COLOR } from "./map/palette";
import { readConfig } from "./source";
import { SCENARIOS } from "./sim/engine";
import { useFactory, type LogLine } from "./store";

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

const POWER_COLOR: Record<PowerSource["kind"], string> = { steam: "#f2a93b", solar: "#5bd18b", geothermal: "#ff7a2a" };

// A row of pixel segments, like the prototype's HUD meters.
function Segs({ value, max = 8, color }: { value: number; max?: number; color: string }) {
  const lit = Math.max(0, Math.min(max, Math.round(value)));
  return (
    <div className="segs" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={lit}>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} style={i < lit ? { background: color } : undefined} />
      ))}
    </div>
  );
}

// Big news from the floor log shows up as a caption for a few seconds.
function useCaption(log: LogLine[]) {
  const [caption, setCaption] = useState<{ title: string; sub: string } | null>({ title: "THE FACTORY MUST GROW", sub: "drag to pan · scroll to zoom" });
  const last = log[log.length - 1];
  useEffect(() => {
    if (!last || last.level === "info") return;
    const [title, ...rest] = last.text.split(": ");
    setCaption({ title: title.toUpperCase(), sub: rest.join(": ") });
  }, [last]);
  useEffect(() => {
    if (!caption) return;
    const t = setTimeout(() => setCaption(null), 2800);
    return () => clearTimeout(t);
  }, [caption]);
  return caption;
}

// Next free spot for a new assembler, stacked beside the existing ones.
function buildSlot(state: FactoryState) {
  const asm = state.machines.find((m) => m.type === "assembler");
  const x = asm?.x ?? 0;
  for (const y of [-2, 2, -4, 4, -6, 6]) {
    if (!state.machines.some((m) => Math.abs(m.x - x) < 2 && Math.abs(m.y - y) < 2)) return { x, y };
  }
  return null;
}

export function App() {
  const cfg = useMemo(() => readConfig(), []);
  const { state, log, status, send } = useFactory(cfg);
  const caption = useCaption(log);
  const [showLog, setShowLog] = useState(true);
  const items = state?.items ?? [];
  const pad = items.filter((i) => i.state === "on_pad" || i.state === "passed");
  const inFlight = items.filter((i) => !["on_pad", "passed", "launched"].includes(i.state));
  const shipped = state ? state.science.red + state.science.green + state.science.grey + state.science.blue : 0;

  const launch = () => {
    const next = pad.find((i) => i.state === "on_pad") ?? pad[0];
    if (!next) return;
    if (cfg.kind === "sim") send({ type: "launch_pr", itemId: next.id });
    else if (next.prUrl) window.open(next.prUrl, "_blank", "noreferrer");
  };
  const slot = state ? buildSlot(state) : null;
  const build = () => {
    if (slot) send({ type: "place_machine", machineType: "assembler", x: slot.x, y: slot.y, harness: "spark" });
  };

  return (
    <div className="app">
      <main className="floor">
        <FactoryMap state={state} />

        <section className="card hud-left" aria-label="Factory">
          <div className="ptitle">SHIPTORIO</div>
          <div className="psub">
            {cfg.kind === "sim" ? `sim · ${cfg.scenario}` : `${cfg.repo} · ${state?.baseBranch ?? "main"}`}
            <span className={`status ${status}`}> · {status}</span>
          </div>
          <div className="hrow">
            <span>SHIPPED {shipped}</span>
            <Segs value={shipped % 8 || (shipped ? 8 : 0)} color="#5bd18b" />
          </div>
          <div className="hrow">
            <span>TRUST</span>
            <Segs value={(state?.trust ?? 0) * 8} color="#f2a93b" />
          </div>
          <div className="science" aria-label="Science">
            {(["red", "green", "grey", "blue"] as const).map((k) => (
              <span key={k} className={`sci ${k}`} title={`${k} science`}>
                <i aria-hidden="true" />
                {state?.science[k] ?? 0}
              </span>
            ))}
          </div>
        </section>

        <div className="hud-right">
          <section className="card" aria-label="Power">
            <div className="ptitle small">POWER</div>
            {(state?.power ?? []).map((p) => (
              <div className="hrow" key={p.id}>
                <span>
                  {p.kind.toUpperCase()} · {p.name.toUpperCase()}
                </span>
                <Segs value={p.online ? p.level * 8 : 0} color={POWER_COLOR[p.kind]} />
              </div>
            ))}
          </section>

          <section className="card" aria-label="Launch pad">
            <div className="ptitle small">ON THE PAD</div>
            {pad.length === 0 && <p className="psub">Nothing on the pad.</p>}
            <ul>
              {pad.map((i) => (
                <li key={i.id} className="row">
                  <i className="dot" style={{ background: css(KIND_COLOR[i.kind]) }} aria-hidden="true" />
                  <span className="grow">
                    #{i.prNumber} {i.title}
                  </span>
                  {cfg.kind === "live" && i.prUrl && (
                    <a className="tag" href={i.prUrl} target="_blank" rel="noreferrer">
                      PR
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="card" aria-label="On the line">
            <div className="ptitle small">ON THE LINE</div>
            {inFlight.length === 0 && <p className="psub">The line is quiet.</p>}
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

          <section className="card log" aria-label="Floor log">
            <button type="button" className="ptitle small linkish" aria-expanded={showLog} onClick={() => setShowLog((v) => !v)}>
              LOG {showLog ? "−" : "+"}
            </button>
            {showLog && (
              <ol>
                {[...log].reverse().map((l, n) => (
                  <li key={`${l.at}-${n}`} className={l.level}>
                    {l.text}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className={`card caption${caption ? " on" : ""}`} role="status" aria-live="polite">
          <div className="ptitle">{caption?.title}</div>
          <div className="psub">{caption?.sub}</div>
        </div>

        {cfg.kind === "sim" && (
          <nav className="card scenarios" aria-label="Scenarios">
            {Object.keys(SCENARIOS).map((name) => (
              <a key={name} href={`?source=sim&scenario=${name}`} aria-current={name === cfg.scenario ? "page" : undefined}>
                {name.toUpperCase()}
              </a>
            ))}
            <a href="/art/">ART</a>
          </nav>
        )}

        <div className="buttons">
          <button type="button" className="rbtn amber" onClick={launch} disabled={pad.length === 0} aria-label="Launch the PR on the pad">
            <b>B</b>launch
          </button>
          <button type="button" className="rbtn" onClick={build} disabled={!slot || cfg.kind === "live"} aria-label="Build a Spark assembler">
            <b>A</b>build
          </button>
        </div>
      </main>
    </div>
  );
}
