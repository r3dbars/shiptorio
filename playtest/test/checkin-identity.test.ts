import { expect, test } from "bun:test";
import type { Move, WebToServer } from "../../shared/src";
import { createCheckInSession } from "../../web/src/ui/CheckIn";

const card = (id: string): Move => ({ id, title: `Plan issue ${id}`, why: "A real choice", createdAt: 1,
  options: [{ id: `plan-${id}`, label: `Plan ${id}`, recommended: true, actions: [{ tool: "plan_runner_job", args: { issue: id }, reason: "Plan it" }] }] });
const choose = (move: Move) => ({ type: "choose_move" as const, moveId: move.id, optionId: move.options[0].id });
function fixture(deck: Move[]) {
  let serial = 0;
  const timers = new Map<number, () => void>();
  const session = createCheckInSession(deck, {
    later(fn) { const id = ++serial; timers.set(id, fn); return id as unknown as ReturnType<typeof setTimeout>; },
    cancel(id) { timers.delete(id as unknown as number); },
  });
  const sent: WebToServer[] = [];
  const commit = (message: WebToServer) => { sent.push(message); };
  return { session, sent, commit, flush() { const queued = [...timers.values()]; timers.clear(); queued.forEach(fn => fn()); }, queued: () => [...timers.values()] };
}

test("check-in pins the visible issue across reranks and inserts while refreshing its proof/options", () => {
  const a = card("125"), b = card("77"), c = card("107");
  const { session } = fixture([a, b]);
  expect(session.update([c, b, a]).map(m => m.id)).toEqual(["125", "107", "77"]);
  const updated = { ...a, locked: true, evidence: [{ station: "ci", ok: false }], options: [{ ...a.options[0], id: "run-check", label: "Run missing check" }] };
  expect(session.update([b, updated, c])[0]).toBe(updated);
  expect(session.cards()[0].options[0].id).toBe("run-check");
  expect(session.cards()[0].evidence?.[0].ok).toBe(false);
});

test("repeated gestures during flight send one exact visible issue and option", () => {
  const a = card("125"), b = card("77"), c = card("107");
  const f = fixture([a, b]);
  expect(f.session.begin(a, choose(a), f.commit, () => {})).toBe(true);
  expect(f.session.begin(a, choose(a), f.commit, () => {})).toBe(false);
  f.session.update([c, b, a]);
  expect(f.session.begin(b, choose(b), f.commit, () => {})).toBe(false);
  f.flush();
  expect(f.sent).toEqual([choose(a)]);
  expect(f.session.cards().map(m => m.id)).toEqual(["107", "77"]);
});

test("closing or unmounting the deck cancels queued actions, even if a stale timer fires", () => {
  const a = card("125"), f = fixture([a]);
  let aborted = 0;
  f.session.begin(a, choose(a), f.commit, () => { aborted++; });
  const stale = f.queued()[0];
  f.session.close();
  f.flush(); stale();
  expect(f.sent).toEqual([]);
  expect(aborted).toBe(0); // cleanup must not call React state setters after unmount
  expect(f.session.begin(a, choose(a), f.commit, () => {})).toBe(false);
});

test("removing an in-flight card cancels it and cannot redirect its action to the replacement", () => {
  const a = card("125"), b = card("77"), f = fixture([a, b]);
  let aborted = 0;
  f.session.begin(a, choose(a), f.commit, () => { aborted++; });
  const stale = f.queued()[0];
  expect(f.session.update([b]).map(m => m.id)).toEqual(["77"]);
  expect(aborted).toBe(1);
  expect(f.session.begin(a, choose(a), f.commit, () => {})).toBe(false);
  f.flush(); stale();
  expect(f.sent).toEqual([]);
  expect(f.session.begin(b, choose(b), f.commit, () => {})).toBe(true);
  f.flush();
  expect(f.sent).toEqual([choose(b)]);
});

test("changed proof or options invalidate a pending choice while keeping fresh same-id content visible", () => {
  const a = card("125"), f = fixture([a]);
  let aborted = 0;
  f.session.begin(a, choose(a), f.commit, () => { aborted++; });
  const updated = { ...a, locked: true, plan: ["Run checks first"], evidence: [{ station: "verify", ok: false }],
    options: [{ ...a.options[0], id: "run-verify", label: "Run missing check" }] };
  f.session.update([updated]);
  f.flush();
  expect(f.sent).toEqual([]); expect(aborted).toBe(1);
  expect(f.session.cards()[0]).toBe(updated);
  expect(f.session.begin(a, choose(a), f.commit, () => {})).toBe(false);
  expect(f.session.begin(updated, choose(a), f.commit, () => {})).toBe(false);
  expect(f.session.begin(updated, choose(updated), f.commit, () => {})).toBe(true);
  f.flush();
  expect(f.sent).toEqual([choose(updated)]);
});

test("a queued message is an immutable binding to the visible move and selected option", () => {
  const a = card("125"), b = card("77"), f = fixture([a, b]);
  const message = choose(a);
  f.session.begin(a, message, f.commit, () => {});
  message.moveId = b.id; message.optionId = b.options[0].id;
  f.session.update([b, { ...a, why: "The wait grew while you read" }]);
  f.flush();
  expect(f.sent).toEqual([choose(a)]);
});

test("close/reopen cannot revive a stale flight or cancel the new session's choice", () => {
  const a = card("125"), f = fixture([a]);
  f.session.begin(a, { type: "defer_move", moveId: a.id }, f.commit, () => {});
  const stale = f.queued()[0];
  f.session.close(); f.session.open();
  f.session.begin(a, choose(a), f.commit, () => {});
  stale();
  expect(f.session.busy()).toBe(true);
  f.flush();
  expect(f.sent).toEqual([choose(a)]);
});

test("later and never bind the visible card too, and a server-returned deferred card can rejoin", () => {
  const a = card("125"), b = card("77"), f = fixture([a, b]);
  f.session.begin(a, { type: "defer_move", moveId: a.id }, f.commit, () => {});
  f.session.update([b, a]); f.flush();
  expect(f.sent).toEqual([{ type: "defer_move", moveId: a.id }]);
  f.session.update([b]);
  f.session.update([a, b]);
  expect(f.session.cards().map(m => m.id)).toEqual(["77", "125"]);
  f.session.begin(b, { type: "dismiss_move", moveId: b.id, why: "once" }, f.commit, () => {});
  f.flush();
  expect(f.sent[1]).toEqual({ type: "dismiss_move", moveId: b.id, why: "once" });
  expect(f.session.cards().map(m => m.id)).toEqual(["125"]);
});

test("a drag starting before same-id option changes cannot approve the new option on release", () => {
  const a = card("125"), f = fixture([a]);
  const startedOn = f.session.cards()[0];
  const updated = { ...a, options: [{ ...a.options[0], id: "launch", label: "Launch now" }], evidence: [{ station: "ci", ok: true }] };
  f.session.update([updated]);
  expect(f.session.begin(startedOn, choose(startedOn), f.commit, () => {})).toBe(false);
  f.flush();
  expect(f.sent).toEqual([]);
  expect(f.session.cards()[0]).toBe(updated);
});
