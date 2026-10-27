# Testing real-loop acceptance — 2026-10-26

Status: **in progress; no launch or merge claimed**.

Target: [r3dbars/Testing #5](https://github.com/r3dbars/Testing/issues/5), README setup instructions.
Real builder PR: [Testing #12](https://github.com/r3dbars/Testing/pull/12).

## Observed evidence

- Real Muse Spark planned a README-only change. The local Codex runner completed job
  `470f15de-7cdc-405d-b612-2e8b2ebaf731`, with trusted supervisor typecheck, test and build receipts.
- The installed runner was updated to merged Shiptorio #272's structured edit proposal code;
  pairing and service credentials were retained. No Testing source was edited manually.
- The first attempt was started through the supported operator retry with `README.md` scope,
  after stale queued cards prevented reaching issue #5. This does not prove initial in-game
  plan approval. Rework and final merge still require the actual game cards.
- Bot PR #12 head `69d653c178f2bb1a78d1585ed07fd0ca53cabfd2` passed GitHub CI
  ([run](https://github.com/r3dbars/Testing/actions/runs/40435098941)), docs-only verify,
  and real Spark AI review, then reached the launch pad.
- Manual execution on a detached clone of that exact head found a real escaped defect:
  README recommended `bun run src/index.ts --coupon SAVE10`, but the entry point reads
  `process.argv[2]`. The flag form printed `$45.49`, identical to no coupon; the positional
  `SAVE10` form printed `$45.39`. Existing unrelated app defects remain out of scope.
- Published a genuine failing commit status, `Manual verification / README coupon`, on
  that exact head. PR #12 remains open and blocked; no bot PR was merged directly.
- Shiptorio #285 independently adds same-head source evidence to docs AI review. An
  alternative local patch was saved rather than opening a duplicate production fix.
- Shiptorio #294 recovered the claim-lock timeout; its deploy and live smoke passed.
  Follow-ups #305/#306 own handshake delay and expected planning-denial resets.
- The next blocker reproduced in a focused deck regression: old alerts fill all 12
  slots, hiding fresh launch and scar-driven rework cards. #307 already fixes this
  exact case; its CI and Stranger passed. This run keeps the actual merge decision
  server-owned. The separate Activity pad shortcut opens GitHub in live mode.
- Before the competing autopilot was paused, real Spark/local Codex completed issue #7
  as [Testing #13](https://github.com/r3dbars/Testing/pull/13), head
  `8ef6f5be972e34fa8c1fdd4eb7938ce99f2b7866`. Its three-line docs-only diff matches
  the issue; CI, verify and AI review passed. It remains unmerged pending the actual
  server-issued Launch card. Clicking the legacy pad shortcut did not merge it.

## Quotas and isolation

Justin approved raising the daily build cap from 21 to 25, retaining the separate $5 Spark
budget. Before mutation, the quota guard found a newer stored cap of 200 and preserved it.
No quota change was made by this run. The competing Testing autopilot process was paused to
prevent competing jobs; restore it after safely finishing the controlled acceptance run.
The original paused PID 87503 exited; its replacement PID 56132 was verified as
Testing-only and paused. No Shiptorio #170 runner or pairing was changed.

## Remaining proof

1. Reconcile the genuine failure into a scar; select Codex rework in the game.
2. Inspect and approve the new real Spark plan in game; local runner corrects the same PR.
3. Verify the documented command on the new immutable head, publish its actual result,
   and observe fresh CI, verify and AI review.
4. Click the in-game Launch card, then verify GitHub merge, issue closure and factory rocket.
