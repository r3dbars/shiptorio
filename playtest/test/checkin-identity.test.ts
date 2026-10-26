import { expect, test } from "bun:test";
import type { Move, WebToServer } from "@shiptorio/shared";
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
