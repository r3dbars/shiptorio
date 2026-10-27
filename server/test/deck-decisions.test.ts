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
