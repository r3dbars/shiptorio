# Live ship loop: what works, what's missing (2026-10-26)

Goal: the first playable checkpoint end to end on shiptorio.com in live mode, not the sim.
Real issue → map → Spark plans → local agent builds a PR → gauntlet (CI inspector, verify bay,
AI review, merge gate) → merge → rocket + ship celebration.

## Works on main today

- Issue webhook / install backfill → ore on the map (`server/src/factory.ts` `ingestSignal`).
- Spark plans a local runner job, the local Codex/Claude runner builds, pushes, PR opens (#61, #62).
- In flight (Codex, `codex/game-plan-approval`): "Plan with Codex" card → "Approve and build" in the game.
- CI result marks the `ci` stage passed on runner PRs.
- Merged PR → item `launched` → rocket + ship celebration (web reacts to the state diff).

## Missing (this thread: "Wire the first real ship loop")

1. **Gauntlet invisible in live.** The live starter line has one `inspector-1`; the sim has
   `ci-1 → verify-1 → review-1 → gate-1` plus `stations`. Live sends no `stations`, so no station
   panels, no piles, no bottleneck glow.
2. **Verify bay and AI review never run.** After CI passes, `verify` and `ai` stay `pending` forever,
   so the item never reaches the pad and there's no "launch" card.
3. **No merge gate move.** Nothing offers "Launch #n" in the game; the player has to find the PR.

## Built in PR #73

- `server/src/gauntlet.ts`: four gauntlet machines (`ci-1`, `verify-1`, `review-1`, `gate-1`) replace
  `inspector-1` (old factories migrate on load); live `stations` re-count on every item change.
- CI pass on a runner PR → verify bay (v1: a test in the diff, or docs-only) → AI review (Spark attacks the
  diff, posts its verdict on the PR) → `on_pad` + a **Launch #n** card with the three stamps.
- Tapping Launch squash-merges through the App at the checked head SHA, then the rocket + ship celebration.
  A head that moved after the checks is refused. "Later" snoozes the card 10 minutes.
- Any fail → `rejected` + scar tag + a card ("Look later" / "Overrule and launch"). Runner items never
  auto-requeue into the hosted assembler.

## Plan (original)

- Server (small, additive, in `server/src/gauntlet.ts`): gauntlet machines + live `stations`,
  Spark-judged AI review of the diff (Spark judges, never writes), verify bay v1 from receipts
  (local typecheck/test/build at the head SHA + a test file in the diff), then a merge-gate move
  whose "Launch" merges through the App only on the player's tap. Fails → `rework` with a scar tag.
- Codex (runner): the real verify bay, "failing test turns green" (run the PR's tests on base, then head),
  and a different-family reviewer run on the player's other subscription.

## Next (Codex)

- Rework belt for local builds: a scarred runner PR gets a "Send back to Codex with the scar" card;
  Spark re-plans with the scar and the runner pushes a fix commit to the same branch, then the gauntlet reruns.
- Real verify bay: run the PR's tests on base (must fail) and head (must pass) in the runner; attach the log.
- Different-family reviewer on the player's other subscription when both are connected.
