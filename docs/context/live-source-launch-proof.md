# Live source and launch proof — 2026-10-26

## Verified source delivery

- Existing PostHog connection: US project 378427 (Transcripted telemetry), key event
  `dictation_completed`. Its real traffic-drop ore is not a Shiptorio product defect.
- Existing Sentry internal integration delivered a real signed webhook to the
  `shiptorio` Worker. An isolated `shiptorio-verification` project has alerts off,
  no connected repository, tracing or session replay.
- One explicitly labeled verification error was ingested by Sentry (HTTP 200),
  became Sentry issue 7813706988, and arrived as `sentry-7813706988` in the live
  `r3dbars/shiptorio` factory. Source status showed connected and one event.
- Worker tail observed `/webhooks/sentry` with outcome `ok`, zero exceptions and
  zero error logs. Resolving the isolated test issue in Sentry removed its ore
  from the factory through the resolution webhook. This is a test delivery, not
  a customer-reported error or a shipped fix.
- Credentials were not written to this document or repository. The test ingestion
  key was passed through a private memory pipe and discarded after submission.

## Real issue acceptance in progress

- Issue #125 remains the real goal-persistence bug for local Codex acceptance.
- The first in-game plan included a reference-only shared schema in writable scope.
  It was not approved. PR #141 separates planning reads from the final editable
  subset, validates that subset and carries it through player approval and runner
  claim. CI passed; merge commit `4d7150dde79af239030a7243f64b6beb6ff3eacd`.
- PR #141 Deploy run 40401140082 passed; both domains reported its exact SHA.
- PR #142 removes invalid runner offers for source-only ore and rejects direct
  enqueue without a real GitHub issue. It also prunes persisted invalid cards.
  CI and Deploy 40401524789 passed; both domains reported merge SHA
  `a4fc27c5407460577965a47a5d15d7a3feafbaef`.
- A second plan was not approved because it still included a reference-only file.
  Live testing also exposed self-invalidation: the app's own plan-comment webhook
  replaced issue context and changed its approval revision. A fix is in progress;
  no stale-plan or writable-scope checks were bypassed.
- No claim of completed issue → approval → local build → PR → Launch until the
  real run below is recorded. Unit/integration tests alone do not satisfy it.

## Acceptance target changed after concurrent work

- Another lane opened PR #154 for #125 outside the in-game runner. That work is
  not duplicated and is not counted as evidence of the complete game flow.
- PR #146 fixes the self-invalidating planner comment and refreshes canonical
  issue context before a fresh plan. Final CI passed, with 218 local tests passing
  and one intentional platform skip; merged as `0424f0b`.
- Issue #170 is the replacement real acceptance target: a resolved Sentry issue
  assigned for follow-up currently normalizes to `upsert`, recreating factory ore.
  A direct call reproduced it on main. The issue reserves only
  `server/src/sources/sentry.ts` and `server/test/mines.test.ts` for the runner.
