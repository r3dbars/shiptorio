# Plan to Nov 3 (demo video)

Written 2026-10-29 by the "Plan what's next and load up Codex" thread. Every agent reads this before picking work.
Deadline: Meta hackathon cutoff Nov 4 8 PM CT, aim to be done Nov 3 evening. Feature freeze ~Nov 1 (after that:
bugs, polish, reliability). Justin films the demo video himself on the real deck.

## The demo in one line

Open shiptorio.dev, see your one bottleneck within 5 seconds, swipe once, it clears. Then approve the same kind of
thing twice more and the factory does it on its own (the climax).

## Where we are (2026-10-29)

Works end to end:
- The 2D pixel deck is the product and the default on shiptorio.dev (`/deck?source=live`).
- One real run: Testing issue #16 → Muse Spark plan → Start build card → Codex on Justin's Mac → Testing PR #27,
  CI green, shown as one crate whose badge flips from #16 to PR27.
- Merge → rocket wiring landed (#608, #610). The trust meter (`server/src/learn.ts`, LEARN_NEED = 3) exists and the
  live cards show its line.
- Story, conveyor demo and sim modes play end to end on phone and desktop.

Not proven yet:
- Ship from the deck: hold Ship it on PR #27, GitHub merges, the rocket flies (needs Justin's hold).
- The trust level-up on the real loop: three yeses of the same kind, then the fourth starts on its own.
- A brand-new account getting from sign-in to its first card in under two minutes, all inside the deck.
- Meta visibly picking the bottleneck (Shippy's brain) in live mode.
- Staging had 44 stale factory records after GitHub access was narrowed; durable installation reconciliation is
  still missing. Live card updates can be choppy.

Waiting on Justin:
- Tap Promote on #571 (dev → shiptorio.com, Testing hang fix).
- Tap Launch on Testing #19, #20; the runner plugins-off paste.
- Hold Ship it on Testing PR #27 in the live deck.

## The five moves

1. **Finish one real ship on camera.** PR #27 merged from the deck, rocket flies. Then 3 more same-kind Testing
   issues so the level-up happens live.
2. **Make the level-up real** (Codex #43). The climax of the story has to happen on the real loop, not just the demo.
3. **First two minutes on a new account** (Codex #46). Sign in, pick repo, connect Codex, first card, all in the deck.
4. **Meta is Shippy's brain, visibly** (Codex #47). Live mode parks the camera on Spark's pick with one plain line why.
5. **Nothing breaks on camera** (Codex #44, #45, #48). Stale factories cleaned up, a replay mode for clean takes,
   CI and the nightly bot green so dev → main promotions are boring.

Not in scope (Justin, 2026-10-29): redesigning the decision/card flow (PR #612 is Justin's own design review).
Visual deck polish stays with Justin's local Codex (`codex/deck-visuals`) and Claude art threads.

## Codex batch (#43–#48, prompts in the project's codex-prompts/queue.md)

| # | Prompt | Owns |
| --- | --- | --- |
| 43 | Trust level-up on the real loop | server/src/{learn,deck-decisions,autopilot,factory}.ts + tests |
| 44 | Clean up stale factories when GitHub access changes | server/src/{github-lifecycle,installation-owner,factory-initialization,factory-inventory}.ts |
| 45 | Replay a real run for the demo video | web/src/deck2d/data/{replay.ts,source.ts}, web/src/source/live.ts, scripts/deck-trace.ts |
| 46 | First two minutes on a new account | web/src/deck2d/data/{connections,journey,watch}.ts, server/src/{connect,issue-inbox,signup}.ts |
| 47 | Shippy's brain picks the bottleneck | server/src/{brain,bottleneck,spark-context}.ts, web/src/deck2d/data/view.ts |
| 48 | Green CI and a boring promotion | .github/workflows/*, playtest/bot/*, flaky tests only |
