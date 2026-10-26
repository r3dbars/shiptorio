// "Make it yours" (docs/PRODUCT.md, Onboarding): the Build world's tools, open after the first rocket.
// Pick which agent runs each assembler, add a check to a folder, and move machines around. Every change is
// a real factory command, so the server (or the sim) has the final say on what fits.

import { useState } from "react";
import type { FactoryState, Harness, Machine, WebToServer } from "@shiptorio/shared";
import { Icon } from "./icons";

const AGENTS: { harness: Harness; name: string }[] = [
  { harness: "claude_code", name: "Claude Code" },
  { harness: "codex", name: "Codex" },
];

const NAME: Partial<Record<Machine["type"], string>> = {
  splitter: "Splitter",
  assembler: "Assembler",
  inspector: "Check",
  launch_pad: "Launch pad",
  solar: "Solar",
  battery: "Battery",
  turret: "Test turret",
  steam: "Planner",
};

// first free cell near (x, y), two cells apart like the rest of the line
function freeNear(state: FactoryState, x: number, y: number) {
  for (const [dx, dy] of [[0, -4], [2, -4], [-2, -4], [0, 4], [2, 4], [-2, 4], [4, -4], [4, 4]]) {
    const nx = x + dx, ny = y + dy;
    if (!state.machines.some((m) => Math.abs(m.x - nx) < 2 && Math.abs(m.y - ny) < 2)) return { x: nx, y: ny };
  }
  return null;
}

export function MakeItYours({ state, send, onClose }: { state: FactoryState; send: (m: WebToServer) => void; onClose: () => void }) {
  const assemblers = state.machines.filter((m) => m.type === "assembler");
  const movable = state.machines.filter((m) => m.type !== "ore_deposit" && m.type !== "steam");
  const [moving, setMoving] = useState<string>(movable[0]?.id ?? "");
  const plugged = (h: Harness) => state.power.some((p) => p.id === `solar-${h}` && p.online);
  const insp = state.machines.find((m) => m.type === "inspector");
  const turrets = new Set(state.machines.filter((m) => m.type === "turret").map((m) => m.district));
  const folders = state.districts.filter((d) => !turrets.has(d.name)).slice(0, 4);
  const m = state.machines.find((x) => x.id === moving);
  const nudge = (dx: number, dy: number) => m && send({ type: "move_machine", id: m.id, x: m.x + dx, y: m.y + dy });

  return (
    <section className="card sheet yours" aria-label="Make it yours">
      <div className="sheet-top">
        <h2>Make it yours</h2>
        <button type="button" className="hud-iconbtn" onClick={onClose} aria-label="Close">
          <Icon name="cross" size={14} />
        </button>
      </div>

      <h3>Who builds</h3>
      {assemblers.length === 0 && <p className="empty">No assemblers yet.</p>}
      {assemblers.map((a) => (
        <div className="lrow" key={a.id}>
          <span className="tt">
            {a.id}
            <code>{a.district ? `/${a.district}` : "any folder"}</code>
          </span>
          <span className="seg" role="group" aria-label={`Agent for ${a.id}`}>
            {AGENTS.map((ag) => (
              <button
                key={ag.harness}
                type="button"
                aria-pressed={a.harness === ag.harness}
                disabled={a.state === "working"}
                title={plugged(ag.harness) ? undefined : `${ag.name} isn't plugged in yet: pair the runner`}
                onClick={() => send({ type: "set_harness", machineId: a.id, harness: ag.harness })}
              >
                {ag.name}
              </button>
            ))}
          </span>
        </div>
      ))}

      <h3>Add a check</h3>
      <p className="empty">A test turret makes every PR in that folder pass its tests before it reaches you.</p>
      {folders.map((d) => {
        const spot = insp ? freeNear(state, insp.x, insp.y) : null;
        return (
          <div className="lrow" key={d.name}>
            <span className="tt">
              Test turret
              <code>/{d.name}</code>
            </span>
            <button
              type="button"
              className="btn"
              style={{ flex: "none", minHeight: 36 }}
              disabled={!spot}
              onClick={() => spot && send({ type: "place_machine", machineType: "turret", x: spot.x, y: spot.y, district: d.name })}
            >
              + Add
            </button>
          </div>
        );
      })}

      <h3>Move a machine</h3>
      <div className="lrow">
        <select className="pickm" aria-label="Machine to move" value={moving} onChange={(e) => setMoving(e.target.value)}>
          {movable.map((x) => (
            <option key={x.id} value={x.id}>
              {NAME[x.type] ?? x.type} · {x.id}
            </option>
          ))}
        </select>
        <span className="seg" role="group" aria-label="Move">
          <button type="button" onClick={() => nudge(-2, 0)} aria-label="Move left">←</button>
          <button type="button" onClick={() => nudge(0, -2)} aria-label="Move up">↑</button>
          <button type="button" onClick={() => nudge(0, 2)} aria-label="Move down">↓</button>
          <button type="button" onClick={() => nudge(2, 0)} aria-label="Move right">→</button>
        </span>
      </div>
    </section>
  );
}

// An empty mine on the map, tapped: what connecting it adds, and how.
const SOURCE_COPY: Record<string, { name: string; adds: string }> = {
  sentry: { name: "Sentry", adds: "Errors arrive as ore the moment they happen, and biters show which folder they hit. Fixes that kill biters score big." },
  posthog: { name: "PostHog", adds: "See what users really do. User signals weigh what gets built first, and your score counts the users each fix reached." },
};

export function ConnectSource({ kind, state, send, onClose }: { kind: string; state: FactoryState; send: (m: WebToServer) => void; onClose: () => void }) {
  const copy = SOURCE_COPY[kind] ?? { name: kind, adds: "" };
  const status = state.sources?.find((x) => (x.kind as string) === kind);
  const connected = status?.state === "connected" || state.machines.some((m) => m.id === `ore-${kind}`);
  return (
    <section className="card sheet" aria-label={`Connect ${copy.name}`}>
      <div className="sheet-top">
        <h2>{connected ? `${copy.name} is connected` : `Connect ${copy.name}`}</h2>
        <button type="button" className="hud-iconbtn" onClick={onClose} aria-label="Close">
          <Icon name="cross" size={14} />
        </button>
      </div>
      <p>{copy.adds}</p>
      {status && status.state !== "connected" && (
        <>
          {status.detail && <p className="empty">{status.detail}</p>}
          {status.setup.steps.length > 0 && (
            <ol className="steps">
              {status.setup.steps.map((st) => (
                <li key={st}>{st}</li>
              ))}
            </ol>
          )}
          {status.setup.actionUrl && (
            <a className="btn rec" href={status.setup.actionUrl} target="_blank" rel="noreferrer">
              Open {copy.name}
            </a>
          )}
        </>
      )}
      {!connected && !status?.setup.actionUrl && (
        <button type="button" className="btn rec" onClick={() => send({ type: "connect_source", kind: kind as never })}>
          Connect {copy.name}
        </button>
      )}
    </section>
  );
}
