// What a quiet machine on the shaft is waiting on, in plain words, read off the real factory. A machine with
// nothing in hand never just says IDLE: the next real item up the line is either on its way ("NEXT UP") or parked
// on the player's card at a machine that needs them ("WAITING ON YOU"), and with nothing anywhere upstream the
// machine is simply ready for work. The HUD chips use it (hud.ts).

import type { FactoryState, Item } from "@shiptorio/shared";

import type { Plan } from "./layout";

export interface Work {
  at: number; // how far up the line, in station order (planner 0, builders 1, checks 2.., gate, pad, orbit)
  station: string | null; // the shaft station holding it in the real factory (null: still in the mine)
  label: string; // "#141", or what kind of work it is
}

export interface Quiet {
  word: string;
  det: string;
}

export const WORDS = { next: "NEXT UP", you: "WAITING ON YOU", ready: "READY", watch: "WATCHING" } as const;

/** each line station's place: planner 0, every builder 1, then the checks in order, the gate, the pad, orbit and measure */
export function lineOrder(plan: Plan): Map<string, number> {
  const at = new Map<string, number>();
  let n = 0;
  if (plan.planner) at.set(plan.planner.id, n++);
  if (plan.assemblers?.length) {
    for (const a of plan.assemblers) at.set(a.id, n);
    n++;
  }
  for (const c of plan.checks ?? []) at.set(c.id, n++);
  for (const s of [plan.gate, plan.pad, plan.orbit, plan.measure]) if (s) at.set(s.id, n++);
  return at;
}

/** a real item, as the words name it: its PR or issue number, else just "new work" */
export function workLabel(r: Pick<Item, "id" | "prNumber">): string {
  if (r.prNumber) return `#${r.prNumber}`;
  const gh = /^gh-(\d+)$/.exec(r.id);
  return gh ? `#${gh[1]}` : "new work";
}

/** where each real item stands on the line (launched work is done with the line and left out) */
export function workOnLine(items: Item[], plan: Plan, order: Map<string, number>): Work[] {
  const planner = plan.planner?.id ?? null;
  const gate = plan.gate?.id ?? null;
  const out: Work[] = [];
  for (const r of items) {
    let station: string | null = null;
    let at: number;
    switch (r.state) {
      case "ore":
        at = -1;
        break;
      case "rejected": // riding the rework belt back down to the planner
        at = -0.5;
        station = planner;
        break;
      case "queued":
        at = 0;
        station = planner;
        break;
      case "working":
      case "inspecting": {
        station = r.machineId && order.has(r.machineId) ? r.machineId : null;
        at = station ? order.get(station)! : r.state === "working" ? 1 : 2;
        break;
      }
      case "passed":
      case "on_pad":
        station = gate;
        at = gate ? order.get(gate)! : order.size;
        break;
      default:
        continue;
    }
    out.push({ at, station, label: workLabel(r) });
  }
  return out;
}

/**
 * The machines waiting on the player, read off the real factory alone (the panels; the map asks its own stations,
 * which also count the open cards): a machine the factory reports blocked, and the gate while work sits on the pad.
 */
export function parkedIn(state: Pick<FactoryState, "items" | "machines" | "stations">, plan: Plan): (station: string) => boolean {
  const out = new Set<string>();
  const stationOf = new Map((state.stations ?? []).filter((s) => s.machineId).map((s) => [s.machineId!, s.id]));
  for (const m of state.machines) if (m.state === "blocked") out.add(stationOf.get(m.id) ?? m.id);
  if (plan.gate && state.items.some((i) => i.state === "on_pad")) out.add(plan.gate.id);
  return (id) => out.has(id);
}

/**
 * What a quiet machine at line place `at` is waiting on: the nearest real work at or below it. If that work sits at
 * a machine that is waiting on the player (`parked`), so is this one. Null: nothing is coming at all.
 */
export function quietWord(at: number, work: Work[], parked: (station: string) => boolean, self?: string): Quiet | null {
  let best: Work | null = null;
  let bestParked = false;
  for (const w of work) {
    if (w.at > at) continue;
    // work the real factory already has at this machine, while the map's copy is still riding up to it, is on its way
    const p = !!w.station && w.station !== self && parked(w.station);
    if (!best || w.at > best.at || (w.at === best.at && p && !bestParked)) (best = w), (bestParked = p);
  }
  if (!best) return null;
  if (bestParked) return { word: WORDS.you, det: `${best.label} is on your card` };
  return { word: WORDS.next, det: `${best.label} on its way` };
}
