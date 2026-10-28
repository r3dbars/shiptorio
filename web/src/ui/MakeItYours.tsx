// "Make it yours" (docs/PRODUCT.md, Onboarding): the Build world's tools, open after the first rocket.
// Pick which agent runs each assembler, add a check to a folder, and move machines around. Every change is
// a real factory command, so the server (or the sim) has the final say on what fits.

import { useState } from "react";
import { GOAL_IDS, GOALS, type FactoryState, type Harness, type WebToServer } from "@shiptorio/shared";
import { Icon } from "./icons";
import { LEVEL_LABEL, MACHINE_NAME as NAME, SOURCE, WORDS, YOURS } from "../copy";

const LEVELS = ["advisor", "floor", "build", "lights_out"] as const;

const AGENTS: readonly { harness: Harness; name: string }[] = YOURS.agents;

// first free cell near (x, y), two cells apart like the rest of the line
export function freeNear(state: FactoryState, x: number, y: number) {
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
  const permits = state.autonomy?.districts.filter((d) => d.permit) ?? [];
  const level = state.autonomy?.level ?? "advisor";
  const below = LEVELS.slice(0, LEVELS.indexOf(level));
  const m = state.machines.find((x) => x.id === moving);
  const nudge = (dx: number, dy: number) => m && send({ type: "move_machine", id: m.id, x: m.x + dx, y: m.y + dy });

  return (
    <section className="card sheet yours" aria-label={YOURS.title}>
      <div className="sheet-top">
        <h2>{YOURS.title}</h2>
        <button type="button" className="hud-iconbtn" onClick={onClose} aria-label={WORDS.close}>
          <Icon name="cross" size={14} />
        </button>
      </div>

      {state.goals && (
        <>
          <h3>{YOURS.goal}</h3>
          <p className="empty">{YOURS.goalWhy(state.goals.by !== "player")}</p>
          <div className="lrow">
            <span className="seg goals" role="group" aria-label={YOURS.goalPick}>
              {GOAL_IDS.map((id) => (
                <button key={id} type="button" aria-pressed={state.goals!.by === "player" && state.goals!.picks[0] === id} onClick={() => send({ type: "set_goals", picks: [id] })}>
                  {GOALS[id].label}
                </button>
              ))}
            </span>
          </div>
        </>
      )}

      <h3>{YOURS.whoBuilds}</h3>
      {assemblers.length === 0 && <p className="empty">{YOURS.noAssemblers}</p>}
      {assemblers.map((a) => (
        <div className="lrow" key={a.id}>
          <span className="tt">
            {a.id}
            <code>{a.district ? `/${a.district}` : YOURS.anyFolder}</code>
          </span>
          <span className="seg" role="group" aria-label={YOURS.agentFor(a.id)}>
            {AGENTS.map((ag) => (
              <button
                key={ag.harness}
                type="button"
                aria-pressed={a.harness === ag.harness}
                disabled={a.state === "working"}
                title={plugged(ag.harness) ? undefined : YOURS.notPlugged(ag.name)}
                onClick={() => send({ type: "set_harness", machineId: a.id, harness: ag.harness })}
              >
                {ag.name}
              </button>
            ))}
          </span>
        </div>
      ))}

      {below.length > 0 && (
        <>
          <h3>{YOURS.level}</h3>
          <p className="empty">{YOURS.levelNow(LEVEL_LABEL[level])}</p>
          <div className="lrow">
            <span className="seg" role="group" aria-label={YOURS.level}>
              {below.map((l) => (
                <button key={l} type="button" onClick={() => send({ type: "set_autonomy", level: l })}>
                  {YOURS.levelDown(LEVEL_LABEL[l])}
                </button>
              ))}
            </span>
          </div>
        </>
      )}

      {permits.length > 0 && (
        <>
          <h3>{YOURS.permits}</h3>
          <p className="empty">{YOURS.permitsWhy}</p>
          {permits.map((d) => (
            <div className="lrow" key={d.district}>
              <span className="tt">
                <code>/{d.district}</code>
              </span>
              <button
                type="button"
                className="btn"
                style={{ flex: "none", minHeight: 36 }}
                aria-label={YOURS.permitOffFor(d.district)}
                onClick={() => send({ type: "set_autonomy", district: d.district, permit: false })}
              >
                {YOURS.permitOff}
              </button>
            </div>
          ))}
        </>
      )}

      <h3>{YOURS.addCheck}</h3>
      <p className="empty">{YOURS.addCheckWhy}</p>
      {folders.map((d) => {
        const spot = insp ? freeNear(state, insp.x, insp.y) : null;
        return (
          <div className="lrow" key={d.name}>
            <span className="tt">
              {YOURS.turret}
              <code>/{d.name}</code>
            </span>
            <button
              type="button"
              className="btn"
              style={{ flex: "none", minHeight: 36 }}
              disabled={!spot}
              onClick={() => spot && send({ type: "place_machine", machineType: "turret", x: spot.x, y: spot.y, district: d.name })}
            >
              {YOURS.add}
            </button>
          </div>
        );
      })}

      <h3>{YOURS.move}</h3>
      <div className="lrow">
        <select className="pickm" aria-label={YOURS.moveWhich} value={moving} onChange={(e) => setMoving(e.target.value)}>
          {movable.map((x) => (
            <option key={x.id} value={x.id}>
              {NAME[x.type] ?? x.type} · {x.id}
            </option>
          ))}
        </select>
        <span className="seg" role="group" aria-label={YOURS.moveGroup}>
          <button type="button" onClick={() => nudge(-2, 0)} aria-label={YOURS.moveLeft}>←</button>
          <button type="button" onClick={() => nudge(0, -2)} aria-label={YOURS.moveUp}>↑</button>
          <button type="button" onClick={() => nudge(0, 2)} aria-label={YOURS.moveDown}>↓</button>
          <button type="button" onClick={() => nudge(2, 0)} aria-label={YOURS.moveRight}>→</button>
        </span>
      </div>
    </section>
  );
}

// An empty mine on the map, tapped: what connecting it adds, and how.
const SOURCE_COPY: Record<string, { name: string; adds: string }> = { sentry: SOURCE.sentry, posthog: SOURCE.posthog, email: SOURCE.email };

export function ConnectSource({ kind, state, send, onClose }: { kind: string; state: FactoryState; send: (m: WebToServer) => void; onClose: () => void }) {
  const copy = SOURCE_COPY[kind] ?? { name: kind, adds: "" };
  const status = state.sources?.find((x) => (x.kind as string) === kind);
  const connected = status?.state === "connected" || state.machines.some((m) => m.id === `ore-${kind}`);
  return (
    <section className="card sheet" aria-label={SOURCE.connect(copy.name)}>
      <div className="sheet-top">
        <h2>{connected ? SOURCE.connected(copy.name) : SOURCE.connect(copy.name)}</h2>
        <button type="button" className="hud-iconbtn" onClick={onClose} aria-label={WORDS.close}>
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
              {SOURCE.open(copy.name)}
            </a>
          )}
        </>
      )}
      {!connected && !status?.setup.actionUrl && (
        <button type="button" className="btn rec" onClick={() => send({ type: "connect_source", kind: kind as never })}>
          {SOURCE.connect(copy.name)}
        </button>
      )}
    </section>
  );
}
