# Claude project threads (as of 2026-10-26 ~20:40 UTC)

## Stranger E2E: latest status (2026-10-26)

| PR | State | Result |
| --- | --- | --- |
| #252 | merged after CI + Stranger passed | Fix Chromium runner approval submitting opaque Origin under no-referrer; retain exact-origin checks. |
| #260 | merged after CI + Stranger passed | Preserve the password gate script nonce on fast and wrapped paths while retaining the other global CSP restrictions. |
| #256 | full E2E suite | Signup → App install → repo → signed issue/retry → Spark plan → browser approval → runner PR → stale/current CI → verify + AI review → visible Launch → merge/rocket. Every PR to main runs the suite, including drafts and docs-only changes, and retains screenshots, timing/state and browser trace. GitHub, Spark and runner build results are fixtures; no real bot PR merges. Local 16-step run passed in 60.9s. Fixture runner heartbeats keep slow CI render time from simulating an unplugged machine. |


What each thread in the Claude "Shiptorio" project did. Threads live on claude.ai, so this
is the only copy agents outside it (Codex) can see.

> **Plan through Nov 4 (locked 2026-10-27):** prove the loop (Testing #5 + 5 to 10 more clean ships + one real
> autonomy level-up), nail the vertical map to the mockup, judge mode + 2-min video, feature freeze ~Nov 1,
> park build mode / pricing / empire / new mines. Codex is on reliability prompts only. Details: `docs/VISION.md`.

| Thread | State | What it did / produced |
| --- | --- | --- |
| Review Justin's GitHub repos | done | Found `r3dbars/shiptorio` (then just a README). Other repos: transcripted, transcripted-webapp, redbars, pipread, BetterFeedback |
| Review Justin's Cloudflare account | done | Surveyed the account: Workers `transcripted-feedback`, `stack99-relay`, `r3dbar-subscribe`, `redbars` (don't touch). Nothing Shiptorio yet. R2 not enabled |
| Build Shiptorio on Cloudflare for the hackathon | working | PR #1 (merged): Cloudflare Worker + GitHub App + D1/KV, reshaped into `shared/` `server/` `web/` bun workspaces, Spark client, issue → Spark → PR first cut, Three.js pixel map + `?source=sim`. Created D1 `shiptorio` + KV `shiptorio-cache`. Rebuilt the repo handoff doc as PR #5 (merged: PLAN.md, docs/ARCHITECTURE.md, docs/ART.md, briefs/, both prototypes). Now porting the Pixel Prototype art into `web/` (draft PR #8: shader, models, scene rebuilt, prototype-style HUD as of 16:53) |
| Find the Shiptorio Claude doc | done | Found the plan doc and made the repo handoff doc (the local `~/omni/shiptorio` files, which were on Justin's other computer) |
| Design Shiptorio's first-time signup experience | PR #84 | Welcome intro after sign-in (verify, then automate), two worlds (Check in / Build) with a first read after the scan, field guide. Mockup: `docs/onboarding-mockup.html` |
| Write Codex prompts for Shiptorio | working | AGENTS.md (PR #2, merged) + paste prompt for Codex. Now the Codex prompt desk: paste-ready prompt packs for Justin, and tracks what Codex has pushed (see below) |
| Define Meta Spark as Shiptorio's game agent | working | Writing the spec for how Muse Spark runs the factory. Codex prompts follow from it |
| Move and push local Shiptorio folder | blocked | Looked for `~/omni/shiptorio` on Justin's Mac; it isn't there (it was on another machine). Superseded by PR #5 |
| Iterate on pixel art direction | working | Confirmed the locked look (pixel 3D, slate/amber, Silkscreen); Feedback Factory canvas is layout-only now. Reworked the launch pad base and solar panel in the Item Lab, PR #7 (merged, now the art baseline) |
| Commit all Shiptorio context to repo | done | This folder (`docs/context/`), PRs #6 and #9 |
| Design Shiptorio's verification loop one-pager | working | `docs/LOOP.md` + `docs/loop.html` (live: https://claude.ai/artifact/3thVDxNxToYkyKTTqoFnbr). The verification gauntlet (CI inspector → verify bay → AI review → launch pad → orbit watch), rework belt with scar tags, promote-a-check, research stations, click-to-act station panel. PRODUCT.md updated (stages, tools, contract, web). |
| Build Shiptorio onboarding flow | working | `web/` first 60 seconds (PR #36, merged): sign in → pick a repo → Spark scans it → starter factory → power → first build. Round 2: progressive disclosure tour in `first-run` (`web/src/ui/tutorial.tsx`): HUD hidden until Spark introduces each concept, keyed by `show(concept)` shared with the UI redesign thread. Live repo picker needs `GET /api/repos` (backend lane) |
| Connect Sentry and PostHog as mines | PR #97 | Contract #90 (posthog SourceKind/OreSource). Sentry webhook `/webhooks/sentry` + PostHog poller on the Factory alarm turn errors and traffic drops into ore on the right district (`server/src/sources/{sentry,posthog,creds}.ts`). `/connect/<kind>` page: paste the key once, stored in KV. Fake modes: `bun run fake:sentry`, `FAKE_POSTHOG=1`. Sim: `?source=sim&scenario=mines`. Map ghost deposits are the signup thread's. Covers Phases B and C of `codex-prompts/connect-the-mines.md`, so Codex can skip them |
| Make Meta Muse Spark central | PR (branch claude/project-thread-rg09k0) | Audit of every decision point: `docs/context/spark-audit.md`. Added the decision log (`server/src/brain.ts`, `FactoryState.brain`), Spark game master ranking the deck and wording the bottleneck card (`spark.ts` `gameMaster`), Spark plan comment on GitHub issues, triage reasons, live foreman drone. Web: "How it thinks" sheet behind the one credit (bell tray, Power sheet, `?thinks=1`) |
| Add sound to Shiptorio | working | PR #33 (merged): procedural chiptune sound in `web/src/sound/`, driven by FactoryState diffs. Second pass: focused audio. Click into anything and its own soundscape (`web/src/sound/scapes.ts`, one per station/machine/power type) plays up close while the floor ducks and muffles; Esc eases back |
| Design the swipe check-in for Shiptorio | working | Justin's idea: the human is the bottleneck, so a check-in deck of 8–12 swipeable Next Moves (right do it, left later, down never + why, up details, tap zoom). Mockup https://claude.ai/artifact/5SvtzSthAEgSuozz2J8SVH. PR #54: PRODUCT.md "Check-in", VISION principle, contract (`FactoryState.deck`, Move `kind/focus/grows/evidence/locked/plan`, `defer_move`, `dismiss_move`), `web/src/ui/CheckIn.tsx`, sim `checkin` scenario. Backend: fill `deck` from the bottleneck engine |
| Make Shiptorio mobile friendly | working | PR #53: phone layout (slim top bar, Next Move docked, Power/Pad/Line/Log in a pull-up sheet, station panels as bottom sheets), pinch zoom + drag pan + tap-to-pick on the map, safe areas, smaller shadow map on phones. Fixes playtest #43 |
| Make the floating island look real | working | Justin disliked the grassy hanging-moss edge. Mockup of 3 options from his reference photo (https://claude.ai/artifact/XogJ8LQk47YobCSA7jQQbN); he locked A (moss cap + faceted tapered rock, waterfalls into mist, floating chunks). Built in `web/src/map/models.ts`, ART.md updated. B (glass fish-tank lake) saved as a later unlock |
| Build the research tree for checks | PR open | `shared/src/research.ts` (8 techs, 3 tiers, real diff checks, scar suggestions, line insert), researched stations run after CI in `server/src/gauntlet.ts` (`withChecks`/`runChecks`), `research` WebToServer message, research card from repeated scars, `web/src/ui/Research.tsx` (flask in the top bar), tinted inspector per check on the map, sim `scenario=research`. Tier 3 (perf, visual, canary) shown as coming soon |
| Wire the first real ship loop | working | PR #73: live gauntlet (`server/src/gauntlet.ts`): `ci-1 → verify-1 → review-1 → gate-1` machines + live `stations`, verify bay v1 (test in diff), Spark AI review posted on the PR, Launch card merges on tap → rocket. Next for Codex: rework belt for runner PRs + real verify bay (`docs/context/live-loop.md`) |
| Add adaptive factory music | PR #182 | Generative score on top of the sound engine (`web/src/sound/music.ts` pure mapping + tests, `musicPlayer.ts` step sequencer). Pad always; bass/arp/drums/snare layer in as items move; bottleneck pile-ups and catches switch to a tense progression + heartbeat; a launch ducks under the roar and cadences V→I. ♪ toggle in Sound settings; AudioContext suspends when muted |
| Build orbit watch station | PR #122 | Station 5 live: every launch is watched 24h on its merge commit (`server/src/orbit.ts`). Trips on a Sentry comeback (same error after a 15m deploy grace, or a new error spiking 3+ events on that folder), a revert PR, or a failed check on the merge commit. Trip = orbit scar, rework belt for a fresh PR, lane permit revoked, escaped defect. Uses existing App events (pull_request, check_*), no new subscriptions. Panel lists watched launches with time left. Sim: `?source=sim&scenario=orbit&autolaunch` |
| Add progression and daily streaks | PR #172 | XP from real results, levels, daily streak + shields, unlocks on the island (glass lake, lanterns, gold pad), morning brief with the deck-size trend, check-in end tally, opt-in "you're the bottleneck" notification. `shared/src/progression.ts`, `web/src/ui/Progress.tsx`. Behind `?progress=1` (`?progress=demo` in the sim) |
| Grow the factory across many repos | PR open | The empire, behind `?empire=1` (remembered; `?empire=0` off). Every other repo you connect floats as a satellite island beyond the main one, tied by a sky rail with crates (`web/src/map/empire.ts`: real island, districts and launch pad, flattened to ~25 draw calls, no shadows). Island chip in the top bar opens the overview: camera pulls back over every island, sheet rolls up shipped, weighted Automated %, waiting on you, and the most stuck island; tap an island to sail there (`web/src/ui/Empire.tsx`). `IslandSummary` + `rollup` in `shared/src/empire.ts`; `GET /api/empire` asks each repo's Factory `summary()` (player's own repos via `reposFor`). Sim shows shiptorio, testing, transcripted |
| Always show a next move after rockets | PR open | #105 follow-up. `web/src/ui/whatsNext.ts`: when no Next Move card is open, one clear move is always picked from state (launch, check in, stuck station, research, connect a mine, near permit, place a builder, the line, grow) and shown in the Next Move slot, live and sim. Sim planner keeps dealing moves after scripted ore runs out (connect a mine, then "pull 3 more open issues"). Check: `node web/scripts/next-move-check.mjs` (10 rockets, card within 2s each) |
| Design build mode and Codex task pack | parked (after Nov 4) | Justin 2026-10-27: optional Factorio / RCT-style build mode (place, move, rotate, rewire machines and belts). Spec `docs/BUILD-MODE.md`: every piece, its real pipeline meaning and ports, the per-tier grid on the vertical shaft (`web/src/map/shaft/layout.js`), the `Blueprint` model, `compile()` from layout to real pipeline config, safety rules, server draft/apply, web tools behind `?build=1`. 8-prompt Codex pack in project files `shiptorio/codex-prompts/build-mode.md`, parked until after Nov 4, then needs the shaft map on main |

## Codex: public judge replay (2026-10-26)

- Goal: `/judge` is a no-login, public exception to the preview/signup gate. Play starts a roughly
  90-second, explicitly labeled simulation; query parameters cannot select a live repo.
- Story: Sentry checkout crash + linked inbox report + GitHub docs issue → foreman plan → subscription
  assembler → CI / verify rejection + scar / rework / independent review → docs permit card → automatic
  docs rocket → human checkout merge rocket → approved reply → earned Advisor-to-Floor unlock.
  The permit can be clicked or the simulated player grants it around 65 seconds. Replay resets the run.
- UI uses `iron.css`, copy in `copy.ts`. No files under `web/src/map/` change: only the public
  `FactoryMap` props, `useFactory` protocol, and existing sound/ship events drive the presentation.
  This request explicitly authorizes the otherwise frontend-owned judge surface and sim fixture.
- Server explicitly serves the app shell for `/judge` and `/judge/`, plus public content-hashed build
  JS/CSS and already-public fonts/brand files. APIs, factory websockets, source maps, setup and private
  app routes keep their existing gates. Judge boot skips telemetry/flags and makes no API calls.
- Verification: `SHIPTORIO_TEST_PORT=8809 bun run test:e2e tests/e2e/judge.pw.ts` runs the full paced story
  at desktop, iPhone and Pixel sizes, including passive playback, interactive permit, scar, three green
  receipts, two actual ship events, 112 simulated users unblocked, Floor and replay reset. The optional
  test port avoids collisions with other agents; default remains 8799. Gate tests: `server/test/judge.test.ts`.
- PR: [#254](https://github.com/r3dbars/shiptorio/pull/254), branch `codex/judge-mode`.
  Local `bun run test:fast`: 662 passed, 2 platform skips; 26 playtest cases / 332 decisions, no findings.
  These are simulated outcomes, not proof of live AI/provider execution.

## PRs at a glance

Rule since 18:44 UTC: every agent merges its own PR once CI is green, then checks the Deploy run (AGENTS.md).

| PR | What | State |
| --- | --- | --- |
| #1–#9 | Scaffold, AGENTS.md, plan/art docs, context, Item Lab, pixel art port | merged |
| #29–#60 | Gauntlet on the map, click-to-zoom panels, hover labels, playtest fixes, sound, onboarding v1, mobile, check-in deck | merged |
| #65, #66, #69 | Floating island, ship celebration + sound | merged |
| #67, #78 | HUD v3 (top bar, dock, sheets, activity tray) + phone fixes | merged |
| #68, #70, #72 | Actions minutes (PR-only CI, skip docs, cancel stale), merge-own-green-PR rule, push-often rule | merged |
| #73 | Live ship loop: gauntlet stations, AI review, verify bay, merge gate | merged |
| #84 | New onboarding (welcome intro, two worlds, field guide) | merged |
| #81, #82, #83, #86 | Codex: in-game plan approval, scar-driven rework + real verify receipts, approval card fix, runner independent of checkout | merged |
| #85 | Codex: repeatable whole-game playtests + papercut reports | merged |
| #87 | Made by the game itself (Spark plan → local Codex → verify bay): direnv path guard | merged |
| #89, #91 | Sound for every gauntlet station; stations feel alive (verdict beats, CAUGHT! moment) | merged |
| #90, #97 | PostHog + Sentry mines: errors and traffic drops become ore | merged |
| #92 | Launch permits for real: earn, auto-launch, revoke, Automated % | merged |
| #93, #112 | Map tags name the code each machine works on; v3 consistency pass | merged |
| #94, #114 | Intro off by default, empty mines, Make it yours tools; welcome tour on the real map (`?intro=1`) | merged |
| #99, #102, #110, #115, #116 | Art passes 1–4: real rocket, calm paving, mechanical machines + stations, conveyor frames | merged |
| #109, #120, #121 | Playtest round 3, dogfood friction log, Spark capture plan | merged |
| #122 | Orbit watch: last station watches every launch for 24h | merged |
| #124 | Muse Spark visibly drives the factory: decision log, game master, plan comments | merged |
| #127 | Research tree: unlock real checks with science packs | merged |
| #174 | Achievements: 14 badges for real outcomes (first rocket, auto-launch, verify catch, 10 clean...), unlock toast + sound, HUD sheet, account pref | merged |
| #95, #98, #101, #111 | Codex: phone + Firefox login, security hardening, fresh CI before merge | merged |
| #96 | Codex: live bottleneck + check-in deck from factory state | merged |
| #100, #103, #117 | Codex: mobile/onboarding papercuts, first-run loop never idles | merged |
| #104, #123, #126 | Codex: sandboxed local verify, release receipts, orbit replay deadlines | merged |
| #118, #119 | Codex: live repo picker, disposed factories stop reconnecting | merged |
| #176 | Support mine: customer emails + Intercom chats → support well, Spark drafts replies, player taps Send (docs/context/support-mine.md) | open |
| #177 | Growth loop prototype: funnel drop → experiment → gauntlet → measure station (`?scenario=growth`, docs/context/growth-loop.md) | open |
| #175 | Geothermal power: local models (Ollama / OpenAI-compatible) as a free assembler for small jobs; fixed guard + planner route; map plant, power accounting, sim `?scenario=geothermal`. Docs: docs/runner-local-models.md | in progress |
| #3, #4 | Old pre-#1 drafts | closed |

## Runner resilience (Codex, 2026-10-26)

- [PR #259](https://github.com/r3dbars/shiptorio/pull/259), branch `codex/runner-resilience`, rebased onto current main; checkpoint: Oct 29 local runner.
- Implemented: per-repository capped reconnect backoff, private lease-bound recovery journal, automatic completion receipt retry, explicit subscription sign-in cards, and doctor auth/sandbox/pairing probes. Builds still require player approval; expired/revoked leases never resume automatically. No deployment requested.
- Focused macOS validation: 54 tests passed, including real sandbox/publication tests and card lifecycle through Factory reload; HTTP polling smoke also passed with dropped requests and an expired fake sign-in. Added immutable patch recovery, automatic receipt replay even when claim is empty, and cached-auth failure latching. Local full validation after rebase: `bun run test:fast` passed (671 tests, 2 platform skips; 24 playtest cases / 306 decisions / no findings), plus `bun run build`. Includes real macOS sandbox/publication probes and a doctor subprocess test. PR checks and merge result are on the linked PR. Merge gate: CI and stranger-path checks green on the exact head; native GitHub auto-merge is disabled, so the chat performs that gate.

## Codex (outside the Claude project)

Only what Codex has pushed is visible here, not its live session. Codex commits show as "J B" or "Redbars". As of ~17:20 UTC:

| PR | What | State |
| --- | --- | --- |
| #13 | Private preview (password gate), hardened issue → Spark → PR → inspector/rework loop, bounded alarm jobs, stale-check handling | merged. Supersedes #4's fixes |
| #19, #21 | Auto-deploy of `main` verified, `/api/version` shows the live SHA, shiptorio.com + shiptorio.dev live | merged |
| #3, #4 | Old protocol / factory drafts on the pre-#1 scaffold | superseded by #13 and the #14/#17 contract. Close them |
| Add real user accounts and sign-in | working | D1 `users`/`sessions`/`user_installations`/`user_repos`/`user_prefs` (migration 0004), revocable sessions, repo membership on every factory route, per-repo Sentry/PostHog keys + per-repo Sentry webhook, `requireUser` helper. Password gate stays in front. Next: web install link + prefs sync |
| Draft Shiptorio pricing options | PR open | Task 22. Three pricing models (BYO key / flat plans with fuel / pay per launch), unit cost from the code (≈$0.12 Spark per launch, ≈$0.40 Cloudflare per active factory), recommends flat plans: Free 20 launches, $19 solo 150, $59 crew 400. `docs/context/pricing.md`, numbers in `shared/src/pricing.ts`. Artifact: https://claude.ai/artifact/LrSxaUpsbMXnq5i9hxc8XH. Landing page gets a hidden `#pricing` block (`?pricing=1`) after the landing thread's PR merges |
| Write the Shiptorio docs site | PR #183 | Public docs at shiptorio.com/docs: markdown in `docs/site/`, built by `web/docs-site.ts` (search index, link-check test), `/docs` exempt from the preview password. 14 pages written from the code on main, not the plan. Gaps found while writing are listed in the PR |
| Build the Shiptorio landing page | PR (branch claude/project-thread-9fgomx) | Public landing at shiptorio.com `/` (static `web/public/welcome/`, real sim loop video, waitlist `POST /api/waitlist` in KV), app stays gated. See `docs/context/landing.md`. Codex #161 can adopt the waitlist |
| Make Shiptorio fast on phones | Merged #167 | Static batching `web/src/map/bake.ts` (models swept through `ART_STATES` in scene.ts; add a state there if a new part only moves in it), frame governor `web/src/map/quality.ts` (`?quality=0|1|2`), `?perf` overlay + `window.__shipPerf()`, `web/scripts/perf-bench.mjs`. Draw calls 2,673 → ~1,300, phone first paint 2.65s → ~0.65s. Next: lazy zod in progression, Worker latency (Codex prompt `shiptorio/codex-prompts/worker-latency.md`) |

Next for Codex: the "connect the mines" prompt (GitHub App end to end, then Sentry, then email + Stripe test mode).
Prompt packs for Justin live in the Claude project's files under `shiptorio/codex-prompts/`.


## Deploy smoke + automatic rollback (Codex, 2026-10-26)

- Day 1 deploy reliability checkpoint, extending merged #173: one local/CI smoke
  script checks access form 200, wrong password 401, GitHub redirect, exact build
  SHA, landing/private gates and HTTPS. Explicit GET /access is now 200; GET
  /auth/login can start OAuth before preview access (private routes stay gated).
- Deploy saves the active Worker version before mutation, rolls back on deploy or
  smoke failure, verifies recovery, and leaves a red job with error annotations
  and a summary. Manual branch deploys share the production concurrency lock.
- Implementation [#250](https://github.com/r3dbars/shiptorio/pull/250) merged after CI
  and stranger-path checks passed. Local validation: 656 tests passed, 2 platform
  skips; workspace + test typechecks, build, 24 playtest cases (306 decisions) passed.
- Healthy production [Deploy 40428675804](https://github.com/r3dbars/shiptorio/actions/runs/40428675804)
  passed every smoke at `dc2843715157e0835c52019db00cccb16537718d`.
- **Live rollback proved**, 2026-10-26 7:52 PM CT: temporary branch
  `codex/deploy-smoke-drill`, commit `bd4bd76d4ebc6814a64d748311c8fe5a2a73e175`,
  deliberately returned 503 for Cloudflare GET /access. [Deploy 40428959075](https://github.com/r3dbars/shiptorio/actions/runs/40428959075)
  deployed bad Worker version `8ab17ba2-93fa-45fb-8749-b72db215a017`, failed smoke
  with “GET /access: expected 200, got 503”, then automatically ran Wrangler rollback
  to captured version `e06a9ca5-cda0-4097-912a-112034233b87` at 100% traffic.
  Cloudflare's active-version check and all restored-site smoke probes passed at
  `dc28437`; the job remained **failed**, with an error annotation and summary.
  Failure detected 00:52:28Z; restored smoke passed 00:52:32Z (about four seconds).
  The fault branch was never merged and was deleted after the drill.
- See scripts/smoke/README.md for local use and repeating the drill. No data/schema
  rollback is claimed; cancellation/timeout cannot guarantee automatic recovery.

| Stranger E2E: browser runner pairing | in progress | Full browser journey exposed Chromium submitting the device approval form with opaque Origin under no-referrer, rejected by the same-origin guard. Pairing page now uses same-origin referrer policy; foreign and missing origins remain rejected. Day 4 runner checkpoint. |

## Spark spend and factory budgets (Codex, 2026-10-26; PR #255)

- Checkpoint: Friday cost/power guardrails. `codex/spark-spend` adds migration `0012_spark_spend.sql` (checked against #150's gapless-number guard).
- D1 records each factory's UTC day, calls, measured input/output/cache tokens and estimated USD. Default daily budget: **$5 per factory**; the stable payer can change it in whole cents, including $0 to pause.
- Before each Meta attempt, reserve UTF-8 input upper bound plus capped output at Spark 1.3 standard rates. Concurrent reservations are atomic. Reported usage settles once; missing usage/errors keep a conservative reservation and show as unmeasured. Existing account call/token limits remain in force. Unknown model prices fail closed.
- Owner HUD chip → How it thinks: usage, 80% warning card, daily budget form, 100% stop explanation/reset at 00:00 UTC. Admin `/admin` has a Black Iron spend table. Early stop is possible when the remaining budget cannot cover the next reservation. No additional model call is spent explaining a stop.
- Explicitly crosses into `web/` for the requested owner UI; adds a REST endpoint rather than changing the shared websocket contract. Simulator remains independent.
- Pricing source, checked 2026-10-26: https://dev.meta.ai/docs/pricing-rate-limits — $1.25/M input, $0.15/M cached input, $4.25/M output. These are estimates, not invoices. No historical backfill: old account totals cannot recover per-factory token splits.
- Validation: full fast suite passes (662 passed, 2 skipped), all workspace/test typechecks, build, and 24 playtest cases / 306 decisions. Playwright budget flow passes on desktop, iPhone 14 and Pixel 7; admin table refresh renders without console errors in a local authenticated SQLite fixture. No paid API request was made for validation.
- Tests: real SQLite concurrency, isolation, cached pricing, idempotent settlement, missing usage, midnight rollover, zero budget, pre-fetch denial, owner-only reads/writes and origin/amount validation; browser budget save/stop/resume and warning checks.
| Stranger E2E: preview gate CSP | in progress | Browser console assertion caught the outer security middleware replacing the preview gate nonce policy, blocking the gate animation script. Carry the server-generated gate nonce into the global script rule on both fast and wrapped paths, retaining all other global restrictions; application-page policies remain unchanged. Separate fix for the first-day signup checkpoint. |

## Codex: BYOK self-hosting (2026-10-26)

- Branch `codex/selfhost`: `bun run selfhost` creates dedicated D1/KV through Wrangler, migrates, uploads Meta/GitHub/preview/session/encryption secrets, bootstraps the GitHub App setup page, deploys and prints the workers.dev URL. Uses an ignored owner config and resumable non-secret progress; never inherits production domains, IDs, users or mines.
- Public Black Iron docs: `docs/site/self-host.md`; docs index and maintainer setup guide link to it.
- Bootstrap: the existing `/setup` requires GitHub auth before an App exists. The self-host config explicitly opts into preview-password-authenticated setup only until `GITHUB_APP_ID` is set, then the wizard disables it. Normal deployments retain their existing login requirement.
- CI `selfhost` job uses a fresh clone with no Cloudflare credentials, builds assets/runner, applies local D1 migrations and runs real `wrangler deploy --dry-run`. Focused tests cover isolated config, forbidden Worker names, resume and failures.
- Local dry run passed with all 12 migrations and Worker/assets bundle. Live resource creation, credential upload, GitHub callbacks and end-to-end factory operation are not exercised by the dry run. No Cloudflare resources were changed during development.
- Advances the Day 1 Cloudflare/GitHub setup checkpoint for open-source users with their own keys: [PR #266](https://github.com/r3dbars/shiptorio/pull/266). Local validation: 677 tests passed, 2 platform skips; all workspace/test typechecks; 26 playtest cases / 332 decisions; fresh-clone install, local migrations and Wrangler dry-run passed with a clean tracked tree. CI gates the merge. GitHub auto-merge is disabled for this repository, so Codex will merge only after green checks, as requested.

## Quota recovery (Codex, 2026-10-26; PR #269)

- Day 1 loop reliability: [PR #269](https://github.com/r3dbars/shiptorio/pull/269), `codex/quota-recovery`.
- Black Iron live card warns at 80% and at exhaustion, naming the allowance, used/limit,
  local reset time and 00:00 UTC. `/admin/signup?login=…` selects the correct run owner or
  stable Spark payer for quota increases. Resource caps have no timed reset; job slots
  free on completion. Dollar totals remain private to the stable payer, who can open
  the existing thinking-budget editor. Global Spark pause and refresh failures stay visible.
- Card refreshes every 15s, on focus/visibility, and after budget edits. Requests time out
  so a hung refresh can recover. Raising run/call/token caps takes effect on the next
  attempt, with no restart. Migration `0013_quota_controls.sql` adds nullable per-account
  Spark call/token overrides; blank inherits Worker defaults, zero pauses that allowance.
- Local planning only checks run capacity; actual dispatch charges it. Lost claim responses
  reuse the lease without another charge. Failed, declined or stale plans spend no run.
  Quota-paused ready jobs remain ready and poll without abuse-counter writes.
- Failed planning persists a per-issue UTC-day ledger: 1m, 2m, then until midnight after
  three failures. Restarting the factory or changing the issue does not bypass it. Early
  plan cards disappear; the alarm wakes at cooldown expiry. A new plan still requires
  the player's approval. The optional hosted assembler also charges after successful
  scoping, when writing starts, and uses the same cooldown after scoping failures.
- Rebases include #259 runner resilience, #262 approval binding and #265's separate
  per-autopilot-session attempt cap. Narrow `web/` edits implement Justin's requested
  card; shared websocket contracts and the simulator remain unchanged.
- Validation: all workspace/test typechecks; full fast suite (697 passed, 2 platform
  skips); 26 playtest cases / 332 decisions, no findings; production build. SQL-backed
  enforcement/reset/admin/access tests plus real Factory failure/restart/dispatch tests.
  Playwright card warning → stop → admin link → recovery → retry cooldown passes on
  desktop (1440×900) and iPhone 14 (390×664), with no page or console errors. Existing
  spend-panel save/stop/resume also passes on both. Browser plugin unavailable; used
  project Playwright. Browser quota states are mocked; backend enforcement uses SQLite.
- No manual deploy or Cloudflare resource changes. Production recovery remains untested;
  migration 0013 must run through the existing deployment workflow. No historical run
  counters were reset or refunded.
