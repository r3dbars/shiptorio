// The factory as text: everything the 3D map shows, as lists a keyboard or screen reader can walk.
// Each row opens the same panel a click on the map does. Opens from the list button in the top bar, or T.

import type { FactoryState, Item, Machine } from "@shiptorio/shared";
import { lc } from "../sim/engine";
import { MACHINE_COPY } from "./stationCopy";
import { Icon } from "./icons";

const STATE_WORD: Record<Item["state"], string> = {
  ore: "waiting in the mine",
  queued: "queued",
  working: "being built",
  inspecting: "being checked",
  rejected: "on the rework belt",
  passed: "passed",
  on_pad: "on the pad, waiting on you",
  launched: "launched",
};

const pct = (n?: number) => (n === undefined ? undefined : `${Math.round(n * 100)}% pass`);

function machineName(m: Machine) {
  if (m.type === "assembler") return m.harness ? `${m.harness.replace("_", " ")} assembler` : "Assembler";
  const name = MACHINE_COPY[m.type]?.name ?? m.type.replace("_", " ");
  return name[0].toUpperCase() + name.slice(1);
}

// One sentence for the whole floor: also the map canvas's description.
export function factorySummary(state: FactoryState | null): string {
  if (!state) return "Loading the factory.";
  const n = (s: Item["state"][]) => state.items.filter((i) => s.includes(i.state)).length;
  const parts = [
    `${state.repo}: ${state.districts.length} folders, ${state.machines.length} machines`,
    `${n(["ore", "queued", "working", "inspecting", "rejected"])} in progress`,
    `${n(["on_pad", "passed"])} ready to launch`,
    `${n(["launched"])} shipped`,
  ];
  return `${parts.join(", ")}.${state.bottleneck?.summary ? ` Bottleneck: ${state.bottleneck.summary}.` : ""}`;
}

export function FactoryText({ state, onOpen, onClose }: { state: FactoryState; onOpen: (key: string) => void; onClose: () => void }) {
  const stationMachines = new Set(state.stations?.map((s) => s.machineId).filter(Boolean));
  const machines = state.machines.filter((m) => !stationMachines.has(m.id));
  const live = state.items.filter((i) => i.state !== "launched");
  const at = (m: Machine) => live.filter((i) => i.machineId === m.id);

  return (
    <section className="card sheet a11y-view" aria-label="Factory status">
      <div className="sheet-top">
        <h2>Factory status</h2>
        <button type="button" className="hud-iconbtn" onClick={onClose} aria-label="Close">
          <Icon name="cross" size={14} />
        </button>
      </div>
      <p className="empty">{factorySummary(state)}</p>

      {!!state.stations?.length && (
        <>
          <h3>Checks</h3>
          <ul>
            {state.stations.map((st) => (
              <li key={st.id}>
                <button type="button" className="lrow" onClick={() => onOpen(st.id)}>
                  <span className="tt">
                    {st.name}
                    <code>{[`${st.wip} in line`, pct(st.passRate), st.caughtThisWeek ? `${st.caughtThisWeek} caught this week` : undefined].filter(Boolean).join(" · ")}</code>
                  </span>
                  {st.lastLog && <span className={`pill${st.lastLog.ok ? "" : " rejected"}`}>{st.lastLog.ok ? "last: ok" : "last: failed"}</span>}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Machines</h3>
      <ul>
        {machines.map((m) => {
          const jobs = at(m);
          return (
            <li key={m.id}>
              <button type="button" className="lrow" onClick={() => onOpen(`m:${m.id}`)}>
                <span className="tt">
                  {machineName(m)}
                  {m.district && <code>/{m.district}</code>}
                </span>
                <span className="pill">{jobs.length ? `${jobs.length} job${jobs.length > 1 ? "s" : ""}` : lc(m.state)}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <h3>Work</h3>
      {live.length === 0 && <p className="empty">Nothing on the line.</p>}
      <ul>
        {live.map((i) => (
          <li key={i.id} className="lrow">
            <span className="tt">
              {i.prNumber ? `#${i.prNumber} ` : ""}
              {i.title}
              <code>{i.district}</code>
            </span>
            <span className={`pill ${i.state}`}>{STATE_WORD[i.state]}</span>
          </li>
        ))}
      </ul>

      <h3>Folders</h3>
      <ul>
        {state.districts.map((d) => (
          <li key={d.name}>
            <button type="button" className="lrow" onClick={() => onOpen(`d:${d.name}`)}>
              <span className="tt">
                /{d.name === "/" ? "" : d.name}
                <code>{d.files} files</code>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <h3>Keys</h3>
      <p className="empty">
        Tab moves between buttons, Enter picks. T this view · C sound captions · L all labels · B launch · A place · M mute · Esc close.
        On the map, arrows pan and + − zoom. In the check-in, arrows swipe: → do it, ← later, ↓ never, ↑ details.
      </p>
    </section>
  );
}
