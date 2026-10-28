import type { Move, ServerToWeb, WebToServer } from "@shiptorio/shared";

type Decision = Extract<WebToServer, {type:"choose_move"|"defer_move"|"dismiss_move"}>;
export const isDecision = (message: WebToServer): message is Decision => ["choose_move", "defer_move", "dismiss_move"].includes(message.type);
// Include the entire offered action scope/plan, not just a reusable move ID. Display-only
// ranking/wording changes do not authorize a different tool, file scope or PR head.
const fingerprint = (move: Move) => JSON.stringify([move.itemId, move.stage, move.kind, move.plan, move.locked,
  move.options.map(option => [option.id, option.actions])]);

/** Memory belongs to this one source/repo lifetime. No localStorage, credentials or optimistic state. */
export class DecisionOutbox {
  private cards = new Map<string, Move>();
  private pending = new Map<string, { message: Decision; scope: string; sentOn?: object; attempts: number; queuedAt: number }>();
  constructor(private readonly changed: (reason: "changed" | "unconfirmed") => void) {}

  observe(message: ServerToWeb) {
    if (message.type === "snapshot") this.cards = new Map((message.state.deck ?? (message.state.move ? [message.state.move] : [])).map(card => [card.id, card]));
    else if (message.type === "deck") this.cards = new Map(message.deck.map(card => [card.id, card]));
    else if (message.type === "move") this.cards.set(message.move.id, message.move);
    else if (message.type === "move_resolved") this.cards.delete(message.moveId);
    else return;
    for (const [id, entry] of this.pending) {
      const card = this.cards.get(id);
      if (!card) this.pending.delete(id); // An authoritative resolution/absence acknowledges it.
      else if (fingerprint(card) !== entry.scope) { this.pending.delete(id); this.changed("changed"); }
    }
  }

  knows(message: Decision) {
    const card = this.cards.get(message.moveId);
    return !!card && (message.type !== "choose_move" || card.options.some(o => o.id === message.optionId));
  }

  replayable(message: Decision) {
    if (message.type !== "choose_move") return true;
    const actions = this.cards.get(message.moveId)?.options.find(o => o.id === message.optionId)?.actions;
    return actions?.length === 1 && ["plan_runner_job", "approve_runner_job", "request_merge"].includes(actions[0].tool);
  }

  enqueue(message: Decision) {
    const card = this.cards.get(message.moveId);
    if (!card || message.type === "choose_move" && !card.options.some(o => o.id === message.optionId)) { this.changed("changed"); return; }
    const prior = this.pending.get(message.moveId);
    if (prior && JSON.stringify(prior.message) === JSON.stringify(message)) return;
    if (!prior && this.pending.size >= 12) { this.changed("changed"); return; }
    this.pending.set(message.moveId, { message: structuredClone(message), scope: fingerprint(card), attempts: 0, queuedAt: Date.now() });
  }

  get hasPending() { return this.pending.size > 0; }

  expire() {
    for (const [id, entry] of this.pending) {
      if (Date.now() - entry.queuedAt >= 60_000 || entry.attempts >= 3) {
        this.pending.delete(id); this.changed("unconfirmed");
      }
    }
  }

  flush(connection: object, send: (message: Decision) => void) {
    this.expire();
    for (const entry of this.pending.values()) {
      if (entry.sentOn === connection) continue;
      entry.attempts++;
      send(entry.message); // A throw retains the entry for the next fresh snapshot.
      entry.sentOn = connection;
    }
  }

  clear() { this.pending.clear(); this.cards.clear(); }
}
