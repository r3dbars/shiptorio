// The live check-in deck is a projection, never an executor. The DO supplies all open
// proposals and stores resolutions separately. A new proposal joins the set; it does
// not overwrite the previous card. All times/ids below are deterministic for replay.
import type { FactoryState, Item, Move, MoveKind } from "@shiptorio/shared";

// A modest, fixed bonus (weighted item-minutes) favors growing the loop without
// letting a new connection card bury an old, valuable shipping decision forever.
export const GROW_BONUS: Partial<Record<MoveKind, number>> = { verify: 10, input: 10, automate: 10 };
const FALLBACK_VALUE = { bug: 5, feature: 3, tests: 2, cleanup: 1 };
const REQUIRED = [{ gate: "ci", name: "CI inspector" }, { gate: "verify", name: "Verify bay" }, { gate: "ai", name: "AI review" }] as const;
export interface DeckRule { kind: MoveKind; scope: string }
export interface DeckOptions {
  now?: number;
  suppressedIds?: ReadonlySet<string>;
  rules?: readonly DeckRule[];
  /** The caller may supply a model-authored bottleneck proposal instead of the safe default. */
  impliedMove?: Move;
}

/** Item/district first, then source/tool scope; prefixing prevents accidental collisions. */
export function moveScope(move: Move, state: FactoryState): string {
  const item = state.items.find(i => i.id === move.itemId);
  if (item) return `district:${item.district}`;
  const source = move.options.flatMap(o => o.actions).find(a => a.tool === "connect_source")?.args.kind;
  if (typeof source === "string") return `source:${source}`;
  if (move.focus && state.districts.some(d => d.name === move.focus)) return `district:${move.focus}`;
  const tool = move.options.flatMap(o => o.actions)[0]?.tool;
  return tool ? `tool:${tool}` : `stage:${move.stage ?? "factory"}`;
}

function inferKind(move: Move): MoveKind {
  if (move.kind) return move.kind;
  const tools = move.options.flatMap(o => o.actions).map(a => a.tool);
  if (tools.some(t => t === "request_merge")) return "ship";
  if (tools.some(t => t === "connect_source")) return move.stage === "resources" ? "unblock" : "input";
  if (move.stage === "build") return "build";
  if (move.stage === "inspect") return "verify";
  if (move.stage === "pad") return "ship";
  return "unblock";
}

/** Fill optional contract fields and enforce swipe-right proof, without mutating input. */
export function enrichMove(move: Move, state: FactoryState): Move {
  const item = state.items.find(i => i.id === move.itemId);
  const kind = inferKind(move);
  const focus = move.focus ?? item?.machineId ?? (move.stage === state.bottleneck?.stage ? state.bottleneck?.stationId : undefined) ?? item?.district ?? move.stage ?? "factory";
  const grows = move.grows ?? (kind === "verify" ? ["+1 CHECK"] : kind === "input" ? ["+1 SOURCE"] : kind === "automate" ? ["+1 AUTOMATION"] : []);
  const plan = move.plan ?? move.options.find(o => o.recommended)?.actions.map(a => a.reason).filter(Boolean) ?? [];
  const enriched: Move = { ...move, kind, focus, grows, plan, options: move.options.map(o => ({ ...o, actions: o.actions.map(a => ({ ...a, args: { ...a.args } })) })) };
  // Scar/rework cards deliberately retain their existing explicit overrule behavior.
  // Only actual shipping cards get a safe default for a fast right swipe.
  if (kind !== "ship" && move.stage !== "pad") return enriched;
  const evidence = REQUIRED.map(({ gate, name }) => {
    const stamp = item?.inspection?.stages.find(s => s.gate === gate);
    return { station: name, ok: stamp?.state === "passed", note: stamp?.reason ?? "This check has not run." };
  });
  enriched.evidence = evidence;
  enriched.locked = evidence.some(e => !e.ok);
  if (!enriched.locked) return enriched;
  const missing = REQUIRED.find(({ gate }) => item?.inspection?.stages.find(s => s.gate === gate)?.state !== "passed")!;
  // A supplied fake `evidence: all green` never authorizes a merge. Read item proof.
  enriched.options = [
    { id: "run-missing-check", label: "Run the missing check", recommended: true, actions: [{ tool: "run_missing_check", args: { itemId: item?.id ?? move.itemId, gate: missing.gate }, reason: `${missing.name} must pass before a safe launch.` }] },
    ...enriched.options.map(o => ({ ...o, recommended: false })).slice(0, 2),
  ];
  return enriched;
}

export function deckScore(move: Move, state: FactoryState, now: number): number {
  const item = state.items.find(i => i.id === move.itemId);
  const value = item ? (Number.isFinite(item.value) && item.value! >= 0 ? item.value! : FALLBACK_VALUE[item.kind]) : move.stage === state.bottleneck?.stage ? Math.max(0, state.bottleneck.valueAtRisk) : 1;
  const waitMs = item ? Math.max(0, now - item.updatedAt) : move.stage === state.bottleneck?.stage ? Math.max(0, state.bottleneck.ageMs) : Math.max(0, now - move.createdAt);
  return value * waitMs / 60_000 + (GROW_BONUS[move.kind ?? inferKind(move)] ?? 0);
}

function coversBottleneck(move: Move, state: FactoryState): boolean {
  const jam = state.bottleneck;
  if (!jam) return true;
  if (jam.stationId) return move.focus === jam.stationId || state.items.find(i => i.id === move.itemId)?.machineId === jam.stationId;
  return move.stage === jam.stage;
}

function impliedBottleneckMove(state: FactoryState, now: number): Move | null {
  const jam = state.bottleneck;
  if (!jam) return null;
  const resources = jam.stage === "resources";
  return {
    id: `bottleneck:${jam.stationId ?? jam.stage}`,
    title: resources ? "Plug in Claude or ChatGPT to start building." : jam.summary,
    why: resources ? "Your subscription agents build the changes. Connect one to move the queue." : `${jam.wip} ${jam.wip === 1 ? "item is" : "items are"} waiting here. Review what will move the line forward.`,
    stage: jam.stage, focus: jam.stationId ?? jam.stage, kind: "unblock", createdAt: now,
    // Read-only fallback: the planner/DO must turn this review into an actual proposal.
    // Never fabricate a build, permit or merge decision from deterministic ranking.
    options: [{ id: "review", label: resources ? "Connect a local agent" : "Review the bottleneck", recommended: true, actions: [{ tool: resources ? "connect_source" : "review_bottleneck", args: resources ? { kind: "claude" } : { stage: jam.stage, stationId: jam.stationId }, reason: resources ? "No subscription builder is connected." : "Inspect the real queue before choosing a change." }] }],
  };
}

/**
 * candidates is authoritative: remove resolved proposals before calling. Omitting it
 * projects the existing deck/open card. Rules and deferrals are persisted by the DO;
 * this pure function respects them, deduplicates ids, enriches and ranks at most 12.
 */
export function buildDeck(state: FactoryState, candidates: readonly Move[] = [...(state.deck ?? []), ...(state.move ? [state.move] : [])], options: DeckOptions = {}): Move[] {
  const now = options.now ?? Date.now();
  const allowed = (move: Move) => !options.suppressedIds?.has(move.id) && !options.rules?.some(r => r.kind === move.kind && (r.scope === "*" || r.scope === moveScope(move, state)));
  const byId = new Map<string, Move>();
  for (const candidate of candidates) {
    const move = enrichMove(candidate, state);
    if (allowed(move)) byId.set(move.id, move);
  }
  if (state.bottleneck && ![...byId.values()].some(m => coversBottleneck(m, state))) {
    const candidate = options.impliedMove ?? impliedBottleneckMove(state, now);
    if (candidate) { const move = enrichMove(candidate, state); if (allowed(move)) byId.set(move.id, move); }
  }
  return [...byId.values()].sort((a, b) => deckScore(b, state, now) - deckScore(a, state, now) || a.createdAt - b.createdAt || a.id.localeCompare(b.id)).slice(0, 12);
}
