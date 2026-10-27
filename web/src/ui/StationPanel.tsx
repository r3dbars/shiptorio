// The panel anything on the map opens when you click it, while the camera flies in on it
// (docs/LOOP.md, "Click any station, take an action", plus Justin's playtest: click anything,
// see exactly what it's doing). What happens here, the numbers right now, the job it's on,
// what feeds it and where its work goes, recent history, and 1–3 actions with the planner's pick marked.

import { useEffect } from "react";
import { rate, techById, type Experiment, type FactoryState, type Item, type Machine, type WebToServer } from "@shiptorio/shared";
import { lc } from "../sim/engine";
import type { LogLine } from "../store";
import { GEO_EXPLAINER, powerLedger } from "./powerLedger";
import { GEO_COPY, MACHINE_COPY, POWER_COPY, POWER_TYPES, researchedCopy, REWORK_COPY, STATION_COPY, type PanelCopy } from "./stationCopy";
import { HARNESS_NAME, PANEL, STATE_WORD, WORDS } from "../copy";
import { Icon } from "./icons";
import { planFromState } from "../map/shaft/plan";
import { lineOrder, parkedIn, quietWord, workOnLine, WORDS as WAIT } from "../map/shaft/waiting";

function fmtWait(ms?: number) {
  if (ms === undefined) return "–";
  const s = Math.round(ms / 1000);
  return s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`;
}

const pct = (n?: number) => (n === undefined ? "–" : `${Math.round(n * 100)}%`);
const ref = (i: Item) => (i.prNumber ? `#${i.prNumber}` : i.title);

const ORE_SOURCE: Record<string, Item["source"]> = { "ore-issues": "github_issue", "ore-sentry": "sentry", "ore-posthog": "posthog", "ore-inbox": "inbox" };

interface Panel {
  copy: PanelCopy;
  title?: string; // overrides copy.name, e.g. "Claude Code assembler"
  stats: [string, string][];
  now?: Item[]; // the job(s) it's on right now
  status?: (i: Item) => string; // the word next to each job, when the item state isn't the point
  machineId?: string; // for the in/out belts
  last?: { who: string; text: string; ok: boolean };
  match: (l: LogLine) => boolean; // which floor log lines are this thing's history
  actions: { id: string; label: string; recommended: boolean }[];
  sendAs?: string; // stationId to send actions as, when it isn't the panel id
  experiments?: Experiment[]; // the measure station: before vs after, per experiment
}

const EXP_WORD: Record<Experiment["state"], string> = { proposed: "waiting on you", building: "being built", measuring: "measuring", won: "lift", flat: "no lift", lost: "hurt", dropped: "dropped", inconclusive: "not enough data" };

// Before (A) against after (B) for one experiment, as two bars and the call.
function ExperimentRow({ e }: { e: Experiment }) {
  const a = rate(e.baseline);
  const b = e.after ? rate(e.after) : undefined;
  const max = Math.max(a, b ?? 0, 0.01);
  const tone = e.state === "won" ? "good" : e.state === "lost" ? "bad" : e.state === "flat" ? "flat" : "";
  return (
    <li className={`sp-exp ${tone}`}>
      <div className="sp-exp-top">
        <span className="txt">{e.prNumber ? `#${e.prNumber} ` : ""}{e.title}</span>
        <span className={`st${e.state === "lost" ? " bad" : ""}`}>{EXP_WORD[e.state]}</span>
      </div>
      <div className="sp-exp-bars" aria-label={`${e.step.label}: before ${(a * 100).toFixed(1)}%${b !== undefined ? `, after ${(b * 100).toFixed(1)}%` : ""}`}>
        <span className="lbl">A</span>
        <span className="bar a" style={{ width: `${(a / max) * 100}%` }} />
        <span className="num">{(a * 100).toFixed(1)}%</span>
        <span className="lbl">B</span>
        <span className="bar b" style={{ width: `${((b ?? 0) / max) * 100}%` }} />
        <span className="num">{b === undefined ? "–" : `${(b * 100).toFixed(1)}%`}</span>
      </div>
      <p className="sp-exp-line">{e.line ?? e.hypothesis}</p>
    </li>
  );
}

// A short name for a machine, for the in/out list.
function nameOf(m: Machine | undefined, state: FactoryState) {
  if (!m) return "?";
  const st = state.stations?.find((x) => x.machineId === m.id);
  if (st) return st.name;
  if (m.type === "assembler") return PANEL.assembler(m.harness && HARNESS_NAME[m.harness]);
  return MACHINE_COPY[m.type]?.name ?? m.type.replace("_", " ");
}


// Orbit watch: launches still on their 24h clock, plus the ones that just came back.
const hoursLeft = (until: number) => Math.max(0, until - Date.now()) / 3600_000;
function orbitWatch(state: FactoryState): Item[] {
  return state.items
    .filter((i) => i.orbit && ((i.state === "launched" && i.orbit.state === "watching" && i.orbit.until > Date.now()) || (i.orbit.state === "regressed" && i.state !== "launched")))
    .sort((a, b) => (b.orbit!.at ?? b.orbit!.since) - (a.orbit!.at ?? a.orbit!.since));
}
const orbitWord = (i: Item) => {
  if (i.orbit?.state === "regressed") return i.orbit.signal === "revert" ? PANEL.orbit.reverted : i.orbit.signal === "deploy" ? PANEL.orbit.redOnMain : PANEL.orbit.cameBack;
  const h = hoursLeft(i.orbit?.until ?? 0);
  return h >= 1 ? PANEL.orbit.hoursLeft(Math.round(h)) : PANEL.orbit.minutesLeft(Math.max(1, Math.round(h * 60)));
};

function itemsAt(m: Machine, state: FactoryState): Item[] {
  const items = state.items.filter((i) => i.state !== "launched");
  switch (m.type) {
    case "ore_deposit":
      return items.filter((i) => i.state === "ore" && (!ORE_SOURCE[m.id] || i.source === ORE_SOURCE[m.id]));
    case "splitter":
      return items.filter((i) => i.state === "queued");
    case "assembler":
      return items.filter((i) => i.state === "working" && (!i.machineId || i.machineId === m.id));
    case "launch_pad":
      return items.filter((i) => i.state === "on_pad" || i.state === "passed");
    case "turret":
      return items.filter((i) => i.source === "sentry" && i.district === m.district);
    default:
      return items.filter((i) => i.machineId === m.id);
  }
}

function panelFor(id: string, state: FactoryState, jobs: Map<string, string> = new Map()): Panel | null {
  if (id === "rework") {
    const items = state.items.filter((i) => i.scars?.length && i.state !== "launched");
    const onBelt = state.items.filter((i) => i.state === "rejected");
    const counts = new Map<string, number>();
    for (const i of items) for (const sc of i.scars!) counts.set(sc.reason, (counts.get(sc.reason) ?? 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
    const worst = [...items].sort((a, b) => b.scars!.length - a.scars!.length)[0];
    const scar = worst?.scars!.at(-1);
    return {
      copy: REWORK_COPY,
      stats: [
        [PANEL.stats.onBelt, String(onBelt.length)],
        [PANEL.stats.topScar, top ?? PANEL.stats.noScar],
        [PANEL.stats.strikes, worst ? `${ref(worst)}: ${worst.scars!.length} / 3` : "–"],
      ],
      now: onBelt,
      last: scar && worst ? { who: PANEL.rework, text: PANEL.reworkLast(ref(worst), lc(scar.check ? (techById(scar.check)?.name ?? PANEL.check) : STATION_COPY[scar.station].name), scar.reason), ok: false } : undefined,
      match: (l) => /rework|re-plan|rejected/i.test(l.text) || l.tool === "request_rework",
      actions: REWORK_COPY.actions ?? [],
    };
  }
  const st = state.stations?.find((x) => x.id === id);
  if (st) {
    const m = state.machines.find((x) => x.id === st.machineId);
    if (st.kind === "measure") {
      const exps = (state.experiments ?? []).filter((e) => e.state !== "dropped");
      const decided = exps.filter((e) => e.state === "won" || e.state === "flat" || e.state === "lost");
      const live = exps.find((e) => e.state === "measuring");
      return {
        copy: STATION_COPY.measure,
        stats: [
          ["Measuring", live ? `day ${Math.min(live.windowDays, Math.floor(live.daysWatched ?? 0) + 1)} / ${live.windowDays}` : "nothing"],
          ["Won", `${decided.filter((e) => e.state === "won").length} / ${decided.length}`],
          ["Watches", live?.step.label ?? exps[0]?.step.label ?? "a funnel step"],
        ],
        experiments: exps,
        machineId: st.machineId,
        last: st.lastLog,
        match: (l) => /measure|experiment|lift/i.test(l.text),
        actions: st.actions,
      };
    }
    if (st.kind === "orbit")
      return {
        copy: STATION_COPY.orbit,
        stats: [[PANEL.stats.watching, String(st.wip)], [PANEL.stats.held, pct(st.passRate)], [PANEL.stats.caught, String(st.caughtThisWeek)]],
        now: orbitWatch(state),
        status: orbitWord,
        machineId: st.machineId,
        last: st.lastLog,
        match: (l) => /orbit watch|came back in orbit/i.test(l.text),
        actions: st.actions,
      };
    return {
      copy: st.kind === "custom" ? researchedCopy(st.id) : STATION_COPY[st.kind],
      stats: [
        [PANEL.stats.inLine, String(st.wip)],
        [PANEL.stats.longestWait, fmtWait(st.oldestWaitMs)],
        [PANEL.stats.passRate, pct(st.passRate)],
        [PANEL.stats.caught, String(st.caughtThisWeek)],
      ],
      now: m ? itemsAt(m, state) : [],
      machineId: st.machineId,
      last: st.lastLog,
      match: (l) => l.text.toLowerCase().includes(st.name.toLowerCase()),
      actions: st.actions,
    };
  }
  const mid = id.startsWith("m:") ? id.slice(2) : id;
  // live plants the map placed from state.power aren't in state.machines, so find them by their power id
  const reported = state.power.find((p) => p.id === mid);
  const m = state.machines.find((x) => x.id === mid) ?? (reported && reported.kind !== "steam" ? { id: reported.id, type: reported.kind, x: 0, y: 0, tier: 1, state: "idle" as const } : undefined);
  if (id === "power" || (m && POWER_TYPES.includes(m.type))) {
    const ledger = powerLedger(state, jobs);
    const mine = m && ledger.find((r) => r.id === m.id || (m.type === "steam" && r.kind === "steam"));
    const stats: [string, string][] = mine
      ? [
          ["Cost", mine.cost],
          [mine.kind === "solar" ? "Availability" : "Headroom", mine.kind === "solar" ? (!mine.online ? "offline" : mine.busy ? "busy" : "ready") : mine.online ? pct(mine.level) : "offline"],
          [mine.kind === "steam" ? "Decisions" : "Jobs this session", String(mine.jobs)],
        ]
      : ledger.map((r): [string, string] => [`${r.name} · ${r.kind === "geothermal" ? "free" : r.kind === "solar" ? "your plan" : "planner"}`, `${r.kind === "solar" ? (!r.online ? "offline" : r.busy ? "busy" : "ready") : r.online ? pct(r.level) : "offline"} · ${r.jobs} ${r.kind === "steam" ? "calls" : "jobs"}`]);
    const low = state.power.find((p) => p.kind !== "steam" && p.level < 0.4);
    const feeds = m ? state.machines.filter((x) => x.powerId === m.id || (m.type === "steam" && x.type === "splitter")) : [];
    const geo = mine?.kind === "geothermal";
    return {
      copy: geo ? GEO_COPY : POWER_COPY,
      title: m ? (geo ? `${mine.name} · geothermal` : mine?.kind === "solar" ? mine.name : PANEL.plant(m.type)) : undefined,
      stats: [...stats, ...(feeds.length ? [[PANEL.stats.powers, feeds.map((f) => nameOf(f, state)).join(", ")] as [string, string]] : [])],
      machineId: m?.id,
      last: geo
        ? { who: "Geothermal", text: GEO_EXPLAINER, ok: true }
        : low ? { who: PANEL.power, text: PANEL.lowPower(low.name), ok: true } : undefined,
      match: (l) => /power|plugged|plant|sign in|routed|geothermal/i.test(l.text),
      actions: POWER_COPY.actions ?? [],
      sendAs: "power",
    };
  }
  if (!m) return null;
  const copy = MACHINE_COPY[m.type] ?? { zone: PANEL.factory, name: m.type, tag: ["steel", m.state] as PanelCopy["tag"], what: "" };
  const now = itemsAt(m, state);
  const plant = state.power.find((p) => p.id === m.powerId);
  const stats: [string, string][] = [[PANEL.stats.state, m.state]];
  if (m.type === "ore_deposit") stats.push([PANEL.stats.oreWaiting, String(now.length)], [PANEL.stats.weight, String(now.reduce((n, i) => n + (i.value ?? 1), 0))]);
  if (m.type === "splitter") stats.push([PANEL.stats.upNext, String(now.length)]);
  if (m.type === "assembler") stats.push([PANEL.stats.tier, `MK${m.tier}`], [PANEL.stats.power, plant ? `${plant.kind === "steam" ? PANEL.stats.planner : plant.name} · ${pct(plant.level)}` : PANEL.stats.noPower]);
  if (m.type === "launch_pad") stats.push([PANEL.stats.waitingOnYou, String(now.length)], [PANEL.stats.rockets, String(state.metrics?.rockets ?? 0)]);
  if (m.type === "turret") stats.push([PANEL.stats.guards, m.district ? `/${m.district}` : PANEL.stats.everywhere]);
  const name = nameOf(m, state);
  const ids = new Set(now.map((i) => i.id));
  return {
    copy,
    title: m.type === "assembler" ? name : undefined,
    stats,
    now,
    machineId: m.id,
    match: (l) => (!!l.itemId && ids.has(l.itemId)) || l.text.includes(m.id) || l.text.toLowerCase().includes(name.toLowerCase()) || (m.type === "splitter" && /splitter|triage/i.test(l.text)),
    actions: m.type === "launch_pad" && now.length ? [{ id: "merge", label: PANEL.launchNext, recommended: true }] : (copy.actions ?? []),
    sendAs: m.type === "launch_pad" ? "gate-1" : m.id,
  };
}

interface Props {
  id: string;
  state: FactoryState;
  log: LogLine[];
  send: (msg: WebToServer) => void;
  onClose: () => void;
  jobs?: Map<string, string>; // item id -> power plant that built it, this session
  live?: boolean; // live factories have no station_action handler yet, so their action buttons stay hidden
}

// what a quiet machine is waiting on: the next real item up the line, or you (null: nothing is coming)
function quietIn(state: FactoryState, id: string) {
  const sid = id.replace(/^m:/, "");
  const { plan } = planFromState(state);
  const order = lineOrder(plan);
  const at = order.get(sid);
  if (at === undefined) return null;
  return quietWord(at, workOnLine(state.items, plan, order), parkedIn(state, plan), sid);
}

export function StationPanel({ id, state, log, send, onClose, jobs, live }: Props) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const p = panelFor(id, state, jobs);
  if (!p) return null;
  const hot = state.bottleneck?.stationId === id;
  const [color, tag] = p.copy.tag;
  const byId = (mid: string) => state.machines.find((m) => m.id === mid);
  const ins = p.machineId ? state.belts.filter((b) => b.to === p.machineId).map((b) => nameOf(byId(b.from), state)) : [];
  const outs = p.machineId ? state.belts.filter((b) => b.from === p.machineId).map((b) => nameOf(byId(b.to), state)) : [];
  const recent = log.filter(p.match).slice(-4).reverse();
  // IDLE / WORKING / BLOCKED, the Black Iron state words (docs/art/IRON-STYLE.md §6)
  const machine = hot ? "BLOCKED" : p.now?.length ? "WORKING" : "IDLE";
  const quiet = machine === "IDLE" ? quietIn(state, id) : null;
  const word = quiet ? `${quiet.word === WAIT.you ? PANEL.quiet.you : PANEL.quiet.next} · ${quiet.det}` : PANEL.machine[machine];
  return (
    <section className={`card stationpanel${hot ? " hot" : ""}`} aria-label={p.title ?? p.copy.name}>
      <div className="sp-head">
        <span className="sp-zone">{p.copy.zone}</span>
        <button type="button" className="sp-close" onClick={onClose} aria-label={PANEL.closeLabel}>
          <Icon name="cross" size={14} />
        </button>
      </div>
      <div className="sp-name">
        <span className="ptitle small">{p.title ?? p.copy.name}</span>
        <span className={`sp-tag ${color}`}>{tag}</span>
        {hot && <span className="sp-tag red">{PANEL.bottleneck}</span>}
      </div>
      <span className="iron-state sp-state" data-s={machine}>{word}</span>
      {p.copy.what && <p className="sp-what">{p.copy.what}</p>}
      <dl className="sp-stats">
        {p.stats.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className={v.length > 10 ? "long" : undefined}>{v}</dd>
          </div>
        ))}
      </dl>
      {p.now && (
        <div className="sp-sec">
          <div className="sp-h">{PANEL.rightNow}</div>
          {p.now.length ? (
            <ul className="sp-jobs">
              {p.now.slice(0, 4).map((i) => {
                const pr = p.status ? i.orbit?.prNumber : i.prNumber; // orbit names the launched PR, not the rework one
                return (
                  <li key={i.id}>
                    <span className="txt">{pr ? `#${pr} ` : ""}{i.title}</span>
                    <span className={`st${p.status && i.orbit?.state === "regressed" ? " bad" : ""}`}>{p.status ? p.status(i) : STATE_WORD[i.state]}</span>
                  </li>
                );
              })}
              {p.now.length > 4 && <li className="more">{PANEL.more(p.now.length - 4)}</li>}
            </ul>
          ) : (
            <p className="sp-empty">{PANEL.idle}</p>
          )}
        </div>
      )}
      {p.experiments && (
        <div className="sp-sec">
          <div className="sp-h">Experiments · before (A) vs after (B)</div>
          {p.experiments.length ? (
            <ul className="sp-jobs">
              {p.experiments.slice(0, 3).map((e) => (
                <ExperimentRow key={e.id} e={e} />
              ))}
            </ul>
          ) : (
            <p className="sp-empty">No growth change has launched yet.</p>
          )}
        </div>
      )}
      {(ins.length > 0 || outs.length > 0) && (
        <div className="sp-flow">
          <span>
            <b>{PANEL.in}</b> {ins.join(", ") || "–"}
          </span>
          <span>
            <b>{PANEL.out}</b> {outs.join(", ") || "–"}
          </span>
        </div>
      )}
      {p.last && (
        <p className={`sp-log ${p.last.ok ? "ok" : "bad"}`}>
          <b>{p.last.who}</b> {p.last.text}
        </p>
      )}
      {recent.length > 0 && (
        <div className="sp-sec">
          <div className="sp-h">{PANEL.lately}</div>
          <ul className="sp-recent">
            {recent.map((l, n) => (
              <li key={`${l.at}-${n}`} className={l.level}>
                {l.text}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!live && p.actions.length > 0 && (
        <div className="sp-actions">
          {p.actions.map((a) => (
            <button key={a.id} type="button" className={a.recommended ? "btn rec" : "btn"} onClick={() => send({ type: "station_action", stationId: p.sendAs ?? id, action: a.id })}>
              {a.label}
              {a.recommended && <span className="sugg">{WORDS.suggested}</span>}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
