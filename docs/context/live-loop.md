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

## Plan

- Server (small, additive, in `server/src/gauntlet.ts`): gauntlet machines + live `stations`,
  Spark-judged AI review of the diff (Spark judges, never writes), verify bay v1 from receipts
  (local typecheck/test/build at the head SHA + a test file in the diff), then a merge-gate move
  whose "Launch" merges through the App only on the player's tap. Fails → `rework` with a scar tag.
- Codex (runner): the real verify bay, "failing test turns green" (run the PR's tests on base, then head),
  and a different-family reviewer run on the player's other subscription.
