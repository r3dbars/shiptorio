// The panel a station opens when you click it on the map (docs/LOOP.md, "Click any station, take an action"):
// what happens here, the numbers right now, the last log line, and 1–3 actions with Spark's pick marked.
// The power plants and the rework belt open one too.

import { useEffect } from "react";
import type { FactoryState, Item, WebToServer } from "@shiptorio/shared";
import { lc } from "../sim/engine";
import { POWER_COPY, REWORK_COPY, STATION_COPY, type PanelCopy } from "./stationCopy";

function fmtWait(ms?: number) {
  if (ms === undefined) return "–";
  const s = Math.round(ms / 1000);
  return s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`;
}

const pct = (n?: number) => (n === undefined ? "–" : `${Math.round(n * 100)}%`);
const ref = (i: Item) => (i.prNumber ? `#${i.prNumber}` : i.title);

interface Panel {
  copy: PanelCopy;
  stats: [string, string][];
  last?: { who: string; text: string; ok: boolean };
  actions: { id: string; label: string; recommended: boolean }[];
}

function panelFor(id: string, state: FactoryState): Panel | null {
  if (id === "power") {
    const stats = state.power.map((p): [string, string] => [p.kind === "steam" ? "Spark steam" : `${p.name} left`, p.online ? pct(p.level) : "offline"]);
    const low = state.power.find((p) => p.kind !== "steam" && p.level < 0.4);
    return {
      copy: POWER_COPY,
      stats,
      last: low ? { who: "Spark", text: `${low.name} is under 40%. Spark will hold low-value items until it refills.`, ok: true } : undefined,
      actions: POWER_COPY.actions ?? [],
    };
  }
  if (id === "rework") {
    const items = state.items.filter((i) => i.scars?.length && i.state !== "launched");
    const onBelt = state.items.filter((i) => i.state === "rejected").length;
    const counts = new Map<string, number>();
    for (const i of items) for (const sc of i.scars!) counts.set(sc.reason, (counts.get(sc.reason) ?? 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
    const worst = [...items].sort((a, b) => b.scars!.length - a.scars!.length)[0];
    const scar = worst?.scars!.at(-1);
    return {
      copy: REWORK_COPY,
      stats: [
        ["On the belt", String(onBelt)],
        ["Top scar", top ? (top.length > 28 ? `${top.slice(0, 27)}…` : top) : "none yet"],
        ["Strikes", worst ? `${ref(worst)}: ${worst.scars!.length} / 3` : "–"],
      ],
      last: scar && worst ? { who: "Spark", text: `${ref(worst)} came back from the ${lc(STATION_COPY[scar.station].name)}: ${scar.reason}`, ok: false } : undefined,
      actions: REWORK_COPY.actions ?? [],
    };
  }
  const st = state.stations?.find((x) => x.id === id);
  if (!st) return null;
  return {
    copy: STATION_COPY[st.kind],
    stats:
      st.kind === "orbit"
        ? [["Watching", String(st.wip)], ["Caught this week", String(st.caughtThisWeek)]]
        : [
            ["In line", String(st.wip)],
            ["Oldest wait", fmtWait(st.oldestWaitMs)],
            ["Pass rate", pct(st.passRate)],
            ["Caught this week", String(st.caughtThisWeek)],
          ],
    last: st.lastLog,
    actions: st.actions,
  };
}

export function StationPanel({ id, state, send, onClose }: { id: string; state: FactoryState; send: (msg: WebToServer) => void; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const p = panelFor(id, state);
  if (!p) return null;
  const hot = state.bottleneck?.stationId === id;
  const [color, tag] = p.copy.tag;
  return (
    <section className={`card stationpanel${hot ? " hot" : ""}`} aria-label={p.copy.name}>
      <div className="sp-head">
        <span className="sp-zone">{p.copy.zone}</span>
        <button type="button" className="sp-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="sp-name">
        <span className="ptitle small">{p.copy.name.toUpperCase()}</span>
        <span className={`sp-tag ${color}`}>{tag}</span>
        {hot && <span className="sp-tag red">bottleneck</span>}
      </div>
      <p className="sp-what">{p.copy.what}</p>
      <dl className="sp-stats">
        {p.stats.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className={v.length > 10 ? "long" : undefined}>{v}</dd>
          </div>
        ))}
      </dl>
      {p.last && (
        <p className={`sp-log ${p.last.ok ? "ok" : "bad"}`}>
          <b>{p.last.who}</b> {p.last.text}
        </p>
      )}
      <div className="sp-actions">
        {p.actions.map((a) => (
          <button key={a.id} type="button" className={a.recommended ? "nm-btn rec" : "nm-btn"} onClick={() => send({ type: "station_action", stationId: id, action: a.id })}>
            {a.label}
            {a.recommended && <span className="sp-pick">SPARK'S PICK</span>}
          </button>
        ))}
      </div>
    </section>
  );
}
