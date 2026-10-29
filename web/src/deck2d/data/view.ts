// The 2D deck's data side (facelift plan https://claude.ai/artifact/APbJAp64ymtzegrTv2wUfQ). One pure function turns a
// FactoryState, live or sim, into the contract's DeckView (../contract.ts): seven stops left to right with their crates,
// the one card waiting on you, and what Shippy is doing. The engine only ever reads DeckView.
//
// The story it has to tell (locked 2026-10-28): software is a factory, it's waiting on your calls, swipe and it moves,
// approve twice more and it's automatic.

import { attentionOf, continueOption, type FactoryState, type Item as FactoryItem, type Move, type Stage, type StationKind } from "@shiptorio/shared";
import { LEARN } from "../../copy";
import { STOP_LABEL, STOPS, type CardView, type DeckView, type Item, type ShippyView, type Stop, type StopId, type StopState } from "../contract";
import type { AttentionView } from "../stations/attention";

/** CardView plus what the card UI must know to stay safe. hold = merges real code: a held press, never a flick. */
export interface LiveCardView extends CardView {
  hold: boolean;
  setup: boolean; // plugs in a local agent: Approve opens Power setup instead of sending the move
  attention: "approve" | "steer" | "suggest";
  waitingCards: number; // cards in the deck, this one included
}
export interface LiveDeckView extends AttentionView {
  card: LiveCardView | null;
  intake?: (Item & { badge: string })[];
  work?: { id: string; title: string; stop: StopId; badge: string; status: string; auto?: boolean }; // auto: Shippy started it, no card
  followItem?: string;
}

export interface DeckOpts {
  now?: number; // Date.now(), for the short lever / happy beats
  pulled?: { stop: StopId; at: number } | null; // the last Approve, so Shippy pulls the lever there
  completed?: { stop: StopId; at: number } | null; // a real job completed at the station he was attending
  hidden?: ReadonlySet<string>; // cards answered here that the server hasn't dropped yet
  selectedStop?: StopId | null; // clicking a yellow machine selects its real pending decision
  visualFlow?: boolean;
  activeItemId?: string | null;
}

const LEVER_MS = 1200;
const HAPPY_MS = 4000;
export const FIRST_LINE = "Approve it and it moves.";

const STAGE_STOP: Record<Stage, StopId> = { intake: "repo", triage: "planner", build: "builder", resources: "builder", power: "builder", inspect: "checks", pad: "gate", release: "launch", impact: "launch" };
const STATION_STOP: Partial<Record<StationKind, StopId>> = { ci: "checks", verify: "checks", custom: "checks", review: "review", merge: "gate", orbit: "launch", measure: "launch" };
const MACHINE_STOP: Record<string, StopId> = { ore_deposit: "repo", splitter: "planner", assembler: "builder", inspector: "checks", launch_pad: "gate" };
// The suggested option's tool says best where a card is parked. start_job is the sim's name for approving a build.
const TOOL_STOP: Record<string, StopId> = {
  plan_runner_job: "planner", approve_runner_job: "builder", start_job: "builder", request_rework: "builder",
  run_missing_check: "checks", request_merge: "gate", connect_source: "repo", triage: "planner",
};
const KIND_STOP: Partial<Record<NonNullable<Move["kind"]>, StopId>> = { build: "builder", verify: "checks", review: "review", ship: "gate", input: "repo", reply: "repo" };
// learned keys end in the suggested tool (server/src/learn.ts learnKey): which stop a learned kind takes off your hands
const LEARN_STOP: Record<string, StopId> = { plan_runner_job: "planner", approve_runner_job: "builder", start_job: "builder" };
const learnedStop = (key: string) => LEARN_STOP[key.split("|").at(-1) ?? ""];

/** Where an item sits on the line. Rework rides back to the builder; a settled launch has left the deck. */
export function itemStop(item: FactoryItem): StopId | null {
  switch (item.state) {
    case "ore": return "repo";
    case "queued": return "planner";
    case "working":
    case "rejected": return "builder";
    case "inspecting": {
      const pending = item.inspection?.stages.find((g) => g.state === "pending")?.gate;
      return pending === "ai" ? "review" : pending === "human" ? "gate" : "checks";
    }
    case "passed":
    case "on_pad": return "gate";
    case "launched": return item.orbit?.state === "watching" ? "launch" : null;
  }
}

function placeStop(s: FactoryState, id: string | undefined): StopId | null {
  if (!id) return null;
  const st = s.stations?.find((x) => x.id === id || x.machineId === id);
  if (st) return STATION_STOP[st.kind] ?? null;
  const m = s.machines.find((x) => x.id === id);
  if (m) return MACHINE_STOP[m.type] ?? null;
  const it = s.items.find((x) => x.id === id);
  return it ? itemStop(it) : null;
}

/** Which stop a card is about: its suggested tool, its kind, the item it moves, where it focuses, its stage. */
export function cardStop(s: FactoryState, move: Move): StopId {
  const tool = continueOption(move).actions[0]?.tool;
  const item = move.itemId ? s.items.find((x) => x.id === move.itemId) : undefined;
  return (tool && TOOL_STOP[tool]) || (move.kind && KIND_STOP[move.kind]) || (item && itemStop(item)) || placeStop(s, move.focus) || (move.stage && STAGE_STOP[move.stage]) || "repo";
}

export const isLaunchCard = (m: Move) => continueOption(m).actions.some((a) => a.tool === "request_merge");
export const isSetupCard = (m: Move) => continueOption(m).actions.some((a) => a.tool === "connect_source" && (a.args.kind === "claude" || a.args.kind === "codex"));
/** Only show the agent on recommendations with matching Meta evidence, never from copy alone. */
export function metaGuided(s: FactoryState, move: Move): boolean {
  if (continueOption(move).actions.some(a => a.tool === "connect_source")) return false;
  if (s.holdingBack?.by === "spark" && move.id === `unlock:${s.holdingBack.id}`) return true;
  const tools = continueOption(move).actions.map(a => a.tool);
  const decision = tools.includes("approve_runner_job") ? "plan" : tools.includes("request_rework") ? "review" : null;
  if (!decision || !move.itemId) return false;
  // Latest decision wins: a newer fallback must not inherit an earlier successful model call.
  const thought = s.brain?.thoughts.filter(t => t.itemId === move.itemId && t.decision === decision)
    .sort((a, b) => b.at - a.at)[0];
  return thought?.by === "spark";
}

const RANK = { steer: 0, approve: 1, suggest: 2 } as const;

/** The one card: setup first (nothing moves without an agent), then stuck, then parked, then ideas, in deck order. */
export function pickCard(deck: readonly Move[]): Move | null {
  const rank = (m: Move) => (isSetupCard(m) ? -1 : RANK[attentionOf(m)]);
  let best: Move | null = null;
  for (const m of deck) if (!best || rank(m) < rank(best)) best = m;
  return best;
}

function built(s: FactoryState, stop: StopId): boolean {
  const kinds = new Set(s.stations?.map((x) => x.kind) ?? []);
  const has = (t: string) => s.machines.some((m) => m.type === t);
  switch (stop) {
    case "repo": return !!s.repo;
    case "planner": return s.machines.length > 0; // every factory plans once anything is built
    case "builder": return has("assembler");
    case "checks": return kinds.has("ci") || kinds.has("verify") || kinds.has("custom") || has("inspector");
    case "review": return kinds.has("review");
    case "gate":
    case "launch": return kinds.has("merge") || has("launch_pad");
  }
}

/** Stops the player handed to Shippy: a learned kind of card, an autonomy level, a launch permit. */
function handedStops(s: FactoryState): Set<StopId> {
  const out = new Set<StopId>();
  for (const l of s.learned ?? []) {
    const stop = learnedStop(l.key);
    if (stop) out.add(stop);
  }
  const level = s.autonomy?.level;
  if (level === "build" || level === "lights_out") out.add("planner").add("builder");
  if (level === "lights_out" || s.autonomy?.districts.some((d) => d.permit)) out.add("gate").add("launch");
  return out;
}

function jamStop(s: FactoryState, attention: ReadonlySet<StopId>): StopId | null {
  // A queue or approval is not a fault. Red requires an actual reported failure.
  if (s.sources?.some(source => source.state === "error")) return "repo";
  if (s.items.some(item => item.state === "rejected")) return "builder";
  const machine = s.machines.find(m => m.state === "blocked" && MACHINE_STOP[m.type] && !attention.has(MACHINE_STOP[m.type]));
  return machine ? MACHINE_STOP[machine.type] : null;
}

function crate(it: FactoryItem, jammed: boolean): Item & { badge: string } {
  const look: Item["look"] = jammed ? "wait" : it.state === "rejected" ? "bad" : it.state === "passed" || it.state === "on_pad" || it.state === "launched" ? "ok" : it.priority === "rush" ? "glow" : "plain";
  return { id: it.id, title: it.title, look, badge: it.prNumber ? `PR${it.prNumber}` : `#${it.id.replace(/^gh-/, '')}` };
}

/** Pending issues stay in the inbox pile until a real planning/build job starts. */
export function workStop(s: FactoryState, item: FactoryItem): StopId | null {
  if (item.prNumber || ["working", "rejected", "launched"].includes(item.state)) return itemStop(item);
  const step = s.pipeline?.find(p => p.itemIds.includes(item.id) && !["idle", "done"].includes(p.state) && p.cause !== "plan_required");
  return step ? step.cause === "approval_required" ? "builder" : step.id : null;
}

export function deckView(s: FactoryState | null, opts: DeckOpts = {}): LiveDeckView {
  const now = opts.now ?? Date.now();
  if (!s) return { stops: STOPS.map((id) => ({ id, built: false, state: "idle", automated: false, items: [] })), jam: null, card: null, shippy: { pose: "folded", at: "corner" }, shipped: 0, caption: null };

  const deck = (s.deck?.length ? s.deck : s.move ? [s.move] : []).filter((m) => !opts.hidden?.has(m.id));
  const flow = opts.visualFlow === true;
  // A focus is guidance, not a red fault. Discard a pick whose work has disappeared.
  const focus = flow && s.liveBottleneck && (!s.liveBottleneck.itemId || s.items.some(it => it.id === s.liveBottleneck!.itemId && it.state !== "launched")) ? s.liveBottleneck : null;
  const candidates = s.items.filter(it => workStop(s, it));
  const ongoing = candidates.filter(it => it.state !== 'launched');
  const selectable = ongoing.length ? ongoing : candidates;
  const active = flow ? candidates.find(it => it.id === opts.activeItemId) ?? candidates.find(it => it.id === focus?.itemId) ?? selectable.sort((a, b) => b.updatedAt - a.updatedAt)[0] : undefined;
  const activeStop = active && workStop(s, active);
  const relevant = focus?.itemId ? deck.filter(m => m.itemId === focus.itemId || isSetupCard(m)) : active ? deck.filter(m => m.itemId === active.id || isSetupCard(m)) : deck;
  const move = (opts.selectedStop && pickCard(relevant.filter(m => cardStop(s, m) === opts.selectedStop))) || pickCard(relevant);
  // green means you handed it over (beat 4), so CI and AI review, which never asked you, stay plain working / idle
  const handed = handedStops(s);
  const attention = new Set<StopId>(relevant.map(m => flow && continueOption(m).actions.some(a => a.tool === "plan_runner_job") ? "repo" : cardStop(s, m)));
  if (s.sources?.some(source => source.state === "needs_action")) attention.add("repo");
  if (s.items.some(it => it.state === "inspecting" && itemStop(it) === "gate" && !it.inspection?.humanApproved)) attention.add("gate");
  const jam = jamStop(s, attention);
  if (jam) attention.delete(jam);
  const busy = new Set(s.machines.filter((m) => m.state === "working").map((m) => MACHINE_STOP[m.type]));
  const at = new Map<StopId, FactoryItem[]>(STOPS.map((id) => [id, []]));
  // front of the line first: the oldest crate at a stop is the next one out
  if (active && activeStop) at.get(activeStop)!.push(active);
  if (!flow) for (const it of [...s.items].sort((a,b) => a.updatedAt - b.updatedAt)) { const stop = itemStop(it); if (stop) at.get(stop)!.push(it); }
  const intake = (flow ? s.items : []).filter(it => it.id !== active?.id && ["ore", "queued"].includes(it.state)).map(it => crate(it, false));

  const stops: Stop[] = STOPS.map((id) => {
    const here = at.get(id)!;
    const jammed = jam === id;
    const automated = handed.has(id);
    const held = active && s.pipeline?.some(p => p.itemIds.includes(active.id) && p.state === "waiting_player");
    const state: StopState = jammed ? "jammed" : attention.has(id) || here.length && held ? "idle" : automated ? "auto" : here.length || busy.has(id) && (!flow || id === activeStop) ? "working" : "idle";
    const stop: Stop = { id, built: built(s, id) || here.length > 0 || jammed, state, automated, items: here.map((it) => flow ? crate(it, jammed) : (({ badge, ...plain }) => plain)(crate(it, jammed))) };
    if (jammed) stop.waiting = `${STOP_LABEL[id].toUpperCase()} WAITING`;
    return stop;
  });

  let card: LiveCardView | null = null;
  if (move) {
    const learn = move.learn ?? null;
    card = {
      id: move.id,
      title: move.title,
      stop: flow && continueOption(move).actions.some(a => a.tool === "plan_runner_job") ? "repo" : cardStop(s, move),
      dots: learn ? { have: learn.have, need: learn.need } : null,
      line: !flow ? (learn ? LEARN.line(Math.max(1, learn.need - learn.have)) : move.why || FIRST_LINE) : `Shippy: ${move.why || FIRST_LINE}${move.plan?.find(p => p.startsWith('Files:')) ? ` ${move.plan.find(p => p.startsWith('Files:'))}` : ''}${learn ? ` ${LEARN.line(Math.max(1, learn.need - learn.have))}` : ''}`,
      yes: !flow ? undefined : isLaunchCard(move) ? "Ship it" : continueOption(move).actions.some(a => a.tool === "plan_runner_job") ? "Start issue" : continueOption(move).actions.some(a => a.tool === "approve_runner_job") ? "Start build" : "Continue",
      no: flow ? "Later" : undefined,
      hold: isLaunchCard(move),
      setup: isSetupCard(move),
      guide: metaGuided(s, move) ? "shippy" : undefined,
      attention: attentionOf(move),
      waitingCards: deck.length,
    };
  }

  const shipped = s.metrics?.rockets ?? s.items.filter((it) => it.state === "launched").length;
  const status = activeStop ? s.pipeline?.find(p => p.id === activeStop && p.itemIds.includes(active!.id))?.state ?? 'working' : '';
  const auto = !!active && (s.learned ?? []).some(l => l.items?.includes(active.id));
  const work = active && activeStop ? { id: active.id, title: active.title, stop: activeStop, badge: crate(active, false).badge, status, ...(auto ? { auto } : {}) } : undefined;
  // The climax wins the one caption line: the next one of a learned kind started with no card.
  const caption = flow && work?.auto && !card ? LEARN.ranItself(work.badge) : focus?.reason ?? (!flow ? (card ? null : handed.size ? "Shippy has this. Fix the next jam." : "Software is a factory.") : work ? `${work.badge} · ${work.title} · ${STOP_LABEL[work.stop]}${status === 'waiting_player' ? ' needs your approval' : ' is working'}` : `${intake.length} issues waiting in Repo. Choose one to start.`);
  // Keep the existing one-shot level-up celebration even while its first automatic crate starts work.
  const leveledUp = (s.learned ?? []).some(l => now >= l.since && now - l.since < HAPPY_MS);
  return { stops, jam, focus: focus?.stop, attention: [...attention], card, intake, work, shippy: work && !card && !leveledUp ? { at: work.stop, pose: work.stop === 'builder' ? 'weld' : 'inspect' } : shippyOf(s, stops, jam, card, opts, now), shipped, caption };
}

function shippyOf(s: FactoryState, stops: Stop[], jam: StopId | null, card: CardView | null, opts: DeckOpts, now: number): ShippyView {
  if (opts.pulled && now - opts.pulled.at < LEVER_MS) return { pose: "lever", at: opts.pulled.stop };
  // a kind of work just went automatic, or a rocket just left: beat 4's payoff
  const fresh = (s.learned ?? []).filter((l) => now - l.since < HAPPY_MS).sort((a, b) => b.since - a.since)[0];
  if (fresh) return { pose: "happy", at: learnedStop(fresh.key) ?? "corner" };
  if (s.items.some((it) => it.state === "launched" && now - it.updatedAt < HAPPY_MS)) return { pose: "happy", at: "gate" };
  if (jam && card) return { pose: "alarmed", at: jam };
  if (card) return { pose: "inspect", at: card.stop };
  if (opts.completed && now - opts.completed.at < LEVER_MS) return { pose: "happy", at: opts.completed.stop };

  // These are animations of work the factory has already started, not new work
  // decisions. Rejected or blocked items do not become a repair until a job runs.
  const waitingForHuman = (it: FactoryItem) => it.state === "inspecting" && itemStop(it) === "gate" && !it.inspection?.humanApproved;
  const active = s.items.filter(it => it.state === "working" || (it.state === "inspecting" && !waitingForHuman(it))).sort((a, b) => a.updatedAt - b.updatedAt);
  const busy = stops.filter(stop => s.machines.some(machine => machine.state === "working" && MACHINE_STOP[machine.type] === stop.id));
  const workingAt = (stop: StopId) => active.some(it => itemStop(it) === stop) || busy.some(s => s.id === stop);
  const workPose = (at: StopId): ShippyView => ({ at, pose: at === "builder" ? "weld" : "inspect" });
  const target = placeStop(s, s.foreman?.targetId);
  if (target && workingAt(target)) return workPose(target);
  if (target && s.foreman?.thinking) return { pose: "inspect", at: target };
  if (active.length) return workPose(itemStop(active[0])!);
  if (busy.length) return workPose(busy[0].id);
  if (jam) return { pose: "alarmed", at: jam };
  if (s.items.some(waitingForHuman)) return { pose: "alarmed", at: "gate" };
  const blocked = s.machines.find(machine => machine.state === "blocked" && MACHINE_STOP[machine.type]);
  if (blocked) return { pose: "alarmed", at: MACHINE_STOP[blocked.type] };
  const rejected = s.items.find(it => it.state === "rejected");
  if (rejected) return { pose: "alarmed", at: "builder" };
  return { pose: "folded", at: "corner" };
}
