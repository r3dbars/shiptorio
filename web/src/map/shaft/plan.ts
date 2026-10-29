// What the shaft builds for a real factory: which planner, assemblers, checks, gate, pad, mines and power plants
// stand in it, read off FactoryState. Shaft station ids are the real ids (machine ids for machines, station ids
// for gauntlet stations), so a click on the map opens the same panel the island map opens.

import type { FactoryState, Machine, Station } from "@shiptorio/shared";

import type { Plan } from "./layout";
const MINE_OF_SOURCE: Record<string, string> = { github: "github", sentry: "sentry", posthog: "posthog", email: "inbox" };
// a mine with nothing connected yet is a dim ghost mine; tapping it asks you to connect that source
export const GHOST_KEY: Record<string, string> = { sentry: "src:sentry", posthog: "src:posthog", inbox: "src:email" };

const HARNESS_NAME: Record<string, string> = { claude_code: "CLAUDE CODE", codex: "CODEX", local: "LOCAL MODEL", cursor: "CURSOR", grok: "GROK", spark: "PLANNER" };
const CHECK_KINDS = new Set(["ci", "custom", "verify", "review"]);

export function oreMine(m: Machine): string {
  if (m.id.includes("sentry")) return "sentry";
  if (m.id.includes("inbox")) return "inbox";
  if (m.id.includes("posthog")) return "posthog";
  return "github";
}

// a pick key the game's panels open (districts and the drone have no panel)
export const clickable = (key: string) => !!key && !key.startsWith("d:") && key !== "drone";

/** The cart (a real item riding a belt, rail or lift) nearest a tap, within reach of a finger. Its key opens the cart's
 *  callout (Rush / Park, docs/GAMEPLAY-PICKS.md r3-rush). Points are the carts' screen positions in CSS pixels. */
export function cartAt(carts: { ref: string; x: number; y: number }[], x: number, y: number, reach = 22): string | undefined {
  let best: string | undefined, d = reach;
  for (const c of carts) {
    const dd = Math.hypot(c.x - x, c.y - y);
    if (dd <= d) (d = dd), (best = c.ref);
  }
  return best && `item:${best}`;
}

export interface ShaftPlan {
  plan: Plan;
  key: string; // changes only when the shaft must be rebuilt
  labels: Record<string, string>; // chip names
  pick: Record<string, string>; // shaft station id -> the key the game's panels open ("ci-1", "m:assembler-1")
  mines: Record<string, string | undefined>; // mine -> its ore deposit machine id (absent: a ghost mine)
}

/** what a click on a mine opens: its ore deposit machine, nothing (connected, no machine), or "connect this source" */
export function mineKey(sp: ShaftPlan, src: string): string | undefined {
  const id = sp.mines[src];
  if (id) return `m:${id}`;
  if (src in sp.mines) return undefined;
  return GHOST_KEY[src];
}

// The gauntlet in line order. Old servers without stations: guess from the inspector machines.
export function lineOf(state: FactoryState): { id: string; kind: Station["kind"]; check?: string; name: string; station: boolean }[] {
  if (state.stations?.length)
    return state.stations.filter((s) => CHECK_KINDS.has(s.kind)).map((s) => ({ id: s.id, kind: s.kind, check: s.kind === "custom" ? s.id.replace(/^check-/, "") : undefined, name: s.name, station: true }));
  return state.machines
    .filter((m) => m.type === "inspector" && !/orbit|measure|gate/.test(m.id))
    .sort((a, b) => a.x - b.x)
    .map((m) => {
      const kind: Station["kind"] = m.id.includes("verify") ? "verify" : m.id.includes("review") ? "review" : m.id.startsWith("check-") ? "custom" : "ci";
      return { id: m.id, kind, check: kind === "custom" ? m.id.replace(/^check-/, "") : undefined, name: kind.toUpperCase(), station: false };
    });
}

export function planFromState(state: FactoryState): ShaftPlan {
  const ms = state.machines;
  const labels: Record<string, string> = {};
  const pick: Record<string, string> = {};
  const stationById = new Map((state.stations ?? []).map((s) => [s.id, s]));
  const keyOf = (id: string) => (stationById.has(id) ? id : ms.some((m) => m.id === id) ? `m:${id}` : "");

  const splitter = ms.find((m) => m.type === "splitter");
  const planner = { id: splitter?.id ?? "planner" };
  labels[planner.id] = "PLANNER";

  const asms = ms.filter((m) => m.type === "assembler").slice(0, 3);
  const assemblers = asms.map((m) => ({ id: m.id, harness: m.harness ?? undefined }));
  for (const a of asms) labels[a.id] = a.harness ? `${HARNESS_NAME[a.harness] ?? a.harness.toUpperCase()} ASSEMBLER` : "ASSEMBLER";

  const line = lineOf(state);
  const checks = line.map((c) => ({ id: c.id, kind: c.kind, check: c.check }));
  for (const c of line) labels[c.id] = c.kind === "ci" ? "CI INSPECTOR" : c.kind === "verify" ? "VERIFY BAY" : c.kind === "review" ? "AI REVIEW" : `${(c.check ?? "custom").toUpperCase()} CHECK`;

  const merge = state.stations?.find((s) => s.kind === "merge");
  const gate = { id: merge?.id ?? "gate-1" };
  labels[gate.id] = "MERGE GATE";
  const padM = ms.find((m) => m.type === "launch_pad");
  const pad = { id: padM?.id ?? "launch-pad" };
  labels[pad.id] = "LAUNCH PAD";
  const orbitS = state.stations?.find((s) => s.kind === "orbit");
  const orbit = orbitS ? { id: orbitS.id } : null;
  if (orbit) labels[orbit.id] = "ORBIT WATCH";
  const measureS = state.stations?.find((s) => s.kind === "measure");
  const measure = measureS ? { id: measureS.id } : null;
  if (measure) labels[measure.id] = "MEASURE";

  // mines: GitHub always; the others when a deposit stands or the source is connected
  const mines: Record<string, string | undefined> = { github: undefined };
  for (const m of ms) if (m.type === "ore_deposit") mines[oreMine(m)] = m.id;
  for (const s of state.sources ?? []) if (s.state === "connected" && MINE_OF_SOURCE[s.kind] && !(MINE_OF_SOURCE[s.kind] in mines)) mines[MINE_OF_SOURCE[s.kind]] = undefined;
  const sources = Object.keys(mines);

  // power: the planner's boiler, a dynamo per subscription (behind the assembler it feeds), batteries, geothermal
  const power: NonNullable<Plan["power"]> = [];
  const fed = (plantId: string) => asms.filter((a) => a.powerId === plantId).map((a) => a.id);
  for (const m of ms) {
    if (m.type === "steam") power.push({ id: m.id, type: "steam", feeds: [planner.id] });
    else if (m.type === "solar") power.push({ id: m.id, type: "dynamo", feeds: fed(m.id), harness: m.id.replace(/^solar-/, "") });
    else if (m.type === "geothermal") power.push({ id: m.id, type: "geothermal", feeds: fed(m.id) });
  }
  // a plant the live server only reports in state.power still gets a building
  for (const p of state.power)
    if (!power.some((x) => x.id === p.id)) {
      if (p.kind === "steam") power.push({ id: p.id, type: "steam", feeds: [planner.id] });
      else if (p.kind === "geothermal") power.push({ id: p.id, type: "geothermal", feeds: fed(p.id) });
      else if (fed(p.id).length) power.push({ id: p.id, type: "dynamo", feeds: fed(p.id), harness: p.name });
    }
  for (const m of ms) if (m.type === "battery") power.push({ id: m.id, type: "battery", feeds: m.powerId ? fed(m.powerId).slice(0, 1) : asms.slice(0, 1).map((a) => a.id) });
  // one plant per spot: a second dynamo on the same assembler would stand inside the first
  const seen = new Set<string>();
  const plants = power.filter((p) => {
    const spot = `${p.type}:${p.type === "steam" || p.type === "geothermal" ? "" : (p.feeds ?? [])[0] ?? ""}`;
    if (seen.has(spot)) return false;
    seen.add(spot);
    return true;
  });
  for (const p of plants) labels[p.id] = p.type === "dynamo" ? "DYNAMO" : p.type.toUpperCase();

  const plan: Plan = { planner, assemblers, checks, gate, pad, orbit, measure, sources, power: plants };
  for (const id of Object.keys(labels)) {
    const k = keyOf(id);
    if (k) pick[id] = k;
  }
  const key = JSON.stringify([planner.id, assemblers, checks, gate.id, pad.id, orbit?.id, measure?.id, sources, plants.map((p) => [p.id, p.type, p.feeds])]);
  return { plan, key, labels, pick, mines };
}
