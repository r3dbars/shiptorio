# Claude project threads (as of 2026-10-26 ~20:40 UTC)

What each thread in the Claude "Shiptorio" project did. Threads live on claude.ai, so this
is the only copy agents outside it (Codex) can see.

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
| Build orbit watch station | PR #122 | Station 5 live: every launch is watched 24h on its merge commit (`server/src/orbit.ts`). Trips on a Sentry comeback (same error after a 15m deploy grace, or a new error spiking 3+ events on that folder), a revert PR, or a failed check on the merge commit. Trip = orbit scar, rework belt for a fresh PR, lane permit revoked, escaped defect. Uses existing App events (pull_request, check_*), no new subscriptions. Panel lists watched launches with time left. Sim: `?source=sim&scenario=orbit&autolaunch` |
| Grow the factory across many repos | PR open | The empire, behind `?empire=1` (remembered; `?empire=0` off). Every other repo you connect floats as a satellite island beyond the main one, tied by a sky rail with crates (`web/src/map/empire.ts`: real island, districts and launch pad, flattened to ~25 draw calls, no shadows). Island chip in the top bar opens the overview: camera pulls back over every island, sheet rolls up shipped, weighted Automated %, waiting on you, and the most stuck island; tap an island to sail there (`web/src/ui/Empire.tsx`). `IslandSummary` + `rollup` in `shared/src/empire.ts`; `GET /api/empire` asks each repo's Factory `summary()` (player's own repos via `reposFor`). Sim shows shiptorio, testing, transcripted |

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
| #95, #98, #101, #111 | Codex: phone + Firefox login, security hardening, fresh CI before merge | merged |
| #96 | Codex: live bottleneck + check-in deck from factory state | merged |
| #100, #103, #117 | Codex: mobile/onboarding papercuts, first-run loop never idles | merged |
| #104, #123, #126 | Codex: sandboxed local verify, release receipts, orbit replay deadlines | merged |
| #118, #119 | Codex: live repo picker, disposed factories stop reconnecting | merged |
| #3, #4 | Old pre-#1 drafts | closed |

## Codex (outside the Claude project)

Only what Codex has pushed is visible here, not its live session. Codex commits show as "J B" or "Redbars". As of ~17:20 UTC:

| PR | What | State |
| --- | --- | --- |
| #13 | Private preview (password gate), hardened issue → Spark → PR → inspector/rework loop, bounded alarm jobs, stale-check handling | merged. Supersedes #4's fixes |
| #19, #21 | Auto-deploy of `main` verified, `/api/version` shows the live SHA, shiptorio.com + shiptorio.dev live | merged |
| #3, #4 | Old protocol / factory drafts on the pre-#1 scaffold | superseded by #13 and the #14/#17 contract. Close them |
| Add real user accounts and sign-in | working | D1 `users`/`sessions`/`user_installations`/`user_repos`/`user_prefs` (migration 0004), revocable sessions, repo membership on every factory route, per-repo Sentry/PostHog keys + per-repo Sentry webhook, `requireUser` helper. Password gate stays in front. Next: web install link + prefs sync |

Next for Codex: the "connect the mines" prompt (GitHub App end to end, then Sentry, then email + Stripe test mode).
Prompt packs for Justin live in the Claude project's files under `shiptorio/codex-prompts/`.
