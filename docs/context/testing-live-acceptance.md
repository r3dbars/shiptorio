# Testing real-loop acceptance — 2026-10-26

Status: **historical checkpoint recorded; real-loop acceptance incomplete**.

Read-only recheck at **2026-10-27 11:53 UTC**: Testing PRs [#12](https://github.com/r3dbars/Testing/pull/12)
and [#13](https://github.com/r3dbars/Testing/pull/13) remain open and unmerged at the exact heads recorded below.
Shiptorio [Deploy 40498676438](https://github.com/r3dbars/shiptorio/actions/runs/40498676438) succeeded;
the live version returned `61ef296c44ca4a4b22ac1e0a4a92513eff521b92`. Actions now runs on the public
repository. The earlier billing block and deployment handoff below are historical.

The observations below retain the original evidence and its limits. This documentation recheck did not
approve a plan, mutate a factory, control a runner/autopilot, or merge a factory PR. Current pairing,
service and process state was not revalidated.

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
  exact case; its exact-head CI and Stranger passed, and it merged as
  `bc212af8a5c851517b904906ddab6c2cce3831ce`. This run keeps the actual merge decision
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
prevent competing jobs; its later recovery was left for the acceptance owner to reconcile.
The original paused PID 87503 exited; its replacement PID 56132 was verified as
Testing-only and paused at that checkpoint. These PIDs are historical receipts, not current process
identities. No Shiptorio #170 runner or pairing was changed by that run.

## Historical deployment handoff

At the earlier checkpoint, GitHub Actions refused to start Deploy run 40439788803 because of an account payment /
spending-limit block (no job steps or Cloudflare mutation). The verified #307 commit was
not live at that checkpoint. Production independently returned `be3a81bc177932dcfc4b831a8b9d58cbdfafab77`.

A detached exact-commit checkout had a successful build and Wrangler dry run; approval was requested
before any local deployment, and none was attempted by that acceptance run. There were no migration or
Wrangler configuration changes between that checkpoint's live commit and candidate. Captured rollback
version `dde742b6-0698-436c-9666-2343f9aff5fd` then had 100% traffic. This is a historical version receipt,
not a current rollback/deployment instruction; the fresh release recheck is recorded above.

At that checkpoint Testing autopilot PID 56132 was paused to keep the controlled run isolated and the
paired local runner was online. Neither remains certified by this receipt. Reconcile current ownership,
pairing and process identity before a new acceptance run; do not resume a process using a historical PID.
No Shiptorio #170 process was modified by the acceptance run or this documentation recheck.

## Remaining proof

1. Reconcile the genuine failure into a scar; select Codex rework in the game.
2. Inspect and approve the new real Spark plan in game; local runner corrects the same PR.
3. Verify the documented command on the new immutable head, publish its actual result,
   and observe fresh CI, verify and AI review.
4. Click the in-game Launch card, then verify GitHub merge, issue closure and factory rocket.
