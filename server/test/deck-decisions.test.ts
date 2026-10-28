import { expect, test } from 'bun:test';
import { beginCheckin, deferCard, emptyDeckBook, moveKey, noteYes, plannerFeedback, resetYes, suppressed, thirdDefer } from '../src/deck-decisions';
import type { Move } from '@shiptorio/shared';
const move: Move = { id: 'a', title: 'Build a fix', why: 'A real issue', itemId: 'gh-1', kind: 'build', createdAt: 0, options: [{ id: 'yes', label: 'Plan', recommended: true, actions: [{tool: 'plan_runner_job', args: {}, reason: 'Plan'}] }] };
test('defers survive storage, return on next check-in, and third defer escalates', () => {
  let book = emptyDeckBook();
  for (let i = 0; i < 3; i++) { deferCard(book, move); book = structuredClone(book); expect(suppressed(book, {...move,id:'regenerated'})).toBe(true); beginCheckin(book); expect(suppressed(book,move)).toBe(false); }
  expect(book.decisions[moveKey(move)].count).toBe(3);
  expect(thirdDefer(move).title).toBe('Never, or let the factory decide?');
});
test('a new job is a new decision and feedback contains scoped exclusions', () => {
  const job = (id: string) => ({...move, options:[{...move.options[0],actions:[{tool:'approve_runner_job',args:{jobId:id},reason:'Approve'}]}]});
  expect(moveKey(job('one'))).not.toBe(moveKey(job('two')));
  expect(plannerFeedback(emptyDeckBook(),[{kind:'build',scope:'district:server',actionId:'x'}])).toContain('district:server');
});

test("attention: Continue streaks count Continues per class, reset on Later, and reach the planner", () => {
  const book = emptyDeckBook();
  noteYes(book, "build", "district:web");
  expect(noteYes(book, "build", "district:web")).toBe(2);
  expect(JSON.parse(plannerFeedback(book, [])).playerYesStreaks).toEqual([{ kind: "build", scope: "district:web", streak: 2 }]);
  resetYes(book, "build", "district:web");
  expect(JSON.parse(plannerFeedback(book, [])).playerYesStreaks).toBeUndefined();
});

test('replayed Later is one decision until the next check-in, including after storage reload', () => {
  let book = emptyDeckBook();
  deferCard(book, move);
  deferCard(book, move); // Two socket deliveries can already hold the same visible card.
  book = structuredClone(book);
  deferCard(book, move);
  expect(book.decisions[moveKey(move)].count).toBe(1);
  expect(suppressed(book, move)).toBe(true);
  beginCheckin(book);
  deferCard(book, move);
  expect(book.decisions[moveKey(move)].count).toBe(2);
});

test('a durable Later intent reparks after reconnect without counting again, while fresh intent counts', () => {
  let book = emptyDeckBook();
  const intent = { id: '11111111-1111-4111-8111-111111111111', userId: 1 };
  deferCard(book, move, intent);
  book = structuredClone(book); beginCheckin(book);
  deferCard(book, move, intent);
  expect(book.decisions[moveKey(move)]).toMatchObject({ count: 1, deferred: true });
  beginCheckin(book); deferCard(book, move, { ...intent, id: '22222222-2222-4222-8222-222222222222' });
  expect(book.decisions[moveKey(move)].count).toBe(2);
});

test('Later receipts are player, move and action-scope specific and bounded', () => {
  const book = emptyDeckBook(), intent = { id: '11111111-1111-4111-8111-111111111111', userId: 1 };
  deferCard(book, move, intent); beginCheckin(book);
  deferCard(book, move, {...intent,userId:2}); expect(book.decisions[moveKey(move)].count).toBe(2);
  beginCheckin(book); deferCard(book, {...move,id:'different'}, intent); expect(book.decisions[moveKey(move)].count).toBe(3);
  const changed = {...move,options:[{...move.options[0],actions:[{tool:'plan_runner_job',args:{headSha:'new'},reason:'Fresh scope'}]}]};
  beginCheckin(book); deferCard(book, changed, intent); expect(book.decisions[moveKey(changed)].count).toBe(1);
  for(let i=0;i<200;i++){beginCheckin(book);deferCard(book,move,{id:`intent-${i}`,userId:1});}
  expect(book.deferReceipts!.length).toBeLessThanOrEqual(128);
});
