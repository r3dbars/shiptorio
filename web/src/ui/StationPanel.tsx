// The panel anything on the map opens when you click it, while the camera flies in on it
// (docs/LOOP.md, "Click any station, take an action", plus Justin's playtest: click anything,
// see exactly what it's doing). What happens here, the numbers right now, the job it's on,
// what feeds it and where its work goes, recent history, and 1–3 actions with Spark's pick marked.

import { useEffect } from "react";
import { techById, type FactoryState, type Item, type Machine, type WebToServer } from "@shiptorio/shared";
import { lc } from "../sim/engine";
import type { LogLine } from "../store";
import { GEO_EXPLAINER, powerLedger } from "./powerLedger";
import { GEO_COPY, MACHINE_COPY, POWER_COPY, POWER_TYPES, researchedCopy, REWORK_COPY, STATION_COPY, type PanelCopy } from "./stationCopy";

function fmtWait(ms?: number) {
  if (ms === undefined) return "–";
  const s = Math.round(ms / 1000);
  return s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`;
}

const pct = (n?: number) => (n === undefined ? "–" : `${Math.round(n * 100)}%`);
const ref = (i: Item) => (i.prNumber ? `#${i.prNumber}` : i.title);

const STATE_WORD: Record<Item["state"], string> = {
  ore: "waiting in the mine",
  queued: "queued",
  working: "being built",
  inspecting: "being checked",
  rejected: "on the rework belt",
  passed: "passed",
  on_pad: "waiting on you",
  launched: "launched",
};

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
}

// A short name for a machine, for the in/out list.
function nameOf(m: Machine | undefined, state: FactoryState) {
  if (!m) return "?";
  const st = state.stations?.find((x) => x.machineId === m.id);
  if (st) return st.name;
  if (m.type === "assembler") return m.harness === "local" ? "local model assembler" : m.harness ? `${m.harness.replace("_", " ")} assembler` : "assembler";
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
  if (i.orbit?.state === "regressed") return i.orbit.signal === "revert" ? "reverted" : i.orbit.signal === "deploy" ? "red on main" : "came back";
  const h = hoursLeft(i.orbit?.until ?? 0);
  return h >= 1 ? `${Math.round(h)}h left` : `${Math.max(1, Math.round(h * 60))}m left`;
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
        ["On the belt", String(onBelt.length)],
        ["Top scar", top ?? "none yet"],
        ["Strikes", worst ? `${ref(worst)}: ${worst.scars!.length} / 3` : "–"],
      ],
      now: onBelt,
      last: scar && worst ? { who: "Rework", text: `${ref(worst)} came back from the ${lc(scar.check ? (techById(scar.check)?.name ?? "check") : STATION_COPY[scar.station].name)}: ${scar.reason}`, ok: false } : undefined,
      match: (l) => /rework|re-plan|rejected/i.test(l.text) || l.tool === "request_rework",
      actions: REWORK_COPY.actions ?? [],
    };
  }
  const st = state.stations?.find((x) => x.id === id);
  if (st) {
    const m = state.machines.find((x) => x.id === st.machineId);
    if (st.kind === "orbit")
      return {
        copy: STATION_COPY.orbit,
        stats: [["Watching", String(st.wip)], ["Held 24h", pct(st.passRate)], ["Caught this week", String(st.caughtThisWeek)]],
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
        ["In line", String(st.wip)],
        ["Oldest wait", fmtWait(st.oldestWaitMs)],
        ["Pass rate", pct(st.passRate)],
        ["Caught this week", String(st.caughtThisWeek)],
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
          ["Headroom", mine.online ? pct(mine.level) : "offline"],
          [mine.kind === "steam" ? "Decisions" : "Jobs this session", String(mine.jobs)],
        ]
      : ledger.map((r): [string, string] => [`${r.name} · ${r.kind === "geothermal" ? "free" : r.kind === "solar" ? "your plan" : "planner"}`, `${r.online ? pct(r.level) : "offline"} · ${r.jobs} ${r.kind === "steam" ? "calls" : "jobs"}`]);
    const low = state.power.find((p) => p.kind !== "steam" && p.level < 0.4);
    const feeds = m ? state.machines.filter((x) => x.powerId === m.id || (m.type === "steam" && x.type === "splitter")) : [];
    const geo = mine?.kind === "geothermal";
    return {
      copy: geo ? GEO_COPY : POWER_COPY,
      title: m ? (geo ? `${mine.name} · geothermal` : `${m.type} plant`) : undefined,
      stats: [...stats, ...(feeds.length ? [["Powers", feeds.map((f) => nameOf(f, state)).join(", ")] as [string, string]] : [])],
      machineId: m?.id,
      last: geo
        ? { who: "Geothermal", text: GEO_EXPLAINER, ok: true }
        : low ? { who: "Power", text: `${low.name} is under 40%. Low-value items wait until it refills.`, ok: true } : undefined,
      match: (l) => /power|plugged|plant|sign in|routed|geothermal/i.test(l.text),
      actions: POWER_COPY.actions ?? [],
      sendAs: "power",
    };
  }
  if (!m) return null;
  const copy = MACHINE_COPY[m.type] ?? { zone: "Factory", name: m.type, tag: ["steel", m.state] as PanelCopy["tag"], what: "" };
  const now = itemsAt(m, state);
  const plant = state.power.find((p) => p.id === m.powerId);
  const stats: [string, string][] = [["Status", m.state]];
  if (m.type === "ore_deposit") stats.push(["Chunks waiting", String(now.length)], ["Weight", String(now.reduce((n, i) => n + (i.value ?? 1), 0))]);
  if (m.type === "splitter") stats.push(["In the queue", String(now.length)]);
  if (m.type === "assembler") stats.push(["Tier", `MK${m.tier}`], ["Power", plant ? `${plant.name} · ${pct(plant.level)}` : "none, sign in"]);
  if (m.type === "launch_pad") stats.push(["Waiting on you", String(now.length)], ["Rockets", String(state.metrics?.rockets ?? 0)]);
  if (m.type === "turret") stats.push(["Guards", m.district ? `/${m.district}` : "all"]);
  const name = nameOf(m, state);
  const ids = new Set(now.map((i) => i.id));
  return {
    copy,
    title: m.type === "assembler" ? name : undefined,
    stats,
    now,
    machineId: m.id,
    match: (l) => (!!l.itemId && ids.has(l.itemId)) || l.text.includes(m.id) || l.text.toLowerCase().includes(name.toLowerCase()) || (m.type === "splitter" && /splitter|triage/i.test(l.text)),
    actions: m.type === "launch_pad" && now.length ? [{ id: "merge", label: "Merge and launch the next one", recommended: true }] : (copy.actions ?? []),
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
}

export function StationPanel({ id, state, log, send, onClose, jobs }: Props) {
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
  return (
    <section className={`card stationpanel${hot ? " hot" : ""}`} aria-label={p.title ?? p.copy.name}>
      <div className="sp-head">
        <span className="sp-zone">{p.copy.zone}</span>
        <button type="button" className="sp-close" onClick={onClose} aria-label="Close and zoom back out">
          ×
        </button>
      </div>
      <div className="sp-name">
        <span className="ptitle small">{p.title ?? p.copy.name}</span>
        <span className={`sp-tag ${color}`}>{tag}</span>
        {hot && <span className="sp-tag red">bottleneck</span>}
      </div>
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
          <div className="sp-h">Right now</div>
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
              {p.now.length > 4 && <li className="more">+{p.now.length - 4} more</li>}
            </ul>
          ) : (
            <p className="sp-empty">Nothing here right now.</p>
          )}
        </div>
      )}
      {(ins.length > 0 || outs.length > 0) && (
        <div className="sp-flow">
          <span>
            <b>IN</b> {ins.join(", ") || "–"}
          </span>
          <span>
            <b>OUT</b> {outs.join(", ") || "–"}
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
          <div className="sp-h">Recently</div>
          <ul className="sp-recent">
            {recent.map((l, n) => (
              <li key={`${l.at}-${n}`} className={l.level}>
                {l.text}
              </li>
            ))}
          </ul>
        </div>
      )}
      {p.actions.length > 0 && (
        <div className="sp-actions">
          {p.actions.map((a) => (
            <button key={a.id} type="button" className={a.recommended ? "btn rec" : "btn"} onClick={() => send({ type: "station_action", stationId: p.sendAs ?? id, action: a.id })}>
              {a.label}
              {a.recommended && <span className="sugg">Suggested</span>}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
