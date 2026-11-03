# GitHub duplicate-read verification (#65)

The fixed-latency GitHub-boundary fixture runs real inbox reads, issue reads,
PR creation, current-head inspection, fresh human-gate readiness reads, the
SHA-pinned merge write and merged confirmation. Two concurrent consumers model
the deck refresh meeting factory work. The same fixture uses baseline `41effc3b`
and the new implementation; only transport coalescing changes.

| Step | Before | After |
| --- | ---: | ---: |
| Inbox | 2 | 1 |
| Plan input | 2 | 1 |
| Create PR | 2 | 2 |
| Checks | 8 | 4 |
| Human merge + confirmation | 5 | 4 |
| Total | 19 | 12 |

See `fixed-loop-counts.json` for the requests and
`server/test/github-loop-calls.test.ts` for the permanent regression assertion.
No real GitHub calls or merges are made by this fixture.

Two separate complete Stranger browser runs also passed issue → plan → fixture
runner → PR → stale/current checks → review → human Launch → confirmed merge.
Their raw totals were **78 before and 84 after**: timed check/launch polling varied,
so these are browser correctness evidence, not a claimed whole-browser reduction.
The entry step itself fell from five reads to two. Per-step totals are in
`browser-loop-counts.json`.

The four screenshots were captured with `scripts/shots/deck.mjs` at 390×844 and
1280×720 and inspected. They use the same conveyor-demo fixture to confirm the
unchanged rendering and card controls; they are not proof of a live GitHub run.
Both screenshot runs reported zero errors or horizontal overflow.
