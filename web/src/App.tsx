import { useEffect, useMemo, useState } from "react";
import type { AutonomyLevel, FactoryState, Item, PowerSource, WebToServer } from "@shiptorio/shared";
import { FactoryMap } from "./map/FactoryMap";
import { css, KIND_COLOR } from "./map/palette";
import { readConfig } from "./source";
import { SCENARIOS } from "./sim/engine";
import { useFactory, type LogLine } from "./store";
import { NextMove } from "./ui/NextMove";
import { SoundControl } from "./ui/SoundControl";
import { useFactorySound } from "./sound/useFactorySound";

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

const LEVEL_LABEL: Record<AutonomyLevel, string> = { advisor: "ADVISOR", floor: "FLOOR", build: "BUILD", lights_out: "LIGHTS OUT" };
// Subscriptions you can plug in. Each sign-in adds a solar plant and assemblers (docs/PRODUCT.md).
const SLOTS = [
  { harness: "claude_code", name: "Claude" },
  { harness: "codex", name: "ChatGPT" },
] as const;
const UNDO_MS = 5 * 60_000;

function fmtLead(ms?: number) {
  if (ms === undefined) return "–";
  const m = Math.round(ms / 60_000);
  return m < 90 ? `${m}m` : `${Math.round(m / 60)}h`;
}

// One floor log line. Spark's lines show the tool it called and why, and an undo while it's fresh.
function LogRow({ l, send, live }: { l: LogLine; send: (msg: WebToServer) => void; live: boolean }) {
  if (l.actor !== "spark") return <li className={l.level}>{l.text}</li>;
  const canUndo = l.actionId && Date.now() - l.at < UNDO_MS;
  return (
    <li className={`spark ${l.level}`} title={l.reason ? `why: ${l.reason}` : undefined}>
      <span className="who">SPARK</span>
      {l.tool && <span className="tool">{l.tool}</span>}
      <span className="txt">{l.text}</span>
      {l.approvedBy === "autonomy" && <span className="auto" title="Spark did this on its own">auto</span>}
      {canUndo && live && (
        <button type="button" className="undo" onClick={() => send({ type: "undo", actionId: l.actionId! })}>
          undo
        </button>
      )}
    </li>
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
  useFactorySound(state);
  const [showLog, setShowLog] = useState(true);
  const items = state?.items ?? [];
  const pad = items.filter((i) => i.state === "on_pad" || i.state === "passed");
  const inFlight = items.filter((i) => !["on_pad", "passed", "launched"].includes(i.state));
  const metrics = state?.metrics;
  const autonomy = state?.autonomy;
  const permits = autonomy?.districts.filter((d) => d.permit).map((d) => `/${d.district}`) ?? [];
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
          {metrics ? (
            <>
              <div className="score" title="users unblocked + 10 × customers answered + rockets − 25 × escaped defects">
                <span>SHIP SCORE</span>
                <b>{metrics.shipScore}</b>
              </div>
              <div className="stats">
                <span title="PRs merged">
                  <b>{metrics.rockets}</b> rockets
                </span>
                <span title="Users affected by fixed issues">
                  <b>{metrics.usersUnblocked}</b> unblocked
                </span>
                <span title="Customer threads closed with a shipped fix">
                  <b>{metrics.customersAnswered}</b> answered
                </span>
                <span title="Sentry issues resolved">
                  <b>{metrics.bitersKilled}</b> biters
                </span>
                <span title="Median lead time, ore to merged">
                  <b>{fmtLead(metrics.leadTimeMs)}</b> lead
                </span>
                {metrics.checkouts !== undefined && (
                  <span title="Demo shop checkouts completed (Stripe test mode)">
                    <b>{metrics.checkouts.toLocaleString()}</b> checkouts
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="hrow">
              <span>SHIPPED {shipped}</span>
              <Segs value={shipped % 8 || (shipped ? 8 : 0)} color="#5bd18b" />
            </div>
          )}
          {autonomy ? (
            <div className="hrow" title={autonomy.next ? `${autonomy.next.have}/${autonomy.next.need} ${autonomy.next.label} to unlock ${LEVEL_LABEL[autonomy.next.level]}` : "Top level"}>
              <span>AUTONOMY · {LEVEL_LABEL[autonomy.level]}</span>
              <Segs value={autonomy.next ? (autonomy.next.have / autonomy.next.need) * 8 : 8} color="#6fb2ff" />
            </div>
          ) : (
            <div className="hrow">
              <span>TRUST</span>
              <Segs value={(state?.trust ?? 0) * 8} color="#f2a93b" />
            </div>
          )}
          {permits.length > 0 && <div className="psub">LAUNCH PERMIT: {permits.join(", ")}</div>}
          <div className="science" aria-label="Science">
            {(["red", "green", "grey", "blue"] as const).map((k) => (
              <span key={k} className={`sci ${k}`} title={`${k} science`}>
                <i aria-hidden="true" />
                {state?.science[k] ?? 0}
              </span>
            ))}
          </div>
          <SoundControl />
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
            {SLOTS.filter((sl) => !state?.power.some((p) => p.name === sl.name)).map((sl) => {
              const opt = state?.move?.stage === "resources" ? state.move.options.find((o) => o.id === sl.harness) : undefined;
              return (
                <div className="hrow slot" key={sl.harness}>
                  <span>SOLAR · {sl.name.toUpperCase()}</span>
                  {opt && state?.move ? (
                    <button type="button" className="slotbtn" onClick={() => send({ type: "choose_move", moveId: state.move!.id, optionId: opt.id })}>
                      SIGN IN
                    </button>
                  ) : (
                    <span className="locked" title="Run bunx shiptorio-runner pair on your machine to plug it in">
                      SIGN IN TO UNLOCK
                    </span>
                  )}
                </div>
              );
            })}
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
                  <LogRow key={`${l.at}-${n}`} l={l} send={send} live={status === "live"} />
                ))}
              </ol>
            )}
          </section>
        </div>

        <NextMove move={state?.move} bottleneck={state?.bottleneck} send={send} />

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
