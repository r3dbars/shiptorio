import { useEffect, useRef, useState } from "react";
import { FactoryMap } from "../map/FactoryMap";
import { useFactory } from "../store";
import { useFactorySound } from "../sound/useFactorySound";
import { SoundControl } from "../ui/SoundControl";
import { Wordmark } from "../ui/Logo";
import { JUDGE } from "../copy";
import "./judge.css";

const CONFIG = { kind: "sim", scenario: "judge", repo: "sim/demo-shop" } as const;
const END = 100; // 100 ordinary 900ms simulation ticks = 90 seconds.

export function Judge() {
  const [run, setRun] = useState(0);
  return <main className="judge">
    {run ? <JudgeRun key={run} replay={() => setRun(n => n + 1)} /> : <section className="judge-welcome iron-plate iron-rivets" aria-labelledby="judge-title">
      <Wordmark width={297} />
      <p className="iron-eyebrow">{JUDGE.badge}</p>
      <h1 id="judge-title" className="iron-title">{JUDGE.title}</h1>
      <p>{JUDGE.intro}</p>
      <p>{JUDGE.disclosure}</p>
      <button className="iron-btn primary" onClick={() => setRun(1)}>{JUDGE.play}</button>
      <p className="judge-credit">{JUDGE.credit}</p>
    </section>}
  </main>;
}

function JudgeRun({ replay }: { replay: () => void }) {
  const { state, send } = useFactory(CONFIG);
  const tick = state?.tick ?? 0;
  const checkout = state?.items.find(i => i.source === "sentry");
  const docs = state?.items.find(i => i.district === "docs");
  const permit = !!state?.autonomy?.districts.find(d => d.district === "docs")?.permit;
  const floor = state?.autonomy?.level === "floor";
  const complete = tick >= END && floor && checkout?.state === "launched" && docs?.state === "launched";
  const sent = useRef(new Set<string>());
  // The replay's simulated player uses only the same public messages as the game UI.
  // Decisions and state transitions still belong to the simulator, not the caption clock.
  useEffect(() => {
    if (!state) return;
    const once = (key: string, action: () => void) => {
      if (sent.current.has(key)) return;
      sent.current.add(key); action();
    };
    for (const move of state.deck ?? (state.move ? [state.move] : [])) {
      if (tick >= 20 && move.kind === "build") once(move.id, () => send({ type: "choose_move", moveId: move.id, optionId: "go" }));
      // Approving the reply is the second accepted suggestion: the sim earns Floor.
      if (tick >= 92 && move.options.some(o => o.id === "send")) once(move.id, () => send({ type: "choose_move", moveId: move.id, optionId: "send" }));
    }
    if (tick >= 72 && !permit) once("permit", () => send({ type: "station_action", stationId: "gate-1", action: "permit" }));
    if (tick >= 84 && checkout?.state === "on_pad") once("launch", () => send({ type: "launch_pr", itemId: checkout.id }));
  }, [state, tick, permit, checkout, send]);

  const beat = complete ? 8 : tick >= 92 ? 7 : tick >= 80 ? 6 : tick >= 72 ? 5 : tick >= 58 ? 4 : tick >= 25 ? 3 : tick >= 14 ? 2 : tick >= 2 ? 1 : 0;
  const chapter = JUDGE.beats[beat];
  const focus = beat === 1 ? "m:ore-sentry" : beat === 2 ? "m:steam-spark" : beat === 3 ? checkout?.machineId ?? "inspector-1" : beat === 4 ? "gate-1" : beat === 5 || beat === 6 ? "m:launch-pad" : null;
  useFactorySound(state, focus);
  const stations = state?.stations?.filter(s => ["ci", "verify", "review"].includes(s.kind)) ?? [];
  return <>
    <FactoryMap state={state} focus={focus} wide={36} lift={0.12} summary={chapter.text} />
    <header className="judge-header iron-plate">
      <Wordmark width={148} />
      <span className="iron-eyebrow">{JUDGE.badge}</span>
      <SoundControl />
      <span className="judge-time">{Math.min(90, Math.floor(tick * .9))} / 90s</span>
      <button className="iron-btn" onClick={replay}>{JUDGE.replay}</button>
    </header>
    <section className="judge-caption iron-plate iron-rivets" aria-label={JUDGE.captionLabel} data-beat={beat}>
      <progress aria-label={JUDGE.progress} max={END} value={Math.min(END, tick)} />
      <div aria-live="polite" aria-atomic="true">
        <p className="iron-eyebrow">{JUDGE.credit}</p>
        <h1 className="iron-title">{chapter.title}</h1>
        <p>{chapter.text}</p>
      </div>
      {beat === 3 && <p className="judge-evidence">{checkout?.scars?.length ? JUDGE.rework : JUDGE.checking}</p>}
      {beat === 4 && <section className="judge-permit" aria-label={JUDGE.permitTitle}>
        <h2 className="iron-title">{JUDGE.permitTitle}</h2><p>{JUDGE.permitText}</p>
        <button className="iron-btn primary" disabled={permit} onClick={() => send({ type: "station_action", stationId: "gate-1", action: "permit" })}>{permit ? JUDGE.permitGranted : JUDGE.permitAction}</button>
        <small>{JUDGE.autoPermit}</small>
      </section>}
      {beat >= 4 && <ul className="judge-receipts" aria-label={JUDGE.receipts}>
        {stations.map(s => <li key={s.id} data-passed={s.lastLog?.ok ?? false}>{s.name}: {s.lastLog?.ok ? JUDGE.passed : JUDGE.waiting}</li>)}
      </ul>}
      <div className="judge-stats" aria-label={JUDGE.results}>
        <span>{JUDGE.rockets}: <b data-testid="judge-rockets">{state?.metrics?.rockets ?? 0}</b></span>
        <span>{JUDGE.users}: <b>{state?.metrics?.usersUnblocked ?? 0}</b></span>
        <span>{JUDGE.autonomy}: <b data-testid="judge-autonomy">{floor ? JUDGE.floor : JUDGE.advisor}</b></span>
      </div>
      <p className="judge-disclosure">{JUDGE.disclosure}</p>
      {complete && <div role="status" data-testid="judge-complete">{JUDGE.done} <button className="iron-btn primary" onClick={replay}>{JUDGE.replay}</button> <a href="/docs">{JUDGE.docs}</a></div>}
    </section>
    <aside className="sr" aria-label={JUDGE.inputs}>{state?.items.map(i => <p key={i.id} data-testid={`judge-item-${i.source}`} data-state={i.state} data-station={i.machineId} data-scars={i.scars?.length ?? 0}>{i.source}: {i.title} · {i.state} · {i.machineId} · {i.scars?.length ?? 0} scars {i.customer?.reporters?.join(", ")}</p>)}</aside>
  </>;
}
