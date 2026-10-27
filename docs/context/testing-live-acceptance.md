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
- A live Durable Object timeout currently prevents loading the factory reliably; #294
  owns the focused recovery. This acceptance run has not bypassed its gauntlet or Launch.

## Quotas and isolation

Justin approved raising the daily build cap from 21 to 25, retaining the separate $5 Spark
budget. Before mutation, the quota guard found a newer stored cap of 200 and preserved it.
No quota change was made by this run. The older Testing autopilot process was paused to
prevent competing jobs; restore it after safely finishing the controlled acceptance run.

## Remaining proof

1. Reconcile the genuine failure into a scar; select Codex rework in the game.
2. Inspect and approve the new real Spark plan in game; local runner corrects the same PR.
3. Verify the documented command on the new immutable head, publish its actual result,
   and observe fresh CI, verify and AI review.
4. Click the in-game Launch card, then verify GitHub merge, issue closure and factory rocket.
