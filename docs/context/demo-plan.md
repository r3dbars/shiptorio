# Plan to Nov 3 (demo video)

Written 2026-10-29 by the "Plan what's next and load up Codex" thread. Every agent reads this before picking work.
Deadline: Meta hackathon cutoff Nov 4 8 PM CT, aim to be done Nov 3 evening. Feature freeze ~Nov 1 (after that:
bugs, polish, reliability). Justin films the demo video himself on the real deck.

## The rule (Justin, 2026-10-29 18:01)

"As simple as possible ... continuously work on the loop that we have. Make it more simple, more clear, more
friendly for end users, and more polished." No new features, screens or settings. Deleting beats adding.

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

## Polish batch (#49–#56, Justin 18:01: simpler, clearer, friendlier, no new features)

| # | Prompt | Owns |
| --- | --- | --- |
| 49 | Delete the old experiments | web/*.html (not deck/index), web/src/{deck3d,bakeoff,arttest,lab}, vite configs, scripts/bundle-budget.ts |
| 50 | Plain words on every card | web/src/deck2d/card/*.ts (strings), server/src/deck.ts (card text), web/src/copy.ts |
| 51 | The deck feels good on a phone | web/src/deck2d/deck.css, card/card.css, web/deck.html (meta only) |
| 52 | Faster first load | web/public/{deck,welcome,brand}/**, web/public/sw.js, scripts/art/* |
| 53 | When something breaks, say one plain sentence | stations/{inspector,status,attention}.ts, server/src/{errors,reliability}.ts |
| 54 | Bug bash the loop | new bug-bash tests; small fixes in engine/{flow,camera}.ts, juice/build/grow/launch, server/src/runner-job.ts |
| 55 | One way in | server/src/{redirect,landing,account-pages}.ts, web/index.html, web/src/main.tsx (routing) |
| 56 | Docs that match today | AGENTS.md, docs/context/* except the plan/deck/branch docs; history to docs/context/archive/ |
| 57 | Shippy is calm and always easy to find | web/src/deck2d/shippy/* |
| 58 | The runner talks in plain words | runner/src/{messages,cli,codex-diagnostic}.ts (text), runner/README.md |
| 59 | Runner install just works | runner/install.sh, web/src/runner-install.ts, scripts/build-runner.ts |
| 60 | Retire old flags | server/src/flags.ts, web/src/flags.ts, unowned call sites |
| 61 | Fewer dependencies | package.json files (not playtest) + lockfile |
| 62 | Keyboard and screen reader basics | web/src/deck2d/main.ts (aria/keyboard only) |
| 63 | Trim the admin page | server/src/{admin,admin-view,admin-god-page,admin-god,ops}.ts |

Status 18:10: #43 → PR #618, #44 → #615, #45 → #616, #46 → #617. #47 and #48 not started yet.

## #43: which Testing issues teach the same build permission

For the live level-up take, use first-time issues whose reviewed **Start build** plan writes only root README/CHANGELOG/CONTRIBUTING prose (`.md`, `.txt`, `.rst`, `.adoc`) and/or prose files under `docs/`. Those plans share `build|district:docs|approve_runner_job` inside the repository, even if triage calls the issue's district `/` or `docs`. Three accepted Start build cards teach this permission; the next matching plan can dispatch automatically to the already-paired runner. Starting a plan is a separate permission and still asks unless independently learned.

A plan that also edits code/config (for example `package.json`) keeps its original district scope and does not use the docs permission. Rework, existing PRs, scars and base refreshes always require a fresh decision. Gate never learns auto-merge. “Ask me again” removes the permission and streak. The existing `learned` list and timestamp mark the Builder automatic; no new renderer contract is needed.

Verification boundaries: fixture tests exercise the real approval and runner-claim methods, including lease/reconnect behavior. A new four-issue run on shiptorio.dev is still player acceptance; fixture success is not a claim that four live jobs ran.
